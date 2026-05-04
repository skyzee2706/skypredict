"use client";
import { useEffect, useState } from "react";
import { createPublicClient, http, parseAbiItem } from "viem";
import { seismicTestnet } from "@/lib/onchain/seismicChain";
import { LEADERBOARD_MAX_BLOCK_RANGE, LEADERBOARD_START_BLOCK } from "@/config/leaderboard";
import { FACTORY_ADDRESS, FACTORY_ABI } from "@/lib/constants";

// New event signature: outcome is uint8 (0=SideA, 1=Draw, 2=SideB)
const BetPlacedEvent = parseAbiItem(
    "event BetPlaced(address indexed user, uint8 indexed outcome, uint256 amount, uint256 ethFeePaid)"
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
        if (!FACTORY_ADDRESS || FACTORY_ADDRESS === '0x0000000000000000000000000000000000000000') return;

        const client = createPublicClient({
            chain: seismicTestnet,
            transport: http(),
        });

        async function fetchLeaderboard() {
            try {
                setIsLoading(true);
                setError(null);

                // Get all market addresses from factory
                const markets = await client.readContract({
                    address: FACTORY_ADDRESS as `0x${string}`,
                    abi: FACTORY_ABI,
                    functionName: "getAllMarkets",
                }) as `0x${string}`[];

                if (markets.length === 0) {
                    setEntries([]);
                    return;
                }

                // Aggregate user volume and claimed payout across all markets.
                // PNL = claimed payout - total betting volume. Unclaimed winnings are not counted yet.
                const userMap = new Map<string, UserAggregate>();

                const getUser = (address: `0x${string}`) => {
                    const key = address.toLowerCase();
                    const existing = userMap.get(key) ?? { volume: 0n, payout: 0n, sideA: 0, draw: 0, sideB: 0 };
                    userMap.set(key, existing);
                    return existing;
                };

                for (const market of markets) {
                    try {
                        const latestBlock = await client.getBlockNumber();
                        const [betLogs, claimLogs] = await Promise.all([
                            getLogsChunked(client, market, BetPlacedEvent, LEADERBOARD_START_BLOCK, latestBlock),
                            getLogsChunked(client, market, ClaimedEvent, LEADERBOARD_START_BLOCK, latestBlock),
                        ]);

                        for (const log of betLogs) {
                            const { user, outcome, amount } = log.args;
                            if (!user || outcome === undefined || amount === undefined) continue;

                            const existing = getUser(user);
                            existing.volume += amount;
                            existing.sideA += outcome === 0 ? 1 : 0;
                            existing.draw += outcome === 1 ? 1 : 0;
                            existing.sideB += outcome === 2 ? 1 : 0;
                        }

                        for (const log of claimLogs) {
                            const { user, payout } = log.args;
                            if (!user || payout === undefined) continue;

                            const existing = getUser(user);
                            existing.payout += payout;
                        }
                    } catch (marketError) {
                        console.error(`Failed to fetch logs for market ${market}:`, marketError);
                    }
                }

                const baseEntries = Array.from(userMap.entries()).map(([addr, data]) => ({
                    address: addr as `0x${string}`,
                    volume: data.volume,
                    payout: data.payout,
                    pnl: data.payout - data.volume,
                    sideABets: data.sideA,
                    drawBets: data.draw,
                    sideBBets: data.sideB,
                    totalBets: data.sideA + data.draw + data.sideB,
                    volumeRank: 0,
                    pnlRank: 0,
                }));

                const byVolume = [...baseEntries].sort((a, b) => compareBigintDesc(a.volume, b.volume));
                byVolume.forEach((entry, idx) => { entry.volumeRank = idx + 1; });

                const byPnl = [...baseEntries].sort((a, b) => compareBigintDesc(a.pnl, b.pnl));
                byPnl.forEach((entry, idx) => { entry.pnlRank = idx + 1; });

                setEntries(baseEntries);
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
