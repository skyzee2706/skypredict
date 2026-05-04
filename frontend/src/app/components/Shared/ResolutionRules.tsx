import React from 'react';
import { marked } from 'marked';
import { MarketData } from '../../../data/markets';
import styles from './ResolutionRules.module.css';

interface ResolutionRulesProps {
    market: MarketData;
    variant?: 'default' | 'compact' | 'inline';
    showTitle?: boolean;
    className?: string;
}

// Configure marked for security and styling
marked.setOptions({
    breaks: true,
    gfm: true,
});

const ResolutionRules: React.FC<ResolutionRulesProps> = ({
    market,
    variant = 'default',
    showTitle = true,
    className = ''
}) => {
    // Process markdown for description
    const processedDescription = React.useMemo(() => {
        if (!market.description) return '';
        try {
            return marked(market.description, { async: false }) as string;
        } catch (error) {
            console.error('Error parsing markdown:', error);
            return market.description;
        }
    }, [market.description]);

    if (variant === 'inline') {
        return (
            <span
                className={`${styles.inlineRule} ${className}`}
                dangerouslySetInnerHTML={{ __html: processedDescription }}
            />
        );
    }

    if (variant === 'compact') {
        return (
            <div className={`${styles.compactContainer} ${className}`}>
                {showTitle && (
                    <div className={styles.compactTitle}>Resolution</div>
                )}
                <div
                    className={styles.compactDescription}
                    dangerouslySetInnerHTML={{ __html: processedDescription }}
                />
            </div>
        );
    }

    // Default variant
    return (
        <div className={`${styles.container} ${className}`}>
            {showTitle && (
                <h4 className={styles.title}>Resolution</h4>
            )}

            <div
                className={styles.description}
                dangerouslySetInnerHTML={{ __html: processedDescription }}
            />

            <div className={styles.meta}>
                Resolution is executed on Ritual Network using the market&apos;s on-chain settlement flow.
            </div>
        </div>
    );
};

export default ResolutionRules;
