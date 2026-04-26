import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const SEISMIC_RPC_URL =
    process.env.SEISMIC_RPC_URL ||
    process.env.BASE_SEPOLIA_RPC_URL ||
    process.env.SEPOLIA_RPC_URL ||
    "https://gcp-1.seismictest.net/rpc";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const SEISMIC_EXPLORER_API_KEY = process.env.SEISMIC_EXPLORER_API_KEY || "";
const SEISMIC_EXPLORER_API_URL =
    process.env.SEISMIC_EXPLORER_API_URL || "https://seismic-testnet.socialscan.io/api";

const config: HardhatUserConfig = {
    solidity: {
        version: "0.8.20",
        settings: {
            optimizer: { enabled: true, runs: 200 },
        },
    },
    networks: {
        hardhat: {},
        seismic: {
            url: SEISMIC_RPC_URL,
            accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
            chainId: 5124,
        },
    },
    etherscan: {
        apiKey: {
            seismic: SEISMIC_EXPLORER_API_KEY,
        },
        customChains: [
            {
                network: "seismic",
                chainId: 5124,
                urls: {
                    apiURL: SEISMIC_EXPLORER_API_URL,
                    browserURL: "https://seismic-testnet.socialscan.io",
                },
            },
        ],
    },
    // Temporarily disabled to bypass Windows IO build crash
    typechain: {
        dontOverrideCompile: true
    },
    paths: {
        sources: "./contracts",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts",
    },
};

export default config;
