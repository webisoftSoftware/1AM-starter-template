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
import { decryptTodoPayload, encryptTodoPayload, isEncryptedTodoPayload } from './confidentialTodo';
import { compiledTodoContract, todoLedger } from './todoContract';
import { compiledShieldedTodoContract } from './shieldedTodoContract';

type WalletStatus = 'checking' | 'detected' | 'not-found';
type BusyAction = 'connect' | 'deploy' | 'submit' | 'refresh' | null;
type Priority = 'low' | 'medium' | 'high';
type StatusFilter = 'all' | 'pending' | 'completed';
type AppTab = 'add' | 'list' | 'debug';
type PrivacyMode = 'unshielded' | 'shielded';

type ContractSnapshot = {
  contractState: CompactContractState;
  zswapChainState: ZswapChainState;
  ledgerParameters: LedgerParameters;
};

type Task = {
  id: string;
  title: string;
  completed: boolean;
  dueDate: string | null;
  priority: Priority;
  category: string | null;
  tags: string[];
};

type TaskListPayload = {
  version: 1;
  tasks: Task[];
};

type StoredTaskTuple = [string, string, 0 | 1, string, 0 | 1 | 2, string, string];

type TaskFormState = {
  title: string;
  dueDate: string;
  priority: Priority;
  category: string;
  tags: string;
};

const DETECT_TIMEOUT_MS = 6000;
const DETECT_INTERVAL_MS = 300;
const PUBLIC_CONTRACT_ADDRESS_STORAGE_KEY = 'todo-contract-address-unshielded';
const SHIELDED_CONTRACT_ADDRESS_STORAGE_KEY = 'todo-contract-address-shielded';
const SHIELDED_PAYLOAD_STORAGE_PREFIX = 'todo-shielded-payload:';
const EMPTY_TASKS_PAYLOAD: TaskListPayload = { version: 1, tasks: [] };
const BRAND_LOGO_SRC = '/branding/1am-logo-black.svg';

function readStoredContractAddress(storageKey: string): string {
  return window.localStorage.getItem(storageKey) ?? '';
}

function shieldedPayloadStorageKey(contractAddress: string): string {
  return `${SHIELDED_PAYLOAD_STORAGE_PREFIX}${contractAddress}`;
}

function readStoredShieldedPayload(contractAddress: string): string {
  return window.localStorage.getItem(shieldedPayloadStorageKey(contractAddress)) ?? '';
}

function writeStoredShieldedPayload(contractAddress: string, payload: string): void {
  window.localStorage.setItem(shieldedPayloadStorageKey(contractAddress), payload);
}

function clearStoredShieldedPayload(contractAddress: string): void {
  if (!contractAddress) {
    return;
  }
  window.localStorage.removeItem(shieldedPayloadStorageKey(contractAddress));
}

function defaultTaskFormState(): TaskFormState {
  return {
    title: '',
    dueDate: '',
    priority: 'medium',
    category: '',
    tags: '',
  };
}

function normalizePriority(value: unknown): Priority {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }

  return 'medium';
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeTask(value: unknown, index: number): Task | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<Task>;
  if (typeof candidate.title !== 'string' || !candidate.title.trim()) {
    return null;
  }

  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `task-${index + 1}`,
    title: candidate.title.trim(),
    completed: Boolean(candidate.completed),
    dueDate: typeof candidate.dueDate === 'string' && candidate.dueDate ? candidate.dueDate : null,
    priority: normalizePriority(candidate.priority),
    category: typeof candidate.category === 'string' && candidate.category.trim() ? candidate.category.trim() : null,
    tags: normalizeStringArray(candidate.tags),
  };
}

function priorityToCode(priority: Priority): 0 | 1 | 2 {
  if (priority === 'low') return 0;
  if (priority === 'high') return 2;
  return 1;
}

function codeToPriority(value: unknown): Priority {
  if (value === 0) return 'low';
  if (value === 2) return 'high';
  return 'medium';
}

