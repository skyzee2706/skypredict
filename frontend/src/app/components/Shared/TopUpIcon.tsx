import React from 'react';

const TopUpIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
    >
        <rect
            x="2"
            y="6"
            width="20"
            height="12"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.5"
        />
        <path
            d="M6 12H10M8 10V14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <circle
            cx="17"
            cy="12"
            r="1"
            fill="currentColor"
        />
    </svg>
);

export default TopUpIcon;