"use client";
import { useEffect, useState } from "react";
import { createPublicClient, http, parseAbiItem } from "viem";
import { seismicTestnet } from "@/lib/onchain/seismicChain";
import { LEADERBOARD_MAX_BLOCK_RANGE, LEADERBOARD_START_BLOCK } from "@/config/leaderboard";
import { FACTORY_ADDRESS, FACTORY_ABI } from "@/lib/constants";

// New event signature: outcome is uint8 (0=SideA, 1=Draw, 2=SideB)
const BetPlacedEvent = parseAbiItem(
    "event BetPlaced(address indexed user, uint8 outcome, uint256 amount, uint256 ethFeePaid)"
);

const ClaimedEvent = parseAbiItem(
    "event Claimed(address indexed user, uint256 payout)"
);

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

interface UserAggregate {
    volume: bigint;
    payout: bigint;
    sideA: number;
    draw: number;
    sideB: number;
}

function compareBigintDesc(a: bigint, b: bigint) {
    if (a === b) return 0;
    return b > a ? 1 : -1;
}

async function getLogsChunked<TEvent extends typeof BetPlacedEvent | typeof ClaimedEvent>(
    client: ReturnType<typeof createPublicClient>,
    address: `0x${string}`,
    event: TEvent,
    fromBlock: bigint,
    toBlock: bigint,
) {
    const logs = [];
    let cursor = fromBlock;

    while (cursor <= toBlock) {
        const chunkToBlock = cursor + LEADERBOARD_MAX_BLOCK_RANGE - 1n > toBlock
            ? toBlock
            : cursor + LEADERBOARD_MAX_BLOCK_RANGE - 1n;

        const chunk = await client.getLogs({
            address,
            event,
            fromBlock: cursor,
            toBlock: chunkToBlock,
        });

        logs.push(...chunk);
        cursor = chunkToBlock + 1n;
    }

    return logs;
}

export function useLeaderboard() {
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchLeaderboard() {
            try {
                setIsLoading((current) => current && entries.length === 0);
                setError(null);

                const response = await fetch('/api/indexer');
                if (!response.ok) throw new Error('Failed to fetch leaderboard');
                
                const data = await response.json();
                
                // API JSON cannot carry bigint, so cached indexer returns numeric
                // values as strings. Convert them back before UI math/sorting.
                if (data.leaderboard) {
                    const normalized = data.leaderboard.map((entry: Omit<LeaderboardEntry, 'volume' | 'payout' | 'pnl'> & {
                        volume: string | bigint;
                        payout: string | bigint;
                        pnl: string | bigint;
                    }) => ({
                        ...entry,
                        volume: BigInt(entry.volume),
                        payout: BigInt(entry.payout),
                        pnl: BigInt(entry.pnl),
                    }));
                    setEntries(normalized);
                }
            } catch (e: unknown) {
                console.error("Leaderboard fetch error:", e);
                setError(e instanceof Error ? e.message : "Failed to load leaderboard");
            } finally {
                setIsLoading(false);
            }
        }

        fetchLeaderboard();
        const interval = setInterval(fetchLeaderboard, 30_000);
        return () => clearInterval(interval);
    }, []);

    return { entries, isLoading, error };
}
