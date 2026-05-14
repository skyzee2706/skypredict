import { defineChain } from "viem";

const DEFAULT_RPC = "https://rpc.ritualfoundation.org";

export const ritualChain = defineChain({
  id: 1979,
  name: "Ritual",
  network: "ritual",
  nativeCurrency: {
    name: "RITUAL",
    symbol: "RITUAL",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RITUAL_RPC_URL || DEFAULT_RPC],
    },
    public: {
      http: [process.env.NEXT_PUBLIC_RITUAL_RPC_URL || DEFAULT_RPC],
    },
  },
  blockExplorers: {
    default: {
      name: "Ritual Explorer",
      url: "https://explorer.ritualfoundation.org",
    },
  },
  testnet: false,
});

export const seismicTestnet = ritualChain;
