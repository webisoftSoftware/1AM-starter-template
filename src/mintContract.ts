import * as CompiledContract from '@midnight-ntwrk/compact-js/effect/CompiledContract';
import {
  Contract as ShieldedMintContract,
  ledger as mintLedger,
} from '../contracts/managed/shieldedMint/contract/index.js';
import { APP_CONFIG } from './config';

export const compiledShieldedMintContract = CompiledContract.withVacantWitnesses(
  CompiledContract.withCompiledFileAssets(
    CompiledContract.make('shieldedMint', ShieldedMintContract),
    APP_CONFIG.zkMintAssetBasePath,
  ),
);

export { mintLedger };
