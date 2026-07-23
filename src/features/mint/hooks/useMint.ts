import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createUnprovenCallTx,
  createUnprovenDeployTx,
  getPublicStates,
  submitTxAsync,
} from '@midnight-ntwrk/midnight-js-contracts';
import { sampleSigningKey } from '@midnight-ntwrk/compact-runtime';
import { debugError, debugLog, subscribeDebugLogs, type DebugEntry } from '../../../debug';
import { createMintProviders, waitForDeploySettled, type MintProviders } from '../../../midnight';
import { getAvailableShieldedMintToken, type OneAmSession } from '../../../oneAm';
import { compiledShieldedMintContract, mintLedger } from '../../../mintContract';
import {
  mintContractAddressStorageKey,
  readStoredContractAddress,
  writeStoredContractAddress,
} from '../data/mintStorage';
import { decodeShieldedCoinPublicKey } from '../domain/shieldedAddress';
import type { AppTab, BusyAction, ContractSnapshot, LedgerView, WalletStatus } from '../types';

type MintSession = OneAmSession & {
  providers: MintProviders;
};

type UseMintOptions = {
  oneAmSession: OneAmSession | null;
  walletStatus: WalletStatus;
  statusText: string;
  connectWallet: () => void;
};

type MintTokenBalanceStatus = 'idle' | 'loading' | 'loaded' | 'unavailable' | 'error';

function isMissingPublicStateError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('No public state found at contract address');
}

