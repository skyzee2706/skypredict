import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config({ path: "../.env" });

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("Deploying upgraded MarketFactory (Clones) to Ritual Network...");
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(balance)} RITUAL\n`);

  const btcOracleAddress = process.env.BTC_ORACLE_ADDRESS;
  const ethOracleAddress = process.env.ETH_ORACLE_ADDRESS;
  const tokenAddress = process.env.SKYUSD_ADDRESS;

  if (!btcOracleAddress || !ethOracleAddress || !tokenAddress) {
    throw new Error("Missing oracle or token address in .env");
  }

  console.log("Deploying MarketFactory...");
  const MarketFactory = await ethers.getContractFactory("MarketFactory");
  const factory = await MarketFactory.deploy(
    btcOracleAddress,
    ethOracleAddress,
    tokenAddress,
    deployer.address
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log(`New MarketFactory deployed to: ${factoryAddress}`);
  console.log(`\nPlease update your .env file:`);
  console.log(`FACTORY_ADDRESS=${factoryAddress}`);
  console.log(`NEXT_PUBLIC_FACTORY_ADDRESS=${factoryAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
