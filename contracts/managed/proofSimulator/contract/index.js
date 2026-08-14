import * as __compactRuntime from '@midnight-ntwrk/compact-runtime';
__compactRuntime.checkRuntimeVersion('0.16.0');

const _descriptor_0 = __compactRuntime.CompactTypeField;

const _descriptor_1 = new __compactRuntime.CompactTypeVector(131072, _descriptor_0);

const _descriptor_2 = new __compactRuntime.CompactTypeVector(262144, _descriptor_0);

const _descriptor_3 = new __compactRuntime.CompactTypeVector(32768, _descriptor_0);

const _descriptor_4 = new __compactRuntime.CompactTypeVector(65536, _descriptor_0);

const _descriptor_5 = new __compactRuntime.CompactTypeVector(8192, _descriptor_0);

const _descriptor_6 = new __compactRuntime.CompactTypeVector(16384, _descriptor_0);

const _descriptor_7 = new __compactRuntime.CompactTypeVector(2048, _descriptor_0);

const _descriptor_8 = new __compactRuntime.CompactTypeVector(4096, _descriptor_0);

const _descriptor_9 = new __compactRuntime.CompactTypeVector(512, _descriptor_0);

const _descriptor_10 = new __compactRuntime.CompactTypeVector(1024, _descriptor_0);

const _descriptor_11 = new __compactRuntime.CompactTypeVector(128, _descriptor_0);

const _descriptor_12 = new __compactRuntime.CompactTypeVector(256, _descriptor_0);

const _descriptor_13 = new __compactRuntime.CompactTypeVector(32, _descriptor_0);

const _descriptor_14 = new __compactRuntime.CompactTypeVector(64, _descriptor_0);

const _descriptor_15 = new __compactRuntime.CompactTypeVector(16, _descriptor_0);

const _descriptor_16 = new __compactRuntime.CompactTypeUnsignedInteger(18446744073709551615n, 8);

const _descriptor_17 = __compactRuntime.CompactTypeBoolean;

const _descriptor_18 = new __compactRuntime.CompactTypeBytes(32);

