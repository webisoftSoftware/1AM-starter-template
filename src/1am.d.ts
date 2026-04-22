interface OneAmConfiguration {
  networkId: string;
  indexerUri: string;
  indexerWsUri: string;
  proverServerUri: string;
  substrateNodeUri: string;
}

interface OneAmConnectedApi {
  getConfiguration: () => Promise<OneAmConfiguration>;
  getUnshieldedAddress: () => Promise<{ unshieldedAddress: string }>;
}

interface OneAmWallet {
  connect: (networkId: 'preview' | 'preprod') => Promise<OneAmConnectedApi>;
}

declare global {
  interface Window {
    midnight?: {
      '1am'?: OneAmWallet;
      [key: string]: unknown;
    };
  }
}

export {};
