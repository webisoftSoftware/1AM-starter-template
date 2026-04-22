import { useEffect, useMemo, useState } from 'react';

type WalletStatus = 'checking' | 'detected' | 'not-found';

type ConnectState =
  | { phase: 'idle' }
  | { phase: 'connecting' }
  | { phase: 'connected'; networkId: string; indexerUri: string; unshieldedAddress: string }
  | { phase: 'error'; message: string };

const DETECT_TIMEOUT_MS = 6000;
const DETECT_INTERVAL_MS = 300;

function App() {
  const [walletStatus, setWalletStatus] = useState<WalletStatus>('checking');
  const [connectState, setConnectState] = useState<ConnectState>({ phase: 'idle' });

  useEffect(() => {
    const startedAt = Date.now();

    const checkWallet = () => {
      const wallet = window.midnight?.['1am'];
      if (wallet) {
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
    if (walletStatus === 'checking') return 'Checking for 1AM extension...';
    if (walletStatus === 'detected') return '1AM extension detected.';
    return '1AM extension not detected. Make sure it is enabled, then refresh.';
  }, [walletStatus]);

  const connectWallet = async () => {
    const wallet = window.midnight?.['1am'];
    if (!wallet) {
      setConnectState({
        phase: 'error',
        message: '1AM wallet was not found in window.midnight["1am"].',
      });
      return;
    }

    try {
      setConnectState({ phase: 'connecting' });

      const api = await wallet.connect('preview');
      const [config, unshieldedAddress] = await Promise.all([
        api.getConfiguration(),
        api.getUnshieldedAddress(),
      ]);

      setConnectState({
        phase: 'connected',
        networkId: config.networkId,
        indexerUri: config.indexerUri,
        unshieldedAddress: unshieldedAddress.unshieldedAddress,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed.';
      setConnectState({ phase: 'error', message });
    }
  };

  return (
    <main className="page">
      <section className="panel">
        <p className="eyebrow">1AM + Midnight</p>
        <h1>Minimal dApp Connection</h1>
        <p className="lead">This app only detects and connects to your installed 1AM wallet extension.</p>

        <div className={`status status-${walletStatus}`}>{statusText}</div>

        <button
          type="button"
          onClick={connectWallet}
          disabled={walletStatus !== 'detected' || connectState.phase === 'connecting'}
        >
          {connectState.phase === 'connecting' ? 'Connecting...' : 'Connect 1AM (preview)'}
        </button>

        {connectState.phase === 'connected' && (
          <dl className="details">
            <div>
              <dt>Network</dt>
              <dd>{connectState.networkId}</dd>
            </div>
            <div>
              <dt>Indexer</dt>
              <dd>{connectState.indexerUri}</dd>
            </div>
            <div>
              <dt>Unshielded address</dt>
              <dd>{connectState.unshieldedAddress}</dd>
            </div>
          </dl>
        )}

        {connectState.phase === 'error' && <p className="error">{connectState.message}</p>}
      </section>
    </main>
  );
}

export default App;
