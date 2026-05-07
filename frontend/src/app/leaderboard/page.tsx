'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header/Header';
import styles from '../page.module.css';

export default function LeaderboardPage() {
    const router = useRouter();

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
                <main style={{
                    minHeight: 'calc(100vh - 88px)',
                    display: 'grid',
                    placeItems: 'center',
                    padding: '48px 16px',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        position: 'absolute',
                        inset: '12% auto auto 8%',
                        width: '280px',
                        height: '280px',
                        borderRadius: '999px',
                        background: 'radial-gradient(circle, rgba(34,197,94,0.26), transparent 68%)',
                        filter: 'blur(8px)',
                        pointerEvents: 'none'
                    }} />
                    <div style={{
                        position: 'absolute',
                        right: '8%',
                        bottom: '12%',
                        width: '340px',
                        height: '340px',
                        borderRadius: '999px',
                        background: 'radial-gradient(circle, rgba(99,102,241,0.28), transparent 70%)',
                        filter: 'blur(10px)',
                        pointerEvents: 'none'
                    }} />

                    <section style={{
                        width: 'min(760px, 100%)',
                        border: '1px solid rgba(255,255,255,0.14)',
                        background: 'linear-gradient(135deg, rgba(15,23,42,0.82), rgba(30,41,59,0.58))',
                        boxShadow: '0 28px 90px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.08)',
                        backdropFilter: 'blur(18px)',
                        borderRadius: '32px',
                        padding: '48px 32px',
                        textAlign: 'center',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            margin: '0 auto 22px',
                            width: '76px',
                            height: '76px',
                            borderRadius: '24px',
                            display: 'grid',
                            placeItems: 'center',
                            background: 'linear-gradient(135deg, #22c55e, #6366f1)',
                            color: 'white',
                            fontSize: '34px',
                            fontWeight: 950,
                            boxShadow: '0 18px 48px rgba(34,197,94,0.28)'
                        }}>
                            ★
                        </div>
                        <p style={{
                            color: '#86efac',
                            fontSize: '12px',
                            fontWeight: 950,
                            letterSpacing: '0.18em',
                            textTransform: 'uppercase',
                            marginBottom: '12px'
                        }}>
                            Leaderboard
                        </p>
                        <h1 style={{
                            fontSize: 'clamp(42px, 8vw, 82px)',
                            lineHeight: 0.9,
                            letterSpacing: '-0.06em',
                            margin: 0,
                            background: 'linear-gradient(135deg,#ffffff,#a7f3d0,#a78bfa)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            fontWeight: 1000
                        }}>
                            Coming Soon
                        </h1>
                        <p style={{
                            maxWidth: '560px',
                            margin: '22px auto 0',
                            color: 'var(--text-muted)',
                            fontSize: '16px',
                            lineHeight: 1.7
                        }}>
                            Trader rankings, win rate, volume, and realized PNL are being engineered with precision. This page is already wired into the app and will go live when the leaderboard indexer is ready.
                        </p>
                    </section>
                </main>
            </div>
        </>
    );
}
