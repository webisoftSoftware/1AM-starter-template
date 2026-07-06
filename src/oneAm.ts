import { nativeToken, rawTokenType, type ContractAddress } from '@midnight-ntwrk/ledger-v8';
import { isOneAmNetwork, ONE_AM_NETWORKS, type OneAmNetwork, type OneAmNetworkPreference } from './config';

const LAST_CONNECTED_NETWORK_STORAGE_KEY = 'one-am.last-connected-network';

export type OneAmShieldedAddress = {
  shieldedAddress: string;
  shieldedCoinPublicKey: string;
  shieldedEncryptionPublicKey: string;
};

export type OneAmSession = {
  api: OneAmConnectedApi;
  config: OneAmConfiguration;
  unshieldedAddress: string;
  shieldedAddress: OneAmShieldedAddress;
};

export function getOneAmWallet(): OneAmWallet | null {
  return window.midnight?.['1am'] ?? null;
}

function readLastConnectedNetwork(): OneAmNetwork | null {
  try {
    const value = window.localStorage.getItem(LAST_CONNECTED_NETWORK_STORAGE_KEY);
    return value && isOneAmNetwork(value) ? value : null;
  } catch {
    return null;
  }
}

function writeLastConnectedNetwork(network: OneAmNetwork): void {
  try {
    window.localStorage.setItem(LAST_CONNECTED_NETWORK_STORAGE_KEY, network);
  } catch {
    // Local storage is optional; connection still succeeds without remembering the last network.
  }
}

function connectionCandidates(preference: OneAmNetworkPreference): OneAmNetwork[] {
  if (preference !== 'auto') {
    return [preference];
  }

  const lastConnectedNetwork = readLastConnectedNetwork();
  return lastConnectedNetwork
    ? [lastConnectedNetwork, ...ONE_AM_NETWORKS.filter((network) => network !== lastConnectedNetwork)]
    : [...ONE_AM_NETWORKS];
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function connectOneAmNetwork(wallet: OneAmWallet, network: OneAmNetwork): Promise<OneAmSession> {
  const api = await wallet.connect(network);
  const [config, unshieldedAddress, shieldedAddress] = await Promise.all([
    api.getConfiguration(),
    api.getUnshieldedAddress(),
    api.getShieldedAddresses(),
  ]);
  const connectedNetwork = isOneAmNetwork(config.networkId) ? config.networkId : network;
  writeLastConnectedNetwork(connectedNetwork);

  return {
    api,
    config,
    unshieldedAddress: unshieldedAddress.unshieldedAddress,
    shieldedAddress,
  };
}

export async function connectOneAm(networkPreference: OneAmNetworkPreference): Promise<OneAmSession> {
  const wallet = getOneAmWallet();
  if (!wallet) {
    throw new Error('1AM wallet was not found in window.midnight["1am"].');
  }

  const errors: string[] = [];
  for (const network of connectionCandidates(networkPreference)) {
    try {
      return await connectOneAmNetwork(wallet, network);
    } catch (error) {
      errors.push(`${network}: ${extractErrorMessage(error)}`);
    }
  }

  if (networkPreference === 'auto') {
    throw new Error(`Unable to connect 1AM on preview or preprod. ${errors.join(' ')}`);
  }

  throw new Error(`Unable to connect 1AM on ${networkPreference}. ${errors.join(' ')}`);
}

export async function sendNativeNightTransfer(
  api: OneAmConnectedApi,
  recipient: string,
  atomicValue: bigint,
): Promise<string> {
  const result = await api.makeTransfer([
    {
      kind: 'unshielded',
      recipient,
      type: nativeToken().raw,
      value: atomicValue,
    },
  ]);

  return result.tx_id;
}

export async function getAvailableNativeNight(api: OneAmConnectedApi): Promise<bigint> {
  if (!api.getUnshieldedBalances) {
    throw new Error('This 1AM connection does not expose unshielded balances.');
  }

  const balances = await api.getUnshieldedBalances();
  return balances[nativeToken().raw] ?? 0n;
}

function paddedDomainSeparator(value: string): Uint8Array {
  const encoded = new TextEncoder().encode(value);
  if (encoded.length > 32) {
    throw new Error('Token domain separators must fit in 32 bytes.');
  }

  const padded = new Uint8Array(32);
  padded.set(encoded);
  return padded;
}

export function shieldedMintTokenType(contractAddress: string): string {
  return rawTokenType(paddedDomainSeparator('1am-shielded-mint'), contractAddress as ContractAddress);
}

export async function getAvailableShieldedMintToken(
  api: OneAmConnectedApi,
  contractAddress: string,
): Promise<bigint> {
  if (!api.getShieldedBalances) {
    throw new Error('This 1AM connection does not expose shielded balances.');
  }

  const balances = await api.getShieldedBalances();
  return balances[shieldedMintTokenType(contractAddress)] ?? 0n;
}
