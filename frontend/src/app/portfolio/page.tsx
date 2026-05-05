"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import Header from "../components/Header/Header";
import styles from "../page.module.css";
import { fetchAllMarkets } from "@/lib/onchain/reads";
import { claimRewards, getUserBets, calculateUserWinnings } from "@/lib/onchain/writes";
import { getUserMarketStatus, MarketData } from "@/data/markets";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { SKYUSD_MULTIPLIER } from "@/lib/constants";
import { useToast } from "../providers/ToastProvider";

type PortfolioPosition = {
    market: MarketData;
    sideA: number;
    draw: number;
    sideB: number;
    total: number;
    claimed: boolean;
    canClaim: boolean;
    userWon: boolean;
    potentialWinnings: number;
};

function formatAmount(value: number) {
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatBigSky(value: bigint) {
    const negative = value < 0n;
    const abs = negative ? -value : value;
    const formatted = (Number(abs) / SKYUSD_MULTIPLIER).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    return `${negative ? "-" : "+"}${formatted}`;
}

function shortAddress(addr: string) {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function PortfolioPage() {
    const router = useRouter();
    const { address, isConnected } = useAccount();
    const { showToast } = useToast();
    const { entries } = useLeaderboard();
    const [positions, setPositions] = useState<PortfolioPosition[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [claiming, setClaiming] = useState<string | null>(null);

    const userEntry = useMemo(() => {
        if (!address) return undefined;
        return entries.find((entry) => entry.address.toLowerCase() === address.toLowerCase());
    }, [address, entries]);

    const loadPortfolio = React.useCallback(async () => {
        if (!address) {
            setPositions([]);
            return;
        }

        setIsLoading(true);
        try {
            const markets = await fetchAllMarkets(["ACTIVE", "RESOLVING", "RESOLVED", "UNDETERMINED"]);
            const rows = await Promise.all(markets.map(async (market) => {
                try {
                    const userBets = await getUserBets(market.contractId as `0x${string}`, address as `0x${string}`);
                    const total = userBets.onSideA + userBets.onDraw + userBets.onSideB;
                    if (total <= 0) return null;

                    const status = await getUserMarketStatus(market.contractId, address, market);
                    let potentialWinnings = status?.potentialWinnings || 0;

                    if (!potentialWinnings && market.state === "RESOLVED") {
                        const winnings = await calculateUserWinnings(market.contractId as `0x${string}`, address as `0x${string}`);
                        if (market.resolvedOutcome === market.sideAName) potentialWinnings = winnings.ifSideAWins;
                        if (market.resolvedOutcome === market.drawName) potentialWinnings = winnings.ifDrawWins;
                        if (market.resolvedOutcome === market.sideBName) potentialWinnings = winnings.ifSideBWins;
                    }

                    return {
                        market,
                        sideA: userBets.onSideA,
                        draw: userBets.onDraw,
                        sideB: userBets.onSideB,
                        total,
                        claimed: Boolean(userBets.claimed),
                        canClaim: Boolean(status?.canClaim && !userBets.claimed),
                        userWon: Boolean(status?.userWon),
                        potentialWinnings,
                    } as PortfolioPosition;
                } catch (error) {
                    console.error("Portfolio market read failed:", market.contractId, error);
                    return null;
                }
            }));

            setPositions(rows.filter((row): row is PortfolioPosition => row !== null));
        } catch (error) {
            console.error("Portfolio load failed:", error);
            showToast("Failed to load portfolio. Please try again.", "error");
        } finally {
            setIsLoading(false);
        }
    }, [address, showToast]);

    useEffect(() => {
        loadPortfolio();
        const interval = setInterval(loadPortfolio, 30_000);
        return () => clearInterval(interval);
    }, [loadPortfolio]);

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

    const sortedPositions = [...positions].sort((a, b) => Number(b.market.deadline) - Number(a.market.deadline));

    return (
        <>
            <Header
                onNavigate={(page) => {
                    if (page === "markets") router.push("/markets");
                    else if (page === "leaderboard") router.push("/leaderboard");
                    else if (page === "portfolio") router.push("/portfolio");
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
                            <p style={{ color: userEntry && userEntry.pnl < 0n ? "#fb7185" : "#22c55e", fontSize: "28px", fontWeight: 950, marginTop: "8px", fontFamily: "monospace" }}>
                                {userEntry ? formatBigSky(userEntry.pnl) : "+0.00"}
                            </p>
                        </div>
                        <div style={{ padding: "18px", borderRadius: "20px", border: "1px solid rgba(99,102,241,0.28)", background: "linear-gradient(135deg,rgba(99,102,241,0.14),rgba(255,255,255,0.04))" }}>
                            <p style={{ color: "var(--text-muted)", fontSize: "12px", fontWeight: 800 }}>Volume</p>
                            <p style={{ color: "var(--text-primary)", fontSize: "28px", fontWeight: 950, marginTop: "8px", fontFamily: "monospace" }}>
                                {userEntry ? formatAmount(Number(userEntry.volume) / SKYUSD_MULTIPLIER) : "0.00"}
                            </p>
                        </div>
                        <div style={{ padding: "18px", borderRadius: "20px", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                            <p style={{ color: "var(--text-muted)", fontSize: "12px", fontWeight: 800 }}>Trading History</p>
                            <p style={{ color: "var(--text-primary)", fontSize: "28px", fontWeight: 950, marginTop: "8px" }}>{positions.length}</p>
                        </div>
                    </div>

                    {!isConnected && (
                        <div style={{ padding: "42px", textAlign: "center", borderRadius: "22px", border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-muted)" }}>
                            Connect your wallet to load portfolio.
                        </div>
                    )}

                    {isConnected && isLoading && (
                        <div style={{ padding: "42px", textAlign: "center", color: "var(--text-muted)" }}>Loading portfolio from chain…</div>
                    )}

                    {isConnected && !isLoading && sortedPositions.length === 0 && (
                        <div style={{ padding: "42px", textAlign: "center", borderRadius: "22px", border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-muted)" }}>
                            No trading history yet.
                        </div>
                    )}

                    {isConnected && !isLoading && sortedPositions.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            {sortedPositions.map((position) => {
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
                                            {position.canClaim && <div style={{ color: "#22c55e", fontWeight: 900 }}>Claimable: {formatAmount(position.potentialWinnings)} SkyUSD</div>}
                                            {position.claimed && <div style={{ color: "#60a5fa", fontWeight: 900 }}>Already claimed</div>}
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
                    )}
                </div>
            </div>
        </>
    );
}
