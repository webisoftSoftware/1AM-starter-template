import { storageKeyForNetwork } from '../../../config';

const PROOF_SIMULATOR_CONTRACT_ADDRESS_KEY = 'one-am.proof-simulator.contract-address';

export function proofSimulatorContractAddressStorageKey(networkId: string | undefined): string {
  return storageKeyForNetwork(PROOF_SIMULATOR_CONTRACT_ADDRESS_KEY, networkId);
}

export function readProofSimulatorContractAddress(networkId: string | undefined): string {
  try {
    return window.localStorage.getItem(proofSimulatorContractAddressStorageKey(networkId)) ?? '';
  } catch {
    return '';
  }
}

export function writeProofSimulatorContractAddress(address: string, networkId: string | undefined): void {
  try {
    const key = proofSimulatorContractAddressStorageKey(networkId);
    if (address) window.localStorage.setItem(key, address);
    else window.localStorage.removeItem(key);
  } catch {
    // Persistence is optional; the current session can still use the contract.
  }
}
