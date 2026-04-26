'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Header from '../../components/Header/Header';
import MarketFullPage from '../../components/MarketExpanded/MarketFullPage';
import { MarketData, MarketState } from '../../../data/markets';
import { fetchMarketsByStatus } from '../../../lib/onchain/reads';
import { isLegitBet } from '../../../lib/onchain/writes';
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

                // First check if the provided ID is a valid Ethereum address (potential contract address)
                const isAddress = /^0x[a-fA-F0-9]{40}$/.test(target);

                if (isAddress) {
                    // Validate bet legitimacy if it's a contract address
                    try {
                        const isValid = await isLegitBet(target as `0x${string}`);
                        if (!isValid) {
                            if (!cancelled) {
                                setIsInvalidBet(true);
                                setMarket(null);
                                setLoading(false);
                            }
                            return;
                        }
                    } catch (error) {
                        console.error('Error validating bet legitimacy:', error);
                        // If validation fails, continue with normal search (fallback)
                    }
                }

                const statuses: MarketState[] = ['ACTIVE', 'RESOLVING', 'RESOLVED', 'UNDETERMINED'];
                let found: MarketData | null = null;
                for (const s of statuses) {
                    const list = await fetchMarketsByStatus(s);
                    found = list.find((m) => {
                        const cid = (m.contractId || '').toLowerCase();
                        const mid = (m.id ? String(m.id) : '').toLowerCase();
                        return cid === target || mid === target;
                    }) || null;
                    if (found) break;
                }
                if (!cancelled) setMarket(found);
            } catch (error) {
                console.error('Error loading market:', error);
                if (!cancelled) setMarket(null);
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
