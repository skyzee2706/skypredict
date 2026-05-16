import React, { useState } from 'react';
import styles from './TradeBox.module.css';
import { MarketData, getUserMarketStatus, UserMarketStatus } from '../../../data/markets';
import { claimRewards, placeBet, isRouterApproved, approveRouter } from '../../../lib/onchain/writes';
import { useWallet } from '../../providers/WalletProvider';
import { useToast } from '../../providers/ToastProvider';
import ConnectWalletPrompt from '../Wallet/ConnectWalletPrompt';
import { readContract } from 'wagmi/actions';
import { wagmiConfig } from '../../../lib/onchain/wagmiConfig';
import { seismicTestnet } from '../../../lib/onchain/seismicChain';
import { TOKEN_ADDRESS, SKYUSD_MULTIPLIER, SKYUSD_ABI, TOKEN_SYMBOL } from '../../../lib/constants';

interface TradeBoxProps {
    probability: number;
    market?: MarketData;
}

const TradeBox: React.FC<TradeBoxProps> = ({ probability: _probability, market }) => {
    void _probability;
    const [amount, setAmount] = useState<string>('');
    const [selectedOutcome, setSelectedOutcome] = useState<'YES' | 'DRAW' | 'NO'>('YES');
    const [tokenBalance, setTokenBalance] = React.useState<bigint | undefined>(undefined);
    const [isPlacingBet, setIsPlacingBet] = React.useState(false);
    const [routerApproved, setRouterApproved] = React.useState(false);
    const [isApproving, setIsApproving] = React.useState(false);

    const { isConnected, walletAddress, connect, isConnecting } = useWallet();
    const { showToast } = useToast();

    const fetchTokenBalance = React.useCallback(async () => {
        if (!walletAddress || !isConnected) {
            setTokenBalance(undefined);
            return;
        }

        try {
            const balance = await readContract(wagmiConfig, {
                chainId: seismicTestnet.id,
                address: TOKEN_ADDRESS as `0x${string}`,
                abi: SKYUSD_ABI,
                functionName: 'balanceOf',
                args: [walletAddress as `0x${string}`]
            });
            setTokenBalance(balance);
        } catch (error) {
            console.error('Failed to fetch token balance:', error);
            setTokenBalance(undefined);
        }
    }, [walletAddress, isConnected]);

    React.useEffect(() => {
        fetchTokenBalance();
    }, [fetchTokenBalance]);

    // Check router approval status
    React.useEffect(() => {
        if (!walletAddress || !isConnected) {
            setRouterApproved(false);
            return;
        }
        isRouterApproved(walletAddress as `0x${string}`)
            .then(setRouterApproved)
            .catch(() => setRouterApproved(false));
    }, [walletAddress, isConnected]);

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

    const handleClaim = async () => {
        if (!market) return;
        try {
            await claimRewards(market.contractId as `0x${string}`);
            showToast('Rewards claimed successfully!', 'success');
            fetchTokenBalance();
        } catch (error) {
            console.error('Failed to claim rewards:', error);
            showToast('Failed to claim rewards. Please try again.', 'error');
        }
    };

    const numericAmount = parseFloat(amount) || 0;
    const amountInUnits = BigInt(Math.floor(numericAmount * SKYUSD_MULTIPLIER));
    const insufficientBalance = tokenBalance ? tokenBalance < amountInUnits : false;

    if (market) {
        if (market.state === 'RESOLVED' || market.state === 'UNDETERMINED') {
            if (!isConnected) {
                return (
                    <div className={styles.tradeBox}>
                        <div className={styles.subtleHeader}>
                            <span className={styles.marketStatus}>Market Resolved</span>
                            <span className={`${styles.outcomeTag} ${market.resolvedOutcome === market.sideAName ? styles.outcomeYes : styles.outcomeNo}`}>
                                {market.resolvedOutcome} Won
                            </span>
                        </div>
                        <ConnectWalletPrompt align="left" message="Connect your wallet to start betting." />
                    </div>
                );
            }
            return (
                <div className={styles.tradeBox}>
                    <div className={styles.subtleHeader}>
                        <span className={styles.marketStatus}>Market Resolved</span>
                        <span className={`${styles.outcomeTag} ${market.resolvedOutcome === market.sideAName ? styles.outcomeYes : styles.outcomeNo}`}>
                            {market.resolvedOutcome} Won
                        </span>
                    </div>

                    {userStatus?.hasPosition ? (
                        <div className={styles.positionSummary}>
                            <div className={styles.positionRow}>
                                <span>Your bet:</span>
                                <span>{userStatus.position!.amount} {TOKEN_SYMBOL} on {userStatus.position!.outcome}</span>
                            </div>
                            {userStatus.userWon ? (
                                <div className={styles.positionRow}>
                                    <span>You won:</span>
                                    <span className={styles.winAmount}>+{userStatus.potentialWinnings.toFixed(0)} {TOKEN_SYMBOL}</span>
                                </div>
                            ) : (
                                <div className={styles.positionRow}>
                                    <span className={styles.lossText}>You lost your bet</span>
                                </div>
                            )}
                            {userStatus.canClaim && (
                                <button className={styles.claimButton} onClick={handleClaim}>
                                    Claim {userStatus.potentialWinnings.toFixed(0)} {TOKEN_SYMBOL}
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className={styles.noPosition}>
                            <p>You did not bet on this market.</p>
                        </div>
                    )}
                </div>
            );
        }

        if (market.state === 'RESOLVING') {
            if (!isConnected) {
                return (
                    <div className={styles.tradeBox}>
                        <div className={styles.subtleHeader}>
                            <span className={styles.marketStatus}>Resolving...</span>
                            <div className={styles.loadingDot}></div>
                        </div>
                        <ConnectWalletPrompt align="left" message="Connect your wallet to start betting." />
                    </div>
                );
            }
            return (
                <div className={styles.tradeBox}>
                    <div className={styles.subtleHeader}>
                        <span className={styles.marketStatus}>Resolving...</span>
                        <div className={styles.loadingDot}></div>
                    </div>

                    {userStatus?.hasPosition && (
                        <div className={styles.positionSummary}>
                            <div className={styles.positionRow}>
                                <span>Your bet:</span>
                                <span>{userStatus.position!.amount} {TOKEN_SYMBOL} on {userStatus.position!.outcome}</span>
                            </div>
                            <p className={styles.waitingText}>Waiting for resolution...</p>
                        </div>
                    )}
                </div>
            );
        }

        if (userStatus?.hasPosition) {
            return (
                <div className={styles.tradeBox}>
                    <div className={styles.positionSummary}>
                        <div className={styles.positionRow}>
                            <span>Current bet:</span>
                            <span>{userStatus.position!.amount} {TOKEN_SYMBOL} on {userStatus.position!.outcome}</span>
                        </div>
                    </div>

                    <div className={styles.divider}></div>
                    {renderTradingInterface()}
                </div>
            );
        }
    }

    if (!isConnected) {
        return (
            <div className={styles.tradeBox}>
                <ConnectWalletPrompt align="left" message="Connect your wallet to start betting." />
            </div>
        );
    }

    return <div className={styles.tradeBox}>{renderTradingInterface()}</div>;

    function renderTradingInterface() {
        return (
            <>
                <div className={styles.inputGroup}>
                    <div className={styles.inputLabel}>
                        <span>1.</span> Enter amount
                        <span className={styles.pctOptions}>
                            <span onClick={() => setAmount('10')}>10$</span>
                            <span onClick={() => setAmount('20')}>20$</span>
                            <span onClick={() => setAmount('50')}>50$</span>
                            {tokenBalance !== undefined && (
                                <span onClick={() => setAmount((Number(tokenBalance) / SKYUSD_MULTIPLIER).toFixed(2))}>Max</span>
                            )}
                        </span>
                    </div>
                    <div className={styles.amountInputContainer}>
                        <input
                            type="number"
                            className={styles.amountInput}
                            placeholder="0"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                        />
                        <span className={styles.usdcSuffix}>{TOKEN_SYMBOL}</span>
                    </div>
                    {tokenBalance !== undefined ? (
                        <div
                            style={{
                                fontSize: '11px',
                                color: 'var(--text-secondary)',
                                marginTop: '4px',
                                textAlign: 'right',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}
                        >
                            <span>Balance: {(Number(tokenBalance) / SKYUSD_MULTIPLIER).toFixed(2)} {TOKEN_SYMBOL}</span>
                            <a
                                href="/faucet"
                                style={{
                                    color: 'var(--primary)',
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    textDecoration: 'none'
                                }}
                            >
                                Deposit RITUAL →
                            </a>
                        </div>
                    ) : null}
                </div>

                <div className={styles.inputGroup}>
                    <div className={styles.inputLabel}>
                        <span>2.</span> Select outcome
                    </div>
                    <div className={styles.outcomeSelect}>
                        <button
                            className={`${styles.outcomeCard} ${styles.outcomeCardGreen} ${selectedOutcome === 'YES' ? styles.selectedOutcome : styles.unselectedOutcome}`}
                            onClick={() => setSelectedOutcome('YES')}
                        >
                            <div>
                                <div>{market?.sideAName ?? 'YES'}</div>
                                <small>{Math.round((market?.probYes ?? 0.5) * 100)}%</small>
                            </div>
                            {selectedOutcome === 'YES' && <span>Selected</span>}
                        </button>
                        {(market?.category === 'SPORTS' || market?.category === 'POLITICS') && (
                            <button
                                className={`${styles.outcomeCard} ${styles.outcomeCardDraw ?? styles.outcomeCardOrange} ${selectedOutcome === 'DRAW' ? styles.selectedOutcome : styles.unselectedOutcome}`}
                                onClick={() => setSelectedOutcome('DRAW')}
                            >
                                <div>
                                    <div>{market?.drawName ?? 'Draw'}</div>
                                    <small>{Math.round((market?.probDraw ?? 0.2) * 100)}%</small>
                                </div>
                                {selectedOutcome === 'DRAW' && <span>Selected</span>}
                            </button>
                        )}
                        <button
                            className={`${styles.outcomeCard} ${styles.outcomeCardOrange} ${selectedOutcome === 'NO' ? styles.selectedOutcome : styles.unselectedOutcome}`}
                            onClick={() => setSelectedOutcome('NO')}
                        >
                            <div>
                                <div>{market?.sideBName ?? 'NO'}</div>
                                <small>{Math.round((market?.probNo ?? 0.5) * 100)}%</small>
                            </div>
                            {selectedOutcome === 'NO' && <span>Selected</span>}
                        </button>
                    </div>
                </div>

                {/* Step 1: One-time Router approval */}
                {!routerApproved && isConnected && (
                    <button
                        className={styles.payoutButton}
                        style={{ background: 'linear-gradient(135deg, var(--primary), #10b981)', marginBottom: '8px' }}
                        onClick={async () => {
                            setIsApproving(true);
                            try {
                                await approveRouter();
                                setRouterApproved(true);
                                showToast('SkyUSD approved! You can now bet on any market with 1 click.', 'success');
                                window.dispatchEvent(new Event('skyusd:balance-refresh'));
                            } catch (error: unknown) {
                                const errorObj = error as { message?: string; code?: string | number };
                                const errorCode = errorObj?.code;
                                const errorMessage = errorObj?.message?.toLowerCase() || '';
                                if (errorCode === 4001 || errorCode === 'ACTION_REJECTED' || errorMessage.includes('user rejected')) {
                                    showToast('Approval cancelled.', 'info');
                                } else {
                                    showToast('Approval failed. Please try again.', 'error');
                                }
                            } finally {
                                setIsApproving(false);
                            }
                        }}
                        disabled={isApproving}
                    >
                        {isApproving ? 'Approving SkyUSD...' : '🔓 Enable Trading (one-time approval)'}
                    </button>
                )}
                {/* Step 2: Bet button (only after approval) */}
                {routerApproved && insufficientBalance && numericAmount > 0 && (
                    <button
                        className={styles.payoutButton}
                        disabled
                        style={{ backgroundColor: 'var(--danger)', border: '1px solid var(--danger)', opacity: 0.7 }}
                    >
                        Insufficient {TOKEN_SYMBOL} Balance
                    </button>
                )}
                {routerApproved && !insufficientBalance && (
                    <button
                        className={styles.payoutButton}
                        onClick={async () => {
                            if (!market) return;
                            if (!isConnected) {
                                try {
                                    await connect();
                                } catch (error) {
                                    console.error('Failed to connect wallet:', error);
                                    showToast('Failed to connect wallet. Please try again.', 'error');
                                }
                                return;
                            }

                            setIsPlacingBet(true);
                            try {
                                const freshMarket = await import('../../../lib/onchain/reads')
                                    .then(({ fetchMarketInfo }) => fetchMarketInfo(market.contractId as `0x${string}`))
                                    .catch((error) => {
                                        console.warn('Fresh market reload before bet failed, using current market state:', error);
                                        return market;
                                    });
                                const tradeMarket = freshMarket?.contractId ? freshMarket : market;
                                const selectedLabel = selectedOutcome === 'YES' ? (tradeMarket.sideAName ?? 'YES') : selectedOutcome === 'DRAW' ? (tradeMarket.drawName ?? 'Draw') : (tradeMarket.sideBName ?? 'NO');
                                await placeBet(tradeMarket.contractId as `0x${string}`, selectedOutcome, numericAmount > 0 ? numericAmount : 0);
                                showToast(`Bet placed successfully! ${numericAmount} ${TOKEN_SYMBOL} on ${selectedLabel}.`, 'success');
                                await fetchTokenBalance();
                                window.dispatchEvent(new Event('skyusd:balance-refresh'));
                                setAmount('');
                            } catch (error: unknown) {
                                console.error('Failed to place bet:', error);

                                const errorObj = error as { message?: string; code?: string | number };
                                const errorMessage = errorObj?.message?.toLowerCase() || '';
                                const errorCode = errorObj?.code;

                                if (
                                    errorCode === 4001 ||
                                    errorCode === 'ACTION_REJECTED' ||
                                    errorMessage.includes('user rejected') ||
                                    errorMessage.includes('cancelled') ||
                                    errorMessage.includes('canceled') ||
                                    errorMessage.includes('declined') ||
                                    errorMessage.includes('denied')
                                ) {
                                    showToast('Bet cancelled. You can try again when ready.', 'info');
                                } else if (errorMessage.includes('betting closed') || errorMessage.includes('beforeend')) {
                                    showToast('Betting is closed for this market. The deadline has passed.', 'error');
                                } else if (errorMessage.includes('transferfrom') || errorMessage.includes('erc20') || errorMessage.includes('insufficient allowance')) {
                                    showToast('Token transfer failed. Try re-approving.', 'error');
                                } else if (errorMessage.includes('insufficient funds') || errorMessage.includes('insufficient eth')) {
                                    showToast('Insufficient RITUAL for gas. Please get some testnet RITUAL first.', 'error');
                                } else {
                                    showToast('Transaction reverted. Please ensure you have enough SkyUSD and RITUAL for gas.', 'error');
                                    console.error('Bet error details:', { errorMessage, errorCode, error });
                                }
                            } finally {
                                setIsPlacingBet(false);
                            }
                        }}
                        disabled={isPlacingBet || numericAmount <= 0}
                    >
                        {isConnecting
                            ? 'Connecting wallet...'
                            : isPlacingBet
                                ? 'Check your wallet to confirm...'
                                : `Buy ${selectedOutcome === 'YES' ? (market?.sideAName ?? 'YES') : selectedOutcome === 'DRAW' ? (market?.drawName ?? 'Draw') : (market?.sideBName ?? 'NO')} for ${numericAmount > 0 ? numericAmount : '0'} ${TOKEN_SYMBOL}`}

                    </button>
                )}
            </>
        );
    }
};

export default TradeBox;
