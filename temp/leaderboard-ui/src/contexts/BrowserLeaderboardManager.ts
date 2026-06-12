import { LeaderboardAPI, type LeaderboardCircuitKeys, type LeaderboardProviders } from '../../../api/src/index';
import { ContractState, type ContractAddress } from '@midnight-ntwrk/compact-runtime';
import { BehaviorSubject, type Observable } from 'rxjs';
import { type Logger } from 'pino';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import {
  createProofProvider,
  type MidnightProvider,
  type PublicDataProvider,
  type UnshieldedBalances,
  type UnboundTransaction,
  type WalletProvider,
} from '@midnight-ntwrk/midnight-js-types';
import {
  Binding,
  type FinalizedTransaction,
  LedgerParameters,
  Proof,
  SignatureEnabled,
  Transaction,
  type TransactionId,
  ZswapChainState,
} from '@midnight-ntwrk/ledger-v8';
import { type LeaderboardPrivateState } from 'leaderboard-contract';
import { inMemoryPrivateStateProvider } from '../in-memory-private-state-provider';
import { type NetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

export type LeaderboardDeployment =
  | { readonly status: 'in-progress' }
  | { readonly status: 'deployed'; readonly api: LeaderboardAPI }
  | { readonly status: 'failed'; readonly error: Error };

type GraphQlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

type LatestContractAction = {
  state: string;
  zswapState?: string;
  transaction?: {
    block?: {
      ledgerParameters?: string;
    };
  };
  unshieldedBalances?: Array<{ tokenType: string; amount: string }>;
  deploy?: {
    unshieldedBalances: Array<{ tokenType: string; amount: string }>;
  };
};

export class BrowserLeaderboardManager {
  readonly #deploymentsSubject = new BehaviorSubject<Array<BehaviorSubject<LeaderboardDeployment>>>([]);
  #initializedProviders: Promise<LeaderboardProviders> | undefined;

  constructor(private readonly logger: Logger) {}

  readonly deployments$: Observable<Array<Observable<LeaderboardDeployment>>> = this.#deploymentsSubject;

  resolve(contractAddress?: ContractAddress): Observable<LeaderboardDeployment> {
    const deployments = this.#deploymentsSubject.value;
    const existing = deployments.find(
      (d) => d.value.status === 'deployed' && d.value.api.deployedContractAddress === contractAddress,
    );
    if (existing) return existing;

    const secretKey = this.getSecretKey();
    const deployment = new BehaviorSubject<LeaderboardDeployment>({ status: 'in-progress' });
    if (contractAddress) {
      void this.run(deployment, (providers) => LeaderboardAPI.join(providers, contractAddress, secretKey, this.logger));
    } else {
      void this.run(deployment, (providers) => LeaderboardAPI.deploy(providers, secretKey, this.logger));
    }
    this.#deploymentsSubject.next([...deployments, deployment]);
    return deployment;
  }

  private getSecretKey(): Uint8Array {
    const storageKey = 'midnight-leaderboard-secret';
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      return Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
    }

    const secret = crypto.getRandomValues(new Uint8Array(32));
    localStorage.setItem(storageKey, btoa(String.fromCharCode(...secret)));
    return secret;
  }

  private getProviders(): Promise<LeaderboardProviders> {
    return this.#initializedProviders ?? (this.#initializedProviders = initializeProviders(this.logger));
  }

  private async run(
    deployment: BehaviorSubject<LeaderboardDeployment>,
    factory: (providers: LeaderboardProviders) => Promise<LeaderboardAPI>,
  ): Promise<void> {
    try {
      const providers = await this.getProviders();
      const api = await factory(providers);
      deployment.next({ status: 'deployed', api });
    } catch (error: unknown) {
      this.logger.error({ error }, 'Contract operation failed');
      deployment.next({ status: 'failed', error: normalizeError(error) });
    }
  }
}

const initializeProviders = async (logger: Logger): Promise<LeaderboardProviders> => {
  const networkId = (import.meta.env.VITE_NETWORK_ID ?? 'preview') as NetworkId;
  setNetworkId(networkId);

  const connectedAPI = await connectToOneAm(networkId);
  const config = await connectedAPI.getConfiguration();
  const shieldedAddresses = await connectedAPI.getShieldedAddresses();
  const zkConfigProvider = new FetchZkConfigProvider<LeaderboardCircuitKeys>(window.location.origin, fetch.bind(window));
  const provingProvider = await connectedAPI.getProvingProvider(zkConfigProvider.asKeyMaterialProvider());

  return {
    privateStateProvider: inMemoryPrivateStateProvider<string, LeaderboardPrivateState>(),
    zkConfigProvider,
    proofProvider: createProofProvider(provingProvider),
    publicDataProvider: createPatchedPublicDataProvider(config.indexerUri, config.indexerWsUri),
    walletProvider: createWalletProvider(connectedAPI, shieldedAddresses),
    midnightProvider: createMidnightProvider(connectedAPI, logger),
  };
};

const connectToOneAm = async (networkId: NetworkId): Promise<OneAmConnectedApi> => {
  const wallet = await waitForOneAmWallet();
  return wallet.connect(networkId as 'preview' | 'preprod');
};

