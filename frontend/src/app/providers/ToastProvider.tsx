'use client';

import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import Toast, { ToastType } from '../components/Shared/Toast';
import styles from './ToastProvider.module.css';

interface ToastContextValue {
    showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        setToast({ message, type });
        window.setTimeout(() => setToast(null), 1800);
    }, []);

    const value = useMemo(() => ({ showToast }), [showToast]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            {toast && (
                <div className={styles.toastContainer}>
                    <Toast message={toast.message} type={toast.type} />
                </div>
            )}
        </ToastContext.Provider>
    );
};

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within ToastProvider');
    return ctx;
}
