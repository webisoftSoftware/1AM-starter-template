import { useCallback, useEffect, useMemo, useState } from 'react';
import { APP_CONFIG } from './config';
import { debugError, debugLog } from './debug';
import TaskBoardPage from './features/tasks/ui/TaskBoardPage';
import MintPage from './features/mint/ui/MintPage';
import TransferPage from './features/transfer/ui/TransferPage';
import { connectOneAm, getOneAmWallet, type OneAmSession } from './oneAm';

type WorkspaceTab = 'tasks' | 'mint' | 'transfer';
type WalletStatus = 'checking' | 'detected' | 'not-found';

const BRAND_LOGO_SRC = '/branding/1am-logo-black.svg';
const DETECT_TIMEOUT_MS = 6000;
const DETECT_INTERVAL_MS = 300;

const WORKSPACE_TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'tasks', label: 'Task Board' },
  { id: 'mint', label: 'Shielded Mint' },
  { id: 'transfer', label: 'NIGHT Transfer' },
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
      debugLog('workspace', 'connect:start', { network: APP_CONFIG.oneAmNetwork });
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
              <p className="eyebrow">{APP_CONFIG.oneAmNetwork} network</p>
              <h1>1AM dApp Workspace</h1>
              <p className="lead">Try the task board, shielded mint, and NIGHT transfer examples from one connected session.</p>
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
          {WORKSPACE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`workspace-tab ${activeTab === tab.id ? 'workspace-tab-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              aria-pressed={activeTab === tab.id}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <section className="workspace-content">
          <div className="workspace-dapp" hidden={activeTab !== 'tasks'}>
            <TaskBoardPage {...sharedDappProps} />
          </div>
          <div className="workspace-dapp" hidden={activeTab !== 'mint'}>
            <MintPage {...sharedDappProps} />
          </div>
          <div className="workspace-dapp" hidden={activeTab !== 'transfer'}>
            <TransferPage {...sharedDappProps} />
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