const waitForOneAmWallet = async (): Promise<OneAmWallet> => {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    const wallet = window.midnight?.['1am'];
    if (wallet) return wallet;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Could not find the 1AM wallet at window.midnight["1am"].');
};

const createWalletProvider = (
  connectedAPI: OneAmConnectedApi,
  shieldedAddresses: Awaited<ReturnType<OneAmConnectedApi['getShieldedAddresses']>>,
): WalletProvider => ({
  getCoinPublicKey: () => shieldedAddresses.shieldedCoinPublicKey,
  getEncryptionPublicKey: () => shieldedAddresses.shieldedEncryptionPublicKey,
  balanceTx: async (tx: UnboundTransaction): Promise<FinalizedTransaction> => {
    const received = await connectedAPI.balanceUnsealedTransaction(toHex(tx.serialize()));
    return Transaction.deserialize<SignatureEnabled, Proof, Binding>('signature', 'proof', 'binding', fromHex(received.tx));
  },
});

const createMidnightProvider = (connectedAPI: OneAmConnectedApi, logger: Logger): MidnightProvider => ({
  submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
    const txId = transactionIdentifier(tx);
    logger.info({ txId }, 'Submitting transaction through 1AM');
    await connectedAPI.submitTransaction(toHex(tx.serialize()));
    return txId;
  },
});

const createPatchedPublicDataProvider = (queryUrl: string, subscriptionUrl: string): PublicDataProvider => {
  const baseProvider = indexerPublicDataProvider(queryUrl, subscriptionUrl);

  return {
    ...baseProvider,
    async queryContractState(contractAddress, config) {
      if (config) {
        return baseProvider.queryContractState(contractAddress, config);
      }

      const contractAction = await queryLatestContractAction(queryUrl, contractAddress);
      return contractAction ? ContractState.deserialize(fromHex(contractAction.state)) : null;
    },
    async queryZSwapAndContractState(contractAddress, config) {
      if (config) {
        return baseProvider.queryZSwapAndContractState(contractAddress, config);
      }

      const contractAction = await queryLatestContractAction(
        queryUrl,
        contractAddress,
        `query LATEST_BOTH_STATE($address: HexEncoded!) {
          contractAction(address: $address) {
            state
            zswapState
            transaction {
              block {
                ledgerParameters
              }
            }
          }
        }`,
      );

      if (!contractAction?.zswapState) {
        return null;
      }

      return [
        ZswapChainState.deserialize(fromHex(contractAction.zswapState)),
        ContractState.deserialize(fromHex(contractAction.state)),
        contractAction.transaction?.block?.ledgerParameters
          ? LedgerParameters.deserialize(fromHex(contractAction.transaction.block.ledgerParameters))
          : LedgerParameters.initialParameters(),
      ];
    },
    async queryUnshieldedBalances(contractAddress, config) {
      if (config) {
        return baseProvider.queryUnshieldedBalances(contractAddress, config);
      }

      const contractAction = await queryLatestContractAction(
        queryUrl,
        contractAddress,
        `query LATEST_UNSHIELDED_BALANCES($address: HexEncoded!) {
          contractAction(address: $address) {
            ... on ContractDeploy {
              unshieldedBalances {
                tokenType
                amount
              }
            }
            ... on ContractUpdate {
              unshieldedBalances {
                tokenType
                amount
              }
            }
            ... on ContractCall {
              deploy {
                unshieldedBalances {
                  tokenType
                  amount
                }
              }
            }
          }
        }`,
      );

      if (!contractAction) return null;
      if (contractAction.unshieldedBalances) return toBigIntBalances(contractAction.unshieldedBalances);
      if (contractAction.deploy?.unshieldedBalances) return toBigIntBalances(contractAction.deploy.unshieldedBalances);
      return [];
    },
  };
};

const queryLatestContractAction = async (
  queryUrl: string,
  address: string,
  query = `query LATEST_CONTRACT_STATE($address: HexEncoded!) {
    contractAction(address: $address) {
      state
    }
  }`,
): Promise<LatestContractAction | null> => {
  const response = await fetch(queryUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query,
      variables: { address },
    }),
  });

  if (!response.ok) {
    throw new Error(`Indexer query failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as GraphQlResponse<{ contractAction: LatestContractAction | null }>;
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join('; '));
  }

  return payload.data?.contractAction ?? null;
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const toBigIntBalances = (entries: Array<{ tokenType: string; amount: string }>): UnshieldedBalances =>
  entries.map((entry) => ({ tokenType: entry.tokenType, balance: BigInt(entry.amount) }));

const fromHex = (hex: string): Uint8Array => {
  const normalized = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (normalized.length % 2 !== 0) {
    throw new Error('Received an invalid hex string.');
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }
  return bytes;
};

const transactionIdentifier = (tx: { identifiers(): Iterable<unknown> }): TransactionId => {
  const identifiers = Array.from(tx.identifiers());
  const identifier = identifiers[identifiers.length - 1];
  if (!identifier) {
    throw new Error('The finalized transaction did not contain a transaction identifier.');
  }
  return (identifier instanceof Uint8Array ? toHex(identifier) : String(identifier)) as TransactionId;
};

const normalizeError = (error: unknown): Error => {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error);
  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error('Unknown error during contract operation');
  }
};
