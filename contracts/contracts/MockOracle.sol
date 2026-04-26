// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IPriceOracle.sol";

contract MockOracle is IPriceOracle {
    uint256 public price;
    string public description;

    constructor(string memory _description, uint256 _initialPrice) {
        description = _description;
        price = _initialPrice;
    }

    function setPrice(uint256 _price) external {
        price = _price;
    }

    function getPrice() external view override returns (uint256) {
        require(price > 0, "MockOracle: invalid price");
        return price;
    }
}
