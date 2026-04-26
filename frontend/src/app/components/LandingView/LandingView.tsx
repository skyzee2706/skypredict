'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMarketsByStatus } from '../../../lib/onchain/reads';
import styles from './LandingView.module.css';

const LandingView: React.FC = () => {
    const { data: activeMarkets } = useQuery({
        queryKey: ['landing_active_markets_count'],
        queryFn: () => fetchMarketsByStatus('ACTIVE'),
        refetchInterval: 60000,
    });
    
    // Fallback to 1 if loading or error to avoid empty layout
    const activeMarketsCount = activeMarkets ? activeMarkets.length : 1;

    return (
        <div className={styles.container}>
            
            {/* Hero Section */}
            <div className={styles.heroSection}>
                <div className={styles.liveBadge}>Sky Predict Alpha</div>
                <h1 className={styles.heroTitle}>
                    Predict the Future.<br/>
                    <span>Earn on the Truth.</span>
                </h1>
                <div className={styles.heroSubtitle}>
                    Decentralized predictions. On-chain truth.
                </div>
                
                <div className={styles.statsRow}>
                    <div className={styles.statItem}>
                        <div className={styles.statValue}>{activeMarketsCount}</div>
                        <div className={styles.statLabel}>Active Markets</div>
                    </div>
                    <div className={styles.statItem}>
                        <div className={styles.statValue}>1%</div>
                        <div className={styles.statLabel}>Platform Fee</div>
                    </div>
                    <div className={styles.statItem}>
                        <div className={styles.statValue}>Seismic Testnet</div>
                        <div className={styles.statLabel}>Network</div>
                    </div>
                </div>
            </div>

            {/* How It Works Section */}
            <div className={styles.howItWorks}>
                <h2 className={styles.sectionTitle}>How It Works</h2>
                <div className={styles.cardsGrid}>
                    <div className={styles.card}>
                        <div className={styles.cardIcon}>01</div>
                        <div className={styles.cardTitle}>Connect Wallet</div>
                        <div className={styles.cardDesc}>Connect wallet on Seismic Testnet</div>
                    </div>
                    <div className={styles.card}>
                        <div className={styles.cardIcon}>02</div>
                        <div className={styles.cardTitle}>Pick a Market</div>
                        <div className={styles.cardDesc}>Browse active prediction markets</div>
                    </div>
                    <div className={styles.card}>
                        <div className={styles.cardIcon}>03</div>
                        <div className={styles.cardTitle}>Place Your Bet</div>
                        <div className={styles.cardDesc}>Buy YES or NO shares with SkyUSD (fee in ETH)</div>
                    </div>
                    <div className={styles.card}>
                        <div className={styles.cardIcon}>04</div>
                        <div className={styles.cardTitle}>Claim Winnings</div>
                        <div className={styles.cardDesc}>Winners get full payout on resolution</div>
                    </div>
                </div>
            </div>

            {/* Footer Section */}
            <div className={styles.footer}>
                <div className={styles.footerText}>
                    Sky Predict Alpha - Seismic Testnet - 1% Upfront Fee Paid in ETH
                </div>
                <div className={styles.socialRow}>
                    <a href="https://x.com/SkyPredict_app" target="_blank" rel="noopener noreferrer" className={styles.socialLink}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.008 4.15H5.039z" />
                        </svg>
                        @SkyPredict_app
                    </a>
                </div>
            </div>

        </div>
    );
};

export default LandingView;
