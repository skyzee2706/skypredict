'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Header from '../../components/Header/Header';
import MarketFullPage from '../../components/MarketExpanded/MarketFullPage';
import { MarketData } from '../../../data/markets';
import { useIndexedMarkets } from '../../../hooks/useIndexedMarkets';
import styles from '../../page.module.css';

// src/app/markets/[id]/page.tsx
// ../ -> src/app/markets
// ../../ -> src/app (Where components are)
// So ../../components is correct.
// ../../../ -> src (Where data is)
// So ../../../data/markets is correct.

export default function MarketPage() {
    const router = useRouter();
    const params = useParams();
    const id = params?.id as string;
    const { markets, isLoading } = useIndexedMarkets();
    const [now, setNow] = React.useState(() => Math.floor(Date.now() / 1000));

    React.useEffect(() => {
        const interval = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
        return () => window.clearInterval(interval);
    }, []);

    const market = React.useMemo<MarketData | null>(() => {
        const target = (id || '').toLowerCase();
        const foundRaw = markets.find((m) => {
            const cid = (m.contractId || '').toLowerCase();
            const mid = (m.id ? String(m.id) : '').toLowerCase();
            return cid === target || mid === target;
        }) || null;
        return foundRaw && foundRaw.state !== 'RESOLVED' && Number(foundRaw.bettingEndTime || foundRaw.deadline || 0) <= now
            ? { ...foundRaw, state: 'RESOLVING' as const }
            : foundRaw;
    }, [id, markets, now]);

    const loading = isLoading && markets.length === 0;
    const isInvalidBet = !loading && !market;

    return (
        <>
            <Header onNavigate={(page) => {
                if (page === 'landing') router.push('/');
                else if (page === 'markets') router.push('/markets');
                else if (page === 'portfolio') router.push('/portfolio');
                else if (page === 'leaderboard') router.push('/leaderboard');
                else if (page === 'faucet') router.push('/faucet');
            }} currentPage="markets" />
            <main style={{ display: 'flex', justifyContent: 'center', width: '100%', padding: '0 16px' }}>
                <div style={{ width: '100%', maxWidth: '1360px' }}>
                    {loading ? (
                        <div className={styles.skeletonDetail}>
                            <div className={styles.shimmer}></div>
                        </div>
                    ) : isInvalidBet ? (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minHeight: '60vh',
                            padding: '60px 20px',
                            textAlign: 'center'
                        }}>
                            <h2 style={{
                                fontSize: '24px',
                                fontWeight: '600',
                                color: 'var(--foreground)',
                                marginBottom: '16px'
                            }}>
                                Market Not Found
                            </h2>
                            <p style={{
                                fontSize: '16px',
                                color: 'var(--text-secondary)',
                                marginBottom: '24px',
                                maxWidth: '500px'
                            }}>
                                This address does not correspond to any existing market on PM Kit.
                            </p>
                            <button
                                onClick={() => router.push('/markets')}
                                style={{
                                    padding: '12px 24px',
                                    backgroundColor: 'var(--primary)',
                                    color: 'var(--primary-foreground)',
                                    border: '1px solid var(--primary)',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    fontWeight: '500',
                                    cursor: 'pointer'
                                }}
                            >
                                Browse Markets
                            </button>
                        </div>
                    ) : market ? (
                        <MarketFullPage
                            onBack={() => router.push('/markets')}
                            market={market}
                        />
                    ) : (
                        <div>Market not found</div>
                    )}
                </div>
            </main>
        </>
    );
}
