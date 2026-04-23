import * as CompiledContract from '@midnight-ntwrk/compact-js/effect/CompiledContract';
import { Contract as ShieldedTodoContract } from '../contracts/managed/shieldedTodo/contract/index.js';

export const compiledShieldedTodoContract = CompiledContract.withVacantWitnesses(
  CompiledContract.withCompiledFileAssets(CompiledContract.make('shieldedTodo', ShieldedTodoContract), '/zk/shieldedTodo'),
);
