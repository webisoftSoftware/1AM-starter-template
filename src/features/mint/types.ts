import type { ContractState as CompactContractState } from '@midnight-ntwrk/compact-runtime';
import type { LedgerParameters, ZswapChainState } from '@midnight-ntwrk/ledger-v8';

export type WalletStatus = 'checking' | 'detected' | 'not-found';
export type BusyAction = 'connect' | 'deploy' | 'mint' | 'refresh' | null;
export type AppTab = 'mint' | 'debug';

export type ContractSnapshot = {
  contractState: CompactContractState;
  zswapChainState: ZswapChainState;
  ledgerParameters: LedgerParameters;
};

export type LedgerView = {
  totalMinted: bigint;
  mintCount: bigint;
};