function randomNonce(): Uint8Array {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function useMint({ oneAmSession, walletStatus, statusText, connectWallet }: UseMintOptions) {
  const [session, setSession] = useState<MintSession | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [contractAddress, setContractAddress] = useState('');
  const [contractSnapshot, setContractSnapshot] = useState<ContractSnapshot | null>(null);
  const [ledgerView, setLedgerView] = useState<LedgerView | null>(null);
  const [amount, setAmount] = useState('100');
  const [activeTab, setActiveTab] = useState<AppTab>('mint');
  const [lastTxId, setLastTxId] = useState('');
  const [availableMintTokenAtomic, setAvailableMintTokenAtomic] = useState<bigint | null>(null);
  const [mintTokenBalanceStatus, setMintTokenBalanceStatus] = useState<MintTokenBalanceStatus>('idle');
  const [mintTokenBalanceError, setMintTokenBalanceError] = useState('');
  const [feedback, setFeedback] = useState('Connect 1AM to deploy the mint contract and mint shielded tokens to your wallet.');
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
      setContractAddress('');
      setAvailableMintTokenAtomic(null);
      setMintTokenBalanceStatus('idle');
      setMintTokenBalanceError('');
      setFeedback('Connect 1AM to deploy the mint contract and mint shielded tokens to your wallet.');
      return;
    }

    const initializeProviders = async () => {
      try {
        debugLog('mint', 'providers:init:start');
        setBusyAction('connect');
        setError('');
        setFeedback('Preparing shielded mint providers...');
        const providers = await createMintProviders(oneAmSession);
        if (cancelled) {
          return;
        }

        const nextSession = { ...oneAmSession, providers };
        setSession(nextSession);
        setFeedback('Wallet connected. Deploy the mint contract once, then mint shielded tokens to your wallet.');
      } catch (providerError) {
        debugError('mint', 'providers:init:error', providerError);
        if (!cancelled) {
          setSession(null);
          setError(providerError instanceof Error ? providerError.message : 'Unable to initialize mint providers.');
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

  useEffect(() => {
    const storedAddress = session ? readStoredContractAddress(session.config.networkId) : '';
    setContractAddress(storedAddress);
    setContractSnapshot(null);
    setLedgerView(null);
    setLastTxId('');
    setAvailableMintTokenAtomic(null);
    setMintTokenBalanceStatus('idle');
    setMintTokenBalanceError('');

    if (session && storedAddress) {
      void refreshLedger(session, storedAddress, { showBusyState: false });
    }
  }, [session]);

  const refreshMintTokenBalance = useCallback(async () => {
    if (!session || !contractAddress) {
      setAvailableMintTokenAtomic(null);
      setMintTokenBalanceStatus('idle');
      setMintTokenBalanceError('');
      return;
    }

    try {
      setMintTokenBalanceStatus('loading');
      setMintTokenBalanceError('');
      debugLog('app', 'mintTokenBalance:start', { contractAddress });
      const balance = await getAvailableShieldedMintToken(session.api, contractAddress);
      setAvailableMintTokenAtomic(balance);
      setMintTokenBalanceStatus('loaded');
      debugLog('app', 'mintTokenBalance:success', {
        contractAddress,
        atomicValue: balance.toString(),
      });
    } catch (balanceLookupError) {
      debugError('app', 'mintTokenBalance:error', balanceLookupError);
      setAvailableMintTokenAtomic(null);
      setMintTokenBalanceStatus(
        balanceLookupError instanceof Error && balanceLookupError.message.includes('does not expose')
          ? 'unavailable'
          : 'error',
      );
      setMintTokenBalanceError(
        balanceLookupError instanceof Error
          ? balanceLookupError.message
          : 'Unable to load the shielded mint token balance.',
      );
    }
  }, [contractAddress, session]);

  useEffect(() => {
    void refreshMintTokenBalance();
  }, [refreshMintTokenBalance]);

  const parsedAmount = useMemo(() => {
    const trimmed = amount.trim();
    if (!trimmed) return null;
    if (!/^[0-9]+$/.test(trimmed)) return null;
    try {
      const value = BigInt(trimmed);
      if (value <= 0n) return null;
      if (value >= 1n << 64n) return null;
      return value;
    } catch {
      return null;
    }
  }, [amount]);

  const canDeploy = Boolean(session && busyAction === null && !contractAddress);
  const canRefresh = Boolean(session && contractAddress && busyAction === null);
  const canMint = Boolean(session && contractAddress && contractSnapshot && busyAction === null && parsedAmount !== null);
  const canRefreshMintTokenBalance = Boolean(
    session && contractAddress && busyAction === null && mintTokenBalanceStatus !== 'loading',
  );
  const availableMintToken =
    availableMintTokenAtomic === null ? null : `${availableMintTokenAtomic.toLocaleString('en-US')} tokens`;

  const clearContractState = (feedbackMessage: string) => {
    writeStoredContractAddress('', session?.config.networkId);
    setContractAddress('');
    setContractSnapshot(null);
    setLedgerView(null);
    setLastTxId('');
    setAvailableMintTokenAtomic(null);
    setMintTokenBalanceStatus('idle');
    setMintTokenBalanceError('');
    setFeedback(feedbackMessage);
  };

  const refreshLedger = async (
    activeSession: MintSession,
    activeContractAddress: string,
    options: { showBusyState?: boolean; treatMissingAsTransient?: boolean } = {},
  ) => {
    const { showBusyState = true, treatMissingAsTransient = false } = options;
    if (!activeContractAddress) {
      setLedgerView(null);
      return false;
    }

    try {
      debugLog('app', 'refreshLedger:start', { activeContractAddress });
      if (showBusyState) {
        setBusyAction('refresh');
      }

      const publicStates = await getPublicStates(activeSession.providers.publicDataProvider, activeContractAddress);
      const view = mintLedger(publicStates.contractState.data);
      setLedgerView({ totalMinted: view.totalMinted, mintCount: view.mintCount });
      setContractSnapshot({
        contractState: publicStates.contractState,
        zswapChainState: publicStates.zswapChainState,
        ledgerParameters: publicStates.ledgerParameters,
      });
      debugLog('app', 'refreshLedger:success', {
        activeContractAddress,
        totalMinted: view.totalMinted.toString(),
        mintCount: view.mintCount.toString(),
      });
      return true;
    } catch (refreshError) {
      if (isMissingPublicStateError(refreshError)) {
        // Expected while a freshly deployed contract is still settling on the
        // indexer. Log at debug level only and don't surface it as an error.
        debugLog('app', 'refreshLedger:missing-public-state', { activeContractAddress });
        if (treatMissingAsTransient) {
          return false;
        }
        clearContractState('No indexed contract state was found for the saved address. Deploy a fresh contract to continue.');
        return false;
      }

      debugError('app', 'refreshLedger:error', refreshError);
      setError(
        refreshError instanceof Error ? refreshError.message : 'Unable to fetch the latest mint ledger from the blockchain.',
      );
      return false;
    } finally {
      if (showBusyState) {
        setBusyAction(null);
      }
    }
  };

  const waitForContractSnapshot = async (activeSession: MintSession, activeContractAddress: string) => {
    // Wait for the deploy to settle via the indexer websocket subscription
    // instead of polling the GraphQL endpoint (which triggers rate limits).
    debugLog('app', 'waitForContractSnapshot:watch-start', { activeContractAddress });
    await waitForDeploySettled(activeSession.providers.publicDataProvider, activeContractAddress);

    // Whether the watch resolved or timed out, do a single query to load state.
    return refreshLedger(activeSession, activeContractAddress, {
      showBusyState: false,
      treatMissingAsTransient: true,
    });
  };

  const deployMintContract = async () => {
    if (!session) {
      setError('Connect the wallet before deploying the contract.');
      return;
    }

    try {
      debugLog('app', 'deployMintContract:start');
      setBusyAction('deploy');
      setError('');
      setFeedback(`Deploying the shielded mint contract to Midnight ${session.config.networkId}...`);

      const deployTxData = await createUnprovenDeployTx(
        {
          zkConfigProvider: session.providers.zkConfigProvider,
          walletProvider: session.providers.walletProvider,
        },
        {
          compiledContract: compiledShieldedMintContract,
          signingKey: sampleSigningKey(),
        },
      );
      debugLog('app', 'deployMintContract:unproven-created', {
        contractAddress: deployTxData.public.contractAddress,
      });

      const txId = await submitTxAsync(session.providers, {
        unprovenTx: deployTxData.private.unprovenTx,
      });
      debugLog('app', 'deployMintContract:submitted', {
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
      setLedgerView(null);
      setLastTxId(txId);
      writeStoredContractAddress(nextContractAddress, session.config.networkId);
      setFeedback('Contract deployment submitted. Loading the indexed mint ledger...');

      const hydrated = await waitForContractSnapshot(session, nextContractAddress);
      if (hydrated) {
        setFeedback('Mint contract deployed and indexed. Enter an amount and mint shielded tokens.');
      } else {
        clearContractState(
          `The new contract address never appeared in the ${session.config.networkId} indexer. Try deploying again.`,
        );
        setError('Deployment did not produce indexed public state, so the provisional contract address was cleared.');
      }
    } catch (deployError) {
      debugError('app', 'deployMintContract:error', deployError);
      setError(deployError instanceof Error ? deployError.message : 'Contract deployment failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const mint = async () => {
    if (!session) {
      setError('Connect the wallet before minting.');
      return;
    }

    if (!contractAddress) {
      setError('Deploy the contract before minting.');
      return;
    }

    if (!contractSnapshot) {
      setError('Contract state is not loaded yet. Refresh and try again.');
      return;
    }

    if (parsedAmount === null) {
      setError('Enter a positive whole number for the mint amount (max 64-bit).');
      return;
    }

    try {
      debugLog('app', 'mint:start', {
        contractAddress,
        amount: parsedAmount.toString(),
      });
      setBusyAction('mint');
      setError('');
      setFeedback('Proving, balancing, and submitting the shielded mint transaction with 1AM...');

      const recipientBytes = decodeShieldedCoinPublicKey(
        session.shieldedAddress.shieldedCoinPublicKey,
        session.config.networkId,
      );
      const mintNonce = randomNonce();

      const callTxData = await createUnprovenCallTx(session.providers, {
        compiledContract: compiledShieldedMintContract,
        contractAddress,
        circuitId: 'mintShielded',
        args: [parsedAmount, mintNonce, { bytes: recipientBytes }],
      });
      debugLog('app', 'mint:unproven-created', {
        amount: parsedAmount.toString(),
      });

      const txId = await submitTxAsync(session.providers, {
        unprovenTx: callTxData.private.unprovenTx,
        circuitId: 'mintShielded',
      });
      debugLog('app', 'mint:submitted', { txId });

      setLastTxId(txId);
      void refreshMintTokenBalance();
      setFeedback(`Mint submitted on-chain for ${parsedAmount.toString()} shielded tokens. Refresh to see the updated ledger.`);
    } catch (mintError) {
      debugError('app', 'mint:error', mintError);
      setError(mintError instanceof Error ? mintError.message : 'Mint submission failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const refreshContractState = async () => {
    if (!session || !contractAddress) {
      return;
    }

    await refreshLedger(session, contractAddress);
  };

  const clearSavedContract = () => {
    clearContractState('Saved contract address cleared. Deploy a fresh contract to continue.');
    setError('');
  };

  const clearDebugEntries = () => {
    setDebugEntries([]);
  };

  return {
    walletStatus,
    statusText,
    isConnected,
    session,
    busyAction,
    contractAddress,
    ledgerView,
    amount,
    setAmount,
    parsedAmount,
    activeTab,
    setActiveTab,
    lastTxId,
    availableMintToken,
    availableMintTokenAtomic,
    mintTokenBalanceStatus,
    mintTokenBalanceError,
    feedback,
    error,
    debugEntries,
    canDeploy,
    canRefresh,
    canMint,
    canRefreshMintTokenBalance,
    connectWallet,
    deployMintContract,
    mint,
    refreshContractState,
    refreshMintTokenBalance,
    clearSavedContract,
    clearDebugEntries,
    storageKey: mintContractAddressStorageKey(session?.config.networkId),
  };
}
