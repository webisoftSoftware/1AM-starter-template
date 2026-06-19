import type { ContractState as CompactContractState } from '@midnight-ntwrk/compact-runtime';
import type { LedgerParameters, ZswapChainState } from '@midnight-ntwrk/ledger-v8';

export type WalletStatus = 'checking' | 'detected' | 'not-found';
export type BusyAction = 'connect' | 'deploy' | 'submit' | 'verify' | 'refresh' | null;
export type AppTab = 'play' | 'scores' | 'debug';
export type DisplayMode = 'anonymous' | 'public' | 'custom';

export type ContractSnapshot = {
  contractState: CompactContractState;
  zswapChainState: ZswapChainState;
  ledgerParameters: LedgerParameters;
};

export type LeaderboardEntry = {
  id: number;
  rank: number;
  score: number;
  displayName: string;
  ownerHash: string;
};
