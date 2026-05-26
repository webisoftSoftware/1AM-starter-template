declare global {
  interface OneAmConfiguration {
    networkId: string;
  }

  interface OneAmTransferRequest {
    kind: 'unshielded';
    recipient: string;
    type: import('@midnight-ntwrk/ledger-v8').RawTokenType;
    value: bigint;
  }

  type OneAmMakeTransferResult = { tx_id: string };

  interface OneAmConnectedApi {
    getConfiguration: () => Promise<OneAmConfiguration>;
    getUnshieldedAddress: () => Promise<{ unshieldedAddress: string }>;
    makeTransfer: (transfers: OneAmTransferRequest[]) => Promise<OneAmMakeTransferResult>;
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
