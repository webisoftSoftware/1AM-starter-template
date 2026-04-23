const SHIELDED_PAYLOAD_STORAGE_PREFIX = 'todo-shielded-payload:';

export const PUBLIC_CONTRACT_ADDRESS_STORAGE_KEY = 'todo-contract-address-unshielded';
export const SHIELDED_CONTRACT_ADDRESS_STORAGE_KEY = 'todo-contract-address-shielded';

export function readStoredContractAddress(storageKey: string): string {
  return window.localStorage.getItem(storageKey) ?? '';
}

function shieldedPayloadStorageKey(contractAddress: string): string {
  return `${SHIELDED_PAYLOAD_STORAGE_PREFIX}${contractAddress}`;
}

export function readStoredShieldedPayload(contractAddress: string): string {
  return window.localStorage.getItem(shieldedPayloadStorageKey(contractAddress)) ?? '';
}

export function writeStoredShieldedPayload(contractAddress: string, payload: string): void {
  window.localStorage.setItem(shieldedPayloadStorageKey(contractAddress), payload);
}

export function clearStoredShieldedPayload(contractAddress: string): void {
  if (!contractAddress) {
    return;
  }

  window.localStorage.removeItem(shieldedPayloadStorageKey(contractAddress));
}
