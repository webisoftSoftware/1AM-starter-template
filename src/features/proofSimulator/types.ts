import type { ProofSimulatorCircuitKey } from '../../midnight';

export type WalletStatus = 'checking' | 'detected' | 'not-found';
export type ProofRunStatus = 'idle' | 'running' | 'passed' | 'failed';
export type ProofSimulatorMode = 'quick' | 'benchmark' | 'load';
export type ProofTimingProfile = 'proof-only' | 'end-to-end';

export type ArtifactMetadata = {
  bytes: number;
  sha256: string;
};

export type ProofCircuitManifest = {
  circuitId: ProofSimulatorCircuitKey;
  targetK: number;
  actualK: number;
  rows: number;
  inputLength: number;
  artifacts?: {
    prover: ArtifactMetadata;
    verifier: ArtifactMetadata;
    zkir: ArtifactMetadata;
  };
};

export type ProofSimulatorManifest = {
  generatedAt: string;
  compilerVersion: string;
  languageVersion: string;
  runtimeVersion: string;
  minK: number;
  maxK: number;
  complete: boolean;
  circuits: ProofCircuitManifest[];
};

export type ProofRunResult = {
  circuitId: ProofSimulatorCircuitKey;
  k: number;
  status: ProofRunStatus;
  providerRoundTripMs?: number;
  proofBytes?: number;
  buildAndProveMs?: number;
  timestamp?: string;
  error?: string;
};

export type ProofBenchmarkSample = {
  sample: number;
  circuitId: ProofSimulatorCircuitKey;
  k: number;
  warmup: boolean;
  status: 'queued' | 'running' | 'passed' | 'failed';
  batch?: number;
  slot?: number;
  proveTxMs?: number;
  providerRoundTripMs?: number;
  endToEndMs?: number;
  proofBytes?: number;
  timestamp: string;
  error?: string;
};

export type ProofBenchmarkRun = {
  id: string;
  mode: Exclude<ProofSimulatorMode, 'quick'>;
  status: 'running' | 'completed' | 'stopped' | 'failed';
  timingProfile: ProofTimingProfile;
  circuitKs: number[];
  warmups: number;
  iterations: number;
  concurrency: number;
  startedAt: string;
  finishedAt?: string;
  measuredElapsedMs?: number;
  samples: ProofBenchmarkSample[];
};

export type ProofDistribution = {
  count: number;
  minMs: number;
  medianMs: number;
  meanMs: number;
  p95Ms: number;
  maxMs: number;
  standardDeviationMs: number;
};

export type ProofBenchmarkSummary = {
  attempted: number;
  passed: number;
  failed: number;
  successRate: number;
  throughputPerMinute: number;
  averageProofBytes?: number;
  latency?: ProofDistribution;
};
