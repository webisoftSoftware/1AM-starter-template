declare global {
  type OneAmSignDataOptions = {
    encoding: 'hex' | 'base64' | 'text';
    keyType: 'unshielded';
  };

  type OneAmSignature = {
    data: string;
    signature: string;
    verifyingKey: string;
  };

  interface OneAmConfiguration {
    networkId: string;
    indexerUri: string;
    indexerWsUri: string;
    proverServerUri?: string;
    substrateNodeUri: string;
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
    getShieldedAddresses: () => Promise<{
      shieldedAddress: string;
      shieldedCoinPublicKey: string;
      shieldedEncryptionPublicKey: string;
    }>;
    getUnshieldedAddress: () => Promise<{ unshieldedAddress: string }>;
    getProvingProvider: (
      keyMaterialProvider: import('@midnight-ntwrk/midnight-js-types').KeyMaterialProvider,
    ) => Promise<import('@midnight-ntwrk/ledger-v8').ProvingProvider>;
    signData: (data: string, options: OneAmSignDataOptions) => Promise<OneAmSignature>;
    balanceUnsealedTransaction: (txHex: string) => Promise<{ tx: string }>;
    submitTransaction: (txHex: string) => Promise<void>;
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
