import { nativeToken, Transaction } from '@midnight-ntwrk/ledger-v8';
import { debugLog } from './debug';

export type ConnectedSession = {
  api: OneAmConnectedApi;
  config: OneAmConfiguration;
  unshieldedAddress: string;
};

function fromHex(hex: string): Uint8Array {
  const normalized = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (normalized.length % 2 !== 0) {
    throw new Error('Received an invalid transaction hex string from 1AM.');
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }
  return bytes;
}

function summarizeHex(hex: string): string {
  if (hex.length <= 32) {
    return hex;
  }

  return `${hex.slice(0, 16)}...${hex.slice(-16)}`;
}

function transactionIdentifier(tx: { identifiers(): string[] }): string {
  const [identifier] = tx.identifiers();
  if (!identifier) {
    throw new Error('The finalized transaction did not contain a transaction identifier.');
  }

  return identifier;
}

function transactionIdentifierFromHex(txHex: string): string {
  const tx = Transaction.deserialize('signature', 'proof', 'binding', fromHex(txHex));
  return transactionIdentifier(tx);
}

function isSubmittedTransferResult(result: OneAmMakeTransferResult): result is { tx_id: string } {
  return 'tx_id' in result;
}

function isFinalizedTransferResult(result: OneAmMakeTransferResult): result is { tx: string } {
  return 'tx' in result;
}

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

  if (isSubmittedTransferResult(result)) {
    debugLog('oneAm', 'makeTransfer:submitted', { txId: result.tx_id });
    return result.tx_id;
  }

  if (isFinalizedTransferResult(result)) {
    const txId = transactionIdentifierFromHex(result.tx);
    debugLog('oneAm', 'makeTransfer:finalized-unsigned-submit', {
      txId,
      txHexLength: result.tx.length,
      txHexPreview: summarizeHex(result.tx),
    });
    await api.submitTransaction(result.tx);
    debugLog('oneAm', 'submitTransaction:success', { txId });
    return txId;
  }

  throw new Error('1AM returned an unsupported transfer response.');
}
