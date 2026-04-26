import { useEffect, useRef, memo } from 'react';

interface TradingViewWidgetProps {
    symbol: string; // e.g., "NASDAQ:GOOG"
}

function TradingViewWidget({ symbol }: TradingViewWidgetProps) {
    const container = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!container.current) return;

        let isCancelled = false;

        // Clear previous usage to prevent duplicates if symbol changes or remount
        container.current.innerHTML = '';

        // Create the widget container div that TradingView expects
        const widgetContainer = document.createElement("div");
        widgetContainer.className = "tradingview-widget-container__widget";

        // Add some safety attributes
        widgetContainer.id = `tv-widget-${Math.random().toString(36).slice(2, 11)}`;
        container.current.appendChild(widgetContainer);

        // Add a small delay to ensure DOM is ready
        setTimeout(() => {
            if (isCancelled || !container.current) return;

            const script = document.createElement("script");
            script.src = "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js";
            script.type = "text/javascript";
            script.async = true;
            script.innerHTML = JSON.stringify({
                "symbol": symbol,
                "width": "100%",
                "height": "100%",
                "locale": "en",
                "dateRange": "12M",
                "colorTheme": "light",
                "isTransparent": true,
                "autosize": true,
                "largeChartUrl": ""
            });

            // Error handling for script load failures
            script.onerror = () => {
                console.warn('TradingView widget failed to load');
            };

            container.current.appendChild(script);
        }, 100);

        // Cleanup function to prevent memory leaks
        return () => {
            isCancelled = true;
            if (container.current) {
                container.current.innerHTML = '';
            }
        };

    }, [symbol]);

    return (
        <div className="tradingview-widget-container" ref={container} style={{ height: "100%", width: "100%" }}>
            {/* The script will inject here */}
        </div>
    );
}

export default memo(TradingViewWidget);
