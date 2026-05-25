declare global {
  interface OneAmConfiguration {
    networkId: string;
    indexerUri: string;
    indexerWsUri: string;
    proverServerUri?: string;
    substrateNodeUri: string;
  }

  interface OneAmKeyMaterialProvider {
    getZKIR: (circuitKeyLocation: string) => Promise<Uint8Array>;
    getProverKey: (circuitKeyLocation: string) => Promise<Uint8Array>;
    getVerifierKey: (circuitKeyLocation: string) => Promise<Uint8Array>;
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

  interface OneAmConnectedApi {
    getConfiguration: () => Promise<OneAmConfiguration>;
    getShieldedAddresses: () => Promise<{
      shieldedAddress: string;
      shieldedCoinPublicKey: string;
      shieldedEncryptionPublicKey: string;
    }>;
    getUnshieldedAddress: () => Promise<{ unshieldedAddress: string }>;
    getProvingProvider: (keyMaterialProvider: OneAmKeyMaterialProvider) => Promise<import('@midnight-ntwrk/ledger-v8').ProvingProvider>;
    signData: (data: string, options: OneAmSignDataOptions) => Promise<OneAmSignature>;
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
