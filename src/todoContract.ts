import * as CompiledContract from '@midnight-ntwrk/compact-js/effect/CompiledContract';
import { Contract as TodoContract, ledger as todoLedger } from '../contracts/managed/todo/contract/index.js';

export const compiledTodoContract = CompiledContract.withVacantWitnesses(
  CompiledContract.withCompiledFileAssets(CompiledContract.make('todo', TodoContract), '/zk/todo'),
);

export { todoLedger };
