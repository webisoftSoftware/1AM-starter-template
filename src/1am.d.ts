declare global {
  interface OneAmConfiguration {
    networkId: string;
    indexerUri: string;
    indexerWsUri: string;
    proverServerUri?: string;
    substrateNodeUri: string;
  }

  interface OneAmSignDataOptions {
    encoding: 'hex' | 'base64' | 'text';
    keyType: 'unshielded';
  }

  interface OneAmSignature {
    data: string;
    signature: string;
    verifyingKey: string;
  }

  interface OneAmTransferRequest {
    kind: 'unshielded';
    recipient: string;
    type: import('@midnight-ntwrk/ledger-v8').RawTokenType;
    value: bigint;
  }

  type OneAmMakeTransferResult = { tx_id: string } | { tx: string };

  interface OneAmConnectedApi {
    getConfiguration: () => Promise<OneAmConfiguration>;
    getUnshieldedAddress: () => Promise<{ unshieldedAddress: string }>;
    makeTransfer: (transfers: OneAmTransferRequest[]) => Promise<OneAmMakeTransferResult>;
    submitTransaction: (txHex: string) => Promise<void>;
    signData: (data: string, options: OneAmSignDataOptions) => Promise<OneAmSignature>;
  }

  interface OneAmWallet {
    connect: (networkId: 'preview' | 'preprod') => Promise<OneAmConnectedApi>;
  }

  interface Window {
    midnight?: {
      '1am'?: OneAmWallet;
      [key: string]: unknown;
    };
  }
}

export {};
