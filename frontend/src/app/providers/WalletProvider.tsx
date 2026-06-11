'use client';

import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth';
import { WagmiProvider, useSetActiveWallet } from '@privy-io/wagmi';
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
    const { setActiveWallet } = useSetActiveWallet();

    const primaryWallet = wallets?.[0];
    const walletAddress = authenticated && primaryWallet ? primaryWallet.address : null;
    const isConnecting = !ready;

    const syncActiveWallet = useCallback(async () => {
        if (!ready || !authenticated || !primaryWallet) return;
        await setActiveWallet(primaryWallet);
    }, [ready, authenticated, primaryWallet, setActiveWallet]);

    React.useEffect(() => {
        syncActiveWallet().catch((error) => {
            console.error('Failed to sync active Ritual wallet:', error);
        });
    }, [syncActiveWallet]);

    const connect = useCallback(async () => {
        await login();
        await syncActiveWallet();
    }, [login, syncActiveWallet]);

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
    const hasValidPrivyConfig =
        !!appId &&
        !!clientId &&
        appId !== 'your_privy_app_id' &&
        clientId !== 'your_privy_client_id';

    if (!hasValidPrivyConfig) {
        const disabledWalletValue: WalletContextValue = {
            walletAddress: null,
            isConnected: false,
            isConnecting: false,
            connect: async () => {
                console.warn('Privy is not configured. Set NEXT_PUBLIC_PRIVY_APP_ID and NEXT_PUBLIC_PRIVY_CLIENT_ID.');
            },
            disconnect: async () => undefined,
        };

        return (
            <WalletContext.Provider value={disabledWalletValue}>
                <QueryClientProvider client={queryClient}>
                    {children}
                </QueryClientProvider>
            </WalletContext.Provider>
        );
    }

    return (
        <PrivyProvider
            appId={appId}
            clientId={clientId}
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
