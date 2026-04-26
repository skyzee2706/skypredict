import { ethers } from "hardhat";
import { AbiCoder } from "ethers";

async function main() {
  const betAddress = process.env.BET_ADDRESS;

  if (!betAddress) {
    console.log("Usage: BET_ADDRESS=0x... npx hardhat run scripts/testing/get-bet-info.ts --network seismic");
    throw new Error("Missing required env var: BET_ADDRESS");
  }

  console.log(`\n========== Bet Info ==========`);
  console.log(`Address: ${betAddress}`);

  const bet = await ethers.getContractAt("BetCOFI", betAddress);

  // Get basic info
  const info = await bet.getInfo();
  const [
    creator,
    title,
    resolutionCriteria,
    sideAName,
    sideBName,
    creationDate,
    endDate,
    isResolved,
    isSideAWinner,
    totalSideA,
    totalSideB
  ] = info;

  // Get additional state
  const status = await bet.status();
  const resolutionType = await bet.resolutionType();
  const resolutionData = await bet.resolutionData();
  const factory = await bet.factory();

  const statusNames = ["ACTIVE", "RESOLVING", "RESOLVED", "UNDETERMINED"];
  const resolutionTypeNames = ["CRYPTO", "STOCKS", "NEWS"];

  console.log(`\n--- Metadata ---`);
  console.log(`  Title: ${title}`);
  console.log(`  Resolution Criteria: ${resolutionCriteria}`);
  console.log(`  Side A: ${sideAName}`);
  console.log(`  Side B: ${sideBName}`);
  console.log(`  Creator: ${creator}`);
  console.log(`  Factory: ${factory}`);

  console.log(`\n--- Resolution Config ---`);
  console.log(`  Type: ${resolutionTypeNames[Number(resolutionType)]} (${resolutionType})`);
  console.log(`  Data (raw): ${resolutionData}`);

  if (resolutionData && resolutionData !== "0x") {
    const abiCoder = AbiCoder.defaultAbiCoder();
    try {
      const [param1, param2] = abiCoder.decode(["string", "string"], resolutionData);
      console.log(`  Data (decoded): [${param1}, ${param2}]`);
    } catch (e) {
      // ignore
    }
  }

  console.log(`\n--- Dates ---`);
  console.log(`  Created: ${new Date(Number(creationDate) * 1000).toISOString()}`);
  console.log(`  End Date: ${new Date(Number(endDate) * 1000).toISOString()}`);

  const now = Math.floor(Date.now() / 1000);
  if (now < Number(endDate)) {
    const remaining = Number(endDate) - now;
    console.log(`  Time until end: ${remaining} seconds (${(remaining / 60).toFixed(1)} minutes)`);
  } else {
    console.log(`  Betting ended: ${now - Number(endDate)} seconds ago`);
  }

  console.log(`\n--- Status ---`);
  console.log(`  Status: ${statusNames[Number(status)]}`);
  console.log(`  Is Resolved: ${isResolved}`);
  if (isResolved && status === 2n) {
    console.log(`  Winner: Side ${isSideAWinner ? "A" : "B"} (${isSideAWinner ? sideAName : sideBName})`);
  }

  console.log(`\n--- Pools ---`);
  console.log(`  Total Side A: ${totalSideA} (${Number(totalSideA) / 1e6} USDC)`);
  console.log(`  Total Side B: ${totalSideB} (${Number(totalSideB) / 1e6} USDC)`);
  const total = Number(totalSideA) + Number(totalSideB);
  console.log(`  Total Pool: ${total} (${total / 1e6} USDC)`);

  if (total > 0) {
    const pctA = (Number(totalSideA) / total * 100).toFixed(1);
    const pctB = (Number(totalSideB) / total * 100).toFixed(1);
    console.log(`  Distribution: ${pctA}% A / ${pctB}% B`);
  }

  console.log(`\n==============================\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
