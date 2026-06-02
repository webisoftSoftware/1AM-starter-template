import { useCallback, useEffect, useMemo, useState } from 'react';
import { debugError, debugLog, subscribeDebugLogs, type DebugEntry } from '../../../debug';
import { getAvailableNativeNight, sendNativeNightTransfer, type OneAmSession } from '../../../oneAm';
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

type BalanceStatus = 'idle' | 'loading' | 'loaded' | 'unavailable' | 'error';

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

function formatNightAmount(atomicValue: bigint): string {
  const whole = atomicValue / NIGHT_SCALE;
  const fraction = atomicValue % NIGHT_SCALE;
  const wholeText = whole.toLocaleString('en-US');

  if (fraction === 0n) {
    return wholeText;
  }

  const fractionText = fraction.toString().padStart(NIGHT_DECIMALS, '0').replace(/0+$/, '');
  return `${wholeText}.${fractionText}`;
}

export function useTransfer({ session, walletStatus, statusText, connectWallet }: UseTransferOptions) {
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('transfer');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [lastTxId, setLastTxId] = useState('');
  const [availableNightAtomic, setAvailableNightAtomic] = useState<bigint | null>(null);
  const [balanceStatus, setBalanceStatus] = useState<BalanceStatus>('idle');
  const [balanceError, setBalanceError] = useState('');
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

  const refreshAvailableNight = useCallback(async () => {
    if (!session) {
      setAvailableNightAtomic(null);
      setBalanceStatus('idle');
      setBalanceError('');
      return;
    }

    try {
      setBalanceStatus('loading');
      setBalanceError('');
      debugLog('app', 'transferBalance:start', { networkId: session.config.networkId });
      const balance = await getAvailableNativeNight(session.api);
      setAvailableNightAtomic(balance);
      setBalanceStatus('loaded');
      debugLog('app', 'transferBalance:success', { atomicValue: balance.toString() });
    } catch (balanceLookupError) {
      debugError('app', 'transferBalance:error', balanceLookupError);
      setAvailableNightAtomic(null);
      setBalanceStatus(
        balanceLookupError instanceof Error && balanceLookupError.message.includes('does not expose')
          ? 'unavailable'
          : 'error',
      );
      setBalanceError(
        balanceLookupError instanceof Error ? balanceLookupError.message : 'Unable to load the NIGHT balance.',
      );
    }
  }, [session]);

  useEffect(() => {
    void refreshAvailableNight();
  }, [refreshAvailableNight]);

  const parsedAmount = useMemo(() => parseNightAmount(amount), [amount]);

  const transferValidationError = useMemo(() => {
    if (!recipient.trim()) {
      return 'Enter a recipient address.';
    }

    if (parsedAmount.error) {
      return parsedAmount.error;
    }

    if (
      availableNightAtomic !== null &&
      parsedAmount.atomicValue !== null &&
      parsedAmount.atomicValue > availableNightAtomic
    ) {
      return 'Amount exceeds available NIGHT.';
    }

    return null;
  }, [availableNightAtomic, parsedAmount, recipient]);

  const canSendTransfer = Boolean(session && busyAction === null);
  const canRefreshBalance = Boolean(session && busyAction === null && balanceStatus !== 'loading');
  const availableNight = availableNightAtomic === null ? null : `${formatNightAmount(availableNightAtomic)} NIGHT`;

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
      void refreshAvailableNight();
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
    availableNight,
    availableNightAtomic,
    balanceStatus,
    balanceError,
    lastTxId,
    feedback,
    error,
    debugEntries,
    canSendTransfer,
    canRefreshBalance,
    connectWallet,
    refreshAvailableNight,
    sendTransfer,
    clearDebugEntries,
  };
}
