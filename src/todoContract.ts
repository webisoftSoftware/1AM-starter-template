import * as CompiledContract from '@midnight-ntwrk/compact-js/effect/CompiledContract';
import { Contract as TodoContract, ledger as todoLedger } from '../contracts/managed/todo/contract/index.js';
import { APP_CONFIG } from './config';

export const compiledTodoContract = CompiledContract.withVacantWitnesses(
  CompiledContract.withCompiledFileAssets(CompiledContract.make('todo', TodoContract), APP_CONFIG.zkTodoAssetBasePath),
);

export { todoLedger };
