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
  type MidnightProviders,
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
import type { LeaderboardPrivateState } from './leaderboardContract';

export type TodoProviders = ContractProviders<any, 'storeTodo', undefined>;
export type MintProviders = ContractProviders<any, 'mintShielded', undefined>;
export type MintDepositCircuitKeys = 'mintShielded' | 'depositShielded';
export type MintDepositProviders = ContractProviders<any, MintDepositCircuitKeys, undefined>;
export type DepositOnlyProviders = ContractProviders<any, 'depositShielded', undefined>;
export type LeaderboardCircuitKeys = 'submitScore' | 'verifyOwnership';
export type LeaderboardPrivateStateId = 'leaderboardPrivateState';
export type LeaderboardProviders = MidnightProviders<
  LeaderboardCircuitKeys,
  LeaderboardPrivateStateId,
  LeaderboardPrivateState
>;
export type TodoContractMode = 'unshielded' | 'shielded';
export type TodoProvidersByMode = Record<TodoContractMode, TodoProviders>;

type BrowserPrivateStateProvider<PSI extends PrivateStateId = PrivateStateId, PS = undefined> =
  PrivateStateProvider<PSI, PS>;

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

const RATE_LIMIT_MAX_RETRIES = 5;
const RATE_LIMIT_BASE_DELAY_MS = 1000;

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) {
    return null;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const dateMs = Date.parse(header);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : null;
}

async function queryLatestContractAction(
  queryUrl: string,
  query: string,
  address: string,
): Promise<LatestContractAction | null> {
  debugLog('indexer', 'queryLatestContractAction:start', { query, address });

  let response: Response | undefined;
  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt += 1) {
    response = await fetch(queryUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { address },
      }),
    });

    // The indexer rate-limits polling (common while waiting for a freshly
    // deployed contract to settle). Back off and retry rather than surfacing
    // a spurious error.
    if (response.status === 429 && attempt < RATE_LIMIT_MAX_RETRIES) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      const backoffMs = retryAfterMs ?? RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt;
      debugLog('indexer', 'queryLatestContractAction:rate-limited', { address, attempt, backoffMs });
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      continue;
    }

    break;
  }

  if (!response || !response.ok) {
    const status = response?.status ?? 0;
    debugError('indexer', 'queryLatestContractAction:http-error', { status, query, address });
    throw new Error(`Indexer query failed with status ${status}.`);
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

/**
 * Waits for a freshly submitted deployment to settle on-chain using the
 * indexer's websocket subscription (`watchForDeployTxData`) instead of polling
 * the GraphQL endpoint. This avoids the rate-limiting (HTTP 429) that repeated
 * polling triggers while a contract settles.
 *
 * `watchForDeployTxData` waits indefinitely by contract, so we race it against
 * a timeout to keep the UI responsive. Resolves `true` when the deploy is
 * observed, `false` on timeout (callers can then fall back to a manual query).
 */
export async function waitForDeploySettled(
  publicDataProvider: PublicDataProvider,
  contractAddress: string,
  timeoutMs = 60_000,
): Promise<boolean> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timeoutHandle = setTimeout(() => resolve(false), timeoutMs);
  });

  try {
    debugLog('publicDataProvider', 'waitForDeploySettled:start', { contractAddress, timeoutMs });
    const settled = await Promise.race([
      publicDataProvider.watchForDeployTxData(contractAddress).then(() => true as const),
      timeout,
    ]);
    debugLog('publicDataProvider', 'waitForDeploySettled:result', { contractAddress, settled });
    return settled;
  } catch (error) {
    // A subscription error is non-fatal — the caller falls back to a query.
    debugError('publicDataProvider', 'waitForDeploySettled:error', error);
    return false;
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

function createPrivateStateProvider<
  PSI extends PrivateStateId = PrivateStateId,
  PS = undefined,
>(): BrowserPrivateStateProvider<PSI, PS> {
  let contractAddressScope = '';
  const stateStore = new Map<string, PS>();
  const signingKeyStore = new Map<string, unknown>();

  const scopedStateKey = (privateStateId: PSI) => `${contractAddressScope}:${privateStateId}`;

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

function createLoggingFetch(scope: string): typeof window.fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    debugLog('zkConfigProvider', 'fetch:start', { scope, url });
    const response = await window.fetch(input, {
      ...init,
      cache: 'no-store',
    });
    const contentType = response.headers.get('content-type') ?? '';
    const contentLength = response.headers.get('content-length');
    debugLog('zkConfigProvider', 'fetch:response', {
      scope,
      url,
      status: response.status,
      contentType,
      contentLength,
      ok: response.ok,
      looksLikeHtml: contentType.includes('text/html'),
    });
    if (response.ok && isZkArtifactUrl(url)) {
      const preview = new Uint8Array(await response.clone().arrayBuffer()).slice(0, 32);
      const previewText = new TextDecoder().decode(preview).toLowerCase();
      if (contentType.includes('text/html') || previewText.includes('<!doctype') || previewText.includes('<html')) {
        const previewHex = toHex(preview);
        debugError('zkConfigProvider', 'fetch:unexpected-html-artifact', {
          scope,
          url,
          status: response.status,
          contentType,
          contentLength,
          previewText,
          previewHex,
        });
        throw new Error(
          `ZK artifact request returned HTML instead of binary data. url=${url} status=${response.status} content-type=${contentType || 'unknown'}`,
        );
      }
    }
    return response;
  };
}

function isZkArtifactUrl(url: string): boolean {
  return (
    url.includes('/keys/') ||
    url.includes('/zkir/') ||
    url.endsWith('.prover') ||
    url.endsWith('.verifier') ||
    url.endsWith('.bzkir')
  );
}

