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
    ritual: {
      url:
        process.env.RITUAL_RPC_URL ||
        process.env.SEISMIC_RPC_URL ||
        "https://rpc.ritualfoundation.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 1979,
    },
    seismic: {
      url:
        process.env.RITUAL_RPC_URL ||
        process.env.SEISMIC_RPC_URL ||
        "https://rpc.ritualfoundation.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 1979,
    },
  },
  etherscan: {
    apiKey: {
      ritual: process.env.RITUAL_EXPLORER_API_KEY || "",
      seismic: process.env.RITUAL_EXPLORER_API_KEY || "",
    },
    customChains: [
      {
        network: "ritual",
        chainId: 1979,
        urls: {
          apiURL:
            process.env.RITUAL_EXPLORER_API_URL ||
            "https://explorer.ritualfoundation.org/api",
          browserURL: "https://explorer.ritualfoundation.org",
        },
      },
      {
        network: "seismic",
        chainId: 1979,
        urls: {
          apiURL:
            process.env.RITUAL_EXPLORER_API_URL ||
            "https://explorer.ritualfoundation.org/api",
          browserURL: "https://explorer.ritualfoundation.org",
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
