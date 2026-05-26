import { nativeToken } from '@midnight-ntwrk/ledger-v8';
import { debugLog } from './debug';

export type ConnectedSession = {
  api: OneAmConnectedApi;
  config: OneAmConfiguration;
  unshieldedAddress: string;
};

export function nativeNightTokenType(): string {
  return nativeToken().raw;
}

export async function createConnectedSession(api: OneAmConnectedApi): Promise<ConnectedSession> {
  const [config, unshieldedAddress] = await Promise.all([
    api.getConfiguration(),
    api.getUnshieldedAddress(),
  ]);

  debugLog('oneAm', 'createConnectedSession:success', {
    networkId: config.networkId,
    substrateNodeUri: config.substrateNodeUri,
  });

  return {
    api,
    config,
    unshieldedAddress: unshieldedAddress.unshieldedAddress,
  };
}

export async function submitNativeNightTransfer(
  api: OneAmConnectedApi,
  recipient: string,
  value: bigint,
): Promise<string> {
  const transfer: OneAmTransferRequest = {
    kind: 'unshielded',
    recipient,
    type: nativeNightTokenType(),
    value,
  };

  debugLog('oneAm', 'makeTransfer:start', {
    kind: transfer.kind,
    recipient,
    type: transfer.type,
    value: value.toString(),
  });

  const result = await api.makeTransfer([transfer]);
  debugLog('oneAm', 'makeTransfer:submitted', { txId: result.tx_id });
  return result.tx_id;
}
