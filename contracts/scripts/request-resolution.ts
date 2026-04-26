import { ethers } from "hardhat";
import { AbiCoder } from "ethers";

async function main() {
  const betAddress = process.env.BET_ADDRESS;

  if (!betAddress) {
    console.log("Usage: BET_ADDRESS=0x... npx hardhat run scripts/testing/request-resolution.ts --network seismic");
    throw new Error("Missing required env var: BET_ADDRESS");
  }

  const [signer] = await ethers.getSigners();
  console.log(`Requesting resolution from: ${signer.address}`);
  console.log(`  Bet: ${betAddress}`);

  // Get bet contract
  const bet = await ethers.getContractAt("BetCOFI", betAddress);

  // Check if caller is creator
  const creator = await bet.creator();
  if (creator.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Only creator (${creator}) can request resolution. You are ${signer.address}`);
  }

  // Check status
  const status = await bet.status();
  const statusNames = ["ACTIVE", "RESOLVING", "RESOLVED", "UNDETERMINED"];
  console.log(`  Current status: ${statusNames[Number(status)]}`);

  if (status !== 0n) {
    throw new Error(`Bet must be ACTIVE to request resolution. Current: ${statusNames[Number(status)]}`);
  }

  // Check end date
  const endDate = await bet.endDate();
  const now = Math.floor(Date.now() / 1000);
  console.log(`  End date: ${new Date(Number(endDate) * 1000).toISOString()}`);
  console.log(`  Now: ${new Date(now * 1000).toISOString()}`);

  if (now < Number(endDate)) {
    const remaining = Number(endDate) - now;
    console.log(`\nCannot resolve yet! ${remaining} seconds remaining until end date.`);
    throw new Error(`Wait ${remaining} more seconds`);
  }

  // Get factory to listen for event
  const factoryAddress = await bet.factory();
  const factory = await ethers.getContractAt("BetFactoryCOFI", factoryAddress);

  console.log(`\nCalling resolve()...`);
  const tx = await bet.resolve();
  console.log(`Transaction: ${tx.hash}`);

  const receipt = await tx.wait();
  console.log(`\nResolution requested successfully!`);

  // Parse ResolutionRequested event from factory
  const resolutionEvent = receipt?.logs.find((log: any) => {
    try {
      const parsed = factory.interface.parseLog({ topics: log.topics as string[], data: log.data });
      return parsed?.name === "ResolutionRequested";
    } catch {
      return false;
    }
  });

  if (resolutionEvent) {
    const parsed = factory.interface.parseLog({
      topics: resolutionEvent.topics as string[],
      data: resolutionEvent.data
    });

    // Event format: (betContract, creator, resolutionType, title, sideAName, sideBName, resolutionData, timestamp)
    console.log(`\n========== ResolutionRequested Event ==========`);
    console.log(`  Bet Contract: ${parsed?.args[0]}`);
    console.log(`  Creator: ${parsed?.args[1]}`);
    console.log(`  Resolution Type: ${parsed?.args[2]} (${["CRYPTO", "STOCKS", "NEWS"][Number(parsed?.args[2])]})`);
    console.log(`  Title: ${parsed?.args[3]}`);
    console.log(`  Side A: ${parsed?.args[4]}`);
    console.log(`  Side B: ${parsed?.args[5]}`);
    console.log(`  Timestamp: ${parsed?.args[7]}`);

    // Decode resolution data
    const resolutionData = parsed?.args[6];
    console.log(`  Resolution Data (raw): ${resolutionData}`);

    if (resolutionData && resolutionData !== "0x") {
      const abiCoder = AbiCoder.defaultAbiCoder();
      try {
        const [param1, param2] = abiCoder.decode(["string", "string"], resolutionData);
        console.log(`  Resolution Data (decoded):`);
        console.log(`    - Token/Stock Symbol: ${param1}`);
        console.log(`    - Token/Company Name: ${param2}`);
      } catch (e) {
        console.log(`  (Could not decode resolution data)`);
      }
    }
    console.log(`================================================`);
  }

  // Show new status
  const newStatus = await bet.status();
  console.log(`\nNew status: ${statusNames[Number(newStatus)]}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
