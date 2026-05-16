"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import Header from "../components/Header/Header";
import styles from "../page.module.css";
import { claimRewards } from "@/lib/onchain/writes";
import { MarketData } from "@/data/markets";
import { useBatchedMarkets, useBatchedUserPositions, useFactoryMarkets } from "@/hooks/useMarketBatches";
import { SKYUSD_MULTIPLIER } from "@/lib/constants";
import { useToast } from "../providers/ToastProvider";

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
    }>;
    updatedAt: number;
    source?: string;
};

const DATABASE_FALLBACK_TIMEOUT_MS = 6_000;

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

export default function PortfolioPage() {
    const router = useRouter();
    const { address, isConnected } = useAccount();
    const { showToast } = useToast();
    const [positions, setPositions] = useState<PortfolioPosition[]>([]);
    const [claiming, setClaiming] = useState<string | null>(null);
    const [historyPage, setHistoryPage] = useState(1);
    const [cachedPortfolio, setCachedPortfolio] = useState<CachedPortfolioResponse | null>(null);
    const [portfolioCacheLoading, setPortfolioCacheLoading] = useState(false);
    const [allowChainFallback, setAllowChainFallback] = useState(false);
    const hasWalletAddress = isConnected && Boolean(address);
    const hasDatabasePortfolio = Boolean(cachedPortfolio?.marketAddresses?.length);
    const shouldPollPortfolio = !cachedPortfolio?.positions?.length && positions.length === 0;
    const portfolioRefetchInterval = shouldPollPortfolio ? 10_000 : false;
    const shouldUseChainFallback = allowChainFallback && !hasDatabasePortfolio;
    const { addresses, isLoading: factoryLoading, isFetching: factoryFetching, isFetched: factoryFetched } = useFactoryMarkets({ refetchInterval: portfolioRefetchInterval, enabled: shouldUseChainFallback });
    const liveAddresses = useMemo(() => {
        const cached = cachedPortfolio?.marketAddresses ?? [];
        return cached.length > 0 ? cached : addresses;
    }, [addresses, cachedPortfolio]);
    const { positions: batchedPositions, isLoading: positionsLoading, isFetching: positionsFetching, isFetched: positionsFetched } = useBatchedUserPositions(liveAddresses, address as `0x${string}` | undefined, { refetchInterval: portfolioRefetchInterval, enabled: hasDatabasePortfolio || shouldUseChainFallback });
    const positionMarketAddresses = useMemo(
        () => (hasDatabasePortfolio ? liveAddresses : batchedPositions.map((position) => position.marketAddress)),
        [batchedPositions, hasDatabasePortfolio, liveAddresses]
    );
    const { markets: batchedMarkets, isLoading: marketsLoading, isFetching: marketsFetching, isFetched: marketsFetched } = useBatchedMarkets(positionMarketAddresses, { refetchInterval: portfolioRefetchInterval, enabled: hasDatabasePortfolio || shouldUseChainFallback });
    void positionsLoading;
    void positionsFetching;
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
                    state: position.claimed ? 'RESOLVED' : 'ACTIVE',
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
                canClaim: false,
                userWon: positionValue > volume,
                positionValue,
            };
        });
    }, [batchedMarkets, cachedPortfolio]);

    const displayedPositions = dbPositions.length > 0 ? dbPositions : positions;

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

    // Fast path for production: use the server-side indexer cache first so we
    // only check markets this wallet has interacted with. If the cache is empty
    // or unavailable, the batched on-chain hooks below still work as fallback.
    useEffect(() => {
        let cancelled = false;

        if (!address) {
            setCachedPortfolio(null);
            setPortfolioCacheLoading(false);
            setAllowChainFallback(false);
            return;
        }

        setCachedPortfolio(null);
        setPortfolioCacheLoading(true);
        setAllowChainFallback(false);
        const controller = new AbortController();
        const timeout = window.setTimeout(() => {
            controller.abort();
        }, DATABASE_FALLBACK_TIMEOUT_MS);

        fetch(`/api/portfolio/${address}`, { cache: "no-store", signal: controller.signal })
            .then((response) => (response.ok ? response.json() : null))
            .then((data: CachedPortfolioResponse | null) => {
                if (cancelled) return;
                window.clearTimeout(timeout);
                if (data?.marketAddresses?.length || data?.activity?.length || data?.positions?.length) {
                    setCachedPortfolio(data);
                }
                setAllowChainFallback(false);
                setPortfolioCacheLoading(false);
            })
            .catch((error) => {
                if (cancelled) return;
                if (error instanceof DOMException && error.name === 'AbortError') {
                    console.warn("Portfolio database timed out, keeping the page responsive without automatic chain scan.");
                } else {
                    console.warn("Portfolio cache unavailable:", error);
                    window.clearTimeout(timeout);
                }
                setAllowChainFallback(false);
                setPortfolioCacheLoading(false);
            });

        return () => {
            cancelled = true;
            window.clearTimeout(timeout);
            controller.abort();
        };
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
        // Keep normal navigation lightweight. Only run the heavier on-chain scan
        // when the user explicitly asks for a refresh.
        if (!hasWalletAddress) return;
        setAllowChainFallback(true);
    }, [hasWalletAddress]);

    const hasLoadedFactory = hasDatabasePortfolio || !shouldUseChainFallback || factoryFetched;
    const hasDbPositions = dbPositions.length > 0;
    const hasCheckedPositions = hasDbPositions || !hasWalletAddress || (!hasDatabasePortfolio && !shouldUseChainFallback) || (liveAddresses.length > 0 && positionsFetched);
    const needsMarketDetails = !hasDbPositions && batchedPositions.length > 0;
    const hasLoadedPositionMarkets = hasDbPositions || !needsMarketDetails || marketsFetched;
    const hasNoIndexedMarkets = hasWalletAddress && !hasDatabasePortfolio && allowChainFallback && factoryFetched && !factoryLoading && !factoryFetching && liveAddresses.length === 0;
    const isLoading = hasWalletAddress && !hasNoIndexedMarkets && (portfolioCacheLoading || !hasLoadedFactory || !hasCheckedPositions || !hasLoadedPositionMarkets);

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

    const historyItems = useMemo(() => {
        const betActivities = (cachedPortfolio?.activity ?? []).filter((activity) => activity.type === 'BET');

        if (betActivities.length > 0) {
            const marketByAddress = new Map(displayedPositions.map((position) => [position.market.contractId.toLowerCase(), position]));

            return betActivities.map((activity) => {
                const aggregatePosition = marketByAddress.get(activity.market.toLowerCase());
                const market = aggregatePosition?.market ?? batchedMarkets.find((item) => item.contractId.toLowerCase() === activity.market.toLowerCase()) ?? {
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
                                    const isResolved = market.state === "RESOLVED" || market.state === "UNDETERMINED";
                                    const isClaimed = Boolean(claimPosition?.claimed);
                                    const isWinner = isResolved && (Boolean(claimPosition?.userWon) || isClaimed);
                                    const isClaimable = Boolean(claimPosition?.canClaim);
                                    const statusLabel = !isResolved ? "Running" : isWinner ? (isClaimed ? "Claimed" : "Win") : "Lose";
                                    const statusColor = !isResolved ? "#facc15" : isWinner ? "#22c55e" : "#fb7185";
                                    return (
                                        <div key={item.id} style={{ padding: "12px 14px", borderRadius: "16px", border: `1px solid ${statusColor}55`, background: "linear-gradient(135deg, rgba(255,255,255,0.045), rgba(255,255,255,0.018))", boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.035), 0 8px 22px ${statusColor}14`, display: "grid", gridTemplateColumns: "minmax(0,1.45fr) minmax(240px,1fr) auto", gap: "12px", alignItems: "center" }}>
                                            <div>
                                                <p style={{ color: "var(--text-primary)", fontWeight: 900, marginBottom: "3px", fontSize: "13px", lineHeight: 1.25 }}>{market.title}</p>
                                                <p style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                                                    {market.category} · {market.state === "RESOLVED" ? "Finalized" : market.state} · Block #{item.blockNumber}
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
                                                {isClaimed && isWinner && <div style={{ color: "#60a5fa", fontWeight: 900 }}>Claimed win: +{formatAmount(claimPosition?.positionValue ?? 0)} SkyUSD</div>}
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
