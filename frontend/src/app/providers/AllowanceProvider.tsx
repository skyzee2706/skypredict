'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useWallet } from './WalletProvider';
import { checkUsdlBalance, isRouterApproved } from '../../lib/onchain/writes';

interface AllowanceContextType {
    usdlAllowance: bigint | undefined;
    isLoading: boolean;
    refetchAllowance: () => Promise<void>;
    needsApproval: boolean;
    routerApproved: boolean;
}

const AllowanceContext = createContext<AllowanceContextType>({
    usdlAllowance: undefined,
    isLoading: false,
    refetchAllowance: async () => {},
    needsApproval: false,
    routerApproved: false
});

export const useAllowance = () => {
    const context = useContext(AllowanceContext);
    if (!context) {
        throw new Error('useAllowance must be used within AllowanceProvider');
    }
    return context;
};

interface AllowanceProviderProps {
    children: React.ReactNode;
}

/**
 * Tracks SkyUSD balance and Router approval state.
 * - routerApproved: true if user has approved SkyUSD to Router (one-time)
 * - needsApproval: true if user has NOT yet approved Router
 */
export const AllowanceProvider: React.FC<AllowanceProviderProps> = ({ children }) => {
    const { isConnected, walletAddress } = useWallet();
    const [balance, setBalance] = useState<bigint | undefined>(undefined);
    const [routerApproved, setRouterApproved] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const fetchData = useCallback(async () => {
        if (!isConnected || !walletAddress) {
            setBalance(undefined);
            setRouterApproved(false);
            return;
        }

        setIsLoading(true);
        try {
            const [bal, approved] = await Promise.all([
                checkUsdlBalance(walletAddress as `0x${string}`),
                isRouterApproved(walletAddress as `0x${string}`)
            ]);
            setBalance(bal);
            setRouterApproved(approved);
        } catch (error) {
            console.error('Failed to fetch allowance data:', error);
            setBalance(undefined);
            setRouterApproved(false);
        } finally {
            setIsLoading(false);
        }
    }, [isConnected, walletAddress]);

    const refetchAllowance = useCallback(async () => {
        await fetchData();
    }, [fetchData]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Listen for balance refresh events (after deposit or bet)
    useEffect(() => {
        const handleRefresh = () => { fetchData(); };
        window.addEventListener('skyusd:balance-refresh', handleRefresh);
        return () => window.removeEventListener('skyusd:balance-refresh', handleRefresh);
    }, [fetchData]);

    // Auto-refresh every 10 seconds
    useEffect(() => {
        if (!isConnected || !walletAddress) return;
        const interval = setInterval(() => { fetchData(); }, 10000);
        return () => clearInterval(interval);
    }, [isConnected, walletAddress, fetchData]);

    const value: AllowanceContextType = {
        usdlAllowance: balance,
        isLoading,
        refetchAllowance,
        needsApproval: !routerApproved,
        routerApproved
    };

    return (
        <AllowanceContext.Provider value={value}>
            {children}
        </AllowanceContext.Provider>
    );
};