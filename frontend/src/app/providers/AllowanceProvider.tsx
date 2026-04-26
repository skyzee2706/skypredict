'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useWallet } from './WalletProvider';
import { checkUsdlAllowance } from '../../lib/onchain/writes';
import { FACTORY_ADDRESS } from '../../lib/constants';

interface AllowanceContextType {
    usdlAllowance: bigint | undefined;
    isLoading: boolean;
    refetchAllowance: () => Promise<void>;
    needsApproval: boolean;
}

const AllowanceContext = createContext<AllowanceContextType>({
    usdlAllowance: undefined,
    isLoading: false,
    refetchAllowance: async () => {},
    needsApproval: true
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

export const AllowanceProvider: React.FC<AllowanceProviderProps> = ({ children }) => {
    const { isConnected, walletAddress } = useWallet();
    const [usdlAllowance, setUsdlAllowance] = useState<bigint | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(false);

    const fetchAllowance = useCallback(async () => {
        if (!isConnected || !walletAddress) {
            setUsdlAllowance(undefined);
            return;
        }

        setIsLoading(true);
        try {
            const allowance = await checkUsdlAllowance(
                walletAddress as `0x${string}`,
                FACTORY_ADDRESS as `0x${string}`
            );
            setUsdlAllowance(allowance);
        } catch (error) {
            console.error('Failed to fetch USDL allowance:', error);
            setUsdlAllowance(undefined);
        } finally {
            setIsLoading(false);
        }
    }, [isConnected, walletAddress]);

    const refetchAllowance = useCallback(async () => {
        await fetchAllowance();
    }, [fetchAllowance]);

    // Fetch allowance when wallet connects/disconnects
    useEffect(() => {
        fetchAllowance();
    }, [fetchAllowance]);

    // Auto-refresh allowance every 2 seconds (like your pattern)
    useEffect(() => {
        if (!isConnected || !walletAddress) return;

        const interval = setInterval(() => {
            fetchAllowance();
        }, 2000);

        return () => clearInterval(interval);
    }, [isConnected, walletAddress, fetchAllowance]);

    const needsApproval = !usdlAllowance || usdlAllowance === BigInt(0);

    const value: AllowanceContextType = {
        usdlAllowance,
        isLoading,
        refetchAllowance,
        needsApproval
    };

    return (
        <AllowanceContext.Provider value={value}>
            {children}
        </AllowanceContext.Provider>
    );
};