import type { OneAmSession } from '../../../oneAm';
import type { WalletStatus } from '../types';
import { useProofSimulator } from '../hooks/useProofSimulator';

type ProofSimulatorPageProps = {
  oneAmSession: OneAmSession | null;
  walletStatus: WalletStatus;
  statusText: string;
  connectWallet: () => void;
};

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

function shortAddress(value: string): string {
  return value ? `${value.slice(0, 16)}...${value.slice(-10)}` : 'Not deployed';
}

export default function ProofSimulatorPage(props: ProofSimulatorPageProps) {
  const simulator = useProofSimulator(props);
  const isRunning = simulator.busyAction === 'run';

  return (
    <section className="dapp-panel proof-simulator" aria-label="Proof Simulator">
      <header className="proof-simulator-header">
        <div>
          <p className="eyebrow">ProofStation diagnostics</p>
          <h2>Midnight Proof Simulator</h2>
          <p>
            Generate genuine Compact proofs through 1AM without balancing or broadcasting the test calls.
            Only deploying this harness writes to the chain.
          </p>
        </div>
        {!simulator.session && props.walletStatus === 'detected' && (
          <button type="button" className="button-primary" onClick={props.connectWallet}>
            Connect 1AM
          </button>
        )}
      </header>

      <section className="proof-simulator-note">
        <strong>Range:</strong> useful Compact transaction circuits begin at k=6. Midnight exposes SRS tiers
        through k=25; this bundle includes k=6–20, while k=21–25 require explicitly generated larger artifacts.
      </section>

      <section className="proof-simulator-controls">
        <div className="proof-contract-card">
          <span>Harness contract</span>
          <code title={simulator.contractAddress}>{shortAddress(simulator.contractAddress)}</code>
          <span className={simulator.snapshotReady ? 'proof-ready' : 'proof-not-ready'}>
            {simulator.snapshotReady ? 'Indexed and ready' : simulator.contractAddress ? 'State not loaded' : 'Deploy once'}
          </span>
        </div>
        <div className="proof-action-row">
          <button
            type="button"
            className="button-primary"
            onClick={simulator.deploy}
            disabled={!simulator.session || Boolean(simulator.contractAddress) || simulator.busyAction !== null}
          >
            {simulator.busyAction === 'deploy' ? 'Deploying...' : 'Deploy harness'}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={simulator.refresh}
            disabled={!simulator.session || !simulator.contractAddress || simulator.busyAction !== null}
          >
            Refresh state
          </button>
          <button type="button" onClick={simulator.clearContract} disabled={!simulator.contractAddress || simulator.busyAction !== null}>
            Clear harness
          </button>
        </div>
      </section>

      {simulator.manifest && (
        <section className="proof-range-panel">
          <div className="proof-range-fields">
            <label>
              Start k
              <select value={simulator.rangeStart} onChange={(event) => simulator.setRangeStart(Number(event.target.value))} disabled={isRunning}>
                {simulator.manifest.circuits.map((circuit) => <option key={circuit.circuitId} value={circuit.actualK}>{circuit.actualK}</option>)}
              </select>
            </label>
            <label>
              End k
              <select value={simulator.rangeEnd} onChange={(event) => simulator.setRangeEnd(Number(event.target.value))} disabled={isRunning}>
                {simulator.manifest.circuits.map((circuit) => <option key={circuit.circuitId} value={circuit.actualK}>{circuit.actualK}</option>)}
              </select>
            </label>
          </div>
          <div className="proof-action-row">
            <button
              type="button"
              className="button-primary"
              onClick={simulator.runSelected}
              disabled={!simulator.snapshotReady || isRunning || simulator.selectedCircuits.length === 0}
            >
              {isRunning ? 'Running range...' : `Run ${simulator.selectedCircuits.length} proof${simulator.selectedCircuits.length === 1 ? '' : 's'}`}
            </button>
            <button type="button" onClick={simulator.requestStop} disabled={!isRunning}>Stop after current</button>
            <button type="button" onClick={simulator.clearResults} disabled={isRunning}>Clear results</button>
            <button type="button" onClick={simulator.copyResults} disabled={isRunning || !simulator.manifest}>Copy JSON</button>
            {simulator.copyFeedback && <span className="proof-copy-feedback">{simulator.copyFeedback}</span>}
          </div>
        </section>
      )}

      <p className="feedback">{simulator.feedback}</p>
      {simulator.error && <p className="error">{simulator.error}</p>}

      {simulator.manifest && (
        <div className="proof-table-wrap">
          <table className="proof-table">
            <thead>
              <tr>
                <th>k</th>
                <th>Rows</th>
                <th>Private fields</th>
                <th>Prover key</th>
                <th>Status</th>
                <th>Prove</th>
                <th>Proof bytes</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {simulator.manifest.circuits.map((circuit) => {
                const result = simulator.results[circuit.circuitId];
                const status = result?.status ?? 'idle';
                return (
                  <tr key={circuit.circuitId}>
                    <td><strong>{circuit.actualK}</strong></td>
                    <td>{circuit.rows.toLocaleString()}</td>
                    <td>{circuit.inputLength.toLocaleString()}</td>
                    <td>{formatBytes(circuit.artifacts?.prover.bytes)}</td>
                    <td><span className={`proof-status proof-status-${status}`}>{status}</span></td>
                    <td>{formatDuration(result?.proofDurationMs)}</td>
                    <td>{formatBytes(result?.proofBytes)}</td>
                    <td>{formatDuration(result?.totalDurationMs)}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => simulator.runOne(circuit)}
                        disabled={!simulator.snapshotReady || isRunning}
                      >
                        {result ? 'Rerun' : 'Run'}
                      </button>
                    </td>
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
      )}
    </section>
  );
}
