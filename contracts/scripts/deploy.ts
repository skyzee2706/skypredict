import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("Deploying Ritual prediction market system...");
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(balance)} RITUAL\n`);

  console.log("1/4 Deploying SkyUSDT...");
  const SkyUSDT = await ethers.getContractFactory("SkyUSDT");
  const token = await SkyUSDT.deploy(deployer.address);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log(`SkyUSDT: ${tokenAddress}`);

  console.log("\n2/4 Deploying MockOracles...");
  const MockOracle = await ethers.getContractFactory("MockOracle");

  const btcOracle = await MockOracle.deploy("BTC/USD", 6500000000000n);
  await btcOracle.waitForDeployment();
  const btcOracleAddress = await btcOracle.getAddress();
  console.log(`BTC/USD Oracle: ${btcOracleAddress}`);

  const ethOracle = await MockOracle.deploy("ETH/USD", 350000000000n);
  await ethOracle.waitForDeployment();
  const ethOracleAddress = await ethOracle.getAddress();
  console.log(`ETH/USD Oracle: ${ethOracleAddress}`);

  console.log("\n3/4 Deploying MarketFactory...");
  const MarketFactory = await ethers.getContractFactory("MarketFactory");
  const factory = await MarketFactory.deploy(
    btcOracleAddress,
    ethOracleAddress,
    tokenAddress,
    deployer.address
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log(`MarketFactory: ${factoryAddress}`);

  const deploymentData = {
    network: "ritual",
    chainId: 1979,
    rpcUrl: "https://rpc.ritualfoundation.org",
    explorerUrl: "https://explorer.ritualfoundation.org",
    owner: deployer.address,
    token: tokenAddress,
    skyUsd: tokenAddress,
    usdl: tokenAddress,
    btcOracle: btcOracleAddress,
    ethOracle: ethOracleAddress,
    factory: factoryAddress,
    timestamp: new Date().toISOString()
  };

  const resultsPath = path.join(__dirname, "../ritual_deployment.json");
  fs.writeFileSync(resultsPath, JSON.stringify(deploymentData, null, 2));

  console.log("\n4/4 Deployment results saved:", resultsPath);
  console.log("\n--- ENV ---");
  console.log("NETWORK_NAME=Ritual");
  console.log("CHAIN_ID=1979");
  console.log("RITUAL_RPC_URL=https://rpc.ritualfoundation.org");
  console.log("NEXT_PUBLIC_RITUAL_RPC_URL=https://rpc.ritualfoundation.org");
  console.log(`FACTORY_ADDRESS=${factoryAddress}`);
  console.log(`NEXT_PUBLIC_FACTORY_ADDRESS=${factoryAddress}`);
  console.log(`USDL_ADDRESS=${tokenAddress}`);
  console.log(`SKYUSD_ADDRESS=${tokenAddress}`);
  console.log(`NEXT_PUBLIC_USDL_ADDRESS=${tokenAddress}`);
  console.log(`NEXT_PUBLIC_SKYUSD_ADDRESS=${tokenAddress}`);
  console.log(`BTC_ORACLE_ADDRESS=${btcOracleAddress}`);
  console.log(`ORACLE_ADDRESS=${btcOracleAddress}`);
  console.log(`ETH_ORACLE_ADDRESS=${ethOracleAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
