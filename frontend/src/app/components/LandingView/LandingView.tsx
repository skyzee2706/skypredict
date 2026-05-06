'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import type { MarketData } from '../../../data/markets';
import { useBatchedMarkets, useFactoryMarkets } from '../../../hooks/useMarketBatches';
import styles from './LandingView.module.css';

/* ── SVG Icon Components (consistent across all devices) ── */
const IconWallet = () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12V7H5a2 2 0 010-4h14v4" /><path d="M3 5v14a2 2 0 002 2h16v-5" /><path d="M18 12a1 1 0 100 2 1 1 0 000-2z" />
    </svg>
);
const IconTarget = () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
    </svg>
);
const IconCoins = () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1110.34 18" /><path d="M7 6h1v4" /><path d="M16.71 13.88l.7.71-2.82 2.82" />
    </svg>
);
const IconTrophy = () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9H4.5a2.5 2.5 0 010-5H6" /><path d="M18 9h1.5a2.5 2.5 0 000-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" /><path d="M18 2H6v7a6 6 0 1012 0V2z" />
    </svg>
);
const IconTrendUp = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
);
const IconFootball = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 2a15 15 0 014 10 15 15 0 01-4 10 15 15 0 01-4-10 15 15 0 014-10z" /><path d="M2 12h20" />
    </svg>
);
const IconFlame = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" />
    </svg>
);
const IconArrowRight = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
);

function formatVol(v: number): string {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
    return `$${v.toFixed(0)}`;
}

