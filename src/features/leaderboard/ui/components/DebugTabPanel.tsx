import type { LeaderboardViewModel } from '../types';

type DebugTabPanelProps = {
  board: LeaderboardViewModel;
};

export function DebugTabPanel({ board }: DebugTabPanelProps) {
  return (
    <div className="tab-pane tab-pane-scroll" role="tabpanel" aria-label="Leaderboard debug tab">
      <section className="debug-panel">
        <div className="debug-header">
          <h2>Debug Log</h2>
          <button type="button" onClick={board.clearDebugEntries} disabled={board.debugEntries.length === 0}>
            Clear
          </button>
        </div>

        {board.debugEntries.length === 0 ? (
          <p className="debug-empty">No debug events yet.</p>
        ) : (
          <div className="debug-log">
            {board.debugEntries.map((entry, index) => (
              <pre className="debug-entry" key={`${entry.at}-${entry.scope}-${entry.message}-${index}`}>
                {JSON.stringify(entry, null, 2)}
              </pre>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
