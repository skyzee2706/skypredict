import React from 'react';
import styles from './MarketDetailPanel.module.css';
import TradeBox from '../SharedMarket/TradeBox';
import UserBetDisplay from '../SharedMarket/UserBetDisplay';
import ChartSection from '../SharedMarket/ChartSection';
import { MarketData, getUserMarketStatus, UserMarketStatus } from '../../../data/markets';
import { claimRewards } from '../../../lib/onchain/writes';
import { useWallet } from '../../providers/WalletProvider';
import ConnectWalletPrompt from '../Wallet/ConnectWalletPrompt';
import { useToast } from '../../providers/ToastProvider';
import { formatUsdlAmount, formatAddress, formatResolutionDate, formatVolume } from '../../../utils/formatters';
import CopyIcon from '../Shared/CopyIcon';
import ResolutionRules from '../Shared/ResolutionRules';
import { useLiveScore } from '../../../hooks/useLiveScore';

interface MarketDetailPanelProps {
    onClose: () => void;
    onFullPage: () => void;
    market?: MarketData; // New: Full market data
    // Legacy props for backwards compatibility
    marketTitle?: string;
    probability?: number;
    type?: 'crypto' | 'stock' | 'sport' | 'politics' | 'other';
    identifier?: string;
    description?: string;
    volume?: number;
}


