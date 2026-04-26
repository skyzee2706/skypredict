import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://auth.privy.io https://widgets.coingecko.com https://s3.tradingview.com https://*.tradingview.com",
              "style-src 'self' 'unsafe-inline' https://*.tradingview.com https://fonts.googleapis.com",
              "img-src 'self' data: https: https://*.tradingview.com",
              "font-src 'self' https: https://*.tradingview.com",
              "connect-src 'self' https://auth.privy.io https://gcp-1.seismictest.net https://gcp-1.seismictest.net/rpc wss://gcp-1.seismictest.net/ws wss: https: https://*.tradingview.com http://pmkit-backend.courtofinternet.com",
              "frame-src 'self' https://auth.privy.io https://*.tradingview.com https://tradingview-widget.com https://www.tradingview-widget.com https://charting-library.tradingview.com https://widget.tradingview.com https://tradingview-embed-widget.com",
              "frame-ancestors 'self' https://auth.privy.io",
              "worker-src 'self' blob:",
              "object-src 'none'"
            ].join('; ')
          }
        ]
      }
    ]
  },
  transpilePackages: [
    "@privy-io/react-auth",
    "@reown/appkit",
    "@walletconnect/ethereum-provider"
  ],
  webpack: (config, { isServer }) => {
    // Node.js polyfills for client-side
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        assert: false,
        http: false,
        https: false,
        os: false,
        url: false,
        path: false,
        buffer: false,
        util: false,
        '@react-native-async-storage/async-storage': false,
      };
    }

    // Exclude problematic files and packages
    config.externals = config.externals || [];
    if (isServer) {
      config.externals.push(
        'why-is-node-running',
        'thread-stream'
      );
    }

    // Ignore problematic file types in dependencies
    config.module.rules.push(
      {
        test: /node_modules[\/\\].*\.(test|spec|md|zip|txt|sh|yml|yaml|LICENSE)$/,
        use: 'ignore-loader'
      },
      {
        test: /node_modules[\/\\]thread-stream[\/\\]/,
        use: 'ignore-loader'
      }
    );

    return config;
  }
};

export default nextConfig;
