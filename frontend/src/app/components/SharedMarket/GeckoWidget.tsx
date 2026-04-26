import React, { useEffect } from 'react';

interface GeckoWidgetProps {
    coinId: string;
    mini?: boolean;
}

const GeckoWidget: React.FC<GeckoWidgetProps> = ({ coinId, mini = false }) => {
    // Script is now loaded globally in layout.tsx to ensure reliability

    // Hack for TS
    const Widget = 'gecko-coin-price-chart-widget' as unknown as React.ElementType;

    // Fix hydration mismatch by only rendering on client
    const [isMounted, setIsMounted] = React.useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) return <div style={{ width: '100%', height: '100%' }} />; // Return placeholder to prevent layout shift

    if (mini) {
        return (
            <div style={{ width: '200%', height: '200%', transform: 'scale(0.5)', transformOrigin: 'top left' }}>
                <Widget
                    locale="en"
                    outlined="true"
                    coin-id={coinId}
                    initial-currency="usd"
                    style={{ width: '100%', height: '100%' }}
                ></Widget>
            </div>
        );
    }

    return (
        <Widget
            locale="en"
            outlined="true"
            coin-id={coinId}
            initial-currency="usd"
            style={{ width: '100%', height: '100%' }}
        ></Widget>
    );
};

export default GeckoWidget;
