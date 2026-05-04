'use client';

import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth';
import { WagmiProvider } from '@privy-io/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig } from '../../lib/onchain/wagmiConfig';
import { seismicTestnet } from '../../lib/onchain/seismicChain';

interface WalletContextValue {
    walletAddress: string | null;
    isConnected: boolean;
    isConnecting: boolean;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

const queryClient = new QueryClient();


// Privy-backed context provider
const PrivyWalletContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { ready, authenticated, login, logout } = usePrivy();
    const { wallets } = useWallets();

    const primaryWallet = wallets?.[0];
    const walletAddress = authenticated && primaryWallet ? primaryWallet.address : null;
    const isConnecting = !ready;
    const [hasAttemptedSwitch, setHasAttemptedSwitch] = React.useState(false);

    React.useEffect(() => {
        const autoSwitch = async () => {
            if (ready && authenticated && primaryWallet && !hasAttemptedSwitch) {
                const targetChainIdStr = `eip155:${seismicTestnet.id}`;
                if (primaryWallet.chainId !== targetChainIdStr) {
                    setHasAttemptedSwitch(true); // Mencegah spam popup jika user reject
                    try {
                        await primaryWallet.switchChain(seismicTestnet.id);
                    } catch (e) {
                        console.error('Failed to switch to Ritual Network:', e);
                    }
                }
            }
        };
        autoSwitch();
    }, [ready, authenticated, primaryWallet, hasAttemptedSwitch]);

    const connect = useCallback(async () => {
        await login();
    }, [login]);

    const disconnect = useCallback(async () => {
        await logout();
    }, [logout]);

    const value = useMemo(
        () => ({
            walletAddress,
            isConnected: !!walletAddress,
            isConnecting,
            connect,
            disconnect
        }),
        [walletAddress, isConnecting, connect, disconnect]
    );

    return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const clientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID;

    return (
        <PrivyProvider
            appId={appId ?? ''}
            clientId={clientId ?? ''}
            config={{
                appearance: {
                    theme: 'dark',
                    accentColor: '#0f172a',
                    logo: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>ðŸ¥¤</text></svg>",
                    showWalletLoginFirst: true,
                },
                loginMethods: ['email', 'wallet'],
                embeddedWallets: {
                    ethereum: {
                        createOnLogin: 'users-without-wallets'
                    }
                },
                defaultChain: seismicTestnet,
                supportedChains: [seismicTestnet],
            }}
        >
            <QueryClientProvider client={queryClient}>
                <WagmiProvider config={wagmiConfig}>
                    <PrivyWalletContextProvider>{children}</PrivyWalletContextProvider>
                </WagmiProvider>
            </QueryClientProvider>
        </PrivyProvider>
    );
};

export const useWallet = () => {
    const ctx = useContext(WalletContext);
    if (!ctx) {
        throw new Error('useWallet must be used within WalletProvider');
    }
    return ctx;
};
