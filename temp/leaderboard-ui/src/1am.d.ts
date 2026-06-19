declare global {
  interface OneAmConfiguration {
    networkId: string;
    indexerUri: string;
    indexerWsUri: string;
    proverServerUri?: string;
    substrateNodeUri: string;
  }

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
    balanceUnsealedTransaction: (txHex: string) => Promise<{ tx: string }>;
    submitTransaction: (txHex: string) => Promise<void>;
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
