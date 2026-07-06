export const ONE_AM_NETWORKS = ['preview', 'preprod'] as const;

export type OneAmNetwork = (typeof ONE_AM_NETWORKS)[number];
export type OneAmNetworkPreference = OneAmNetwork | 'auto';

export function isOneAmNetwork(value: string | undefined): value is OneAmNetwork {
  return ONE_AM_NETWORKS.includes(value as OneAmNetwork);
}

function readOneAmNetworkPreference(value: string | undefined): OneAmNetworkPreference {
  if (isOneAmNetwork(value)) {
    return value;
  }

  return 'auto';
}

export function oneAmNetworkLabel(value: OneAmNetworkPreference | string): string {
  return value === 'auto' ? 'auto network' : `${value} network`;
}

export function storageKeyForNetwork(baseKey: string, networkId: string | undefined): string {
  return networkId ? `${baseKey}:${networkId}` : baseKey;
}

function readNonEmpty(value: string | undefined, fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  return fallback;
}

export const APP_CONFIG = {
  oneAmNetwork: readOneAmNetworkPreference(import.meta.env.VITE_1AM_NETWORK),
  zkTodoAssetBasePath: readNonEmpty(import.meta.env.VITE_ZK_TODO_ASSET_BASE_PATH, '/zk/todo'),
  zkShieldedTodoAssetBasePath: readNonEmpty(
    import.meta.env.VITE_ZK_SHIELDED_TODO_ASSET_BASE_PATH,
    '/zk/shieldedTodo',
  ),
  zkMintAssetBasePath: readNonEmpty(import.meta.env.VITE_ZK_MINT_ASSET_BASE_PATH, '/zk/shieldedMint'),
  zkMintDepositAssetBasePath: readNonEmpty(
    import.meta.env.VITE_ZK_MINT_DEPOSIT_ASSET_BASE_PATH,
    '/zk/shieldedMintDeposit',
  ),
  zkDepositOnlyAssetBasePath: readNonEmpty(
    import.meta.env.VITE_ZK_DEPOSIT_ONLY_ASSET_BASE_PATH,
    '/zk/shieldedDepositOnly',
  ),
  zkLeaderboardAssetBasePath: readNonEmpty(
    import.meta.env.VITE_ZK_LEADERBOARD_ASSET_BASE_PATH,
    '/zk/leaderboard',
  ),
} as const;
