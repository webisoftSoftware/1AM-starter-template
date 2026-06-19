import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
}

export type ImpureCircuits<PS> = {
  depositShielded(context: __compactRuntime.CircuitContext<PS>,
                  coin_0: { nonce: Uint8Array, color: Uint8Array, value: bigint
                          }): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  depositShielded(context: __compactRuntime.CircuitContext<PS>,
                  coin_0: { nonce: Uint8Array, color: Uint8Array, value: bigint
                          }): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  depositShielded(context: __compactRuntime.CircuitContext<PS>,
                  coin_0: { nonce: Uint8Array, color: Uint8Array, value: bigint
                          }): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly sourceContract: { bytes: Uint8Array };
  readonly totalDeposited: bigint;
  readonly depositCount: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               sourceContractAddress_0: { bytes: Uint8Array }): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
