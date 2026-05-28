import { useEffect, useMemo, useState } from 'react';
import { debugError, debugLog, subscribeDebugLogs, type DebugEntry } from '../../../debug';
import { sendNativeNightTransfer, type OneAmSession } from '../../../oneAm';
import type { AppTab, BusyAction, WalletStatus } from '../types';

const NIGHT_DECIMALS = 6;
const NIGHT_SCALE = 10n ** BigInt(NIGHT_DECIMALS);

type UseTransferOptions = {
  session: OneAmSession | null;
  walletStatus: WalletStatus;
  statusText: string;
  connectWallet: () => void;
};

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

export function useTransfer({ session, walletStatus, statusText, connectWallet }: UseTransferOptions) {
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

  const isConnected = session !== null;

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
