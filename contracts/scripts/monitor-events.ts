import { ethers } from "hardhat";
import { AbiCoder } from "ethers";

const RESOLUTION_TYPES = ["CRYPTO", "STOCKS", "NEWS"];

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function decodeResolutionData(data: string): string {
  if (!data || data === "0x") return "(empty)";
  try {
    const abiCoder = AbiCoder.defaultAbiCoder();
    const [param1, param2] = abiCoder.decode(["string", "string"], data);
    return `[${param1}, ${param2}]`;
  } catch {
    return "(could not decode)";
  }
}

async function main() {
  const factoryAddress = process.env.FACTORY_ADDRESS;

  if (!factoryAddress) {
    console.log("Usage: FACTORY_ADDRESS=0x... npx hardhat run scripts/testing/monitor-events.ts --network seismic");
    throw new Error("Missing required env var: FACTORY_ADDRESS");
  }

  const factory = await ethers.getContractAt("BetFactoryCOFI", factoryAddress);

  console.log(`\n========================================`);
  console.log(`  Factory Event Monitor`);
  console.log(`========================================`);
  console.log(`Factory: ${factoryAddress}`);
  console.log(`Started: ${timestamp()}`);
  console.log(`\nListening for events... (Ctrl+C to stop)\n`);

  // BetCreated
  factory.on("BetCreated", (betAddress, creator, title, endDate) => {
    console.log(`[${timestamp()}] BetCreated`);
    console.log(`  Bet: ${betAddress}`);
    console.log(`  Creator: ${creator}`);
    console.log(`  Title: ${title}`);
    console.log(`  End Date: ${new Date(Number(endDate) * 1000).toISOString()}`);
    console.log();
  });

  // BetPlaced
  factory.on("BetPlaced", (betAddress, bettor, onSideA, amount) => {
    console.log(`[${timestamp()}] BetPlaced`);
    console.log(`  Bet: ${betAddress}`);
    console.log(`  Bettor: ${bettor}`);
    console.log(`  Side: ${onSideA ? "A" : "B"}`);
    console.log(`  Amount: ${amount} (${Number(amount) / 1e6} USDC)`);
    console.log();
  });

  // ResolutionRequested - THE MAIN ONE (expanded format)
  factory.on("ResolutionRequested", (betContract, creator, resolutionType, title, sideAName, sideBName, resolutionData, eventTimestamp) => {
    console.log(`[${timestamp()}] *** ResolutionRequested ***`);
    console.log(`  Bet: ${betContract}`);
    console.log(`  Creator: ${creator}`);
    console.log(`  Resolution Type: ${RESOLUTION_TYPES[Number(resolutionType)]} (${resolutionType})`);
    console.log(`  Title: ${title}`);
    console.log(`  Side A: ${sideAName}`);
    console.log(`  Side B: ${sideBName}`);
    console.log(`  Resolution Data: ${decodeResolutionData(resolutionData)}`);
    console.log(`  Timestamp: ${new Date(Number(eventTimestamp) * 1000).toISOString()}`);
    console.log();
  });

  // BetStatusChanged
  factory.on("BetStatusChanged", (betContract, oldStatus, newStatus) => {
    const STATUS_NAMES = ["ACTIVE", "RESOLVING", "RESOLVED", "UNDETERMINED"];
    console.log(`[${timestamp()}] BetStatusChanged`);
    console.log(`  Bet: ${betContract}`);
    console.log(`  Old Status: ${STATUS_NAMES[Number(oldStatus)]}`);
    console.log(`  New Status: ${STATUS_NAMES[Number(newStatus)]}`);
    console.log();
  });

  // OracleResolutionReceived
  factory.on("OracleResolutionReceived", (betContract, sourceChainId) => {
    console.log(`[${timestamp()}] OracleResolutionReceived`);
    console.log(`  Bet: ${betContract}`);
    console.log(`  Source Chain ID: ${sourceChainId}`);
    console.log();
  });

  // BridgeReceiverUpdated
  factory.on("BridgeReceiverUpdated", (oldReceiver, newReceiver) => {
    console.log(`[${timestamp()}] BridgeReceiverUpdated`);
    console.log(`  Old: ${oldReceiver}`);
    console.log(`  New: ${newReceiver}`);
    console.log();
  });

  // CreatorApprovalUpdated
  factory.on("CreatorApprovalUpdated", (creator, approved) => {
    console.log(`[${timestamp()}] CreatorApprovalUpdated`);
    console.log(`  Creator: ${creator}`);
    console.log(`  Approved: ${approved}`);
    console.log();
  });

  // Keep script running
  await new Promise(() => {});
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
