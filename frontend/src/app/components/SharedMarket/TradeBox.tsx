import React, { useState } from 'react';
import styles from './TradeBox.module.css';
import { MarketData, getUserMarketStatus, UserMarketStatus } from '../../../data/markets';
import { claimRewards, placeBet, approveUsdlUnlimited, dripUsdl, checkUsdlAllowance } from '../../../lib/onchain/writes';
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
    const [selectedOutcome, setSelectedOutcome] = useState<'YES' | 'NO'>('YES');
    const [tokenBalance, setTokenBalance] = React.useState<bigint | undefined>(undefined);
    const [allowance, setAllowance] = React.useState<bigint | undefined>(undefined);
    const [isDripping, setIsDripping] = React.useState(false);
    const [isApproving, setIsApproving] = React.useState(false);
    const [isPlacingBet, setIsPlacingBet] = React.useState(false);

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

    const fetchAllowance = React.useCallback(async () => {
        if (!walletAddress || !isConnected || !market?.contractId) {
            setAllowance(undefined);
            return;
        }

        try {
            const value = await checkUsdlAllowance(
                walletAddress as `0x${string}`,
                market.contractId as `0x${string}`
            );
            setAllowance(value);
        } catch (error) {
            console.error('Failed to fetch token allowance:', error);
            setAllowance(undefined);
        }
    }, [walletAddress, isConnected, market?.contractId]);

    React.useEffect(() => {
        fetchTokenBalance();
    }, [fetchTokenBalance]);

    React.useEffect(() => {
        fetchAllowance();
    }, [fetchAllowance]);

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

    const handleApproval = async () => {
        if (!walletAddress || !isConnected || !market?.contractId) return;

        setIsApproving(true);
        try {
            await approveUsdlUnlimited(market.contractId as `0x${string}`);
            showToast(`${TOKEN_SYMBOL} approval successful! You can now place bets.`, 'success');
            await fetchAllowance();
        } catch (error: unknown) {
            console.error(`Failed to approve ${TOKEN_SYMBOL}:`, error);

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
                showToast('Approval cancelled. You can try again when ready.', 'info');
            } else {
                showToast('Approval failed. Please check your wallet and try again.', 'error');
            }
        } finally {
            setIsApproving(false);
        }
    };

    const numericAmount = parseFloat(amount) || 0;

    const handleDrip = async () => {
        if (!isConnected || !walletAddress) return;

        setIsDripping(true);
        try {
            await dripUsdl();
            showToast(`Successfully received 1000 ${TOKEN_SYMBOL}!`, 'success');
            await fetchTokenBalance();
        } catch (error: unknown) {
            console.error('Failed to drip token - detailed error:', error);

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
                showToast('Drip cancelled. You can try again when ready.', 'info');
            } else if (errorMessage.includes('insufficient funds') || errorMessage.includes('insufficient eth')) {
                showToast('Insufficient ETH for gas. Please get some testnet ETH first.', 'error');
            } else if (errorMessage.includes('wait 24h') || errorMessage.includes('cooldown') || errorMessage.includes('24h limit')) {
                showToast('You have reached your daily faucet limit. Try again in 24 hours.', 'warning');
            } else {
                showToast(`Failed to get ${TOKEN_SYMBOL}. Please check console for details.`, 'error');
            }
        } finally {
            setIsDripping(false);
        }
    };

    const amountInUnits = BigInt(Math.floor(numericAmount * SKYUSD_MULTIPLIER));
    const insufficientBalance = tokenBalance ? tokenBalance < amountInUnits : false;
    const needsApproval = amountInUnits > 0 ? !allowance || allowance < amountInUnits : false;

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
                            <button
                                onClick={handleDrip}
                                disabled={isDripping}
                                style={{
                                    background: 'var(--primary)',
                                    color: 'var(--primary-foreground)',
                                    border: '1px solid var(--primary)',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '10px',
                                    cursor: isDripping ? 'not-allowed' : 'pointer',
                                    opacity: isDripping ? 0.7 : 1
                                }}
                            >
                                {isDripping ? 'Getting...' : `Get ${TOKEN_SYMBOL}`}
                            </button>
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
                            </div>
                            {selectedOutcome === 'YES' && <span>Do it</span>}
                        </button>
                        <button
                            className={`${styles.outcomeCard} ${styles.outcomeCardOrange} ${selectedOutcome === 'NO' ? styles.selectedOutcome : styles.unselectedOutcome}`}
                            onClick={() => setSelectedOutcome('NO')}
                        >
                            <div>
                                <div>{market?.sideBName ?? 'NO'}</div>
                            </div>
                            {selectedOutcome === 'NO' && <span>Do it</span>}
                        </button>
                    </div>
                </div>

                {insufficientBalance && numericAmount > 0 && (
                    <button
                        className={styles.payoutButton}
                        disabled
                        style={{ backgroundColor: 'var(--danger)', border: '1px solid var(--danger)', opacity: 0.7 }}
                    >
                        Insufficient {TOKEN_SYMBOL} Balance
                    </button>
                )}

                {needsApproval && !insufficientBalance && (
                    <button
                        className={styles.payoutButton}
                        onClick={handleApproval}
                        disabled={isApproving}
                        style={{ backgroundColor: 'var(--primary)', border: '1px solid var(--primary)' }}
                    >
                        {isApproving ? 'Check your wallet to approve...' : `Approve ${TOKEN_SYMBOL} to place bets`}
                    </button>
                )}

                {!needsApproval && !insufficientBalance && (
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
                                await placeBet(market.contractId as `0x${string}`, selectedOutcome, numericAmount > 0 ? numericAmount : 0);
                                showToast(`Bet placed successfully! ${numericAmount} ${TOKEN_SYMBOL} on ${selectedOutcome}.`, 'success');
                                await fetchTokenBalance();
                                await fetchAllowance();
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
                                } else {
                                    showToast('Failed to place bet. Please check your wallet and try again.', 'error');
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
                                : `Buy ${selectedOutcome === 'YES' ? (market?.sideAName ?? 'YES') : (market?.sideBName ?? 'NO')} for ${numericAmount > 0 ? numericAmount : '0'} ${TOKEN_SYMBOL}`}
                    </button>
                )}
            </>
        );
    }
};

export default TradeBox;