const LandingView: React.FC = () => {
    const router = useRouter();

    const { addresses } = useFactoryMarkets();
    const { markets: batchedMarkets } = useBatchedMarkets(addresses);
    const [allMarkets, setAllMarkets] = React.useState<MarketData[]>([]);

    React.useEffect(() => {
        if (batchedMarkets.length > 0) {
            setAllMarkets(batchedMarkets);
        }
    }, [batchedMarkets]);

    const activeMarkets = allMarkets.filter(m => m.state === 'ACTIVE');
    const activeMarketsCount = activeMarkets.length;
    const sportCount = activeMarkets.filter(m => m.type === 'sport').length;
    const cryptoCount = activeMarkets.filter(m => m.type === 'crypto').length;

    // Trending: top 3 by volume per category. Reuses cached batched data so the
    // landing page stays seamless like the Markets page.
    const sorted = [...allMarkets].sort((a, b) => b.volume - a.volume);
    const trendingCrypto = sorted.filter(m => m.type === 'crypto').slice(0, 3);
    const trendingSport = sorted.filter(m => m.type === 'sport').slice(0, 3);

    const renderTrendingCard = (market: MarketData) => {
        const isSport = market.type === 'sport';
        return (
            <div
                key={market.id}
                className={styles.trendingCard}
                onClick={() => router.push(`/markets/${market.contractId}`)}
            >
                <div className={styles.trendingCardTop}>
                    <span className={`${styles.trendingBadge} ${isSport ? styles.trendingBadgeSport : styles.trendingBadgeCrypto}`}>
                        {isSport ? <><IconFootball /> Football</> : <><IconTrendUp /> {market.ticker}</>}
                    </span>
                    <span className={styles.trendingVol}>{formatVol(market.volume)}</span>
                </div>
                <div className={styles.trendingTitle}>{market.title}</div>
                <div className={styles.trendingMeta}>
                    <div className={styles.trendingBar}>
                        <div className={styles.trendingBarA} style={{ width: `${Math.round(market.probYes * 100)}%` }} />
                        {(market.probDraw ?? 0) > 0 && (
                            <div className={styles.trendingBarD} style={{ width: `${Math.round((market.probDraw ?? 0) * 100)}%` }} />
                        )}
                    </div>
                    <div className={styles.trendingOdds}>
                        <span>{market.sideAName ?? 'YES'} {Math.round(market.probYes * 100)}%</span>
                        {(market.probDraw ?? 0) > 0 && <span>{market.drawName ?? 'Draw'} {Math.round((market.probDraw ?? 0) * 100)}%</span>}
                        <span>{market.sideBName ?? 'NO'} {Math.round(market.probNo * 100)}%</span>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className={styles.container}>

            {/* ───────── Hero ───────── */}
            <div className={styles.heroSection}>
                <div className={styles.liveBadge}>
                    <span className={styles.liveDot} />
                    Live on Ritual
                </div>
                <h1 className={styles.heroTitle}>
                    Predict the Future.<br />
                    <span>Earn on the Truth.</span>
                </h1>
                <div className={styles.heroSubtitle}>
                    Decentralized prediction markets on Ritual — crypto prices &amp; football matches, resolved on-chain.
                </div>

                <div className={styles.heroActions}>
                    <button className={styles.ctaPrimary} onClick={() => router.push('/markets')}>
                        Explore Markets
                        <IconArrowRight />
                    </button>
                    <button className={styles.ctaSecondary} onClick={() => router.push('/faucet')}>
                        Get SkyUSD Tokens
                    </button>
                </div>

                <div className={styles.statsRow}>
                    <div className={styles.statItem}>
                        <div className={styles.statValue}>{activeMarketsCount}</div>
                        <div className={styles.statLabel}>Active Markets</div>
                    </div>
                    <div className={styles.statDivider} />
                    <div className={styles.statItem}>
                        <div className={styles.statValue}>
                            <span className={styles.statIcon}><IconFootball /></span> {sportCount}
                        </div>
                        <div className={styles.statLabel}>Football</div>
                    </div>
                    <div className={styles.statDivider} />
                    <div className={styles.statItem}>
                        <div className={styles.statValue}>
                            <span className={styles.statIcon}><IconTrendUp /></span> {cryptoCount}
                        </div>
                        <div className={styles.statLabel}>Crypto</div>
                    </div>
                    <div className={styles.statDivider} />
                    <div className={styles.statItem}>
                        <div className={styles.statValue}>10%</div>
                        <div className={styles.statLabel}>Winnings Fee</div>
                    </div>
                    <div className={styles.statDivider} />
                    <div className={styles.statItem}>
                        <div className={styles.statValue}>Ritual</div>
                        <div className={styles.statLabel}>Network</div>
                    </div>
                </div>
            </div>

            {/* ───────── How It Works ───────── */}
            <div className={styles.howItWorks}>
                <h2 className={styles.sectionTitle}>How It Works</h2>
                <div className={styles.cardsGrid}>
                    <div className={styles.card}>
                        <div className={styles.cardNumber}>01</div>
                        <div className={styles.cardIcon}><IconWallet /></div>
                        <div className={styles.cardTitle}>Connect Wallet</div>
                        <div className={styles.cardDesc}>Connect your wallet on the Ritual Network to get started</div>
                    </div>
                    <div className={styles.card}>
                        <div className={styles.cardNumber}>02</div>
                        <div className={styles.cardIcon}><IconTarget /></div>
                        <div className={styles.cardTitle}>Pick a Market</div>
                        <div className={styles.cardDesc}>Browse crypto price or football match prediction markets</div>
                    </div>
                    <div className={styles.card}>
                        <div className={styles.cardNumber}>03</div>
                        <div className={styles.cardIcon}><IconCoins /></div>
                        <div className={styles.cardTitle}>Place Your Bet</div>
                        <div className={styles.cardDesc}>Choose an outcome and bet with SkyUSD — tiny 10% fee on winnings</div>
                    </div>
                    <div className={styles.card}>
                        <div className={styles.cardNumber}>04</div>
                        <div className={styles.cardIcon}><IconTrophy /></div>
                        <div className={styles.cardTitle}>Claim Winnings</div>
                        <div className={styles.cardDesc}>Markets resolve automatically — winners claim full payouts on-chain</div>
                    </div>
                </div>
            </div>

            {/* ───────── Trending Markets ───────── */}
            <div className={styles.trendingSection}>
                <h2 className={styles.sectionTitle}>
                    <span className={styles.sectionTitleIcon}><IconFlame /></span>
                    Trending Markets
                </h2>
                <p className={styles.trendingSub}>Markets with the highest volume right now</p>

                {(trendingCrypto.length > 0 || trendingSport.length > 0) ? (
                    <div className={styles.trendingColumns}>
                        {/* Crypto column */}
                        <div className={styles.trendingCol}>
                            <div className={styles.trendingColHeader}>
                                <span className={styles.trendingColIcon}><IconTrendUp /></span>
                                <span>Crypto</span>
                            </div>
                            {trendingCrypto.length > 0
                                ? trendingCrypto.map(renderTrendingCard)
                                : <div className={styles.trendingEmpty}>No crypto markets yet</div>
                            }
                        </div>

                        {/* Sports column */}
                        <div className={styles.trendingCol}>
                            <div className={styles.trendingColHeader}>
                                <span className={styles.trendingColIcon}><IconFootball /></span>
                                <span>Football</span>
                            </div>
                            {trendingSport.length > 0
                                ? trendingSport.map(renderTrendingCard)
                                : <div className={styles.trendingEmpty}>No football markets yet</div>
                            }
                        </div>
                    </div>
                ) : (
                    <div className={styles.trendingEmptyWide}>
                        No markets available yet — check back soon!
                    </div>
                )}

                <div className={styles.trendingCta}>
                    <button className={styles.ctaPrimary} onClick={() => router.push('/markets')}>
                        View All Markets
                        <IconArrowRight />
                    </button>
                </div>
            </div>

            {/* ───────── Professional Footer ───────── */}
            <footer className={styles.footer}>
                <div className={styles.footerInner}>
                    {/* Brand */}
                    <div className={styles.footerBrand}>
                        <div className={styles.footerLogo}>Sky Predict</div>
                        <p className={styles.footerTagline}>
                            Decentralized prediction markets<br />powered by the Ritual Network.
                        </p>
                    </div>

                    {/* Links columns */}
                    <div className={styles.footerLinksGroup}>
                        <div className={styles.footerLinkCol}>
                            <div className={styles.footerColTitle}>Product</div>
                            <a href="/markets" className={styles.footerLink}>Markets</a>
                            <a href="/faucet" className={styles.footerLink}>Faucet</a>
                            <a href="/portfolio" className={styles.footerLink}>Portfolio</a>
                        </div>
                        <div className={styles.footerLinkCol}>
                            <div className={styles.footerColTitle}>Resources</div>
                            <span className={styles.footerLinkDisabled}>Documentation <span className={styles.comingSoon}>Soon</span></span>
                            <span className={styles.footerLinkDisabled}>Whitepaper <span className={styles.comingSoon}>Soon</span></span>
                            <span className={styles.footerLinkDisabled}>API Reference <span className={styles.comingSoon}>Soon</span></span>
                        </div>
                        <div className={styles.footerLinkCol}>
                            <div className={styles.footerColTitle}>Community</div>
                            <a href="https://x.com/SkyPredict_app" target="_blank" rel="noopener noreferrer" className={styles.footerLink}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.008 4.15H5.039z" /></svg>
                                Twitter / X
                            </a>
                            <span className={styles.footerLinkDisabled}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286z" /></svg>
                                Discord <span className={styles.comingSoon}>Soon</span>
                            </span>
                            <span className={styles.footerLinkDisabled}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>
                                GitHub <span className={styles.comingSoon}>Soon</span>
                            </span>
                        </div>
                    </div>
                </div>

                {/* Bottom bar */}
                <div className={styles.footerBottom}>
                    <div className={styles.footerCopyright}>
                        © {new Date().getFullYear()} Sky Predict. All rights reserved.
                    </div>
                    <div className={styles.footerBottomLinks}>
                        <span className={styles.footerBottomDisabled}>Privacy Policy</span>
                        <span className={styles.footerBottomDot}>·</span>
                        <span className={styles.footerBottomDisabled}>Terms of Service</span>
                        <span className={styles.footerBottomDot}>·</span>
                        <span className={styles.footerBottomLabel}>Built on Ritual</span>
                    </div>
                </div>
            </footer>

        </div>
    );
};

export default LandingView;
