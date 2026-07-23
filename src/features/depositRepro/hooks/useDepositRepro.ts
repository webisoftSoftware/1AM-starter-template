import { useCallback, useEffect, useMemo, useState } from 'react';
import { sampleSigningKey } from '@midnight-ntwrk/compact-runtime';
import {
  createUnprovenCallTx,
  createUnprovenDeployTx,
  getPublicStates,
} from '@midnight-ntwrk/midnight-js-contracts';
import {
  decodeContractAddress,
  encodeContractAddress,
  encodeRawTokenType,
  type ContractAddress,
  type RawTokenType,
  type UnprovenTransaction,
} from '@midnight-ntwrk/ledger-v8';
import { APP_CONFIG } from '../../../config';
import {
  compiledShieldedDepositOnlyContract,
  compiledShieldedMintDepositContract,
  depositOnlyLedger,
  mintDepositLedger,
} from '../../../depositReproContracts';
import { debugError, debugLog, stringifyDebugValue, subscribeDebugLogs, type DebugEntry } from '../../../debug';
import {
  createDepositOnlyProviders,
  createMintDepositProviders,
  waitForDeploySettled,
  type DepositOnlyProviders,
  type MintDepositProviders,
} from '../../../midnight';
import { getAvailableShieldedMintToken, shieldedMintTokenType, type OneAmSession } from '../../../oneAm';
import { decodeShieldedCoinPublicKey } from '../../mint/domain/shieldedAddress';
import {
  DEPOSIT_ONLY_CONTRACT_ADDRESS_STORAGE_KEY,
  depositReproContractAddressStorageKey,
  MINT_DEPOSIT_CONTRACT_ADDRESS_STORAGE_KEY,
  readStoredDepositOnlyContractAddress,
  readStoredMintDepositContractAddress,
  writeStoredDepositOnlyContractAddress,
  writeStoredMintDepositContractAddress,
} from '../data/depositReproStorage';
import type {
  BusyAction,
  ContractSnapshot,
  DepositOnlyLedgerView,
  DepositReproStepId,
  DepositReproStepStatus,
  MintDepositLedgerView,
  WalletStatus,
} from '../types';

type DepositReproSession = OneAmSession & {
  mintDepositProviders: MintDepositProviders;
  depositOnlyProviders: DepositOnlyProviders;
};

type UseDepositReproOptions = {
  oneAmSession: OneAmSession | null;
  walletStatus: WalletStatus;
  statusText: string;
  connectWallet: () => void;
};

type TxLifecycleProviders = Pick<MintDepositProviders, 'proofProvider' | 'walletProvider' | 'midnightProvider'>;

type StageContext = {
  step?: string;
  network?: string;
  mintContractAddress?: string;
  depositOnlyContractAddress?: string;
  tokenColor?: string;
  amount?: string;
  circuitId?: string;
  txId?: string;
  nonce?: string;
};

type StageContextExtra = Omit<StageContext, 'step'>;

type ShieldedCoinArgument = {
  nonce: Uint8Array;
  color: Uint8Array;
  value: bigint;
};

type TokenBalanceStatus = 'idle' | 'loading' | 'loaded' | 'unavailable' | 'error';

const STEP_LABELS: Record<DepositReproStepId, string> = {
  deployMintDeposit: 'Deploy mint+deposit',
  mint: 'Mint shielded token',
  sameDeposit: 'Same-contract deposit',
  deployDepositOnly: 'Deploy deposit-only',
  differentDeposit: 'Different-contract deposit',
};

const INITIAL_STEP_STATES = Object.fromEntries(
  Object.entries(STEP_LABELS).map(([id, label]) => [
    id,
    {
      label,
      status: 'idle',
    },
  ]),
) as Record<DepositReproStepId, DepositReproStepStatus>;

function isMissingPublicStateError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('No public state found at contract address');
}

function isValidContractAddress(value: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(value);
}

