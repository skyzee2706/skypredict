// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SkyUSDT
 * @notice SkyUSD token for SkyPredict on Ritual Network.
 *         Users deposit native RITUAL to receive SkyUSD at a fixed rate.
 *         Rate: 0.01 RITUAL = 100 SkyUSD (i.e. 10,000 SkyUSD per 1 RITUAL).
 *         Min deposit: 0.01 RITUAL, Max deposit: 1 RITUAL per transaction.
 *         Owner can mint tokens and withdraw accumulated deposit funds.
 */
contract SkyUSDT is ERC20, Ownable {
    uint8 private constant DECIMALS = 18;

    uint256 public constant MIN_DEPOSIT = 0.01 ether;
    uint256 public constant MAX_DEPOSIT = 1 ether;
    uint256 public constant RATE_PER_ETH = 10_000; // 10,000 SkyUSD per 1 RITUAL

    event Deposited(address indexed user, uint256 ritualAmount, uint256 skyusdMinted);
    event FundsWithdrawn(address indexed owner, uint256 amount);

    constructor(address initialOwner) ERC20("Sky USD", "SkyUSD") Ownable(initialOwner) {
        _mint(initialOwner, 1_000_000 * 10 ** DECIMALS);
    }

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /**
     * @notice Deposit native RITUAL to receive SkyUSD.
     *         Min: 0.01 RITUAL (= 100 SkyUSD), Max: 1 RITUAL (= 10,000 SkyUSD).
     *         Rate is linear: amount * 10,000 SkyUSD per RITUAL.
     */
    function deposit() external payable {
        require(msg.value >= MIN_DEPOSIT, "Below minimum deposit (0.01 RITUAL)");
        require(msg.value <= MAX_DEPOSIT, "Above maximum deposit (1 RITUAL)");

        uint256 skyusdAmount = (msg.value * RATE_PER_ETH * 10 ** DECIMALS) / 1 ether;
        _mint(msg.sender, skyusdAmount);
        emit Deposited(msg.sender, msg.value, skyusdAmount);
    }

    function ownerMint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @notice Owner withdraws all accumulated RITUAL from deposits.
     */
    function withdrawFunds(address payable recipient) external onlyOwner {
        require(recipient != address(0), "Invalid recipient");
        uint256 amount = address(this).balance;
        require(amount > 0, "No funds to withdraw");

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Withdrawal failed");
        emit FundsWithdrawn(recipient, amount);
    }

    /**
     * @notice View total RITUAL balance held by this contract from deposits.
     */
    function depositBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
