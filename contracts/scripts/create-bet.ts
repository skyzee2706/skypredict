import { ethers } from "hardhat";
import { AbiCoder } from "ethers";

// Resolution types matching BetCOFI.ResolutionType enum
const ResolutionType = {
  CRYPTO: 0,
  STOCKS: 1,
  NEWS: 2,
} as const;

// Helper to encode resolution data based on type
function encodeResolutionData(resolutionType: number): string {
  const abiCoder = AbiCoder.defaultAbiCoder();

  switch (resolutionType) {
    case ResolutionType.CRYPTO:
      // CRYPTO: (tokenSymbol, tokenName) - for CoinMarketCap lookup
      const tokenSymbol = process.env.TOKEN_SYMBOL || "BTC";
      const tokenName = process.env.TOKEN_NAME || "bitcoin";
      return abiCoder.encode(["string", "string"], [tokenSymbol, tokenName]);

    case ResolutionType.STOCKS:
      // STOCKS: (stockSymbol, companyName) - for stock price lookup
      const stockSymbol = process.env.STOCK_SYMBOL || "AAPL";
      const companyName = process.env.COMPANY_NAME || "apple";
      return abiCoder.encode(["string", "string"], [stockSymbol, companyName]);

    case ResolutionType.NEWS:
      // NEWS: (newsSource, keywords) - for news resolution
      const newsSource = process.env.NEWS_SOURCE || "";
      const keywords = process.env.NEWS_KEYWORDS || "";
      return abiCoder.encode(["string", "string"], [newsSource, keywords]);

    default:
      return "0x";
  }
}

async function main() {
  console.log("Creating a new bet via BetFactoryCOFI...\n");

  const [signer] = await ethers.getSigners();
  console.log(`Creating from address: ${signer.address}`);

  // Get factory address from environment variable
  const factoryAddress = process.env.FACTORY_ADDRESS;

  if (!factoryAddress) {
    throw new Error("FACTORY_ADDRESS environment variable not set!");
  }

  // Bet parameters - customize these
  const resolutionType = process.env.RESOLUTION_TYPE
    ? parseInt(process.env.RESOLUTION_TYPE)
    : ResolutionType.CRYPTO;

  const betParams = {
    title: process.env.BET_TITLE || "Will BTC reach $150k by end of 2025?",
    resolutionCriteria: process.env.RESOLUTION_CRITERIA || "This bet resolves to YES if BTC price reaches $150,000 USD at any point before the end date.",
    sideAName: process.env.SIDE_A_NAME || "Yes",
    sideBName: process.env.SIDE_B_NAME || "No",
    // End date: 7 days from now by default
    endDate: process.env.END_DATE
      ? parseInt(process.env.END_DATE)
      : Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60),
    resolutionType,
    resolutionData: encodeResolutionData(resolutionType),
  };

  console.log("\nBet Configuration:");
  console.log(`  Factory: ${factoryAddress}`);
  console.log(`  Title: ${betParams.title}`);
  console.log(`  Resolution Criteria: ${betParams.resolutionCriteria}`);
  console.log(`  Side A: ${betParams.sideAName}`);
  console.log(`  Side B: ${betParams.sideBName}`);
  console.log(`  End Date: ${new Date(betParams.endDate * 1000).toISOString()}`);
  console.log(`  Resolution Type: ${Object.keys(ResolutionType)[betParams.resolutionType]} (${betParams.resolutionType})`);
  console.log(`  Resolution Data: ${betParams.resolutionData}`);

  // Get the factory contract
  const factory = await ethers.getContractAt("BetFactoryCOFI", factoryAddress);

  // Create the bet
  console.log("\nCreating bet...");
  const tx = await factory.createBet(
    betParams.title,
    betParams.resolutionCriteria,
    betParams.sideAName,
    betParams.sideBName,
    betParams.endDate,
    betParams.resolutionType,
    betParams.resolutionData
  );

  console.log(`Transaction sent: ${tx.hash}`);

  const receipt = await tx.wait();

  // Get bet address from BetCreated event
  const betCreatedEvent = receipt?.logs.find((log: any) => {
    try {
      const parsed = factory.interface.parseLog({ topics: log.topics as string[], data: log.data });
      return parsed?.name === "BetCreated";
    } catch {
      return false;
    }
  });

  let betAddress = "";
  if (betCreatedEvent) {
    const parsed = factory.interface.parseLog({
      topics: betCreatedEvent.topics as string[],
      data: betCreatedEvent.data
    });
    betAddress = parsed?.args[0];
  }

  console.log(`\n Bet created successfully!`);
  console.log(`   Bet address: ${betAddress}`);
  console.log(`   Creator: ${signer.address}`);
  console.log(`   Transaction: ${tx.hash}`);

  // Get bet count
  const betCount = await factory.getBetCount();
  console.log(`\nTotal bets in factory: ${betCount}`);

  console.log("\n Next steps:");
  console.log("1. Users can place bets via factory.placeBet(betAddress, onSideA, amount)");
  console.log("2. After end date, creator calls bet.resolve() to request resolution");
  console.log("3. GenLayer oracle sends resolution via bridge");
  console.log("4. Winners call bet.claim() to collect winnings");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
