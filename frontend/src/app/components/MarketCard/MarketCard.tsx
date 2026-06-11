import React from 'react';
import styles from './MarketCard.module.css';
import ProbabilityGauge from '../SharedMarket/ProbabilityGauge';
import { MarketData, getUserMarketStatus, UserMarketStatus } from '../../../data/markets';
import { claimRewards } from '../../../lib/onchain/writes';
import { useWallet } from '../../providers/WalletProvider';
import { useToast } from '../../providers/ToastProvider';
import { formatVolume, formatAddress, formatCountdown, formatDeadlineDateTime, formatExactUsdl } from '../../../utils/formatters';
import ResolutionRules from '../Shared/ResolutionRules';

interface MarketCardProps {
    market: MarketData;
    onClick: () => void;
    now?: number;
    // Legacy props for backwards compatibility (will be removed)
    title?: string;
    icon?: string;
    probability?: number;
    volume?: number;
    timeLeft?: string;
    trend?: 'up' | 'down';
    type?: 'crypto' | 'stock' | 'other';
    identifier?: string;
}


const CopyIcon = () => (
    <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
    >
        <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <rect x="4" y="4" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.65" />
    </svg>
);

const MarketCard: React.FC<MarketCardProps> = ({
    market,
    onClick,
    now,
    // Legacy props for backwards compatibility
    title: legacyTitle,
    icon = '💎',
    probability: legacyProbability,
    volume: legacyVolume,
    trend = 'up',
    type: legacyType,
    identifier: legacyIdentifier
}) => {
    // Use market data or fall back to legacy props
    const title = market?.title || legacyTitle || 'Market';
    const probability = market ? market.probYes * 100 : (legacyProbability || 50);
    const volume = market?.volume || legacyVolume || 0;
    const type = market?.type || legacyType || 'crypto';
    const identifier = market?.identifier || legacyIdentifier;
    void trend;
    void type;
    void identifier;

    const { isConnected, walletAddress } = useWallet();
    const { showToast } = useToast();
    const marketRef = React.useRef(market);

    // Get user market status if we have market data and wallet connected
    const [userStatus, setUserStatus] = React.useState<UserMarketStatus | null>(null);

    React.useEffect(() => {
        marketRef.current = market;
    }, [market]);

    React.useEffect(() => {
        const fetchUserStatus = async () => {
            const currentMarket = marketRef.current;
            if (currentMarket && isConnected && walletAddress && currentMarket.contractId) {
                try {
                    const status = await getUserMarketStatus(currentMarket.contractId, walletAddress, currentMarket);
                    setUserStatus(status);
                } catch (error) {
                    console.error('Error fetching user status:', error);
                    setUserStatus(null);
                }
            } else {
                setUserStatus(null);
            }
        };

        fetchUserStatus();
    }, [market?.contractId, market?.state, market?.resolvedOutcome, isConnected, walletAddress]);

    // --- Countdown (simple, using raw end date) ---
    const hasNow = typeof now === 'number';
    const deadlineSeconds = (() => {
        if (!market) return null;
        if (market.deadlineDate) {
            const parsed = Date.parse(market.deadlineDate);
            if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000);
        }
        if (market.deadline !== undefined && market.deadline !== null) {
            const numeric = typeof market.deadline === 'string' ? Number(market.deadline) : market.deadline;
            if (Number.isFinite(numeric)) return numeric;
        }
        return null;
    })();
    const nowSeconds = hasNow ? now! : null;
    const deadlineText = deadlineSeconds !== null ? formatDeadlineDateTime(deadlineSeconds) : null;
    const countdownText = (() => {
        if (deadlineSeconds === null || nowSeconds === null) return null;
        const diffSeconds = deadlineSeconds - nowSeconds;
        if (diffSeconds <= 0) return '0d 0h 0m 0s';
        return formatCountdown(diffSeconds * 1000);
    })();

    React.useEffect(() => {
        if (!market) return;
        console.debug('[MarketCard countdown]', {
            contractId: market.contractId,
            deadlineSeconds,
            nowSeconds,
            diffSeconds: deadlineSeconds !== null && nowSeconds !== null ? deadlineSeconds - nowSeconds : null,
            rawDeadline: market.deadline,
            deadlineDate: market.deadlineDate,
            countdownText
        });
    }, [market, deadlineSeconds, nowSeconds, countdownText]);

    const handleClaim = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isConnected) return;
        await claimRewards(market.contractId as `0x${string}`);
    };

    const getActionArea = () => {
        if (!market) {
            // Legacy display
            return (
                <div className={styles.actions}>
                    <span className={`${styles.tag} ${styles.tagYes}`}>YES</span>
                    <span className={`${styles.tag} ${styles.tagNo}`}>NO</span>
                </div>
            );
        }

        if (market.state === 'ACTIVE') {
            return (
                <span className={styles.countdown} title={deadlineText ?? undefined}>
                    {countdownText ?? '—'}
                </span>
            );
        }

        return (
            <span className={styles.deadline} title="Deadline">
                {deadlineText ?? '—'}
            </span>
        );
    };

    const isResolving = market?.state === 'RESOLVING';
    const isFinalized = market?.state === 'RESOLVED' || market?.state === 'UNDETERMINED';

    return (
        <div className={`${styles.card} ${isResolving ? styles.cardResolving : ''} ${isFinalized ? styles.cardFinalized : ''}`} onClick={onClick}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <span className={styles.icon}>{icon}</span>
                    <div className={styles.titleGroup}>
                        <h3 className={styles.title}>{title}</h3>
                        {market?.contractId && (
                            <div className={styles.addressRow}>
                                <span className={styles.addressText}>{formatAddress(market.contractId)}</span>
                                <button
                                    className={styles.copyBtn}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigator.clipboard?.writeText(market.contractId);
                                        showToast('Address copied', 'success');
                                    }}
                                    aria-label="Copy contract address"
                                >
                                    <CopyIcon />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                    <ProbabilityGauge probability={probability} market={market} />
                </div>
            </div>

            {isResolving || isFinalized || market?.statsLoading ? (
                <div className={styles.graphContainer}>
                    {market?.statsLoading ? (
                        <div className={styles.statsSkeleton}>
                            <div className={styles.skeletonBar}></div>
                        </div>
                    ) : isResolving ? (
                        <div className={styles.resolvingStage}>
                            <div className={styles.resolvingBackdrop} aria-hidden="true">
                                <svg className={styles.graphLine} viewBox="0 0 100 40" preserveAspectRatio="none">
                                    <path
                                        d="M0,28 C18,30 28,10 46,14 S74,34 100,10"
                                        fill="none"
                                        stroke="rgba(39, 39, 42, 0.55)"
                                        strokeWidth="2"
                                    />
                                    <path
                                        d="M0,35 L0,40 L100,40 L100,18 C80,22 68,34 52,28 S22,18 0,24 Z"
                                        fill="rgba(39, 39, 42, 0.12)"
                                    />
                                </svg>
                            </div>
                            <div className={styles.resolvingOverlay}>
                                <div className={styles.resolvingTitle}>Resolving</div>
                                <div className={styles.resolvingMeta}>
                                    <div className={styles.resolvingRow}>
                                        <span className={styles.resolvingLabel}>Deadline</span>
                                        <span className={styles.resolvingValue}>{deadlineText}</span>
                                    </div>
                                    <div className={styles.resolvingRow}>
                                        <span className={styles.resolvingLabel}>Rule</span>
                                        <span className={`${styles.resolvingValue} ${styles.resolvingRule}`}>
                                            <ResolutionRules market={market} variant="inline" showTitle={false} />
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        (() => {
                            const outcomeTone =
                                market.resolvedOutcome === market.sideAName
                                    ? 'yes'
                                    : market.resolvedOutcome === market.sideBName
                                        ? 'no'
                                        : market.resolvedOutcome === 'INVALID'
                                            ? 'invalid'
                                            : 'neutral';

                            const finalPrice =
                                market.deadlinePrice !== undefined
                                    ? `${market.priceSymbol ?? ''}${market.deadlinePrice.toLocaleString()}`
                                    : null;

                            const position = userStatus?.position;
                            const userState = !userStatus?.hasPosition
                                ? 'none'
                                : userStatus.userWon
                                    ? userStatus.position?.claimed
                                        ? 'claimed'
                                        : userStatus.canClaim
                                            ? 'claimable'
                                            : 'won'
                                    : 'lost';

                            const userLine =
                                userState === 'none'
                                    ? 'No position'
                                    : 'Your stake';

                            const userSubline =
                                userState === 'none'
                                    ? 'You did not participate'
                                    : userState === 'lost'
                                        ? position
                                            ? `${formatVolume(position.amount)} on ${position.outcome}`
                                            : null
                                        : userStatus
                                            ? `+${formatExactUsdl(userStatus.potentialWinnings)}`
                                            : null;

                            return (
                                <div className={styles.finalizedCenter}>
                                    <div className={styles.marketOutcome}>
                                        <div className={styles.marketOutcomeLabel}>Resolved</div>
                                        <div
                                            className={`${styles.marketOutcomeValue} ${
                                                outcomeTone === 'yes'
                                                    ? styles.marketOutcomeYes
                                                    : outcomeTone === 'no'
                                                        ? styles.marketOutcomeNo
                                                        : outcomeTone === 'invalid'
                                                            ? styles.marketOutcomeInvalid
                                                            : styles.marketOutcomeNeutral
                                            }`}
                                        >
                                            {market.resolvedOutcome ?? '—'}
                                        </div>
                                    </div>

                                    <div className={styles.marketFacts}>
                                        <div className={styles.fact}>
                                            <span className={styles.factLabel}>Closed at</span>
                                            <span className={styles.factValue}>{finalPrice ?? '—'}</span>
                                        </div>
                                    </div>

                                    <div className={styles.userOutcome}>
                                        {!isConnected ? (
                                            <div className={styles.userOutcomeText}>
                                                <div className={`${styles.userOutcomeLine} ${styles.userOutcomeNeutral}`}>
                                                    Your stake
                                                </div>
                                                <div className={styles.userOutcomeSubline}>
                                                    Connect your wallet to start betting.
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className={styles.userOutcomeText}>
                                                    <div className={`${styles.userOutcomeLine} ${styles.userOutcomeNeutral}`}>
                                                        {userLine}
                                                    </div>
                                                    {userSubline && (
                                                        <div
                                                            className={
                                                                userState === 'claimable' || userState === 'won' || userState === 'claimed'
                                                                    ? styles.userOutcomePayout
                                                                    : styles.userOutcomeSubline
                                                            }
                                                        >
                                                            {userSubline}
                                                        </div>
                                                    )}
                                                </div>

                                                {userState === 'claimable' ? (
                                                    <button className={`${styles.claimButton} ${styles.claimButtonShimmer}`} onClick={handleClaim}>
                                                        Claim
                                                    </button>
                                                ) : userState === 'claimed' ? (
                                                    <span className={`${styles.claimButton} ${styles.claimButtonClaimed}`}>
                                                        Claimed
                                                    </span>
                                                ) : null}
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })()
                    )}
                </div>
            ) : (
                <div style={{ flex: 1 }}></div>
            )}

            <div className={styles.footer}>
                <div className={styles.footerLeft}>
                    {market?.statsLoading ? (
                        <span className={styles.volumeLoading}></span>
                    ) : (
                        <span className={styles.volume}>{formatVolume(volume)}</span>
                    )}
                </div>
                {getActionArea()}
            </div>
        </div>
    );
};

export default MarketCard;
