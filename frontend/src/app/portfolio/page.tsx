"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import Header from "../components/Header/Header";
import styles from "../page.module.css";
import { claimRewards } from "@/lib/onchain/writes";
import { MarketData } from "@/data/markets";
import { SKYUSD_MULTIPLIER } from "@/lib/constants";
import { useBatchedMarkets, useBatchedUserPositions, useFactoryMarkets } from "@/hooks/useMarketBatches";
import { useToast } from "../providers/ToastProvider";

const HISTORY_PAGE_SIZE = 20;

type CachedPortfolioResponse = {
    marketAddresses: `0x${string}`[];
    activity: Array<{
        txHash: string;
        market: `0x${string}`;
        type: 'BET' | 'CLAIM';
        amount: string;
        blockNumber: string;
    }>;
    updatedAt: number;
};

type PortfolioPosition = {
    market: MarketData;
    sideA: number;
    draw: number;
    sideB: number;
    total: number;
    claimed: boolean;
    canClaim: boolean;
    userWon: boolean;
    positionValue: number;
};

function formatAmount(value: number) {
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function shortAddress(addr: string) {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function PortfolioPage() {
    const router = useRouter();
    const { address, isConnected } = useAccount();
    const { showToast } = useToast();
    const { addresses, isLoading: factoryLoading, isFetching: factoryFetching } = useFactoryMarkets();
    const [cachedPortfolio, setCachedPortfolio] = useState<CachedPortfolioResponse | null>(null);
    const liveAddresses = useMemo(() => {
        const cached = cachedPortfolio?.marketAddresses ?? [];
        return cached.length > 0 ? cached : addresses;
    }, [addresses, cachedPortfolio]);
    const { positions: batchedPositions, isLoading: positionsLoading, isFetching: positionsFetching } = useBatchedUserPositions(liveAddresses, address as `0x${string}` | undefined);
    const positionMarketAddresses = useMemo(
        () => batchedPositions.map((position) => position.marketAddress),
        [batchedPositions]
    );
    const { markets: batchedMarkets, isLoading: marketsLoading, isFetching: marketsFetching } = useBatchedMarkets(positionMarketAddresses);
    const [positions, setPositions] = useState<PortfolioPosition[]>([]);
    const [claiming, setClaiming] = useState<string | null>(null);
    const [historyPage, setHistoryPage] = useState(1);

    const userStats = useMemo(() => {
        const volume = positions.reduce((sum, position) => sum + position.total, 0);
        const realizedOrClaimableValue = positions.reduce((sum, position) => sum + position.positionValue, 0);
        const pnl = realizedOrClaimableValue - volume;
        const pnlPercent = volume > 0 ? (pnl / volume) * 100 : 0;
        return {
            volume,
            pnl,
            pnlPercent,
            historyCount: cachedPortfolio?.activity.length || positions.length,
        };
    }, [cachedPortfolio, positions]);

    // Portfolio is app-level: we fetch all markets and batch check positions.
    // No external API needed — everything comes from on-chain via batched hooks.
    useEffect(() => {
        if (!address) {
            setCachedPortfolio(null);
            return;
        }
        // No cached portfolio API needed — batched hooks handle everything
    }, [address]);

    useEffect(() => {
        if (!address) {
            setPositions([]);
            return;
        }

        if (batchedMarkets.length === 0 || batchedPositions.length === 0) return;

        const marketByAddress = new Map(batchedMarkets.map((market) => [market.contractId.toLowerCase(), market]));
        const rows = batchedPositions
            .map((position) => {
                const market = marketByAddress.get(position.marketAddress.toLowerCase());
                if (!market) return null;

                const sideAName = market.sideAName || "YES";
                const drawName = market.drawName || "DRAW";
                const sideBName = market.sideBName || "NO";
                let userWon = false;
                let canClaim = false;

                if (market.state === "UNDETERMINED") {
                    userWon = true;
                    canClaim = !position.claimed;
                } else if (market.state === "RESOLVED") {
                    userWon =
                        (market.resolvedOutcome === sideAName && position.onSideA > 0) ||
                        (market.resolvedOutcome === drawName && position.onDraw > 0) ||
                        (market.resolvedOutcome === sideBName && position.onSideB > 0);
                    canClaim = userWon && !position.claimed;
                }

                const positionValue = userWon ? position.total : 0;

                return {
                    market,
                    sideA: position.onSideA,
                    draw: position.onDraw,
                    sideB: position.onSideB,
                    total: position.total,
                    claimed: position.claimed,
                    canClaim,
                    userWon,
                    positionValue,
                } as PortfolioPosition;
            })
            .filter((row): row is PortfolioPosition => row !== null);

        setPositions(rows);
    }, [address, batchedMarkets, batchedPositions]);

    const loadPortfolio = React.useCallback(async () => {
        // Wagmi hooks refetch in the background automatically; this keeps the
        // button API stable without reintroducing direct per-market RPC loops.
    }, []);

    const hasLoadedFactory = !factoryLoading && !factoryFetching;
    const hasCheckedPositions = isConnected && liveAddresses.length > 0 && !positionsLoading && !positionsFetching;
    const needsMarketDetails = batchedPositions.length > 0;
    const hasLoadedPositionMarkets = !needsMarketDetails || (!marketsLoading && !marketsFetching);
    const isLoading = isConnected && (!hasLoadedFactory || !hasCheckedPositions || !hasLoadedPositionMarkets);

    const handleClaim = async (position: PortfolioPosition) => {
        setClaiming(position.market.contractId);
        try {
            await claimRewards(position.market.contractId as `0x${string}`);
            showToast("Claim transaction submitted successfully.", "success");
            await loadPortfolio();
        } catch (error) {
            console.error("Claim failed:", error);
            showToast("Claim failed. Check wallet and console for details.", "error");
        } finally {
            setClaiming(null);
        }
    };

    const sortedPositions = useMemo(
        () => [...positions].sort((a, b) => Number(b.market.deadline) - Number(a.market.deadline)),
        [positions]
    );
    const totalHistoryPages = Math.max(1, Math.ceil(sortedPositions.length / HISTORY_PAGE_SIZE));
    const currentHistoryPage = Math.min(historyPage, totalHistoryPages);
    const paginatedPositions = sortedPositions.slice(
        (currentHistoryPage - 1) * HISTORY_PAGE_SIZE,
        currentHistoryPage * HISTORY_PAGE_SIZE
    );

    useEffect(() => {
        setHistoryPage(1);
    }, [address, sortedPositions.length]);

    return (
        <>
            <Header
                onNavigate={(page) => {
                    if (page === "markets") router.push("/markets");
                    else if (page === "portfolio") router.push("/portfolio");
                    else if (page === "leaderboard") router.push("/leaderboard");
                    else if (page === "faucet") router.push("/faucet");
                    else router.push("/");
                }}
                currentPage="portfolio"
            />

            <div className={styles.mainContainer}>
                <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "32px 16px", width: "100%" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "18px", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "24px" }}>
                        <div>
                            <h1 style={{ fontSize: "34px", fontWeight: 950, letterSpacing: "-1px", background: "linear-gradient(135deg,#22c55e,#6366f1,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                                Portfolio
                            </h1>
                            <p style={{ color: "var(--text-muted)", marginTop: "8px" }}>
                                {address ? `Wallet ${shortAddress(address)}` : "Connect wallet to view PNL, volume, history, and claims."}
                            </p>
                        </div>
                        <button onClick={loadPortfolio} style={{ border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)", padding: "12px 16px", borderRadius: "14px", fontWeight: 800, cursor: "pointer" }}>
                            Refresh
                        </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "14px", marginBottom: "24px" }}>
                        <div style={{ padding: "18px", borderRadius: "20px", border: "1px solid rgba(34,197,94,0.28)", background: "linear-gradient(135deg,rgba(34,197,94,0.12),rgba(255,255,255,0.04))" }}>
                            <p style={{ color: "var(--text-muted)", fontSize: "12px", fontWeight: 800 }}>PNL</p>
                            <p style={{ color: userStats.pnl < 0 ? "#fb7185" : "#22c55e", fontSize: "28px", fontWeight: 950, marginTop: "8px", fontFamily: "monospace" }}>
                                {`${userStats.pnl < 0 ? "-" : "+"}${formatAmount(Math.abs(userStats.pnl))}`}
                            </p>
                            <p style={{ color: userStats.pnlPercent < 0 ? "#fb7185" : "#22c55e", fontSize: "13px", fontWeight: 900, marginTop: "4px", fontFamily: "monospace" }}>
                                {`${userStats.pnlPercent < 0 ? "-" : "+"}${Math.abs(userStats.pnlPercent).toFixed(2)}%`}
                            </p>
                        </div>
                        <div style={{ padding: "18px", borderRadius: "20px", border: "1px solid rgba(99,102,241,0.28)", background: "linear-gradient(135deg,rgba(99,102,241,0.14),rgba(255,255,255,0.04))" }}>
                            <p style={{ color: "var(--text-muted)", fontSize: "12px", fontWeight: 800 }}>Volume</p>
                            <p style={{ color: "var(--text-primary)", fontSize: "28px", fontWeight: 950, marginTop: "8px", fontFamily: "monospace" }}>
                                {formatAmount(userStats.volume)}
                            </p>
                        </div>
                        <div style={{ padding: "18px", borderRadius: "20px", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                            <p style={{ color: "var(--text-muted)", fontSize: "12px", fontWeight: 800 }}>Trading History</p>
                            <p style={{ color: "var(--text-primary)", fontSize: "28px", fontWeight: 950, marginTop: "8px" }}>{userStats.historyCount}</p>
                        </div>
                    </div>

                    {!isConnected && (
                        <div style={{ padding: "42px", textAlign: "center", borderRadius: "22px", border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-muted)" }}>
                            Connect your wallet to load portfolio.
                        </div>
                    )}

                    {isConnected && isLoading && (
                        <div style={{ padding: "42px", textAlign: "center", borderRadius: "22px", border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-muted)", display: "grid", placeItems: "center", gap: "14px" }}>
                            <div style={{ width: "34px", height: "34px", borderRadius: "999px", border: "3px solid rgba(255,255,255,0.12)", borderTopColor: "#22c55e", animation: "portfolioSpin 0.8s linear infinite" }} />
                            <div>
                                <p style={{ color: "var(--text-primary)", fontWeight: 900, marginBottom: "6px" }}>Loading trading history…</p>
                                <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>Checking your wallet positions on-chain.</p>
                            </div>
                            <style jsx>{`
                                @keyframes portfolioSpin {
                                    to { transform: rotate(360deg); }
                                }
                            `}</style>
                        </div>
                    )}

                    {isConnected && !isLoading && sortedPositions.length === 0 && (
                        <div style={{ padding: "42px", textAlign: "center", borderRadius: "22px", border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-muted)" }}>
                            No trading history yet.
                        </div>
                    )}

                    {isConnected && !isLoading && sortedPositions.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                                <div>
                                    <h2 style={{ color: "var(--text-primary)", fontSize: "20px", fontWeight: 950 }}>Trading History</h2>
                                    <p style={{ color: "var(--text-muted)", fontSize: "13px", marginTop: "4px" }}>
                                        Showing {((currentHistoryPage - 1) * HISTORY_PAGE_SIZE) + 1}-{Math.min(currentHistoryPage * HISTORY_PAGE_SIZE, sortedPositions.length)} of {sortedPositions.length} positions
                                    </p>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                    <button
                                        onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                                        disabled={currentHistoryPage === 1}
                                        style={{ border: "1px solid var(--border)", borderRadius: "12px", padding: "10px 14px", fontWeight: 900, cursor: currentHistoryPage === 1 ? "not-allowed" : "pointer", color: currentHistoryPage === 1 ? "var(--text-muted)" : "var(--text-primary)", background: "var(--bg-card)" }}
                                    >
                                        Prev
                                    </button>
                                    <span style={{ color: "var(--text-muted)", fontSize: "13px", fontWeight: 900 }}>
                                        Page {currentHistoryPage} / {totalHistoryPages}
                                    </span>
                                    <button
                                        onClick={() => setHistoryPage((page) => Math.min(totalHistoryPages, page + 1))}
                                        disabled={currentHistoryPage === totalHistoryPages}
                                        style={{ border: "1px solid var(--border)", borderRadius: "12px", padding: "10px 14px", fontWeight: 900, cursor: currentHistoryPage === totalHistoryPages ? "not-allowed" : "pointer", color: currentHistoryPage === totalHistoryPages ? "var(--text-muted)" : "var(--text-primary)", background: "var(--bg-card)" }}
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "980px", overflowY: "auto", paddingRight: "6px" }}>
                                {paginatedPositions.map((position) => {
                                    const market = position.market;
                                    return (
                                        <div key={market.contractId} style={{ padding: "18px", borderRadius: "20px", border: "1px solid var(--border)", background: "var(--bg-card)", display: "grid", gridTemplateColumns: "1.5fr 1fr auto", gap: "16px", alignItems: "center" }}>
                                            <div>
                                                <p style={{ color: "var(--text-primary)", fontWeight: 900, marginBottom: "6px" }}>{market.title}</p>
                                                <p style={{ color: "var(--text-muted)", fontSize: "12px" }}>
                                                    {market.category} · {market.state === "RESOLVED" ? "Finalized" : market.state} · Winner: {market.resolvedOutcome || "-"}
                                                </p>
                                            </div>
                                            <div style={{ color: "var(--text-muted)", fontSize: "12px", lineHeight: 1.7 }}>
                                                <div>Total Bet: <b style={{ color: "var(--text-primary)" }}>{formatAmount(position.total)} SkyUSD</b></div>
                                                <div>{market.sideAName || "YES"}: {formatAmount(position.sideA)} · Draw: {formatAmount(position.draw)} · {market.sideBName || "NO"}: {formatAmount(position.sideB)}</div>
                                                {position.canClaim && <div style={{ color: "#22c55e", fontWeight: 900 }}>Claimable: {formatAmount(position.positionValue)} SkyUSD</div>}
                                                {position.claimed && position.userWon && <div style={{ color: "#60a5fa", fontWeight: 900 }}>Claimed win: +{formatAmount(position.positionValue)} SkyUSD</div>}
                                                {position.claimed && !position.userWon && <div style={{ color: "#60a5fa", fontWeight: 900 }}>Already claimed</div>}
                                            </div>
                                            <button
                                                onClick={() => handleClaim(position)}
                                                disabled={!position.canClaim || claiming === market.contractId}
                                                style={{ border: "0", borderRadius: "14px", padding: "12px 16px", fontWeight: 900, cursor: position.canClaim ? "pointer" : "not-allowed", color: position.canClaim ? "white" : "var(--text-muted)", background: position.canClaim ? "linear-gradient(135deg,#22c55e,#16a34a)" : "rgba(255,255,255,0.06)" }}
                                            >
                                                {claiming === market.contractId ? "Claiming…" : position.canClaim ? "Claim" : position.claimed ? "Claimed" : "Not claimable"}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
