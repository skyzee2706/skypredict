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
    ifSideAWins: number;
    ifSideBWins: number;
}

const UserBetDisplay: React.FC<UserBetDisplayProps> = ({ market, variant = 'full' }) => {
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

    const handleClaim = async () => {
        if (!market.contractId || !betData) return;

        setClaiming(true);
        try {
            await claimRewards(market.contractId as `0x${string}`);
            showToast('Rewards claimed successfully!', 'success');
            await fetchUserBetData(); // Refresh data
        } catch (error: any) {
            console.error('Failed to claim rewards:', error);

            const errorMessage = error?.message?.toLowerCase() || '';
            const errorCode = error?.code;

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

    if (!betData || (betData.onSideA === 0 && betData.onSideB === 0)) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h3 className={styles.title}>Your Position</h3>
                </div>
                <div className={styles.noBets}>
                    You haven't placed any bets on this market yet.
                </div>
            </div>
        );
    }

    const hasOnlyA = betData.onSideA > 0 && betData.onSideB === 0;
    const hasOnlyB = betData.onSideB > 0 && betData.onSideA === 0;
    const hasBoth = betData.onSideA > 0 && betData.onSideB > 0;

    // Use market data for resolution info instead of contract call
    const isResolved = market.state === 'RESOLVED' || market.state === 'UNDETERMINED';
    const isSideAWinner = market.resolvedOutcome === market.sideAName;

    const userWonA = isResolved && isSideAWinner && betData.onSideA > 0;
    const userWonB = isResolved && !isSideAWinner && betData.onSideB > 0;
    const userWon = userWonA || userWonB;

    const winningsAmount = userWonA ? betData.ifSideAWins : userWonB ? betData.ifSideBWins : 0;
    const totalBetAmount = betData.onSideA + betData.onSideB;

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
                            <div className={`${styles.outcome} ${!isSideAWinner ? styles.outcomeWin : styles.outcomeLoss}`}>
                                {!isSideAWinner ? `+${formatUsdlAmount(betData.ifSideBWins - betData.onSideB)}` : `Lost ${formatUsdlAmount(betData.onSideB)}`}
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

            {userWon && isResolved && (
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

            {market.state === 'RESOLVING' && (betData.onSideA > 0 || betData.onSideB > 0) && (
                <div className={styles.resolvingNote}>
                    Market is resolving. Your winnings will be available after resolution completes.
                </div>
            )}
        </div>
    );
};

export default UserBetDisplay;