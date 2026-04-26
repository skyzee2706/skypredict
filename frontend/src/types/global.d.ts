declare namespace JSX {
    interface IntrinsicElements {
        'gecko-coin-price-chart-widget': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
            'locale'?: string;
            'outlined'?: string;
            'coin-id'?: string;
            'initial-currency'?: string;
        };
    }
}
