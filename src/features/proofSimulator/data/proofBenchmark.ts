import type {
  ProofBenchmarkRun,
  ProofBenchmarkSample,
  ProofBenchmarkSummary,
  ProofDistribution,
} from '../types';

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function proofSampleLatency(sample: ProofBenchmarkSample, run: ProofBenchmarkRun): number | undefined {
  return run.timingProfile === 'proof-only' ? sample.proveTxMs : sample.endToEndMs;
}

export function distribution(values: number[]): ProofDistribution | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const meanMs = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const variance = sorted.reduce((sum, value) => sum + (value - meanMs) ** 2, 0) / sorted.length;
  return {
    count: sorted.length,
    minMs: sorted[0],
    medianMs: percentile(sorted, 0.5),
    meanMs,
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted[sorted.length - 1],
    standardDeviationMs: Math.sqrt(variance),
  };
}

export function summarizeProofRun(run: ProofBenchmarkRun | null): ProofBenchmarkSummary | null {
  if (!run) return null;
  const measured = run.samples.filter(
    (sample) => !sample.warmup && (sample.status === 'passed' || sample.status === 'failed'),
  );
  const passed = measured.filter((sample) => sample.status === 'passed');
  const proofSizes = passed.flatMap((sample) => sample.proofBytes === undefined ? [] : [sample.proofBytes]);
  const latencies = passed.flatMap((sample) => {
    const latency = proofSampleLatency(sample, run);
    return latency === undefined ? [] : [latency];
  });
  const elapsedMs = run.measuredElapsedMs ?? 0;
  return {
    attempted: measured.length,
    passed: passed.length,
    failed: measured.length - passed.length,
    successRate: measured.length === 0 ? 0 : passed.length / measured.length,
    throughputPerMinute: elapsedMs > 0 ? passed.length * 60_000 / elapsedMs : 0,
    averageProofBytes: proofSizes.length > 0
      ? proofSizes.reduce((sum, value) => sum + value, 0) / proofSizes.length
      : undefined,
    latency: distribution(latencies),
  };
}
