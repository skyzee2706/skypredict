import { ethers } from "hardhat";

async function main() {
  console.log("Deploying BetFactoryCOFI contract...\n");

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying from address: ${deployer.address}`);

  // Configuration (from env)
  const tokenAddress = process.env.MOCK_USDL_ADDRESS;

  if (!tokenAddress) {
    throw new Error("MOCK_USDL_ADDRESS environment variable not set!");
  }

  console.log("\nFactory Configuration:");
  console.log(`  Token Address: ${tokenAddress}`);

  // Deploy the BetFactoryCOFI contract
  const BetFactory = await ethers.getContractFactory("BetFactoryCOFI");
  const factory = await BetFactory.deploy(tokenAddress);

  await factory.waitForDeployment();

  const address = await factory.getAddress();

  console.log(`\n BetFactoryCOFI deployed to: ${address}`);
  console.log(`   Owner: ${deployer.address}`);
  console.log(`   Token: ${tokenAddress}`);

  console.log("\nTo verify on SocialScan, run:");
  console.log(
    `npx hardhat verify --network seismic ${address} "${tokenAddress}"`
  );

  console.log("\n Next steps:");
  console.log("1. Deploy BridgeReceiver on this chain (if not already deployed)");
  console.log("2. Configure factory with bridge receiver:");
  console.log(`   FACTORY_ADDRESS=${address} BRIDGE_RECEIVER_ADDRESS=0x... npx hardhat run scripts/configure-factory.ts --network seismic`);
  console.log("\n3. Configure BridgeReceiver to trust BridgeForwarder on zkSync:");
  console.log("   bridgeReceiver.setTrustedForwarder(zkSyncEid, bridgeForwarderAddress)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
