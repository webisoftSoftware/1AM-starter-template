import { storageKeyForNetwork } from '../../../config';

export const LEADERBOARD_CONTRACT_ADDRESS_STORAGE_KEY = 'leaderboard-contract-address';
export const LEADERBOARD_SECRET_STORAGE_KEY = 'midnight-leaderboard-secret';

export function leaderboardContractAddressStorageKey(networkId: string | undefined): string {
  return storageKeyForNetwork(LEADERBOARD_CONTRACT_ADDRESS_STORAGE_KEY, networkId);
}

export function readStoredLeaderboardContractAddress(networkId: string | undefined): string {
  return (
    window.localStorage.getItem(leaderboardContractAddressStorageKey(networkId)) ??
    (networkId === 'preview' ? window.localStorage.getItem(LEADERBOARD_CONTRACT_ADDRESS_STORAGE_KEY) : null) ??
    ''
  );
}

export function writeStoredLeaderboardContractAddress(contractAddress: string, networkId: string | undefined): void {
  const storageKey = leaderboardContractAddressStorageKey(networkId);
  if (contractAddress) {
    window.localStorage.setItem(storageKey, contractAddress);
  } else {
    window.localStorage.removeItem(storageKey);
  }
}

export function readOrCreateLeaderboardSecret(): Uint8Array {
  const stored = window.localStorage.getItem(LEADERBOARD_SECRET_STORAGE_KEY);
  if (stored) {
    try {
      const decoded = Uint8Array.from(window.atob(stored), (char) => char.charCodeAt(0));
      if (decoded.length === 32) {
        return decoded;
      }
    } catch {
      window.localStorage.removeItem(LEADERBOARD_SECRET_STORAGE_KEY);
    }
  }

  const secret = crypto.getRandomValues(new Uint8Array(32));
  window.localStorage.setItem(LEADERBOARD_SECRET_STORAGE_KEY, window.btoa(String.fromCharCode(...secret)));
  return secret;
}
