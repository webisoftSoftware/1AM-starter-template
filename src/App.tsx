import { useEffect, useMemo, useState } from 'react';
import {
  createUnprovenCallTx,
  createUnprovenDeployTx,
  getPublicStates,
  submitTxAsync,
} from '@midnight-ntwrk/midnight-js-contracts';
import { ChargedState, ContractState as CompactContractState, sampleSigningKey } from '@midnight-ntwrk/compact-runtime';
import { LedgerParameters, ZswapChainState } from '@midnight-ntwrk/ledger-v8';
import { debugError, debugLog, subscribeDebugLogs, type DebugEntry } from './debug';
import { createConnectedSession, type ConnectedSession } from './midnight';
import { compiledTodoContract, todoLedger } from './todoContract';

type WalletStatus = 'checking' | 'detected' | 'not-found';
type BusyAction = 'connect' | 'deploy' | 'submit' | 'refresh' | null;

const DETECT_TIMEOUT_MS = 6000;
const DETECT_INTERVAL_MS = 300;
const CONTRACT_ADDRESS_STORAGE_KEY = 'todo-contract-address';

type ContractSnapshot = {
  contractState: CompactContractState;
  zswapChainState: ZswapChainState;
  ledgerParameters: LedgerParameters;
};

function readStoredContractAddress(): string {
  return window.localStorage.getItem(CONTRACT_ADDRESS_STORAGE_KEY) ?? '';
}

