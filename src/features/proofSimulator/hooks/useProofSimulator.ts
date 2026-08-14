import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sampleSigningKey } from '@midnight-ntwrk/compact-runtime';
import {
  createUnprovenCallTx,
  createUnprovenDeployTx,
  getPublicStates,
  submitTxAsync,
} from '@midnight-ntwrk/midnight-js-contracts';
import { APP_CONFIG } from '../../../config';
import { debugError, debugLog } from '../../../debug';
import {
  createProofSimulatorProviders,
  waitForDeploySettled,
  type ProofSimulatorCircuitKey,
  type ProofSimulatorProviders,
} from '../../../midnight';
import type { OneAmSession } from '../../../oneAm';
import { compiledProofSimulatorContract } from '../../../proofSimulatorContract';
import {
  readProofSimulatorContractAddress,
  writeProofSimulatorContractAddress,
} from '../data/proofSimulatorStorage';
import type {
  ProofCircuitManifest,
  ProofRunResult,
  ProofSimulatorManifest,
  WalletStatus,
} from '../types';

type ProofSimulatorSession = OneAmSession & { providers: ProofSimulatorProviders };

type UseProofSimulatorOptions = {
  oneAmSession: OneAmSession | null;
  walletStatus: WalletStatus;
  statusText: string;
  connectWallet: () => void;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function randomFieldVector(length: number): bigint[] {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  let state = random[0] || 0x9e3779b9;
  const values = new Array<bigint>(length);
  for (let index = 0; index < length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    values[index] = BigInt(state >>> 0);
  }
  return values;
}

export function useProofSimulator({
  oneAmSession,
  walletStatus,
  statusText,
  connectWallet,
}: UseProofSimulatorOptions) {
  const [session, setSession] = useState<ProofSimulatorSession | null>(null);
  const [manifest, setManifest] = useState<ProofSimulatorManifest | null>(null);
  const [contractAddress, setContractAddress] = useState('');
  const [snapshotReady, setSnapshotReady] = useState(false);
  const [busyAction, setBusyAction] = useState<'connect' | 'deploy' | 'refresh' | 'run' | null>(null);
  const [feedback, setFeedback] = useState('Connect 1AM to deploy the proof harness.');
  const [error, setError] = useState('');
  const [results, setResults] = useState<Record<string, ProofRunResult>>({});
  const [rangeStart, setRangeStart] = useState(6);
  const [rangeEnd, setRangeEnd] = useState(20);
  const [copyFeedback, setCopyFeedback] = useState('');
  const stopRequested = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const loadManifest = async () => {
      try {
        const url = new URL(`${APP_CONFIG.zkProofSimulatorAssetBasePath}/manifest.json`, window.location.origin);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Manifest request failed with HTTP ${response.status}.`);
        const nextManifest = (await response.json()) as ProofSimulatorManifest;
        if (!nextManifest.complete) throw new Error('Proof simulator manifest does not include proving keys.');
        if (cancelled) return;
        setManifest(nextManifest);
        setRangeStart(nextManifest.minK);
        setRangeEnd(nextManifest.maxK);
      } catch (manifestError) {
        if (!cancelled) setError(`Unable to load proof simulator artifacts: ${errorMessage(manifestError)}`);
      }
    };
    void loadManifest();
    return () => { cancelled = true; };
  }, []);

  const refreshSnapshot = useCallback(async (
    activeSession: ProofSimulatorSession,
    activeAddress: string,
    showBusy = true,
  ) => {
    try {
      if (showBusy) setBusyAction('refresh');
      await activeSession.providers.privateStateProvider.setContractAddress(activeAddress);
      await getPublicStates(activeSession.providers.publicDataProvider, activeAddress);
      setSnapshotReady(true);
      setError('');
      setFeedback('Proof harness state loaded. Select one k or a range to prove.');
      return true;
    } catch (refreshError) {
      setSnapshotReady(false);
      setError(errorMessage(refreshError));
      return false;
    } finally {
      if (showBusy) setBusyAction(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!oneAmSession || !manifest) {
      setSession(null);
      return;
    }

    const initialize = async () => {
      try {
        setBusyAction('connect');
        setError('');
        const providers = await createProofSimulatorProviders(oneAmSession);
        if (cancelled) return;
        const nextSession = { ...oneAmSession, providers };
        const storedAddress = readProofSimulatorContractAddress(oneAmSession.config.networkId);
        setSession(nextSession);
        setContractAddress(storedAddress);
        setSnapshotReady(false);
        setFeedback(storedAddress ? 'Loading the saved proof harness...' : 'Wallet connected. Deploy the proof harness once.');
        if (storedAddress) void refreshSnapshot(nextSession, storedAddress, false);
      } catch (providerError) {
        if (!cancelled) setError(errorMessage(providerError));
      } finally {
        if (!cancelled) setBusyAction(null);
      }
    };
    void initialize();
    return () => { cancelled = true; };
  }, [manifest, oneAmSession, refreshSnapshot]);

  const deploy = async () => {
    if (!session) return;
    try {
      setBusyAction('deploy');
      setError('');
      setFeedback(`Deploying the proof harness to Midnight ${session.config.networkId}...`);
      const deployTxData = await createUnprovenDeployTx(
        {
          zkConfigProvider: session.providers.zkConfigProvider,
          walletProvider: session.providers.walletProvider,
        },
        {
          compiledContract: compiledProofSimulatorContract,
          args: [],
          signingKey: sampleSigningKey(),
        },
      );
      const txId = await submitTxAsync(session.providers, { unprovenTx: deployTxData.private.unprovenTx });
      const nextAddress = deployTxData.public.contractAddress;
      await session.providers.privateStateProvider.setContractAddress(nextAddress);
      await session.providers.privateStateProvider.setSigningKey(nextAddress, deployTxData.private.signingKey);
      writeProofSimulatorContractAddress(nextAddress, session.config.networkId);
      setContractAddress(nextAddress);
      setSnapshotReady(false);
      setFeedback(`Deployment submitted${txId ? ` (${txId})` : ''}. Waiting for indexed state...`);
      await waitForDeploySettled(session.providers.publicDataProvider, nextAddress);
      await refreshSnapshot(session, nextAddress, false);
    } catch (deployError) {
      debugError('proofSimulator', 'deploy:error', deployError);
      setError(errorMessage(deployError));
    } finally {
      setBusyAction(null);
    }
  };

  const runCircuits = async (circuits: ProofCircuitManifest[]) => {
    if (!session || !contractAddress || !snapshotReady) return;
    stopRequested.current = false;
    setBusyAction('run');
    setError('');
    setCopyFeedback('');

    for (const circuit of circuits) {
      if (stopRequested.current) break;
      const running: ProofRunResult = { circuitId: circuit.circuitId, k: circuit.actualK, status: 'running' };
      setResults((current) => ({ ...current, [circuit.circuitId]: running }));
      setFeedback(`Creating a genuine k=${circuit.actualK} proof through 1AM...`);
      session.providers.consumeProofMetrics();
      const startedAt = performance.now();
      try {
        const callTxData = await createUnprovenCallTx(session.providers, {
          compiledContract: compiledProofSimulatorContract,
          contractAddress,
          circuitId: circuit.circuitId,
          args: [randomFieldVector(circuit.inputLength)],
        } as any);
        await session.providers.proofProvider.proveTx(callTxData.private.unprovenTx);
        const totalDurationMs = performance.now() - startedAt;
        const proofMetrics = session.providers.consumeProofMetrics();
        const passed: ProofRunResult = {
          circuitId: circuit.circuitId,
          k: circuit.actualK,
          status: 'passed',
          proofDurationMs: proofMetrics.reduce((sum, metric) => sum + metric.durationMs, 0),
          proofBytes: proofMetrics.reduce((sum, metric) => sum + metric.proofBytes, 0),
          totalDurationMs,
          timestamp: new Date().toISOString(),
        };
        setResults((current) => ({ ...current, [circuit.circuitId]: passed }));
        debugLog('proofSimulator', 'prove:success', passed);
      } catch (proveError) {
        const failed: ProofRunResult = {
          circuitId: circuit.circuitId,
          k: circuit.actualK,
          status: 'failed',
          totalDurationMs: performance.now() - startedAt,
          timestamp: new Date().toISOString(),
          error: errorMessage(proveError),
        };
        session.providers.consumeProofMetrics();
        setResults((current) => ({ ...current, [circuit.circuitId]: failed }));
        debugError('proofSimulator', 'prove:error', proveError);
      }
    }

    setBusyAction(null);
    setFeedback(stopRequested.current ? 'Stopped after the current proof.' : 'Proof run finished. No test calls were broadcast.');
  };

  const selectedCircuits = useMemo(
    () => manifest?.circuits.filter((circuit) => circuit.actualK >= rangeStart && circuit.actualK <= rangeEnd) ?? [],
    [manifest, rangeEnd, rangeStart],
  );

  const clearContract = () => {
    writeProofSimulatorContractAddress('', session?.config.networkId);
    setContractAddress('');
    setSnapshotReady(false);
    setResults({});
    setFeedback('Saved proof harness cleared. Deploy a new one to continue.');
    setError('');
  };

  const copyResults = async () => {
    await navigator.clipboard.writeText(JSON.stringify({
      network: session?.config.networkId,
      contractAddress,
      manifest: manifest ? {
        compilerVersion: manifest.compilerVersion,
        minK: manifest.minK,
        maxK: manifest.maxK,
      } : null,
      results: manifest?.circuits.map((circuit) => results[circuit.circuitId] ?? {
        circuitId: circuit.circuitId,
        k: circuit.actualK,
        status: 'idle',
      }),
    }, null, 2));
    setCopyFeedback('Results copied.');
  };

  return {
    walletStatus,
    statusText,
    connectWallet,
    session,
    manifest,
    contractAddress,
    snapshotReady,
    busyAction,
    feedback,
    error,
    results,
    rangeStart,
    setRangeStart,
    rangeEnd,
    setRangeEnd,
    selectedCircuits,
    copyFeedback,
    deploy,
    refresh: () => session && contractAddress ? refreshSnapshot(session, contractAddress) : Promise.resolve(false),
    clearContract,
    runSelected: () => runCircuits(selectedCircuits),
    runOne: (circuit: ProofCircuitManifest) => runCircuits([circuit]),
    requestStop: () => { stopRequested.current = true; },
    clearResults: () => setResults({}),
    copyResults,
  };
}
