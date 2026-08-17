import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sampleSigningKey } from '@midnight-ntwrk/compact-runtime';
import type { UnprovenTransaction } from '@midnight-ntwrk/ledger-v8';
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
  type ProofSimulatorProofLane,
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
  ProofBenchmarkRun,
  ProofBenchmarkSample,
  ProofRunResult,
  ProofSimulatorManifest,
  ProofSimulatorMode,
  ProofTimingProfile,
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
  const [mode, setMode] = useState<ProofSimulatorMode>('quick');
  const [rangeStart, setRangeStart] = useState(6);
  const [rangeEnd, setRangeEnd] = useState(17);
  const [benchmarkK, setBenchmarkK] = useState(12);
  const [warmups, setWarmups] = useState(1);
  const [iterations, setIterations] = useState(5);
  const [timingProfile, setTimingProfile] = useState<ProofTimingProfile>('proof-only');
  const [loadWorkload, setLoadWorkload] = useState<'single' | 'mixed'>('single');
  const [loadK, setLoadK] = useState(12);
  const [loadRangeStart, setLoadRangeStart] = useState(8);
  const [loadRangeEnd, setLoadRangeEnd] = useState(16);
  const [loadRequests, setLoadRequests] = useState(8);
  const [concurrency, setConcurrency] = useState(2);
  const [benchmarkRun, setBenchmarkRun] = useState<ProofBenchmarkRun | null>(null);
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
        const defaultK = Math.min(12, nextManifest.maxK);
        setBenchmarkK(defaultK);
        setLoadK(defaultK);
        setLoadRangeStart(Math.min(8, nextManifest.maxK));
        setLoadRangeEnd(Math.min(16, nextManifest.maxK));
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
      const proofLane = session.providers.createProofLane();
      const startedAt = performance.now();
      try {
        const callTxData = await createUnprovenCallTx(session.providers, {
          compiledContract: compiledProofSimulatorContract,
          contractAddress,
          circuitId: circuit.circuitId,
          args: [randomFieldVector(circuit.inputLength)],
        } as any);
        await proofLane.proofProvider.proveTx(callTxData.private.unprovenTx);
        const buildAndProveMs = performance.now() - startedAt;
        const proofMetrics = proofLane.consumeProofMetrics();
        const passed: ProofRunResult = {
          circuitId: circuit.circuitId,
          k: circuit.actualK,
          status: 'passed',
          providerRoundTripMs: proofMetrics.reduce((sum, metric) => sum + metric.providerRoundTripMs, 0),
          proofBytes: proofMetrics.reduce((sum, metric) => sum + metric.proofBytes, 0),
          buildAndProveMs,
          timestamp: new Date().toISOString(),
        };
        setResults((current) => ({ ...current, [circuit.circuitId]: passed }));
        debugLog('proofSimulator', 'prove:success', passed);
      } catch (proveError) {
        const failed: ProofRunResult = {
          circuitId: circuit.circuitId,
          k: circuit.actualK,
          status: 'failed',
          buildAndProveMs: performance.now() - startedAt,
          timestamp: new Date().toISOString(),
          error: errorMessage(proveError),
        };
        proofLane.consumeProofMetrics();
        setResults((current) => ({ ...current, [circuit.circuitId]: failed }));
        debugError('proofSimulator', 'prove:error', proveError);
      }
    }

    setBusyAction(null);
    setFeedback(stopRequested.current ? 'Stopped after the current proof.' : 'Proof run finished. No test calls were broadcast.');
  };

  const createBenchmarkCall = async (circuit: ProofCircuitManifest): Promise<UnprovenTransaction> => {
    if (!session) throw new Error('Connect 1AM before running a benchmark.');
    const callTxData = await createUnprovenCallTx(session.providers, {
      compiledContract: compiledProofSimulatorContract,
      contractAddress,
      circuitId: circuit.circuitId,
      args: [randomFieldVector(circuit.inputLength)],
    } as any);
    return callTxData.private.unprovenTx;
  };

  const executeBenchmarkSample = async (
    circuit: ProofCircuitManifest,
    sample: number,
    warmup: boolean,
    profile: ProofTimingProfile,
    proofLane: ProofSimulatorProofLane,
    preparedTx?: UnprovenTransaction,
    batch?: number,
    slot?: number,
  ): Promise<ProofBenchmarkSample> => {
    const endToEndStartedAt = performance.now();
    let proveStartedAt: number | undefined;
    try {
      const unprovenTx = preparedTx ?? await createBenchmarkCall(circuit);
      proofLane.consumeProofMetrics();
      proveStartedAt = performance.now();
      await proofLane.proofProvider.proveTx(unprovenTx);
      const proveTxMs = performance.now() - proveStartedAt;
      const proofMetrics = proofLane.consumeProofMetrics();
      return {
        sample,
        circuitId: circuit.circuitId,
        k: circuit.actualK,
        warmup,
        status: 'passed',
        batch,
        slot,
        proveTxMs,
        providerRoundTripMs: proofMetrics.reduce((sum, metric) => sum + metric.providerRoundTripMs, 0),
        endToEndMs: profile === 'end-to-end' ? performance.now() - endToEndStartedAt : undefined,
        proofBytes: proofMetrics.reduce((sum, metric) => sum + metric.proofBytes, 0),
        timestamp: new Date().toISOString(),
      };
    } catch (sampleError) {
      proofLane.consumeProofMetrics();
      return {
        sample,
        circuitId: circuit.circuitId,
        k: circuit.actualK,
        warmup,
        status: 'failed',
        batch,
        slot,
        proveTxMs: proveStartedAt === undefined ? undefined : performance.now() - proveStartedAt,
        endToEndMs: profile === 'end-to-end' ? performance.now() - endToEndStartedAt : undefined,
        timestamp: new Date().toISOString(),
        error: errorMessage(sampleError),
      };
    }
  };

  const runPerformanceTest = async (
    runMode: 'benchmark' | 'load',
    circuits: ProofCircuitManifest[],
    measuredCount: number,
    workerCount: number,
  ) => {
    if (!session || !contractAddress || !snapshotReady || circuits.length === 0) return;
    const runId = crypto.randomUUID();
    const nextRun: ProofBenchmarkRun = {
      id: runId,
      mode: runMode,
      status: 'running',
      timingProfile,
      circuitKs: circuits.map((circuit) => circuit.actualK),
      warmups,
      iterations: measuredCount,
      concurrency: workerCount,
      startedAt: new Date().toISOString(),
      samples: [],
    };
    const appendSample = (sample: ProofBenchmarkSample) => {
      nextRun.samples.push(sample);
      setBenchmarkRun({ ...nextRun, samples: [...nextRun.samples] });
    };
    const replaceSample = (sample: ProofBenchmarkSample) => {
      const sampleIndex = nextRun.samples.findIndex(
        (candidate) => candidate.warmup === sample.warmup && candidate.sample === sample.sample,
      );
      if (sampleIndex >= 0) nextRun.samples[sampleIndex] = sample;
      else nextRun.samples.push(sample);
      setBenchmarkRun({ ...nextRun, samples: [...nextRun.samples] });
    };
    let runFailed = false;

    stopRequested.current = false;
    setBenchmarkRun(nextRun);
    setBusyAction('run');
    setError('');
    setCopyFeedback('');
    setFeedback(`Warming up ${circuits.length === 1 ? `k=${circuits[0].actualK}` : 'the mixed workload'}...`);

    try {
      const warmupLane = session.providers.createProofLane();
      for (let index = 0; index < warmups && !stopRequested.current; index += 1) {
        const circuit = circuits[index % circuits.length];
        const preparedTx = timingProfile === 'proof-only' ? await createBenchmarkCall(circuit) : undefined;
        appendSample(await executeBenchmarkSample(circuit, index + 1, true, timingProfile, warmupLane, preparedTx));
      }

      if (stopRequested.current) {
        nextRun.measuredElapsedMs = 0;
        return;
      }

      const jobs = Array.from({ length: measuredCount }, (_, index) => ({
        index,
        circuit: circuits[index % circuits.length],
      }));
      const prepared: Array<(typeof jobs)[number] & { tx: UnprovenTransaction | undefined }> = [];
      for (const job of jobs) {
        if (stopRequested.current) break;
        prepared.push({
          ...job,
          tx: timingProfile === 'proof-only' ? await createBenchmarkCall(job.circuit) : undefined,
        });
      }
      if (stopRequested.current) {
        nextRun.measuredElapsedMs = 0;
        return;
      }

      setFeedback(runMode === 'load'
        ? `Running ${measuredCount} requests with concurrency ${workerCount}...`
        : `Measuring ${measuredCount} proof${measuredCount === 1 ? '' : 's'}...`);
      const measuredStartedAt = performance.now();
      const proofLanes = Array.from({ length: workerCount }, () => session.providers.createProofLane());
      prepared.forEach((job, index) => appendSample({
        sample: job.index + 1,
        circuitId: job.circuit.circuitId,
        k: job.circuit.actualK,
        warmup: false,
        status: 'queued',
        batch: runMode === 'load' ? Math.floor(index / workerCount) + 1 : undefined,
        slot: runMode === 'load' ? index % workerCount + 1 : undefined,
        timestamp: new Date().toISOString(),
      }));
      for (let offset = 0; offset < prepared.length && !stopRequested.current; offset += workerCount) {
        const batchJobs = prepared.slice(offset, offset + workerCount);
        const batch = Math.floor(offset / workerCount) + 1;
        if (runMode === 'load') {
          setFeedback(`Running batch ${batch} of ${Math.ceil(prepared.length / workerCount)} · ${batchJobs.length} request${batchJobs.length === 1 ? '' : 's'} together...`);
        }
        batchJobs.forEach((job, slotIndex) => replaceSample({
          sample: job.index + 1,
          circuitId: job.circuit.circuitId,
          k: job.circuit.actualK,
          warmup: false,
          status: 'running',
          batch: runMode === 'load' ? batch : undefined,
          slot: runMode === 'load' ? slotIndex + 1 : undefined,
          timestamp: new Date().toISOString(),
        }));
        const completedBatch = await Promise.all(batchJobs.map((job, slotIndex) => executeBenchmarkSample(
          job.circuit,
          job.index + 1,
          false,
          timingProfile,
          proofLanes[slotIndex],
          job.tx,
          runMode === 'load' ? batch : undefined,
          runMode === 'load' ? slotIndex + 1 : undefined,
        )));
        completedBatch.forEach(replaceSample);
      }
      nextRun.measuredElapsedMs = performance.now() - measuredStartedAt;
    } catch (runError) {
      runFailed = true;
      setError(errorMessage(runError));
      debugError('proofSimulator', 'benchmark:error', runError);
    } finally {
      nextRun.status = stopRequested.current ? 'stopped' : runFailed ? 'failed' : 'completed';
      nextRun.finishedAt = new Date().toISOString();
      setBenchmarkRun({ ...nextRun, samples: [...nextRun.samples] });
      setBusyAction(null);
      setFeedback(stopRequested.current
        ? 'Stopped. Active proof requests were allowed to finish.'
        : 'Benchmark finished. No test calls were balanced or broadcast.');
      debugLog('proofSimulator', 'benchmark:complete', nextRun);
    }
  };

  const selectedCircuits = useMemo(
    () => manifest?.circuits.filter((circuit) => circuit.actualK >= rangeStart && circuit.actualK <= rangeEnd) ?? [],
    [manifest, rangeEnd, rangeStart],
  );

  const circuitForK = useCallback(
    (k: number) => manifest?.circuits.find((circuit) => circuit.actualK === k),
    [manifest],
  );

  const loadCircuits = useMemo(() => {
    if (!manifest) return [];
    if (loadWorkload === 'single') {
      const circuit = manifest.circuits.find((candidate) => candidate.actualK === loadK);
      return circuit ? [circuit] : [];
    }
    return manifest.circuits.filter(
      (circuit) => circuit.actualK >= loadRangeStart && circuit.actualK <= loadRangeEnd,
    );
  }, [loadK, loadRangeEnd, loadRangeStart, loadWorkload, manifest]);

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
    setBenchmarkRun(null);
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
    setBenchmarkRun(null);
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
      benchmarkRun,
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
    mode,
    setMode,
    rangeStart,
    setRangeStart,
    rangeEnd,
    setRangeEnd,
    selectedCircuits,
    benchmarkK,
    setBenchmarkK,
    warmups,
    setWarmups,
    iterations,
    setIterations,
    timingProfile,
    setTimingProfile,
    loadWorkload,
    setLoadWorkload,
    loadK,
    setLoadK,
    loadRangeStart,
    setLoadRangeStart,
    loadRangeEnd,
    setLoadRangeEnd,
    loadRequests,
    setLoadRequests,
    concurrency,
    setConcurrency,
    benchmarkRun,
    loadCircuits,
    copyFeedback,
    deploy,
    setAddressInput: updateAddressInput,
    loadAddress,
    useDefaultContract,
    refresh: () => session && contractAddress ? refreshSnapshot(session, contractAddress) : Promise.resolve(false),
    runSelected: () => runCircuits(selectedCircuits),
    runOne: (circuit: ProofCircuitManifest) => runCircuits([circuit]),
    runBenchmark: () => {
      const circuit = circuitForK(benchmarkK);
      return circuit ? runPerformanceTest('benchmark', [circuit], iterations, 1) : Promise.resolve();
    },
    runLoadTest: () => runPerformanceTest('load', loadCircuits, loadRequests, concurrency),
    requestStop: () => { stopRequested.current = true; },
    clearResults: () => setResults({}),
    clearBenchmark: () => setBenchmarkRun(null),
    copyResults,
  };
}
