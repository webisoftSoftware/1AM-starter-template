export const MINT_CONTRACT_ADDRESS_STORAGE_KEY = 'shielded-mint-contract-address';

export function readStoredContractAddress(): string {
  return window.localStorage.getItem(MINT_CONTRACT_ADDRESS_STORAGE_KEY) ?? '';
}

export function writeStoredContractAddress(value: string): void {
  if (value) {
    window.localStorage.setItem(MINT_CONTRACT_ADDRESS_STORAGE_KEY, value);
  } else {
    window.localStorage.removeItem(MINT_CONTRACT_ADDRESS_STORAGE_KEY);
  }
}
