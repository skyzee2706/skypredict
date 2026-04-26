import { ethers } from "hardhat";

async function main() {
  console.log("Configuring BetFactoryCOFI...\n");

  const [signer] = await ethers.getSigners();
  console.log(`Configuring from address: ${signer.address}`);

  // Get addresses from environment variables
  const factoryAddress = process.env.FACTORY_ADDRESS;
  const bridgeReceiverAddress = process.env.BRIDGE_RECEIVER_ADDRESS;

  if (!factoryAddress) {
    throw new Error("FACTORY_ADDRESS environment variable not set!");
  }

  if (!bridgeReceiverAddress) {
    throw new Error("BRIDGE_RECEIVER_ADDRESS environment variable not set!");
  }

  console.log("\nConfiguration:");
  console.log(`  Factory: ${factoryAddress}`);
  console.log(`  Bridge Receiver: ${bridgeReceiverAddress}`);

  // Get the factory contract
  const factory = await ethers.getContractAt("BetFactoryCOFI", factoryAddress);

  // Check current bridge receiver
  const currentBridgeReceiver = await factory.bridgeReceiver();
  console.log(`\nCurrent bridge receiver: ${currentBridgeReceiver}`);

  if (currentBridgeReceiver.toLowerCase() === bridgeReceiverAddress.toLowerCase()) {
    console.log("\n Bridge receiver already set to this address!");
    return;
  }

  // Set bridge receiver
  console.log("\nSetting bridge receiver...");
  const tx = await factory.setBridgeReceiver(bridgeReceiverAddress);
  console.log(`Transaction sent: ${tx.hash}`);

  await tx.wait();

  console.log(`\n Bridge receiver set successfully!`);

  // Verify
  const newBridgeReceiver = await factory.bridgeReceiver();
  console.log(`Verified: bridgeReceiver = ${newBridgeReceiver}`);

  console.log("\n Next steps:");
  console.log("1. Configure BridgeReceiver to trust BridgeForwarder on zkSync:");
  console.log("   bridgeReceiver.setTrustedForwarder(zkSyncEid, bridgeForwarderAddress)");
  console.log("\n2. Configure BridgeForwarder to send to this BridgeReceiver:");
  console.log("   bridgeForwarder.setBridgeAddress(baseEid, bridgeReceiverAddress)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
