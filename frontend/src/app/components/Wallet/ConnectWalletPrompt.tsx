'use client';

import React from 'react';
import styles from './ConnectWalletPrompt.module.css';
import { useWallet } from '../../providers/WalletProvider';

interface ConnectWalletPromptProps {
    align?: 'center' | 'left';
    message?: string;
    compact?: boolean;
}

const ConnectWalletPrompt: React.FC<ConnectWalletPromptProps> = ({
    align = 'center',
    message = 'Connect your wallet to start betting.',
    compact = false
}) => {
    const { connect, isConnecting } = useWallet();

    return (
        <div className={`${styles.wrapper} ${align === 'left' ? styles.alignLeft : ''} ${compact ? styles.compact : ''}`}>
            {message && <div className={styles.message}>{message}</div>}
            <button className={styles.button} onClick={connect} disabled={isConnecting}>
                {isConnecting ? 'Connecting...' : 'Connect wallet'}
            </button>
        </div>
    );
};

export default ConnectWalletPrompt;
