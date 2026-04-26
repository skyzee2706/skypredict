import { defineChain } from "viem";

const DEFAULT_RPC = "https://gcp-1.seismictest.net/rpc";
const DEFAULT_WS_RPC = "wss://gcp-1.seismictest.net/ws";

export const seismicTestnet = defineChain({
  id: 5124,
  name: "Seismic Testnet",
  network: "seismic-testnet",
  nativeCurrency: {
    name: "Seismic Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_SEISMIC_RPC_URL || DEFAULT_RPC],
      webSocket: [process.env.NEXT_PUBLIC_SEISMIC_WS_URL || DEFAULT_WS_RPC],
    },
    public: {
      http: [process.env.NEXT_PUBLIC_SEISMIC_RPC_URL || DEFAULT_RPC],
      webSocket: [process.env.NEXT_PUBLIC_SEISMIC_WS_URL || DEFAULT_WS_RPC],
    },
  },
  blockExplorers: {
    default: {
      name: "SocialScan",
      url: "https://seismic-testnet.socialscan.io",
    },
  },
  testnet: true,
});
