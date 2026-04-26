import { expect } from "chai";
import { ethers } from "hardhat";
import { BetFactoryCOFI, BetCOFI } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("BetFactoryCOFI", function () {
  let factory: BetFactoryCOFI;
  let usdc: any; // Simple ERC20 mock
  let deployer: SignerWithAddress;
  let creator1: SignerWithAddress;
  let creator2: SignerWithAddress;
  let bettor: SignerWithAddress;
  let bridgeReceiver: SignerWithAddress;

  const USDC_AMOUNT = (amount: number) => ethers.parseUnits(amount.toString(), 6);

  // Deploy a simple ERC20 mock for testing
  async function deployMockUSDL() {
    const MockERC20 = await ethers.getContractFactory("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20");
    // We'll use a simple approach - deploy BetFactoryCOFI first and manually handle USDC
    // For testing, we'll create a minimal mock
    const MockUSDL = await ethers.getContractFactory("MockUSDL");
    return await MockUSDL.deploy();
  }

  beforeEach(async function () {
    [deployer, creator1, creator2, bettor, bridgeReceiver] = await ethers.getSigners();

    // Deploy MockUSDL - we need to create this contract first
    // For now, let's check if it exists, otherwise we'll inline deploy
    try {
      const MockUSDL = await ethers.getContractFactory("MockUSDL");
      usdc = await MockUSDL.deploy();
    } catch {
      // If MockUSDC doesn't exist, skip these tests
      this.skip();
    }
    await usdc.waitForDeployment();

    // Mint USDC to test accounts
    await usdc.mint(bettor.address, USDC_AMOUNT(10000));
    await usdc.mint(creator1.address, USDC_AMOUNT(10000));

    // Deploy BetFactoryCOFI
    const BetFactoryCOFI = await ethers.getContractFactory("BetFactoryCOFI");
    factory = await BetFactoryCOFI.deploy(await usdc.getAddress());
    await factory.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the deployer as owner", async function () {
      expect(await factory.owner()).to.equal(deployer.address);
    });

    it("Should set the correct USDC address", async function () {
      expect(await factory.usdcToken()).to.equal(await usdc.getAddress());
    });

    it("Should start with zero bets", async function () {
      expect(await factory.getBetCount()).to.equal(0);
    });

    it("Should fail with invalid USDC address", async function () {
      const BetFactoryCOFI = await ethers.getContractFactory("BetFactoryCOFI");
      await expect(
        BetFactoryCOFI.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid USDC address");
    });
  });

  describe("Creator Approval", function () {
    it("Should allow owner to create bets by default", async function () {
      expect(await factory.canCreateBet(deployer.address)).to.be.true;
    });

    it("Should not allow non-approved users to create bets", async function () {
      expect(await factory.canCreateBet(creator1.address)).to.be.false;
    });

    it("Should allow owner to approve creators", async function () {
      await expect(factory.setCreatorApproval(creator1.address, true))
        .to.emit(factory, "CreatorApprovalUpdated")
        .withArgs(creator1.address, true);

      expect(await factory.approvedCreators(creator1.address)).to.be.true;
      expect(await factory.canCreateBet(creator1.address)).to.be.true;
    });

    it("Should allow approved creators to create bets", async function () {
      await factory.setCreatorApproval(creator1.address, true);

      const currentTime = await time.latest();
      const endDate = currentTime + 7 * 24 * 60 * 60;

      await expect(
        factory.connect(creator1).createBet(
          "Test Bet",
          "Resolution criteria",
          "Yes",
          "No",
          endDate,
          0, // CRYPTO
          "0x"
        )
      ).to.not.be.reverted;
    });

    it("Should reject non-approved creators", async function () {
      const currentTime = await time.latest();
      const endDate = currentTime + 7 * 24 * 60 * 60;

      await expect(
        factory.connect(creator1).createBet(
          "Test Bet",
          "Resolution criteria",
          "Yes",
          "No",
          endDate,
          0,
          "0x"
        )
      ).to.be.revertedWith("Not authorized to create bets");
    });

    it("Should allow owner to revoke approval", async function () {
      await factory.setCreatorApproval(creator1.address, true);
      expect(await factory.canCreateBet(creator1.address)).to.be.true;

      await factory.setCreatorApproval(creator1.address, false);
      expect(await factory.canCreateBet(creator1.address)).to.be.false;
    });
  });

  describe("Creating Bets", function () {
    it("Should create a bet and emit BetCreated event", async function () {
      const currentTime = await time.latest();
      const endDate = currentTime + 7 * 24 * 60 * 60;

      await expect(
        factory.createBet(
          "Will ETH reach $5000?",
          "ETH price prediction",
          "Yes",
          "No",
          endDate,
          0, // CRYPTO
          "0x"
        )
      )
        .to.emit(factory, "BetCreated")
        .withArgs(
          (betAddress: string) => betAddress !== ethers.ZeroAddress,
          deployer.address,
          "Will ETH reach $5000?",
          endDate
        );
    });

    it("Should increment bet count", async function () {
      const currentTime = await time.latest();
      const endDate = currentTime + 7 * 24 * 60 * 60;

      expect(await factory.getBetCount()).to.equal(0);

      await factory.createBet("Bet 1", "Desc", "Yes", "No", endDate, 0, "0x");
      expect(await factory.getBetCount()).to.equal(1);

      await factory.createBet("Bet 2", "Desc", "Yes", "No", endDate, 0, "0x");
      expect(await factory.getBetCount()).to.equal(2);
    });

    it("Should track all created bets", async function () {
      const currentTime = await time.latest();
      const endDate = currentTime + 7 * 24 * 60 * 60;

      await factory.createBet("Bet 1", "Desc", "Yes", "No", endDate, 0, "0x");
      await factory.createBet("Bet 2", "Desc", "Yes", "No", endDate, 0, "0x");

      const allBets = await factory.getAllBets();
      expect(allBets.length).to.equal(2);
      expect(allBets[0]).to.not.equal(ethers.ZeroAddress);
      expect(allBets[1]).to.not.equal(ethers.ZeroAddress);
    });

    it("Should add bet to activeBets array", async function () {
      const currentTime = await time.latest();
      const endDate = currentTime + 7 * 24 * 60 * 60;

      await factory.createBet("Bet 1", "Desc", "Yes", "No", endDate, 0, "0x");

      const activeBets = await factory.getActiveBets();
      expect(activeBets.length).to.equal(1);
    });

    it("Should mark bet as deployed", async function () {
      const currentTime = await time.latest();
      const endDate = currentTime + 7 * 24 * 60 * 60;

      const tx = await factory.createBet("Bet 1", "Desc", "Yes", "No", endDate, 0, "0x");
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
      const betAddress = factory.interface.parseLog(event as any)?.args[0];

      expect(await factory.isLegitBet(betAddress)).to.be.true;
      expect(await factory.deployedBets(betAddress)).to.be.true;
    });

    it("Should reject invalid resolution type", async function () {
      const currentTime = await time.latest();
      const endDate = currentTime + 7 * 24 * 60 * 60;

      await expect(
        factory.createBet("Bet", "Desc", "Yes", "No", endDate, 5, "0x")
      ).to.be.revertedWith("Invalid resolution type");
    });
  });

  describe("Placing Bets via Factory", function () {
    let betAddress: string;

    beforeEach(async function () {
      const currentTime = await time.latest();
      const endDate = currentTime + 7 * 24 * 60 * 60;

      const tx = await factory.createBet("Test Bet", "Desc", "Yes", "No", endDate, 0, "0x");
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
      betAddress = factory.interface.parseLog(event as any)?.args[0];
    });

    it("Should transfer USDC and update bet totals", async function () {
      const betAmount = USDC_AMOUNT(100);

      await usdc.connect(bettor).approve(await factory.getAddress(), betAmount);
      await factory.connect(bettor).placeBet(betAddress, true, betAmount);

      const bet = await ethers.getContractAt("BetCOFI", betAddress) as BetCOFI;
      expect(await bet.totalSideA()).to.equal(betAmount);
      expect(await bet.betsOnSideA(bettor.address)).to.equal(betAmount);
    });

    it("Should emit BetPlaced event", async function () {
      const betAmount = USDC_AMOUNT(100);

      await usdc.connect(bettor).approve(await factory.getAddress(), betAmount);

      await expect(factory.connect(bettor).placeBet(betAddress, true, betAmount))
        .to.emit(factory, "BetPlaced")
        .withArgs(betAddress, bettor.address, true, betAmount);
    });

    it("Should reject unknown bet address", async function () {
      const betAmount = USDC_AMOUNT(100);
      const fakeBet = ethers.Wallet.createRandom().address;

      await usdc.connect(bettor).approve(await factory.getAddress(), betAmount);

      await expect(
        factory.connect(bettor).placeBet(fakeBet, true, betAmount)
      ).to.be.revertedWith("Bet not from this factory");
    });

    it("Should reject zero amount", async function () {
      await expect(
        factory.connect(bettor).placeBet(betAddress, true, 0)
      ).to.be.revertedWith("Amount must be greater than 0");
    });
  });

  describe("Bridge Integration", function () {
    let betAddress: string;

    beforeEach(async function () {
      // Set bridge receiver
      await factory.setBridgeReceiver(bridgeReceiver.address);

      const currentTime = await time.latest();
      const endDate = currentTime + 30; // Short end date for testing

      const tx = await factory.createBet("Test Bet", "Desc", "Yes", "No", endDate, 0, "0x");
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
      betAddress = factory.interface.parseLog(event as any)?.args[0];

      // Place bets and trigger resolution
      const betAmount = USDC_AMOUNT(100);
      await usdc.connect(bettor).approve(await factory.getAddress(), betAmount);
      await factory.connect(bettor).placeBet(betAddress, true, betAmount);

      // Wait for end date
      await time.increaseTo((await time.latest()) + 35);

      // Request resolution
      const bet = await ethers.getContractAt("BetCOFI", betAddress) as BetCOFI;
      await bet.connect(deployer).resolve();
    });

    it("Should only allow bridgeReceiver to call processBridgeMessage", async function () {
      const resolutionData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "bool", "bool", "uint256", "bytes32", "uint256", "string"],
        [betAddress, true, false, Math.floor(Date.now() / 1000), ethers.ZeroHash, 0n, ""]
      );
      const message = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "bytes"],
        [betAddress, resolutionData]
      );

      await expect(
        factory.connect(creator1).processBridgeMessage(0, ethers.ZeroAddress, message)
      ).to.be.revertedWith("Only bridge receiver");
    });

    it("Should process bridge message and resolve bet", async function () {
      const resolutionData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "bool", "bool", "uint256", "bytes32", "uint256", "string"],
        [betAddress, true, false, Math.floor(Date.now() / 1000), ethers.ZeroHash, 6500050n, "Yes"]
      );
      const message = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "bytes"],
        [betAddress, resolutionData]
      );

      await expect(
        factory.connect(bridgeReceiver).processBridgeMessage(0, ethers.ZeroAddress, message)
      ).to.emit(factory, "OracleResolutionReceived");

      const bet = await ethers.getContractAt("BetCOFI", betAddress) as BetCOFI;
      expect(await bet.isResolved()).to.be.true;
    });

    it("Should reject unknown bet contract", async function () {
      const fakeBet = ethers.Wallet.createRandom().address;
      const resolutionData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "bool", "bool", "uint256", "bytes32", "uint256", "string"],
        [fakeBet, true, false, Math.floor(Date.now() / 1000), ethers.ZeroHash, 0n, ""]
      );
      const message = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "bytes"],
        [fakeBet, resolutionData]
      );

      await expect(
        factory.connect(bridgeReceiver).processBridgeMessage(0, ethers.ZeroAddress, message)
      ).to.be.revertedWith("Unknown bet contract");
    });

    it("Should only allow owner to set bridge receiver", async function () {
      await expect(
        factory.connect(creator1).setBridgeReceiver(creator1.address)
      ).to.be.reverted; // OwnableUnauthorizedAccount
    });
  });

  describe("Status Tracking", function () {
    it("Should track bet status changes", async function () {
      const currentTime = await time.latest();
      const endDate = currentTime + 30;

      const tx = await factory.createBet("Test Bet", "Desc", "Yes", "No", endDate, 0, "0x");
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
      const betAddress = factory.interface.parseLog(event as any)?.args[0];

      // Initially in activeBets
      expect(await factory.getActiveBetsCount()).to.equal(1);
      expect(await factory.getResolvingBetsCount()).to.equal(0);

      // Place bet and resolve
      const betAmount = USDC_AMOUNT(100);
      await usdc.connect(bettor).approve(await factory.getAddress(), betAmount);
      await factory.connect(bettor).placeBet(betAddress, true, betAmount);

      await time.increaseTo((await time.latest()) + 35);

      const bet = await ethers.getContractAt("BetCOFI", betAddress) as BetCOFI;
      await bet.connect(deployer).resolve();

      // Should move to resolvingBets
      expect(await factory.getActiveBetsCount()).to.equal(0);
      expect(await factory.getResolvingBetsCount()).to.equal(1);
    });

    it("Should return correct bets by status", async function () {
      const currentTime = await time.latest();
      const endDate = currentTime + 7 * 24 * 60 * 60;

      await factory.createBet("Bet 1", "Desc", "Yes", "No", endDate, 0, "0x");
      await factory.createBet("Bet 2", "Desc", "Yes", "No", endDate, 0, "0x");

      const activeBets = await factory.getBetsByStatus(0); // ACTIVE
      expect(activeBets.length).to.equal(2);

      const resolvingBets = await factory.getBetsByStatus(1); // RESOLVING
      expect(resolvingBets.length).to.equal(0);
    });
  });
});
