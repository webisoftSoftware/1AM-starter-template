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

export default function ProofSimulatorPage(props: ProofSimulatorPageProps) {
  const simulator = useProofSimulator(props);
  const isRunning = simulator.busyAction === 'run';

  return (
    <section className="dapp-panel proof-simulator" aria-label="Proof Simulator">
      <header className="proof-simulator-header">
        <div>
          <p className="eyebrow">Proof diagnostics</p>
          <h2>Proof Simulator</h2>
          <p>Generate real proofs through 1AM. Test calls are never broadcast.</p>
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
            disabled={!simulator.session || simulator.busyAction !== null}
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
            disabled={!simulator.session || !simulator.addressInput || simulator.busyAction !== null}
          >
            Load
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={simulator.deploy}
            disabled={!simulator.session || simulator.busyAction !== null}
          >
            {simulator.busyAction === 'deploy' ? 'Deploying...' : 'Deploy new'}
          </button>
          {simulator.defaultContractAddress && simulator.addressInput !== simulator.defaultContractAddress && (
            <button type="button" onClick={simulator.useDefaultContract} disabled={simulator.busyAction !== null}>Use default</button>
          )}
        </div>
      </section>

      {simulator.manifest && (
        <section className="proof-range-panel">
          <div className="proof-range-fields">
            <label>
              Start k
              <select value={simulator.rangeStart} onChange={(event) => simulator.setRangeStart(Number(event.target.value))} disabled={isRunning}>
                {simulator.manifest.circuits.map((circuit) => <option key={circuit.circuitId} value={circuit.actualK}>k={circuit.actualK}{circuit.actualK > 17 ? ' · experimental' : ''}</option>)}
              </select>
            </label>
            <label>
              End k
              <select value={simulator.rangeEnd} onChange={(event) => simulator.setRangeEnd(Number(event.target.value))} disabled={isRunning}>
                {simulator.manifest.circuits.map((circuit) => <option key={circuit.circuitId} value={circuit.actualK}>k={circuit.actualK}{circuit.actualK > 17 ? ' · experimental' : ''}</option>)}
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
                  <tr key={circuit.circuitId} className={circuit.actualK > 17 ? 'proof-tier-experimental' : undefined}>
                    <td data-label="Tier">
                      <strong>k={circuit.actualK}</strong>
                      {circuit.actualK > 17 && <span className="proof-experimental">Experimental · expected to fail</span>}
                    </td>
                    <td data-label="Rows">{circuit.rows.toLocaleString()}</td>
                    <td data-label="Prover key">{formatBytes(circuit.artifacts?.prover.bytes)}</td>
                    <td data-label="Status"><span className={`proof-status proof-status-${status}`}>{status}</span></td>
                    <td data-label="Prove">{formatDuration(result?.proofDurationMs)}</td>
                    <td data-label="Proof size">{formatBytes(result?.proofBytes)}</td>
                    <td data-label="Total">{formatDuration(result?.totalDurationMs)}</td>
                    <td data-label="Action">
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
