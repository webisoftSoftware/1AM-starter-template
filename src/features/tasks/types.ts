import type { ContractState as CompactContractState } from '@midnight-ntwrk/compact-runtime';
import type { LedgerParameters, ZswapChainState } from '@midnight-ntwrk/ledger-v8';

export type WalletStatus = 'checking' | 'detected' | 'not-found';
export type BusyAction = 'connect' | 'deploy' | 'submit' | 'refresh' | null;
export type Priority = 'low' | 'medium' | 'high';
export type StatusFilter = 'all' | 'pending' | 'completed';
export type AppTab = 'add' | 'list' | 'debug';
export type PrivacyMode = 'unshielded' | 'shielded';

export type ContractSnapshot = {
  contractState: CompactContractState;
  zswapChainState: ZswapChainState;
  ledgerParameters: LedgerParameters;
};

export type Task = {
  id: string;
  title: string;
  completed: boolean;
  dueDate: string | null;
  priority: Priority;
  category: string | null;
  tags: string[];
};

export type TaskListPayload = {
  version: 1;
  tasks: Task[];
};

export type StoredTaskTuple = [string, string, 0 | 1, string, 0 | 1 | 2, string, string];

export type TaskFormState = {
  title: string;
  dueDate: string;
  priority: Priority;
  category: string;
  tags: string;
};
