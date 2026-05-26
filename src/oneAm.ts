import { nativeToken } from '@midnight-ntwrk/ledger-v8';
import type { OneAmNetwork } from './config';

export type ConnectedSession = {
  api: OneAmConnectedApi;
  networkId: string;
  unshieldedAddress: string;
};

export function getOneAmWallet(): OneAmWallet | null {
  return window.midnight?.['1am'] ?? null;
}

export async function connectOneAm(network: OneAmNetwork): Promise<ConnectedSession> {
  const wallet = getOneAmWallet();
  if (!wallet) {
    throw new Error('1AM wallet was not found in window.midnight["1am"].');
  }

  const api = await wallet.connect(network);
  const [configuration, address] = await Promise.all([
    api.getConfiguration(),
    api.getUnshieldedAddress(),
  ]);

  return {
    api,
    networkId: configuration.networkId,
    unshieldedAddress: address.unshieldedAddress,
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
