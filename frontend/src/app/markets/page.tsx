'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header/Header';
import CategoryFilter from '../components/CategoryFilter/CategoryFilter';
import MarketCard from '../components/MarketCard/MarketCard';
import MarketDetailPanel from '../components/MarketDetailPanel/MarketDetailPanel';
import styles from '../page.module.css';
import { MarketState, MarketData } from '../../data/markets';
import { fetchMarketsByStatus } from '../../lib/onchain/reads';
import { useToast } from '../providers/ToastProvider';

export default function MarketsPage() {
    const router = useRouter();
    const { showToast } = useToast();
    const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
    const [selectedMarketData, setSelectedMarketData] = useState<MarketData | null>(null);
    const [activeCategory, setActiveCategory] = useState('All'); // UI category, not used for fetching
    const [activeMarketState, setActiveMarketState] = useState<MarketState>('ACTIVE');
    const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
    const [currentMarkets, setCurrentMarkets] = useState<MarketData[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
        return () => window.clearInterval(id);
    }, []);

    const handleMarketClick = (id: string) => {
        setSelectedMarketId(id);
        // Find and store the market data from current markets
        const market = currentMarkets.find(m => m.id === id);
        setSelectedMarketData(market || null);
    };

    const loadMarketsForCurrentState = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const markets = await fetchMarketsByStatus(activeMarketState);
            setCurrentMarkets(markets);
        } catch (error) {
            console.error(`Failed to load ${activeMarketState} markets:`, error);
            showToast(`Failed to load ${activeMarketState.toLowerCase()} markets. Please try again.`, 'error');
            setCurrentMarkets([]);
        } finally {
            setIsLoading(false);
        }
    }, [activeMarketState, showToast]);

    // Always fetch fresh data when state changes
    useEffect(() => {
        loadMarketsForCurrentState();
    }, [loadMarketsForCurrentState]);

    // Periodically refresh markets data every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            loadMarketsForCurrentState();
        }, 30000);

        return () => clearInterval(interval);
    }, [loadMarketsForCurrentState]);

    // Find selected market in current markets or fall back to stored data
    const selectedMarket = React.useMemo((): MarketData | null => {
        if (!selectedMarketId) return null;

        // Try to find in current markets (for updated data)
        const currentMarket = currentMarkets.find(m => m.id === selectedMarketId);
        if (currentMarket) {
            return currentMarket;
        }

        // Fall back to stored market data (maintains panel persistence when switching states)
        return selectedMarketData;
    }, [selectedMarketId, currentMarkets, selectedMarketData]);

    // Update stored market data when we find the market in current state
    React.useEffect(() => {
        if (selectedMarket && selectedMarket.id === selectedMarketId) {
            if (!selectedMarketData || selectedMarketData.contractId !== selectedMarket.contractId) {
                setSelectedMarketData(selectedMarket);
            }
        }
    }, [selectedMarket, selectedMarketId, selectedMarketData]);

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

    const isGridLoading = isLoading;
    const isEmpty = !isGridLoading && filteredMarkets.length === 0;

    return (
        <>
            <Header onNavigate={(page) => {
                if (page === 'landing') router.push('/');
                else if (page === 'markets') router.push('/markets');
                else if (page === 'leaderboard') router.push('/leaderboard');
                else if (page === 'portfolio') router.push('/portfolio');
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
