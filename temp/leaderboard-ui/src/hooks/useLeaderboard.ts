import { useState, useEffect, useCallback } from 'react';
import { ContractState } from '@midnight-ntwrk/compact-runtime';
import { Leaderboard } from 'leaderboard-contract';
import { decodeDisplayName } from '../../../api/src/utils/index.js';

const INDEXER_URL = import.meta.env.VITE_INDEXER_URL ?? 'https://indexer.preview.midnight.network/api/v4/graphql';

const CONTRACT_STATE_QUERY = `
  query ContractState($address: HexEncoded!) {
    contractAction(address: $address) {
      state
    }
  }
`;

export interface LeaderboardEntry {
  id: number;
  score: number;
  displayName: string;
  ownerHash: string;
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = parseInt(normalized.substring(i, i + 2), 16);
  }
  return bytes;
}

export function useLeaderboard(contractAddress: string | null, refreshInterval = 15_000) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [entryCount, setEntryCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    if (!contractAddress || !/^[0-9a-fA-F]{64}$/.test(contractAddress)) {
      setEntries([]);
      setEntryCount(0);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(INDEXER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: CONTRACT_STATE_QUERY, variables: { address: contractAddress } }),
      });
      const gql = await res.json();
      if (gql.errors) throw new Error(gql.errors[0]?.message ?? 'Indexer query failed');

      const stateHex = gql.data?.contractAction?.state;
      if (!stateHex) throw new Error('Contract not found');

      const contractState = ContractState.deserialize(hexToBytes(stateHex));
      const ledgerState = Leaderboard.ledger(contractState.data);
      const parsed: LeaderboardEntry[] = [];

      for (const [key, entry] of ledgerState.scores) {
        parsed.push({
          id: Number(key),
          score: Number(entry.score),
          displayName: decodeDisplayName(entry.displayName, Number(key), Number(entry.score)),
          ownerHash: entry.ownerHash.toString(),
        });
      }

      parsed.sort((a, b) => b.score - a.score);
      setEntries(parsed);
      setEntryCount(Number(ledgerState.nextId));
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [contractAddress]);

  useEffect(() => { void fetchLeaderboard(); }, [fetchLeaderboard]);
  useEffect(() => {
    if (!contractAddress) return;
    const interval = setInterval(() => void fetchLeaderboard(), refreshInterval);
    return () => clearInterval(interval);
  }, [contractAddress, refreshInterval, fetchLeaderboard]);

  return { entries, entryCount, loading, error, refresh: fetchLeaderboard };
}
