import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sampleSigningKey } from '@midnight-ntwrk/compact-runtime';
import {
  createUnprovenCallTx,
  createUnprovenDeployTx,
  getPublicStates,
  submitTxAsync,
} from '@midnight-ntwrk/midnight-js-contracts';
import { APP_CONFIG, proofSimulatorDefaultContract } from '../../../config';
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
  const [addressInput, setAddressInput] = useState('');
  const [snapshotReady, setSnapshotReady] = useState(false);
  const [busyAction, setBusyAction] = useState<'connect' | 'deploy' | 'refresh' | 'run' | null>(null);
  const [feedback, setFeedback] = useState('Connect 1AM to load the harness.');
  const [error, setError] = useState('');
  const [results, setResults] = useState<Record<string, ProofRunResult>>({});
  const [rangeStart, setRangeStart] = useState(6);
  const [rangeEnd, setRangeEnd] = useState(17);
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
        setRangeEnd(Math.min(17, nextManifest.maxK));
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
      setFeedback('Harness ready.');
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
        const defaultAddress = proofSimulatorDefaultContract(oneAmSession.config.networkId);
        const storedAddress = readProofSimulatorContractAddress(oneAmSession.config.networkId);
        const initialAddress = storedAddress || defaultAddress;
        setSession(nextSession);
        setContractAddress(initialAddress);
        setAddressInput(initialAddress);
        setSnapshotReady(false);
        setFeedback(initialAddress ? 'Loading harness...' : 'Enter a harness address or deploy one.');
        if (initialAddress) void refreshSnapshot(nextSession, initialAddress, false);
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
      setAddressInput(nextAddress);
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

  const updateAddressInput = (value: string) => {
    setAddressInput(value.trim());
    if (value.trim() !== contractAddress) setSnapshotReady(false);
  };

  const loadAddress = async () => {
    if (!session) return false;
    const nextAddress = addressInput.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(nextAddress)) {
      setError('Enter a 64-character contract address.');
      return false;
    }
    writeProofSimulatorContractAddress(nextAddress, session.config.networkId);
    setContractAddress(nextAddress);
    setAddressInput(nextAddress);
    setResults({});
    return refreshSnapshot(session, nextAddress);
  };

  const useDefaultContract = async () => {
    if (!session) return false;
    const defaultAddress = proofSimulatorDefaultContract(session.config.networkId);
    if (!defaultAddress) return false;
    writeProofSimulatorContractAddress('', session.config.networkId);
    setContractAddress(defaultAddress);
    setAddressInput(defaultAddress);
    setSnapshotReady(false);
    setResults({});
    setError('');
    return refreshSnapshot(session, defaultAddress);
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
    addressInput,
    defaultContractAddress: proofSimulatorDefaultContract(session?.config.networkId),
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
    setAddressInput: updateAddressInput,
    loadAddress,
    useDefaultContract,
    refresh: () => session && contractAddress ? refreshSnapshot(session, contractAddress) : Promise.resolve(false),
    runSelected: () => runCircuits(selectedCircuits),
    runOne: (circuit: ProofCircuitManifest) => runCircuits([circuit]),
    requestStop: () => { stopRequested.current = true; },
    clearResults: () => setResults({}),
    copyResults,
  };
}
