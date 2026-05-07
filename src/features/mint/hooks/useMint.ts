import { useEffect, useMemo, useState } from 'react';
import {
  createUnprovenCallTx,
  createUnprovenDeployTx,
  getPublicStates,
  submitTxAsync,
} from '@midnight-ntwrk/midnight-js-contracts';
import { sampleSigningKey } from '@midnight-ntwrk/compact-runtime';
import { debugError, debugLog, subscribeDebugLogs, type DebugEntry } from '../../../debug';
import { createConnectedSession, type ConnectedSession } from '../../../midnight';
import { compiledShieldedMintContract, mintLedger } from '../../../mintContract';
import { APP_CONFIG } from '../../../config';
import {
  MINT_CONTRACT_ADDRESS_STORAGE_KEY,
  readStoredContractAddress,
  writeStoredContractAddress,
} from '../data/mintStorage';
import { decodeShieldedCoinPublicKey } from '../domain/shieldedAddress';
import type { AppTab, BusyAction, ContractSnapshot, LedgerView, WalletStatus } from '../types';

const DETECT_TIMEOUT_MS = 6000;
const DETECT_INTERVAL_MS = 300;

function isMissingPublicStateError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('No public state found at contract address');
}

function randomNonce(): Uint8Array {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function useMint() {
  const [walletStatus, setWalletStatus] = useState<WalletStatus>('checking');
  const [session, setSession] = useState<ConnectedSession | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [contractAddress, setContractAddress] = useState(() => readStoredContractAddress());
  const [contractSnapshot, setContractSnapshot] = useState<ContractSnapshot | null>(null);
  const [ledgerView, setLedgerView] = useState<LedgerView | null>(null);
  const [amount, setAmount] = useState('100');
  const [activeTab, setActiveTab] = useState<AppTab>('mint');
  const [lastTxId, setLastTxId] = useState('');
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

  const statusText = useMemo(() => {
    if (walletStatus === 'checking') return 'Checking for 1AM';
    return '1AM not found';
  }, [walletStatus]);

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

  const clearContractState = (feedbackMessage: string) => {
    writeStoredContractAddress('');
    setContractAddress('');
    setContractSnapshot(null);
    setLedgerView(null);
    setLastTxId('');
    setFeedback(feedbackMessage);
  };

  const refreshLedger = async (
    activeSession: ConnectedSession,
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
      debugError('app', 'refreshLedger:error', refreshError);
      if (isMissingPublicStateError(refreshError)) {
        if (treatMissingAsTransient) {
          return false;
        }
        clearContractState('No indexed contract state was found for the saved address. Deploy a fresh contract to continue.');
      }

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

  const waitForContractSnapshot = async (activeSession: ConnectedSession, activeContractAddress: string) => {
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      debugLog('app', 'waitForContractSnapshot:attempt', { activeContractAddress, attempt });

      if (await refreshLedger(activeSession, activeContractAddress, {
        showBusyState: false,
        treatMissingAsTransient: true,
      })) {
        return true;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 2000));
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
      setFeedback('Wallet connected. Deploy the mint contract once, then mint shielded tokens to your wallet.');

      if (contractAddress) {
        await refreshLedger(connectedSession, contractAddress, { showBusyState: false });
      }
    } catch (connectError) {
      debugError('app', 'connectWallet:error', connectError);
      setError(connectError instanceof Error ? connectError.message : 'Connection failed.');
    } finally {
      setBusyAction(null);
    }
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
      setFeedback(`Deploying the shielded mint contract to Midnight ${APP_CONFIG.oneAmNetwork}...`);

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
      setLastTxId(txId ?? '');
      writeStoredContractAddress(nextContractAddress);
      setFeedback('Contract deployment submitted. Loading the indexed mint ledger...');

      const hydrated = await waitForContractSnapshot(session, nextContractAddress);
      if (hydrated) {
        setFeedback('Mint contract deployed and indexed. Enter an amount and mint shielded tokens.');
      } else {
        clearContractState(
          `The new contract address never appeared in the ${APP_CONFIG.oneAmNetwork} indexer. Try deploying again.`,
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
    feedback,
    error,
    debugEntries,
    canDeploy,
    canRefresh,
    canMint,
    connectWallet,
    deployMintContract,
    mint,
    refreshContractState,
    clearSavedContract,
    clearDebugEntries,
    storageKey: MINT_CONTRACT_ADDRESS_STORAGE_KEY,
  };
}
