import { useEffect, useMemo, useRef, useState } from 'react';
import { ChargedState, ContractState as CompactContractState, sampleSigningKey } from '@midnight-ntwrk/compact-runtime';
import {
  createUnprovenCallTx,
  createUnprovenDeployTx,
  getPublicStates,
  submitTxAsync,
} from '@midnight-ntwrk/midnight-js-contracts';
import { debugError, debugLog, subscribeDebugLogs, type DebugEntry } from '../../../debug';
import {
  compiledLeaderboardContract,
  createLeaderboardPrivateState,
  leaderboardLedger,
  LEADERBOARD_PRIVATE_STATE_ID,
  setLeaderboardCustomName,
} from '../../../leaderboardContract';
import { createLeaderboardProviders, waitForDeploySettled, type LeaderboardProviders } from '../../../midnight';
import type { OneAmSession } from '../../../oneAm';
import {
  leaderboardContractAddressStorageKey,
  readOrCreateLeaderboardSecret,
  readStoredLeaderboardContractAddress,
  writeStoredLeaderboardContractAddress,
} from '../data/leaderboardStorage';
import { decodeDisplayName } from '../domain/displayName';
import type {
  AppTab,
  BusyAction,
  ContractSnapshot,
  DisplayMode,
  LeaderboardEntry,
  WalletStatus,
} from '../types';

type LeaderboardSession = OneAmSession & {
  providers: LeaderboardProviders;
};

type UseLeaderboardOptions = {
  oneAmSession: OneAmSession | null;
  walletStatus: WalletStatus;
  statusText: string;
  connectWallet: () => void;
};

function isMissingPublicStateError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('No public state found at contract address');
}

