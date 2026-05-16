import React from 'react';
import styles from './Header.module.css';
import { useWallet } from '../../providers/WalletProvider';
import { readContract } from 'wagmi/actions';
import { wagmiConfig } from '../../../lib/onchain/wagmiConfig';
import { seismicTestnet } from '../../../lib/onchain/seismicChain';
import DisconnectIcon from '../Shared/DisconnectIcon';
import TopUpIcon from '../Shared/TopUpIcon';
import InfoIcon from '../Shared/InfoIcon';
import Tooltip from '../Shared/Tooltip';
import { TOKEN_ADDRESS, SKYUSD_ABI, SKYUSD_MULTIPLIER, TOKEN_SYMBOL } from '../../../lib/constants';

interface HeaderProps {
    onNavigate: (page: 'landing' | 'markets' | 'portfolio' | 'leaderboard' | 'faucet') => void;
    currentPage: 'landing' | 'markets' | 'portfolio' | 'leaderboard' | 'faucet';
}

const Header: React.FC<HeaderProps> = ({ onNavigate, currentPage }) => {
    const { isConnected, walletAddress, isConnecting, connect, disconnect } = useWallet();
    const [tokenBalance, setTokenBalance] = React.useState<bigint | undefined>(undefined);
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

    React.useEffect(() => {
        const handleRefresh = () => {
            fetchTokenBalance();
        };
        window.addEventListener('skyusd:balance-refresh', handleRefresh);
        return () => window.removeEventListener('skyusd:balance-refresh', handleRefresh);
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

    const handleDeposit = React.useCallback(() => {
        onNavigate('faucet');
        setBalanceDropdownOpen(false);
    }, [onNavigate]);

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
                    <span
                        className={`${styles.navItem} ${currentPage === 'leaderboard' ? styles.active : ''}`}
                        onClick={() => onNavigate('leaderboard')}
                    >
                        Leaderboard
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
                                <button className={styles.dropdownItem} onClick={handleDeposit}>
                                    <TopUpIcon size={16} />
                                    <span className={styles.dropdownItemLabel}>Deposit RITUAL</span>
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


