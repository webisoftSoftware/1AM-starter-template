import * as CompiledContract from '@midnight-ntwrk/compact-js/effect/CompiledContract';
import {
  Contract as ShieldedDepositOnlyContract,
  ledger as depositOnlyLedger,
} from '../contracts/managed/shieldedDepositOnly/contract/index.js';
import {
  Contract as ShieldedMintDepositContract,
  ledger as mintDepositLedger,
} from '../contracts/managed/shieldedMintDeposit/contract/index.js';
import { APP_CONFIG } from './config';

export const compiledShieldedMintDepositContract = CompiledContract.withVacantWitnesses(
  CompiledContract.withCompiledFileAssets(
    CompiledContract.make('shieldedMintDeposit', ShieldedMintDepositContract),
    APP_CONFIG.zkMintDepositAssetBasePath,
  ),
);

export const compiledShieldedDepositOnlyContract = CompiledContract.withVacantWitnesses(
  CompiledContract.withCompiledFileAssets(
    CompiledContract.make('shieldedDepositOnly', ShieldedDepositOnlyContract),
    APP_CONFIG.zkDepositOnlyAssetBasePath,
  ),
);

export { depositOnlyLedger, mintDepositLedger };
