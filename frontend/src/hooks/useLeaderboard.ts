"use client";
import { useEffect, useState } from "react";
import { createPublicClient, http, parseAbiItem } from "viem";
import { seismicTestnet } from "@/lib/onchain/seismicChain";
import { LEADERBOARD_START_BLOCK } from "@/config/leaderboard";
import { FACTORY_ADDRESS, FACTORY_ABI } from "@/lib/constants";

const BetPlacedEvent = parseAbiItem(
    "event BetPlaced(address indexed user, bool isYes, uint256 amount, uint256 ethFeePaid)"
);

export interface LeaderboardEntry {
    address: `0x${string}`;
    volume: bigint;
    yesBets: number;
    noBets: number;
}

export function useLeaderboard() {
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!FACTORY_ADDRESS || FACTORY_ADDRESS === '0x0000000000000000000000000000000000000000') return;

        const client = createPublicClient({
            chain: seismicTestnet,
            transport: http(), // Uses default public RPC
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

                // Aggregate volume per user from BetPlaced events across all markets
                const volumeMap = new Map<string, { volume: bigint; yes: number; no: number }>();

                for (const market of markets) {
                    try {
                        const logs = await client.getLogs({
                            address: market,
                            event: BetPlacedEvent,
                            fromBlock: LEADERBOARD_START_BLOCK,
                            toBlock: "latest",
                        });

                        for (const log of logs) {
                            const { user, isYes, amount } = log.args as { user: `0x${string}`; isYes: boolean; amount: bigint };
                            const key = user.toLowerCase();
                            const existing = volumeMap.get(key) ?? { volume: 0n, yes: 0, no: 0 };
                            volumeMap.set(key, {
                                volume: existing.volume + amount,
                                yes: existing.yes + (isYes ? 1 : 0),
                                no: existing.no + (isYes ? 0 : 1),
                            });
                        }
                    } catch (marketError) {
                        console.error(`Failed to fetch logs for market ${market}:`, marketError);
                    }
                }

                const sorted: LeaderboardEntry[] = Array.from(volumeMap.entries())
                    .map(([addr, data]) => ({
                        address: addr as `0x${string}`,
                        volume: data.volume,
                        yesBets: data.yes,
                        noBets: data.no,
                    }))
                    .sort((a, b) => (b.volume > a.volume ? 1 : -1));

                setEntries(sorted);
            } catch (e: any) {
                console.error("Leaderboard fetch error:", e);
                setError(e.message || "Failed to load leaderboard");
            } finally {
                setIsLoading(false);
            }
        }

        fetchLeaderboard();
        const interval = setInterval(fetchLeaderboard, 30_000); // refresh every 30s
        return () => clearInterval(interval);
    }, []);

    return { entries, isLoading, error };
}
