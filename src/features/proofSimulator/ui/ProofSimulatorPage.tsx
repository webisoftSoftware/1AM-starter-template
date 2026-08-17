import { Fragment } from 'react';
import type { OneAmSession } from '../../../oneAm';
import { proofSampleLatency, summarizeProofRun } from '../data/proofBenchmark';
import type { ProofSimulatorMode, WalletStatus } from '../types';
import { useProofSimulator } from '../hooks/useProofSimulator';

type ProofSimulatorPageProps = {
  oneAmSession: OneAmSession | null;
  walletStatus: WalletStatus;
  statusText: string;
  connectWallet: () => void;
};

const MODE_LABELS: Array<{ id: ProofSimulatorMode; label: string; description: string }> = [
  { id: 'quick', label: 'Quick test', description: 'One proof per tier' },
  { id: 'benchmark', label: 'Benchmark', description: 'Repeat and compare' },
  { id: 'load', label: 'Concurrent load', description: 'Measure throughput' },
];

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function formatDuration(milliseconds: number | undefined): string {
  if (milliseconds === undefined) return '—';
  if (milliseconds < 1000) return `${milliseconds.toFixed(0)} ms`;
  return `${(milliseconds / 1000).toFixed(2)} s`;
}

function formatRate(rate: number | undefined): string {
  if (rate === undefined || !Number.isFinite(rate)) return '—';
  return `${rate.toFixed(1)}/min`;
}