const MarketDetailPanel: React.FC<MarketDetailPanelProps> = ({
    onClose,
    onFullPage,
    market,
    // Legacy props
    marketTitle: legacyTitle = "Market Title",
    probability: legacyProbability = 50,
    type: legacyType = 'crypto',
    identifier: legacyIdentifier = 'bitcoin',
    description: legacyDescription = "",
    volume: legacyVolume = 0
}) => {
    const { showToast } = useToast();
    const panelRef = React.useRef<HTMLDivElement>(null);
    // Use market data or fall back to legacy props
    const marketTitle = market?.title || legacyTitle;
    const probability = market ? market.probYes * 100 : legacyProbability;
    const type = market?.type || legacyType;
    const identifier = market?.identifier || legacyIdentifier;
    const description = market?.description || legacyDescription;
    const volume = market?.volume || legacyVolume;

    const { isConnected, walletAddress } = useWallet();

    // Get user status for finalized markets
    const [userStatus, setUserStatus] = React.useState<UserMarketStatus | null>(null);

    React.useEffect(() => {
        const fetchUserStatus = async () => {
            if (market && isConnected && walletAddress && market.contractId) {
                try {
                    const status = await getUserMarketStatus(market.contractId, walletAddress, market);
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
    }, [market, isConnected, walletAddress]);

    // Live score hook for sports markets
    const isSport = market?.category === 'SPORTS';
    const { liveScore } = useLiveScore(isSport ? market?.sideAName : undefined, isSport ? market?.sideBName : undefined);

    const finalPriceText = market?.deadlinePrice
        ? `${market.priceSymbol ?? ''}${market.deadlinePrice.toLocaleString()}`
        : null;

    const handleClaim = async () => {
        if (!market || !isConnected) return;
        await claimRewards(market.contractId as `0x${string}`);
    };

    // Close panel when clicking outside (but not on navigation elements)
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;

            // Don't close if clicking inside the panel
            if (panelRef.current && panelRef.current.contains(target)) {
                return;
            }

            // Don't close if clicking on navigation elements
            const isNavigationClick = target.closest('.stateFilter') ||
                                    target.closest('[class*="stateFilter"]') ||
                                    target.closest('[class*="CategoryFilter"]') ||
                                    target.closest('[class*="categoryFilter"]') ||
                                    target.classList.contains('stateFilter') ||
                                    target.dataset.role === 'navigation' ||
                                    // Check for common navigation class patterns
                                    Array.from(target.classList).some(cls =>
                                        cls.includes('filter') ||
                                        cls.includes('nav') ||
                                        cls.includes('tab') ||
                                        cls.includes('category') ||
                                        cls.includes('state')
                                    );

            if (!isNavigationClick) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Shared rendering functions
    const renderTopBar = () => (
        <div className={styles.topBar}>
            <div style={{ display: 'flex', gap: '8px' }}>
                <button className={styles.backButton} onClick={onClose} style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>✕</span>
                    <span>Close</span>
                </button>
                {market && (
                    <button className={styles.backButton} onClick={onFullPage}>⛶ Full page</button>
                )}
            </div>
            <button className={styles.shareButton}>Share</button>
        </div>
    );

    const renderMetaRow = () => {
        const isResolved = market?.state === 'RESOLVED' || market?.state === 'UNDETERMINED';
        const dateText = isResolved
            ? `Ended at ${formatResolutionDate(market.deadlineDate ?? market.deadline) ?? '—'}`
            : `Ends on ${formatResolutionDate(market?.deadlineDate ?? market?.deadline) ?? '—'}`;

        return (
            <div className={styles.metaRow}>
                <span>{dateText}</span>
                {market?.contractId && (
                    <span className={styles.contractBadge}>
                        <span className={styles.addressText}>{formatAddress(market.contractId)}</span>
                        <button
                            className={styles.copyButton}
                            onClick={() => {
                                navigator.clipboard?.writeText(market.contractId);
                                showToast('Address copied', 'success');
                            }}
                            aria-label="Copy contract address"
                        >
                            <CopyIcon />
                        </button>
                    </span>
                )}
            </div>
        );
    };

    const renderHero = () => {
        const state = market?.state || 'ACTIVE';
        const isUndetermined = state === 'UNDETERMINED';

        let pill;
        if (state === 'ACTIVE') {
            pill = <span className={`${styles.pill} ${styles.pillActive}`}>Active</span>;
        } else if (state === 'RESOLVING') {
            pill = <span className={`${styles.pill} ${styles.pillResolving}`}>Resolving</span>;
        } else if (isUndetermined) {
            pill = <span className={`${styles.pill} ${styles.pillNeutral}`}>Undetermined</span>;
        } else {
            pill = <span className={`${styles.pill} ${styles.pillFinalized}`}>Finalized</span>;
        }

        return (
            <div className={styles.hero}>
                <div className={styles.heroTitleRow}>
                    <h2 className={styles.heroTitle}>{marketTitle}</h2>
                    {pill}
                </div>
            </div>
        );
    };

    const renderProgressBar = () => {
        const isThreeWaySport = market?.category === 'SPORTS' && typeof market.probDraw === 'number';

        if (isThreeWaySport) {
            const probYes = market.probYes * 100;
            const probDraw = (market.probDraw ?? 0) * 100;
            const probNo = market.probNo * 100;

            return (
                <div className={`${styles.progressBarContainer} ${styles.sportsProgressBarContainer}`}>
                    <div className={styles.sportsProbabilityText}>
                        <span className={styles.sportsProbYes}>{probYes.toFixed(1)}%</span>
                        <span className={styles.sportsProbDraw}>{probDraw.toFixed(1)}%</span>
                        <span className={styles.sportsProbNo}>{probNo.toFixed(1)}%</span>
                    </div>
                    <div className={styles.sportsBarBackground}>
                        <div className={styles.sportsBarYes} style={{ flexGrow: Math.max(probYes, 0.01) }} />
                        <div className={styles.sportsBarDraw} style={{ flexGrow: Math.max(probDraw, 0.01) }} />
                        <div className={styles.sportsBarNo} style={{ flexGrow: Math.max(probNo, 0.01) }} />
                    </div>
                    <div className={styles.sportsOutcomeLabels}>
                        <span title={market?.sideAName ?? 'Home'}>{market?.sideAName ?? 'Home'}</span>
                        <span title={market?.drawName ?? 'Draw'}>{market?.drawName ?? 'Draw'}</span>
                        <span title={market?.sideBName ?? 'Away'}>{market?.sideBName ?? 'Away'}</span>
                    </div>
                </div>
            );
        }

        return (
            <div className={styles.progressBarContainer}>
                <div className={styles.probabilityText}>
                    <span className={styles.binaryProbYes}>{probability.toFixed(1)}%</span>
                    <span className={styles.binaryProbNo}>{(100 - probability).toFixed(1)}%</span>
                </div>
                <div className={styles.barBackground}>
                    <div className={styles.barFill} style={{ width: `${probability}%` }}></div>
                    <div className={styles.barFillNo} style={{ width: `${100 - probability}%` }}></div>
                </div>
                <div className={styles.binaryOutcomeLabels}>
                    <span className={styles.binaryLabelYes} title={market?.sideAName ?? 'Side A'}>{market?.sideAName ?? 'Side A'}</span>
                    <span className={styles.binaryLabelNo} title={market?.sideBName ?? 'Side B'}>{market?.sideBName ?? 'Side B'}</span>
                </div>
            </div>
        );
    };

    const renderFinishedMarketPosition = () => {
        const position = userStatus?.position;
        const userWon = userStatus?.userWon ?? false;
        const potentialWinnings = userStatus?.potentialWinnings ?? 0;

        return (
            <div className={styles.section}>
                <div className={styles.sectionHeaderRow}>
                    <h3 className={styles.sectionTitleMinimal}>Your position</h3>
                </div>

                {!isConnected ? (
                    <ConnectWalletPrompt
                        align="left"
                        message="Connect your wallet to start betting."
                    />
                ) : !position ? (
                    <div className={styles.emptyState}>No position in this market.</div>
                ) : (
                    <div className={styles.positionCard}>
                        <div className={styles.positionTopRow}>
                            <div className={styles.positionBet}>
                                {formatUsdlAmount(position.amount)} on {position.outcome}
                            </div>
                            <span
                                className={`${styles.badge} ${
                                    userWon
                                        ? position.claimed
                                            ? styles.badgeClaimed
                                            : styles.badgeWon
                                        : styles.badgeLost
                                }`}
                            >
                                {userWon ? (position.claimed ? 'Claimed' : 'Won') : 'Lost'}
                            </span>
                        </div>

                        <div className={`${styles.pnl} ${userWon ? styles.pnlWin : styles.pnlLoss}`}>
                            {userWon ? `+${formatUsdlAmount(potentialWinnings)}` : `-${formatUsdlAmount(position.amount)}`}
                        </div>

                        {userWon && (
                            <button
                                className={`${styles.primaryButton} ${
                                    position.claimed ? styles.primaryButtonClaimed : styles.primaryButtonShimmer
                                }`}
                                onClick={position.claimed ? undefined : handleClaim}
                            >
                                {position.claimed ? 'Claimed' : `Claim ${formatUsdlAmount(potentialWinnings)}`}
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const renderTruthBlock = () => {
        const state = market?.state || 'ACTIVE';
        const isResolved = state === 'RESOLVED' || state === 'UNDETERMINED';
        const isResolving = state === 'RESOLVING';

        if (!isResolved && !isResolving) return null;

        return (
            <div className={styles.truthBlock}>
                <div className={styles.truthHeader}>Resolution</div>
                <div className={styles.truthOutcomeRow}>
                    {isResolving ? (
                        <div className={`${styles.truthOutcome} ${styles.truthOutcomeNeutral}`}>
                            Resolving<span className={styles.truthEllipsis}>...</span>
                        </div>
                    ) : (
                        <>
                            <div
                                className={`${styles.truthOutcome} ${
                                    market?.resolvedOutcome === market?.sideAName
                                        ? styles.truthOutcomeYes
                                        : market?.resolvedOutcome === market?.sideBName
                                            ? styles.truthOutcomeNo
                                            : styles.truthOutcomeNeutral
                                }`}
                            >
                                {market?.resolvedOutcome ?? '—'}
                            </div>
                            <div className={styles.truthValue}>
                                {finalPriceText ? `Closed at ${finalPriceText}` : 'Value unavailable'}
                            </div>
                        </>
                    )}
                </div>
                <div className={styles.truthMeta}>
                    <div className={styles.truthMetaItem}>
                        <span className={styles.truthMetaLabel}>Condition</span>
                        <span className={styles.truthMetaValue}>{market?.description || description}</span>
                    </div>
                    {(market?.deadlineDate || market?.deadline) && (
                        <div className={styles.truthMetaItem}>
                            <span className={styles.truthMetaLabel}>
                                {isResolving ? 'Expected' : 'Resolved on'}
                            </span>
                            <span className={styles.truthMetaValue}>
                                {formatResolutionDate(market.deadlineDate ?? market.deadline)}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const state = market?.state || 'ACTIVE';

    return (
        <div className={styles.panel} ref={panelRef}>
            <div className={styles.scrollContainer}>
                {renderTopBar()}
                {renderMetaRow()}
                {renderHero()}
                {renderProgressBar()}

                {/* Volume Stats - shown for all states */}
                <div className={styles.volumeRow}>
                    <span>↗ Volume {formatVolume(volume)}</span>
                </div>

                {/* State-specific content */}
                {state === 'ACTIVE' && (
                    <>
                        <TradeBox probability={probability} market={market} />
                        {market && <UserBetDisplay market={market} variant="compact" />}
                        {isSport ? (
                            <div className={styles.liveScorePreviewCard}>
                                <div className={styles.liveScorePreviewHeader}>
                                    <span className={styles.liveScorePreviewEyebrow}>Match status</span>
                                    <span className={`${styles.liveScorePreviewStatus} ${liveScore && (liveScore.status === 'IN_PLAY' || liveScore.status === 'PAUSED') ? styles.liveScorePreviewStatusActive : ''}`}>
                                        {liveScore && (liveScore.status === 'IN_PLAY' || liveScore.status === 'PAUSED') ? <span className={styles.liveBlinker}></span> : null}
                                        {liveScore?.status === 'TIMED' || liveScore?.status === 'SCHEDULED'
                                            ? 'Not started'
                                            : (liveScore?.elapsed ? `${liveScore.elapsed}` : (liveScore?.status || 'Loading...'))}
                                    </span>
                                </div>

                                {liveScore?.utcDate && (liveScore.status === 'TIMED' || liveScore.status === 'SCHEDULED') && (
                                    <div className={styles.liveScorePreviewKickoff}>
                                        Kickoff · {new Date(liveScore.utcDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                )}

                                <div className={styles.liveScorePreviewTeams}>
                                    <div className={styles.liveScorePreviewTeam}>
                                        <span className={styles.liveScorePreviewTeamName}>{liveScore?.homeTeam || market?.sideAName || 'Home'}</span>
                                        <span className={styles.liveScorePreviewGoals}>{liveScore?.homeGoals ?? '—'}</span>
                                    </div>
                                    <span className={styles.liveScorePreviewDivider}>vs</span>
                                    <div className={styles.liveScorePreviewTeam}>
                                        <span className={styles.liveScorePreviewTeamName}>{liveScore?.awayTeam || market?.sideBName || 'Away'}</span>
                                        <span className={styles.liveScorePreviewGoals}>{liveScore?.awayGoals ?? '—'}</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <ChartSection probability={probability} type={type} identifier={identifier} market={market} />
                        )}
                        {market && <ResolutionRules market={market} />}
                    </>
                )}

                {state === 'RESOLVING' && (
                    <>
                        {market && <UserBetDisplay market={market} variant="compact" />}
                        {renderTruthBlock()}
                        {market && <ResolutionRules market={market} variant="compact" />}
                    </>
                )}

                {(state === 'RESOLVED' || state === 'UNDETERMINED') && (
                    <>
                        {renderFinishedMarketPosition()}
                        {renderTruthBlock()}
                        {market && <ResolutionRules market={market} variant="compact" />}
                    </>
                )}
            </div>
        </div>
    );
};

export default MarketDetailPanel;
