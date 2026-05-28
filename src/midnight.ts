import { ContractState } from '@midnight-ntwrk/compact-runtime';
import {
  LedgerParameters,
  type ProvingProvider,
  Transaction,
  ZswapChainState,
  type TransactionId,
} from '@midnight-ntwrk/ledger-v8';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import type { ContractProviders } from '@midnight-ntwrk/midnight-js-contracts';
import {
  createProofProvider,
  type MidnightProvider,
  type PrivateStateExport,
  type PrivateStateId,
  type PrivateStateProvider,
  type PublicDataProvider,
  type SigningKeyExport,
  type UnboundTransaction,
  type UnshieldedBalances,
  type WalletProvider,
  ZKConfigProvider,
} from '@midnight-ntwrk/midnight-js-types';
import { debugError, debugLog } from './debug';
import { APP_CONFIG } from './config';
import type { OneAmSession } from './oneAm';

export type TodoProviders = ContractProviders<any, 'storeTodo', undefined>;
export type MintProviders = ContractProviders<any, 'mintShielded', undefined>;
export type TodoContractMode = 'unshielded' | 'shielded';
export type TodoProvidersByMode = Record<TodoContractMode, TodoProviders>;

type BrowserPrivateStateProvider = PrivateStateProvider<PrivateStateId, undefined>;

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

const ZK_ASSET_BASE_PATH_BY_MODE: Record<TodoContractMode, string> = {
  unshielded: APP_CONFIG.zkTodoAssetBasePath,
  shielded: APP_CONFIG.zkShieldedTodoAssetBasePath,
};

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function summarizeHex(hex: string): string {
  if (hex.length <= 32) {
    return hex;
  }

  return `${hex.slice(0, 16)}...${hex.slice(-16)}`;
}

function fromHex(hex: string): Uint8Array {
  const normalized = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (normalized.length % 2 !== 0) {
    throw new Error('Received an invalid hex string from the wallet.');
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }
  return bytes;
}

function transactionIdentifier(tx: { identifiers(): Iterable<unknown> }): TransactionId {
  const identifiers = Array.from(tx.identifiers());
  const identifier = identifiers[identifiers.length - 1];
  if (!identifier) {
    throw new Error('The finalized transaction did not contain a transaction identifier.');
  }

  return (identifier instanceof Uint8Array ? toHex(identifier) : String(identifier)) as TransactionId;
}

function toBigIntBalances(entries: Array<{ tokenType: string; amount: string }>): UnshieldedBalances {
  return entries.map((entry) => ({ tokenType: entry.tokenType, balance: BigInt(entry.amount) }));
}

