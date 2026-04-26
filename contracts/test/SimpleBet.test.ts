import { expect } from "chai";
import { ethers } from "hardhat";
import { BetCOFI, BetFactoryCOFI } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("BetCOFI", function () {
  let factory: BetFactoryCOFI;
  let bet: BetCOFI;
  let usdc: any;
  let deployer: SignerWithAddress;
  let creator: SignerWithAddress;
  let bettor1: SignerWithAddress;
  let bettor2: SignerWithAddress;
  let bettor3: SignerWithAddress;
  let bridgeReceiver: SignerWithAddress;

  const USDC_AMOUNT = (amount: number) => ethers.parseUnits(amount.toString(), 6);
  const TITLE = "Will ETH reach $5000?";
  const RESOLUTION_CRITERIA = "Based on CoinMarketCap price";
  const SIDE_A = "Yes";
  const SIDE_B = "No";

  // Helper to create a bet through the factory
  async function createBet(endDateOffset: number = 7 * 24 * 60 * 60): Promise<string> {
    const currentTime = await time.latest();
    const endDate = currentTime + endDateOffset;

    const tx = await factory.connect(creator).createBet(
      TITLE,
      RESOLUTION_CRITERIA,
      SIDE_A,
      SIDE_B,
      endDate,
      0, // CRYPTO
      "0x"
    );
    const receipt = await tx.wait();

    const event = receipt?.logs.find(
      (log) => {
        try {
          return factory.interface.parseLog(log as any)?.name === "BetCreated";
        } catch {
          return false;
        }
      }
    );
    return factory.interface.parseLog(event as any)?.args[0];
  }

  // Helper to simulate bridge resolution
  async function simulateBridgeResolution(
    betAddress: string,
    sideAWins: boolean,
    isUndetermined: boolean = false,
    priceValue: bigint = 0n,
    winnerValue: string = ""
  ) {
    const resolutionData = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "bool", "bool", "uint256", "bytes32", "uint256", "string"],
      [betAddress, sideAWins, isUndetermined, Math.floor(Date.now() / 1000), ethers.ZeroHash, priceValue, winnerValue]
    );
    const message = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "bytes"],
      [betAddress, resolutionData]
    );
    await factory.connect(bridgeReceiver).processBridgeMessage(0, ethers.ZeroAddress, message);
  }

  beforeEach(async function () {
    [deployer, creator, bettor1, bettor2, bettor3, bridgeReceiver] = await ethers.getSigners();

    // Deploy MockUSDL
    try {
      const MockUSDL = await ethers.getContractFactory("MockUSDL");
      usdc = await MockUSDL.deploy();
    } catch {
      this.skip();
    }
    await usdc.waitForDeployment();

    // Mint USDC to test accounts
    await usdc.mint(bettor1.address, USDC_AMOUNT(10000));
    await usdc.mint(bettor2.address, USDC_AMOUNT(10000));
    await usdc.mint(bettor3.address, USDC_AMOUNT(10000));

    // Deploy BetFactoryCOFI
    const BetFactoryCOFI = await ethers.getContractFactory("BetFactoryCOFI");
    factory = await BetFactoryCOFI.deploy(await usdc.getAddress());
    await factory.waitForDeployment();

    // Approve creator and set bridge receiver
    await factory.setCreatorApproval(creator.address, true);
    await factory.setBridgeReceiver(bridgeReceiver.address);

    // Create a bet for testing
    const betAddress = await createBet();
    bet = await ethers.getContractAt("BetCOFI", betAddress) as BetCOFI;
  });

  describe("Deployment", function () {
    it("Should set the correct creator", async function () {
      expect(await bet.creator()).to.equal(creator.address);
    });

    it("Should set the correct bet details", async function () {
      expect(await bet.title()).to.equal(TITLE);
      expect(await bet.resolutionCriteria()).to.equal(RESOLUTION_CRITERIA);
      expect(await bet.sideAName()).to.equal(SIDE_A);
      expect(await bet.sideBName()).to.equal(SIDE_B);
    });

    it("Should set status to ACTIVE", async function () {
      expect(await bet.status()).to.equal(0); // ACTIVE
    });

    it("Should not be resolved initially", async function () {
      expect(await bet.isResolved()).to.be.false;
    });

    it("Should set the factory as owner", async function () {
      expect(await bet.factory()).to.equal(await factory.getAddress());
    });
  });

  describe("Betting via Factory", function () {
    it("Should only allow factory to call betOnSideAViaFactory", async function () {
      await expect(
        bet.connect(bettor1).betOnSideAViaFactory(bettor1.address, USDC_AMOUNT(100))
      ).to.be.revertedWith("Only factory can call");
    });

    it("Should only allow factory to call betOnSideBViaFactory", async function () {
      await expect(
        bet.connect(bettor1).betOnSideBViaFactory(bettor1.address, USDC_AMOUNT(100))
      ).to.be.revertedWith("Only factory can call");
    });

    it("Should accumulate bets correctly on side A", async function () {
      const bet1 = USDC_AMOUNT(100);
      const bet2 = USDC_AMOUNT(50);

      await usdc.connect(bettor1).approve(await factory.getAddress(), bet1 + bet2);
      await factory.connect(bettor1).placeBet(await bet.getAddress(), true, bet1);
      await factory.connect(bettor1).placeBet(await bet.getAddress(), true, bet2);

      expect(await bet.betsOnSideA(bettor1.address)).to.equal(bet1 + bet2);
      expect(await bet.totalSideA()).to.equal(bet1 + bet2);
    });

    it("Should accumulate bets correctly on side B", async function () {
      const betAmount = USDC_AMOUNT(100);

      await usdc.connect(bettor2).approve(await factory.getAddress(), betAmount);
      await factory.connect(bettor2).placeBet(await bet.getAddress(), false, betAmount);

      expect(await bet.betsOnSideB(bettor2.address)).to.equal(betAmount);
      expect(await bet.totalSideB()).to.equal(betAmount);
    });

    it("Should allow same user to bet on both sides", async function () {
      const betA = USDC_AMOUNT(100);
      const betB = USDC_AMOUNT(50);

      await usdc.connect(bettor1).approve(await factory.getAddress(), betA + betB);
      await factory.connect(bettor1).placeBet(await bet.getAddress(), true, betA);
      await factory.connect(bettor1).placeBet(await bet.getAddress(), false, betB);

      expect(await bet.betsOnSideA(bettor1.address)).to.equal(betA);
      expect(await bet.betsOnSideB(bettor1.address)).to.equal(betB);
    });

    it("Should reject bets after endDate", async function () {
      const endDate = await bet.endDate();
      await time.increaseTo(endDate + 1n);

      const betAmount = USDC_AMOUNT(100);
      await usdc.connect(bettor1).approve(await factory.getAddress(), betAmount);

      await expect(
        factory.connect(bettor1).placeBet(await bet.getAddress(), true, betAmount)
      ).to.be.revertedWith("Betting has ended");
    });

    it("Should emit BetPlacedOnA event", async function () {
      const betAmount = USDC_AMOUNT(100);
      await usdc.connect(bettor1).approve(await factory.getAddress(), betAmount);

      await expect(factory.connect(bettor1).placeBet(await bet.getAddress(), true, betAmount))
        .to.emit(bet, "BetPlacedOnA")
        .withArgs(bettor1.address, betAmount);
    });

    it("Should emit BetPlacedOnB event", async function () {
      const betAmount = USDC_AMOUNT(100);
      await usdc.connect(bettor1).approve(await factory.getAddress(), betAmount);

      await expect(factory.connect(bettor1).placeBet(await bet.getAddress(), false, betAmount))
        .to.emit(bet, "BetPlacedOnB")
        .withArgs(bettor1.address, betAmount);
    });
  });

  describe("Resolution Request", function () {
    beforeEach(async function () {
      // Place some bets
      const betAmount = USDC_AMOUNT(100);
      await usdc.connect(bettor1).approve(await factory.getAddress(), betAmount);
      await factory.connect(bettor1).placeBet(await bet.getAddress(), true, betAmount);
    });

    it("Should only allow creator to call resolve()", async function () {
      const endDate = await bet.endDate();
      await time.increaseTo(endDate + 1n);

      await expect(
        bet.connect(bettor1).resolve()
      ).to.be.revertedWith("Only creator can resolve");
    });

    it("Should not allow resolve before endDate", async function () {
      await expect(
        bet.connect(creator).resolve()
      ).to.be.revertedWith("Cannot resolve before end date");
    });

    it("Should set status to RESOLVING", async function () {
      const endDate = await bet.endDate();
      await time.increaseTo(endDate + 1n);

      await bet.connect(creator).resolve();

      expect(await bet.status()).to.equal(1); // RESOLVING
    });

    it("Should emit ResolutionRequested event from factory", async function () {
      const endDate = await bet.endDate();
      await time.increaseTo(endDate + 1n);

      await expect(bet.connect(creator).resolve())
        .to.emit(factory, "ResolutionRequested");
    });

    it("Should not allow resolve twice", async function () {
      const endDate = await bet.endDate();
      await time.increaseTo(endDate + 1n);

      await bet.connect(creator).resolve();

      await expect(
        bet.connect(creator).resolve()
      ).to.be.revertedWith("Bet not active");
    });
  });

  describe("setResolution (from bridge)", function () {
    beforeEach(async function () {
      // Place bets on both sides
      await usdc.connect(bettor1).approve(await factory.getAddress(), USDC_AMOUNT(100));
      await usdc.connect(bettor2).approve(await factory.getAddress(), USDC_AMOUNT(100));
      await factory.connect(bettor1).placeBet(await bet.getAddress(), true, USDC_AMOUNT(100));
      await factory.connect(bettor2).placeBet(await bet.getAddress(), false, USDC_AMOUNT(100));

      // Advance time and request resolution
      const endDate = await bet.endDate();
      await time.increaseTo(endDate + 1n);
      await bet.connect(creator).resolve();
    });

    it("Should only allow factory to call setResolution", async function () {
      const resolutionData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "bool", "bool", "uint256", "bytes32", "uint256", "string"],
        [await bet.getAddress(), true, false, Math.floor(Date.now() / 1000), ethers.ZeroHash, 0n, ""]
      );

      await expect(
        bet.connect(bettor1).setResolution(resolutionData)
      ).to.be.revertedWith("Only factory can dispatch");
    });

    it("Should set RESOLVED when side A wins with bets", async function () {
      await simulateBridgeResolution(await bet.getAddress(), true, false);

      expect(await bet.status()).to.equal(2); // RESOLVED
      expect(await bet.isResolved()).to.be.true;
      expect(await bet.isSideAWinner()).to.be.true;
    });

    it("Should set RESOLVED when side B wins with bets", async function () {
      await simulateBridgeResolution(await bet.getAddress(), false, false);

      expect(await bet.status()).to.equal(2); // RESOLVED
      expect(await bet.isResolved()).to.be.true;
      expect(await bet.isSideAWinner()).to.be.false;
    });

    it("Should emit BetResolved event", async function () {
      const resolutionData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "bool", "bool", "uint256", "bytes32", "uint256", "string"],
        [await bet.getAddress(), true, false, Math.floor(Date.now() / 1000), ethers.ZeroHash, 6500050n, "Yes"]
      );
      const message = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "bytes"],
        [await bet.getAddress(), resolutionData]
      );
      await expect(factory.connect(bridgeReceiver).processBridgeMessage(0, ethers.ZeroAddress, message))
        .to.emit(bet, "BetResolved");
    });

    it("Should set UNDETERMINED when oracle returns undetermined", async function () {
      await simulateBridgeResolution(await bet.getAddress(), false, true);

      expect(await bet.status()).to.equal(3); // UNDETERMINED
      expect(await bet.isResolved()).to.be.true;
    });

    it("Should emit BetUndetermined event when undetermined", async function () {
      const betAddress = await bet.getAddress();
      const resolutionData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "bool", "bool", "uint256", "bytes32", "uint256", "string"],
        [betAddress, false, true, Math.floor(Date.now() / 1000), ethers.ZeroHash, 0n, ""]
      );
      const message = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "bytes"],
        [betAddress, resolutionData]
      );

      await expect(factory.connect(bridgeReceiver).processBridgeMessage(0, ethers.ZeroAddress, message))
        .to.emit(bet, "BetUndetermined");
    });
  });

  describe("setResolution - Empty winner side refunds losers", function () {
    it("Should set RESOLVED and allow loser refund when side A wins but has no bets", async function () {
      // Only bet on side B
      await usdc.connect(bettor2).approve(await factory.getAddress(), USDC_AMOUNT(100));
      await factory.connect(bettor2).placeBet(await bet.getAddress(), false, USDC_AMOUNT(100));

      const endDate = await bet.endDate();
      await time.increaseTo(endDate + 1n);
      await bet.connect(creator).resolve();

      // Oracle says side A wins, but no one bet on A
      await simulateBridgeResolution(await bet.getAddress(), true, false);

      expect(await bet.status()).to.equal(2); // RESOLVED (not UNDETERMINED)
      expect(await bet.isSideAWinner()).to.be.true;

      // Side B loser can claim refund since no winners exist
      const balanceBefore = await usdc.balanceOf(bettor2.address);
      await bet.connect(bettor2).claim();
      const balanceAfter = await usdc.balanceOf(bettor2.address);
      expect(balanceAfter - balanceBefore).to.equal(USDC_AMOUNT(100)); // Full refund
    });

    it("Should set RESOLVED and allow loser refund when side B wins but has no bets", async function () {
      // Only bet on side A
      await usdc.connect(bettor1).approve(await factory.getAddress(), USDC_AMOUNT(100));
      await factory.connect(bettor1).placeBet(await bet.getAddress(), true, USDC_AMOUNT(100));

      const endDate = await bet.endDate();
      await time.increaseTo(endDate + 1n);
      await bet.connect(creator).resolve();

      // Oracle says side B wins, but no one bet on B
      await simulateBridgeResolution(await bet.getAddress(), false, false);

      expect(await bet.status()).to.equal(2); // RESOLVED (not UNDETERMINED)
      expect(await bet.isSideAWinner()).to.be.false;

      // Side A loser can claim refund since no winners exist
      const balanceBefore = await usdc.balanceOf(bettor1.address);
      await bet.connect(bettor1).claim();
      const balanceAfter = await usdc.balanceOf(bettor1.address);
      expect(balanceAfter - balanceBefore).to.equal(USDC_AMOUNT(100)); // Full refund
    });
  });

  describe("Claiming Winnings", function () {
    beforeEach(async function () {
      // Bettor1: 200 on A, Bettor2: 100 on B
      await usdc.connect(bettor1).approve(await factory.getAddress(), USDC_AMOUNT(200));
      await usdc.connect(bettor2).approve(await factory.getAddress(), USDC_AMOUNT(100));
      await factory.connect(bettor1).placeBet(await bet.getAddress(), true, USDC_AMOUNT(200));
      await factory.connect(bettor2).placeBet(await bet.getAddress(), false, USDC_AMOUNT(100));

      // Resolve with side A winning
      const endDate = await bet.endDate();
      await time.increaseTo(endDate + 1n);
      await bet.connect(creator).resolve();
      await simulateBridgeResolution(await bet.getAddress(), true, false);
    });

    it("Should allow winner to claim proportional winnings", async function () {
      const balanceBefore = await usdc.balanceOf(bettor1.address);

      await bet.connect(bettor1).claim();

      const balanceAfter = await usdc.balanceOf(bettor1.address);
      // Bettor1 bet 200 on A, wins A. Gets back 200 + all of B's 100 = 300
      expect(balanceAfter - balanceBefore).to.equal(USDC_AMOUNT(300));
    });

    it("Should emit WinningsClaimed event", async function () {
      await expect(bet.connect(bettor1).claim())
        .to.emit(bet, "WinningsClaimed")
        .withArgs(bettor1.address, USDC_AMOUNT(300));
    });

    it("Should not allow loser to claim", async function () {
      await expect(
        bet.connect(bettor2).claim()
      ).to.be.revertedWith("No winning bet to claim");
    });

    it("Should not allow claiming twice", async function () {
      await bet.connect(bettor1).claim();

      await expect(
        bet.connect(bettor1).claim()
      ).to.be.revertedWith("Already claimed");
    });

    it("Should not allow claiming before resolution", async function () {
      // Create a new bet that's not resolved
      const betAddress = await createBet();
      const newBet = await ethers.getContractAt("BetCOFI", betAddress) as BetCOFI;

      await expect(
        newBet.connect(bettor1).claim()
      ).to.be.revertedWith("Bet not resolved yet");
    });
  });

  describe("UNDETERMINED Refund Flow", function () {
    beforeEach(async function () {
      // Both bettors place bets
      await usdc.connect(bettor1).approve(await factory.getAddress(), USDC_AMOUNT(200));
      await usdc.connect(bettor2).approve(await factory.getAddress(), USDC_AMOUNT(100));
      await factory.connect(bettor1).placeBet(await bet.getAddress(), true, USDC_AMOUNT(200));
      await factory.connect(bettor2).placeBet(await bet.getAddress(), false, USDC_AMOUNT(100));

      // Resolve as UNDETERMINED
      const endDate = await bet.endDate();
      await time.increaseTo(endDate + 1n);
      await bet.connect(creator).resolve();
      await simulateBridgeResolution(await bet.getAddress(), false, true);
    });

    it("Should allow all bettors to get refund when UNDETERMINED", async function () {
      const balance1Before = await usdc.balanceOf(bettor1.address);
      const balance2Before = await usdc.balanceOf(bettor2.address);

      await bet.connect(bettor1).claim();
      await bet.connect(bettor2).claim();

      const balance1After = await usdc.balanceOf(bettor1.address);
      const balance2After = await usdc.balanceOf(bettor2.address);

      // Each gets back exactly what they bet
      expect(balance1After - balance1Before).to.equal(USDC_AMOUNT(200));
      expect(balance2After - balance2Before).to.equal(USDC_AMOUNT(100));
    });
  });

  describe("Proportional Winnings Calculation", function () {
    it("Should distribute winnings proportionally among multiple winners", async function () {
      // Bettor1: 200 on A, Bettor2: 100 on A, Bettor3: 300 on B
      await usdc.connect(bettor1).approve(await factory.getAddress(), USDC_AMOUNT(200));
      await usdc.connect(bettor2).approve(await factory.getAddress(), USDC_AMOUNT(100));
      await usdc.connect(bettor3).approve(await factory.getAddress(), USDC_AMOUNT(300));

      await factory.connect(bettor1).placeBet(await bet.getAddress(), true, USDC_AMOUNT(200));
      await factory.connect(bettor2).placeBet(await bet.getAddress(), true, USDC_AMOUNT(100));
      await factory.connect(bettor3).placeBet(await bet.getAddress(), false, USDC_AMOUNT(300));

      // Side A wins
      const endDate = await bet.endDate();
      await time.increaseTo(endDate + 1n);
      await bet.connect(creator).resolve();
      await simulateBridgeResolution(await bet.getAddress(), true, false);

      const balance1Before = await usdc.balanceOf(bettor1.address);
      const balance2Before = await usdc.balanceOf(bettor2.address);

      await bet.connect(bettor1).claim();
      await bet.connect(bettor2).claim();

      const balance1After = await usdc.balanceOf(bettor1.address);
      const balance2After = await usdc.balanceOf(bettor2.address);

      // Bettor1: 200 + (200/300 * 300) = 200 + 200 = 400
      // Bettor2: 100 + (100/300 * 300) = 100 + 100 = 200
      expect(balance1After - balance1Before).to.equal(USDC_AMOUNT(400));
      expect(balance2After - balance2Before).to.equal(USDC_AMOUNT(200));
    });
  });

  describe("Cancellation Timeout", function () {
    beforeEach(async function () {
      // Place bets
      await usdc.connect(bettor1).approve(await factory.getAddress(), USDC_AMOUNT(100));
      await factory.connect(bettor1).placeBet(await bet.getAddress(), true, USDC_AMOUNT(100));

      // Request resolution
      const endDate = await bet.endDate();
      await time.increaseTo(endDate + 1n);
      await bet.connect(creator).resolve();
    });

    it("Should not allow cancel before timeout", async function () {
      await expect(
        bet.connect(creator).cancelBet()
      ).to.be.revertedWith("Timeout not reached");
    });

    it("Should allow creator to cancel after RESOLUTION_TIMEOUT (7 days)", async function () {
      // Advance 7 days + 1 second
      await time.increase(7 * 24 * 60 * 60 + 1);

      await expect(bet.connect(creator).cancelBet())
        .to.emit(bet, "BetUndetermined");

      expect(await bet.status()).to.equal(3); // UNDETERMINED
      expect(await bet.isResolved()).to.be.true;
    });

    it("Should only allow creator to cancel", async function () {
      await time.increase(7 * 24 * 60 * 60 + 1);

      await expect(
        bet.connect(bettor1).cancelBet()
      ).to.be.revertedWith("Only creator can cancel");
    });

    it("Should allow refunds after cancellation", async function () {
      await time.increase(7 * 24 * 60 * 60 + 1);
      await bet.connect(creator).cancelBet();

      const balanceBefore = await usdc.balanceOf(bettor1.address);
      await bet.connect(bettor1).claim();
      const balanceAfter = await usdc.balanceOf(bettor1.address);

      expect(balanceAfter - balanceBefore).to.equal(USDC_AMOUNT(100));
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await usdc.connect(bettor1).approve(await factory.getAddress(), USDC_AMOUNT(150));
      await factory.connect(bettor1).placeBet(await bet.getAddress(), true, USDC_AMOUNT(100));
      await factory.connect(bettor1).placeBet(await bet.getAddress(), false, USDC_AMOUNT(50));
    });

    it("Should return correct info via getInfo()", async function () {
      const info = await bet.getInfo();

      expect(info._creator).to.equal(creator.address);
      expect(info._title).to.equal(TITLE);
      expect(info._resolutionCriteria).to.equal(RESOLUTION_CRITERIA);
      expect(info._sideAName).to.equal(SIDE_A);
      expect(info._sideBName).to.equal(SIDE_B);
      expect(info._isResolved).to.be.false;
      expect(info._totalSideA).to.equal(USDC_AMOUNT(100));
      expect(info._totalSideB).to.equal(USDC_AMOUNT(50));
    });

    it("Should return correct user bets", async function () {
      const [onSideA, onSideB] = await bet.getUserBets(bettor1.address);

      expect(onSideA).to.equal(USDC_AMOUNT(100));
      expect(onSideB).to.equal(USDC_AMOUNT(50));
    });

    it("Should calculate potential winnings correctly", async function () {
      // Add another bettor
      await usdc.connect(bettor2).approve(await factory.getAddress(), USDC_AMOUNT(100));
      await factory.connect(bettor2).placeBet(await bet.getAddress(), false, USDC_AMOUNT(100));

      // Now: Side A = 100, Side B = 150
      const [ifAWins, ifBWins] = await bet.calculatePotentialWinnings(bettor1.address);

      // If A wins: bettor1 gets 100 + all of B (150) = 250
      expect(ifAWins).to.equal(USDC_AMOUNT(250));

      // If B wins: bettor1 gets (50/150) * 100 + 50 = 33.33 + 50 ≈ 83
      // But due to integer division: (50 * 100) / 150 = 33, so 50 + 33 = 83
      expect(ifBWins).to.equal(USDC_AMOUNT(50) + (USDC_AMOUNT(50) * 100n / 150n));
    });
  });
});
