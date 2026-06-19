import type { DisplayMode } from '../../types';
import type { LeaderboardViewModel } from '../types';

type PlayTabPanelProps = {
  board: LeaderboardViewModel;
};

const DISPLAY_MODES: Array<{ id: DisplayMode; label: string }> = [
  { id: 'anonymous', label: 'Anonymous' },
  { id: 'public', label: 'Public' },
  { id: 'custom', label: 'Custom' },
];

function shorten(value: string, head = 14, tail = 8): string {
  if (!value) return '';
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export function PlayTabPanel({ board }: PlayTabPanelProps) {
  const contractLabel = board.contractAddress || 'Not deployed yet';

  return (
    <div className="tab-pane tab-pane-scroll" role="tabpanel" aria-label="Play leaderboard tab">
      <div className="actions-toolbar">
        <div className="actions">
          <button
            type="button"
            className="button-primary"
            onClick={board.deployLeaderboardContract}
            disabled={!board.canDeploy}
          >
            {board.busyAction === 'deploy' ? 'Deploying...' : 'Deploy Leaderboard'}
          </button>

          <button type="button" className="button-secondary" onClick={() => void board.refreshLeaderboard()} disabled={!board.canRefresh}>
            {board.busyAction === 'refresh' ? 'Refreshing...' : 'Refresh Scores'}
          </button>

          <button type="button" className="button-primary" onClick={board.submitScore} disabled={!board.canSubmitScore}>
            {board.busyAction === 'submit' ? 'Submitting...' : 'Submit Score'}
          </button>
        </div>
      </div>

      {board.session && (
        <dl className="details">
          <div>
            <dt>Network</dt>
            <dd>{board.session.config.networkId}</dd>
          </div>
          <div>
            <dt>Indexer</dt>
            <dd>{board.session.config.indexerUri}</dd>
          </div>
          <div>
            <dt>Unshielded address</dt>
            <dd title={board.session.unshieldedAddress}>{shorten(board.session.unshieldedAddress, 18, 10)}</dd>
          </div>
          <div>
            <dt>Scores loaded</dt>
            <dd>{board.entries.length}</dd>
          </div>
        </dl>
      )}

      <div className="stack">
        <div className="field contract-address-row">
          <label htmlFor="leaderboard-contract-address">Leaderboard contract</label>
          <input id="leaderboard-contract-address" value={contractLabel} title={contractLabel} readOnly />
        </div>

        <div className="leaderboard-load-row">
          <div className="field">
            <label htmlFor="leaderboard-load-address">Load contract address</label>
            <input
              id="leaderboard-load-address"
              value={board.joinInput}
              onChange={(event) => board.setJoinInput(event.target.value)}
              placeholder="64 hex characters"
              disabled={board.busyAction !== null}
            />
          </div>
          <div className="leaderboard-load-actions">
            <button type="button" onClick={board.loadContractAddress} disabled={!board.canLoadContract}>
              Load
            </button>
            <button type="button" onClick={board.clearSavedContract} disabled={!board.contractAddress || board.busyAction !== null}>
              Forget Saved Contract
            </button>
          </div>
        </div>

        {board.joinInput.trim() && !board.validJoinInput && (
          <p className="error">Contract addresses must be 64 hex characters.</p>
        )}

        <section className="leaderboard-game-panel">
          <div className="leaderboard-game-header">
            <div>
              <h2>Click Challenge</h2>
              <p>
                {board.isPlaying ? `${board.timeLeft}s left` : '10s round'} | {board.clicks} clicks
              </p>
            </div>
            {board.lastScore > 0 && (
              <dl className="leaderboard-score-summary">
                <div>
                  <dt>Last score</dt>
                  <dd>{board.lastScore}</dd>
                </div>
              </dl>
            )}
          </div>

          {board.isPlaying ? (
            <button type="button" className="leaderboard-click-button" onPointerDown={board.handleGameClick}>
              Click
            </button>
          ) : (
            <button type="button" className="button-primary" onClick={board.startGame} disabled={board.busyAction !== null}>
              {board.lastScore > 0 ? 'Play Again' : 'Start Round'}
            </button>
          )}
        </section>

        {board.lastScore > 0 && (
          <section className="composer composer-compact">
            <div className="composer-header">
              <h2>Submit Score</h2>
              <p>Choose how this score appears before proving and submitting it.</p>
            </div>

            <div className="mode-selector" role="group" aria-label="Leaderboard display mode">
              {DISPLAY_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={`mode-button ${board.displayMode === mode.id ? 'mode-button-active' : ''}`}
                  onClick={() => board.setDisplayMode(mode.id)}
                  disabled={board.busyAction !== null}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {board.displayMode === 'custom' && (
              <div className="field">
                <label htmlFor="leaderboard-display-name">Display name</label>
                <input
                  id="leaderboard-display-name"
                  maxLength={32}
                  value={board.customName}
                  onChange={(event) => board.setCustomName(event.target.value)}
                  placeholder="Max 32 characters"
                  disabled={board.busyAction !== null}
                />
              </div>
            )}

            <div className="inline-actions">
              <button type="button" className="button-primary" onClick={board.submitScore} disabled={!board.canSubmitScore}>
                {board.busyAction === 'submit' ? 'Submitting...' : 'Submit Score On-Chain'}
              </button>
            </div>
          </section>
        )}

        {board.feedback && <p className="feedback">{board.feedback}</p>}
        {board.lastTxId && (
          <dl className="details">
            <div>
              <dt>Last transaction</dt>
              <dd title={board.lastTxId}>{shorten(board.lastTxId, 18, 10)}</dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
