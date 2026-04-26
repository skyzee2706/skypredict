import { ethers } from "hardhat";

async function main() {
  console.log("Deploying MockUSDL contract...\n");

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying from address: ${deployer.address}`);

  // Deploy MockUSDL
  const MockUSDL = await ethers.getContractFactory("MockUSDL");
  const usdl = await MockUSDL.deploy();

  await usdl.waitForDeployment();

  const address = await usdl.getAddress();

  console.log(`\nâœ… MockUSDL deployed to: ${address}`);
  console.log(`   Owner: ${deployer.address}`);
  console.log(`   Symbol: USDL`);
  console.log(`   Decimals: 6`);
  console.log(`   Mint limit: 100 tokens per 24h (for non-admins)`);

  console.log("\nTo verify on SocialScan, run:");
  console.log(`npx hardhat verify --network seismic ${address}`);

  console.log("\nðŸ“‹ Next steps:");
  console.log("1. Add admins who can mint unlimited:");
  console.log(`   npx hardhat console --network seismic`);
  console.log(`   > const usdl = await ethers.getContractAt("MockUSDL", "${address}")`);
  console.log(`   > await usdl.setAdmin("0xADMIN_ADDRESS", true)`);
  console.log("\n2. Mint tokens (as owner/admin):");
  console.log(`   > await usdl.mint("0xRECIPIENT", ethers.parseUnits("1000", 6))`);
  console.log("\n3. Use this address in BetFactoryCOFI deployment:");
  console.log(`   MOCK_USDL_ADDRESS=${address} npx hardhat run scripts/deploy-factory.ts --network seismic`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
