import { storageKeyForNetwork } from '../../../config';

const SHIELDED_PAYLOAD_STORAGE_PREFIX = 'todo-shielded-payload:';

export const PUBLIC_CONTRACT_ADDRESS_STORAGE_KEY = 'todo-contract-address-unshielded';
export const SHIELDED_CONTRACT_ADDRESS_STORAGE_KEY = 'todo-contract-address-shielded';

export function contractAddressStorageKey(storageKey: string, networkId: string | undefined): string {
  return storageKeyForNetwork(storageKey, networkId);
}

export function readStoredContractAddress(storageKey: string, networkId: string | undefined): string {
  return (
    window.localStorage.getItem(contractAddressStorageKey(storageKey, networkId)) ??
    (networkId === 'preview' ? window.localStorage.getItem(storageKey) : null) ??
    ''
  );
}

export function writeStoredContractAddress(storageKey: string, networkId: string | undefined, value: string): void {
  const scopedStorageKey = contractAddressStorageKey(storageKey, networkId);
  if (value) {
    window.localStorage.setItem(scopedStorageKey, value);
  } else {
    window.localStorage.removeItem(scopedStorageKey);
  }
}

function shieldedPayloadStorageKey(contractAddress: string, networkId: string | undefined): string {
  return storageKeyForNetwork(`${SHIELDED_PAYLOAD_STORAGE_PREFIX}${contractAddress}`, networkId);
}

export function readStoredShieldedPayload(contractAddress: string, networkId: string | undefined): string {
  return (
    window.localStorage.getItem(shieldedPayloadStorageKey(contractAddress, networkId)) ??
    window.localStorage.getItem(shieldedPayloadStorageKey(contractAddress, undefined)) ??
    ''
  );
}

export function writeStoredShieldedPayload(contractAddress: string, networkId: string | undefined, payload: string): void {
  window.localStorage.setItem(shieldedPayloadStorageKey(contractAddress, networkId), payload);
}

export function clearStoredShieldedPayload(contractAddress: string, networkId: string | undefined): void {
  if (!contractAddress) {
    return;
  }

  window.localStorage.removeItem(shieldedPayloadStorageKey(contractAddress, networkId));
}
