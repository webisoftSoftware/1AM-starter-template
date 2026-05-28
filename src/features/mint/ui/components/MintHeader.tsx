import type { MintViewModel } from '../types';
import { APP_CONFIG } from '../../../../config';

const BRAND_LOGO_SRC = '/branding/1am-logo-black.svg';

type MintHeaderProps = {
  board: MintViewModel;
};

export function MintHeader({ board }: MintHeaderProps) {
  return (
    <header className="panel-top">
      <div className="brand-intro">
        <img className="brand-logo" src={BRAND_LOGO_SRC} alt="1AM" />
        <div>
          <p className="eyebrow">{APP_CONFIG.oneAmNetwork} network</p>
          <h1>Shielded Token Mint</h1>
        </div>
      </div>
      <div className="panel-top-actions">
        {board.walletStatus === 'detected' ? (
          <button
            type="button"
            className={`connect-button ${board.isConnected ? 'button-connected' : 'button-primary'}`}
            onClick={board.connectWallet}
            disabled={board.busyAction !== null || board.isConnected}
          >
            {board.busyAction === 'connect' ? 'Connecting...' : board.isConnected ? 'Connected to 1 AM' : 'Connect 1AM'}
          </button>
        ) : (
          <>
            <span className={`wallet-status-pill wallet-status-pill-${board.walletStatus}`}>{board.statusText}</span>
            {board.walletStatus === 'not-found' && (
              <p className="wallet-install-hint">
                get it here:{' '}
                <a href="https://1am.xyz/" target="_blank" rel="noreferrer noopener">
                  https://1am.xyz/
                </a>
              </p>
            )}
          </>
        )}
      </div>
    </header>
  );
}
