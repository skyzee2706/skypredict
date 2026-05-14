import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: "../.env" });

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("=== Sky Predict v2 — Full Deploy (SkyUSD + Factory + Router) ===");
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(balance)} RITUAL\n`);

  // ---- Step 1: Deploy SkyUSDT (18 decimal, deposit model) ----
  console.log("Step 1: Deploying SkyUSDT...");
  const SkyUSDT = await ethers.getContractFactory("SkyUSDT");
  const skyusd = await SkyUSDT.deploy(deployer.address);
  await skyusd.waitForDeployment();
  const skyusdAddress = await skyusd.getAddress();
  console.log(`  ✅ SkyUSDT deployed: ${skyusdAddress}`);

  const decimals = await skyusd.decimals();
  const totalSupply = await skyusd.totalSupply();
  console.log(`  Decimals: ${decimals}`);
  console.log(`  Initial supply: ${ethers.formatUnits(totalSupply, decimals)} SkyUSD`);

  // ---- Step 2: Deploy MarketFactory ----
  const btcOracleAddress = process.env.BTC_ORACLE_ADDRESS;
  const ethOracleAddress = process.env.ETH_ORACLE_ADDRESS;

  if (!btcOracleAddress || !ethOracleAddress) {
    throw new Error("Missing BTC_ORACLE_ADDRESS or ETH_ORACLE_ADDRESS in .env");
  }

  console.log("\nStep 2: Deploying MarketFactory...");
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

  // ---- Step 3: Deploy MarketRouter ----
  console.log("\nStep 3: Deploying MarketRouter...");
  const MarketRouter = await ethers.getContractFactory("MarketRouter");
  const router = await MarketRouter.deploy(skyusdAddress, factoryAddress);
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();
  console.log(`  ✅ MarketRouter deployed: ${routerAddress}`);

  // ---- Step 4: Set router on Factory (auto-configures future markets) ----
  console.log("\nStep 4: Setting router on Factory...");
  const setRouterTx = await factory.setRouterAddress(routerAddress);
  await setRouterTx.wait();
  console.log(`  ✅ Router set on Factory: ${routerAddress}`);

  // ---- Step 5: Update all .env files ----
  console.log("\nStep 5: Updating .env files...\n");

  const envUpdates = [
    {
      file: path.resolve(__dirname, "../../.env"),
      vars: { FACTORY_ADDRESS: factoryAddress, SKYUSD_ADDRESS: skyusdAddress, ROUTER_ADDRESS: routerAddress }
    },
    {
      file: path.resolve(__dirname, "../.env"),
      vars: { FACTORY_ADDRESS: factoryAddress, SKYUSD_ADDRESS: skyusdAddress, ROUTER_ADDRESS: routerAddress }
    },
    {
      file: path.resolve(__dirname, "../../frontend/.env.local"),
      vars: { NEXT_PUBLIC_FACTORY_ADDRESS: factoryAddress, NEXT_PUBLIC_SKYUSD_ADDRESS: skyusdAddress, NEXT_PUBLIC_ROUTER_ADDRESS: routerAddress }
    },
  ];

  for (const { file, vars } of envUpdates) {
    if (!fs.existsSync(file)) {
      console.log(`  ⚠ Skipped (not found): ${file}`);
      continue;
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

  console.log("\n=== Deploy Complete ===");
  console.log(`SKYUSD_ADDRESS=${skyusdAddress}`);
  console.log(`FACTORY_ADDRESS=${factoryAddress}`);
  console.log(`ROUTER_ADDRESS=${routerAddress}`);
  console.log(`\nNext: restart scheduler with 'npm run auto-market'`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
