import { useEffect, useMemo, useState } from 'react';
import {
  createUnprovenCallTx,
  createUnprovenDeployTx,
  getPublicStates,
  submitTxAsync,
} from '@midnight-ntwrk/midnight-js-contracts';
import { ChargedState, ContractState as CompactContractState, sampleSigningKey } from '@midnight-ntwrk/compact-runtime';
import { debugError, debugLog, subscribeDebugLogs, type DebugEntry } from '../../../debug';
import { createConnectedSession, type ConnectedSession } from '../../../midnight';
import { decryptTodoPayload, encryptTodoPayload, isEncryptedTodoPayload } from '../../../confidentialTodo';
import { compiledTodoContract, todoLedger } from '../../../todoContract';
import { compiledShieldedTodoContract } from '../../../shieldedTodoContract';
import { APP_CONFIG } from '../../../config';
import { defaultTaskFormState, makeTaskId, parseTagsInput, parseTaskPayload, serializeTaskPayload, toTaskSyncKey } from '../domain/taskPayload';
import {
  clearStoredShieldedPayload,
  PUBLIC_CONTRACT_ADDRESS_STORAGE_KEY,
  readStoredContractAddress,
  readStoredShieldedPayload,
  SHIELDED_CONTRACT_ADDRESS_STORAGE_KEY,
  writeStoredShieldedPayload,
} from '../data/taskStorage';
import type {
  AppTab,
  BusyAction,
  ContractSnapshot,
  Priority,
  PrivacyMode,
  StatusFilter,
  Task,
  TaskFormState,
  WalletStatus,
} from '../types';

const DETECT_TIMEOUT_MS = 6000;
const DETECT_INTERVAL_MS = 300;

function isMissingPublicStateError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('No public state found at contract address');
}

export function useTaskBoard() {
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

  const isConnected = session !== null;
  const isShieldedMode = privacyMode === 'shielded';
  const activeStorageKey = isShieldedMode ? SHIELDED_CONTRACT_ADDRESS_STORAGE_KEY : PUBLIC_CONTRACT_ADDRESS_STORAGE_KEY;

  const statusText = useMemo(() => {
    if (walletStatus === 'checking') return 'Checking for 1AM';
    return '1AM not found';
  }, [walletStatus]);

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

  const hasLoadedContractState = isShieldedMode || Boolean(contractSnapshot);
  const canDeploy = Boolean(session && busyAction === null && !contractAddress);
  const canRefresh = Boolean(session && contractAddress && busyAction === null);
  const canEditTasks = Boolean(session && contractAddress && hasLoadedContractState && busyAction === null);
  const canSave = Boolean(canEditTasks && hasUnsavedChanges);

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
      setFeedback(`Connecting to 1AM on ${APP_CONFIG.oneAmNetwork}...`);

      const api = await wallet.connect(APP_CONFIG.oneAmNetwork);
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

  const deployTaskContract = async () => {
    if (!session) {
      setError('Connect the wallet before deploying the contract.');
      return;
    }

    try {
      debugLog('app', 'deployTaskContract:start');
      setBusyAction('deploy');
      setError('');
      setFeedback(`Deploying the task contract to Midnight ${APP_CONFIG.oneAmNetwork}...`);

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
          clearContractState(
            `The new contract address never appeared in the ${APP_CONFIG.oneAmNetwork} indexer. Try deploying again.`,
          );
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

  const refreshCurrentTasks = async () => {
    if (!session || !contractAddress) {
      return;
    }

    await refreshTasks(session, contractAddress);
  };

  const clearDebugEntries = () => {
    setDebugEntries([]);
  };

  return {
    privacyMode,
    setPrivacyMode,
    confidentialMode,
    setConfidentialMode,
    walletStatus,
    statusText,
    isConnected,
    session,
    busyAction,
    contractAddress,
    tasks,
    editingTaskId,
    taskForm,
    setTaskForm,
    statusFilter,
    setStatusFilter,
    priorityFilter,
    setPriorityFilter,
    categoryFilter,
    setCategoryFilter,
    activeTab,
    setActiveTab,
    lastTxId,
    feedback,
    error,
    debugEntries,
    categories,
    filteredTasks,
    pendingCount,
    completedCount,
    hasUnsavedChanges,
    syncedTaskKeys,
    isShieldedMode,
    canDeploy,
    canRefresh,
    canEditTasks,
    canSave,
    connectWallet,
    deployTaskContract,
    queueTaskSave,
    refreshCurrentTasks,
    resetTaskForm,
    upsertTask,
    startEditingTask,
    toggleTaskCompletion,
    deleteTask,
    clearSavedContract,
    clearDebugEntries,
  };
}
