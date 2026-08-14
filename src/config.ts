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
  zkProofSimulatorAssetBasePath: readNonEmpty(
    import.meta.env.VITE_ZK_PROOF_SIMULATOR_ASSET_BASE_PATH,
    '/zk/proofSimulator',
  ),
} as const;

export const PROOF_SIMULATOR_DEFAULT_CONTRACTS: Partial<Record<OneAmNetwork, string>> = {
  preview: '97d73064132b3e3c8b2579abeddda32fb77571b1baf81ba3f04b39a8f19cf1cf',
  preprod: '27470e2d25fd5b90a58f6497a8ccba4d3c61d218fe4df77856d098deb67369db',
};

export function proofSimulatorDefaultContract(networkId: string | undefined): string {
  return isOneAmNetwork(networkId) ? PROOF_SIMULATOR_DEFAULT_CONTRACTS[networkId] ?? '' : '';
}
