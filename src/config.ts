export type OneAmNetwork = 'preview' | 'preprod';

function readOneAmNetwork(value: string | undefined): OneAmNetwork {
  if (value === 'preprod') {
    return 'preprod';
  }

  return 'preview';
}

export const APP_CONFIG = {
  oneAmNetwork: readOneAmNetwork(import.meta.env.VITE_1AM_NETWORK),
} as const;
