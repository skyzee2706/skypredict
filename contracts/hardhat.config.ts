import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.22",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,  // Enable IR-based compiler to avoid "stack too deep" errors
    },
  },
  networks: {
    seismic: {
      url:
        process.env.SEISMIC_RPC_URL ||
        process.env.BASE_SEPOLIA_RPC_URL ||
        "https://gcp-1.seismictest.net/rpc",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 5124,
    },
  },
  etherscan: {
    apiKey: {
      seismic: process.env.SEISMIC_EXPLORER_API_KEY || "",
    },
    customChains: [
      {
        network: "seismic",
        chainId: 5124,
        urls: {
          apiURL:
            process.env.SEISMIC_EXPLORER_API_URL ||
            "https://seismic-testnet.socialscan.io/api",
          browserURL: "https://seismic-testnet.socialscan.io",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
