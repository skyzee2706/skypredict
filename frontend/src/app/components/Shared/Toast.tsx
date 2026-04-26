import React from 'react';
import styles from './Toast.module.css';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
    message: string;
    type?: ToastType;
}

const Toast: React.FC<ToastProps> = ({ message, type = 'info' }) => {
    return <div className={`${styles.toast} ${styles[type]}`}>{message}</div>;
};

export default Toast;
