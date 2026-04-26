const fs = require("fs");
const path = require("path");

// Paths
const artifactsPath = path.join(__dirname, "../artifacts/contracts");
const frontendContractsPath = path.join(
  __dirname,
  "../../frontend/lib/contracts"
);

// Create frontend contracts directory if it doesn't exist
if (!fs.existsSync(frontendContractsPath)) {
  fs.mkdirSync(frontendContractsPath, { recursive: true });
}

// Function to copy contract artifacts
function syncContract(contractName, fileName) {
  const artifactPath = path.join(
    artifactsPath,
    fileName || `${contractName}.sol`,
    `${contractName}.json`
  );

  if (!fs.existsSync(artifactPath)) {
    console.log(`⚠️  Artifact not found: ${contractName}`);
    return;
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  // Extract only what we need
  const contractData = {
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    contractName: contractName,
  };

  const outputPath = path.join(
    frontendContractsPath,
    `${contractName}.json`
  );
  fs.writeFileSync(outputPath, JSON.stringify(contractData, null, 2));

  console.log(`✅ Synced ${contractName} to frontend`);
}

// Sync all contracts
console.log("Syncing contract artifacts to frontend...\n");

syncContract("BetCOFI");
syncContract("BetFactoryCOFI");

console.log("\nDone! Contract artifacts synced.");
