import type { ContractState as CompactContractState } from '@midnight-ntwrk/compact-runtime';
import type { LedgerParameters, ZswapChainState } from '@midnight-ntwrk/ledger-v8';

export type WalletStatus = 'checking' | 'detected' | 'not-found';

export type BusyAction =
  | 'connect'
  | 'deployMintDeposit'
  | 'loadMintDeposit'
  | 'mint'
  | 'sameDeposit'
  | 'deployDepositOnly'
  | 'loadDepositOnly'
  | 'differentDeposit'
  | 'refresh'
  | null;

export type ContractSnapshot = {
  contractState: CompactContractState;
  zswapChainState: ZswapChainState;
  ledgerParameters: LedgerParameters;
};

export type MintDepositLedgerView = {
  totalMinted: bigint;
  mintCount: bigint;
  totalDeposited: bigint;
  depositCount: bigint;
};

export type DepositOnlyLedgerView = {
  sourceContract: string;
  totalDeposited: bigint;
  depositCount: bigint;
};

export type DepositReproStepId =
  | 'deployMintDeposit'
  | 'mint'
  | 'sameDeposit'
  | 'deployDepositOnly'
  | 'differentDeposit';

export type DepositReproStepStatus = {
  label: string;
  status: 'idle' | 'running' | 'success' | 'error';
  txId?: string;
  error?: string;
  at?: string;
};
