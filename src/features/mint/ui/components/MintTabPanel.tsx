import type { MintViewModel } from '../types';

type MintTabPanelProps = {
  board: MintViewModel;
};

function shorten(value: string, head = 14, tail = 8): string {
  if (!value) return '';
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export function MintTabPanel({ board }: MintTabPanelProps) {
  const recipient = board.session?.shieldedAddress;

  return (
    <div className="tab-pane tab-pane-scroll" role="tabpanel" aria-label="Mint tab">
      <div className="actions-toolbar">
        <div className="actions">
          <button type="button" className="button-primary" onClick={board.deployMintContract} disabled={!board.canDeploy}>
            {board.busyAction === 'deploy' ? 'Deploying...' : 'Deploy Mint Contract'}
          </button>

          <button type="button" className="button-secondary" onClick={board.refreshContractState} disabled={!board.canRefresh}>
            {board.busyAction === 'refresh' ? 'Refreshing...' : 'Refresh Mint Ledger'}
          </button>

          <button type="button" className="button-primary" onClick={board.mint} disabled={!board.canMint}>
            {board.busyAction === 'mint' ? 'Minting...' : 'Mint Shielded Tokens'}
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
            <dd>{board.session.unshieldedAddress}</dd>
          </div>
          <div>
            <dt>Shielded recipient</dt>
            <dd title={recipient?.shieldedAddress}>{shorten(recipient?.shieldedAddress ?? '')}</dd>
          </div>
        </dl>
      )}

      <div className="stack">
        <div className="field contract-address-row">
          <label htmlFor="contract-address">Mint contract address</label>
          <input
            id="contract-address"
            value={board.contractAddress || 'Not deployed yet'}
            title={board.contractAddress || 'Not deployed yet'}
            readOnly
          />
        </div>

        <div className="inline-actions">
          <button type="button" onClick={board.clearSavedContract} disabled={!board.contractAddress || board.busyAction !== null}>
            Forget Saved Contract
          </button>
        </div>

        {board.ledgerView && (
          <dl className="details">
            <div>
              <dt>Total minted</dt>
              <dd>{board.ledgerView.totalMinted.toString()}</dd>
            </div>
            <div>
              <dt>Mint count</dt>
              <dd>{board.ledgerView.mintCount.toString()}</dd>
            </div>
          </dl>
        )}

        <section className="composer composer-compact">
          <div className="composer-header">
            <h2>Mint Shielded Tokens</h2>
            <p>Mints the entered amount of the contract&apos;s shielded token directly to your connected 1AM wallet.</p>
          </div>

          <div className="task-form-grid">
            <div className="field field-wide">
              <label htmlFor="mint-amount">Amount</label>
              <input
                id="mint-amount"
                inputMode="numeric"
                pattern="[0-9]*"
                value={board.amount}
                onChange={(event) => board.setAmount(event.target.value)}
                placeholder="100"
                disabled={board.busyAction !== null || !board.contractAddress}
              />
            </div>
          </div>

          {board.parsedAmount === null && board.amount.trim() !== '' && (
            <p className="error">Enter a positive whole number (max 64-bit).</p>
          )}
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
