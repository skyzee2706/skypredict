"use client";
import React from "react";
import { formatUnits } from "viem";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { LEADERBOARD_SEASON_NAME } from "@/config/leaderboard";
import Header from "../components/Header/Header";
import { useRouter } from "next/navigation";
import styles from "../page.module.css";

const MEDALS = ["🥇", "🥈", "🥉"];
const SKYUSD_DECIMALS = 6;

function shortenAddress(addr: string) {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function LeaderboardPage() {
    const { entries, isLoading, error } = useLeaderboard();
    const router = useRouter();

    return (
        <>
            <Header 
                onNavigate={(page) => {
                    if (page === 'markets') router.push('/markets');
                    else if (page === 'landing') router.push('/');
                    else if (page === 'leaderboard') router.push('/leaderboard');
                }} 
                currentPage="leaderboard" 
            />
            <div className={styles.mainContainer}>
                <div style={{ maxWidth: "760px", margin: "0 auto", padding: "32px 16px", width: "100%" }}>
                    {/* Header */}
                    <div style={{ textAlign: "center", marginBottom: "40px" }}>
                        <h1 style={{ fontSize: "32px", fontWeight: 800, background: "linear-gradient(135deg, #6366f1, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "-1px" }}>
                            🏆 Leaderboard
                        </h1>
                        <p style={{ color: "var(--text-muted)", marginTop: "8px", fontSize: "14px" }}>{LEADERBOARD_SEASON_NAME}</p>
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

                    {!isLoading && entries.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                            {entries.map((entry, idx) => {
                                const medal = MEDALS[idx] ?? `#${idx + 1}`;
                                const isTop = idx < 3;
                                return (
                                    <div
                                        key={entry.address}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "16px",
                                            padding: "16px 20px",
                                            background: isTop ? "linear-gradient(90deg, rgba(99,102,241,0.08), rgba(139,92,246,0.04))" : "var(--bg-card)",
                                            border: `1px solid ${isTop ? "rgba(99,102,241,0.3)" : "var(--border)"}`,
                                            borderRadius: "14px",
                                            transition: "background 0.2s, border 0.2s",
                                        }}
                                    >
                                        {/* Rank */}
                                        <div style={{ fontSize: isTop ? "24px" : "16px", fontWeight: 800, minWidth: "36px", textAlign: "center", color: isTop ? undefined : "var(--text-muted)" }}>
                                            {medal}
                                        </div>

                                        {/* Address */}
                                        <div style={{ flex: 1 }}>
                                            <p style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--text-primary)", fontSize: "15px" }}>
                                                {shortenAddress(entry.address)}
                                            </p>
                                            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                                                {entry.yesBets} YES · {entry.noBets} NO bets
                                            </p>
                                        </div>

                                        {/* Volume */}
                                        <div style={{ textAlign: "right" }}>
                                            <p style={{ fontWeight: 800, fontSize: "16px", fontFamily: "monospace", color: "var(--text-primary)" }}>
                                                {parseFloat(formatUnits(entry.volume, SKYUSD_DECIMALS)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </p>
                                            <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>SkyUSD volume</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <p style={{ textAlign: "center", marginTop: "32px", fontSize: "12px", color: "var(--text-muted)" }}>
                        Ranked by total SkyUSD betting volume · Refreshes every 30s
                    </p>
                </div>
            </div>
        </>
    );
}
