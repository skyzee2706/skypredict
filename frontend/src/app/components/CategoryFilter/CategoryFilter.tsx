import React from 'react';
import styles from './CategoryFilter.module.css';

const IconAll = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
);
const IconCrypto = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
);
const IconSports = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 2a15 15 0 014 10 15 15 0 01-4 10 15 15 0 01-4-10 15 15 0 014-10z" /><path d="M2 12h20" />
    </svg>
);

const CATEGORIES: { key: string; label: string; icon: React.ReactNode }[] = [
    { key: 'All', label: 'All', icon: <IconAll /> },
    { key: 'Crypto', label: 'Crypto', icon: <IconCrypto /> },
    { key: 'Sports', label: 'Sports', icon: <IconSports /> },
];

interface CategoryFilterProps {
    active?: string;
    onSelect?: (category: string) => void;
}

const CategoryFilter: React.FC<CategoryFilterProps> = ({ active = "All", onSelect }) => {
    return (
        <div className={styles.container}>
            {CATEGORIES.map((cat) => (
                <div
                    key={cat.key}
                    className={`${styles.item} ${active === cat.key ? styles.active : ''}`}
                    onClick={() => onSelect && onSelect(cat.key)}
                >
                    <span className={styles.icon}>{cat.icon}</span>
                    {cat.label}
                </div>
            ))}
        </div>
    );
};

export default CategoryFilter;
