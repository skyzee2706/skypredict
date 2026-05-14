// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./PredictionMarket.sol";
import "./MarketFactory.sol";

/**
 * @title MarketRouter
 * @notice Single approval point for SkyUSD trading across all prediction markets.
 *         Users approve SkyUSD to this Router once, then all bets on any market
 *         go through the Router — no per-market approval needed.
 */
contract MarketRouter {
    IERC20 public immutable token;
    MarketFactory public immutable factory;

    event BetRouted(
        address indexed user,
        address indexed market,
        PredictionMarket.Outcome outcome,
        uint256 amount
    );

    constructor(address _token, address _factory) {
        token = IERC20(_token);
        factory = MarketFactory(_factory);
    }

    /**
     * @notice Place a bet on a market via the Router.
     *         User must have approved SkyUSD to THIS Router contract.
     *         The Router transfers tokens from user → market, then records the bet.
     */
    function placeBet(
        address marketAddress,
        PredictionMarket.Outcome outcome,
        uint256 amount
    ) external {
        require(amount > 0, "Router: amount must be > 0");
        require(_isValidMarket(marketAddress), "Router: invalid market");

        PredictionMarket market = PredictionMarket(marketAddress);

        // Transfer SkyUSD from user to the market contract
        require(
            token.transferFrom(msg.sender, marketAddress, amount),
            "Router: transferFrom failed"
        );

        // Record the bet on the market (no transferFrom inside — tokens already there)
        market.placeBetFor(msg.sender, outcome, amount);

        emit BetRouted(msg.sender, marketAddress, outcome, amount);
    }

    /**
     * @notice Check if a market address is registered in the Factory.
     */
    function _isValidMarket(address marketAddress) internal view returns (bool) {
        address[] memory allMarkets = factory.getAllMarkets();
        for (uint256 i = 0; i < allMarkets.length; i++) {
            if (allMarkets[i] == marketAddress) return true;
        }
        return false;
    }
}
