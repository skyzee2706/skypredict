'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header/Header';
import CategoryFilter from '../components/CategoryFilter/CategoryFilter';
import MarketCard from '../components/MarketCard/MarketCard';
import MarketDetailPanel from '../components/MarketDetailPanel/MarketDetailPanel';
import styles from '../page.module.css';
import { MarketState, MarketData } from '../../data/markets';
import { useIndexedMarkets } from '../../hooks/useIndexedMarkets';
import { useToast } from '../providers/ToastProvider';

export default function MarketsPage() {
    const router = useRouter();
    const { showToast } = useToast();
    const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
    const [selectedMarketData, setSelectedMarketData] = useState<MarketData | null>(null);
    const [activeCategory, setActiveCategory] = useState('All'); // UI category, not used for fetching
    const [activeMarketState, setActiveMarketState] = useState<MarketState>('ACTIVE');
    const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
    const { markets: indexedMarkets, isLoading: isMarketsLoading, error: marketsError } = useIndexedMarkets();
    const allMarkets = React.useMemo(
        () => (indexedMarkets.length > 0 ? indexedMarkets : []),
        [indexedMarkets]
    );

    useEffect(() => {
        const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
        return () => window.clearInterval(id);
    }, []);

    const handleMarketClick = (id: string) => {
        setSelectedMarketId(id);
        // Find and store the market data from all markets
        const market = allMarkets.find(m => m.id === id);
        setSelectedMarketData(market || null);
    };

    useEffect(() => {
        if (marketsError && allMarkets.length === 0) {
            console.error('Failed to load indexed markets:', marketsError);
            showToast('Failed to load markets. Please try again.', 'error');
        }
    }, [marketsError, allMarkets.length, showToast]);

    // Derived state for currently filtered markets
    const currentMarkets = React.useMemo(() => {
        return allMarkets.filter((m: MarketData) => {
            const deadline = Number(m.bettingEndTime || m.deadline || 0);
            const isPastBettingEnd = m.state !== 'RESOLVED' && deadline > 0 && deadline <= now;
            const liveState: MarketState = isPastBettingEnd ? 'RESOLVING' : m.state;

            if (activeMarketState === 'UNDETERMINED') {
                return false;
            }
            return liveState === activeMarketState;
        });
    }, [allMarkets, activeMarketState, now]);

    // Find selected market in current markets or fall back only when it still belongs to the active tab
    const selectedMarket = React.useMemo((): MarketData | null => {
        if (!selectedMarketId) return null;

        const latestMarket = allMarkets.find(m => m.id === selectedMarketId);
        if (latestMarket) {
            if (activeMarketState === 'UNDETERMINED') {
                const deadline = Number(latestMarket.deadline);
                return latestMarket.state !== 'RESOLVED' && deadline > 0 && deadline < now ? latestMarket : null;
            }
            return latestMarket.state === activeMarketState ? latestMarket : null;
        }

        return selectedMarketData?.state === activeMarketState ? selectedMarketData : null;
    }, [selectedMarketId, allMarkets, activeMarketState, now, selectedMarketData]);

    // Keep stored market data fresh and close the side panel when it leaves the current state
    React.useEffect(() => {
        if (!selectedMarketId) return;
        const latestMarket = allMarkets.find(m => m.id === selectedMarketId);
        if (!latestMarket) return;

        setSelectedMarketData(latestMarket);
        if (activeMarketState !== 'UNDETERMINED' && latestMarket.state !== activeMarketState) {
            setSelectedMarketId(null);
        }
    }, [selectedMarketId, allMarkets, activeMarketState]);

    const filteredMarkets = currentMarkets
        .filter(market => {
            const matchesCategory =
                activeCategory === 'All' ||
                (activeCategory === 'Crypto' && market.category === 'CRYPTO') ||
                (activeCategory === 'Sports' && market.category === 'SPORTS');
            return matchesCategory;
        })
        .sort((a, b) => {
            // Sort by deadline earliest to latest
            const aTime = typeof a.deadline === 'string' ? parseInt(a.deadline, 10) || 0 : a.deadline || 0;
            const bTime = typeof b.deadline === 'string' ? parseInt(b.deadline, 10) || 0 : b.deadline || 0;
            return aTime - bTime;
        });

    const isGridLoading = allMarkets.length === 0 && isMarketsLoading;
    const isEmpty = !isGridLoading && filteredMarkets.length === 0;

    return (
        <>
            <Header onNavigate={(page) => {
                if (page === 'landing') router.push('/');
                else if (page === 'markets') router.push('/markets');
                else if (page === 'portfolio') router.push('/portfolio');
                else if (page === 'leaderboard') router.push('/leaderboard');
                else if (page === 'faucet') router.push('/faucet');
            }} currentPage="markets" />

            <div className={styles.mainContainer}>
                <div className={styles.contentArea}>

                    <div className={styles.stickyHeader}>
                        <CategoryFilter
                            active={activeCategory}
                            onSelect={setActiveCategory}
                        />
                    </div>

                    <div className={styles.scrollContent}>
                        <div className={styles.sectionHeader}>
                            <h2 className={styles.sectionTitle}>
                                {activeMarketState} Markets
                            </h2>
                            <div className={styles.stateFilters}>
                                {(['ACTIVE', 'RESOLVING'] as MarketState[]).map((state) => (
                                    <button
                                        key={state}
                                        className={`${styles.stateFilter} ${
                                            activeMarketState === state ? styles.stateFilterActive : ''
                                        }`}
                                        onClick={() => setActiveMarketState(state)}
                                    >
                                        {state === 'ACTIVE' ? 'Active' : 'Resolving'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className={styles.grid}>
                            {isGridLoading
                                ? Array.from({ length: 6 }).map((_, idx) => (
                                    <div key={idx} className={styles.skeletonGridItem}>
                                        <div className={styles.shimmer}></div>
                                    </div>
                                ))
                                : isEmpty ? (
                                    <div className={styles.emptyState}>
                                        {activeMarketState === 'ACTIVE' && 'No active markets'}
                                        {activeMarketState === 'RESOLVING' && 'No resolving markets'}
                                    </div>
                                ) : (
                                    filteredMarkets.map((market) => (
                                        <MarketCard
                                            key={market.contractId}
                                            market={market}
                                            now={now}
                                            onClick={() => handleMarketClick(market.id)}
                                        />
                                    ))
                                )}
                        </div>
                    </div>

                </div>

                {selectedMarketId !== null && (
                    <div className={styles.sidePanelContainer}>
                        {isGridLoading && !selectedMarket ? (
                            <div className={styles.skeletonDetail}>
                                <div className={styles.shimmer}></div>
                            </div>
                        ) : (
                            <MarketDetailPanel
                                onClose={() => {
                                    setSelectedMarketId(null);
                                    setSelectedMarketData(null);
                                }}
                                onFullPage={() => {
                                    if (selectedMarket?.contractId) {
                                        router.push(`/markets/${selectedMarket.contractId}`);
                                    }
                                }}
                                market={selectedMarket || undefined}
                            />
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
