const { ethers } = require("ethers");
require("dotenv").config({ path: "./frontend/.env.local" });

const RPC_URL = process.env.NEXT_PUBLIC_SEISMIC_RPC_URL || "https://gcp-1.seismictest.net/rpc";
const PRIVATE_KEY = process.env.PRIVATE_KEY; 
const TOKEN_ADDRESS = process.env.NEXT_PUBLIC_TOKEN_ADDRESS;

if (!PRIVATE_KEY) {
    console.log("No PRIVATE_KEY found in .env.local, trying root .env");
    require("dotenv").config({ path: "./.env" });
}

async function main() {
    const pk = process.env.PRIVATE_KEY;
    console.log("Token Address:", TOKEN_ADDRESS);
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const signer = new ethers.Wallet(pk, provider);

    const abi = ["function faucet(address) external"];
    const token = new ethers.Contract(TOKEN_ADDRESS, abi, signer);

    try {
        console.log("Estimating gas for faucet...");
        const gas = await token.faucet.estimateGas(signer.address);
        console.log("Estimated gas:", gas.toString());
        
        console.log("Sending transaction...");
        const tx = await token.faucet(signer.address, { gasLimit: gas });
        console.log("Tx hash:", tx.hash);
        await tx.wait();
        console.log("Success!");
    } catch(e) {
        console.error("Error:", e.message);
    }
}
main();
