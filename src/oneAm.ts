import { nativeToken } from '@midnight-ntwrk/ledger-v8';
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
