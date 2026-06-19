import * as CompiledContract from '@midnight-ntwrk/compact-js/effect/CompiledContract';
import {
  Contract as LeaderboardContract,
  ledger as leaderboardLedger,
  type Witnesses,
} from '../contracts/managed/leaderboard/contract/index.js';
import { APP_CONFIG } from './config';

export type LeaderboardPrivateState = {
  readonly secretKey: Uint8Array;
};

export const LEADERBOARD_PRIVATE_STATE_ID = 'leaderboardPrivateState' as const;

let customName = new Uint8Array(32);

export function createLeaderboardPrivateState(secretKey: Uint8Array): LeaderboardPrivateState {
  return { secretKey };
}

export function setLeaderboardCustomName(name: string): void {
  customName = new Uint8Array(32);
  customName.set(new TextEncoder().encode(name).slice(0, 32));
}

function createWitnesses(): Witnesses<LeaderboardPrivateState> {
  return {
    localSecretKey: ({ privateState }) => [privateState, privateState.secretKey],
    getCustomName: ({ privateState }) => [privateState, customName],
  };
}

const leaderboardContractBase = CompiledContract.make(
  'leaderboard',
  LeaderboardContract as any,
) as any;

const leaderboardContractWithWitnesses = CompiledContract.withWitnesses(
  leaderboardContractBase as never,
  createWitnesses() as never,
) as never;

export const compiledLeaderboardContract = CompiledContract.withCompiledFileAssets(
  leaderboardContractWithWitnesses,
  APP_CONFIG.zkLeaderboardAssetBasePath as never,
) as any;

export { leaderboardLedger };
