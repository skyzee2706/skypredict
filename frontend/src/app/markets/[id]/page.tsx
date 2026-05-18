'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Header from '../../components/Header/Header';
import MarketFullPage from '../../components/MarketExpanded/MarketFullPage';
import { MarketData } from '../../../data/markets';
import styles from '../../page.module.css';

type IndexedMarketsResponse = {
    markets?: MarketData[];
};

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

    const [market, setMarket] = React.useState<MarketData | null>(null);
    const [loading, setLoading] = React.useState<boolean>(true);
    const [isInvalidBet, setIsInvalidBet] = React.useState<boolean>(false);

    React.useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setIsInvalidBet(false);
            try {
                const target = (id || '').toLowerCase();
                const response = await fetch(`/api/markets?t=${Date.now()}`, { cache: 'no-store' });
                if (!response.ok) throw new Error(`Market API failed: ${response.status}`);

                const payload = (await response.json()) as IndexedMarketsResponse;
                const markets = Array.isArray(payload.markets) ? payload.markets : [];
                const nowSec = Math.floor(Date.now() / 1000);
                const foundRaw = markets.find((m) => {
                    const cid = (m.contractId || '').toLowerCase();
                    const mid = (m.id ? String(m.id) : '').toLowerCase();
                    return cid === target || mid === target;
                }) || null;
                const found = foundRaw && foundRaw.state !== 'RESOLVED' && Number(foundRaw.bettingEndTime || foundRaw.deadline || 0) <= nowSec
                    ? { ...foundRaw, state: 'RESOLVING' as const }
                    : foundRaw;

                if (!cancelled) {
                    setMarket(found);
                    setIsInvalidBet(!found);
                }
            } catch (error) {
                console.error('Error loading indexed market:', error);
                if (!cancelled) {
                    setMarket(null);
                    setIsInvalidBet(true);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        if (id) {
            load();
        }
        return () => {
            cancelled = true;
        };
    }, [id]);

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
