import React from 'react';

const CopyIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
    >
        <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <rect x="4" y="4" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.65" />
    </svg>
);

export default CopyIcon;