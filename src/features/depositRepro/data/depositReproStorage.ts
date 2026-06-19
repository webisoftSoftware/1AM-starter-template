export const MINT_DEPOSIT_CONTRACT_ADDRESS_STORAGE_KEY = 'one-am.deposit-repro.mint-deposit-contract-address';
export const DEPOSIT_ONLY_CONTRACT_ADDRESS_STORAGE_KEY = 'one-am.deposit-repro.deposit-only-contract-address';

function readStoredValue(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeStoredValue(key: string, value: string): void {
  try {
    if (value) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Local storage is optional; the in-memory state still keeps the flow usable.
  }
}

export function readStoredMintDepositContractAddress(): string {
  return readStoredValue(MINT_DEPOSIT_CONTRACT_ADDRESS_STORAGE_KEY);
}

export function writeStoredMintDepositContractAddress(value: string): void {
  writeStoredValue(MINT_DEPOSIT_CONTRACT_ADDRESS_STORAGE_KEY, value);
}

export function readStoredDepositOnlyContractAddress(): string {
  return readStoredValue(DEPOSIT_ONLY_CONTRACT_ADDRESS_STORAGE_KEY);
}

export function writeStoredDepositOnlyContractAddress(value: string): void {
  writeStoredValue(DEPOSIT_ONLY_CONTRACT_ADDRESS_STORAGE_KEY, value);
}
