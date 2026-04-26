import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("Generating new wallet...\n");

  // Create a new random wallet
  const wallet = ethers.Wallet.createRandom();

  const walletInfo = `
========================================
NEW ETHEREUM WALLET
========================================

Address: ${wallet.address}

Private Key: ${wallet.privateKey}

Mnemonic Phrase:
${wallet.mnemonic?.phrase}

========================================
IMPORTANT SECURITY NOTES:
========================================
1. NEVER share your private key or mnemonic phrase with anyone
2. Store this file securely and delete it after backing up elsewhere
3. Anyone with access to this private key has full control of the wallet
4. Consider using a hardware wallet for significant funds

Generated: ${new Date().toISOString()}
========================================
`;

  // Write to wallet.txt
  const walletPath = path.join(__dirname, "..", "wallet.txt");
  fs.writeFileSync(walletPath, walletInfo);

  console.log("✅ Wallet created successfully!");
  console.log(`📄 Details saved to: ${walletPath}`);
  console.log(`\n🔑 Address: ${wallet.address}`);
  console.log(`\n⚠️  IMPORTANT: Keep wallet.txt secure and never commit it to git!`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
