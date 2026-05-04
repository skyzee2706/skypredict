"use client";
import React, { useMemo, useState } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { useLeaderboard, LeaderboardEntry } from "@/hooks/useLeaderboard";
import { LEADERBOARD_SEASON_NAME } from "@/config/leaderboard";
import Header from "../components/Header/Header";
import { useRouter } from "next/navigation";
import styles from "../page.module.css";

const MEDALS = ["🥇", "🥈", "🥉"];
const SKYUSD_DECIMALS = 6;
type LeaderboardMode = "pnl" | "volume";

function shortenAddress(addr: string) {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatSkyUsd(value: bigint, options?: { signed?: boolean }) {
    const negative = value < 0n;
    const abs = negative ? -value : value;
    const formatted = parseFloat(formatUnits(abs, SKYUSD_DECIMALS)).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

    if (!options?.signed) return formatted;
    if (negative) return `-${formatted}`;
    return `+${formatted}`;
}

function getRankLabel(rank: number) {
    return MEDALS[rank - 1] ?? `#${rank}`;
}

function getSortedEntries(entries: LeaderboardEntry[], mode: LeaderboardMode) {
    return [...entries].sort((a, b) => {
        const left = mode === "pnl" ? a.pnl : a.volume;
        const right = mode === "pnl" ? b.pnl : b.volume;
        if (left === right) return a.address.localeCompare(b.address);
        return right > left ? 1 : -1;
    });
}

export default function LeaderboardPage() {
    const { entries, isLoading, error } = useLeaderboard();
    const { address } = useAccount();
    const [mode, setMode] = useState<LeaderboardMode>("pnl");
    const router = useRouter();

    const sortedEntries = useMemo(() => getSortedEntries(entries, mode), [entries, mode]);
    const topEntries = sortedEntries.slice(0, 10);
    const normalizedAddress = address?.toLowerCase();
    const userEntry = normalizedAddress ? entries.find((entry) => entry.address.toLowerCase() === normalizedAddress) : undefined;
    const userRank = userEntry ? (mode === "pnl" ? userEntry.pnlRank : userEntry.volumeRank) : undefined;
    const shouldShowUserRank = Boolean(userEntry && userRank && userRank > 10);

    const metricLabel = mode === "pnl" ? "PNL" : "Volume";
    const metricDescription = mode === "pnl"
        ? "Ranked by claimed payout minus total betting volume"
        : "Ranked by total SkyUSD betting volume";

    const renderEntry = (entry: LeaderboardEntry, rank: number, isCurrentUser = false) => {
        const isTop = rank <= 3;
        const metricValue = mode === "pnl" ? entry.pnl : entry.volume;
        const metricColor = mode === "pnl"
            ? entry.pnl >= 0n ? "#22c55e" : "#fb7185"
            : "var(--text-primary)";

        return (
            <div
                key={`${mode}-${entry.address}-${isCurrentUser ? "me" : "top"}`}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    padding: "16px 20px",
                    background: isCurrentUser
                        ? "linear-gradient(90deg, rgba(34,197,94,0.12), rgba(99,102,241,0.08))"
                        : isTop
                            ? "linear-gradient(90deg, rgba(99,102,241,0.10), rgba(139,92,246,0.05))"
                            : "var(--bg-card)",
                    border: `1px solid ${isCurrentUser ? "rgba(34,197,94,0.45)" : isTop ? "rgba(99,102,241,0.32)" : "var(--border)"}`,
                    borderRadius: "16px",
                    boxShadow: isCurrentUser ? "0 18px 50px rgba(34,197,94,0.10)" : undefined,
                    transition: "background 0.2s, border 0.2s, transform 0.2s",
                }}
            >
                <div style={{ fontSize: isTop ? "24px" : "16px", fontWeight: 900, minWidth: "42px", textAlign: "center", color: isTop ? undefined : "var(--text-muted)" }}>
                    {getRankLabel(rank)}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: "monospace", fontWeight: 800, color: "var(--text-primary)", fontSize: "15px" }}>
                        {shortenAddress(entry.address)} {isCurrentUser ? <span style={{ color: "#22c55e", fontFamily: "inherit" }}>(You)</span> : null}
                    </p>
                    <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                        {entry.totalBets} bets · {entry.sideABets} Home/YES · {entry.drawBets} Draw · {entry.sideBBets} Away/NO
                    </p>
                </div>

                <div style={{ textAlign: "right" }}>
                    <p style={{ fontWeight: 900, fontSize: "16px", fontFamily: "monospace", color: metricColor }}>
                        {mode === "pnl" ? formatSkyUsd(metricValue, { signed: true }) : formatSkyUsd(metricValue)}
                    </p>
                    <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "3px" }}>{metricLabel} SkyUSD</p>
                </div>
            </div>
        );
    };

    return (
        <>
            <Header
                onNavigate={(page) => {
                    if (page === 'markets') router.push('/markets');
                    else if (page === 'landing') router.push('/');
                    else if (page === 'leaderboard') router.push('/leaderboard');
                    else if (page === 'faucet') router.push('/faucet');
                }}
                currentPage="leaderboard"
            />
            <div className={styles.mainContainer}>
                <div style={{ maxWidth: "860px", margin: "0 auto", padding: "32px 16px", width: "100%" }}>
                    <div style={{ textAlign: "center", marginBottom: "28px" }}>
                        <h1 style={{ fontSize: "34px", fontWeight: 900, background: "linear-gradient(135deg, #6366f1, #a78bfa, #22c55e)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "-1px" }}>
                            🏆 Leaderboard
                        </h1>
                        <p style={{ color: "var(--text-muted)", marginTop: "8px", fontSize: "14px" }}>{LEADERBOARD_SEASON_NAME}</p>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", padding: "6px", marginBottom: "24px", borderRadius: "18px", border: "1px solid var(--border)", background: "rgba(255,255,255,0.04)" }}>
                        {(["pnl", "volume"] as LeaderboardMode[]).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setMode(tab)}
                                style={{
                                    border: "0",
                                    borderRadius: "14px",
                                    padding: "13px 16px",
                                    cursor: "pointer",
                                    fontWeight: 900,
                                    color: mode === tab ? "white" : "var(--text-muted)",
                                    background: mode === tab ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "transparent",
                                    boxShadow: mode === tab ? "0 14px 35px rgba(99,102,241,0.28)" : "none",
                                }}
                            >
                                {tab === "pnl" ? "Leaderboard PNL" : "Leaderboard Volume"}
                            </button>
                        ))}
                    </div>

                    {isLoading && (
                        <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted)" }}>
                            <div style={{ fontSize: "32px", marginBottom: "12px" }}>⏳</div>
                            <p>Loading from chain…</p>
                        </div>
                    )}

                    {error && (
                        <div style={{ textAlign: "center", padding: "40px", color: "#ef4444", background: "rgba(239,68,68,0.08)", borderRadius: "12px", border: "1px solid rgba(239,68,68,0.2)" }}>
                            ❌ {error}
                        </div>
                    )}

                    {!isLoading && !error && entries.length === 0 && (
                        <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted)" }}>
                            <div style={{ fontSize: "40px", marginBottom: "12px" }}>🏜️</div>
                            <p>No bets placed yet. Be the first!</p>
                        </div>
                    )}

                    {!isLoading && !error && entries.length > 0 && (
                        <>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", color: "var(--text-muted)", fontSize: "12px" }}>
                                <span>Top 1–10 · {metricDescription}</span>
                                <span>Refreshes every 30s</span>
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                {topEntries.map((entry, idx) => renderEntry(entry, idx + 1))}
                            </div>

                            {shouldShowUserRank && userEntry && userRank && (
                                <div style={{ marginTop: "18px" }}>
                                    <p style={{ color: "var(--text-muted)", fontSize: "12px", marginBottom: "10px", textAlign: "center" }}>
                                        Your current rank is outside Top 10
                                    </p>
                                    {renderEntry(userEntry, userRank, true)}
                                </div>
                            )}
                        </>
                    )}

                    <p style={{ textAlign: "center", marginTop: "32px", fontSize: "12px", color: "var(--text-muted)" }}>
                        PNL counts claimed payouts only. If you have unclaimed winnings, claim first so they appear here.
                    </p>
                </div>
            </div>
        </>
    );
}