async function createNonceSafeProofProvider<K extends string>(
  session: OneAmSession,
  zkConfigProvider: ZKConfigProvider<K>,
): Promise<ReturnType<typeof createProofProvider>> {
  const nonceSeparator = '#nonce=';
  const stripNonce = (keyLocation: string) => {
    const index = keyLocation.indexOf(nonceSeparator);
    return index === -1 ? keyLocation : keyLocation.slice(0, index);
  };
  const tagNonce = (keyLocation: string) => `${keyLocation}${nonceSeparator}${crypto.randomUUID()}`;

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

  class SystemAwareZkConfigProvider extends ZKConfigProvider<string> {
    private readonly systemProvider = new FetchZkConfigProvider<string>(
      new URL(APP_CONFIG.zkMintAssetBasePath, window.location.origin).toString(),
      createLoggingFetch('system'),
    );

    constructor(private readonly contractProvider: ZKConfigProvider<string>) {
      super();
    }

    private providerFor(circuitId: string) {
      return circuitId.startsWith('midnight/') ? this.systemProvider : this.contractProvider;
    }

    getProverKey(circuitId: string) {
      return this.providerFor(circuitId).getProverKey(circuitId);
    }

    getVerifierKey(circuitId: string) {
      return this.providerFor(circuitId).getVerifierKey(circuitId);
    }

    getZKIR(circuitId: string) {
      return this.providerFor(circuitId).getZKIR(circuitId);
    }
  }

  const systemAwareZkConfigProvider = new SystemAwareZkConfigProvider(
    zkConfigProvider as unknown as ZKConfigProvider<string>,
  );
  const dedupSafeZkConfigProvider = new NonceStrippingZkConfigProvider(
    systemAwareZkConfigProvider,
  );
  const baseProvingProvider = await session.api.getProvingProvider(dedupSafeZkConfigProvider.asKeyMaterialProvider());
  const provingProvider: ProvingProvider = {
    check: (serializedPreimage, keyLocation) =>
      baseProvingProvider.check(serializedPreimage, tagNonce(keyLocation)),
    prove: (serializedPreimage, keyLocation, overwriteBindingInput) =>
      baseProvingProvider.prove(serializedPreimage, tagNonce(keyLocation), overwriteBindingInput),
  };

  return createProofProvider(provingProvider);
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

  const zkBaseUrl = new URL(APP_CONFIG.zkMintAssetBasePath, window.location.origin).toString();
  const zkConfigProvider = new FetchZkConfigProvider<'mintShielded'>(zkBaseUrl, createLoggingFetch('mint'));
  debugLog('zkConfigProvider', 'baseURL', { zkBaseUrl });
  const proofProvider = await createNonceSafeProofProvider(session, zkConfigProvider);

  return {
    privateStateProvider,
    publicDataProvider,
    zkConfigProvider,
    proofProvider,
    walletProvider,
    midnightProvider,
  };
}

export async function createMintDepositProviders(session: OneAmSession): Promise<MintDepositProviders> {
  setNetworkId(session.config.networkId);

  const privateStateProvider = createPrivateStateProvider();
  const walletProvider = createWalletProvider(session);
  const midnightProvider = createMidnightProvider(session);
  const publicDataProvider = createPatchedPublicDataProvider(session.config.indexerUri, session.config.indexerWsUri);
  const zkBaseUrl = new URL(APP_CONFIG.zkMintDepositAssetBasePath, window.location.origin).toString();
  const zkConfigProvider = new FetchZkConfigProvider<MintDepositCircuitKeys>(
    zkBaseUrl,
    createLoggingFetch('mint-deposit'),
  );
  debugLog('zkConfigProvider', 'baseURL', { scope: 'mint-deposit', zkBaseUrl });
  const proofProvider = await createNonceSafeProofProvider(session, zkConfigProvider);

  return {
    privateStateProvider,
    publicDataProvider,
    zkConfigProvider,
    proofProvider,
    walletProvider,
    midnightProvider,
  };
}

export async function createDepositOnlyProviders(session: OneAmSession): Promise<DepositOnlyProviders> {
  setNetworkId(session.config.networkId);

  const privateStateProvider = createPrivateStateProvider();
  const walletProvider = createWalletProvider(session);
  const midnightProvider = createMidnightProvider(session);
  const publicDataProvider = createPatchedPublicDataProvider(session.config.indexerUri, session.config.indexerWsUri);
  const zkBaseUrl = new URL(APP_CONFIG.zkDepositOnlyAssetBasePath, window.location.origin).toString();
  const zkConfigProvider = new FetchZkConfigProvider<'depositShielded'>(
    zkBaseUrl,
    createLoggingFetch('deposit-only'),
  );
  debugLog('zkConfigProvider', 'baseURL', { scope: 'deposit-only', zkBaseUrl });
  const proofProvider = await createNonceSafeProofProvider(session, zkConfigProvider);

  return {
    privateStateProvider,
    publicDataProvider,
    zkConfigProvider,
    proofProvider,
    walletProvider,
    midnightProvider,
  };
}

export async function createLeaderboardProviders(session: OneAmSession): Promise<LeaderboardProviders> {
  setNetworkId(session.config.networkId);

  const privateStateProvider =
    createPrivateStateProvider<LeaderboardPrivateStateId, LeaderboardPrivateState>();
  const walletProvider = createWalletProvider(session);
  const midnightProvider = createMidnightProvider(session);
  const publicDataProvider = createPatchedPublicDataProvider(session.config.indexerUri, session.config.indexerWsUri);
  const zkConfigProvider = new FetchZkConfigProvider<LeaderboardCircuitKeys>(
    new URL(APP_CONFIG.zkLeaderboardAssetBasePath, window.location.origin).toString(),
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
}