function App() {
  const [walletStatus, setWalletStatus] = useState<WalletStatus>('checking');
  const [session, setSession] = useState<ConnectedSession | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [contractAddress, setContractAddress] = useState(() => readStoredContractAddress());
  const [contractSnapshot, setContractSnapshot] = useState<ContractSnapshot | null>(null);
  const [todoInput, setTodoInput] = useState('');
  const [currentTodo, setCurrentTodo] = useState('');
  const [lastTxId, setLastTxId] = useState('');
  const [feedback, setFeedback] = useState('Connect 1AM to deploy the contract and submit a TODO.');
  const [error, setError] = useState('');
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeDebugLogs((entry) => {
      setDebugEntries((current) => [entry, ...current].slice(0, 30));
    });

    return unsubscribe;
  }, []);

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
      setError('1AM wallet was not found in window.midnight["1am"].');
      return;
    }

    try {
      debugLog('app', 'connectWallet:start');
      setBusyAction('connect');
      setError('');
      setFeedback('Connecting to 1AM on preview...');

      const api = await wallet.connect('preview');
      debugLog('app', 'connectWallet:wallet-connected');
      const connectedSession = await createConnectedSession(api);
      debugLog('app', 'connectWallet:session-created', {
        networkId: connectedSession.config.networkId,
        indexerUri: connectedSession.config.indexerUri,
      });

      setSession(connectedSession);
      setFeedback('Wallet connected. Deploy the TODO contract once, then submit a TODO.');

      if (contractAddress) {
        await refreshTodo(connectedSession, contractAddress, false);
      }
    } catch (connectError) {
      debugError('app', 'connectWallet:error', connectError);
      setError(connectError instanceof Error ? connectError.message : 'Connection failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const refreshTodo = async (
    activeSession: ConnectedSession,
    activeContractAddress: string,
    showBusyState = true,
  ) => {
    if (!activeContractAddress) {
      setCurrentTodo('');
      return false;
    }

    try {
      debugLog('app', 'refreshTodo:start', { activeContractAddress });
      if (showBusyState) {
        setBusyAction('refresh');
      }

      const publicStates = await getPublicStates(activeSession.providers.publicDataProvider, activeContractAddress);
      const ledgerState = todoLedger(publicStates.contractState.data);
      setCurrentTodo(ledgerState.todo);
      setContractSnapshot({
        contractState: publicStates.contractState,
        zswapChainState: publicStates.zswapChainState,
        ledgerParameters: publicStates.ledgerParameters,
      });
      debugLog('app', 'refreshTodo:success', {
        activeContractAddress,
        todo: ledgerState.todo,
      });
      return true;
    } catch (refreshError) {
      debugError('app', 'refreshTodo:error', refreshError);
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : 'Unable to fetch the latest TODO from the blockchain.',
      );
      return false;
    } finally {
      if (showBusyState) {
        setBusyAction(null);
      }
    }
  };

  const waitForContractSnapshot = async (activeSession: ConnectedSession, activeContractAddress: string) => {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      debugLog('app', 'waitForContractSnapshot:attempt', { activeContractAddress, attempt });

      if (await refreshTodo(activeSession, activeContractAddress, false)) {
        return true;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }

    return false;
  };

  const deployTodoContract = async () => {
    if (!session) {
      setError('Connect the wallet before deploying the contract.');
      return;
    }

    try {
      debugLog('app', 'deployTodoContract:start');
      setBusyAction('deploy');
      setError('');
      setFeedback('Deploying the TODO contract to Midnight preview...');

      const deployTxData = await createUnprovenDeployTx(
        {
          zkConfigProvider: session.providers.zkConfigProvider,
          walletProvider: session.providers.walletProvider,
        },
        {
          compiledContract: compiledTodoContract,
          args: [''],
          signingKey: sampleSigningKey(),
        },
      );
      debugLog('app', 'deployTodoContract:unproven-created', {
        contractAddress: deployTxData.public.contractAddress,
      });

      const txId = await submitTxAsync(
        {
          publicDataProvider: session.providers.publicDataProvider,
          zkConfigProvider: session.providers.zkConfigProvider,
          proofProvider: session.providers.proofProvider,
          walletProvider: session.providers.walletProvider,
          midnightProvider: session.providers.midnightProvider,
        },
        {
          unprovenTx: deployTxData.private.unprovenTx,
        },
      );
      debugLog('app', 'deployTodoContract:submitted', {
        contractAddress: deployTxData.public.contractAddress,
        txId,
      });

      await session.providers.privateStateProvider.setContractAddress(deployTxData.public.contractAddress);
      await session.providers.privateStateProvider.setSigningKey(
        deployTxData.public.contractAddress,
        deployTxData.private.signingKey,
      );

      const nextContractAddress = deployTxData.public.contractAddress;
      window.localStorage.setItem(CONTRACT_ADDRESS_STORAGE_KEY, nextContractAddress);
      setContractAddress(nextContractAddress);
      setContractSnapshot(null);
      setLastTxId(txId ?? '');
      setCurrentTodo('');
      setFeedback('Contract deployment submitted. Loading the indexed contract state...');

      const hydrated = await waitForContractSnapshot(session, nextContractAddress);
      setFeedback(
        hydrated
          ? 'Contract deployed and state loaded. You can now submit a TODO.'
          : 'Contract deployment submitted. Click refresh after the indexer catches up before submitting a TODO.',
      );
    } catch (deployError) {
      debugError('app', 'deployTodoContract:error', deployError);
      setError(deployError instanceof Error ? deployError.message : 'Contract deployment failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const submitTodo = async () => {
    if (!session) {
      setError('Connect the wallet before submitting a TODO.');
      return;
    }

    if (!contractAddress) {
      setError('Deploy the contract before submitting a TODO.');
      return;
    }

    if (!contractSnapshot) {
      setError('Contract state is not loaded yet. Refresh the contract state and try again.');
      return;
    }

    const nextTodo = todoInput.trim();
    if (!nextTodo) {
      setError('Enter a TODO before submitting.');
      return;
    }

    try {
      debugLog('app', 'submitTodo:start', {
        contractAddress,
        nextTodo,
        hasSnapshot: Boolean(contractSnapshot),
      });
      setBusyAction('submit');
      setError('');
      setFeedback('Proving, balancing, and submitting your TODO with 1AM...');

      const callTxData = await createUnprovenCallTx(session.providers, {
        compiledContract: compiledTodoContract,
        contractAddress,
        circuitId: 'storeTodo',
        args: [nextTodo],
      });
      debugLog('app', 'submitTodo:unproven-created', {
        nextTodo,
        nextContractStateType: typeof callTxData.public.nextContractState,
      });

      const txId = await submitTxAsync(session.providers, {
        unprovenTx: callTxData.private.unprovenTx,
        circuitId: 'storeTodo',
      });
      debugLog('app', 'submitTodo:submitted', { txId });

      setLastTxId(txId);
      setCurrentTodo(todoLedger(callTxData.public.nextContractState).todo);
      setContractSnapshot((currentSnapshot) =>
        currentSnapshot
          ? {
              ...currentSnapshot,
              contractState: (() => {
                const nextContractState = CompactContractState.deserialize(currentSnapshot.contractState.serialize());
                nextContractState.data = new ChargedState(callTxData.public.nextContractState);
                return nextContractState;
              })(),
            }
          : currentSnapshot,
      );
      setTodoInput('');
      setFeedback('TODO submitted to the chain. Use refresh to pull the finalized value from the indexer.');
    } catch (submitError) {
      debugError('app', 'submitTodo:error', submitError);
      setError(submitError instanceof Error ? submitError.message : 'TODO submission failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const clearSavedContract = () => {
    window.localStorage.removeItem(CONTRACT_ADDRESS_STORAGE_KEY);
    setContractAddress('');
    setContractSnapshot(null);
    setCurrentTodo('');
    setLastTxId('');
    setFeedback('Saved contract address cleared. Deploy a fresh contract to continue.');
    setError('');
  };

  return (
    <main className="page">
      <section className="panel">
        <p className="eyebrow">1AM + Midnight</p>
        <h1>Minimal TODO dApp</h1>
        <p className="lead">Deploy one tiny contract, then store a single public TODO string on Midnight with 1AM.</p>

        <div className={`status status-${walletStatus}`}>{statusText}</div>

        <div className="actions">
          <button
            type="button"
            onClick={connectWallet}
            disabled={walletStatus !== 'detected' || busyAction !== null}
          >
            {busyAction === 'connect' ? 'Connecting...' : 'Connect 1AM'}
          </button>

          <button type="button" onClick={deployTodoContract} disabled={!session || busyAction !== null || !!contractAddress}>
            {busyAction === 'deploy' ? 'Deploying...' : 'Deploy TODO Contract'}
          </button>

          <button type="button" onClick={() => session && contractAddress && refreshTodo(session, contractAddress)} disabled={!session || !contractAddress || busyAction !== null}>
            {busyAction === 'refresh' ? 'Refreshing...' : 'Refresh On-Chain TODO'}
          </button>
        </div>

        {session && (
          <dl className="details">
            <div>
              <dt>Network</dt>
              <dd>{session.config.networkId}</dd>
            </div>
            <div>
              <dt>Indexer</dt>
              <dd>{session.config.indexerUri}</dd>
            </div>
            <div>
              <dt>Unshielded address</dt>
              <dd>{session.unshieldedAddress}</dd>
            </div>
          </dl>
        )}

        <div className="stack">
          <div className="field">
            <label htmlFor="contract-address">Contract address</label>
            <input id="contract-address" value={contractAddress || 'Not deployed yet'} readOnly />
          </div>

          <div className="inline-actions">
            <button type="button" onClick={clearSavedContract} disabled={!contractAddress || busyAction !== null}>
              Forget Saved Contract
            </button>
          </div>

          <div className="field">
            <label htmlFor="todo-input">TODO text</label>
            <textarea
              id="todo-input"
              rows={4}
              value={todoInput}
              onChange={(event) => setTodoInput(event.target.value)}
              placeholder="Ship the first Midnight TODO"
              disabled={!session || !contractAddress || !contractSnapshot || busyAction !== null}
            />
          </div>

          <button
            type="button"
            onClick={submitTodo}
            disabled={!session || !contractAddress || !contractSnapshot || busyAction !== null}
          >
            {busyAction === 'submit' ? 'Submitting TODO...' : 'Store TODO On-Chain'}
          </button>
        </div>

        <dl className="details details-secondary">
          <div>
            <dt>Current on-chain TODO</dt>
            <dd>{currentTodo || 'Nothing stored yet.'}</dd>
          </div>
          <div>
            <dt>Last transaction id</dt>
            <dd>{lastTxId || 'No transaction submitted yet.'}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{feedback}</dd>
          </div>
        </dl>

        {error && <p className="error">{error}</p>}

        <div className="debug-panel">
          <div className="debug-header">
            <h2>Debug Log</h2>
            <button type="button" onClick={() => setDebugEntries([])} disabled={busyAction !== null && debugEntries.length === 0}>
              Clear Debug Log
            </button>
          </div>
          <div className="debug-log">
            {debugEntries.length === 0 ? (
              <p className="debug-empty">No debug entries yet.</p>
            ) : (
              debugEntries.map((entry, index) => (
                <pre className="debug-entry" key={`${entry.at}-${entry.scope}-${index}`}>
                  {JSON.stringify(entry, null, 2)}
                </pre>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
