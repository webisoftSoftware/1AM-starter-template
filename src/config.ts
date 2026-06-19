export type OneAmNetwork = 'preview' | 'preprod';

function readOneAmNetwork(value: string | undefined): OneAmNetwork {
  if (value === 'preprod') {
    return 'preprod';
  }

  return 'preview';
}

function readNonEmpty(value: string | undefined, fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  return fallback;
}

export const APP_CONFIG = {
  oneAmNetwork: readOneAmNetwork(import.meta.env.VITE_1AM_NETWORK),
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
