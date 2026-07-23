import { useCallback, useEffect, useMemo, useState } from 'react';
import { APP_CONFIG, oneAmNetworkLabel } from './config';
import { debugError, debugLog } from './debug';
import TaskBoardPage from './features/tasks/ui/TaskBoardPage';
import LeaderboardPage from './features/leaderboard/ui/LeaderboardPage';
import MintPage from './features/mint/ui/MintPage';
import DepositReproPage from './features/depositRepro/ui/DepositReproPage';
import TransferPage from './features/transfer/ui/TransferPage';
import { connectOneAm, getOneAmWallet, type OneAmSession } from './oneAm';

type WorkspaceTab = 'tasks' | 'leaderboard' | 'mint' | 'depositRepro' | 'transfer';
type WalletStatus = 'checking' | 'detected' | 'not-found';

const BRAND_LOGO_SRC = '/branding/1am-logo-black.svg';
const SOURCE_REPO_URL = 'https://github.com/webisoftSoftware/1AM-starter-template';
const DETECT_TIMEOUT_MS = 6000;
const DETECT_INTERVAL_MS = 300;

const WORKSPACE_TABS: Array<{ id: WorkspaceTab; label: string; description: string }> = [
  { id: 'tasks', label: 'Task Board', description: 'Public or shielded TODO state' },
  { id: 'leaderboard', label: 'Leaderboard', description: 'On-chain click scores' },
  { id: 'mint', label: 'Shielded Mint', description: 'Mint private wallet tokens' },
  { id: 'depositRepro', label: 'Shielded Deposit', description: 'Mint then deposit tokens' },
  { id: 'transfer', label: 'NIGHT Transfer', description: 'Send unshielded NIGHT' },
];

function shorten(value: string, head = 14, tail = 8): string {
  if (!value) return '';
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('tasks');
  const [walletStatus, setWalletStatus] = useState<WalletStatus>('checking');
  const [session, setSession] = useState<OneAmSession | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState('');

  useEffect(() => {
    const startedAt = Date.now();

    const checkWallet = () => {
      if (getOneAmWallet()) {
        setWalletStatus('detected');
        return true;
      }

      if (Date.now() - startedAt >= DETECT_TIMEOUT_MS) {
        setWalletStatus('not-found');
        return true;
      }

      return false;
    };

    if (checkWallet()) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (checkWallet()) {
        window.clearInterval(intervalId);
      }
    }, DETECT_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const statusText = useMemo(() => {
    if (walletStatus === 'checking') return 'Checking for 1AM';
    if (walletStatus === 'detected') return session ? 'Connected to 1AM' : '1AM detected';
    return '1AM not found';
  }, [session, walletStatus]);

  const connectWallet = useCallback(async () => {
    if (!getOneAmWallet()) {
      setWalletStatus('not-found');
      setConnectionError('1AM wallet was not found in window.midnight["1am"].');
      return;
    }

    try {
      debugLog('workspace', 'connect:start', { networkPreference: APP_CONFIG.oneAmNetwork });
      setIsConnecting(true);
      setConnectionError('');
      const connectedSession = await connectOneAm(APP_CONFIG.oneAmNetwork);
      setSession(connectedSession);
      setWalletStatus('detected');
      debugLog('workspace', 'connect:success', {
        networkId: connectedSession.config.networkId,
        indexerUri: connectedSession.config.indexerUri,
      });
    } catch (error) {
      debugError('workspace', 'connect:error', error);
      setConnectionError(error instanceof Error ? error.message : 'Connection failed.');
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const sharedDappProps = {
    oneAmSession: session,
    walletStatus,
    statusText,
    connectWallet,
  };

  return (
    <main className="page workspace-page">
      <section className="panel workspace-panel">
        <header className="panel-top workspace-header">
          <div className="brand-intro">
            <img className="brand-logo" src={BRAND_LOGO_SRC} alt="1AM" />
            <div>
              <p className="eyebrow">{oneAmNetworkLabel(session?.config.networkId ?? APP_CONFIG.oneAmNetwork)}</p>
              <h1>1AM dApp Workspace</h1>
              <p className="lead">Try the task board, leaderboard, shielded mint, shielded deposit, and NIGHT transfer examples from one connected session.</p>
            </div>
          </div>

          <div className="panel-top-actions">
            {walletStatus === 'detected' ? (
              <button
                type="button"
                className={`connect-button ${session ? 'button-connected' : 'button-primary'}`}
                onClick={connectWallet}
                disabled={isConnecting || session !== null}
              >
                {isConnecting ? 'Connecting...' : session ? 'Connected to 1AM' : 'Connect 1AM'}
              </button>
            ) : (
              <>
                <span className={`wallet-status-pill wallet-status-pill-${walletStatus}`}>{statusText}</span>
                {walletStatus === 'not-found' && (
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

        {session && (
          <dl className="details workspace-session">
            <div>
              <dt>Network</dt>
              <dd>{session.config.networkId}</dd>
            </div>
            <div>
              <dt>Unshielded address</dt>
              <dd title={session.unshieldedAddress}>{shorten(session.unshieldedAddress, 18, 10)}</dd>
            </div>
            <div>
              <dt>Shielded address</dt>
              <dd title={session.shieldedAddress.shieldedAddress}>
                {shorten(session.shieldedAddress.shieldedAddress, 18, 10)}
              </dd>
            </div>
          </dl>
        )}

        {connectionError && <p className="error">{connectionError}</p>}

        <nav className="workspace-tabs" aria-label="dApp examples">
          {WORKSPACE_TABS.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              className={`workspace-tab ${activeTab === tab.id ? 'workspace-tab-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              aria-pressed={activeTab === tab.id}
            >
              <span className="workspace-tab-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="workspace-tab-copy">
                <span className="workspace-tab-label">{tab.label}</span>
                <span className="workspace-tab-description">{tab.description}</span>
              </span>
            </button>
          ))}
        </nav>

        <section className="workspace-content">
          <div className="workspace-dapp" hidden={activeTab !== 'tasks'}>
            <TaskBoardPage {...sharedDappProps} />
          </div>
          <div className="workspace-dapp" hidden={activeTab !== 'leaderboard'}>
            <LeaderboardPage {...sharedDappProps} />
          </div>
          <div className="workspace-dapp" hidden={activeTab !== 'mint'}>
            <MintPage {...sharedDappProps} />
          </div>
          <div className="workspace-dapp" hidden={activeTab !== 'depositRepro'}>
            <DepositReproPage {...sharedDappProps} />
          </div>
          <div className="workspace-dapp" hidden={activeTab !== 'transfer'}>
            <TransferPage {...sharedDappProps} />
          </div>
        </section>

        <footer className="site-footer">
          <a
            className="site-footer-link"
            href={SOURCE_REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
          >
            <svg className="github-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.04c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.74.08-.74 1.2.08 1.83 1.23 1.83 1.23 1.07 1.83 2.8 1.3 3.48.99.11-.77.42-1.3.76-1.6-2.66-.3-5.46-1.33-5.46-5.93 0-1.31.47-2.38 1.23-3.22-.12-.3-.53-1.52.12-3.17 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.3-1.55 3.3-1.23 3.3-1.23.65 1.65.24 2.87.12 3.17.76.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.62-5.47 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .5Z" />
            </svg>
            <span>View source on GitHub</span>
          </a>
        </footer>
      </section>
    </main>
  );
}

export default App;
