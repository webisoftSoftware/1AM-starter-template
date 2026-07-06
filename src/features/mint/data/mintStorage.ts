import { storageKeyForNetwork } from '../../../config';

export const MINT_CONTRACT_ADDRESS_STORAGE_KEY = 'shielded-mint-contract-address';

export function mintContractAddressStorageKey(networkId: string | undefined): string {
  return storageKeyForNetwork(MINT_CONTRACT_ADDRESS_STORAGE_KEY, networkId);
}

export function readStoredContractAddress(networkId: string | undefined): string {
  return (
    window.localStorage.getItem(mintContractAddressStorageKey(networkId)) ??
    (networkId === 'preview' ? window.localStorage.getItem(MINT_CONTRACT_ADDRESS_STORAGE_KEY) : null) ??
    ''
  );
}

export function writeStoredContractAddress(value: string, networkId: string | undefined): void {
  const storageKey = mintContractAddressStorageKey(networkId);
  if (value) {
    window.localStorage.setItem(storageKey, value);
  } else {
    window.localStorage.removeItem(storageKey);
  }
}
