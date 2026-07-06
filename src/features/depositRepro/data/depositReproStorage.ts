import { storageKeyForNetwork } from '../../../config';

export const MINT_DEPOSIT_CONTRACT_ADDRESS_STORAGE_KEY = 'one-am.deposit-repro.mint-deposit-contract-address';
export const DEPOSIT_ONLY_CONTRACT_ADDRESS_STORAGE_KEY = 'one-am.deposit-repro.deposit-only-contract-address';

export function depositReproContractAddressStorageKey(key: string, networkId: string | undefined): string {
  return storageKeyForNetwork(key, networkId);
}

function readStoredValue(key: string, networkId: string | undefined): string {
  try {
    return (
      window.localStorage.getItem(depositReproContractAddressStorageKey(key, networkId)) ??
      (networkId === 'preview' ? window.localStorage.getItem(key) : null) ??
      ''
    );
  } catch {
    return '';
  }
}

function writeStoredValue(key: string, value: string, networkId: string | undefined): void {
  try {
    const storageKey = depositReproContractAddressStorageKey(key, networkId);
    if (value) {
      window.localStorage.setItem(storageKey, value);
    } else {
      window.localStorage.removeItem(storageKey);
    }
  } catch {
    // Local storage is optional; the in-memory state still keeps the flow usable.
  }
}

export function readStoredMintDepositContractAddress(networkId: string | undefined): string {
  return readStoredValue(MINT_DEPOSIT_CONTRACT_ADDRESS_STORAGE_KEY, networkId);
}

export function writeStoredMintDepositContractAddress(value: string, networkId: string | undefined): void {
  writeStoredValue(MINT_DEPOSIT_CONTRACT_ADDRESS_STORAGE_KEY, value, networkId);
}

export function readStoredDepositOnlyContractAddress(networkId: string | undefined): string {
  return readStoredValue(DEPOSIT_ONLY_CONTRACT_ADDRESS_STORAGE_KEY, networkId);
}

export function writeStoredDepositOnlyContractAddress(value: string, networkId: string | undefined): void {
  writeStoredValue(DEPOSIT_ONLY_CONTRACT_ADDRESS_STORAGE_KEY, value, networkId);
}
