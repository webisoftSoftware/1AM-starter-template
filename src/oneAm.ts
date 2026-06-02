import { nativeToken, rawTokenType, type ContractAddress } from '@midnight-ntwrk/ledger-v8';
import type { OneAmNetwork } from './config';

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

export async function connectOneAm(network: OneAmNetwork): Promise<OneAmSession> {
  const wallet = getOneAmWallet();
  if (!wallet) {
    throw new Error('1AM wallet was not found in window.midnight["1am"].');
  }

  const api = await wallet.connect(network);
  const [config, unshieldedAddress, shieldedAddress] = await Promise.all([
    api.getConfiguration(),
    api.getUnshieldedAddress(),
    api.getShieldedAddresses(),
  ]);

  return {
    api,
    config,
    unshieldedAddress: unshieldedAddress.unshieldedAddress,
    shieldedAddress,
  };
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
