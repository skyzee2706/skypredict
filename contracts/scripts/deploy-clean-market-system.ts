import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: "../.env" });

function updateEnvFile(file: string, vars: Record<string, string>) {
  if (!fs.existsSync(file)) {
    console.log(`  ⚠ Skipped (not found): ${file}`);
    return;
  }

  let content = fs.readFileSync(file, "utf8");
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  }
  fs.writeFileSync(file, content, "utf8");
  console.log(`  ✅ Updated: ${file}`);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("=== SkyPredict Clean Redeploy — Factory + Router only ===");
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(balance)} RITUAL\n`);

  const btcOracleAddress = process.env.BTC_ORACLE_ADDRESS;
  const ethOracleAddress = process.env.ETH_ORACLE_ADDRESS;
  const skyusdAddress = process.env.SKYUSD_ADDRESS;

  if (!btcOracleAddress || !ethOracleAddress || !skyusdAddress) {
    throw new Error("Missing BTC_ORACLE_ADDRESS, ETH_ORACLE_ADDRESS, or SKYUSD_ADDRESS in contracts/.env");
  }

  console.log(`Using existing SkyUSD: ${skyusdAddress}`);

  console.log("\nStep 1: Deploying optimized MarketFactory...");
  const MarketFactory = await ethers.getContractFactory("MarketFactory");
  const factory = await MarketFactory.deploy(
    btcOracleAddress,
    ethOracleAddress,
    skyusdAddress,
    deployer.address
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log(`  ✅ MarketFactory deployed: ${factoryAddress}`);

  console.log("\nStep 2: Deploying optimized MarketRouter...");
  const MarketRouter = await ethers.getContractFactory("MarketRouter");
  const router = await MarketRouter.deploy(skyusdAddress, factoryAddress);
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();
  console.log(`  ✅ MarketRouter deployed: ${routerAddress}`);

  console.log("\nStep 3: Setting router on Factory...");
  const setRouterTx = await factory.setRouterAddress(routerAddress);
  await setRouterTx.wait();
  console.log(`  ✅ Router set on Factory: ${routerAddress}`);

  console.log("\nStep 4: Updating env files...\n");
  updateEnvFile(path.resolve(__dirname, "../../.env"), {
    FACTORY_ADDRESS: factoryAddress,
    ROUTER_ADDRESS: routerAddress,
  });
  updateEnvFile(path.resolve(__dirname, "../.env"), {
    FACTORY_ADDRESS: factoryAddress,
    ROUTER_ADDRESS: routerAddress,
  });
  updateEnvFile(path.resolve(__dirname, "../../frontend/.env.local"), {
    NEXT_PUBLIC_FACTORY_ADDRESS: factoryAddress,
    NEXT_PUBLIC_ROUTER_ADDRESS: routerAddress,
  });

  const deploymentPath = path.resolve(__dirname, "../ritual_deployment.json");
  let deployment: Record<string, unknown> = {};
  if (fs.existsSync(deploymentPath)) {
    deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  }
  deployment = {
    ...deployment,
    network: deployment.network || "ritual",
    owner: deployer.address,
    token: skyusdAddress,
    skyUsd: skyusdAddress,
    factory: factoryAddress,
    router: routerAddress,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2), "utf8");
  console.log(`  ✅ Updated deployment file: ${deploymentPath}`);

  console.log("\n=== Clean Redeploy Complete ===");
  console.log(`SKYUSD_ADDRESS=${skyusdAddress}`);
  console.log(`FACTORY_ADDRESS=${factoryAddress}`);
  console.log(`ROUTER_ADDRESS=${routerAddress}`);
  console.log("\nNext: create fresh markets, then run frontend/scripts/indexer-worker.cjs --once");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
