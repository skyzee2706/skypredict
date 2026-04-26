import React from 'react';
import styles from './CategoryFilter.module.css';

const CATEGORIES = [
    "All",
    "Crypto",
    "Economy"
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
                    key={cat}
                    className={`${styles.item} ${active === cat ? styles.active : ''}`}
                    onClick={() => onSelect && onSelect(cat)}
                >
                    {cat}
                </div>
            ))}
        </div>
    );
};

export default CategoryFilter;
