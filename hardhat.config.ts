import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const RITUAL_RPC_URL =
    process.env.RITUAL_RPC_URL ||
    process.env.SEISMIC_RPC_URL ||
    "https://rpc.ritualfoundation.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const RITUAL_EXPLORER_API_KEY = process.env.RITUAL_EXPLORER_API_KEY || "";
const RITUAL_EXPLORER_API_URL =
    process.env.RITUAL_EXPLORER_API_URL || "https://explorer.ritualfoundation.org/api";

const config: HardhatUserConfig = {
    solidity: {
        version: "0.8.20",
        settings: {
            optimizer: { enabled: true, runs: 200 },
        },
    },
    networks: {
        hardhat: {},
        ritual: {
            url: RITUAL_RPC_URL,
            accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
            chainId: 1979,
        },
        seismic: {
            url: RITUAL_RPC_URL,
            accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
            chainId: 1979,
        },
    },
    etherscan: {
        apiKey: {
            ritual: RITUAL_EXPLORER_API_KEY,
            seismic: RITUAL_EXPLORER_API_KEY,
        },
        customChains: [
            {
                network: "ritual",
                chainId: 1979,
                urls: {
                    apiURL: RITUAL_EXPLORER_API_URL,
                    browserURL: "https://explorer.ritualfoundation.org",
                },
            },
            {
                network: "seismic",
                chainId: 1979,
                urls: {
                    apiURL: RITUAL_EXPLORER_API_URL,
                    browserURL: "https://explorer.ritualfoundation.org",
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
