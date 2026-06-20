"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import Header from "../components/Header/Header";
import styles from "../page.module.css";
import { claimRewards, getUserBets } from "@/lib/onchain/writes";
import { MarketData } from "@/data/markets";
import { useBatchedMarkets } from "@/hooks/useMarketBatches";
import { SKYUSD_MULTIPLIER } from "@/lib/constants";
import { useToast } from "../providers/ToastProvider";
import { getClaimableUnclaimedMarketAddresses, isAlreadyClaimedOnChainError, markPortfolioMarketClaimed } from "@/lib/portfolio/claimState";
import { persistClaimedPortfolioPosition } from "@/lib/portfolio/claimPersistence";

const HISTORY_PAGE_SIZE = 20;

type IndexedPortfolioPosition = {
    market: `0x${string}`;
    sideA: string;
    draw: string;
    sideB: string;
    volume: string;
    payout: string;
    pnl: string;
    claimed: boolean;
    updatedAt?: string | null;
};

type CachedPortfolioResponse = {
    marketAddresses: `0x${string}`[];
    positions?: IndexedPortfolioPosition[];
    activity: Array<{
        txHash: string;
        market: `0x${string}`;
        type: 'BET' | 'CLAIM';
        outcome?: number;
        amount: string;
        blockNumber: string;
        logIndex: number;
        timestamp: number;
        status?: 'RUNNING' | 'WIN' | 'LOSE' | 'CLAIMED';
        resolvedOutcome?: number;
        payout?: string;
        claimed?: boolean;
    }>;
    updatedAt: number;
    source?: string;
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

function parseIndexedAmount(value: string | number | undefined | null) {
    if (value === undefined || value === null) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed / SKYUSD_MULTIPLIER : 0;
}

function shortAddress(addr: string) {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function getResolvedOutcomeId(market: MarketData): number | undefined {
    if (market.resolvedOutcome === undefined || market.resolvedOutcome === null) return undefined;
    const resolved = String(market.resolvedOutcome).trim().toLowerCase();
    if (!resolved) return undefined;

    const sideA = String(market.sideAName || 'YES').trim().toLowerCase();
    const draw = String(market.drawName || 'DRAW').trim().toLowerCase();
    const sideB = String(market.sideBName || 'NO').trim().toLowerCase();

    if (resolved === sideA || resolved === 'yes' || resolved === 'home' || resolved === 'side_a') return 0;
    if (resolved === draw || resolved === 'draw') return 1;
    if (resolved === sideB || resolved === 'no' || resolved === 'away' || resolved === 'side_b') return 2;
    return undefined;
}

function getErrorMessage(error: unknown) {
    return error instanceof Error && error.message ? error.message : "Claim failed. Check wallet and console for details.";
}

export default function PortfolioPage() {
    const router = useRouter();
    const { address, isConnected } = useAccount();
    const { showToast } = useToast();
    const [claiming, setClaiming] = useState<string | null>(null);
    const [historyPage, setHistoryPage] = useState(1);
    const [cachedPortfolio, setCachedPortfolio] = useState<CachedPortfolioResponse | null>(null);
    const [portfolioCacheLoading, setPortfolioCacheLoading] = useState(false);
    const claimedSyncRef = React.useRef(new Set<string>());
    const hasWalletAddress = isConnected && Boolean(address);
    const liveAddresses = useMemo(() => cachedPortfolio?.marketAddresses ?? [], [cachedPortfolio]);
    const { markets: batchedMarkets, isLoading: marketsLoading, isFetching: marketsFetching } = useBatchedMarkets(liveAddresses, { refetchInterval: false, enabled: liveAddresses.length > 0 });
    void marketsLoading;
    void marketsFetching;

    const dbPositions = useMemo<PortfolioPosition[]>(() => {
        const indexedPositions = cachedPortfolio?.positions ?? [];
        if (!indexedPositions.length) return [];

        return indexedPositions.map((position) => {
            const marketAddress = position.market;
            const marketMetadata = batchedMarkets.find((market) => market.contractId.toLowerCase() === marketAddress.toLowerCase());
            const sideA = parseIndexedAmount(position.sideA);
            const draw = parseIndexedAmount(position.draw);
            const sideB = parseIndexedAmount(position.sideB);
            const volume = parseIndexedAmount(position.volume) || sideA + draw + sideB;
            const payout = parseIndexedAmount(position.payout);
            const pnl = parseIndexedAmount(position.pnl);
            const positionValue = payout > 0 ? payout : volume + pnl;

            const isResolved = Boolean(marketMetadata?.state === 'RESOLVED' || marketMetadata?.state === 'UNDETERMINED');
            const userWon = isResolved && payout > 0;

            return {
                market: marketMetadata ?? {
                    id: marketAddress,
                    contractId: marketAddress,
                    title: `Market ${shortAddress(marketAddress)}`,
                    ticker: 'INDEXED',
                    sideAName: 'YES',
                    drawName: 'DRAW',
                    sideBName: 'NO',
                    description: 'Indexed from database. Market metadata is refreshed from chain when available.',
                    type: 'crypto',
                    category: 'CRYPTO',
                    identifier: marketAddress,
                    creationDate: 0,
                    deadline: 0,
                    resolutionSource: 'Indexed database',
                    resolutionRule: 'Position/accounting data is loaded from the Supabase indexer.',
                    liquidity: volume,
                    volume,
                    state: 'ACTIVE',
                    resolvedOutcome: undefined,
                    probYes: 0,
                    probDraw: 0,
                    probNo: 0,
                    percentChange: 0,
                    statsLoading: false,
                } as MarketData,
                sideA,
                draw,
                sideB,
                total: volume,
                claimed: position.claimed,
                canClaim: userWon && !position.claimed,
                userWon,
                positionValue,
            };
        });
    }, [batchedMarkets, cachedPortfolio]);

    const displayedPositions = dbPositions;

    const userStats = useMemo(() => {
        const volume = displayedPositions.reduce((sum, position) => sum + position.total, 0);
        const realizedOrClaimableValue = displayedPositions.reduce((sum, position) => sum + position.positionValue, 0);
        const pnl = realizedOrClaimableValue - volume;
        const pnlPercent = volume > 0 ? (pnl / volume) * 100 : 0;
        return {
            volume,
            pnl,
            pnlPercent,
            historyCount: cachedPortfolio?.activity.filter((activity) => activity.type === 'BET').length || displayedPositions.length,
        };
    }, [cachedPortfolio, displayedPositions]);

    // Database-only portfolio path: positions and activity come from the
    // indexer/Supabase API. Claiming still sends the on-chain transaction.
    useEffect(() => {
        let cancelled = false;

        if (!address) {
            setCachedPortfolio(null);
            setPortfolioCacheLoading(false);
            return;
        }

        setCachedPortfolio(null);
        setPortfolioCacheLoading(true);

        fetch(`/api/portfolio/${address}?t=${Date.now()}`, { cache: "no-store" })
            .then((response) => (response.ok ? response.json() : null))
            .then((data: CachedPortfolioResponse | null) => {
                if (cancelled) return;
                setCachedPortfolio(data);
                setPortfolioCacheLoading(false);
            })
            .catch((error) => {
                if (cancelled) return;
                console.warn("Portfolio database unavailable:", error);
                setPortfolioCacheLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [address]);


    const loadPortfolio = React.useCallback(async () => {
        if (!hasWalletAddress || !address) return;
        setPortfolioCacheLoading(true);
        try {
            const response = await fetch(`/api/portfolio/${address}?t=${Date.now()}`, { cache: "no-store" });
            const data = response.ok ? await response.json() as CachedPortfolioResponse : null;
            setCachedPortfolio(data);
        } catch (error) {
            console.warn("Portfolio database refresh failed:", error);
        } finally {
            setPortfolioCacheLoading(false);
        }
    }, [address, hasWalletAddress]);

    const isLoading = hasWalletAddress && portfolioCacheLoading;

    useEffect(() => {
        claimedSyncRef.current.clear();
    }, [address]);

    useEffect(() => {
        if (!address || !hasWalletAddress) return;

        const marketAddresses = getClaimableUnclaimedMarketAddresses(displayedPositions);
        for (const marketAddress of marketAddresses) {
            const syncKey = `${address.toLowerCase()}:${marketAddress}`;
            if (claimedSyncRef.current.has(syncKey)) continue;
            claimedSyncRef.current.add(syncKey);

            void getUserBets(marketAddress as `0x${string}`, address as `0x${string}`)
                .then((position) => {
                    if (!position.claimed) return;
                    setCachedPortfolio((current) => current ? markPortfolioMarketClaimed(current, marketAddress) : current);
                    void persistClaimedPortfolioPosition({
                        marketAddress,
                        userAddress: address,
                    }).catch((error) => {
                        console.warn("Claimed status background sync failed; indexer will reconcile later:", error);
                    });
                })
                .catch((error) => {
                    claimedSyncRef.current.delete(syncKey);
                    console.warn("Claimed status background check failed:", error);
                });
        }
    }, [address, displayedPositions, hasWalletAddress]);

    const handleClaim = async (position: PortfolioPosition) => {
        if (!address) return;
        const marketAddress = position.market.contractId as `0x${string}`;
        setClaiming(marketAddress);
        try {
            const result = await claimRewards(marketAddress);
            setCachedPortfolio((current) => current ? markPortfolioMarketClaimed(current, marketAddress, result.payout.toString()) : current);
            showToast("Claim validated on-chain.", "success");
            void persistClaimedPortfolioPosition({
                txHash: result.hash,
                marketAddress,
                userAddress: address,
            }).catch((error) => {
                console.warn("Claim persistence failed; indexer will reconcile later:", error);
            });
        } catch (error) {
            console.error("Claim failed:", error);
            if (isAlreadyClaimedOnChainError(error)) {
                setCachedPortfolio((current) => current ? markPortfolioMarketClaimed(current, marketAddress) : current);
                showToast("Reward was already claimed on-chain. Portfolio synced.", "success");
                void persistClaimedPortfolioPosition({
                    marketAddress,
                    userAddress: address,
                }).catch((syncError) => {
                    console.warn("Claimed status sync failed; indexer will reconcile later:", syncError);
                });
                return;
            }
            showToast(getErrorMessage(error), "error");
        } finally {
            setClaiming(null);
        }
    };

    const historyItems = useMemo(() => {
        const betActivities = (cachedPortfolio?.activity ?? []).filter((activity) => activity.type === 'BET');

        if (betActivities.length > 0) {
            const marketByAddress = new Map(displayedPositions.map((position) => [position.market.contractId.toLowerCase(), position]));

            return betActivities.map((activity) => {
                const aggregatePosition = marketByAddress.get(activity.market.toLowerCase());
                const liveMarket = aggregatePosition?.market ?? batchedMarkets.find((item) => item.contractId.toLowerCase() === activity.market.toLowerCase());
                const hasLiveMarket = Boolean(liveMarket);
                const market = liveMarket ?? {
                    id: activity.market,
                    contractId: activity.market,
                    title: `Market ${shortAddress(activity.market)}`,
                    ticker: 'INDEXED',
                    sideAName: 'YES',
                    drawName: 'DRAW',
                    sideBName: 'NO',
                    description: 'Indexed from database. Market metadata is refreshed from chain when available.',
                    type: 'crypto',
                    category: 'CRYPTO',
                    identifier: activity.market,
                    creationDate: 0,
                    deadline: 0,
                    resolutionSource: 'Indexed database',
                    resolutionRule: 'Activity data is loaded from the Supabase indexer.',
                    liquidity: 0,
                    volume: 0,
                    state: 'ACTIVE',
                    resolvedOutcome: undefined,
                    probYes: 0,
                    probDraw: 0,
                    probNo: 0,
                    percentChange: 0,
                    statsLoading: false,
                } as MarketData;
                const amount = parseIndexedAmount(activity.amount);
                const inferredOutcome = activity.outcome ?? (
                    aggregatePosition?.sideA && aggregatePosition.sideA > 0 ? 0 :
                        aggregatePosition?.draw && aggregatePosition.draw > 0 ? 1 :
                            aggregatePosition?.sideB && aggregatePosition.sideB > 0 ? 2 :
                                undefined
                );
                const outcome = inferredOutcome === 0 ? (market.sideAName || 'YES') : inferredOutcome === 1 ? (market.drawName || 'DRAW') : inferredOutcome === 2 ? (market.sideBName || 'NO') : 'Bet';

                const dbStatus = activity.status;
                const hasFinalMarketState = market.state === 'RESOLVED' || market.state === 'UNDETERMINED';
                const hasFinalDbStatus = hasLiveMarket && (dbStatus === 'WIN' || dbStatus === 'LOSE' || dbStatus === 'CLAIMED');
                const canUseResolvedOutcome = hasFinalDbStatus || hasFinalMarketState;
                const resolvedOutcomeId = canUseResolvedOutcome
                    ? activity.resolvedOutcome ?? getResolvedOutcomeId(market)
                    : undefined;
                const hasPerBetResolution = inferredOutcome !== undefined && resolvedOutcomeId !== undefined;
                const isResolved = hasFinalMarketState || hasPerBetResolution;
                const betWon = hasPerBetResolution
                    ? inferredOutcome === resolvedOutcomeId
                    : dbStatus === 'WIN' || dbStatus === 'CLAIMED';

                return {
                    id: `${activity.txHash}-${activity.logIndex}`,
                    market,
                    total: amount,
                    sideA: inferredOutcome === 0 ? amount : 0,
                    draw: inferredOutcome === 1 ? amount : 0,
                    sideB: inferredOutcome === 2 ? amount : 0,
                    outcome,
                    blockNumber: activity.blockNumber,
                    txHash: activity.txHash,
                    timestamp: activity.timestamp,
                    position: aggregatePosition,
                    isResolved,
                    isWinner: betWon,
                };
            }).sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber));
        }

        return [...displayedPositions]
            .sort((a, b) => Number(b.market.deadline) - Number(a.market.deadline))
            .map((position) => ({
                id: position.market.contractId,
                market: position.market,
                total: position.total,
                sideA: position.sideA,
                draw: position.draw,
                sideB: position.sideB,
                outcome: 'Aggregate Position',
                blockNumber: String(position.market.deadline ?? 0),
                txHash: undefined,
                timestamp: 0,
                position,
                isResolved: position.market.state === 'RESOLVED' || position.market.state === 'UNDETERMINED' || position.claimed || position.positionValue > 0,
                isWinner: position.userWon,
            }));
    }, [batchedMarkets, cachedPortfolio, displayedPositions]);

    const totalHistoryPages = Math.max(1, Math.ceil(historyItems.length / HISTORY_PAGE_SIZE));
    const currentHistoryPage = Math.min(historyPage, totalHistoryPages);
    const paginatedHistoryItems = historyItems.slice(
        (currentHistoryPage - 1) * HISTORY_PAGE_SIZE,
        currentHistoryPage * HISTORY_PAGE_SIZE
    );

    useEffect(() => {
        setHistoryPage(1);
    }, [address, historyItems.length]);

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
                <div className={styles.contentArea}>
                    <div className={styles.scrollContent} style={{ maxWidth: "1080px", margin: "0 auto", paddingTop: "32px", paddingBottom: "48px", width: "100%" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "18px", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "24px" }}>
                        <div>
                            <h1 style={{ fontSize: "34px", fontWeight: 950, letterSpacing: "-1px", background: "linear-gradient(135deg,#22c55e,#6366f1,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                                Portfolio
                            </h1>
                            <p style={{ color: "var(--text-muted)", marginTop: "8px" }}>
                                {address ? `Wallet ${shortAddress(address)}` : "Connect wallet to view Realized PNL, volume, history, and claims."}
                            </p>
                        </div>
                        <button onClick={loadPortfolio} style={{ border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)", padding: "12px 16px", borderRadius: "14px", fontWeight: 800, cursor: "pointer" }}>
                            Refresh
                        </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "14px", marginBottom: "24px" }}>
                        <div style={{ padding: "18px", borderRadius: "20px", border: "1px solid rgba(34,197,94,0.28)", background: "linear-gradient(135deg,rgba(34,197,94,0.12),rgba(255,255,255,0.04))" }}>
                            <p style={{ color: "var(--text-muted)", fontSize: "12px", fontWeight: 800 }}>Realized PNL</p>
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

                    {isConnected && !isLoading && historyItems.length === 0 && (
                        <div style={{ padding: "42px", textAlign: "center", borderRadius: "22px", border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-muted)" }}>
                            No trading history yet.
                        </div>
                    )}

                    {isConnected && !isLoading && historyItems.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                                <div>
                                    <h2 style={{ color: "var(--text-primary)", fontSize: "20px", fontWeight: 950 }}>Trading History</h2>
                                    <p style={{ color: "var(--text-muted)", fontSize: "13px", marginTop: "4px" }}>
                                        Showing {((currentHistoryPage - 1) * HISTORY_PAGE_SIZE) + 1}-{Math.min(currentHistoryPage * HISTORY_PAGE_SIZE, historyItems.length)} of {historyItems.length} bets
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
                                {paginatedHistoryItems.map((item) => {
                                    const market = item.market;
                                    const claimPosition = item.position;
                                    const isResolved = Boolean(item.isResolved);
                                    const isWinner = Boolean(item.isWinner);
                                    const isClaimed = isWinner && Boolean(claimPosition?.claimed);
                                    const isClaimable = isWinner && !isClaimed && Boolean(claimPosition?.canClaim);
                                    const realizedPnl = claimPosition ? claimPosition.positionValue - claimPosition.total : (isResolved && !isWinner ? -item.total : 0);
                                    const statusLabel = !isResolved ? "Running" : isWinner ? (isClaimed ? "Claimed" : "Win") : "Lose";
                                    const statusColor = !isResolved ? "#facc15" : isWinner ? "#22c55e" : "#fb7185";
                                    return (
                                        <div key={item.id} style={{ padding: "12px 14px", borderRadius: "16px", border: `1px solid ${statusColor}55`, background: "linear-gradient(135deg, rgba(255,255,255,0.045), rgba(255,255,255,0.018))", boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.035), 0 8px 22px ${statusColor}14`, display: "grid", gridTemplateColumns: "minmax(0,1.45fr) minmax(240px,1fr) auto", gap: "12px", alignItems: "center" }}>
                                            <div>
                                                <p style={{ color: "var(--text-primary)", fontWeight: 900, marginBottom: "3px", fontSize: "13px", lineHeight: 1.25 }}>{market.title}</p>
                                                <p style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                                                    {market.category} · {isResolved ? "Finalized" : market.state} · Block #{item.blockNumber}
                                                </p>
                                                {item.txHash && (
                                                    <p style={{ color: "var(--text-muted)", fontSize: "10px", marginTop: "3px", fontFamily: "monospace" }}>
                                                        Tx {shortAddress(item.txHash)}
                                                    </p>
                                                )}
                                            </div>
                                            <div style={{ color: "var(--text-muted)", fontSize: "11px", lineHeight: 1.45 }}>
                                                <div>Bet: <b style={{ color: "var(--text-primary)" }}>{formatAmount(item.total)} SkyUSD</b></div>
                                                <div>Outcome: <b style={{ color: "var(--text-primary)" }}>{item.outcome}</b></div>
                                                <div>Status: <b style={{ color: statusColor }}>{statusLabel}</b></div>
                                                <div>{market.sideAName || "YES"}: {formatAmount(item.sideA)} · Draw: {formatAmount(item.draw)} · {market.sideBName || "NO"}: {formatAmount(item.sideB)}</div>
                                                {isClaimable && <div style={{ color: "#22c55e", fontWeight: 900 }}>Claimable total: {formatAmount(claimPosition?.positionValue ?? 0)} SkyUSD</div>}
                                                {isClaimed && isWinner && <div style={{ color: "#60a5fa", fontWeight: 900 }}>Claimed total: {formatAmount(claimPosition?.positionValue ?? 0)} SkyUSD</div>}
                                                {isResolved && (isClaimed || !isWinner) && <div style={{ color: realizedPnl < 0 ? "#fb7185" : "#22c55e", fontWeight: 900 }}>Realized PNL: {realizedPnl < 0 ? "-" : "+"}{formatAmount(Math.abs(realizedPnl))} SkyUSD</div>}
                                            </div>
                                            {isClaimable ? (
                                                <button
                                                    onClick={() => claimPosition && handleClaim(claimPosition)}
                                                    disabled={claiming === market.contractId}
                                                    style={{ border: "0", borderRadius: "12px", padding: "9px 13px", fontWeight: 900, cursor: claiming === market.contractId ? "wait" : "pointer", color: "white", background: "linear-gradient(135deg,#22c55e,#16a34a)", boxShadow: "0 8px 18px rgba(34,197,94,0.22)" }}
                                                >
                                                    {claiming === market.contractId ? "Claiming…" : "Claim"}
                                                </button>
                                            ) : (
                                                <div style={{ minWidth: "92px", textAlign: "center", borderRadius: "12px", padding: "9px 13px", fontWeight: 950, fontSize: "12px", color: statusColor, background: "rgba(255,255,255,0.045)", border: `1px solid ${statusColor}55` }}>
                                                    {statusLabel}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    </div>
                </div>
            </div>
        </>
    );
}