function randomNonce(): Uint8Array {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function transactionIdentifier(tx: { identifiers(): Iterable<unknown> }): string | undefined {
  try {
    const identifiers = Array.from(tx.identifiers());
    const identifier = identifiers[identifiers.length - 1];
    if (!identifier) {
      return undefined;
    }

    return identifier instanceof Uint8Array ? toHex(identifier) : String(identifier);
  } catch {
    return undefined;
  }
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

function stageLogContext(context: StageContext): Record<string, string> {
  return Object.fromEntries(Object.entries(context).filter(([, value]) => value !== undefined && value !== ''));
}

async function runDiagnosticStage<T>(stage: string, context: StageContext, action: () => Promise<T>): Promise<T> {
  const data = stageLogContext(context);
  debugLog('depositRepro', `${stage}:start`, data);

  try {
    const result = await action();
    debugLog('depositRepro', `${stage}:success`, data);
    return result;
  } catch (error) {
    debugError('depositRepro', `${stage}:error`, { ...data, error });
    throw error;
  }
}

function createDepositCoin(contractAddress: string, amount: bigint): ShieldedCoinArgument & { tokenColor: string } {
  const tokenColor = shieldedMintTokenType(contractAddress);
  return {
    nonce: randomNonce(),
    color: encodeRawTokenType(tokenColor as RawTokenType),
    value: amount,
    tokenColor,
  };
}

export function useDepositRepro({
  oneAmSession,
  walletStatus,
  statusText,
  connectWallet,
}: UseDepositReproOptions) {
  const [session, setSession] = useState<DepositReproSession | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [mintContractAddress, setMintContractAddress] = useState('');
  const [depositOnlyContractAddress, setDepositOnlyContractAddress] = useState('');
  const [mintLoadInput, setMintLoadInput] = useState('');
  const [depositOnlyLoadInput, setDepositOnlyLoadInput] = useState('');
  const [mintDepositSnapshot, setMintDepositSnapshot] = useState<ContractSnapshot | null>(null);
  const [depositOnlySnapshot, setDepositOnlySnapshot] = useState<ContractSnapshot | null>(null);
  const [mintDepositLedgerView, setMintDepositLedgerView] = useState<MintDepositLedgerView | null>(null);
  const [depositOnlyLedgerView, setDepositOnlyLedgerView] = useState<DepositOnlyLedgerView | null>(null);
  const [mintAmount, setMintAmount] = useState('100');
  const [depositAmount, setDepositAmount] = useState('10');
  const [availableMintTokenAtomic, setAvailableMintTokenAtomic] = useState<bigint | null>(null);
  const [tokenBalanceStatus, setTokenBalanceStatus] = useState<TokenBalanceStatus>('idle');
  const [tokenBalanceError, setTokenBalanceError] = useState('');
  const [lastTxId, setLastTxId] = useState('');
  const [stepStates, setStepStates] = useState<Record<DepositReproStepId, DepositReproStepStatus>>(
    () => INITIAL_STEP_STATES,
  );
  const [feedback, setFeedback] = useState(
    'Connect 1AM to run shielded mint and deposit transactions against the repro contracts.',
  );
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeDebugLogs((entry) => {
      setDebugEntries((current) => [entry, ...current].slice(0, 150));
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!oneAmSession) {
      setSession(null);
      setMintContractAddress('');
      setDepositOnlyContractAddress('');
      setAvailableMintTokenAtomic(null);
      setTokenBalanceStatus('idle');
      setTokenBalanceError('');
      setFeedback('Connect 1AM to run shielded mint and deposit transactions against the repro contracts.');
      return;
    }

    const initializeProviders = async () => {
      try {
        debugLog('depositRepro', 'providers:init:start', { network: oneAmSession.config.networkId });
        setBusyAction('connect');
        setError('');
        setFeedback('Preparing deposit repro providers...');

        const [mintDepositProviders, depositOnlyProviders] = await Promise.all([
          createMintDepositProviders(oneAmSession),
          createDepositOnlyProviders(oneAmSession),
        ]);
        if (cancelled) {
          return;
        }

        const nextSession = { ...oneAmSession, mintDepositProviders, depositOnlyProviders };
        setSession(nextSession);
        setFeedback('Wallet connected. Deploy or load the mint+deposit contract to start the repro.');
      } catch (providerError) {
        debugError('depositRepro', 'providers:init:error', providerError);
        if (!cancelled) {
          setSession(null);
          setError(providerError instanceof Error ? providerError.message : 'Unable to initialize deposit repro providers.');
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
    const storedMintContractAddress = session
      ? readStoredMintDepositContractAddress(session.config.networkId)
      : '';
    const storedDepositOnlyContractAddress = session
      ? readStoredDepositOnlyContractAddress(session.config.networkId)
      : '';

    setMintContractAddress(storedMintContractAddress);
    setDepositOnlyContractAddress(storedDepositOnlyContractAddress);
    setMintDepositSnapshot(null);
    setDepositOnlySnapshot(null);
    setMintDepositLedgerView(null);
    setDepositOnlyLedgerView(null);
    setAvailableMintTokenAtomic(null);
    setTokenBalanceStatus('idle');
    setTokenBalanceError('');
    setLastTxId('');

    if (session && storedMintContractAddress) {
      void refreshMintDeposit(session, storedMintContractAddress, { showBusyState: false });
    }

    if (session && storedDepositOnlyContractAddress) {
      void refreshDepositOnly(session, storedDepositOnlyContractAddress, { showBusyState: false });
    }
  }, [session]);

  const parsedMintAmount = useMemo(() => parseUint64Input(mintAmount), [mintAmount]);
  const parsedDepositAmount = useMemo(() => parseUint128Input(depositAmount), [depositAmount]);
  const tokenColor = useMemo(
    () => (mintContractAddress ? shieldedMintTokenType(mintContractAddress) : ''),
    [mintContractAddress],
  );
  const validMintLoadInput = isValidContractAddress(mintLoadInput.trim());
  const validDepositOnlyLoadInput = isValidContractAddress(depositOnlyLoadInput.trim());
  const isConnected = session !== null;
  const canDeployMintDeposit = Boolean(session && busyAction === null && !mintContractAddress);
  const canLoadMintDeposit = Boolean(session && busyAction === null && mintLoadInput.trim() && validMintLoadInput);
  const canRefreshMintDeposit = Boolean(session && busyAction === null && mintContractAddress);
  const canMint = Boolean(
    session && busyAction === null && mintContractAddress && mintDepositSnapshot && parsedMintAmount !== null,
  );
  const canSameContractDeposit = Boolean(
    session && busyAction === null && mintContractAddress && mintDepositSnapshot && parsedDepositAmount !== null,
  );
  const canDeployDepositOnly = Boolean(
    session && busyAction === null && mintContractAddress && !depositOnlyContractAddress,
  );
  const canLoadDepositOnly = Boolean(session && busyAction === null && depositOnlyLoadInput.trim() && validDepositOnlyLoadInput);
  const canRefreshDepositOnly = Boolean(session && busyAction === null && depositOnlyContractAddress);
  const canDifferentContractDeposit = Boolean(
    session &&
      busyAction === null &&
      mintContractAddress &&
      depositOnlyContractAddress &&
      depositOnlySnapshot &&
      parsedDepositAmount !== null,
  );
  const canRefreshTokenBalance = Boolean(
    session && busyAction === null && mintContractAddress && tokenBalanceStatus !== 'loading',
  );
  const availableMintToken =
    availableMintTokenAtomic === null ? null : `${availableMintTokenAtomic.toLocaleString('en-US')} tokens`;
  const hasEnoughDepositBalance = Boolean(
    parsedDepositAmount !== null &&
      availableMintTokenAtomic !== null &&
      availableMintTokenAtomic >= parsedDepositAmount,
  );

  const setStepState = useCallback((stepId: DepositReproStepId, patch: Partial<DepositReproStepStatus>) => {
    setStepStates((current) => ({
      ...current,
      [stepId]: {
        ...current[stepId],
        ...patch,
        at: new Date().toISOString(),
      },
    }));
  }, []);

  const baseContext = useCallback(
    (step: string, extra: StageContextExtra = {}): StageContext => ({
      step,
      network: session?.config.networkId,
      mintContractAddress,
      depositOnlyContractAddress,
      tokenColor,
      ...extra,
    }),
    [depositOnlyContractAddress, mintContractAddress, session?.config.networkId, tokenColor],
  );

  const refreshMintTokenBalance = useCallback(async () => {
    if (!session || !mintContractAddress) {
      setAvailableMintTokenAtomic(null);
      setTokenBalanceStatus('idle');
      setTokenBalanceError('');
      return null;
    }

    try {
      setTokenBalanceStatus('loading');
      setTokenBalanceError('');
      debugLog('depositRepro', 'tokenBalance:start', baseContext('tokenBalance'));
      const balance = await getAvailableShieldedMintToken(session.api, mintContractAddress);
      setAvailableMintTokenAtomic(balance);
      setTokenBalanceStatus('loaded');
      debugLog('depositRepro', 'tokenBalance:success', {
        ...baseContext('tokenBalance'),
        atomicValue: balance.toString(),
      });
      return balance;
    } catch (balanceLookupError) {
      debugError('depositRepro', 'tokenBalance:error', {
        ...baseContext('tokenBalance'),
        error: balanceLookupError,
      });
      setAvailableMintTokenAtomic(null);
      setTokenBalanceStatus(
        balanceLookupError instanceof Error && balanceLookupError.message.includes('does not expose')
          ? 'unavailable'
          : 'error',
      );
      setTokenBalanceError(
        balanceLookupError instanceof Error
          ? balanceLookupError.message
          : 'Unable to load the shielded mint token balance.',
      );
      return null;
    }
  }, [baseContext, mintContractAddress, session]);

  useEffect(() => {
    void refreshMintTokenBalance();
  }, [refreshMintTokenBalance]);

  const submitUnprovenWithDiagnostics = async (
    providers: TxLifecycleProviders,
    unprovenTx: UnprovenTransaction,
    context: StageContext,
  ) => {
    const stagePrefix = context.step ?? 'transaction';
    const provenTx = await runDiagnosticStage(`${stagePrefix}:proving`, context, () =>
      providers.proofProvider.proveTx(unprovenTx),
    );
    const balancedTx = await runDiagnosticStage(`${stagePrefix}:balanceUnsealedTransaction`, context, () =>
      providers.walletProvider.balanceTx(provenTx),
    );
    const txId = transactionIdentifier(balancedTx);
    const submitContext = { ...context, txId };
    const submittedTxId = await runDiagnosticStage(`${stagePrefix}:submitTransaction`, submitContext, () =>
      providers.midnightProvider.submitTx(balancedTx),
    );
    return submittedTxId || txId || '';
  };

  const refreshMintDeposit = async (
    activeSession = session,
    activeContractAddress = mintContractAddress,
    options: { showBusyState?: boolean; treatMissingAsTransient?: boolean } = {},
  ) => {
    const { showBusyState = true, treatMissingAsTransient = false } = options;
    if (!activeSession || !activeContractAddress) {
      setMintDepositSnapshot(null);
      setMintDepositLedgerView(null);
      return false;
    }

    try {
      if (showBusyState) {
        setBusyAction('refresh');
      }
      debugLog('depositRepro', 'mintDeposit:refresh:start', baseContext('mintDepositRefresh'));
      const publicStates = await getPublicStates(
        activeSession.mintDepositProviders.publicDataProvider,
        activeContractAddress,
      );
      const view = mintDepositLedger(publicStates.contractState.data);
      setMintDepositLedgerView({
        totalMinted: view.totalMinted,
        mintCount: view.mintCount,
        totalDeposited: view.totalDeposited,
        depositCount: view.depositCount,
      });
      setMintDepositSnapshot({
        contractState: publicStates.contractState,
        zswapChainState: publicStates.zswapChainState,
        ledgerParameters: publicStates.ledgerParameters,
      });
      debugLog('depositRepro', 'mintDeposit:refresh:success', {
        ...baseContext('mintDepositRefresh'),
        totalMinted: view.totalMinted.toString(),
        mintCount: view.mintCount.toString(),
        totalDeposited: view.totalDeposited.toString(),
        depositCount: view.depositCount.toString(),
      });
      return true;
    } catch (refreshError) {
      if (isMissingPublicStateError(refreshError)) {
        // Expected while a freshly deployed contract is still settling on the
        // indexer. Log at debug level only and don't surface it as an error.
        debugLog('depositRepro', 'mintDeposit:refresh:missing-public-state', baseContext('mintDepositRefresh'));
        if (treatMissingAsTransient) {
          return false;
        }
      } else {
        debugError('depositRepro', 'mintDeposit:refresh:error', {
          ...baseContext('mintDepositRefresh'),
          error: refreshError,
        });
      }
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to fetch mint+deposit ledger.');
      return false;
    } finally {
      if (showBusyState) {
        setBusyAction(null);
      }
    }
  };

  const refreshDepositOnly = async (
    activeSession = session,
    activeContractAddress = depositOnlyContractAddress,
    options: { showBusyState?: boolean; treatMissingAsTransient?: boolean } = {},
  ) => {
    const { showBusyState = true, treatMissingAsTransient = false } = options;
    if (!activeSession || !activeContractAddress) {
      setDepositOnlySnapshot(null);
      setDepositOnlyLedgerView(null);
      return false;
    }

    try {
      if (showBusyState) {
        setBusyAction('refresh');
      }
      debugLog('depositRepro', 'depositOnly:refresh:start', baseContext('depositOnlyRefresh'));
      const publicStates = await getPublicStates(activeSession.depositOnlyProviders.publicDataProvider, activeContractAddress);
      const view = depositOnlyLedger(publicStates.contractState.data);
      setDepositOnlyLedgerView({
        sourceContract: decodeContractAddress(view.sourceContract.bytes),
        totalDeposited: view.totalDeposited,
        depositCount: view.depositCount,
      });
      setDepositOnlySnapshot({
        contractState: publicStates.contractState,
        zswapChainState: publicStates.zswapChainState,
        ledgerParameters: publicStates.ledgerParameters,
      });
      debugLog('depositRepro', 'depositOnly:refresh:success', {
        ...baseContext('depositOnlyRefresh'),
        sourceContract: decodeContractAddress(view.sourceContract.bytes),
        totalDeposited: view.totalDeposited.toString(),
        depositCount: view.depositCount.toString(),
      });
      return true;
    } catch (refreshError) {
      if (isMissingPublicStateError(refreshError)) {
        // Expected while a freshly deployed contract is still settling on the
        // indexer. Log at debug level only and don't surface it as an error.
        debugLog('depositRepro', 'depositOnly:refresh:missing-public-state', baseContext('depositOnlyRefresh'));
        if (treatMissingAsTransient) {
          return false;
        }
      } else {
        debugError('depositRepro', 'depositOnly:refresh:error', {
          ...baseContext('depositOnlyRefresh'),
          error: refreshError,
        });
      }
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to fetch deposit-only ledger.');
      return false;
    } finally {
      if (showBusyState) {
        setBusyAction(null);
      }
    }
  };

  const waitForMintDepositSnapshot = async (activeSession: DepositReproSession, activeContractAddress: string) => {
    // Wait for the deploy to settle via the indexer websocket subscription
    // instead of polling the GraphQL endpoint (which triggers rate limits).
    debugLog('depositRepro', 'mintDeposit:waitForSnapshot:watch-start',
      baseContext('waitMintDepositSnapshot', { mintContractAddress: activeContractAddress }));
    await waitForDeploySettled(activeSession.mintDepositProviders.publicDataProvider, activeContractAddress);

    // Whether the watch resolved or timed out, do a single query to load state.
    return refreshMintDeposit(activeSession, activeContractAddress, {
      showBusyState: false,
      treatMissingAsTransient: true,
    });
  };

  const waitForDepositOnlySnapshot = async (activeSession: DepositReproSession, activeContractAddress: string) => {
    // Wait for the deploy to settle via the indexer websocket subscription
    // instead of polling the GraphQL endpoint (which triggers rate limits).
    debugLog('depositRepro', 'depositOnly:waitForSnapshot:watch-start',
      baseContext('waitDepositOnlySnapshot', { depositOnlyContractAddress: activeContractAddress }));
    await waitForDeploySettled(activeSession.depositOnlyProviders.publicDataProvider, activeContractAddress);

    // Whether the watch resolved or timed out, do a single query to load state.
    return refreshDepositOnly(activeSession, activeContractAddress, {
      showBusyState: false,
      treatMissingAsTransient: true,
    });
  };

  const deployMintDepositContract = async () => {
    if (!session) {
      setError('Connect the wallet before deploying the mint+deposit contract.');
      return;
    }

    const stepId: DepositReproStepId = 'deployMintDeposit';
    const step = STEP_LABELS[stepId];
    try {
      setBusyAction('deployMintDeposit');
      setStepState(stepId, { status: 'running', error: '', txId: '' });
      setError('');
      setFeedback(`Deploying mint+deposit contract to Midnight ${session.config.networkId}...`);
      const context = baseContext(step);

      const deployTxData = await runDiagnosticStage(`${step}:createUnprovenDeployTx`, context, () =>
        createUnprovenDeployTx(
          {
            zkConfigProvider: session.mintDepositProviders.zkConfigProvider,
            walletProvider: session.mintDepositProviders.walletProvider,
          },
          {
            compiledContract: compiledShieldedMintDepositContract,
            signingKey: sampleSigningKey(),
          },
        ),
      );
      const nextContractAddress = deployTxData.public.contractAddress;
      debugLog('depositRepro', 'mintDeposit:deploy:unproven-created', {
        ...context,
        mintContractAddress: nextContractAddress,
      });

      const txId = await submitUnprovenWithDiagnostics(
        session.mintDepositProviders,
        deployTxData.private.unprovenTx,
        baseContext(step, { mintContractAddress: nextContractAddress, txId: undefined }),
      );

      await session.mintDepositProviders.privateStateProvider.setContractAddress(nextContractAddress);
      await session.mintDepositProviders.privateStateProvider.setSigningKey(
        nextContractAddress,
        deployTxData.private.signingKey,
      );
      setMintContractAddress(nextContractAddress);
      setMintDepositSnapshot(null);
      setMintDepositLedgerView(null);
      writeStoredMintDepositContractAddress(nextContractAddress, session.config.networkId);
      setLastTxId(txId);
      setStepState(stepId, { status: 'success', txId, error: '' });
      setFeedback('Mint+deposit deployment submitted. Loading indexed ledger state...');

      const hydrated = await waitForMintDepositSnapshot(session, nextContractAddress);
      setFeedback(
        hydrated
          ? 'Mint+deposit contract is indexed. Mint shielded tokens, then run the same-contract deposits.'
          : 'Deployment was submitted, but the contract did not appear in the indexer within the polling window.',
      );
    } catch (deployError) {
      const message = extractErrorMessage(deployError) || 'Mint+deposit deployment failed.';
      setStepState(stepId, { status: 'error', error: message });
      setError(message);
    } finally {
      setBusyAction(null);
    }
  };

  const loadMintDepositContract = async () => {
    if (!session || !validMintLoadInput) {
      setError('Enter a valid 64-character mint+deposit contract address.');
      return;
    }

    const nextAddress = mintLoadInput.trim();
    try {
      setBusyAction('loadMintDeposit');
      setError('');
      setFeedback('Loading mint+deposit contract ledger...');
      setMintContractAddress(nextAddress);
      writeStoredMintDepositContractAddress(nextAddress, session.config.networkId);
      const loaded = await refreshMintDeposit(session, nextAddress, { showBusyState: false });
      if (loaded) {
        setMintLoadInput('');
        setFeedback('Mint+deposit contract loaded. Refresh token balance, mint, or deposit.');
      }
    } finally {
      setBusyAction(null);
    }
  };

  const mintShielded = async () => {
    if (!session || !mintContractAddress || !mintDepositSnapshot || parsedMintAmount === null) {
      setError('Load the mint+deposit contract and enter a valid mint amount.');
      return;
    }

    const stepId: DepositReproStepId = 'mint';
    const step = STEP_LABELS[stepId];
    try {
      setBusyAction('mint');
      setStepState(stepId, { status: 'running', error: '', txId: '' });
      setError('');
      setFeedback('Creating, proving, balancing, and submitting the shielded mint transaction...');

      const recipientBytes = decodeShieldedCoinPublicKey(
        session.shieldedAddress.shieldedCoinPublicKey,
        session.config.networkId,
      );
      const mintNonce = randomNonce();
      const context = baseContext(step, {
        amount: parsedMintAmount.toString(),
        circuitId: 'mintShielded',
        nonce: toHex(mintNonce),
      });

      const callTxData = await runDiagnosticStage(`${step}:createUnprovenCallTx`, context, () =>
        createUnprovenCallTx(session.mintDepositProviders, {
          compiledContract: compiledShieldedMintDepositContract,
          contractAddress: mintContractAddress,
          circuitId: 'mintShielded',
          args: [parsedMintAmount, mintNonce, { bytes: recipientBytes }],
        }),
      );

      const txId = await submitUnprovenWithDiagnostics(
        session.mintDepositProviders,
        callTxData.private.unprovenTx,
        context,
      );
      setLastTxId(txId);
      setStepState(stepId, { status: 'success', txId, error: '' });
      setFeedback(`Mint submitted for ${parsedMintAmount.toString()} shielded tokens.`);
      void refreshMintDeposit(session, mintContractAddress, { showBusyState: false });
      void refreshMintTokenBalance();
    } catch (mintError) {
      const message = extractErrorMessage(mintError) || 'Shielded mint failed.';
      setStepState(stepId, { status: 'error', error: message });
      setError(message);
    } finally {
      setBusyAction(null);
    }
  };

  const submitSameContractDeposit = async () => {
    if (!session || !mintContractAddress || !mintDepositSnapshot || parsedDepositAmount === null) {
      setError('Load the mint+deposit contract and enter a valid deposit amount.');
      return;
    }

    const stepId: DepositReproStepId = 'sameDeposit';
    const step = STEP_LABELS[stepId];
    try {
      setBusyAction(stepId);
      setStepState(stepId, { status: 'running', error: '', txId: '' });
      setError('');
      setFeedback(`${step}: creating a fresh ShieldedCoinInfo and submitting depositShielded...`);

      const latestBalance = await refreshMintTokenBalance();
      if (latestBalance !== null && latestBalance < parsedDepositAmount) {
        const message = `Wallet reports ${latestBalance.toString()} available tokens for this color; deposit needs ${parsedDepositAmount.toString()}. Wait for the mint to appear in the shielded balance, then refresh.`;
        debugLog('depositRepro', `${step}:preflight:insufficient-token-balance`, {
          ...baseContext(step, {
            amount: parsedDepositAmount.toString(),
            circuitId: 'depositShielded',
          }),
          availableMintToken: latestBalance.toString(),
        });
        setStepState(stepId, { status: 'error', error: message, txId: '' });
        setError(message);
        return;
      }

      const coin = createDepositCoin(mintContractAddress, parsedDepositAmount);
      const context = baseContext(step, {
        amount: parsedDepositAmount.toString(),
        circuitId: 'depositShielded',
        tokenColor: coin.tokenColor,
        nonce: toHex(coin.nonce),
      });
      const callTxData = await runDiagnosticStage(`${step}:createUnprovenCallTx`, context, () =>
        createUnprovenCallTx(session.mintDepositProviders, {
          compiledContract: compiledShieldedMintDepositContract,
          contractAddress: mintContractAddress,
          circuitId: 'depositShielded',
          args: [{ nonce: coin.nonce, color: coin.color, value: coin.value }],
        }),
      );

      const txId = await submitUnprovenWithDiagnostics(
        session.mintDepositProviders,
        callTxData.private.unprovenTx,
        context,
      );
      setLastTxId(txId);
      setStepState(stepId, { status: 'success', txId, error: '' });
      setFeedback(`${step} submitted for ${parsedDepositAmount.toString()} tokens.`);
      void refreshMintDeposit(session, mintContractAddress, { showBusyState: false });
      void refreshMintTokenBalance();
    } catch (depositError) {
      const message = extractErrorMessage(depositError) || `${step} failed.`;
      setStepState(stepId, { status: 'error', error: message });
      setError(message);
    } finally {
      setBusyAction(null);
    }
  };

  const deployDepositOnlyContract = async () => {
    if (!session || !mintContractAddress) {
      setError('Deploy or load the mint+deposit contract before deploying deposit-only.');
      return;
    }

    const stepId: DepositReproStepId = 'deployDepositOnly';
    const step = STEP_LABELS[stepId];
    try {
      setBusyAction('deployDepositOnly');
      setStepState(stepId, { status: 'running', error: '', txId: '' });
      setError('');
      setFeedback('Deploying deposit-only contract with the mint contract as source...');
      const sourceContract = { bytes: encodeContractAddress(mintContractAddress as ContractAddress) };
      const context = baseContext(step, { circuitId: 'constructor' });

      const deployTxData = await runDiagnosticStage(`${step}:createUnprovenDeployTx`, context, () =>
        createUnprovenDeployTx(
          {
            zkConfigProvider: session.depositOnlyProviders.zkConfigProvider,
            walletProvider: session.depositOnlyProviders.walletProvider,
          },
          {
            compiledContract: compiledShieldedDepositOnlyContract,
            signingKey: sampleSigningKey(),
            args: [sourceContract],
          },
        ),
      );
      const nextContractAddress = deployTxData.public.contractAddress;

      const txId = await submitUnprovenWithDiagnostics(
        session.depositOnlyProviders,
        deployTxData.private.unprovenTx,
        baseContext(step, { depositOnlyContractAddress: nextContractAddress, circuitId: 'constructor' }),
      );

      await session.depositOnlyProviders.privateStateProvider.setContractAddress(nextContractAddress);
      await session.depositOnlyProviders.privateStateProvider.setSigningKey(
        nextContractAddress,
        deployTxData.private.signingKey,
      );
      setDepositOnlyContractAddress(nextContractAddress);
      setDepositOnlySnapshot(null);
      setDepositOnlyLedgerView(null);
      writeStoredDepositOnlyContractAddress(nextContractAddress, session.config.networkId);
      setLastTxId(txId);
      setStepState(stepId, { status: 'success', txId, error: '' });
      setFeedback('Deposit-only deployment submitted. Loading indexed ledger state...');

      const hydrated = await waitForDepositOnlySnapshot(session, nextContractAddress);
      setFeedback(
        hydrated
          ? 'Deposit-only contract is indexed. Run the different-contract deposits with the same token color.'
          : 'Deployment was submitted, but the deposit-only contract did not appear in the indexer within the polling window.',
      );
    } catch (deployError) {
      const message = extractErrorMessage(deployError) || 'Deposit-only deployment failed.';
      setStepState(stepId, { status: 'error', error: message });
      setError(message);
    } finally {
      setBusyAction(null);
    }
  };

  const loadDepositOnlyContract = async () => {
    if (!session || !validDepositOnlyLoadInput) {
      setError('Enter a valid 64-character deposit-only contract address.');
      return;
    }

    const nextAddress = depositOnlyLoadInput.trim();
    try {
      setBusyAction('loadDepositOnly');
      setError('');
      setFeedback('Loading deposit-only contract ledger...');
      setDepositOnlyContractAddress(nextAddress);
      writeStoredDepositOnlyContractAddress(nextAddress, session.config.networkId);
      const loaded = await refreshDepositOnly(session, nextAddress, { showBusyState: false });
      if (loaded) {
        setDepositOnlyLoadInput('');
        setFeedback('Deposit-only contract loaded. Run the different-contract deposit steps.');
      }
    } finally {
      setBusyAction(null);
    }
  };

  const submitDifferentContractDeposit = async (
  ) => {
    if (!session || !mintContractAddress || !depositOnlyContractAddress || !depositOnlySnapshot || parsedDepositAmount === null) {
      setError('Load both contracts and enter a valid deposit amount.');
      return;
    }

    const stepId: DepositReproStepId = 'differentDeposit';
    const step = STEP_LABELS[stepId];
    try {
      setBusyAction(stepId);
      setStepState(stepId, { status: 'running', error: '', txId: '' });
      setError('');
      setFeedback(`${step}: creating a fresh ShieldedCoinInfo and submitting depositShielded...`);

      const latestBalance = await refreshMintTokenBalance();
      if (latestBalance !== null && latestBalance < parsedDepositAmount) {
        const message = `Wallet reports ${latestBalance.toString()} available tokens for this color; deposit needs ${parsedDepositAmount.toString()}. Wait for the mint to appear in the shielded balance, then refresh.`;
        debugLog('depositRepro', `${step}:preflight:insufficient-token-balance`, {
          ...baseContext(step, {
            amount: parsedDepositAmount.toString(),
            circuitId: 'depositShielded',
          }),
          availableMintToken: latestBalance.toString(),
        });
        setStepState(stepId, { status: 'error', error: message, txId: '' });
        setError(message);
        return;
      }

      const coin = createDepositCoin(mintContractAddress, parsedDepositAmount);
      const context = baseContext(step, {
        amount: parsedDepositAmount.toString(),
        circuitId: 'depositShielded',
        tokenColor: coin.tokenColor,
        nonce: toHex(coin.nonce),
      });
      const callTxData = await runDiagnosticStage(`${step}:createUnprovenCallTx`, context, () =>
        createUnprovenCallTx(session.depositOnlyProviders, {
          compiledContract: compiledShieldedDepositOnlyContract,
          contractAddress: depositOnlyContractAddress,
          circuitId: 'depositShielded',
          args: [{ nonce: coin.nonce, color: coin.color, value: coin.value }],
        }),
      );

      const txId = await submitUnprovenWithDiagnostics(
        session.depositOnlyProviders,
        callTxData.private.unprovenTx,
        context,
      );
      setLastTxId(txId);
      setStepState(stepId, { status: 'success', txId, error: '' });
      setFeedback(`${step} submitted for ${parsedDepositAmount.toString()} tokens.`);
      void refreshDepositOnly(session, depositOnlyContractAddress, { showBusyState: false });
      void refreshMintTokenBalance();
    } catch (depositError) {
      const message = extractErrorMessage(depositError) || `${step} failed.`;
      setStepState(stepId, { status: 'error', error: message });
      setError(message);
    } finally {
      setBusyAction(null);
    }
  };

  const clearMintDepositContract = () => {
    writeStoredMintDepositContractAddress('', session?.config.networkId);
    setMintContractAddress('');
    setMintDepositSnapshot(null);
    setMintDepositLedgerView(null);
    setAvailableMintTokenAtomic(null);
    setTokenBalanceStatus('idle');
    setTokenBalanceError('');
    setFeedback('Mint+deposit contract address cleared.');
  };

  const clearDepositOnlyContract = () => {
    writeStoredDepositOnlyContractAddress('', session?.config.networkId);
    setDepositOnlyContractAddress('');
    setDepositOnlySnapshot(null);
    setDepositOnlyLedgerView(null);
    setFeedback('Deposit-only contract address cleared.');
  };

  const clearRunLog = () => {
    setDebugEntries([]);
    setStepStates(INITIAL_STEP_STATES);
    setCopyStatus('');
  };

  const copyRunLog = async () => {
    try {
      const payload = {
        copiedAt: new Date().toISOString(),
        network: session?.config.networkId ?? APP_CONFIG.oneAmNetwork,
        mintContractAddress,
        depositOnlyContractAddress,
        tokenColor,
        mintAmount,
        depositAmount,
        stepStates,
        lastTxId,
        debugEntries,
      };
      await navigator.clipboard.writeText(stringifyDebugValue(payload));
      setCopyStatus('Diagnostics copied.');
    } catch (copyError) {
      const message = extractErrorMessage(copyError) || 'Unable to copy run log.';
      setCopyStatus(message);
      debugError('depositRepro', 'copyRunLog:error', copyError);
    }
  };

  return {
    walletStatus,
    statusText,
    isConnected,
    session,
    busyAction,
    mintContractAddress,
    depositOnlyContractAddress,
    mintLoadInput,
    setMintLoadInput,
    depositOnlyLoadInput,
    setDepositOnlyLoadInput,
    validMintLoadInput,
    validDepositOnlyLoadInput,
    mintDepositLedgerView,
    depositOnlyLedgerView,
    mintAmount,
    setMintAmount,
    depositAmount,
    setDepositAmount,
    parsedMintAmount,
    parsedDepositAmount,
    tokenColor,
    availableMintToken,
    tokenBalanceStatus,
    tokenBalanceError,
    hasEnoughDepositBalance,
    lastTxId,
    stepStates,
    feedback,
    error,
    copyStatus,
    debugEntries,
    canDeployMintDeposit,
    canLoadMintDeposit,
    canRefreshMintDeposit,
    canMint,
    canSameContractDeposit,
    canDeployDepositOnly,
    canLoadDepositOnly,
    canRefreshDepositOnly,
    canDifferentContractDeposit,
    canRefreshTokenBalance,
    connectWallet,
    deployMintDepositContract,
    loadMintDepositContract,
    refreshMintDeposit,
    mintShielded,
    submitSameContractDeposit,
    deployDepositOnlyContract,
    loadDepositOnlyContract,
    refreshDepositOnly,
    submitDifferentContractDeposit,
    refreshMintTokenBalance,
    clearMintDepositContract,
    clearDepositOnlyContract,
    clearRunLog,
    copyRunLog,
    storageKeys: {
      mintDeposit: depositReproContractAddressStorageKey(
        MINT_DEPOSIT_CONTRACT_ADDRESS_STORAGE_KEY,
        session?.config.networkId,
      ),
      depositOnly: depositReproContractAddressStorageKey(
        DEPOSIT_ONLY_CONTRACT_ADDRESS_STORAGE_KEY,
        session?.config.networkId,
      ),
    },
  };
}

function parseUint64Input(value: string): bigint | null {
  const parsed = parseUint128Input(value);
  if (parsed === null || parsed >= 1n << 64n) {
    return null;
  }
  return parsed;
}

function parseUint128Input(value: string): bigint | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^[0-9]+$/.test(trimmed)) return null;
  try {
    const parsed = BigInt(trimmed);
    if (parsed <= 0n) return null;
    if (parsed >= 1n << 128n) return null;
    return parsed;
  } catch {
    return null;
  }
}
