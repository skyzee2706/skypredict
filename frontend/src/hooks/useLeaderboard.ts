"use client";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

export interface LeaderboardEntry {
    address: `0x${string}`;
    volume: bigint;
    payout: bigint;
    pnl: bigint;
    sideABets: number;
    drawBets: number;
    sideBBets: number;
    totalBets: number;
    volumeRank: number;
    pnlRank: number;
}

type ApiLeaderboardResponse = {
    leaderboard?: ApiLeaderboardEntry[];
    volumeLeaderboard?: ApiLeaderboardEntry[];
    pnlLeaderboard?: ApiLeaderboardEntry[];
    currentUser?: ApiLeaderboardEntry | null;
    source?: string | null;
    updatedAt?: number | null;
    lastProcessedBlock?: string | null;
};

type ApiLeaderboardEntry = Omit<LeaderboardEntry, 'volume' | 'payout' | 'pnl'> & {
    volume: string | bigint;
    payout: string | bigint;
    pnl: string | bigint;
};

const DATABASE_FALLBACK_TIMEOUT_MS = 60_000;

function normalizeEntry(entry: ApiLeaderboardEntry): LeaderboardEntry {
    return {
        ...entry,
        volume: BigInt(entry.volume),
        payout: BigInt(entry.payout),
        pnl: BigInt(entry.pnl),
    };
}

export function useLeaderboard() {
    const { address } = useAccount();
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [volumeEntries, setVolumeEntries] = useState<LeaderboardEntry[]>([]);
    const [pnlEntries, setPnlEntries] = useState<LeaderboardEntry[]>([]);
    const [currentUser, setCurrentUser] = useState<LeaderboardEntry | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [source, setSource] = useState<string | null>(null);
    const [updatedAt, setUpdatedAt] = useState<number | null>(null);
    const [lastProcessedBlock, setLastProcessedBlock] = useState<string | null>(null);
    const requestSeq = useRef(0);
    const entriesLengthRef = useRef(0);

    useEffect(() => {
        entriesLengthRef.current = entries.length;
    }, [entries.length]);

    useEffect(() => {
        let cancelled = false;

        async function fetchLeaderboard() {
            try {
                setIsLoading((current) => current && entriesLengthRef.current === 0);
                setError(null);

                const currentSeq = ++requestSeq.current;
                const controller = new AbortController();
                const timeout = window.setTimeout(() => controller.abort(), DATABASE_FALLBACK_TIMEOUT_MS);
                const params = new URLSearchParams();
                if (address) params.set('address', address);

                let response: Response;
                try {
                    response = await fetch(`/api/indexer?${params.toString()}`, { signal: controller.signal });
                } catch (error) {
                    window.clearTimeout(timeout);
                    if (error instanceof DOMException && error.name === 'AbortError') {
                        params.set('fallback', 'chain');
                        response = await fetch(`/api/indexer?${params.toString()}`);
                    } else {
                        throw error;
                    }
                }
                window.clearTimeout(timeout);
                if (!response.ok) throw new Error('Failed to fetch leaderboard');

                const data = await response.json() as ApiLeaderboardResponse;
                if (cancelled || currentSeq !== requestSeq.current) return;

                const normalizedVolume = (data.volumeLeaderboard ?? data.leaderboard ?? []).map(normalizeEntry);
                const normalizedPnl = (data.pnlLeaderboard ?? data.leaderboard ?? []).map(normalizeEntry);
                setEntries(normalizedVolume);
                setVolumeEntries(normalizedVolume);
                setPnlEntries(normalizedPnl);
                setCurrentUser(data.currentUser ? normalizeEntry(data.currentUser) : null);
                setSource(data.source ?? null);
                setUpdatedAt(data.updatedAt ?? null);
                setLastProcessedBlock(data.lastProcessedBlock ?? null);
            } catch (e: unknown) {
                if (cancelled) return;
                console.error("Leaderboard fetch error:", e);
                setError(e instanceof Error ? e.message : "Failed to load leaderboard");
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        fetchLeaderboard();
        const interval = setInterval(fetchLeaderboard, 120_000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [address]);

    return { entries, volumeEntries, pnlEntries, currentUser, isLoading, error, source, updatedAt, lastProcessedBlock };
}