class _Either_0 {
  alignment() {
    return _descriptor_17.alignment().concat(_descriptor_18.alignment().concat(_descriptor_18.alignment()));
  }
  fromValue(value_0) {
    return {
      is_left: _descriptor_17.fromValue(value_0),
      left: _descriptor_18.fromValue(value_0),
      right: _descriptor_18.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_17.toValue(value_0.is_left).concat(_descriptor_18.toValue(value_0.left).concat(_descriptor_18.toValue(value_0.right)));
  }
}

const _descriptor_19 = new _Either_0();

const _descriptor_20 = new __compactRuntime.CompactTypeUnsignedInteger(340282366920938463463374607431768211455n, 16);

class _ContractAddress_0 {
  alignment() {
    return _descriptor_18.alignment();
  }
  fromValue(value_0) {
    return {
      bytes: _descriptor_18.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_18.toValue(value_0.bytes);
  }
}

const _descriptor_21 = new _ContractAddress_0();

const _descriptor_22 = new __compactRuntime.CompactTypeUnsignedInteger(255n, 1);

export class Contract {
  witnesses;
  constructor(...args_0) {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`Contract constructor: expected 1 argument, received ${args_0.length}`);
    }
    const witnesses_0 = args_0[0];
    if (typeof(witnesses_0) !== 'object') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor is not an object');
    }
    this.witnesses = witnesses_0;
    this.circuits = {
      probeK06: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`probeK06: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const seed_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('probeK06',
                                     'argument 1 (as invoked from Typescript)',
                                     'proofSimulator.compact line 16 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(Array.isArray(seed_0) && seed_0.length === 16 && seed_0.every((t) => typeof(t) === 'bigint' && t >= 0 && t <= __compactRuntime.MAX_FIELD))) {
          __compactRuntime.typeError('probeK06',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'proofSimulator.compact line 16 char 1',
                                     'Vector<16, Field>',
                                     seed_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_15.toValue(seed_0),
            alignment: _descriptor_15.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._probeK06_0(context, partialProofData, seed_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      probeK07: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`probeK07: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const seed_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('probeK07',
                                     'argument 1 (as invoked from Typescript)',
                                     'proofSimulator.compact line 20 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(Array.isArray(seed_0) && seed_0.length === 32 && seed_0.every((t) => typeof(t) === 'bigint' && t >= 0 && t <= __compactRuntime.MAX_FIELD))) {
          __compactRuntime.typeError('probeK07',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'proofSimulator.compact line 20 char 1',
                                     'Vector<32, Field>',
                                     seed_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_13.toValue(seed_0),
            alignment: _descriptor_13.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._probeK07_0(context, partialProofData, seed_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      probeK08: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`probeK08: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const seed_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('probeK08',
                                     'argument 1 (as invoked from Typescript)',
                                     'proofSimulator.compact line 24 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(Array.isArray(seed_0) && seed_0.length === 64 && seed_0.every((t) => typeof(t) === 'bigint' && t >= 0 && t <= __compactRuntime.MAX_FIELD))) {
          __compactRuntime.typeError('probeK08',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'proofSimulator.compact line 24 char 1',
                                     'Vector<64, Field>',
                                     seed_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_14.toValue(seed_0),
            alignment: _descriptor_14.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._probeK08_0(context, partialProofData, seed_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      probeK09: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`probeK09: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const seed_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('probeK09',
                                     'argument 1 (as invoked from Typescript)',
                                     'proofSimulator.compact line 28 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(Array.isArray(seed_0) && seed_0.length === 128 && seed_0.every((t) => typeof(t) === 'bigint' && t >= 0 && t <= __compactRuntime.MAX_FIELD))) {
          __compactRuntime.typeError('probeK09',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'proofSimulator.compact line 28 char 1',
                                     'Vector<128, Field>',
                                     seed_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_11.toValue(seed_0),
            alignment: _descriptor_11.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._probeK09_0(context, partialProofData, seed_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      probeK10: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`probeK10: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const seed_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('probeK10',
                                     'argument 1 (as invoked from Typescript)',
                                     'proofSimulator.compact line 32 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(Array.isArray(seed_0) && seed_0.length === 256 && seed_0.every((t) => typeof(t) === 'bigint' && t >= 0 && t <= __compactRuntime.MAX_FIELD))) {
          __compactRuntime.typeError('probeK10',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'proofSimulator.compact line 32 char 1',
                                     'Vector<256, Field>',
                                     seed_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_12.toValue(seed_0),
            alignment: _descriptor_12.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._probeK10_0(context, partialProofData, seed_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      probeK11: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`probeK11: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const seed_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('probeK11',
                                     'argument 1 (as invoked from Typescript)',
                                     'proofSimulator.compact line 36 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(Array.isArray(seed_0) && seed_0.length === 512 && seed_0.every((t) => typeof(t) === 'bigint' && t >= 0 && t <= __compactRuntime.MAX_FIELD))) {
          __compactRuntime.typeError('probeK11',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'proofSimulator.compact line 36 char 1',
                                     'Vector<512, Field>',
                                     seed_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_9.toValue(seed_0),
            alignment: _descriptor_9.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._probeK11_0(context, partialProofData, seed_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      probeK12: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`probeK12: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const seed_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('probeK12',
                                     'argument 1 (as invoked from Typescript)',
                                     'proofSimulator.compact line 40 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(Array.isArray(seed_0) && seed_0.length === 1024 && seed_0.every((t) => typeof(t) === 'bigint' && t >= 0 && t <= __compactRuntime.MAX_FIELD))) {
          __compactRuntime.typeError('probeK12',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'proofSimulator.compact line 40 char 1',
                                     'Vector<1024, Field>',
                                     seed_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_10.toValue(seed_0),
            alignment: _descriptor_10.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._probeK12_0(context, partialProofData, seed_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      probeK13: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`probeK13: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const seed_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('probeK13',
                                     'argument 1 (as invoked from Typescript)',
                                     'proofSimulator.compact line 44 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(Array.isArray(seed_0) && seed_0.length === 2048 && seed_0.every((t) => typeof(t) === 'bigint' && t >= 0 && t <= __compactRuntime.MAX_FIELD))) {
          __compactRuntime.typeError('probeK13',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'proofSimulator.compact line 44 char 1',
                                     'Vector<2048, Field>',
                                     seed_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_7.toValue(seed_0),
            alignment: _descriptor_7.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._probeK13_0(context, partialProofData, seed_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      probeK14: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`probeK14: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const seed_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('probeK14',
                                     'argument 1 (as invoked from Typescript)',
                                     'proofSimulator.compact line 48 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(Array.isArray(seed_0) && seed_0.length === 4096 && seed_0.every((t) => typeof(t) === 'bigint' && t >= 0 && t <= __compactRuntime.MAX_FIELD))) {
          __compactRuntime.typeError('probeK14',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'proofSimulator.compact line 48 char 1',
                                     'Vector<4096, Field>',
                                     seed_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_8.toValue(seed_0),
            alignment: _descriptor_8.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._probeK14_0(context, partialProofData, seed_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      probeK15: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`probeK15: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const seed_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('probeK15',
                                     'argument 1 (as invoked from Typescript)',
                                     'proofSimulator.compact line 52 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(Array.isArray(seed_0) && seed_0.length === 8192 && seed_0.every((t) => typeof(t) === 'bigint' && t >= 0 && t <= __compactRuntime.MAX_FIELD))) {
          __compactRuntime.typeError('probeK15',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'proofSimulator.compact line 52 char 1',
                                     'Vector<8192, Field>',
                                     seed_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_5.toValue(seed_0),
            alignment: _descriptor_5.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._probeK15_0(context, partialProofData, seed_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      probeK16: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`probeK16: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const seed_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('probeK16',
                                     'argument 1 (as invoked from Typescript)',
                                     'proofSimulator.compact line 56 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(Array.isArray(seed_0) && seed_0.length === 16384 && seed_0.every((t) => typeof(t) === 'bigint' && t >= 0 && t <= __compactRuntime.MAX_FIELD))) {
          __compactRuntime.typeError('probeK16',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'proofSimulator.compact line 56 char 1',
                                     'Vector<16384, Field>',
                                     seed_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_6.toValue(seed_0),
            alignment: _descriptor_6.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._probeK16_0(context, partialProofData, seed_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      probeK17: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`probeK17: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const seed_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('probeK17',
                                     'argument 1 (as invoked from Typescript)',
                                     'proofSimulator.compact line 60 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(Array.isArray(seed_0) && seed_0.length === 32768 && seed_0.every((t) => typeof(t) === 'bigint' && t >= 0 && t <= __compactRuntime.MAX_FIELD))) {
          __compactRuntime.typeError('probeK17',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'proofSimulator.compact line 60 char 1',
                                     'Vector<32768, Field>',
                                     seed_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_3.toValue(seed_0),
            alignment: _descriptor_3.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._probeK17_0(context, partialProofData, seed_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      probeK18: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`probeK18: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const seed_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('probeK18',
                                     'argument 1 (as invoked from Typescript)',
                                     'proofSimulator.compact line 64 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(Array.isArray(seed_0) && seed_0.length === 65536 && seed_0.every((t) => typeof(t) === 'bigint' && t >= 0 && t <= __compactRuntime.MAX_FIELD))) {
          __compactRuntime.typeError('probeK18',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'proofSimulator.compact line 64 char 1',
                                     'Vector<65536, Field>',
                                     seed_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_4.toValue(seed_0),
            alignment: _descriptor_4.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._probeK18_0(context, partialProofData, seed_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      probeK19: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`probeK19: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const seed_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('probeK19',
                                     'argument 1 (as invoked from Typescript)',
                                     'proofSimulator.compact line 68 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(Array.isArray(seed_0) && seed_0.length === 131072 && seed_0.every((t) => typeof(t) === 'bigint' && t >= 0 && t <= __compactRuntime.MAX_FIELD))) {
          __compactRuntime.typeError('probeK19',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'proofSimulator.compact line 68 char 1',
                                     'Vector<131072, Field>',
                                     seed_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_1.toValue(seed_0),
            alignment: _descriptor_1.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._probeK19_0(context, partialProofData, seed_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      probeK20: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`probeK20: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const seed_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('probeK20',
                                     'argument 1 (as invoked from Typescript)',
                                     'proofSimulator.compact line 72 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(Array.isArray(seed_0) && seed_0.length === 262144 && seed_0.every((t) => typeof(t) === 'bigint' && t >= 0 && t <= __compactRuntime.MAX_FIELD))) {
          __compactRuntime.typeError('probeK20',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'proofSimulator.compact line 72 char 1',
                                     'Vector<262144, Field>',
                                     seed_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_2.toValue(seed_0),
            alignment: _descriptor_2.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._probeK20_0(context, partialProofData, seed_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      }
    };
    this.impureCircuits = {
      probeK06: this.circuits.probeK06,
      probeK07: this.circuits.probeK07,
      probeK08: this.circuits.probeK08,
      probeK09: this.circuits.probeK09,
      probeK10: this.circuits.probeK10,
      probeK11: this.circuits.probeK11,
      probeK12: this.circuits.probeK12,
      probeK13: this.circuits.probeK13,
      probeK14: this.circuits.probeK14,
      probeK15: this.circuits.probeK15,
      probeK16: this.circuits.probeK16,
      probeK17: this.circuits.probeK17,
      probeK18: this.circuits.probeK18,
      probeK19: this.circuits.probeK19,
      probeK20: this.circuits.probeK20
    };
    this.provableCircuits = {
      probeK06: this.circuits.probeK06,
      probeK07: this.circuits.probeK07,
      probeK08: this.circuits.probeK08,
      probeK09: this.circuits.probeK09,
      probeK10: this.circuits.probeK10,
      probeK11: this.circuits.probeK11,
      probeK12: this.circuits.probeK12,
      probeK13: this.circuits.probeK13,
      probeK14: this.circuits.probeK14,
      probeK15: this.circuits.probeK15,
      probeK16: this.circuits.probeK16,
      probeK17: this.circuits.probeK17,
      probeK18: this.circuits.probeK18,
      probeK19: this.circuits.probeK19,
      probeK20: this.circuits.probeK20
    };
  }
  initialState(...args_0) {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const constructorContext_0 = args_0[0];
    if (typeof(constructorContext_0) !== 'object') {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'constructorContext' in argument 1 (as invoked from Typescript) to be an object`);
    }
    if (!('initialZswapLocalState' in constructorContext_0)) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript)`);
    }
    if (typeof(constructorContext_0.initialZswapLocalState) !== 'object') {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript) to be an object`);
    }
    const state_0 = new __compactRuntime.ContractState();
    let stateValue_0 = __compactRuntime.StateValue.newArray();
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    state_0.data = new __compactRuntime.ChargedState(stateValue_0);
    state_0.setOperation('probeK06', new __compactRuntime.ContractOperation());
    state_0.setOperation('probeK07', new __compactRuntime.ContractOperation());
    state_0.setOperation('probeK08', new __compactRuntime.ContractOperation());
    state_0.setOperation('probeK09', new __compactRuntime.ContractOperation());
    state_0.setOperation('probeK10', new __compactRuntime.ContractOperation());
    state_0.setOperation('probeK11', new __compactRuntime.ContractOperation());
    state_0.setOperation('probeK12', new __compactRuntime.ContractOperation());
    state_0.setOperation('probeK13', new __compactRuntime.ContractOperation());
    state_0.setOperation('probeK14', new __compactRuntime.ContractOperation());
    state_0.setOperation('probeK15', new __compactRuntime.ContractOperation());
    state_0.setOperation('probeK16', new __compactRuntime.ContractOperation());
    state_0.setOperation('probeK17', new __compactRuntime.ContractOperation());
    state_0.setOperation('probeK18', new __compactRuntime.ContractOperation());
    state_0.setOperation('probeK19', new __compactRuntime.ContractOperation());
    state_0.setOperation('probeK20', new __compactRuntime.ContractOperation());
    const context = __compactRuntime.createCircuitContext(__compactRuntime.dummyContractAddress(), constructorContext_0.initialZswapLocalState.coinPublicKey, state_0.data, constructorContext_0.initialPrivateState);
    const partialProofData = {
      input: { value: [], alignment: [] },
      output: undefined,
      publicTranscript: [],
      privateTranscriptOutputs: []
    };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_22.toValue(0n),
                                                                                              alignment: _descriptor_22.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(0n),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    const tmp_0 = 0n;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_22.toValue(0n),
                                                                                              alignment: _descriptor_22.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    state_0.data = new __compactRuntime.ChargedState(context.currentQueryContext.state.state);
    return {
      currentContractState: state_0,
      currentPrivateState: context.currentPrivateState,
      currentZswapLocalState: context.currentZswapLocalState
    }
  }
  _mix_0(accumulator_0, value_0) {
    return __compactRuntime.addField(__compactRuntime.mulField(accumulator_0,
                                                               accumulator_0),
                                     value_0);
  }
  _probeK06_0(context, partialProofData, seed_0) {
    const tmp_0 = this._folder_0((...args_0) => this._mix_0(...args_0),
                                 0n,
                                 seed_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_22.toValue(0n),
                                                                                              alignment: _descriptor_22.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    return [];
  }
  _probeK07_0(context, partialProofData, seed_0) {
    const tmp_0 = this._folder_1((...args_0) => this._mix_0(...args_0),
                                 0n,
                                 seed_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_22.toValue(0n),
                                                                                              alignment: _descriptor_22.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    return [];
  }
  _probeK08_0(context, partialProofData, seed_0) {
    const tmp_0 = this._folder_2((...args_0) => this._mix_0(...args_0),
                                 0n,
                                 seed_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_22.toValue(0n),
                                                                                              alignment: _descriptor_22.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    return [];
  }
  _probeK09_0(context, partialProofData, seed_0) {
    const tmp_0 = this._folder_3((...args_0) => this._mix_0(...args_0),
                                 0n,
                                 seed_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_22.toValue(0n),
                                                                                              alignment: _descriptor_22.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    return [];
  }
  _probeK10_0(context, partialProofData, seed_0) {
    const tmp_0 = this._folder_4((...args_0) => this._mix_0(...args_0),
                                 0n,
                                 seed_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_22.toValue(0n),
                                                                                              alignment: _descriptor_22.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    return [];
  }
  _probeK11_0(context, partialProofData, seed_0) {
    const tmp_0 = this._folder_5((...args_0) => this._mix_0(...args_0),
                                 0n,
                                 seed_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_22.toValue(0n),
                                                                                              alignment: _descriptor_22.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    return [];
  }
  _probeK12_0(context, partialProofData, seed_0) {
    const tmp_0 = this._folder_6((...args_0) => this._mix_0(...args_0),
                                 0n,
                                 seed_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_22.toValue(0n),
                                                                                              alignment: _descriptor_22.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    return [];
  }
  _probeK13_0(context, partialProofData, seed_0) {
    const tmp_0 = this._folder_7((...args_0) => this._mix_0(...args_0),
                                 0n,
                                 seed_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_22.toValue(0n),
                                                                                              alignment: _descriptor_22.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    return [];
  }
  _probeK14_0(context, partialProofData, seed_0) {
    const tmp_0 = this._folder_8((...args_0) => this._mix_0(...args_0),
                                 0n,
                                 seed_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_22.toValue(0n),
                                                                                              alignment: _descriptor_22.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    return [];
  }
  _probeK15_0(context, partialProofData, seed_0) {
    const tmp_0 = this._folder_9((...args_0) => this._mix_0(...args_0),
                                 0n,
                                 seed_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_22.toValue(0n),
                                                                                              alignment: _descriptor_22.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    return [];
  }
  _probeK16_0(context, partialProofData, seed_0) {
    const tmp_0 = this._folder_10((...args_0) => this._mix_0(...args_0),
                                  0n,
                                  seed_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_22.toValue(0n),
                                                                                              alignment: _descriptor_22.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    return [];
  }
  _probeK17_0(context, partialProofData, seed_0) {
    const tmp_0 = this._folder_11((...args_0) => this._mix_0(...args_0),
                                  0n,
                                  seed_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_22.toValue(0n),
                                                                                              alignment: _descriptor_22.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    return [];
  }
  _probeK18_0(context, partialProofData, seed_0) {
    const tmp_0 = this._folder_12((...args_0) => this._mix_0(...args_0),
                                  0n,
                                  seed_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_22.toValue(0n),
                                                                                              alignment: _descriptor_22.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    return [];
  }
  _probeK19_0(context, partialProofData, seed_0) {
    const tmp_0 = this._folder_13((...args_0) => this._mix_0(...args_0),
                                  0n,
                                  seed_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_22.toValue(0n),
                                                                                              alignment: _descriptor_22.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    return [];
  }
  _probeK20_0(context, partialProofData, seed_0) {
    const tmp_0 = this._folder_14((...args_0) => this._mix_0(...args_0),
                                  0n,
                                  seed_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_22.toValue(0n),
                                                                                              alignment: _descriptor_22.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    return [];
  }
  _folder_0(f, x, a0) {
    for (let i = 0; i < 16; i++) { x = f(x, a0[i]); }
    return x;
  }
  _folder_1(f, x, a0) {
    for (let i = 0; i < 32; i++) { x = f(x, a0[i]); }
    return x;
  }
  _folder_2(f, x, a0) {
    for (let i = 0; i < 64; i++) { x = f(x, a0[i]); }
    return x;
  }
  _folder_3(f, x, a0) {
    for (let i = 0; i < 128; i++) { x = f(x, a0[i]); }
    return x;
  }
  _folder_4(f, x, a0) {
    for (let i = 0; i < 256; i++) { x = f(x, a0[i]); }
    return x;
  }
  _folder_5(f, x, a0) {
    for (let i = 0; i < 512; i++) { x = f(x, a0[i]); }
    return x;
  }
  _folder_6(f, x, a0) {
    for (let i = 0; i < 1024; i++) { x = f(x, a0[i]); }
    return x;
  }
  _folder_7(f, x, a0) {
    for (let i = 0; i < 2048; i++) { x = f(x, a0[i]); }
    return x;
  }
  _folder_8(f, x, a0) {
    for (let i = 0; i < 4096; i++) { x = f(x, a0[i]); }
    return x;
  }
  _folder_9(f, x, a0) {
    for (let i = 0; i < 8192; i++) { x = f(x, a0[i]); }
    return x;
  }
  _folder_10(f, x, a0) {
    for (let i = 0; i < 16384; i++) { x = f(x, a0[i]); }
    return x;
  }
  _folder_11(f, x, a0) {
    for (let i = 0; i < 32768; i++) { x = f(x, a0[i]); }
    return x;
  }
  _folder_12(f, x, a0) {
    for (let i = 0; i < 65536; i++) { x = f(x, a0[i]); }
    return x;
  }
  _folder_13(f, x, a0) {
    for (let i = 0; i < 131072; i++) { x = f(x, a0[i]); }
    return x;
  }
  _folder_14(f, x, a0) {
    for (let i = 0; i < 262144; i++) { x = f(x, a0[i]); }
    return x;
  }
}
export function ledger(stateOrChargedState) {
  const state = stateOrChargedState instanceof __compactRuntime.StateValue ? stateOrChargedState : stateOrChargedState.state;
  const chargedState = stateOrChargedState instanceof __compactRuntime.StateValue ? new __compactRuntime.ChargedState(stateOrChargedState) : stateOrChargedState;
  const context = {
    currentQueryContext: new __compactRuntime.QueryContext(chargedState, __compactRuntime.dummyContractAddress()),
    costModel: __compactRuntime.CostModel.initialCostModel()
  };
  const partialProofData = {
    input: { value: [], alignment: [] },
    output: undefined,
    publicTranscript: [],
    privateTranscriptOutputs: []
  };
  return {
    get lastValue() {
      return _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_22.toValue(0n),
                                                                                                   alignment: _descriptor_22.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
    }
  };
}
const _emptyContext = {
  currentQueryContext: new __compactRuntime.QueryContext(new __compactRuntime.ContractState().data, __compactRuntime.dummyContractAddress())
};
const _dummyContract = new Contract({ });
export const pureCircuits = {};
export const contractReferenceLocations =
  { tag: 'publicLedgerArray', indices: { } };
//# sourceMappingURL=index.js.map
