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
} as const;
