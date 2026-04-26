import { ethers } from "hardhat";

async function main() {
  const usdlAddress = process.env.USDL_ADDRESS;
  const recipient = process.env.RECIPIENT;
  const amount = process.env.AMOUNT || "1000";

  if (!usdlAddress || !recipient) {
    console.log("Usage: USDL_ADDRESS=0x... RECIPIENT=0x... [AMOUNT=1000] npx hardhat run scripts/mint-usdl.ts --network seismic");
    throw new Error("Missing required env vars: USDL_ADDRESS, RECIPIENT");
  }

  const usdl = await ethers.getContractAt("MockUSDL", usdlAddress);

  console.log(`Minting ${amount} USDL to ${recipient}`);
  const tx = await usdl.mint(recipient, ethers.parseUnits(amount, 6));
  console.log("Tx hash:", tx.hash);
  await tx.wait();
  console.log("âœ… Minted!");

  const balance = await usdl.balanceOf(recipient);
  console.log("New balance:", ethers.formatUnits(balance, 6), "USDL");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
