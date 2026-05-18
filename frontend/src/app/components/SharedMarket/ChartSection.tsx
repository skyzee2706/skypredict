import React from 'react';
import styles from './ChartSection.module.css';
import { MarketData } from '../../../data/markets';
import { PriceChart } from './PriceChart';

interface ChartSectionProps {
    probability: number;
    type?: 'crypto' | 'stock' | 'sport' | 'politics' | 'other';
    identifier?: string;
    market?: MarketData;
}

const ChartSection: React.FC<ChartSectionProps> = ({ market, type }) => {
    const isSport = type === 'sport' || market?.category === 'SPORTS';
    const endTime = market?.deadline ? Number(market.deadline) : undefined;
    const startTime = endTime ? (market?.creationDate ?? endTime - 3600) : undefined;
    const bettingEndTime = market?.bettingEndTime ?? (endTime ? endTime - 900 : undefined);
    const strikePrice = market?.strikePrice;

    if (isSport) {
        return null;
    }

    return (
        <div className={styles.chartSection}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div className={styles.timeTabs}>
                    <div style={{ fontSize: '12px', fontWeight: 600 }}>{(market?.ticker || "BTC")}/USD Median 10-Market</div>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Source: 10 CEX median
                </div>
            </div>

            <div style={{ height: '320px', marginTop: '20px' }}>
                {startTime && endTime && strikePrice ? (
                    <PriceChart
                        symbol={(market?.ticker || "BTC") + "USDT"}
                        height={320}
                        startTime={startTime}
                        endTime={endTime}
                        bettingEndTime={bettingEndTime}
                        strikePrice={strikePrice}
                    />
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                        Chart data is not available yet.
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChartSection;
