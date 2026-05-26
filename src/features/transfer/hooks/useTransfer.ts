import { useEffect, useMemo, useState } from 'react';
import { debugError, debugLog, subscribeDebugLogs, type DebugEntry } from '../../../debug';
import {
  connectOneAm,
  getOneAmWallet,
  sendNativeNightTransfer,
  type ConnectedSession,
} from '../../../oneAm';
import { APP_CONFIG } from '../../../config';
import type { AppTab, BusyAction, WalletStatus } from '../types';

const DETECT_TIMEOUT_MS = 6000;
const DETECT_INTERVAL_MS = 300;
const NIGHT_DECIMALS = 6;
const NIGHT_SCALE = 10n ** BigInt(NIGHT_DECIMALS);

type ParsedAmount = {
  atomicValue: bigint | null;
  error: string | null;
};

function parseNightAmount(input: string): ParsedAmount {
  const trimmed = input.trim();
  if (!trimmed) {
    return { atomicValue: null, error: 'Enter a NIGHT amount.' };
  }

  if (trimmed.startsWith('-')) {
    return { atomicValue: null, error: 'Enter an amount greater than zero.' };
  }

  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return { atomicValue: null, error: 'Enter a valid NIGHT amount.' };
  }

  const [whole, fraction = ''] = trimmed.split('.');
  if (fraction.length > NIGHT_DECIMALS) {
    return { atomicValue: null, error: 'NIGHT amounts support up to 6 decimals.' };
  }

  const atomicValue = BigInt(whole) * NIGHT_SCALE + BigInt(fraction.padEnd(NIGHT_DECIMALS, '0'));
  if (atomicValue <= 0n) {
    return { atomicValue: null, error: 'Enter an amount greater than zero.' };
  }

  return { atomicValue, error: null };
}

export function useTransfer() {
  const [walletStatus, setWalletStatus] = useState<WalletStatus>('checking');
  const [session, setSession] = useState<ConnectedSession | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('transfer');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [lastTxId, setLastTxId] = useState('');
  const [feedback, setFeedback] = useState('Connect 1AM to send native NIGHT from your unshielded address.');
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
      if (getOneAmWallet()) {
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

  const parsedAmount = useMemo(() => parseNightAmount(amount), [amount]);

  const transferValidationError = useMemo(() => {
    if (!recipient.trim()) {
      return 'Enter a recipient address.';
    }

    if (parsedAmount.error) {
      return parsedAmount.error;
    }

    return null;
  }, [parsedAmount, recipient]);

  const canSendTransfer = Boolean(session && busyAction === null);

  const connectWallet = async () => {
    if (!getOneAmWallet()) {
      setError('1AM wallet was not found in window.midnight["1am"].');
      return;
    }

    try {
      debugLog('app', 'connect:start', { network: APP_CONFIG.oneAmNetwork });
      setBusyAction('connect');
      setError('');
      setFeedback(`Connecting to 1AM on ${APP_CONFIG.oneAmNetwork}...`);

      const connectedSession = await connectOneAm(APP_CONFIG.oneAmNetwork);
      debugLog('app', 'connect:success', {
        networkId: connectedSession.networkId,
      });

      setSession(connectedSession);
      setFeedback('Wallet connected. Enter a recipient and amount to send NIGHT.');
    } catch (connectError) {
      debugError('app', 'connect:error', connectError);
      setError(connectError instanceof Error ? connectError.message : 'Connection failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const sendTransfer = async () => {
    if (!session) {
      setError('Connect the wallet before sending NIGHT.');
      return;
    }

    if (transferValidationError || parsedAmount.atomicValue === null) {
      setError(transferValidationError ?? 'Enter a valid NIGHT transfer.');
      return;
    }

    try {
      const trimmedRecipient = recipient.trim();
      debugLog('app', 'transfer:start', {
        recipient: trimmedRecipient,
        amount,
        value: parsedAmount.atomicValue.toString(),
      });
      setBusyAction('transfer');
      setError('');
      setFeedback('Requesting transfer approval in 1AM...');

      const txId = await sendNativeNightTransfer(session.api, trimmedRecipient, parsedAmount.atomicValue);
      setLastTxId(txId);
      setFeedback('Transfer submitted.');
      debugLog('app', 'transfer:success', { txId });
    } catch (transferError) {
      debugError('app', 'transfer:error', transferError);
      setError(transferError instanceof Error ? transferError.message : 'Transfer submission failed.');
    } finally {
      setBusyAction(null);
    }
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
    activeTab,
    setActiveTab,
    recipient,
    setRecipient,
    amount,
    setAmount,
    parsedAmount,
    transferValidationError,
    lastTxId,
    feedback,
    error,
    debugEntries,
    canSendTransfer,
    connectWallet,
    sendTransfer,
    clearDebugEntries,
  };
}
