import type { MintViewModel } from '../types';

type DebugTabPanelProps = {
  board: MintViewModel;
};

export function DebugTabPanel({ board }: DebugTabPanelProps) {
  return (
    <div className="tab-pane tab-pane-scroll" role="tabpanel" aria-label="Debug tab">
      <div className="debug-panel">
        <div className="debug-header">
          <h2>Debug Log</h2>
          <button type="button" onClick={board.clearDebugEntries} disabled={board.busyAction !== null && board.debugEntries.length === 0}>
            Clear Debug Log
          </button>
        </div>
        <div className="debug-log">
          {board.debugEntries.length === 0 ? (
            <p className="debug-empty">No debug entries yet.</p>
          ) : (
            board.debugEntries.map((entry, index) => (
              <pre className="debug-entry" key={`${entry.at}-${entry.scope}-${index}`}>
                {JSON.stringify(entry, null, 2)}
              </pre>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
