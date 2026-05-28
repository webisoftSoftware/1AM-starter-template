import { useEffect, useMemo, useState } from 'react';
import {
  createUnprovenCallTx,
  createUnprovenDeployTx,
  getPublicStates,
  submitTxAsync,
} from '@midnight-ntwrk/midnight-js-contracts';
import { ChargedState, ContractState as CompactContractState, sampleSigningKey } from '@midnight-ntwrk/compact-runtime';
import { debugError, debugLog, subscribeDebugLogs, type DebugEntry } from '../../../debug';
import { createTodoProviders, type TodoProvidersByMode } from '../../../midnight';
import type { OneAmSession } from '../../../oneAm';
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

type TaskContractSession = OneAmSession & {
  providersByMode: TodoProvidersByMode;
};

type UseTaskBoardOptions = {
  oneAmSession: OneAmSession | null;
  walletStatus: WalletStatus;
  statusText: string;
  connectWallet: () => void;
};

function isMissingPublicStateError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('No public state found at contract address');
}

export function useTaskBoard({ oneAmSession, walletStatus, statusText, connectWallet }: UseTaskBoardOptions) {
  const [privacyMode, setPrivacyMode] = useState<PrivacyMode>('unshielded');
  const [confidentialMode, setConfidentialMode] = useState(false);
  const [session, setSession] = useState<TaskContractSession | null>(null);
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
    let cancelled = false;

    if (!oneAmSession) {
      setSession(null);
      setFeedback('Connect 1AM to deploy the contract and manage your tasks.');
      return;
    }

    const initializeProviders = async () => {
      try {
        debugLog('tasks', 'providers:init:start');
        setBusyAction('connect');
        setError('');
        setFeedback('Preparing task contract providers...');
        const providersByMode = await createTodoProviders(oneAmSession);
        if (cancelled) {
          return;
        }

        const nextSession = { ...oneAmSession, providersByMode };
        setSession(nextSession);
        setFeedback('Wallet connected. Deploy the task contract once, then manage your task list.');

        if (contractAddress) {
          await refreshTasks(nextSession, contractAddress, false);
        }
      } catch (providerError) {
        debugError('tasks', 'providers:init:error', providerError);
        if (!cancelled) {
          setSession(null);
          setError(providerError instanceof Error ? providerError.message : 'Unable to initialize task providers.');
        }
      } finally {
        if (!cancelled) {
          setBusyAction(null);
        }
      }
    };

    void initializeProviders();

    return () => {
      cancelled = true;
    };
  }, [oneAmSession]);

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
    activeSession: TaskContractSession,
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
    activeSession: TaskContractSession,
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
    activeSession: TaskContractSession,
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

      const providers = activeSession.providersByMode[privacyMode];
      const publicStates = await getPublicStates(providers.publicDataProvider, activeContractAddress);
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

  const waitForContractSnapshot = async (activeSession: TaskContractSession, activeContractAddress: string) => {
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
      setFeedback(`Deploying the task contract to Midnight ${APP_CONFIG.oneAmNetwork}...`);

      const providers = session.providersByMode[privacyMode];
      const deployTxData = await createUnprovenDeployTx(
        {
          zkConfigProvider: providers.zkConfigProvider,
          walletProvider: providers.walletProvider,
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
          publicDataProvider: providers.publicDataProvider,
          zkConfigProvider: providers.zkConfigProvider,
          proofProvider: providers.proofProvider,
          walletProvider: providers.walletProvider,
          midnightProvider: providers.midnightProvider,
        },
        {
          unprovenTx: deployTxData.private.unprovenTx,
        },
      );
      debugLog('app', 'deployTaskContract:submitted', {
        contractAddress: deployTxData.public.contractAddress,
        txId,
      });

      await providers.privateStateProvider.setContractAddress(deployTxData.public.contractAddress);
      await providers.privateStateProvider.setSigningKey(
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
      const providers = session.providersByMode[privacyMode];

      const callTxData = await createUnprovenCallTx(providers, {
        compiledContract: isShieldedMode ? compiledShieldedTodoContract : compiledTodoContract,
        contractAddress,
        circuitId: 'storeTodo',
        args: [payloadForChain],
      });
      debugLog('app', 'saveTasks:unproven-created', {
        taskCount: tasks.length,
        payloadEncrypted: confidentialMode,
      });

      const txId = await submitTxAsync(providers, {
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