export default function ProofSimulatorPage(props: ProofSimulatorPageProps) {
  const simulator = useProofSimulator(props);
  const isRunning = simulator.busyAction === 'run';
  const isBusy = simulator.busyAction !== null;
  const summary = summarizeProofRun(simulator.benchmarkRun);
  const measuredSamples = simulator.benchmarkRun?.samples.filter(
    (sample) => !sample.warmup && (sample.status === 'passed' || sample.status === 'failed'),
  ) ?? [];
  const runProgress = simulator.benchmarkRun
    ? `${measuredSamples.length}/${simulator.benchmarkRun.iterations}`
    : '0/0';

  const tierOptions = simulator.manifest?.circuits.map((circuit) => (
    <option key={circuit.circuitId} value={circuit.actualK}>
      k={circuit.actualK}{circuit.actualK > 17 ? ' · experimental' : ''}
    </option>
  ));

  return (
    <section className="dapp-panel proof-simulator" aria-label="Proof Simulator">
      <header className="proof-simulator-header">
        <div>
          <p className="eyebrow">Proof diagnostics</p>
          <h2>Proof Simulator</h2>
          <p>Real 1AM proofs, never balanced or broadcast.</p>
        </div>
        {!simulator.session && props.walletStatus === 'detected' && (
          <button type="button" className="button-primary" onClick={props.connectWallet}>
            Connect 1AM
          </button>
        )}
      </header>

      <section className="proof-simulator-controls">
        <div className="proof-contract-card">
          <label htmlFor="proof-harness-address">Harness contract</label>
          <input
            id="proof-harness-address"
            value={simulator.addressInput}
            onChange={(event) => simulator.setAddressInput(event.target.value)}
            placeholder="64-character contract address"
            spellCheck={false}
            disabled={!simulator.session || isBusy}
          />
          <span className={simulator.snapshotReady ? 'proof-ready' : 'proof-not-ready'}>
            {simulator.snapshotReady ? 'Ready' : simulator.contractAddress ? 'Not loaded' : 'No harness'}
          </span>
        </div>
        <div className="proof-action-row">
          <button
            type="button"
            className="button-primary"
            onClick={simulator.loadAddress}
            disabled={!simulator.session || !simulator.addressInput || isBusy}
          >
            Load
          </button>
          <button type="button" className="button-secondary" onClick={simulator.deploy} disabled={!simulator.session || isBusy}>
            {simulator.busyAction === 'deploy' ? 'Deploying...' : 'Deploy new'}
          </button>
          {simulator.defaultContractAddress && simulator.addressInput !== simulator.defaultContractAddress && (
            <button type="button" onClick={simulator.useDefaultContract} disabled={isBusy}>Use default</button>
          )}
        </div>
      </section>

      <div className="proof-mode-tabs" role="tablist" aria-label="Simulator mode">
        {MODE_LABELS.map((mode) => (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={simulator.mode === mode.id}
            className={simulator.mode === mode.id ? 'proof-mode-tab proof-mode-tab-active' : 'proof-mode-tab'}
            onClick={() => simulator.setMode(mode.id)}
            disabled={isRunning}
          >
            <strong>{mode.label}</strong>
            <span>{mode.description}</span>
          </button>
        ))}
      </div>

      <div className="proof-run-feedback" aria-live="polite">
        <p className="feedback">{simulator.feedback}</p>
        {simulator.copyFeedback && <span className="proof-copy-feedback">{simulator.copyFeedback}</span>}
        {simulator.error && <p className="error">{simulator.error}</p>}
      </div>

      {simulator.mode === 'quick' && simulator.manifest && (
        <div role="tabpanel" className="proof-mode-panel">
          <section className="proof-range-panel">
            <div className="proof-range-fields">
              <label>Start k<select value={simulator.rangeStart} onChange={(event) => simulator.setRangeStart(Number(event.target.value))} disabled={isRunning}>{tierOptions}</select></label>
              <label>End k<select value={simulator.rangeEnd} onChange={(event) => simulator.setRangeEnd(Number(event.target.value))} disabled={isRunning}>{tierOptions}</select></label>
            </div>
            <div className="proof-action-row">
              <button type="button" className="button-primary" onClick={simulator.runSelected} disabled={!simulator.snapshotReady || isRunning || simulator.selectedCircuits.length === 0}>
                {isRunning ? 'Running...' : `Run ${simulator.selectedCircuits.length} proof${simulator.selectedCircuits.length === 1 ? '' : 's'}`}
              </button>
              <button type="button" onClick={simulator.requestStop} disabled={!isRunning}>Stop after current</button>
              <button type="button" onClick={simulator.clearResults} disabled={isRunning}>Clear</button>
              <button type="button" onClick={simulator.copyResults} disabled={isRunning}>Copy JSON</button>
            </div>
          </section>

          <div className="proof-table-wrap">
            <table className="proof-table">
              <thead><tr><th>k</th><th>Rows</th><th>Prover key</th><th>Status</th><th title="The complete 1AM proving-provider call, including wallet and transport overhead.">Provider round trip</th><th>Proof bytes</th><th title="Unproven transaction construction, checking, and proving.">Build + prove</th><th></th></tr></thead>
              <tbody>
                {simulator.manifest.circuits.map((circuit) => {
                  const result = simulator.results[circuit.circuitId];
                  const status = result?.status ?? 'idle';
                  return (
                    <tr key={circuit.circuitId} className={circuit.actualK > 17 ? 'proof-tier-experimental' : undefined}>
                      <td data-label="Tier"><strong>k={circuit.actualK}</strong>{circuit.actualK > 17 && <span className="proof-experimental">Experimental · expected to fail</span>}</td>
                      <td data-label="Rows">{circuit.rows.toLocaleString()}</td>
                      <td data-label="Prover key">{formatBytes(circuit.artifacts?.prover.bytes)}</td>
                      <td data-label="Status"><span className={`proof-status proof-status-${status}`}>{status}</span></td>
                      <td data-label="Provider round trip">{formatDuration(result?.providerRoundTripMs)}</td>
                      <td data-label="Proof size">{formatBytes(result?.proofBytes)}</td>
                      <td data-label="Build + prove">{formatDuration(result?.buildAndProveMs)}</td>
                      <td data-label="Action"><button type="button" onClick={() => simulator.runOne(circuit)} disabled={!simulator.snapshotReady || isRunning}>{result ? 'Rerun' : 'Run'}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {simulator.manifest.circuits.map((circuit) => {
              const result = simulator.results[circuit.circuitId];
              return result?.error ? <pre key={`${circuit.circuitId}-error`} className="proof-error-detail">k={circuit.actualK}: {result.error}</pre> : null;
            })}
          </div>
        </div>
      )}

      {simulator.mode === 'benchmark' && simulator.manifest && (
        <div role="tabpanel" className="proof-mode-panel">
          <section className="proof-benchmark-controls">
            <div className="proof-field-grid">
              <label>Tier<select value={simulator.benchmarkK} onChange={(event) => simulator.setBenchmarkK(Number(event.target.value))} disabled={isRunning}>{tierOptions}</select></label>
              <label>Warmups<input type="number" min="0" max="5" value={simulator.warmups} onChange={(event) => simulator.setWarmups(Math.max(0, Math.min(5, Number(event.target.value))))} disabled={isRunning} /></label>
              <label>Samples<input type="number" min="1" max="25" value={simulator.iterations} onChange={(event) => simulator.setIterations(Math.max(1, Math.min(25, Number(event.target.value))))} disabled={isRunning} /></label>
              <label>Timing<select value={simulator.timingProfile} onChange={(event) => simulator.setTimingProfile(event.target.value as 'proof-only' | 'end-to-end')} disabled={isRunning}><option value="proof-only">Proof only</option><option value="end-to-end">Build + proof</option></select></label>
            </div>
            <p className="proof-inline-note">Warmups are excluded. Proof only prepares fresh transactions before timing.</p>
            <div className="proof-action-row">
              <button type="button" className="button-primary" onClick={simulator.runBenchmark} disabled={!simulator.snapshotReady || isRunning}>{isRunning ? `Running ${runProgress}` : 'Run benchmark'}</button>
              <button type="button" onClick={simulator.requestStop} disabled={!isRunning}>Stop after current</button>
              <button type="button" onClick={simulator.clearBenchmark} disabled={isRunning || !simulator.benchmarkRun}>Clear</button>
              <button type="button" onClick={simulator.copyResults} disabled={isRunning || !simulator.benchmarkRun}>Copy JSON</button>
            </div>
          </section>
          {simulator.benchmarkRun?.mode === 'benchmark' && summary && <PerformanceResults run={simulator.benchmarkRun} summary={summary} />}
        </div>
      )}

      {simulator.mode === 'load' && simulator.manifest && (
        <div role="tabpanel" className="proof-mode-panel">
          <section className="proof-benchmark-controls">
            <div className="proof-field-grid proof-load-fields">
              <label>Workload<select value={simulator.loadWorkload} onChange={(event) => simulator.setLoadWorkload(event.target.value as 'single' | 'mixed')} disabled={isRunning}><option value="single">Single tier</option><option value="mixed">Mixed range</option></select></label>
              {simulator.loadWorkload === 'single' ? (
                <label>Tier<select value={simulator.loadK} onChange={(event) => simulator.setLoadK(Number(event.target.value))} disabled={isRunning}>{tierOptions}</select></label>
              ) : (
                <><label>Start k<select value={simulator.loadRangeStart} onChange={(event) => simulator.setLoadRangeStart(Number(event.target.value))} disabled={isRunning}>{tierOptions}</select></label><label>End k<select value={simulator.loadRangeEnd} onChange={(event) => simulator.setLoadRangeEnd(Number(event.target.value))} disabled={isRunning}>{tierOptions}</select></label></>
              )}
              <label>Requests<input type="number" min="1" max="40" value={simulator.loadRequests} onChange={(event) => simulator.setLoadRequests(Math.max(1, Math.min(40, Number(event.target.value))))} disabled={isRunning} /></label>
              <label>Concurrency<select value={simulator.concurrency} onChange={(event) => simulator.setConcurrency(Number(event.target.value))} disabled={isRunning}>{[1, 2, 4, 8].map((value) => <option key={value} value={value}>{value}{value === 8 ? ' · advanced' : ''}</option>)}</select></label>
              <label>Warmups<input type="number" min="0" max="5" value={simulator.warmups} onChange={(event) => simulator.setWarmups(Math.max(0, Math.min(5, Number(event.target.value))))} disabled={isRunning} /></label>
              <label>Timing<select value={simulator.timingProfile} onChange={(event) => simulator.setTimingProfile(event.target.value as 'proof-only' | 'end-to-end')} disabled={isRunning}><option value="proof-only">Proof only</option><option value="end-to-end">Build + proof</option></select></label>
            </div>
            <p className="proof-inline-note">Concurrent load emulates several transactions competing for a prover—not multiple proofs in one transaction.</p>
            <div className="proof-action-row">
              <button type="button" className="button-primary" onClick={simulator.runLoadTest} disabled={!simulator.snapshotReady || isRunning || simulator.loadCircuits.length === 0}>{isRunning ? `Running ${runProgress}` : `Run ${simulator.loadRequests} requests`}</button>
              <button type="button" onClick={simulator.requestStop} disabled={!isRunning}>Stop scheduling</button>
              <button type="button" onClick={simulator.clearBenchmark} disabled={isRunning || !simulator.benchmarkRun}>Clear</button>
              <button type="button" onClick={simulator.copyResults} disabled={isRunning || !simulator.benchmarkRun}>Copy JSON</button>
            </div>
          </section>
          {simulator.benchmarkRun?.mode === 'load' && summary && <PerformanceResults run={simulator.benchmarkRun} summary={summary} />}
        </div>
      )}

    </section>
  );
}

function PerformanceResults({ run, summary }: {
  run: NonNullable<ReturnType<typeof useProofSimulator>['benchmarkRun']>;
  summary: NonNullable<ReturnType<typeof summarizeProofRun>>;
}) {
  const measuredSamples = run.samples.filter((sample) => !sample.warmup);
  return (
    <section className="proof-results" aria-live="polite">
      <div className="proof-results-heading">
        <div><span className={`proof-status proof-status-${run.status === 'completed' ? 'passed' : run.status === 'running' ? 'running' : run.status === 'failed' ? 'failed' : 'idle'}`}>{run.status}</span><strong>{run.circuitKs.length === 1 ? `k=${run.circuitKs[0]}` : `Mixed k=${run.circuitKs[0]}–${run.circuitKs[run.circuitKs.length - 1]}`}</strong></div>
        <span>{run.timingProfile === 'proof-only' ? 'Proof only' : 'Build + proof'} · concurrency {run.concurrency}</span>
      </div>
      <div className="proof-stat-grid">
        <Stat label="Median" value={formatDuration(summary.latency?.medianMs)} />
        <Stat label="P95" value={formatDuration(summary.latency?.p95Ms)} />
        <Stat label="Mean" value={formatDuration(summary.latency?.meanMs)} />
        <Stat label="Throughput" value={formatRate(summary.throughputPerMinute)} />
        <Stat label="Success" value={`${summary.passed}/${summary.attempted}`} />
        <Stat label="Avg proof" value={formatBytes(summary.averageProofBytes)} />
      </div>
      {summary.latency && <p className="proof-distribution-line">Min {formatDuration(summary.latency.minMs)} · Max {formatDuration(summary.latency.maxMs)} · Std dev {formatDuration(summary.latency.standardDeviationMs)}</p>}
      {run.samples.length > 0 && (
        <div className="proof-table-wrap">
          <table className="proof-table proof-sample-table">
            <thead><tr><th>Sample</th><th>k</th><th>Status</th><th>Latency</th><th>Provider</th><th>Proof bytes</th></tr></thead>
            <tbody>
              {run.samples.map((sample, index) => {
                const previousSample = run.samples[index - 1];
                const startsBatch = run.mode === 'load' && sample.batch !== undefined && sample.batch !== previousSample?.batch;
                const batchSize = startsBatch
                  ? run.samples.filter((candidate) => !candidate.warmup && candidate.batch === sample.batch).length
                  : 0;
                return (
                  <Fragment key={`${sample.warmup ? 'warmup' : 'sample'}-${sample.sample}-${index}`}>
                    {startsBatch && (
                      <tr className="proof-sample-group">
                        <td colSpan={6}>Batch {sample.batch} <span>{batchSize} request{batchSize === 1 ? '' : 's'} launched together</span></td>
                      </tr>
                    )}
                    <tr className={sample.batch && sample.batch % 2 === 0 ? 'proof-batch-even' : undefined}>
                      <td data-label="Sample">{sample.warmup ? `Warmup ${sample.sample}` : `#${sample.sample}${sample.slot ? ` · slot ${sample.slot}` : ''}`}</td>
                      <td data-label="Tier">k={sample.k}</td>
                      <td data-label="Status"><span className={`proof-status proof-status-${sample.status}`}>{sample.status}</span></td>
                      <td data-label="Latency">{formatDuration(proofSampleLatency(sample, run))}</td>
                      <td data-label="Provider">{formatDuration(sample.providerRoundTripMs)}</td>
                      <td data-label="Proof size">{formatBytes(sample.proofBytes)}</td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {measuredSamples.map((sample, index) => sample.error ? <pre key={`sample-error-${sample.sample}-${index}`} className="proof-error-detail">#{sample.sample} · k={sample.k}: {sample.error}</pre> : null)}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="proof-stat"><span>{label}</span><strong>{value}</strong></div>;
}
