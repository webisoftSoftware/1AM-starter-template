import * as CompiledContract from '@midnight-ntwrk/compact-js/effect/CompiledContract';
import {
  Contract as ProofSimulatorContract,
  ledger as proofSimulatorLedger,
} from '../contracts/managed/proofSimulator/contract/index.js';
import { APP_CONFIG } from './config';

const proofSimulatorContractBase = CompiledContract.make(
  'proofSimulator',
  ProofSimulatorContract as any,
) as any;

export const compiledProofSimulatorContract = CompiledContract.withCompiledFileAssets(
  CompiledContract.withVacantWitnesses(proofSimulatorContractBase),
  APP_CONFIG.zkProofSimulatorAssetBasePath as never,
) as any;

export { proofSimulatorLedger };
