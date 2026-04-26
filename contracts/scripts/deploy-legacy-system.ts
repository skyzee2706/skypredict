import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying legacy system from:", deployer.address);

  // 1. Deploy SkyUSDT
  console.log("\n1. Deploying SkyUSDT...");
  const SkyUSDT = await ethers.getContractFactory("SkyUSDT");
  const token = await SkyUSDT.deploy(deployer.address);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("SkyUSDT deployed to:", tokenAddress);

  await new Promise(resolve => setTimeout(resolve, 3000));

  // 2. Deploy Oracle Mocks
  console.log("\n2. Deploying Oracle Mocks...");
  const MockOracle = await ethers.getContractFactory("MockOracle");
  
  // BTC/USD Oracle (8 decimals)
  // 65,000 * 10^8 = 6,500,000,000,000
  const btcOracle = await MockOracle.deploy("BTC/USD", 6500000000000n);
  await btcOracle.waitForDeployment();
  const btcOracleAddress = await btcOracle.getAddress();
  console.log("BTC/USD Mock Oracle deployed to:", btcOracleAddress);

  await new Promise(resolve => setTimeout(resolve, 3000));

  // ETH/USD Oracle (8 decimals)
  // 3,500 * 10^8 = 350,000,000,000
  const ethOracle = await MockOracle.deploy("ETH/USD", 350000000000n);
  await ethOracle.waitForDeployment();
  const ethOracleAddress = await ethOracle.getAddress();
  console.log("ETH/USD Mock Oracle deployed to:", ethOracleAddress);

  await new Promise(resolve => setTimeout(resolve, 3000));

  // 3. Deploy MarketFactory
  console.log("\n3. Deploying MarketFactory...");
  const MarketFactory = await ethers.getContractFactory("MarketFactory");
  const factory = await MarketFactory.deploy(
    btcOracleAddress,
    ethOracleAddress,
    tokenAddress,
    deployer.address
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("MarketFactory deployed to:", factoryAddress);

  // 4. Save deployment results
  const deploymentData = {
    network: "seismic",
    token: tokenAddress,
    btcOracle: btcOracleAddress,
    ethOracle: ethOracleAddress,
    factory: factoryAddress,
    owner: deployer.address,
    timestamp: new Date().toISOString()
  };

  const resultsPath = path.join(__dirname, "../legacy_deployment.json");
  fs.writeFileSync(resultsPath, JSON.stringify(deploymentData, null, 2));
  console.log("\nDeployment results saved to:", resultsPath);

  console.log("\n--- CONFIGURATION FOR .ENV ---");
  console.log(`FACTORY_ADDRESS=${factoryAddress}`);
  console.log(`USDL_ADDRESS=${tokenAddress}`);
  console.log(`SKYUSD_ADDRESS=${tokenAddress}`);
  console.log(`BTC_ORACLE_ADDRESS=${btcOracleAddress}`);
  console.log(`ETH_ORACLE_ADDRESS=${ethOracleAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