function isValidContractAddress(value: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(value);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function friendlyError(error: unknown): string {
  const message = extractErrorMessage(error);
  if (message.includes('User rejected')) return 'Transaction cancelled.';
  if (message.includes('not the owner')) return 'This entry does not belong to your local leaderboard identity.';
  if (message.includes('entry not found')) return 'Entry not found on the leaderboard.';
  if (message.includes('Failed to fetch') || message.includes('Failed Proof Server')) {
    return 'Could not reach the proof server. Check your connection and try again.';
  }
  if (message.includes('mismatched verifier keys')) {
    return 'Contract version mismatch. Deploy a fresh leaderboard or load a matching contract.';
  }
  if (message.includes('submission') || message.includes('Submission')) {
    return 'Transaction failed to submit. Please try again.';
  }
  return message || 'An unexpected error occurred. Check the browser console for details.';
}

function extractErrorMessage(error: unknown): string {
  if (!error) return '';
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object') {
    const maybe = error as {
      message?: string;
      cause?: { message?: string; failure?: { message?: string; cause?: { message?: string } } };
    };
    if (maybe.message) return maybe.message;
    if (maybe.cause?.failure?.message) return maybe.cause.failure.message;
    if (maybe.cause?.failure?.cause?.message) return maybe.cause.failure.cause.message;
    if (maybe.cause?.message) return maybe.cause.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function parseLedgerEntries(ledgerState: ReturnType<typeof leaderboardLedger>): {
  entries: LeaderboardEntry[];
  entryCount: number;
} {
  const entries: LeaderboardEntry[] = [];

  for (const [key, entry] of ledgerState.scores) {
    const id = Number(key);
    const score = Number(entry.score);
    entries.push({
      id,
      rank: 0,
      score,
      displayName: decodeDisplayName(entry.displayName, id, score),
      ownerHash: toHex(entry.ownerHash),
    });
  }

  entries.sort((left, right) => right.score - left.score || left.id - right.id);
  return {
    entries: entries.map((entry, index) => ({ ...entry, rank: index + 1 })),
    entryCount: Number(ledgerState.nextId),
  };
}

export function useLeaderboard({
  oneAmSession,
  walletStatus,
  statusText,
  connectWallet,
}: UseLeaderboardOptions) {
  const privateState = useMemo(
    () => createLeaderboardPrivateState(readOrCreateLeaderboardSecret()),
    [],
  );
  const [session, setSession] = useState<LeaderboardSession | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [contractAddress, setContractAddress] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [contractSnapshot, setContractSnapshot] = useState<ContractSnapshot | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [entryCount, setEntryCount] = useState(0);
  const [activeTab, setActiveTab] = useState<AppTab>('play');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('anonymous');
  const [customName, setCustomName] = useState('');
  const [clicks, setClicks] = useState(0);
  const [timeLeft, setTimeLeft] = useState(10);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastScore, setLastScore] = useState(0);
  const [lastTxId, setLastTxId] = useState('');
  const [feedback, setFeedback] = useState('Connect 1AM to deploy or load a leaderboard contract.');
  const [error, setError] = useState('');
  const [verifyingEntryId, setVerifyingEntryId] = useState<number | null>(null);
  const [verifiedEntryIds, setVerifiedEntryIds] = useState<Set<number>>(() => new Set());
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([]);
  const timerRef = useRef<number | null>(null);
  const clickRef = useRef(0);

  useEffect(() => {
    const unsubscribe = subscribeDebugLogs((entry) => {
      setDebugEntries((current) => [entry, ...current].slice(0, 30));
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!oneAmSession) {
      setSession(null);
      setContractAddress('');
      setFeedback('Connect 1AM to deploy or load a leaderboard contract.');
      return;
    }

    const initializeProviders = async () => {
      try {
        debugLog('leaderboard', 'providers:init:start');
        setBusyAction('connect');
        setError('');
        setFeedback('Preparing leaderboard contract providers...');
        const providers = await createLeaderboardProviders(oneAmSession);
        if (cancelled) {
          return;
        }

        const nextSession = { ...oneAmSession, providers };
        setSession(nextSession);
        setFeedback('Wallet connected. Deploy a leaderboard or load an existing contract.');
      } catch (providerError) {
        debugError('leaderboard', 'providers:init:error', providerError);
        if (!cancelled) {
          setSession(null);
          setError(providerError instanceof Error ? providerError.message : 'Unable to initialize leaderboard providers.');
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

  useEffect(() => {
    const storedAddress = session ? readStoredLeaderboardContractAddress(session.config.networkId) : '';
    setContractAddress(storedAddress);
    setJoinInput('');
    setContractSnapshot(null);
    setEntries([]);
    setEntryCount(0);
    setLastTxId('');
    setVerifiedEntryIds(new Set());
    setError('');

    if (session && storedAddress) {
      void refreshLeaderboard(session, storedAddress, { showBusyState: false });
    }
  }, [session]);

  const validJoinInput = isValidContractAddress(joinInput.trim());
  const isConnected = session !== null;
  const canDeploy = Boolean(session && busyAction === null && !contractAddress);
  const canRefresh = Boolean(session && contractAddress && busyAction === null);
  const canLoadContract = Boolean(joinInput.trim() && validJoinInput && busyAction === null);
  const canSubmitScore = Boolean(
    session &&
      contractAddress &&
      contractSnapshot &&
      lastScore > 0 &&
      busyAction === null &&
      !isPlaying &&
      (displayMode !== 'custom' || customName.trim()),
  );
  const canVerifyEntries = Boolean(session && contractAddress && contractSnapshot && busyAction === null);

  const applyLedgerState = (stateData: Parameters<typeof leaderboardLedger>[0]) => {
    const parsed = parseLedgerEntries(leaderboardLedger(stateData));
    setEntries(parsed.entries);
    setEntryCount(parsed.entryCount);
  };

  const preparePrivateState = async (activeSession: LeaderboardSession, activeContractAddress: string) => {
    activeSession.providers.privateStateProvider.setContractAddress(activeContractAddress);
    await activeSession.providers.privateStateProvider.set(LEADERBOARD_PRIVATE_STATE_ID, privateState);
  };

  const refreshLeaderboard = async (
    activeSession = session,
    activeContractAddress = contractAddress,
    options: { showBusyState?: boolean; treatMissingAsTransient?: boolean } = {},
  ) => {
    const { showBusyState = true, treatMissingAsTransient = false } = options;
    if (!activeSession || !activeContractAddress) {
      setEntries([]);
      setEntryCount(0);
      setContractSnapshot(null);
      return false;
    }

    try {
      debugLog('leaderboard', 'refresh:start', { activeContractAddress });
      if (showBusyState) {
        setBusyAction('refresh');
      }

      await preparePrivateState(activeSession, activeContractAddress);
      const publicStates = await getPublicStates(activeSession.providers.publicDataProvider, activeContractAddress);
      applyLedgerState(publicStates.contractState.data);
      setContractSnapshot({
        contractState: publicStates.contractState,
        zswapChainState: publicStates.zswapChainState,
        ledgerParameters: publicStates.ledgerParameters,
      });
      setFeedback('Leaderboard state refreshed from the indexer.');
      setError('');
      debugLog('leaderboard', 'refresh:success', {
        activeContractAddress,
        entryCount: Number(leaderboardLedger(publicStates.contractState.data).nextId),
      });
      return true;
    } catch (refreshError) {
      if (isMissingPublicStateError(refreshError)) {
        // Expected while a freshly deployed contract is still settling on the
        // indexer. Log at debug level only and don't surface it as an error.
        debugLog('leaderboard', 'refresh:missing-public-state', { activeContractAddress });
        if (treatMissingAsTransient) {
          return false;
        }

        setFeedback('No indexed leaderboard state was found for this address. Wait for deployment or load another contract.');
        return false;
      }

      debugError('leaderboard', 'refresh:error', refreshError);
      setError(friendlyError(refreshError));
      return false;
    } finally {
      if (showBusyState) {
        setBusyAction(null);
      }
    }
  };

  const waitForLeaderboardSnapshot = async (activeSession: LeaderboardSession, activeContractAddress: string) => {
    // Wait for the deploy to settle via the indexer websocket subscription
    // instead of polling the GraphQL endpoint (which triggers rate limits).
    debugLog('leaderboard', 'waitForSnapshot:watch-start', { activeContractAddress });
    await waitForDeploySettled(activeSession.providers.publicDataProvider, activeContractAddress);

    // Whether the watch resolved or timed out, do a single query to load state.
    return refreshLeaderboard(activeSession, activeContractAddress, {
      showBusyState: false,
      treatMissingAsTransient: true,
    });
  };

  const deployLeaderboardContract = async () => {
    if (!session) {
      setError('Connect the wallet before deploying the leaderboard contract.');
      return;
    }

    try {
      debugLog('leaderboard', 'deploy:start');
      setBusyAction('deploy');
      setError('');
      setFeedback(`Deploying a leaderboard contract to Midnight ${session.config.networkId}...`);

      const signingKey = sampleSigningKey();
      const deployTxData = await createUnprovenDeployTx(
        {
          zkConfigProvider: session.providers.zkConfigProvider,
          walletProvider: session.providers.walletProvider,
        },
        {
          compiledContract: compiledLeaderboardContract,
          args: [],
          initialPrivateState: privateState,
          signingKey,
        },
      );
      debugLog('leaderboard', 'deploy:unproven-created', {
        contractAddress: deployTxData.public.contractAddress,
      });

      const txId = await submitTxAsync(session.providers, {
        unprovenTx: deployTxData.private.unprovenTx,
      });
      const nextContractAddress = deployTxData.public.contractAddress;
      await preparePrivateState(session, nextContractAddress);
      await session.providers.privateStateProvider.setSigningKey(nextContractAddress, deployTxData.private.signingKey);

      setContractAddress(nextContractAddress);
      setJoinInput('');
      setContractSnapshot(null);
      setEntries([]);
      setEntryCount(0);
      setLastTxId(txId ?? '');
      setVerifiedEntryIds(new Set());
      writeStoredLeaderboardContractAddress(nextContractAddress, session.config.networkId);
      setFeedback('Leaderboard deployment submitted. Loading indexed state...');
      debugLog('leaderboard', 'deploy:submitted', {
        contractAddress: nextContractAddress,
        txId,
      });

      const hydrated = await waitForLeaderboardSnapshot(session, nextContractAddress);
      if (hydrated) {
        setFeedback('Leaderboard deployed and ready for scores.');
      } else {
        setFeedback(
          `Deployment was submitted, but the ${session.config.networkId} indexer has not exposed the leaderboard yet. Use Refresh after the wallet transaction finishes.`,
        );
        setError('Indexed leaderboard state is still unavailable. The submitted contract address was kept for refresh.');
      }
    } catch (deployError) {
      debugError('leaderboard', 'deploy:error', deployError);
      setError(friendlyError(deployError));
    } finally {
      setBusyAction(null);
    }
  };

  const loadContractAddress = async () => {
    const nextContractAddress = joinInput.trim();
    if (!isValidContractAddress(nextContractAddress)) {
      setError('Enter a 64-character hex contract address.');
      return;
    }

    setContractAddress(nextContractAddress);
    setContractSnapshot(null);
    setEntries([]);
    setEntryCount(0);
    setVerifiedEntryIds(new Set());
    writeStoredLeaderboardContractAddress(nextContractAddress, session?.config.networkId);
    setJoinInput('');
    setError('');
    setFeedback('Leaderboard contract loaded. Refreshing indexed scores...');

    if (session) {
      await refreshLeaderboard(session, nextContractAddress);
    }
  };

  const clearSavedContract = () => {
    writeStoredLeaderboardContractAddress('', session?.config.networkId);
    setContractAddress('');
    setJoinInput('');
    setContractSnapshot(null);
    setEntries([]);
    setEntryCount(0);
    setLastTxId('');
    setVerifiedEntryIds(new Set());
    setError('');
    setFeedback('Saved leaderboard contract cleared. Deploy or load a contract to continue.');
  };

  const startGame = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
    }

    clickRef.current = 0;
    setClicks(0);
    setLastScore(0);
    setTimeLeft(10);
    setIsPlaying(true);
    setError('');
    setFeedback('Click challenge running.');

    timerRef.current = window.setInterval(() => {
      setTimeLeft((currentTimeLeft) => {
        if (currentTimeLeft <= 1) {
          if (timerRef.current !== null) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
          }
          setIsPlaying(false);
          setLastScore(clickRef.current);
          setFeedback('Round complete. Submit the score when the leaderboard contract is loaded.');
          return 0;
        }

        return currentTimeLeft - 1;
      });
    }, 1000);
  };

  const handleGameClick = () => {
    if (!isPlaying) {
      return;
    }

    clickRef.current += 1;
    setClicks(clickRef.current);
  };

  const submitScore = async () => {
    if (!session || !contractAddress) {
      setError('Connect the wallet and load a leaderboard contract before submitting a score.');
      return;
    }

    if (!contractSnapshot) {
      setError('Refresh the leaderboard contract state before submitting a score.');
      return;
    }

    if (lastScore <= 0) {
      setError('Complete a round before submitting a score.');
      return;
    }

    const displayName =
      displayMode === 'public'
        ? `${session.unshieldedAddress.slice(0, 12)}..${session.unshieldedAddress.slice(-12)}`
        : displayMode === 'custom'
          ? customName.trim()
          : '';

    if (displayMode === 'custom' && !displayName) {
      setError('Enter a display name before submitting a custom score.');
      return;
    }

    try {
      debugLog('leaderboard', 'submit:start', {
        contractAddress,
        score: lastScore,
        displayMode,
      });
      setBusyAction('submit');
      setError('');
      setFeedback('Proving, balancing, and submitting your score with 1AM...');
      setLeaderboardCustomName(displayName);
      await preparePrivateState(session, contractAddress);

      const callTxData = await createUnprovenCallTx(session.providers, {
        compiledContract: compiledLeaderboardContract,
        contractAddress,
        circuitId: 'submitScore',
        privateStateId: LEADERBOARD_PRIVATE_STATE_ID,
        args: [BigInt(lastScore), Boolean(displayName)],
      });
      const txId = await submitTxAsync(session.providers, {
        unprovenTx: callTxData.private.unprovenTx,
        circuitId: 'submitScore',
      });
      await session.providers.privateStateProvider.set(
        LEADERBOARD_PRIVATE_STATE_ID,
        callTxData.private.nextPrivateState,
      );

      applyLedgerState(callTxData.public.nextContractState);
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
      setLastTxId(txId ?? '');
      setLastScore(0);
      setClicks(0);
      setActiveTab('scores');
      setFeedback('Score submitted. Refresh later to confirm finalized indexed state.');
      debugLog('leaderboard', 'submit:submitted', { txId, score: lastScore });
      window.setTimeout(() => {
        void refreshLeaderboard(session, contractAddress, { showBusyState: false });
      }, 3000);
    } catch (submitError) {
      debugError('leaderboard', 'submit:error', submitError);
      setError(friendlyError(submitError));
    } finally {
      setBusyAction(null);
      setLeaderboardCustomName('');
    }
  };

  const verifyEntry = async (entryId: number) => {
    if (!session || !contractAddress) {
      setError('Connect the wallet and load a leaderboard contract before proving ownership.');
      return;
    }

    if (!contractSnapshot) {
      setError('Refresh the leaderboard contract state before proving ownership.');
      return;
    }

    try {
      debugLog('leaderboard', 'verify:start', { contractAddress, entryId });
      setBusyAction('verify');
      setVerifyingEntryId(entryId);
      setError('');
      setFeedback('Submitting ownership proof through 1AM...');
      await preparePrivateState(session, contractAddress);

      const callTxData = await createUnprovenCallTx(session.providers, {
        compiledContract: compiledLeaderboardContract,
        contractAddress,
        circuitId: 'verifyOwnership',
        privateStateId: LEADERBOARD_PRIVATE_STATE_ID,
        args: [BigInt(entryId)],
      });
      const txId = await submitTxAsync(session.providers, {
        unprovenTx: callTxData.private.unprovenTx,
        circuitId: 'verifyOwnership',
      });
      await session.providers.privateStateProvider.set(
        LEADERBOARD_PRIVATE_STATE_ID,
        callTxData.private.nextPrivateState,
      );

      setVerifiedEntryIds((current) => new Set(current).add(entryId));
      setLastTxId(txId ?? '');
      setFeedback('Ownership proof submitted for the selected entry.');
      debugLog('leaderboard', 'verify:submitted', { txId, entryId });
    } catch (verifyError) {
      debugError('leaderboard', 'verify:error', verifyError);
      setError(friendlyError(verifyError));
    } finally {
      setBusyAction(null);
      setVerifyingEntryId(null);
    }
  };

  const clearDebugEntries = () => {
    setDebugEntries([]);
  };

  return {
    walletStatus,
    statusText,
    connectWallet,
    session,
    isConnected,
    busyAction,
    contractAddress,
    joinInput,
    setJoinInput,
    validJoinInput,
    contractSnapshot,
    entries,
    entryCount,
    activeTab,
    setActiveTab,
    displayMode,
    setDisplayMode,
    customName,
    setCustomName,
    clicks,
    timeLeft,
    isPlaying,
    lastScore,
    lastTxId,
    feedback,
    error,
    verifyingEntryId,
    verifiedEntryIds,
    debugEntries,
    canDeploy,
    canRefresh,
    canLoadContract,
    canSubmitScore,
    canVerifyEntries,
    deployLeaderboardContract,
    loadContractAddress,
    clearSavedContract,
    refreshLeaderboard,
    startGame,
    handleGameClick,
    submitScore,
    verifyEntry,
    clearDebugEntries,
    storageKey: leaderboardContractAddressStorageKey(session?.config.networkId),
  };
}
