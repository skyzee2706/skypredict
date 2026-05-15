'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { formatUnits } from 'viem';
import { useAccount } from 'wagmi';
import Header from '../components/Header/Header';
import styles from '../page.module.css';
import { useLeaderboard, LeaderboardEntry } from '@/hooks/useLeaderboard';

function shortAddress(address: string) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatAmount(value: bigint) {
    const formatted = Number(formatUnits(value, 18));
    if (!Number.isFinite(formatted)) return '0';
    return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: formatted >= 1000 ? 1 : 2,
        notation: formatted >= 1_000_000 ? 'compact' : 'standard',
    }).format(formatted);
}

function LeaderboardRow({ entry, isMe = false }: { entry: LeaderboardEntry; isMe?: boolean }) {
    const rankLabel = entry.volumeRank <= 3
        ? ['🥇', '🥈', '🥉'][entry.volumeRank - 1]
        : `#${entry.volumeRank}`;

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: '52px minmax(0,1fr) 110px 96px',
            gap: 14,
            alignItems: 'center',
            padding: '14px 16px',
            borderRadius: 16,
            border: isMe ? '1px solid var(--card-border-hover)' : '1px solid var(--card-border)',
            background: isMe ? 'var(--success-bg)' : 'var(--surface-elevated)',
            boxShadow: 'var(--shadow-inset)',
        }}>
            <div style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                display: 'grid',
                placeItems: 'center',
                color: entry.volumeRank <= 3 ? '#fffdf7' : 'var(--foreground)',
                background: entry.volumeRank <= 3 ? 'var(--primary)' : 'var(--section-bg)',
                fontWeight: 900,
                fontSize: entry.volumeRank <= 3 ? 18 : 13,
            }}>
                {rankLabel}
            </div>

            <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 850, color: 'var(--foreground)' }}>
                    {shortAddress(entry.address)} {isMe && <span style={{ color: 'var(--success)' }}>· You</span>}
                </div>
                <div style={{ marginTop: 3, color: 'var(--text-muted)', fontSize: 12 }}>
                    {entry.totalBets} trades
                </div>
            </div>

            <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 850, color: 'var(--foreground)' }}>{formatAmount(entry.volume)}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Volume</div>
            </div>

            <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 850, color: entry.pnl >= 0n ? 'var(--success)' : 'var(--danger)' }}>
                    {entry.pnl >= 0n ? '+' : ''}{formatAmount(entry.pnl)}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>PNL</div>
            </div>
        </div>
    );
}

export default function LeaderboardPage() {
    const router = useRouter();
    const { address } = useAccount();
    const { entries, currentUser, isLoading, error, lastProcessedBlock } = useLeaderboard();
    const userInTop20 = Boolean(address && entries.some((entry) => entry.address.toLowerCase() === address.toLowerCase()));

    return (
        <>
            <Header
                onNavigate={(page) => {
                    if (page === 'landing') router.push('/');
                    else if (page === 'markets') router.push('/markets');
                    else if (page === 'portfolio') router.push('/portfolio');
                    else if (page === 'leaderboard') router.push('/leaderboard');
                    else if (page === 'faucet') router.push('/faucet');
                }}
                currentPage="leaderboard"
            />

            <div className={styles.mainContainer}>
                <div className={styles.contentArea}>
                    <div className={styles.scrollContent} style={{ paddingTop: 28 }}>
                        <div className={styles.sectionHeader} style={{ alignItems: 'flex-end' }}>
                            <div>
                                <h1 className={styles.sectionTitle} style={{ fontSize: 30, marginBottom: 6 }}>
                                    Leaderboard
                                </h1>
                                <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                                    Top 20 traders by volume
                                </p>
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                                Block {lastProcessedBlock || '-'}
                            </div>
                        </div>

                        <div style={{
                            width: '100%',
                            border: '1px solid var(--card-border)',
                            borderRadius: 20,
                            background: 'var(--card-bg)',
                            boxShadow: 'var(--shadow-card)',
                            padding: 12,
                        }}>
                            {isLoading ? (
                                <div className={styles.emptyState}>Loading leaderboard...</div>
                            ) : error ? (
                                <div className={styles.emptyState} style={{ color: 'var(--danger)' }}>{error}</div>
                            ) : entries.length === 0 ? (
                                <div className={styles.emptyState} style={{ minHeight: 180, flexDirection: 'column', gap: 8, textAlign: 'center' }}>
                                    <strong style={{ color: 'var(--foreground)' }}>No traders yet</strong>
                                    <span style={{ maxWidth: 520, fontSize: 13 }}>
                                        Leaderboard akan muncul setelah ada trade sukses dan indexer di-refresh.
                                    </span>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gap: 10 }}>
                                    {entries.map((entry) => (
                                        <LeaderboardRow
                                            key={entry.address}
                                            entry={entry}
                                            isMe={Boolean(address && entry.address.toLowerCase() === address.toLowerCase())}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        {currentUser && !userInTop20 && (
                            <div style={{ marginTop: 20 }}>
                                <div style={{ marginBottom: 10, color: 'var(--text-secondary)', fontWeight: 800, fontSize: 14 }}>
                                    Your rank
                                </div>
                                <LeaderboardRow entry={currentUser} isMe />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