function decodeCompactTask(task: unknown, index: number): Task | null {
  if (!Array.isArray(task) || task.length < 7) {
    return null;
  }

  const [id, title, completed, dueDate, priority, category, tags] = task as StoredTaskTuple;
  if (typeof title !== 'string' || !title.trim()) {
    return null;
  }

  return {
    id: typeof id === 'string' && id ? id : `task-${index + 1}`,
    title: title.trim(),
    completed: completed === 1,
    dueDate: typeof dueDate === 'string' && dueDate ? dueDate : null,
    priority: codeToPriority(priority),
    category: typeof category === 'string' && category.trim() ? category.trim() : null,
    tags: typeof tags === 'string' && tags ? tags.split('|').map((tag) => tag.trim()).filter(Boolean) : [],
  };
}

function parseTaskPayload(rawValue: string): TaskListPayload {
  const payload = rawValue.trim();
  if (!payload) {
    return EMPTY_TASKS_PAYLOAD;
  }

  try {
    const parsed = JSON.parse(payload) as unknown;

    if (Array.isArray(parsed) && parsed[0] === 1 && Array.isArray(parsed[1])) {
      return {
        version: 1,
        tasks: parsed[1].map((task, index) => decodeCompactTask(task, index)).filter((task): task is Task => task !== null),
      };
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Task payload shape mismatch.');
    }

    const legacyPayload = parsed as Partial<TaskListPayload>;
    if (legacyPayload.version !== 1 || !Array.isArray(legacyPayload.tasks)) {
      throw new Error('Task payload shape mismatch.');
    }

    return {
      version: 1,
      tasks: legacyPayload.tasks.map((task, index) => normalizeTask(task, index)).filter((task): task is Task => task !== null),
    };
  } catch {
    return {
      version: 1,
      tasks: [
        {
          id: 'legacy-task',
          title: payload,
          completed: false,
          dueDate: null,
          priority: 'medium',
          category: null,
          tags: [],
        },
      ],
    };
  }
}

function serializeTaskPayload(tasks: Task[]): string {
  const compactTasks: StoredTaskTuple[] = tasks.map((task) => [
    task.id,
    task.title,
    task.completed ? 1 : 0,
    task.dueDate ?? '',
    priorityToCode(task.priority),
    task.category ?? '',
    task.tags.join('|'),
  ]);

  return JSON.stringify([1, compactTasks]);
}

function parseTagsInput(value: string): string[] {
  return Array.from(new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean)));
}

function makeTaskId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function toTaskSyncKey(task: Task): string {
  return JSON.stringify([
    task.id,
    task.title,
    task.completed,
    task.dueDate,
    task.priority,
    task.category,
    [...task.tags].sort(),
  ]);
}

function isMissingPublicStateError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('No public state found at contract address');
}

