import type { TransferViewModel } from '../types';

type TransferTabPanelProps = {
  board: TransferViewModel;
};

function shorten(value: string, head = 14, tail = 8): string {
  if (!value) return '';
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export function TransferTabPanel({ board }: TransferTabPanelProps) {
  const balanceLabel =
    board.availableNight ??
    (board.balanceStatus === 'loading'
      ? 'Loading...'
      : board.balanceStatus === 'unavailable' || board.balanceStatus === 'error'
        ? 'Unavailable'
        : 'Not loaded');

  return (
    <div className="tab-pane tab-pane-scroll" role="tabpanel" aria-label="Transfer tab">
      {board.session && (
        <dl className="details summary-grid">
          <div>
            <dt>Network</dt>
            <dd>{board.session.config.networkId}</dd>
          </div>
          <div className="asset-balance-card">
            <div className="asset-balance-copy">
              <dt>Available NIGHT</dt>
              <dd className="asset-balance-value">{balanceLabel}</dd>
              {board.balanceError && <p className="asset-balance-error">{board.balanceError}</p>}
            </div>
            <button
              type="button"
              className="button-secondary asset-balance-refresh-button"
              onClick={board.refreshAvailableNight}
              disabled={!board.canRefreshBalance}
            >
              {board.balanceStatus === 'loading' ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
          <div>
            <dt>Unshielded address</dt>
            <dd title={board.session.unshieldedAddress}>{board.session.unshieldedAddress}</dd>
          </div>
        </dl>
      )}

      <div className="stack">
        <section className="composer composer-compact">
          <div className="composer-header">
            <h2>Send NIGHT</h2>
          </div>

          <div className="task-form-grid">
            <div className="field field-wide">
              <label htmlFor="transfer-recipient">Recipient address</label>
              <input
                id="transfer-recipient"
                value={board.recipient}
                onChange={(event) => board.setRecipient(event.target.value)}
                placeholder="Recipient address"
                autoComplete="off"
                spellCheck={false}
                disabled={board.busyAction !== null}
              />
            </div>

            <div className="field field-wide">
              <label htmlFor="transfer-amount">Amount</label>
              <input
                id="transfer-amount"
                inputMode="decimal"
                value={board.amount}
                onChange={(event) => board.setAmount(event.target.value)}
                placeholder="1.000000"
                autoComplete="off"
                disabled={board.busyAction !== null}
              />
            </div>
          </div>

          {board.parsedAmount.error && board.amount.trim() !== '' && (
            <p className="field-error">{board.parsedAmount.error}</p>
          )}

          <div className="task-actions">
            <button
              type="button"
              className="button-primary"
              onClick={board.sendTransfer}
              disabled={!board.canSendTransfer}
            >
              {board.busyAction === 'transfer' ? 'Sending...' : 'Send NIGHT'}
            </button>
          </div>
        </section>

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