async function queryLatestContractAction(
  queryUrl: string,
  query: string,
  address: string,
): Promise<LatestContractAction | null> {
  debugLog('indexer', 'queryLatestContractAction:start', { query, address });
  const response = await fetch(queryUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: { address },
    }),
  });

  if (!response.ok) {
    debugError('indexer', 'queryLatestContractAction:http-error', { status: response.status, query, address });
    throw new Error(`Indexer query failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as GraphQlResponse<{ contractAction: LatestContractAction | null }>;
  if (payload.errors?.length) {
    debugError('indexer', 'queryLatestContractAction:graphql-error', payload.errors);
    throw new Error(payload.errors.map((error) => error.message).join('; '));
  }

  debugLog('indexer', 'queryLatestContractAction:success', {
    address,
    hasContractAction: Boolean(payload.data?.contractAction),
  });
  return payload.data?.contractAction ?? null;
}

function createPatchedPublicDataProvider(queryUrl: string, subscriptionUrl: string): PublicDataProvider {
  const baseProvider = indexerPublicDataProvider(queryUrl, subscriptionUrl);

  return {
    ...baseProvider,
    async queryContractState(contractAddress, config) {
      debugLog('publicDataProvider', 'queryContractState:start', { contractAddress, config });
      if (config) {
        try {
          const result = await baseProvider.queryContractState(contractAddress, config);
          debugLog('publicDataProvider', 'queryContractState:success-with-config', {
            contractAddress,
            hasResult: Boolean(result),
          });
          return result;
        } catch (error) {
          debugError('publicDataProvider', 'queryContractState:error-with-config', error);
          throw error;
        }
      }

      try {
        const contractAction = await queryLatestContractAction(
          queryUrl,
          `query LATEST_CONTRACT_STATE($address: HexEncoded!) {
            contractAction(address: $address) {
              state
            }
          }`,
          contractAddress,
        );

        const result = contractAction ? ContractState.deserialize(fromHex(contractAction.state)) : null;
        debugLog('publicDataProvider', 'queryContractState:success-latest', {
          contractAddress,
          hasResult: Boolean(result),
        });
        return result;
      } catch (error) {
        debugError('publicDataProvider', 'queryContractState:error-latest', error);
        throw error;
      }
    },
    async queryZSwapAndContractState(contractAddress, config) {
      debugLog('publicDataProvider', 'queryZSwapAndContractState:start', { contractAddress, config });
      if (config) {
        try {
          const result = await baseProvider.queryZSwapAndContractState(contractAddress, config);
          debugLog('publicDataProvider', 'queryZSwapAndContractState:success-with-config', {
            contractAddress,
            hasResult: Boolean(result),
          });
          return result;
        } catch (error) {
          debugError('publicDataProvider', 'queryZSwapAndContractState:error-with-config', error);
          throw error;
        }
      }

      try {
        const contractAction = await queryLatestContractAction(
          queryUrl,
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
          contractAddress,
        );

        if (!contractAction?.zswapState) {
          debugLog('publicDataProvider', 'queryZSwapAndContractState:success-latest-empty', {
            contractAddress,
          });
          return null;
        }

        const result: [ZswapChainState, ContractState, LedgerParameters] = [
          ZswapChainState.deserialize(fromHex(contractAction.zswapState)),
          ContractState.deserialize(fromHex(contractAction.state)),
          contractAction.transaction?.block?.ledgerParameters
            ? LedgerParameters.deserialize(fromHex(contractAction.transaction.block.ledgerParameters))
            : LedgerParameters.initialParameters(),
        ];
        debugLog('publicDataProvider', 'queryZSwapAndContractState:success-latest', {
          contractAddress,
        });
        return result;
      } catch (error) {
        debugError('publicDataProvider', 'queryZSwapAndContractState:error-latest', error);
        throw error;
      }
    },
    async queryUnshieldedBalances(contractAddress, config) {
      debugLog('publicDataProvider', 'queryUnshieldedBalances:start', { contractAddress, config });
      if (config) {
        try {
          const result = await baseProvider.queryUnshieldedBalances(contractAddress, config);
          debugLog('publicDataProvider', 'queryUnshieldedBalances:success-with-config', {
            contractAddress,
            hasResult: Boolean(result),
          });
          return result;
        } catch (error) {
          debugError('publicDataProvider', 'queryUnshieldedBalances:error-with-config', error);
          throw error;
        }
      }

      try {
        const contractAction = await queryLatestContractAction(
          queryUrl,
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
          contractAddress,
        );

        if (!contractAction) {
          debugLog('publicDataProvider', 'queryUnshieldedBalances:success-latest-empty', { contractAddress });
          return null;
        }

        if (contractAction.unshieldedBalances) {
          const result = toBigIntBalances(contractAction.unshieldedBalances);
          debugLog('publicDataProvider', 'queryUnshieldedBalances:success-latest-direct', {
            contractAddress,
            count: result.length,
          });
          return result;
        }

        if (contractAction.deploy?.unshieldedBalances) {
          const result = toBigIntBalances(contractAction.deploy.unshieldedBalances);
          debugLog('publicDataProvider', 'queryUnshieldedBalances:success-latest-deploy', {
            contractAddress,
            count: result.length,
          });
          return result;
        }

        debugLog('publicDataProvider', 'queryUnshieldedBalances:success-latest-none', { contractAddress });
        return [];
      } catch (error) {
        debugError('publicDataProvider', 'queryUnshieldedBalances:error-latest', error);
        throw error;
      }
    },
  };
}

function createPrivateStateProvider(): BrowserPrivateStateProvider {
  let contractAddressScope = '';
  const stateStore = new Map<string, undefined>();
  const signingKeyStore = new Map<string, unknown>();

  const scopedStateKey = (privateStateId: string) => `${contractAddressScope}:${privateStateId}`;

  const unsupported = async (): Promise<never> => {
    throw new Error('Private state export is not implemented in this minimal dApp.');
  };

  return {
    setContractAddress(address) {
      contractAddressScope = address;
    },
    async set(privateStateId, state) {
      stateStore.set(scopedStateKey(privateStateId), state);
    },
    async get(privateStateId) {
      return stateStore.get(scopedStateKey(privateStateId)) ?? null;
    },
    async remove(privateStateId) {
      stateStore.delete(scopedStateKey(privateStateId));
    },
    async clear() {
      stateStore.clear();
    },
    async setSigningKey(address, signingKey) {
      signingKeyStore.set(address, signingKey);
    },
    async getSigningKey(address) {
      return (signingKeyStore.get(address) as never | undefined) ?? null;
    },
    async removeSigningKey(address) {
      signingKeyStore.delete(address);
    },
    async clearSigningKeys() {
      signingKeyStore.clear();
    },
    async exportPrivateStates(_options?: { password?: string; maxStates?: number }): Promise<PrivateStateExport> {
      return unsupported();
    },
    async importPrivateStates(
      _exportData: PrivateStateExport,
      _options?: { password?: string; conflictStrategy?: 'skip' | 'overwrite' | 'error'; maxStates?: number },
    ) {
      return unsupported();
    },
    async exportSigningKeys(_options?: { password?: string; maxKeys?: number }): Promise<SigningKeyExport> {
      return unsupported();
    },
    async importSigningKeys(
      _exportData: SigningKeyExport,
      _options?: { password?: string; conflictStrategy?: 'skip' | 'overwrite' | 'error'; maxKeys?: number },
    ) {
      return unsupported();
    },
  };
}

function createWalletProvider(session: OneAmSession): WalletProvider {
  return {
    balanceTx: async (tx: UnboundTransaction) => {
      try {
        const txHex = toHex(tx.serialize());
        debugLog('walletProvider', 'balanceTx:start', {
          txHexLength: txHex.length,
          txHexPreview: summarizeHex(txHex),
        });
        const balanced = await session.api.balanceUnsealedTransaction(txHex);
        debugLog('walletProvider', 'balanceTx:success', {
          balancedTxHexLength: balanced.tx.length,
          balancedTxHexPreview: summarizeHex(balanced.tx),
        });
        return Transaction.deserialize('signature', 'proof', 'binding', fromHex(balanced.tx));
      } catch (error) {
        debugError('walletProvider', 'balanceTx:error', {
          error,
          networkId: session.config.networkId,
          substrateNodeUri: session.config.substrateNodeUri,
        });
        throw error;
      }
    },
    getCoinPublicKey: () => session.shieldedAddress.shieldedCoinPublicKey,
    getEncryptionPublicKey: () => session.shieldedAddress.shieldedEncryptionPublicKey,
  };
}

function createMidnightProvider(session: OneAmSession): MidnightProvider {
  return {
    submitTx: async (tx) => {
      try {
        const txHex = toHex(tx.serialize());
        const txId = transactionIdentifier(tx);
        debugLog('midnightProvider', 'submitTx:start', {
          txHexLength: txHex.length,
          txHexPreview: summarizeHex(txHex),
          txId,
          networkId: session.config.networkId,
          substrateNodeUri: session.config.substrateNodeUri,
        });
        await session.api.submitTransaction(txHex);
        debugLog('midnightProvider', 'submitTx:success', { txId });
        return txId;
      } catch (error) {
        debugError('midnightProvider', 'submitTx:error', {
          error,
          networkId: session.config.networkId,
          substrateNodeUri: session.config.substrateNodeUri,
        });
        throw error;
      }
    },
  };
}

export async function createTodoProviders(session: OneAmSession): Promise<TodoProvidersByMode> {
  setNetworkId(session.config.networkId);

  const privateStateProvider = createPrivateStateProvider();
  const walletProvider = createWalletProvider(session);
  const midnightProvider = createMidnightProvider(session);
  const publicDataProvider = createPatchedPublicDataProvider(session.config.indexerUri, session.config.indexerWsUri);

  const createModeProviders = async (mode: TodoContractMode): Promise<TodoProviders> => {
    const zkConfigProvider = new FetchZkConfigProvider<'storeTodo'>(
      new URL(ZK_ASSET_BASE_PATH_BY_MODE[mode], window.location.origin).toString(),
      window.fetch.bind(window),
    );
    const provingProvider = await session.api.getProvingProvider(zkConfigProvider.asKeyMaterialProvider());

    return {
      privateStateProvider,
      publicDataProvider,
      zkConfigProvider,
      proofProvider: createProofProvider(provingProvider),
      walletProvider,
      midnightProvider,
    };
  };

  const [unshieldedProviders, shieldedProviders] = await Promise.all([
    createModeProviders('unshielded'),
    createModeProviders('shielded'),
  ]);

  return {
    unshielded: unshieldedProviders,
    shielded: shieldedProviders,
  };
}

export async function createMintProviders(session: OneAmSession): Promise<MintProviders> {
  setNetworkId(session.config.networkId);

  const privateStateProvider = createPrivateStateProvider();
  const walletProvider = createWalletProvider(session);
  const midnightProvider = createMidnightProvider(session);
  const publicDataProvider = createPatchedPublicDataProvider(session.config.indexerUri, session.config.indexerWsUri);

  const nonceSeparator = '#nonce=';
  const stripNonce = (keyLocation: string) => {
    const index = keyLocation.indexOf(nonceSeparator);
    return index === -1 ? keyLocation : keyLocation.slice(0, index);
  };
  const tagNonce = (keyLocation: string) => `${keyLocation}${nonceSeparator}${crypto.randomUUID()}`;

  const zkBaseUrl = new URL(APP_CONFIG.zkMintAssetBasePath, window.location.origin).toString();
  const loggingFetch: typeof window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    debugLog('zkConfigProvider', 'fetch:start', { url });
    const response = await window.fetch(input, init);
    const contentType = response.headers.get('content-type') ?? '';
    const contentLength = response.headers.get('content-length');
    debugLog('zkConfigProvider', 'fetch:response', {
      url,
      status: response.status,
      contentType,
      contentLength,
      ok: response.ok,
      looksLikeHtml: contentType.includes('text/html'),
    });
    return response;
  };
  const zkConfigProvider = new FetchZkConfigProvider<'mintShielded'>(zkBaseUrl, loggingFetch);
  debugLog('zkConfigProvider', 'baseURL', { zkBaseUrl });

  class NonceStrippingZkConfigProvider extends ZKConfigProvider<string> {
    constructor(private readonly inner: ZKConfigProvider<string>) {
      super();
    }

    getProverKey(circuitId: string) {
      return this.inner.getProverKey(stripNonce(circuitId));
    }

    getVerifierKey(circuitId: string) {
      return this.inner.getVerifierKey(stripNonce(circuitId));
    }

    getZKIR(circuitId: string) {
      return this.inner.getZKIR(stripNonce(circuitId));
    }
  }

  const dedupSafeZkConfigProvider = new NonceStrippingZkConfigProvider(
    zkConfigProvider as unknown as ZKConfigProvider<string>,
  );
  const baseProvingProvider = await session.api.getProvingProvider(dedupSafeZkConfigProvider.asKeyMaterialProvider());
  const provingProvider: ProvingProvider = {
    check: (serializedPreimage, keyLocation) =>
      baseProvingProvider.check(serializedPreimage, tagNonce(keyLocation)),
    prove: (serializedPreimage, keyLocation, overwriteBindingInput) =>
      baseProvingProvider.prove(serializedPreimage, tagNonce(keyLocation), overwriteBindingInput),
  };

  return {
    privateStateProvider,
    publicDataProvider,
    zkConfigProvider,
    proofProvider: createProofProvider(provingProvider),
    walletProvider,
    midnightProvider,
  };
}
