import React from 'react';
import styles from './ChartSection.module.css';
import { MarketData } from '../../../data/markets';
import { PriceChart } from './PriceChart';

interface ChartSectionProps {
    probability: number;
    type?: 'crypto' | 'stock' | 'sport' | 'other';
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
        return (
            <div className={styles.chartSection}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div className={styles.timeTabs}>
                        <div style={{ fontSize: '12px', fontWeight: 600 }}>Live Match Score</div>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Source: football-data.org
                    </div>
                </div>

                <div style={{ height: '320px', marginTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: '8px', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text)' }}>
                        {market?.title || 'Sports Match'}
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                        Live score updates will be visible during the match.
                    </div>
                    {market?.sport?.homeGoals !== undefined && market?.sport?.awayGoals !== undefined && (
                         <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'var(--foreground)' }}>
                             {market.sport.homeGoals} - {market.sport.awayGoals}
                         </div>
                    )}
                </div>
            </div>
        );
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
