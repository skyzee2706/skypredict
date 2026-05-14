// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./PredictionMarket.sol";

/**
 * @title MarketFactory
 * @notice Deploys and tracks prediction markets for crypto and sports using EIP-1167 clones.
 */
contract MarketFactory is Ownable {
    address public oracle;
    address public ethUsdOracle;
    address public token;
    address public predictionMarketImplementation;
    address public routerAddress;

    address[] public markets;

    event MarketCreated(
        address indexed market,
        string question,
        string sideAName,
        string drawName,
        string sideBName,
        string marketType,
        uint256 strikePrice,
        uint256 endTime
    );
    event OracleUpdated(address newOracle);
    event TokenUpdated(address newToken);
    event ImplementationUpdated(address newImplementation);

    constructor(address _oracle, address _ethUsdOracle, address _token, address initialOwner) Ownable(initialOwner) {
        oracle = _oracle;
        ethUsdOracle = _ethUsdOracle;
        token = _token;
        // The implementation can be set later, or we can deploy one immediately
        predictionMarketImplementation = address(new PredictionMarket());
    }

    function setImplementation(address _impl) external onlyOwner {
        predictionMarketImplementation = _impl;
        emit ImplementationUpdated(_impl);
    }

    function createMarket(
        string memory question,
        uint256 strikePrice,
        uint256 endTime,
        uint256 bettingEndTime
    ) external onlyOwner returns (address) {
        return _createMarket(
            question,
            "YES",
            "DRAW",
            "NO",
            "CRYPTO",
            strikePrice,
            endTime,
            bettingEndTime
        );
    }

    function createMarketWithOutcomes(
        string memory question,
        string memory sideAName,
        string memory drawName,
        string memory sideBName,
        string memory marketType,
        uint256 strikePrice,
        uint256 endTime,
        uint256 bettingEndTime
    ) external onlyOwner returns (address) {
        return _createMarket(
            question,
            sideAName,
            drawName,
            sideBName,
            marketType,
            strikePrice,
            endTime,
            bettingEndTime
        );
    }

    function _createMarket(
        string memory question,
        string memory sideAName,
        string memory drawName,
        string memory sideBName,
        string memory marketType,
        uint256 strikePrice,
        uint256 endTime,
        uint256 bettingEndTime
    ) internal returns (address) {
        require(predictionMarketImplementation != address(0), "Implementation not set");
        address clone = Clones.clone(predictionMarketImplementation);
        PredictionMarket(clone).initialize(
            token,
            oracle,
            ethUsdOracle,
            question,
            sideAName,
            drawName,
            sideBName,
            marketType,
            strikePrice,
            endTime,
            bettingEndTime,
            owner(),
            owner()
        );

        markets.push(clone);

        // Auto-configure router on new market if set
        if (routerAddress != address(0)) {
            PredictionMarket(clone).setRouter(routerAddress);
        }

        emit MarketCreated(clone, question, sideAName, drawName, sideBName, marketType, strikePrice, endTime);
        return clone;
    }

    function setOracle(address _oracle) external onlyOwner {
        oracle = _oracle;
        emit OracleUpdated(_oracle);
    }

    function setToken(address _token) external onlyOwner {
        token = _token;
        emit TokenUpdated(_token);
    }

    function getAllMarkets() external view returns (address[] memory) {
        return markets;
    }

    function marketCount() external view returns (uint256) {
        return markets.length;
    }

    function setRouterAddress(address _router) external onlyOwner {
        routerAddress = _router;
    }

    /**
     * @notice Set router on all existing markets (for markets created before router was set).
     */
    function setRouterOnAllMarkets(address _router) external onlyOwner {
        routerAddress = _router;
        for (uint256 i = 0; i < markets.length; i++) {
            PredictionMarket(markets[i]).setRouter(_router);
        }
    }
}
