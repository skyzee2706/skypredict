import React from 'react';
import styles from './ProbabilityGauge.module.css';

interface ProbabilityGaugeProps {
    probability: number; // 0 to 100
}

const ProbabilityGauge: React.FC<ProbabilityGaugeProps> = ({ probability }) => {
    // SVG Arc calculations
    // Radius 25, Center (30, 30)
    // We want a semi-circle from -90deg (left) to 90deg (right)

    // Normalized probability between 0 and 1
    const p = Math.min(Math.max(probability, 0), 100) / 100;

    // Stroke Dash Array technique
    // Circumference of full circle (r=22) = 2 * pi * 22 ≈ 138.2
    // We only want half circle, so max visible length is ~69.1
    // But dasharray is based on full circle usually.
    // Easier approach: Path Arc Command?

    // Let's use stroke-dasharray on a half-circle path.
    // Path: M 5 30 A 25 25 0 0 1 55 30
    // Arc length = pi * 25 ≈ 78.5
    const radius = 22;
    const arcLength = Math.PI * radius; // ~69.1
    const fillLength = arcLength * p;

    const color = 'var(--foreground)';

    return (
        <div className={styles.gaugeContainer}>
            <svg width="60" height="35" viewBox="0 0 60 35">
                {/* Background Track */}
                <path
                    d="M 8 30 A 22 22 0 0 1 52 30"
                    fill="none"
                    stroke="var(--card-border-hover)"
                    strokeWidth="4"
                    strokeLinecap="round"
                />

                {/* Colored Progress */}
                <path
                    d="M 8 30 A 22 22 0 0 1 52 30"
                    fill="none"
                    stroke={color}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={`${arcLength} ${arcLength}`}
                    strokeDashoffset={arcLength - fillLength}
                    style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                />
            </svg>
            <div className={styles.percentageText}>
                {probability.toFixed(1)}%
            </div>
        </div>
    );
};

export default ProbabilityGauge;
