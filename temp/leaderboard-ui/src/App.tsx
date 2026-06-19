import { useState, useEffect, useCallback, useRef } from 'react';
import { useLeaderboard } from './hooks/useLeaderboard';
import { BrowserLeaderboardManager } from './contexts/BrowserLeaderboardManager';
import pino from 'pino';

const NETWORK_ID = import.meta.env.VITE_NETWORK_ID ?? 'preview';
const DEFAULT_CONTRACT = import.meta.env.VITE_DEFAULT_CONTRACT ?? '';

enum DisplayMode { PUBLIC = 0, ANONYMOUS = 1, CUSTOM = 2 }
type WalletState = 'detecting' | 'no-wallet' | 'ready' | 'connecting' | 'connected';

function findOneAmWallet(): OneAmWallet | undefined {
  return window.midnight?.['1am'];
}

function truncAddr(addr: string): string {
  return addr.length <= 24 ? addr : `${addr.slice(0, 14)}...${addr.slice(-8)}`;
}

function friendlyError(e: unknown): string {
  const msg = extractErrorMessage(e);
  if (msg.includes('User rejected')) return 'Transaction cancelled.';
  if (msg.includes('not the owner')) return 'This entry does not belong to your 1AM identity.';
  if (msg.includes('entry not found')) return 'Entry not found on the leaderboard.';
  if (msg.includes('Failed to fetch') || msg.includes('Failed Proof Server')) return 'Could not reach the proof server. Check your connection and try again.';
  if (msg.includes('mismatched verifier keys')) return 'Contract version mismatch. Try deploying a new leaderboard.';
  if (msg.includes('submission') || msg.includes('Submission')) return 'Transaction failed to submit. Please try again.';
  return msg || 'An unexpected error occurred. Check the browser console for details.';
}

function extractErrorMessage(e: unknown): string {
  if (!e) return '';
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'object') {
    const maybe = e as { message?: string; cause?: { message?: string; failure?: { message?: string; cause?: { message?: string } } } };
    if (maybe.message) return maybe.message;
    if (maybe.cause?.failure?.message) return maybe.cause.failure.message;
    if (maybe.cause?.failure?.cause?.message) return maybe.cause.failure.cause.message;
    if (maybe.cause?.message) return maybe.cause.message;
  }
  try { return JSON.stringify(e); } catch { return String(e); }
}

