import React from 'react';
import Image from 'next/image';
import styles from './Header.module.css';
import { useWallet } from '../../providers/WalletProvider';
import { useToast } from '../../providers/ToastProvider';
import { readContract } from 'wagmi/actions';
import { wagmiConfig } from '../../../lib/onchain/wagmiConfig';
import { seismicTestnet } from '../../../lib/onchain/seismicChain';
import DisconnectIcon from '../Shared/DisconnectIcon';
import TopUpIcon from '../Shared/TopUpIcon';
import InfoIcon from '../Shared/InfoIcon';
import Tooltip from '../Shared/Tooltip';
import { TOKEN_ADDRESS, SKYUSD_ABI, SKYUSD_MULTIPLIER, TOKEN_SYMBOL } from '../../../lib/constants';
import { dripUsdl } from '../../../lib/onchain/writes';

interface HeaderProps {
    onNavigate: (page: 'landing' | 'markets' | 'portfolio' | 'faucet') => void;
    currentPage: 'landing' | 'markets' | 'portfolio' | 'faucet';
}

const Header: React.FC<HeaderProps> = ({ onNavigate, currentPage }) => {
    const { isConnected, walletAddress, isConnecting, connect, disconnect } = useWallet();
    const { showToast } = useToast();
    const [tokenBalance, setTokenBalance] = React.useState<bigint | undefined>(undefined);
    const [isDripping, setIsDripping] = React.useState(false);
    const [walletDropdownOpen, setWalletDropdownOpen] = React.useState(false);
    const [balanceDropdownOpen, setBalanceDropdownOpen] = React.useState(false);
    const [theme, setTheme] = React.useState<'light' | 'dark'>('dark');
    const walletRef = React.useRef<HTMLDivElement>(null);
    const balanceRef = React.useRef<HTMLDivElement>(null);

    const shortAddress = walletAddress
        ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
        : '';

    React.useEffect(() => {
        const root = document.documentElement;
        const currentTheme = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        setTheme(currentTheme);
    }, []);

    const toggleTheme = React.useCallback(() => {
        const nextTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(nextTheme);
        document.documentElement.setAttribute('data-theme', nextTheme);
        localStorage.setItem('theme', nextTheme);
    }, [theme]);

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

    const handleBalanceClick = React.useCallback(() => {
        setBalanceDropdownOpen((prev) => !prev);
    }, []);

    const handleWalletClick = React.useCallback(() => {
        setWalletDropdownOpen((prev) => !prev);
    }, []);

    const handleDisconnect = React.useCallback(() => {
        disconnect();
        setWalletDropdownOpen(false);
    }, [disconnect]);

    const handleTopUp = React.useCallback(async () => {
        setIsDripping(true);
        try {
            await dripUsdl();
            showToast(`Successfully received 1000 ${TOKEN_SYMBOL}!`, 'success');
            await fetchTokenBalance();
            setBalanceDropdownOpen(false);
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
                showToast('You have reached your daily drip limit. Try again in 24 hours.', 'warning');
            } else {
                showToast(`Failed to get ${TOKEN_SYMBOL}. Please check console for details.`, 'error');
            }
        } finally {
            setIsDripping(false);
        }
    }, [fetchTokenBalance, showToast]);

    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (walletRef.current && !walletRef.current.contains(event.target as Node)) {
                setWalletDropdownOpen(false);
            }
            if (balanceRef.current && !balanceRef.current.contains(event.target as Node)) {
                setBalanceDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <header className={styles.header}>
            <div className={styles.left}>
                <div
                    className={styles.logo}
                    onClick={() => onNavigate('landing')}
                    style={{ cursor: 'pointer' }}
                >
                    <div className={styles.logoMark} />
                    <div className={styles.brand}>
                        <h1 className={styles.brandTitle}>Sky Predict</h1>
                    </div>
                </div>
                <nav className={styles.nav}>
                    <span
                        className={`${styles.navItem} ${currentPage === 'markets' ? styles.active : ''}`}
                        onClick={() => onNavigate('markets')}
                    >
                        Markets
                    </span>
                    <span
                        className={`${styles.navItem} ${currentPage === 'portfolio' ? styles.active : ''}`}
                        onClick={() => onNavigate('portfolio')}
                    >
                        Portfolio
                    </span>
                </nav>
            </div>
            <div className={styles.right}>
                <button className={styles.themeToggle} onClick={toggleTheme} aria-label="Toggle theme">
                    {theme === 'dark' ? 'Dark' : 'Light'}
                </button>
                {isConnected && tokenBalance !== undefined && (
                    <div ref={balanceRef} style={{ position: 'relative', marginRight: '16px' }}>
                        <div className={styles.dropdownTrigger} onClick={handleBalanceClick}>
                            {(Number(tokenBalance) / SKYUSD_MULTIPLIER).toFixed(2)} {TOKEN_SYMBOL}
                            <Tooltip content={`${TOKEN_SYMBOL} on Ritual Network`}>
                                <div className={styles.tooltipIcon}>
                                    <InfoIcon size={12} />
                                </div>
                            </Tooltip>
                        </div>
                        {balanceDropdownOpen && (
                            <div className={`${styles.dropdownMenu} ${styles.balanceDropdown}`}>
                                <button className={styles.dropdownItem} onClick={handleTopUp} disabled={isDripping}>
                                    <TopUpIcon size={16} />
                                    <span className={styles.dropdownItemLabel}>{isDripping ? `Getting ${TOKEN_SYMBOL}...` : `Get ${TOKEN_SYMBOL}`}</span>
                                </button>
                                <a
                                    href="https://explorer.ritualfoundation.org"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.dropdownItem}
                                >
                                    <TopUpIcon size={16} />
                                    <span className={styles.dropdownItemLabel}>Open Ritual Explorer</span>
                                </a>
                            </div>
                        )}
                    </div>
                )}
                {isConnected ? (
                    <div ref={walletRef} style={{ position: 'relative' }}>
                        <button className={styles.walletButton} onClick={handleWalletClick}>
                            {shortAddress}
                        </button>
                        {walletDropdownOpen && (
                            <div className={`${styles.dropdownMenu} ${styles.walletDropdown}`}>
                                <button className={styles.dropdownItem} onClick={handleDisconnect}>
                                    <DisconnectIcon size={16} />
                                    <span className={styles.dropdownItemLabel}>Disconnect</span>
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <button className={styles.walletButton} onClick={connect} disabled={isConnecting}>
                        {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                    </button>
                )}
            </div>
        </header>
    );
};

export default Header;


