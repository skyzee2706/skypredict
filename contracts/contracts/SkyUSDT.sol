// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SkyUSDT
 * @notice Test SkyUSD token for SkyPredict on Ritual.
 *         Faucet claims require a small native fee and are limited per wallet.
 *         Owner can mint tokens and withdraw accumulated faucet fees.
 */
contract SkyUSDT is ERC20, Ownable {
    uint8 private constant DECIMALS = 6;
    uint256 public constant FAUCET_AMOUNT = 1_000 * 10 ** 6;
    uint256 public constant FAUCET_FEE = 0.001 ether;
    uint256 public constant FAUCET_WINDOW = 24 hours;
    uint256 public constant MAX_CLAIMS_PER_WINDOW = 2;

    struct ClaimWindow {
        uint64 windowStart;
        uint8 claims;
    }

    mapping(address => ClaimWindow) public claimWindows;

    event FaucetClaimed(address indexed by, address indexed recipient, uint256 amount, uint256 feePaid);
    event FaucetFeesWithdrawn(address indexed owner, uint256 amount);

    constructor(address initialOwner) ERC20("Sky USD", "SkyUSD") Ownable(initialOwner) {
        _mint(initialOwner, 1_000_000 * 10 ** DECIMALS);
    }

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    function faucet(address recipient) external payable {
        require(recipient != address(0), "Invalid recipient");
        require(msg.value == FAUCET_FEE, "Invalid faucet fee");

        ClaimWindow storage claimWindow = claimWindows[recipient];
        if (block.timestamp >= uint256(claimWindow.windowStart) + FAUCET_WINDOW) {
            claimWindow.windowStart = uint64(block.timestamp);
            claimWindow.claims = 0;
        }

        require(claimWindow.claims < MAX_CLAIMS_PER_WINDOW, "24h claim limit reached");
        claimWindow.claims += 1;

        _mint(recipient, FAUCET_AMOUNT);
        emit FaucetClaimed(msg.sender, recipient, FAUCET_AMOUNT, msg.value);
    }

    function ownerMint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function withdrawFees(address payable recipient) external onlyOwner {
        require(recipient != address(0), "Invalid recipient");
        uint256 amount = address(this).balance;
        require(amount > 0, "No fees to withdraw");

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Fee withdrawal failed");
        emit FaucetFeesWithdrawn(recipient, amount);
    }

    function faucetFeeBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function cooldownRemaining(address recipient) external view returns (uint256) {
        ClaimWindow memory claimWindow = claimWindows[recipient];
        if (claimWindow.claims < MAX_CLAIMS_PER_WINDOW) return 0;

        uint256 next = uint256(claimWindow.windowStart) + FAUCET_WINDOW;
        if (block.timestamp >= next) return 0;
        return next - block.timestamp;
    }

    function claimsRemaining(address recipient) external view returns (uint256) {
        ClaimWindow memory claimWindow = claimWindows[recipient];
        if (block.timestamp >= uint256(claimWindow.windowStart) + FAUCET_WINDOW) {
            return MAX_CLAIMS_PER_WINDOW;
        }
        return MAX_CLAIMS_PER_WINDOW - claimWindow.claims;
    }
}
