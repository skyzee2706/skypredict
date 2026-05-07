import React from 'react';
import styles from './MarketFullPage.module.css';
import TradeBox from '../SharedMarket/TradeBox';
import UserBetDisplay from '../SharedMarket/UserBetDisplay';
import ChartSection from '../SharedMarket/ChartSection';
import { MarketData, getUserMarketStatus, UserMarketStatus } from '../../../data/markets';
import { claimRewards } from '../../../lib/onchain/writes';
import { useWallet } from '../../providers/WalletProvider';
import { useToast } from '../../providers/ToastProvider';
import ConnectWalletPrompt from '../Wallet/ConnectWalletPrompt';
import { formatVolume, formatAddress, formatResolutionDate } from '../../../utils/formatters';
import CopyIcon from '../Shared/CopyIcon';
import ResolutionRules from '../Shared/ResolutionRules';
import { useLiveScore } from '../../../hooks/useLiveScore';

interface MarketFullPageProps {
    onBack: () => void;
    market?: MarketData; // New: Full market data
    // Legacy props for backwards compatibility
    marketTitle?: string;
    probability?: number;
    type?: 'crypto' | 'stock' | 'sport' | 'other';
    identifier?: string;
    description?: string;
    resolutionRule?: string;
    volume?: number;
}


const MarketFullPage: React.FC<MarketFullPageProps> = ({
    onBack,
    market,
    // Legacy props
    marketTitle: legacyTitle = "Market Title",
    probability: legacyProbability = 50,
    type: legacyType = 'crypto',
    identifier: legacyIdentifier = 'bitcoin',
    description: legacyDescription = "",
    resolutionRule: legacyResolutionRule = "Standard Rules",
    volume: legacyVolume = 0
}) => {
    // Use market data or fall back to legacy props
    const marketTitle = market?.title || legacyTitle;
    const probability = market ? market.probYes * 100 : legacyProbability;
    const type = market?.type || legacyType;
    const identifier = market?.identifier || legacyIdentifier;
    const description = market?.description || legacyDescription;
    const resolutionRule = market?.resolutionRule || legacyResolutionRule;
    const volume = market?.volume || legacyVolume;

    const { isConnected, walletAddress } = useWallet();
    const { showToast } = useToast();
    const isSportsMarket = market?.category === 'SPORTS' || type === 'sport';
    const { liveScore, loading: liveScoreLoading } = useLiveScore(
        isSportsMarket ? market?.sideAName : undefined,
        isSportsMarket ? market?.sideBName : undefined,
        market?.deadlineDate ?? market?.deadline
    );

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
    const finalPriceText = market?.deadlinePrice
        ? `${market.priceSymbol ?? ''}${market.deadlinePrice.toLocaleString()}`
        : null;
    const resolutionDate = formatResolutionDate(market?.deadlineDate);
    const handleClaim = async () => {
        if (!market || !isConnected) return;
        await claimRewards(market.contractId as `0x${string}`);
    };

    // Shared rendering functions
    const renderTopBar = () => (
        <div className={styles.topBar}>
            <button className={styles.backButton} onClick={onBack}>← Back</button>
            <button className={styles.backButton}>Share</button>
        </div>
    );

    const renderMetaRow = () => {
        const state = market?.state || 'ACTIVE';
        const isResolved = state === 'RESOLVED' || state === 'UNDETERMINED';
        const dateText = isResolved
            ? 'Trading closed'
            : `Ends on ${formatResolutionDate(market?.deadlineDate ?? market?.deadline) ?? '—'}`;

        return (
            <div className={styles.metaRow}>
                <span>{dateText}</span>
                {market?.contractId && (
                    <span>
                        {formatAddress(market.contractId)}
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

    const renderStateRow = () => {
        const state = market?.state || 'ACTIVE';

        if (state === 'UNDETERMINED') {
            return (
                <div className={styles.stateRow}>
                    <span className={`${styles.statePill} ${styles.statePillUndetermined}`}>Undetermined</span>
                    <span className={styles.stateNote}>Trading closed · Outcome undetermined</span>
                </div>
            );
        } else if (state === 'RESOLVED') {
            return (
                <div className={styles.stateRow}>
                    <span className={`${styles.statePill} ${styles.statePillFinalized}`}>Finalized</span>
                    <span className={styles.stateNote}>Trading closed · Outcome locked</span>
                </div>
            );
        } else if (state === 'RESOLVING') {
            return (
                <div className={styles.stateRow}>
                    <span className={`${styles.statePill} ${styles.statePillResolving}`}>Resolving</span>
                    <span className={styles.stateNote}>Trading paused · Outcome pending</span>
                </div>
            );
        } else {
            return (
                <div className={styles.stateRow}>
                    <span className={`${styles.statePill} ${styles.statePillActive}`}>Active</span>
                    <span className={styles.stateNote}>Trading open · Live market</span>
                </div>
            );
        }
    };

    const renderTitle = () => (
        <h1 className={styles.title}>{marketTitle}</h1>
    );

    const renderLiveScoreCard = () => {
        if (!isSportsMarket) return null;

        const kickoffText = formatResolutionDate(liveScore?.utcDate ?? market?.deadlineDate ?? market?.deadline);
        const status = liveScore?.status ?? 'SCHEDULED';
        const isNotStarted = status === 'TIMED' || status === 'SCHEDULED' || !liveScore;
        const statusLabel = liveScoreLoading
            ? 'Loading score'
            : isNotStarted
                ? 'Not Started'
                : liveScore?.elapsed || status;
        const homeGoals = liveScore?.homeGoals ?? 0;
        const awayGoals = liveScore?.awayGoals ?? 0;

        return (
            <section className={styles.liveScoreCard} aria-label="Live match score">
                <div className={styles.liveScoreHeader}>
                    <span className={styles.liveScoreEyebrow}>Match Center</span>
                    <span className={`${styles.liveStatusPill} ${!isNotStarted ? styles.liveStatusPillActive : ''}`}>
                        {statusLabel}
                    </span>
                </div>
                <div className={styles.scoreboardRow}>
                    <div className={styles.scoreTeam}>
                        <span className={styles.teamName}>{liveScore?.homeTeam || market?.sideAName || 'Home'}</span>
                        <span className={styles.scoreValue}>{isNotStarted ? '—' : homeGoals}</span>
                    </div>
                    <div className={styles.scoreDivider}>vs</div>
                    <div className={styles.scoreTeam}>
                        <span className={styles.teamName}>{liveScore?.awayTeam || market?.sideBName || 'Away'}</span>
                        <span className={styles.scoreValue}>{isNotStarted ? '—' : awayGoals}</span>
                    </div>
                </div>
                <div className={styles.kickoffMeta}>Kickoff: {kickoffText || '—'}</div>
            </section>
        );
    };

    const renderProgressBar = () => {
        if (market?.category === 'SPORTS') {
            const probYes = market.probYes * 100;
            const probDraw = (market.probDraw ?? 0) * 100;
            const probNo = market.probNo * 100;
            return (
                <div className={styles.progressSection}>
                    <div className={styles.probabilityText}>
                        <span style={{ color: 'var(--success)' }}>{probYes.toFixed(1)}%</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{probDraw.toFixed(1)}%</span>
                        <span style={{ color: 'var(--danger)' }}>{probNo.toFixed(1)}%</span>
                    </div>
                    <div className={styles.barBackground} style={{ display: 'flex', gap: '2px', backgroundColor: 'transparent' }}>
                        <div className={styles.barFill} style={{ width: `${probYes}%`, backgroundColor: 'var(--success)', height: '100%', borderRadius: '4px' }}></div>
                        <div className={styles.barFill} style={{ width: `${probDraw}%`, backgroundColor: 'var(--text-secondary)', height: '100%', borderRadius: '4px' }}></div>
                        <div className={styles.barFill} style={{ width: `${probNo}%`, backgroundColor: 'var(--danger)', height: '100%', borderRadius: '4px' }}></div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{market?.sideAName ?? 'Home'}</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{market?.drawName ?? 'Draw'}</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{market?.sideBName ?? 'Away'}</span>
                    </div>
                </div>
            );
        }

        return (
            <div className={styles.progressSection}>
                <div className={styles.probabilityText}>
                    <span style={{ color: 'var(--foreground)' }}>{probability.toFixed(1)}%</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{(100 - probability).toFixed(1)}%</span>
                </div>
                <div className={styles.barBackground}>
                    <div className={styles.barFill} style={{ width: `${probability}%` }}></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{market?.sideAName ?? 'Side A'}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{market?.sideBName ?? 'Side B'}</span>
                </div>
            </div>
        );
    };

    const renderVolumeRow = () => (
        <div className={styles.volumeRow}>
            <span>↗ Volume {formatVolume(volume)}</span>
        </div>
    );

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
                                {finalPriceText ? `At ${finalPriceText}` : 'Value unavailable'}
                            </div>
                        </>
                    )}
                </div>
                <div className={styles.truthMeta}>
                    <div className={styles.truthMetaItem}>
                        <span className={styles.truthMetaLabel}>Condition</span>
                        <span className={styles.truthMetaValue}>{description}</span>
                    </div>
                    {resolutionDate && (
                        <div className={styles.truthMetaItem}>
                            <span className={styles.truthMetaLabel}>
                                {isResolving ? 'Expected' : 'Resolved on'}
                            </span>
                            <span className={styles.truthMetaValue}>{resolutionDate}</span>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderFinishedMarketContent = () => (
        <>
            {market && <ResolutionRules market={market} />}
        </>
    );

    const renderResolvingMarketContent = () => (
        <>
            {market && <ResolutionRules market={market} />}
        </>
    );

    const renderActiveMarketContent = () => (
        <>
            <ChartSection probability={probability} type={type} identifier={identifier} market={market} />
            {market && <ResolutionRules market={market} />}
        </>
    );

    const renderFinishedMarketSidebar = () => (
        <div className={styles.sidebar}>
            <div className={styles.userResultsSection}>
                <h3 className={styles.sectionTitle}>Your Result</h3>
                {!isConnected ? (
                    <ConnectWalletPrompt
                        align="left"
                        message="Connect your wallet to start betting."
                    />
                ) : !userStatus?.hasPosition ? (
                    <div className={styles.noPositionCard}>
                        <div className={styles.cardHeader}>No Position Taken</div>
                        <p>You did not place a bet on this market.</p>
                    </div>
                ) : (
                    <div className={styles.positionResultCard}>
                        <div className={styles.betSummary}>
                            <span className={styles.betLabel}>Your Bet:</span>
                            <span className={styles.betDetails}>
                                {formatVolume(userStatus.position!.amount)} on {userStatus.position!.outcome}
                            </span>
                        </div>

                        <div className={`${styles.outcomeResult} ${
                            userStatus.userWon ? styles.resultWin : styles.resultLoss
                        }`}>
                            {userStatus.userWon ? (
                                <>
                                    <div className={styles.winMessage}>You Won!</div>
                                    <div className={styles.winAmount}>
                                        +{formatVolume(userStatus.potentialWinnings)}
                                    </div>
                                    {userStatus.canClaim ? (
                                        <button className={styles.claimButton} onClick={handleClaim}>
                                            Claim Winnings
                                        </button>
                                    ) : (
                                        <div className={styles.claimedStatus}>
                                            ✓ Winnings Claimed
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <div className={styles.lossMessage}>You Lost</div>
                                    <div className={styles.lossAmount}>
                                        -{formatVolume(userStatus.position!.amount)}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    const renderResolvingMarketSidebar = () => (
        <div className={styles.sidebar}>
            {market && <UserBetDisplay market={market} variant="full" />}
        </div>
    );

    const renderActiveMarketSidebar = () => (
        <div className={styles.sidebar}>
            <TradeBox probability={probability} market={market} />
            {market && <UserBetDisplay market={market} variant="full" />}
        </div>
    );

    const state = market?.state || 'ACTIVE';
    const isActive = state === 'ACTIVE';

    return (
        <div className={styles.wrap}>
            <div className={styles.container}>
                <div className={styles.mainContent}>
                    {renderTopBar()}
                    {isActive && renderMetaRow()}
                    {renderTitle()}
                    {renderLiveScoreCard()}
                    {renderStateRow()}

                    {/* Truth block for resolved/undetermined markets comes before progress bar */}
                    {(state === 'RESOLVED' || state === 'UNDETERMINED') && renderTruthBlock()}

                    {/* Progress bar and volume for all non-resolved markets */}
                    {state !== 'RESOLVED' && state !== 'UNDETERMINED' && (
                        <>
                            {renderProgressBar()}
                            {renderVolumeRow()}
                        </>
                    )}

                    {/* Truth block for resolving markets comes after progress bar */}
                    {state === 'RESOLVING' && renderTruthBlock()}

                    {/* State-specific content */}
                    {(state === 'RESOLVED' || state === 'UNDETERMINED') && renderFinishedMarketContent()}
                    {state === 'RESOLVING' && renderResolvingMarketContent()}
                    {isActive && renderActiveMarketContent()}
                </div>

                {/* State-specific sidebars */}
                {(state === 'RESOLVED' || state === 'UNDETERMINED') && renderFinishedMarketSidebar()}
                {state === 'RESOLVING' && renderResolvingMarketSidebar()}
                {isActive && renderActiveMarketSidebar()}
            </div>
        </div>
    );
};

export default MarketFullPage;
