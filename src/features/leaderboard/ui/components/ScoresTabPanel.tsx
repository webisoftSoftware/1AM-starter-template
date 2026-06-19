import type { LeaderboardViewModel } from '../types';

type ScoresTabPanelProps = {
  board: LeaderboardViewModel;
};

function shorten(value: string, head = 14, tail = 8): string {
  if (!value) return '';
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export function ScoresTabPanel({ board }: ScoresTabPanelProps) {
  return (
    <div className="tab-pane tab-pane-scroll" role="tabpanel" aria-label="Leaderboard scores tab">
      <dl className="details details-secondary summary-grid">
        <div>
          <dt>Visible scores</dt>
          <dd>{board.entries.length}</dd>
        </div>
        <div>
          <dt>Stored ids</dt>
          <dd>{board.entryCount}</dd>
        </div>
        <div>
          <dt>Contract state</dt>
          <dd>{board.contractSnapshot ? 'Loaded' : 'Not loaded'}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{board.feedback}</dd>
        </div>
      </dl>

      <section className="chain-sync-panel">
        <p>Refresh after wallet submission to pull finalized indexed scores.</p>
        <div className="inline-actions chain-sync-actions">
          <button type="button" className="button-secondary" onClick={() => void board.refreshLeaderboard()} disabled={!board.canRefresh}>
            {board.busyAction === 'refresh' ? 'Refreshing...' : 'Refresh Scores'}
          </button>
          <button type="button" className="button-primary" onClick={() => board.setActiveTab('play')} disabled={board.busyAction !== null}>
            Play Round
          </button>
        </div>
      </section>

      <section className="task-list-panel">
        <div className="task-list-header">
          <h2>Leaderboard</h2>
          <p>{board.contractAddress ? shorten(board.contractAddress, 18, 10) : 'No contract loaded'}</p>
        </div>

        {board.entries.length === 0 ? (
          <p className="empty-state">No scores are loaded for this contract.</p>
        ) : (
          <div className="leaderboard-table-wrap">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Player</th>
                  <th>Score</th>
                  <th>Proof</th>
                </tr>
              </thead>
              <tbody>
                {board.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.rank}</td>
                    <td>
                      <span>{entry.displayName}</span>
                      {board.verifiedEntryIds.has(entry.id) && <span className="verified-chip">Yours</span>}
                    </td>
                    <td>{entry.score.toLocaleString()}</td>
                    <td>
                      {board.canVerifyEntries && !board.verifiedEntryIds.has(entry.id) ? (
                        <button
                          type="button"
                          onClick={() => board.verifyEntry(entry.id)}
                          disabled={board.busyAction !== null}
                        >
                          {board.verifyingEntryId === entry.id ? 'Proving...' : 'Prove'}
                        </button>
                      ) : (
                        <span className="proof-placeholder">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {board.lastTxId && (
        <dl className="details">
          <div>
            <dt>Last transaction</dt>
            <dd title={board.lastTxId}>{shorten(board.lastTxId, 18, 10)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
