'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header/Header';
import styles from './page.module.css';
import { useWallet } from '../providers/WalletProvider';
import { useToast } from '../providers/ToastProvider';
import { dripUsdl } from '../../lib/onchain/writes';
import { TOKEN_SYMBOL } from '../../lib/constants';

export default function FaucetPage() {
    const router = useRouter();
    const { isConnected, connect, walletAddress } = useWallet();
    const { showToast } = useToast();
    const [isClaiming, setIsClaiming] = useState(false);

    const handleClaim = async () => {
        if (!isConnected || !walletAddress) {
            connect();
            return;
        }

        setIsClaiming(true);
        try {
            await dripUsdl(walletAddress as `0x${string}`);
            showToast(`1000 ${TOKEN_SYMBOL} claimed successfully.`, 'success');
        } catch (error: unknown) {
            console.error('Faucet error:', error);
            const errorObj = error as { message?: string; code?: string | number };
            const errorMessage = errorObj?.message?.toLowerCase() || '';
            const errorCode = errorObj?.code;

            if (
                errorCode === 4001 ||
                errorCode === 'ACTION_REJECTED' ||
                errorMessage.includes('user rejected')
            ) {
                showToast('Claim cancelled by user.', 'info');
            } else if (errorMessage.includes('exceeds 24h mint limit') || errorMessage.includes('cooldown')) {
                showToast('Daily limit reached. Come back tomorrow.', 'warning');
            } else {
                showToast(`Failed to claim ${TOKEN_SYMBOL}. Please try again.`, 'error');
            }
        } finally {
            setIsClaiming(false);
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
                        <div className={styles.iconWrapper}>S</div>
                        <h2 className={styles.title}>{TOKEN_SYMBOL} Faucet</h2>
                        <p className={styles.description}>
                            Claim your daily allowance of testnet {TOKEN_SYMBOL} to participate in Sky Predict markets on Ritual Network.
                        </p>

                        <div className={styles.usdlAmount}>1000</div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '20px' }}>
                            {TOKEN_SYMBOL} / 24 HRS
                        </div>

                        <button
                            className={styles.claimButton}
                            onClick={handleClaim}
                            disabled={isClaiming || (isConnected && false)}
                        >
                            {!isConnected ? 'Connect Wallet to Claim' : isClaiming ? 'Claiming...' : `Claim 1000 ${TOKEN_SYMBOL}`}
                        </button>

                        <p className={styles.infoText}>
                            Tokens are strictly for testnet use and hold no real-world value.
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}
