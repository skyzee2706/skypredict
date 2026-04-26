import { ethers } from "hardhat";

async function main() {
    const network = await ethers.provider.getNetwork();
    console.log("Network Name:", network.name);
    console.log("Chain ID:", network.chainId.toString());
    
    const [deployer] = await ethers.getSigners();
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Address:", deployer.address);
    console.log("Balance:", ethers.formatEther(balance), "ETH");
}

main().catch(console.error);