export default function App() {
  const [walletState, setWalletState] = useState<WalletState>('detecting');
  const [walletAPI, setWalletAPI] = useState<OneAmWallet | undefined>();
  const [wallet, setWallet] = useState<OneAmConnectedApi | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contractAddress, setContractAddress] = useState(DEFAULT_CONTRACT);
  const [joinInput, setJoinInput] = useState('');
  const [showJoinPanel, setShowJoinPanel] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [clicks, setClicks] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(10);
  const [showResult, setShowResult] = useState(false);
  const [lastScore, setLastScore] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clickRef = useRef(0);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(DisplayMode.ANONYMOUS);
  const [customName, setCustomName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [verifiedIds, setVerifiedIds] = useState<Set<number>>(new Set());
  const managerRef = useRef<BrowserLeaderboardManager | null>(null);

  const getManager = useCallback(() => {
    if (!managerRef.current) {
      const logger = pino({ level: 'warn', browser: { asObject: true } });
      managerRef.current = new BrowserLeaderboardManager(logger);
    }
    return managerRef.current;
  }, []);

  const {
    entries: leaderboardEntries,
    entryCount,
    loading: leaderboardLoading,
    error: leaderboardError,
    refresh: refreshLeaderboard,
  } = useLeaderboard(contractAddress || null);
  const leaderboard = leaderboardEntries.map((e, i) => ({
    rank: i + 1,
    id: e.id,
    displayName: e.displayName,
    score: BigInt(e.score),
  }));

  useEffect(() => {
    const found = findOneAmWallet();
    if (found) {
      setWalletAPI(found);
      setWalletState('ready');
      return;
    }

    let elapsed = 0;
    const t = setInterval(() => {
      elapsed += 100;
      const w = findOneAmWallet();
      if (w) {
        setWalletAPI(w);
        setWalletState('ready');
        clearInterval(t);
      } else if (elapsed >= 5_000) {
        setWalletState('no-wallet');
        clearInterval(t);
      }
    }, 100);

    return () => clearInterval(t);
  }, []);

  const connect = useCallback(async () => {
    if (!walletAPI) return;
    setWalletState('connecting');
    setError(null);

    try {
      const c = await walletAPI.connect(NETWORK_ID as 'preview' | 'preprod');
      setWallet(c);
      const { unshieldedAddress } = await c.getUnshieldedAddress();
      setAddress(unshieldedAddress);
      setWalletState('connected');
    } catch (e: unknown) {
      setError(friendlyError(e));
      setWalletState('ready');
    }
  }, [walletAPI]);

  const resolveContract = useCallback(async (addr?: string) => {
    const manager = getManager();
    const deployment$ = manager.resolve(addr as never);
    return new Promise<any>((resolve, reject) => {
      const sub = deployment$.subscribe((d) => {
        if (d.status === 'deployed') {
          Promise.resolve().then(() => sub.unsubscribe());
          resolve(d);
        }
        if (d.status === 'failed') {
          Promise.resolve().then(() => sub.unsubscribe());
          reject(d.error);
        }
      });
    });
  }, [getManager]);

  const deployContract = useCallback(async () => {
    if (!wallet) return;
    setDeploying(true);
    setError(null);

    try {
      const result = await resolveContract();
      setContractAddress(result.api.deployedContractAddress);
      setShowJoinPanel(false);
      setClicks(0);
      setShowResult(false);
      void navigator.clipboard?.writeText(result.api.deployedContractAddress);
    } catch (e: unknown) {
      setError(friendlyError(e));
    } finally {
      setDeploying(false);
    }
  }, [wallet, resolveContract]);

  const joinContract = useCallback(() => {
    const addr = joinInput.trim();
    if (!addr || !/^[0-9a-fA-F]{64}$/.test(addr)) {
      setError('Invalid contract address. Must be 64 hex characters.');
      return;
    }
    setContractAddress(addr);
    setShowJoinPanel(false);
    setJoinInput('');
  }, [joinInput]);

  const startGame = useCallback(() => {
    setClicks(0);
    clickRef.current = 0;
    setTimeLeft(10);
    setIsPlaying(true);
    setShowResult(false);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setIsPlaying(false);
          setShowResult(true);
          setLastScore(clickRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1_000);
  }, []);

  const handleClick = useCallback(() => {
    if (!isPlaying) return;
    clickRef.current += 1;
    setClicks(clickRef.current);
  }, [isPlaying]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const submitScore = useCallback(async () => {
    if (lastScore === 0 || !wallet) return;
    setSubmitting(true);
    setSubmitStatus('Joining contract...');
    setError(null);

    try {
      const result = await resolveContract(contractAddress);
      setSubmitStatus('Generating proof and submitting...');
      const name = displayMode === DisplayMode.PUBLIC
        ? `${address!.slice(0, 12)}..${address!.slice(-12)}`
        : displayMode === DisplayMode.CUSTOM ? customName : undefined;
      await result.api.submitScore(lastScore, name);
      setSubmitting(false);
      setSubmitStatus(null);
      setShowResult(false);
      setLastScore(0);
      setTimeout(() => void refreshLeaderboard(), 3_000);
    } catch (e: unknown) {
      setSubmitting(false);
      setSubmitStatus(null);
      setError(friendlyError(e));
    }
  }, [wallet, lastScore, displayMode, customName, contractAddress, refreshLeaderboard, address, resolveContract]);

  const verifyEntry = useCallback(async (entryId: number) => {
    if (!wallet) return;
    setVerifyingId(entryId);
    setError(null);

    try {
      const result = await resolveContract(contractAddress);
      await result.api.verifyOwnership(entryId);
      setVerifiedIds((prev) => new Set(prev).add(entryId));
    } catch (e: unknown) {
      setError(friendlyError(e));
    } finally {
      setVerifyingId(null);
    }
  }, [wallet, contractAddress, resolveContract]);

  const isConnected = walletState === 'connected';

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Midnight Leaderboard</h1>
          <p>1AM wallet, Compact contract, on-chain click scores.</p>
        </div>
        <div className="wallet-box">
          {walletState === 'no-wallet' ? (
            <span>1AM wallet not detected.</span>
          ) : isConnected && address ? (
            <span>Connected: {truncAddr(address)}</span>
          ) : (
            <button onClick={connect} disabled={walletState !== 'ready'}>
              {walletState === 'connecting' ? 'Connecting...' : 'Connect 1AM'}
            </button>
          )}
        </div>
      </header>

      {(error || leaderboardError) && (
        <div className="error">
          {error ?? leaderboardError}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <section className="contract-row">
        <span>Contract: {contractAddress ? truncAddr(contractAddress) : 'none selected'}</span>
        <button onClick={() => setShowJoinPanel(!showJoinPanel)}>
          {showJoinPanel ? 'Cancel' : 'Switch Contract'}
        </button>
      </section>

      {showJoinPanel && (
        <section className="join-panel">
          <input
            type="text"
            placeholder="Contract address (64 hex chars)"
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
          />
          <button onClick={joinContract} disabled={!joinInput.trim()}>Join</button>
          {isConnected ? (
            <button onClick={deployContract} disabled={deploying}>{deploying ? 'Deploying...' : 'Deploy New'}</button>
          ) : (
            <button onClick={connect} disabled={walletState !== 'ready'}>Connect to Deploy</button>
          )}
        </section>
      )}

      <section className="game-panel">
        <div>
          <h2>Click Challenge</h2>
          <p>Time: {isPlaying ? timeLeft : 10}s | Clicks: {clicks}</p>
        </div>

        {isPlaying && (
          <button className="click-button" onPointerDown={handleClick}>CLICK</button>
        )}

        {!isPlaying && !showResult && (
          <button onClick={startGame}>Start Game</button>
        )}

        {lastScore > 0 && !isPlaying && (
          <div className="submit-panel">
            <strong>Score: {lastScore}</strong>
            <button onClick={startGame}>Try Again</button>
            <div className="mode-row">
              {([[DisplayMode.ANONYMOUS, 'Anonymous'], [DisplayMode.PUBLIC, 'Public'], [DisplayMode.CUSTOM, 'Custom']] as const).map(([m, label]) => (
                <button key={m} onClick={() => setDisplayMode(m)} className={displayMode === m ? 'active' : ''}>{label}</button>
              ))}
            </div>
            {displayMode === DisplayMode.CUSTOM && (
              <input
                type="text"
                placeholder="Display name (max 32)"
                maxLength={32}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            )}
            {isConnected ? (
              <button onClick={submitScore} disabled={submitting || !contractAddress || (displayMode === DisplayMode.CUSTOM && !customName.trim())}>
                {submitting ? submitStatus : 'Submit to Chain'}
              </button>
            ) : (
              <button onClick={connect} disabled={walletState !== 'ready'}>Connect 1AM to Submit</button>
            )}
          </div>
        )}
      </section>

      <section>
        <div className="leaderboard-heading">
          <h2>Leaderboard ({leaderboard.length} entries, next id {entryCount})</h2>
          <button onClick={() => void refreshLeaderboard()} disabled={leaderboardLoading || !contractAddress}>
            {leaderboardLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {leaderboard.length === 0 ? (
          <p className="empty">No scores yet.</p>
        ) : (
          <table>
            <thead><tr><th>#</th><th>Player</th><th>Score</th><th>Proof</th></tr></thead>
            <tbody>
              {leaderboard.map((e) => (
                <tr key={e.id}>
                  <td>{e.rank}</td>
                  <td>{e.displayName} {verifiedIds.has(e.id) && <span className="verified">(yours)</span>}</td>
                  <td>{Number(e.score).toLocaleString()}</td>
                  <td>
                    {isConnected && !verifiedIds.has(e.id) && (
                      <button onClick={() => verifyEntry(e.id)} disabled={verifyingId !== null}>
                        {verifyingId === e.id ? '...' : 'Prove'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
