'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header/Header';
import styles from './page.module.css';
import { useWallet } from '../providers/WalletProvider';
import { useToast } from '../providers/ToastProvider';
import { depositRitual, checkUsdlBalance } from '../../lib/onchain/writes';
import { TOKEN_SYMBOL, SKYUSD_MULTIPLIER } from '../../lib/constants';

export default function DepositPage() {
    const router = useRouter();
    const { isConnected, connect, walletAddress } = useWallet();
    const { showToast } = useToast();
    const [isDepositing, setIsDepositing] = useState(false);
    const [depositAmount, setDepositAmount] = useState('0.01');
    const [balance, setBalance] = useState<string | null>(null);

    React.useEffect(() => {
        if (isConnected && walletAddress) {
            checkUsdlBalance(walletAddress as `0x${string}`)
                .then((bal) => setBalance((Number(bal) / SKYUSD_MULTIPLIER).toFixed(2)))
                .catch(() => setBalance(null));
        }
    }, [isConnected, walletAddress]);

    const ritualAmount = parseFloat(depositAmount) || 0;
    const skyusdReceived = ritualAmount * 10_000;

    const handleDeposit = async () => {
        if (!isConnected || !walletAddress) {
            connect();
            return;
        }

        if (ritualAmount < 0.01 || ritualAmount > 1) {
            showToast('Deposit must be between 0.01 and 1 RITUAL.', 'warning');
            return;
        }

        setIsDepositing(true);
        try {
            await depositRitual(ritualAmount);
            showToast(`Successfully deposited ${ritualAmount} RITUAL → ${skyusdReceived.toLocaleString()} ${TOKEN_SYMBOL}!`, 'success');
            window.dispatchEvent(new Event('skyusd:balance-refresh'));
            // Refresh balance
            const bal = await checkUsdlBalance(walletAddress as `0x${string}`);
            setBalance((Number(bal) / SKYUSD_MULTIPLIER).toFixed(2));
        } catch (error: unknown) {
            console.error('Deposit error:', error);
            const errorObj = error as { message?: string; code?: string | number };
            const errorMessage = errorObj?.message?.toLowerCase() || '';
            const errorCode = errorObj?.code;

            if (
                errorCode === 4001 ||
                errorCode === 'ACTION_REJECTED' ||
                errorMessage.includes('user rejected')
            ) {
                showToast('Deposit cancelled by user.', 'info');
            } else if (errorMessage.includes('below minimum') || errorMessage.includes('above maximum')) {
                showToast('Invalid deposit amount. Min: 0.01, Max: 1 RITUAL.', 'warning');
            } else if (errorMessage.includes('insufficient funds')) {
                showToast('Insufficient RITUAL balance for this deposit.', 'error');
            } else {
                showToast(`Deposit failed. Please try again.`, 'error');
            }
        } finally {
            setIsDepositing(false);
        }
    };

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
                currentPage="faucet"
            />

            <div className={styles.mainContainer}>
                <div className={styles.contentArea}>
                    <div className={styles.faucetCard}>
                        <div className={styles.iconWrapper}>💰</div>
                        <h2 className={styles.title}>Deposit RITUAL</h2>
                        <p className={styles.description}>
                            Deposit native RITUAL to receive {TOKEN_SYMBOL} for trading on Sky Predict markets.
                        </p>

                        {balance !== null && (
                            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                                Current Balance: <b style={{ color: 'var(--foreground)' }}>{balance} {TOKEN_SYMBOL}</b>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '12px' }}>
                            {[0.01, 0.05, 0.1, 0.5, 1].map((val) => (
                                <button
                                    key={val}
                                    onClick={() => setDepositAmount(val.toString())}
                                    style={{
                                        padding: '8px 14px',
                                        borderRadius: '10px',
                                        border: depositAmount === val.toString() ? '2px solid var(--primary)' : '1px solid var(--card-border)',
                                        background: depositAmount === val.toString() ? 'rgba(34,197,94,0.15)' : 'var(--section-bg)',
                                        color: 'var(--foreground)',
                                        cursor: 'pointer',
                                        fontWeight: 700,
                                        fontSize: '13px',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    {val} RITUAL
                                </button>
                            ))}
                        </div>

                        <div className={styles.usdlAmount}>{skyusdReceived.toLocaleString()}</div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '20px' }}>
                            {TOKEN_SYMBOL} received
                        </div>

                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                            Rate: 0.01 RITUAL = 100 {TOKEN_SYMBOL} · Min: 0.01 · Max: 1 RITUAL
                        </div>

                        <button
                            className={styles.claimButton}
                            onClick={handleDeposit}
                            disabled={isDepositing || ritualAmount < 0.01 || ritualAmount > 1}
                        >
                            {!isConnected
                                ? 'Connect Wallet to Deposit'
                                : isDepositing
                                    ? 'Depositing...'
                                    : `Deposit ${ritualAmount} RITUAL → ${skyusdReceived.toLocaleString()} ${TOKEN_SYMBOL}`}
                        </button>

                        <p className={styles.infoText}>
                            {TOKEN_SYMBOL} is used for trading on Sky Predict prediction markets on Ritual Network.
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}
