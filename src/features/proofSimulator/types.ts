import type { ProofSimulatorCircuitKey } from '../../midnight';

export type WalletStatus = 'checking' | 'detected' | 'not-found';
export type ProofRunStatus = 'idle' | 'running' | 'passed' | 'failed';

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
  proofDurationMs?: number;
  proofBytes?: number;
  totalDurationMs?: number;
  timestamp?: string;
  error?: string;
};
