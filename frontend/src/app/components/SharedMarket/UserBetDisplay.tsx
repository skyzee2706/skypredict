import React from 'react';
import { MarketData } from '../../../data/markets';
import { getUserBets, calculateUserWinnings, claimRewards } from '../../../lib/onchain/writes';
import { useWallet } from '../../providers/WalletProvider';
import { useToast } from '../../providers/ToastProvider';
import { formatUsdlAmount } from '../../../utils/formatters';
import ConnectWalletPrompt from '../Wallet/ConnectWalletPrompt';
import styles from './UserBetDisplay.module.css';

interface UserBetDisplayProps {
    market: MarketData;
    variant?: 'full' | 'compact';
}

interface UserBetData {
    onSideA: number;
    onSideB: number;
    onDraw?: number;
    ifSideAWins: number;
    ifSideBWins: number;
    ifDrawWins?: number;
    claimed?: boolean;
}

type OptimisticPositionDetail = {
    marketAddress: string;
    userAddress: string;
    outcome: 'YES' | 'DRAW' | 'NO';
    amount: number;
};

const UserBetDisplay: React.FC<UserBetDisplayProps> = ({ market, variant = 'full' }) => {
    void variant;
    const { isConnected, walletAddress } = useWallet();
    const { showToast } = useToast();
    const [betData, setBetData] = React.useState<UserBetData | null>(null);
    const [loading, setLoading] = React.useState<boolean>(false);
    const [claiming, setClaiming] = React.useState<boolean>(false);

    const fetchUserBetData = React.useCallback(async () => {
        if (!isConnected || !walletAddress || !market.contractId) return;

        setLoading(true);
        try {
            const [userBets, winnings] = await Promise.all([
                getUserBets(market.contractId as `0x${string}`, walletAddress as `0x${string}`),
                calculateUserWinnings(market.contractId as `0x${string}`, walletAddress as `0x${string}`)
            ]);

            setBetData({
                ...userBets,
                ...winnings
            });
        } catch (error) {
            console.error('Error fetching user bet data:', error);
            setBetData(null);
        } finally {
            setLoading(false);
        }
    }, [isConnected, walletAddress, market.contractId]);

    React.useEffect(() => {
        fetchUserBetData();
    }, [fetchUserBetData]);

    React.useEffect(() => {
        const handleOptimisticBet = (event: Event) => {
            const detail = (event as CustomEvent<OptimisticPositionDetail>).detail;
            if (!detail || !walletAddress) return;
            if (detail.marketAddress.toLowerCase() !== market.contractId.toLowerCase()) return;
            if (detail.userAddress.toLowerCase() !== walletAddress.toLowerCase()) return;

            setBetData((previous) => {
                const current = previous ?? {
                    onSideA: 0,
                    onSideB: 0,
                    onDraw: 0,
                    ifSideAWins: 0,
                    ifSideBWins: 0,
                    ifDrawWins: 0,
                    claimed: false,
                };
                const next = { ...current };
                if (detail.outcome === 'YES') next.onSideA += detail.amount;
                else if (detail.outcome === 'DRAW') next.onDraw = (next.onDraw || 0) + detail.amount;
                else next.onSideB += detail.amount;
                next.ifSideAWins = next.onSideA;
                next.ifDrawWins = next.onDraw || 0;
                next.ifSideBWins = next.onSideB;
                next.claimed = false;
                return next;
            });
            setLoading(false);
        };

        window.addEventListener('skypredict:user-position-optimistic-bet', handleOptimisticBet);
        return () => window.removeEventListener('skypredict:user-position-optimistic-bet', handleOptimisticBet);
    }, [market.contractId, walletAddress]);

    const handleClaim = async () => {
        if (!market.contractId || !betData) return;

        setClaiming(true);
        try {
            await claimRewards(market.contractId as `0x${string}`);
            showToast('Rewards claimed successfully!', 'success');
            await fetchUserBetData(); // Refresh data
        } catch (error: unknown) {
            console.error('Failed to claim rewards:', error);

            const errorLike = error as { message?: string; code?: string | number };
            const errorMessage = errorLike.message?.toLowerCase() || '';
            const errorCode = errorLike.code;

            if (
                errorCode === 4001 ||
                errorCode === 'ACTION_REJECTED' ||
                errorMessage.includes('user rejected') ||
                errorMessage.includes('cancelled') ||
                errorMessage.includes('canceled') ||
                errorMessage.includes('declined') ||
                errorMessage.includes('denied')
            ) {
                showToast('Claim cancelled. You can try again when ready.', 'info');
            } else {
                showToast('Failed to claim rewards. Please try again.', 'error');
            }
        } finally {
            setClaiming(false);
        }
    };

    if (!isConnected) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h3 className={styles.title}>Your Position</h3>
                </div>
                <ConnectWalletPrompt
                    align="left"
                    message="Connect your wallet to view your bets."
                />
            </div>
        );
    }

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h3 className={styles.title}>Your Position</h3>
                </div>
                <div className={styles.loading}>Loading your bets...</div>
            </div>
        );
    }

    if (!betData || (betData.onSideA === 0 && betData.onSideB === 0 && (!betData.onDraw || betData.onDraw === 0))) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h3 className={styles.title}>Your Position</h3>
                </div>
                <div className={styles.noBets}>
                    You haven&apos;t placed any bets on this market yet.
                </div>
            </div>
        );
    }

    const hasBoth = (betData.onSideA > 0 ? 1 : 0) + (betData.onSideB > 0 ? 1 : 0) + ((betData.onDraw || 0) > 0 ? 1 : 0) > 1;

    // Use market data for resolution info instead of contract call
    const isResolved = market.state === 'RESOLVED' || market.state === 'UNDETERMINED';
    const isSideAWinner = market.resolvedOutcome === market.sideAName;
    const isDrawWinner = market.resolvedOutcome === market.drawName;
    const isSideBWinner = market.resolvedOutcome === market.sideBName;

    const userWonA = isResolved && isSideAWinner && betData.onSideA > 0;
    const userWonDraw = isResolved && isDrawWinner && (betData.onDraw || 0) > 0;
    const userWonB = isResolved && isSideBWinner && betData.onSideB > 0;
    const userWon = userWonA || userWonDraw || userWonB;

    const winningsAmount = userWonA ? betData.ifSideAWins : userWonDraw ? (betData.ifDrawWins || 0) : userWonB ? betData.ifSideBWins : 0;
    const totalBetAmount = betData.onSideA + betData.onSideB + (betData.onDraw || 0);

    // If user has claimed, mark as claimed
    const isClaimed = betData.claimed;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h3 className={styles.title}>Your Position</h3>
                {isResolved && (
                    <span className={`${styles.badge} ${userWon ? styles.badgeWon : styles.badgeLost}`}>
                        {userWon ? 'Won' : 'Lost'}
                    </span>
                )}
            </div>

            <div className={styles.betsList}>
                {betData.onSideA > 0 && (
                    <div className={styles.betRow}>
                        <div className={`${styles.positionName} ${styles.positionNameSideA}`}>{market.sideAName || 'YES'}</div>
                        <div className={styles.betAmountSection}>
                            <div className={styles.betAmount}>{formatUsdlAmount(betData.onSideA)}</div>
                            {!isResolved && (
                                <div className={styles.discreteWinnings}>
                                    {market.state === 'RESOLVING' ? 'Pending resolution' : `Can win ${formatUsdlAmount(betData.ifSideAWins)}`}
                                </div>
                            )}
                        </div>
                        {isResolved && (
                            <div className={`${styles.outcome} ${isSideAWinner ? styles.outcomeWin : styles.outcomeLoss}`}>
                                {isSideAWinner ? `+${formatUsdlAmount(betData.ifSideAWins - betData.onSideA)}` : `Lost ${formatUsdlAmount(betData.onSideA)}`}
                            </div>
                        )}
                    </div>
                )}

                {betData.onDraw && betData.onDraw > 0 ? (
                    <div className={styles.betRow}>
                        <div className={`${styles.positionName} ${styles.positionNameDraw}`}>{market.drawName || 'DRAW'}</div>
                        <div className={styles.betAmountSection}>
                            <div className={styles.betAmount}>{formatUsdlAmount(betData.onDraw)}</div>
                            {!isResolved && (
                                <div className={styles.discreteWinnings}>
                                    {market.state === 'RESOLVING' ? 'Pending resolution' : `Can win ${formatUsdlAmount(betData.ifDrawWins || 0)}`}
                                </div>
                            )}
                        </div>
                        {isResolved && (
                            <div className={`${styles.outcome} ${isDrawWinner ? styles.outcomeWin : styles.outcomeLoss}`}>
                                {isDrawWinner ? `+${formatUsdlAmount((betData.ifDrawWins || 0) - betData.onDraw)}` : `Lost ${formatUsdlAmount(betData.onDraw)}`}
                            </div>
                        )}
                    </div>
                ) : null}

                {betData.onSideB > 0 && (
                    <div className={styles.betRow}>
                        <div className={`${styles.positionName} ${styles.positionNameSideB}`}>{market.sideBName || 'NO'}</div>
                        <div className={styles.betAmountSection}>
                            <div className={styles.betAmount}>{formatUsdlAmount(betData.onSideB)}</div>
                            {!isResolved && (
                                <div className={styles.discreteWinnings}>
                                    {market.state === 'RESOLVING' ? 'Pending resolution' : `Can win ${formatUsdlAmount(betData.ifSideBWins)}`}
                                </div>
                            )}
                        </div>
                        {isResolved && (
                            <div className={`${styles.outcome} ${isSideBWinner ? styles.outcomeWin : styles.outcomeLoss}`}>
                                {isSideBWinner ? `+${formatUsdlAmount(betData.ifSideBWins - betData.onSideB)}` : `Lost ${formatUsdlAmount(betData.onSideB)}`}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {hasBoth && (
                <div className={styles.summary}>
                    <div className={styles.summaryRow}>
                        <span>Total Bet:</span>
                        <span>{formatUsdlAmount(totalBetAmount)}</span>
                    </div>
                    {isResolved && (
                        <div className={styles.summaryRow}>
                            <span>Net Result:</span>
                            <span className={userWon ? styles.netWin : styles.netLoss}>
                                {userWon ? `+${formatUsdlAmount(winningsAmount - totalBetAmount)}` : `Lost ${formatUsdlAmount(totalBetAmount - winningsAmount)}`}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {userWon && isResolved && !isClaimed && (
                <button
                    className={styles.claimButton}
                    onClick={handleClaim}
                    disabled={claiming}
                >
                    {claiming ? 'Claiming...' : market.state === 'UNDETERMINED'
                        ? `Claim Refund ${formatUsdlAmount(winningsAmount)}`
                        : `Claim Winnings ${formatUsdlAmount(winningsAmount)}`}
                </button>
            )}
            
            {userWon && isResolved && isClaimed && (
                <button
                    className={`${styles.claimButton} ${styles.claimedButton}`}
                    disabled={true}
                >
                    Already Claimed
                </button>
            )}

            {market.state === 'RESOLVING' && (betData.onSideA > 0 || betData.onSideB > 0) && (
                <div className={styles.resolvingNote}>
                    Market is resolving. Your winnings will be available after resolution completes.
                </div>
            )}
        </div>
    );
};

export default UserBetDisplay;
