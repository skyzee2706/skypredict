import { ethers } from "hardhat";

async function main() {
  const tokenAddress = process.env.MOCK_USDL_ADDRESS;
  const factoryAddress = process.env.FACTORY_ADDRESS;
  const betAddress = process.env.BET_ADDRESS;
  const side = process.env.SIDE?.toUpperCase(); // A or B
  const amount = process.env.AMOUNT; // In USDC units (6 decimals), e.g., 1000000 = 1 USDC

  if (!tokenAddress || !factoryAddress || !betAddress || !side || !amount) {
    console.log("Usage: MOCK_USDL_ADDRESS=0x... FACTORY_ADDRESS=0x... BET_ADDRESS=0x... SIDE=A AMOUNT=1000000 npx hardhat run scripts/place-bet.ts --network seismic");
    throw new Error("Missing required env vars: MOCK_USDL_ADDRESS, FACTORY_ADDRESS, BET_ADDRESS, SIDE, AMOUNT");
  }

  const [signer] = await ethers.getSigners();
  console.log(`Placing bet from: ${signer.address}`);
  console.log(`  Factory: ${factoryAddress}`);
  console.log(`  Bet: ${betAddress}`);
  console.log(`  Side: ${side}`);
  console.log(`  Amount: ${amount} (${Number(amount) / 1e6} USDC)`);

  // Get contracts
  const token = await ethers.getContractAt("IERC20", tokenAddress);
  const factory = await ethers.getContractAt("BetFactoryCOFI", factoryAddress);

  // Check token balance
  const balance = await token.balanceOf(signer.address);
  console.log(`\nToken balance: ${balance} (${Number(balance) / 1e6} USDL)`);

  if (balance < BigInt(amount)) {
    console.log("\nInsufficient token balance!");
    console.log("Mint MockUSDL tokens or use drip() for testnet tokens");
    throw new Error("Insufficient token balance");
  }

  // Check and set allowance
  const allowance = await token.allowance(signer.address, factoryAddress);
  console.log(`Current allowance: ${allowance}`);

  if (allowance < BigInt(amount)) {
    console.log("\nApproving token to factory...");
    const approveTx = await token.approve(factoryAddress, ethers.MaxUint256);
    await approveTx.wait();
    console.log("Approved!");
  }

  // Place bet
  const onSideA = side === "A";
  console.log(`\nPlacing bet on side ${side}...`);

  const tx = await factory.placeBet(betAddress, onSideA, amount);
  console.log(`Transaction: ${tx.hash}`);

  const receipt = await tx.wait();
  console.log(`\nBet placed successfully!`);

  // Parse BetPlaced event
  const betPlacedEvent = receipt?.logs.find((log: any) => {
    try {
      const parsed = factory.interface.parseLog({ topics: log.topics as string[], data: log.data });
      return parsed?.name === "BetPlaced";
    } catch {
      return false;
    }
  });

  if (betPlacedEvent) {
    const parsed = factory.interface.parseLog({
      topics: betPlacedEvent.topics as string[],
      data: betPlacedEvent.data
    });
    console.log(`  Bet Address: ${parsed?.args[0]}`);
    console.log(`  Bettor: ${parsed?.args[1]}`);
    console.log(`  On Side A: ${parsed?.args[2]}`);
    console.log(`  Amount: ${parsed?.args[3]}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