function App() {
  const [privacyMode, setPrivacyMode] = useState<PrivacyMode>('unshielded');
  const [confidentialMode, setConfidentialMode] = useState(false);
  const [walletStatus, setWalletStatus] = useState<WalletStatus>('checking');
  const [session, setSession] = useState<ConnectedSession | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [contractAddress, setContractAddress] = useState(() => readStoredContractAddress(PUBLIC_CONTRACT_ADDRESS_STORAGE_KEY));
  const [contractSnapshot, setContractSnapshot] = useState<ContractSnapshot | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [savedPayload, setSavedPayload] = useState(() => serializeTaskPayload([]));
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState<TaskFormState>(() => defaultTaskFormState());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<AppTab>('add');
  const [lastTxId, setLastTxId] = useState('');
  const [feedback, setFeedback] = useState('Connect 1AM to deploy the contract and manage your tasks.');
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
    if (walletStatus === 'checking') return 'Checking for 1AM';
    return '1AM not found';
  }, [walletStatus]);

  const isConnected = session !== null;
  const isShieldedMode = privacyMode === 'shielded';
  const activeStorageKey = isShieldedMode ? SHIELDED_CONTRACT_ADDRESS_STORAGE_KEY : PUBLIC_CONTRACT_ADDRESS_STORAGE_KEY;

  const categories = useMemo(
    () => Array.from(new Set(tasks.map((task) => task.category).filter((category): category is string => Boolean(category)))).sort(),
    [tasks],
  );

  const filteredTasks = useMemo(
    () =>
      tasks.filter((task) => {
        if (statusFilter === 'completed' && !task.completed) return false;
        if (statusFilter === 'pending' && task.completed) return false;
        if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
        if (categoryFilter !== 'all' && task.category !== categoryFilter) return false;
        return true;
      }),
    [tasks, statusFilter, priorityFilter, categoryFilter],
  );

  const pendingCount = useMemo(() => tasks.filter((task) => !task.completed).length, [tasks]);
  const completedCount = tasks.length - pendingCount;
  const nextPayload = useMemo(() => serializeTaskPayload(tasks), [tasks]);
  const hasUnsavedChanges = nextPayload !== savedPayload;
  const syncedTaskKeys = useMemo(
    () => new Set(parseTaskPayload(savedPayload).tasks.map((task) => toTaskSyncKey(task))),
    [savedPayload],
  );

  const resetTaskForm = () => {
    setTaskForm(defaultTaskFormState());
    setEditingTaskId(null);
  };

  const clearContractState = (feedbackMessage: string) => {
    window.localStorage.removeItem(activeStorageKey);
    if (isShieldedMode) {
      clearStoredShieldedPayload(contractAddress);
    }
    setContractAddress('');
    setContractSnapshot(null);
    setTasks([]);
    setSavedPayload(serializeTaskPayload([]));
    setLastTxId('');
    resetTaskForm();
    setFeedback(feedbackMessage);
  };

  const loadTasksFromPayload = (payloadValue: string) => {
    const parsed = parseTaskPayload(payloadValue);
    setTasks(parsed.tasks);
    setSavedPayload(serializeTaskPayload(parsed.tasks));
    resetTaskForm();
  };

  const maybeEncryptPayload = async (
    payloadValue: string,
    activeSession: ConnectedSession,
    activeContractAddress: string,
  ): Promise<string> => {
    if (!confidentialMode) {
      return payloadValue;
    }

    return encryptTodoPayload(payloadValue, {
      api: activeSession.api,
      networkId: activeSession.config.networkId,
      contractAddress: activeContractAddress,
    });
  };

  const maybeDecryptPayload = async (
    payloadValue: string,
    activeSession: ConnectedSession,
    activeContractAddress: string,
  ): Promise<string> => {
    if (!isEncryptedTodoPayload(payloadValue)) {
      return payloadValue;
    }

    return decryptTodoPayload(payloadValue, {
      api: activeSession.api,
      networkId: activeSession.config.networkId,
      contractAddress: activeContractAddress,
    });
  };

  useEffect(() => {
    const storedAddress = readStoredContractAddress(activeStorageKey);
    setContractAddress(storedAddress);
    setContractSnapshot(null);
    setTasks([]);
    setSavedPayload(serializeTaskPayload([]));
    setLastTxId('');
    resetTaskForm();
    setError('');
    setFeedback(
      isShieldedMode
        ? 'Shielded mode selected. Refresh reloads the shielded private snapshot stored on this device.'
        : 'Unshielded mode selected. Deploy or load a contract, then refresh indexed on-chain state.',
    );
  }, [activeStorageKey, isShieldedMode]);

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
      setFeedback('Wallet connected. Deploy the task contract once, then manage your task list.');

      if (contractAddress) {
        await refreshTasks(connectedSession, contractAddress, false);
      }
    } catch (connectError) {
      debugError('app', 'connectWallet:error', connectError);
      setError(connectError instanceof Error ? connectError.message : 'Connection failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const refreshTasks = async (
    activeSession: ConnectedSession,
    activeContractAddress: string,
    showBusyState = true,
  ) => {
    if (!activeContractAddress) {
      setTasks([]);
      setSavedPayload(serializeTaskPayload([]));
      return false;
    }

    try {
      debugLog('app', 'refreshTasks:start', { activeContractAddress });
      if (showBusyState) {
        setBusyAction('refresh');
      }

      if (isShieldedMode) {
        const shieldedPayload = readStoredShieldedPayload(activeContractAddress);
        if (!shieldedPayload) {
          setError('No local shielded state snapshot found for this contract. Save once from this wallet to initialize local refresh.');
          return false;
        }

        const decodedPayload = await maybeDecryptPayload(shieldedPayload, activeSession, activeContractAddress);
        loadTasksFromPayload(decodedPayload);
        setFeedback('Shielded task state reloaded from local private snapshot.');
        debugLog('app', 'refreshTasks:shielded-local-success', {
          activeContractAddress,
          payloadEncrypted: isEncryptedTodoPayload(shieldedPayload),
          taskCount: parseTaskPayload(decodedPayload).tasks.length,
        });
        return true;
      }

      const publicStates = await getPublicStates(activeSession.providers.publicDataProvider, activeContractAddress);
      const ledgerState = todoLedger(publicStates.contractState.data);
      const decodedPayload = await maybeDecryptPayload(ledgerState.todo, activeSession, activeContractAddress);
      loadTasksFromPayload(decodedPayload);
      setContractSnapshot({
        contractState: publicStates.contractState,
        zswapChainState: publicStates.zswapChainState,
        ledgerParameters: publicStates.ledgerParameters,
      });
      debugLog('app', 'refreshTasks:success', {
        activeContractAddress,
        payloadEncrypted: isEncryptedTodoPayload(ledgerState.todo),
        taskCount: parseTaskPayload(decodedPayload).tasks.length,
      });
      return true;
    } catch (refreshError) {
      debugError('app', 'refreshTasks:error', refreshError);
      if (isMissingPublicStateError(refreshError)) {
        clearContractState('No indexed contract state was found for the saved address. Deploy a fresh contract to continue.');
      }
      setError(
        refreshError instanceof Error ? refreshError.message : 'Unable to fetch the latest task list from the blockchain.',
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

      if (await refreshTasks(activeSession, activeContractAddress, false)) {
        return true;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }

    return false;
  };

  const deployTaskContract = async () => {
    if (!session) {
      setError('Connect the wallet before deploying the contract.');
      return;
    }

    try {
      debugLog('app', 'deployTaskContract:start');
      setBusyAction('deploy');
      setError('');
      setFeedback('Deploying the task contract to Midnight preview...');

      const deployTxData = await createUnprovenDeployTx(
        {
          zkConfigProvider: session.providers.zkConfigProvider,
          walletProvider: session.providers.walletProvider,
        },
        {
          compiledContract: isShieldedMode ? compiledShieldedTodoContract : compiledTodoContract,
          args: [serializeTaskPayload([])],
          signingKey: sampleSigningKey(),
        },
      );
      debugLog('app', 'deployTaskContract:unproven-created', {
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
      debugLog('app', 'deployTaskContract:submitted', {
        contractAddress: deployTxData.public.contractAddress,
        txId,
      });

      await session.providers.privateStateProvider.setContractAddress(deployTxData.public.contractAddress);
      await session.providers.privateStateProvider.setSigningKey(
        deployTxData.public.contractAddress,
        deployTxData.private.signingKey,
      );

      const nextContractAddress = deployTxData.public.contractAddress;
      setContractAddress(nextContractAddress);
      setContractSnapshot(null);
      setLastTxId(txId ?? '');
      setTasks([]);
      setSavedPayload(serializeTaskPayload([]));
      resetTaskForm();
      setFeedback('Contract deployment submitted. Loading the indexed task state...');
      window.localStorage.setItem(activeStorageKey, nextContractAddress);

      if (isShieldedMode) {
        writeStoredShieldedPayload(nextContractAddress, serializeTaskPayload([]));
        setFeedback('Shielded contract deployed. Local private snapshot initialized; refresh now reloads shielded state from this device.');
      } else {
        const hydrated = await waitForContractSnapshot(session, nextContractAddress);
        if (hydrated) {
          setFeedback('Contract deployed and state loaded. You can now manage tasks.');
        } else {
          clearContractState('The new contract address never appeared in the preview indexer. Try deploying again.');
          setError('Deployment did not produce indexed public state, so the provisional contract address was cleared.');
        }
      }
    } catch (deployError) {
      debugError('app', 'deployTaskContract:error', deployError);
      setError(deployError instanceof Error ? deployError.message : 'Contract deployment failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const queueTaskSave = async () => {
    if (!session) {
      setError('Connect the wallet before saving tasks.');
      return;
    }

    if (!contractAddress) {
      setError('Deploy the contract before saving tasks.');
      return;
    }

    if (!isShieldedMode && !contractSnapshot) {
      setError('Contract state is not loaded yet. Refresh the contract state and try again.');
      return;
    }

    try {
      debugLog('app', 'saveTasks:start', {
        contractAddress,
        taskCount: tasks.length,
        payloadLength: nextPayload.length,
        confidentialMode,
      });
      setBusyAction('submit');
      setError('');
      setFeedback('Proving, balancing, and submitting your updated task list with 1AM...');

      const payloadForChain = await maybeEncryptPayload(nextPayload, session, contractAddress);

      const callTxData = await createUnprovenCallTx(session.providers, {
        compiledContract: isShieldedMode ? compiledShieldedTodoContract : compiledTodoContract,
        contractAddress,
        circuitId: 'storeTodo',
        args: [payloadForChain],
      });
      debugLog('app', 'saveTasks:unproven-created', {
        taskCount: tasks.length,
        payloadEncrypted: confidentialMode,
      });

      const txId = await submitTxAsync(session.providers, {
        unprovenTx: callTxData.private.unprovenTx,
        circuitId: 'storeTodo',
      });
      debugLog('app', 'saveTasks:submitted', { txId });

      setLastTxId(txId);
      setSavedPayload(nextPayload);
      if (!isShieldedMode) {
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
      } else {
        writeStoredShieldedPayload(contractAddress, payloadForChain);
      }
      setFeedback(
        isShieldedMode
          ? `Shielded task update submitted${confidentialMode ? ' with confidential payload encryption' : ''}. Refresh reloads your local private snapshot.`
          : `Task list submitted on-chain${confidentialMode ? ' with confidential payload encryption' : ''}. Use refresh to pull the finalized indexed state.`,
      );
    } catch (submitError) {
      debugError('app', 'saveTasks:error', submitError);
      setError(submitError instanceof Error ? submitError.message : 'Task list submission failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const upsertTask = () => {
    const title = taskForm.title.trim();
    if (!title) {
      setError('Enter a task title before adding or updating a task.');
      return;
    }

    setError('');
    const dueDate = taskForm.dueDate || null;
    const category = taskForm.category.trim() || null;
    const tags = parseTagsInput(taskForm.tags);

    if (editingTaskId) {
      setTasks((currentTasks) =>
        currentTasks.map((task) =>
          task.id === editingTaskId
            ? {
                ...task,
                title,
                dueDate,
                priority: taskForm.priority,
                category,
                tags,
              }
            : task,
        ),
      );
      setFeedback('Task updated locally. Use Save Local Changes On-Chain to persist.');
    } else {
      setTasks((currentTasks) => [
        {
          id: makeTaskId(),
          title,
          completed: false,
          dueDate,
          priority: taskForm.priority,
          category,
          tags,
        },
        ...currentTasks,
      ]);
      setFeedback('Task added locally. Use Save Local Changes On-Chain to persist.');
    }

    resetTaskForm();
  };

  const startEditingTask = (task: Task) => {
    setEditingTaskId(task.id);
    setTaskForm({
      title: task.title,
      dueDate: task.dueDate ?? '',
      priority: task.priority,
      category: task.category ?? '',
      tags: task.tags.join(', '),
    });
    setActiveTab('add');
    setFeedback('Editing task locally in Add TODO. Save tasks on-chain when ready.');
    setError('');
  };

  const toggleTaskCompletion = (taskId: string) => {
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              completed: !task.completed,
            }
          : task,
      ),
    );
    setFeedback('Task status updated locally. Use Save Local Changes On-Chain to persist.');
  };

  const deleteTask = (taskId: string) => {
    setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
    if (editingTaskId === taskId) {
      resetTaskForm();
    }
    setFeedback('Task removed locally. Use Save Local Changes On-Chain to persist.');
  };

  const clearSavedContract = () => {
    clearContractState('Saved contract address cleared. Deploy a fresh contract to continue.');
    setError('');
  };

  return (
    <main className="page">
      <section className="panel">
        <header className="panel-top">
          <div className="brand-intro">
            <img className="brand-logo" src={BRAND_LOGO_SRC} alt="1AM" />
            <div>
              <p className="eyebrow">Preview Network</p>
              <h1>On-Chain Task Board</h1>
            </div>
          </div>
          <div className="panel-top-actions">
            {walletStatus === 'detected' ? (
              <button
                type="button"
                className={`connect-button ${isConnected ? 'button-connected' : 'button-primary'}`}
                onClick={connectWallet}
                disabled={busyAction !== null || isConnected}
              >
                {busyAction === 'connect' ? 'Connecting...' : isConnected ? 'Connected to 1 AM' : 'Connect 1AM'}
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

        <div className="tabs" role="tablist" aria-label="Task board sections">
          <button
            type="button"
            role="tab"
            className={`tab-button ${activeTab === 'add' ? 'tab-button-active' : ''}`}
            aria-selected={activeTab === 'add'}
            onClick={() => setActiveTab('add')}
          >
            Add TODO
          </button>
          <button
            type="button"
            role="tab"
            className={`tab-button ${activeTab === 'list' ? 'tab-button-active' : ''}`}
            aria-selected={activeTab === 'list'}
            onClick={() => setActiveTab('list')}
          >
            See TODOs
          </button>
          <button
            type="button"
            role="tab"
            className={`tab-button ${activeTab === 'debug' ? 'tab-button-active' : ''}`}
            aria-selected={activeTab === 'debug'}
            onClick={() => setActiveTab('debug')}
          >
            Debug
          </button>
        </div>

        <section className="tab-content">
          {activeTab === 'add' && (
            <div className="tab-pane tab-pane-scroll" role="tabpanel" aria-label="Add TODO tab">
              <div className="actions">
                <button
                  type="button"
                  className="button-primary"
                  onClick={deployTaskContract}
                  disabled={!session || busyAction !== null || !!contractAddress}
                >
                  {busyAction === 'deploy' ? 'Deploying...' : `Deploy ${isShieldedMode ? 'Shielded' : 'Unshielded'} Contract`}
                </button>

                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => session && contractAddress && refreshTasks(session, contractAddress)}
                  disabled={!session || !contractAddress || busyAction !== null}
                >
                  {busyAction === 'refresh' ? 'Refreshing...' : 'Refresh On-Chain Tasks'}
                </button>

                <button
                  type="button"
                  className="button-primary"
                  onClick={queueTaskSave}
                  disabled={
                    !session ||
                    !contractAddress ||
                    (!isShieldedMode && !contractSnapshot) ||
                    busyAction !== null ||
                    !hasUnsavedChanges
                  }
                >
                  {busyAction === 'submit' ? 'Saving...' : `Save ${isShieldedMode ? 'Shielded' : 'Unshielded'} Changes On-Chain`}
                </button>
              </div>

              <div className="inline-actions">
                <label>
                  <input
                    type="checkbox"
                    checked={isShieldedMode}
                    disabled={busyAction !== null}
                    onChange={(event) => setPrivacyMode(event.target.checked ? 'shielded' : 'unshielded')}
                  />{' '}
                  Post tasks as shielded contract
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={confidentialMode}
                    disabled={busyAction !== null || !session}
                    onChange={(event) => setConfidentialMode(event.target.checked)}
                  />{' '}
                  Encrypt TODO payload before posting
                </label>
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
                  <div>
                    <dt>Posting mode</dt>
                    <dd>{isShieldedMode ? 'Shielded contract' : 'Unshielded contract'}</dd>
                  </div>
                  <div>
                    <dt>Payload confidentiality</dt>
                    <dd>{confidentialMode ? 'Encrypted (wallet-signature key)' : 'Plaintext'}</dd>
                  </div>
                </dl>
              )}

              <div className="stack">
                <div className="field contract-address-row">
                  <label htmlFor="contract-address">Contract address ({isShieldedMode ? 'shielded' : 'unshielded'})</label>
                  <input
                    id="contract-address"
                    value={contractAddress || 'Not deployed yet'}
                    title={contractAddress || 'Not deployed yet'}
                    readOnly
                  />
                </div>

                <div className="inline-actions">
                  <button type="button" onClick={clearSavedContract} disabled={!contractAddress || busyAction !== null}>
                    Forget Saved Contract
                  </button>
                  <button type="button" onClick={resetTaskForm} disabled={busyAction !== null || !editingTaskId}>
                    Cancel Edit
                  </button>
                </div>

                <section className="composer composer-compact">
                  <div className="composer-header">
                    <h2>{editingTaskId ? 'Edit Task' : 'Add Task'}</h2>
                    <p>{editingTaskId ? 'Update the task locally, then save on-chain.' : 'Build your next task locally, then save on-chain.'}</p>
                  </div>

                  <div className="task-form-grid">
                    <div className="field field-wide">
                      <label htmlFor="task-title">Title</label>
                      <input
                        id="task-title"
                        value={taskForm.title}
                        onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))}
                        placeholder="Ship task editing on Midnight"
                        disabled={!session || !contractAddress || (!isShieldedMode && !contractSnapshot) || busyAction !== null}
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="task-due-date">Due date</label>
                      <input
                        id="task-due-date"
                        type="date"
                        value={taskForm.dueDate}
                        onChange={(event) => setTaskForm((current) => ({ ...current, dueDate: event.target.value }))}
                        disabled={!session || !contractAddress || (!isShieldedMode && !contractSnapshot) || busyAction !== null}
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="task-priority">Priority</label>
                      <select
                        id="task-priority"
                        value={taskForm.priority}
                        onChange={(event) => setTaskForm((current) => ({ ...current, priority: event.target.value as Priority }))}
                        disabled={!session || !contractAddress || (!isShieldedMode && !contractSnapshot) || busyAction !== null}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>

                    <div className="field">
                      <label htmlFor="task-category">Category</label>
                      <input
                        id="task-category"
                        value={taskForm.category}
                        onChange={(event) => setTaskForm((current) => ({ ...current, category: event.target.value }))}
                        placeholder="Product"
                        disabled={!session || !contractAddress || (!isShieldedMode && !contractSnapshot) || busyAction !== null}
                      />
                    </div>

                    <div className="field field-wide">
                      <label htmlFor="task-tags">Tags</label>
                      <input
                        id="task-tags"
                        value={taskForm.tags}
                        onChange={(event) => setTaskForm((current) => ({ ...current, tags: event.target.value }))}
                        placeholder="wallet, proofstation, midnight"
                        disabled={!session || !contractAddress || (!isShieldedMode && !contractSnapshot) || busyAction !== null}
                      />
                    </div>
                  </div>

                  <div className="inline-actions">
                    <button
                      type="button"
                      onClick={upsertTask}
                      disabled={!session || !contractAddress || (!isShieldedMode && !contractSnapshot) || busyAction !== null}
                    >
                      {editingTaskId ? 'Update Task Locally' : 'Add Task Locally'}
                    </button>
                  </div>
                </section>
              </div>
            </div>
          )}

          {activeTab === 'list' && (
            <div className="tab-pane tab-pane-scroll" role="tabpanel" aria-label="See TODOs tab">
              <dl className="details details-secondary summary-grid">
                <div>
                  <dt>Total tasks</dt>
                  <dd>{tasks.length}</dd>
                </div>
                <div>
                  <dt>Pending</dt>
                  <dd>{pendingCount}</dd>
                </div>
                <div>
                  <dt>Completed</dt>
                  <dd>{completedCount}</dd>
                </div>
                <div>
                  <dt>Unsaved changes</dt>
                  <dd>{hasUnsavedChanges ? 'Yes' : 'No'}</dd>
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

              <section className="chain-sync-panel">
                <p>Task edits are local first. Click save to commit local changes to the blockchain.</p>
                <div className="inline-actions chain-sync-actions">
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => session && contractAddress && refreshTasks(session, contractAddress)}
                    disabled={!session || !contractAddress || busyAction !== null}
                  >
                    {busyAction === 'refresh' ? 'Refreshing...' : 'Refresh On-Chain Tasks'}
                  </button>
                  <button
                    type="button"
                    className="button-primary"
                    onClick={queueTaskSave}
                    disabled={
                      !session ||
                      !contractAddress ||
                      (!isShieldedMode && !contractSnapshot) ||
                      busyAction !== null ||
                      !hasUnsavedChanges
                    }
                  >
                    {busyAction === 'submit' ? 'Saving...' : `Save ${isShieldedMode ? 'Shielded' : 'Unshielded'} Changes On-Chain`}
                  </button>
                </div>
              </section>

              <section className="filters">
                <div className="filter-grid">
                  <div className="field">
                    <label htmlFor="filter-status">Status</label>
                    <select id="filter-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                      <option value="all">All</option>
                      <option value="pending">Pending</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>

                  <div className="field">
                    <label htmlFor="filter-priority">Priority</label>
                    <select id="filter-priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as 'all' | Priority)}>
                      <option value="all">All</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>

                  <div className="field">
                    <label htmlFor="filter-category">Category</label>
                    <select id="filter-category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                      <option value="all">All</option>
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <section className="task-list-panel">
                <div className="task-list-header">
                  <h2>Tasks</h2>
                  <p>{filteredTasks.length} visible of {tasks.length} total</p>
                </div>

                {filteredTasks.length === 0 ? (
                  <p className="empty-state">No tasks match the current filters.</p>
                ) : (
                  <div className="task-list">
                    {filteredTasks.map((task) => (
                      <article
                        className={`task-card ${syncedTaskKeys.has(toTaskSyncKey(task)) ? 'task-card-synced' : 'task-card-local'} ${task.completed ? 'task-card-completed' : ''}`}
                        key={task.id}
                      >
                        <div className="task-main">
                          <div className="task-title-row">
                            <h3>{task.title}</h3>
                            <span className={`priority-chip priority-${task.priority}`}>{task.priority}</span>
                          </div>

                          <div className="meta-row">
                            <span>{task.completed ? 'Completed' : 'Pending'}</span>
                            <span>{task.category ?? 'No category'}</span>
                            <span>{task.dueDate ? `Due ${task.dueDate}` : 'No due date'}</span>
                          </div>

                          <div className="tag-row">
                            {task.tags.length === 0 ? (
                              <span className="tag-chip tag-chip-empty">No tags</span>
                            ) : (
                              task.tags.map((tag) => (
                                <span className="tag-chip" key={`${task.id}-${tag}`}>
                                  {tag}
                                </span>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="task-actions">
                          <button type="button" onClick={() => toggleTaskCompletion(task.id)} disabled={busyAction !== null}>
                            Mark {task.completed ? 'Incomplete' : 'Complete'} Locally
                          </button>
                          <button type="button" onClick={() => startEditingTask(task)} disabled={busyAction !== null}>
                            Edit Task Locally
                          </button>
                          <button type="button" onClick={() => deleteTask(task.id)} disabled={busyAction !== null}>
                            Delete Task Locally
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab === 'debug' && (
            <div className="tab-pane tab-pane-scroll" role="tabpanel" aria-label="Debug tab">
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
            </div>
          )}
        </section>

        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}

export default App;
