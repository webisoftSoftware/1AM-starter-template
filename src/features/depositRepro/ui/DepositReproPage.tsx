import { useDepositRepro } from '../hooks/useDepositRepro';
import type { OneAmSession } from '../../../oneAm';
import type { WalletStatus } from '../types';
import type { DepositReproViewModel } from './types';

type DepositReproPageProps = {
  oneAmSession: OneAmSession | null;
  walletStatus: WalletStatus;
  statusText: string;
  connectWallet: () => void;
};

function shorten(value: string, head = 14, tail = 8): string {
  if (!value) return '';
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function tokenBalanceLabel(board: DepositReproViewModel): string {
  if (board.availableMintToken) return board.availableMintToken;
  if (board.tokenBalanceStatus === 'loading') return 'Loading...';
  if (board.tokenBalanceStatus === 'unavailable' || board.tokenBalanceStatus === 'error') return 'Unavailable';
  return board.mintContractAddress ? 'Not loaded' : 'Deploy contract first';
}

export default function DepositReproPage(props: DepositReproPageProps) {
  const board = useDepositRepro(props);

  return (
    <section className="dapp-panel" aria-label="Shielded Deposit">
      <div className="tab-pane tab-pane-scroll" role="tabpanel" aria-label="Shielded deposit tab">
        <section className="composer composer-compact">
          <div className="composer-header">
            <div>
              <h2>Shielded Deposit</h2>
              <p>Mints a private token, deposits it back into the mint contract, then repeats against a deposit-only receiver.</p>
            </div>
          </div>
        </section>

        <div className="actions-toolbar">
          <div className="actions repro-actions">
            <button
              type="button"
              className="button-primary"
              onClick={board.deployMintDepositContract}
              disabled={!board.canDeployMintDeposit}
            >
              {board.busyAction === 'deployMintDeposit' ? 'Deploying...' : 'Deploy Mint+Deposit'}
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => board.refreshMintDeposit()}
              disabled={!board.canRefreshMintDeposit}
            >
              {board.busyAction === 'refresh' ? 'Refreshing...' : 'Refresh Mint+Deposit'}
            </button>
            <button type="button" className="button-secondary" onClick={board.copyRunLog}>
              Copy Diagnostics
            </button>
          </div>
        </div>

        {board.session && (
          <dl className="details repro-details-grid">
            <div>
              <dt>Network</dt>
              <dd>{board.session.config.networkId}</dd>
            </div>
            <div>
              <dt>Shielded address</dt>
              <dd title={board.session.shieldedAddress.shieldedAddress}>
                {shorten(board.session.shieldedAddress.shieldedAddress, 18, 10)}
              </dd>
            </div>
            <div>
              <dt>Token color</dt>
              <dd title={board.tokenColor}>{board.tokenColor ? shorten(board.tokenColor, 18, 10) : 'Deploy contract first'}</dd>
            </div>
            <div className="asset-balance-card">
              <div className="asset-balance-copy">
                <dt>Available minted token</dt>
                <dd className="asset-balance-value">{tokenBalanceLabel(board)}</dd>
                {board.tokenBalanceError && <p className="asset-balance-error">{board.tokenBalanceError}</p>}
              </div>
              <button
                type="button"
                className="button-secondary asset-balance-refresh-button"
                onClick={board.refreshMintTokenBalance}
                disabled={!board.canRefreshTokenBalance}
              >
                {board.tokenBalanceStatus === 'loading' ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </dl>
        )}

        <div className="stack">
          <section className="composer">
            <div className="composer-header">
              <div>
                <h2>Mint+Deposit Contract</h2>
                <p>Deploy a source token contract or load one that was already deployed with matching verifier keys.</p>
              </div>
            </div>

            <div className="field contract-address-row">
              <label htmlFor="repro-mint-contract-address">Current address</label>
              <input
                id="repro-mint-contract-address"
                value={board.mintContractAddress || 'Not deployed yet'}
                title={board.mintContractAddress || 'Not deployed yet'}
                readOnly
              />
            </div>

            <div className="task-form-grid repro-form-grid">
              <div className="field field-wide">
                <label htmlFor="repro-mint-load-address">Load address</label>
                <input
                  id="repro-mint-load-address"
                  value={board.mintLoadInput}
                  onChange={(event) => board.setMintLoadInput(event.target.value)}
                  placeholder="64-character contract address"
                  disabled={board.busyAction !== null}
                />
              </div>
            </div>

            <div className="inline-actions">
              <button type="button" onClick={board.loadMintDepositContract} disabled={!board.canLoadMintDeposit}>
                Load Mint+Deposit
              </button>
              <button
                type="button"
                onClick={board.clearMintDepositContract}
                disabled={!board.mintContractAddress || board.busyAction !== null}
              >
                Forget Mint+Deposit
              </button>
            </div>

            {board.mintDepositLedgerView && (
              <dl className="details summary-grid repro-counter-grid">
                <div>
                  <dt>Total minted</dt>
                  <dd>{board.mintDepositLedgerView.totalMinted.toString()}</dd>
                </div>
                <div>
                  <dt>Mint count</dt>
                  <dd>{board.mintDepositLedgerView.mintCount.toString()}</dd>
                </div>
                <div>
                  <dt>Total deposited</dt>
                  <dd>{board.mintDepositLedgerView.totalDeposited.toString()}</dd>
                </div>
                <div>
                  <dt>Deposit count</dt>
                  <dd>{board.mintDepositLedgerView.depositCount.toString()}</dd>
                </div>
              </dl>
            )}
          </section>

          <section className="composer">
            <div className="composer-header">
              <div>
                <h2>Same-Contract Path</h2>
                <p>Mint to your connected shielded address, then submit two deposits to the mint contract.</p>
              </div>
            </div>

            <div className="task-form-grid repro-form-grid">
              <div className="field">
                <label htmlFor="repro-mint-amount">Mint amount</label>
                <input
                  id="repro-mint-amount"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={board.mintAmount}
                  onChange={(event) => board.setMintAmount(event.target.value)}
                  disabled={board.busyAction !== null}
                />
              </div>
              <div className="field">
                <label htmlFor="repro-deposit-amount">Deposit amount</label>
                <input
                  id="repro-deposit-amount"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={board.depositAmount}
                  onChange={(event) => board.setDepositAmount(event.target.value)}
                  disabled={board.busyAction !== null}
                />
              </div>
            </div>

            <div className="actions repro-actions">
              <button type="button" className="button-primary" onClick={board.mintShielded} disabled={!board.canMint}>
                {board.busyAction === 'mint' ? 'Minting...' : 'Mint Shielded'}
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={board.submitSameContractDeposit}
                disabled={!board.canSameContractDeposit}
              >
                {board.busyAction === 'sameDeposit' ? 'Depositing...' : 'Deposit Same Contract'}
              </button>
            </div>

            {board.parsedMintAmount === null && board.mintAmount.trim() !== '' && (
              <p className="error">Enter a positive whole mint amount below 2^64.</p>
            )}
            {board.parsedDepositAmount === null && board.depositAmount.trim() !== '' && (
              <p className="error">Enter a positive whole deposit amount below 2^128.</p>
            )}
            {board.parsedDepositAmount !== null && board.availableMintToken && !board.hasEnoughDepositBalance && (
              <p className="feedback">
                Wallet balance for this token color is below the deposit amount. Refresh after the mint is indexed before
                depositing.
              </p>
            )}
          </section>

          <section className="composer">
            <div className="composer-header">
              <div>
                <h2>Deposit-Only Contract</h2>
                <p>Deploy or load a receiver that validates the token color against the mint contract above.</p>
              </div>
            </div>

            <div className="field contract-address-row">
              <label htmlFor="repro-deposit-only-address">Current address</label>
              <input
                id="repro-deposit-only-address"
                value={board.depositOnlyContractAddress || 'Not deployed yet'}
                title={board.depositOnlyContractAddress || 'Not deployed yet'}
                readOnly
              />
            </div>

            <div className="task-form-grid repro-form-grid">
              <div className="field field-wide">
                <label htmlFor="repro-deposit-only-load-address">Load address</label>
                <input
                  id="repro-deposit-only-load-address"
                  value={board.depositOnlyLoadInput}
                  onChange={(event) => board.setDepositOnlyLoadInput(event.target.value)}
                  placeholder="64-character contract address"
                  disabled={board.busyAction !== null}
                />
              </div>
            </div>

            <div className="actions repro-actions">
              <button
                type="button"
                className="button-primary"
                onClick={board.deployDepositOnlyContract}
                disabled={!board.canDeployDepositOnly}
              >
                {board.busyAction === 'deployDepositOnly' ? 'Deploying...' : 'Deploy Deposit-Only'}
              </button>
              <button type="button" onClick={board.loadDepositOnlyContract} disabled={!board.canLoadDepositOnly}>
                Load Deposit-Only
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => board.refreshDepositOnly()}
                disabled={!board.canRefreshDepositOnly}
              >
                Refresh Deposit-Only
              </button>
              <button
                type="button"
                onClick={board.clearDepositOnlyContract}
                disabled={!board.depositOnlyContractAddress || board.busyAction !== null}
              >
                Forget Deposit-Only
              </button>
            </div>

            {board.depositOnlyLedgerView && (
              <dl className="details summary-grid repro-counter-grid">
                <div>
                  <dt>Source contract</dt>
                  <dd title={board.depositOnlyLedgerView.sourceContract}>
                    {shorten(board.depositOnlyLedgerView.sourceContract, 18, 10)}
                  </dd>
                </div>
                <div>
                  <dt>Total deposited</dt>
                  <dd>{board.depositOnlyLedgerView.totalDeposited.toString()}</dd>
                </div>
                <div>
                  <dt>Deposit count</dt>
                  <dd>{board.depositOnlyLedgerView.depositCount.toString()}</dd>
                </div>
              </dl>
            )}

            <div className="actions repro-actions">
              <button
                type="button"
                className="button-primary"
                onClick={board.submitDifferentContractDeposit}
                disabled={!board.canDifferentContractDeposit}
              >
                {board.busyAction === 'differentDeposit' ? 'Depositing...' : 'Deposit Different Contract'}
              </button>
            </div>
          </section>

          {board.copyStatus && <p className="feedback">{board.copyStatus}</p>}
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

      {board.error && <p className="error">{board.error}</p>}
    </section>
  );
}
