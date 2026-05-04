// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./IPriceOracle.sol";

/**
 * @title PredictionMarket
 * @notice Multi-outcome prediction market supporting binary crypto markets and
 *         3-way football markets (Team A / Draw / Team B).
 *         Betting is done with SkyUSDT (ERC-20, 6 decimals).
 */
contract PredictionMarket is Initializable, OwnableUpgradeable {
    enum Outcome {
        SideA,
        Draw,
        SideB
    }

    IERC20 public token;
    IPriceOracle public oracle;
    IPriceOracle public ethUsdOracle;

    string public question;
    string public sideAName;
    string public drawName;
    string public sideBName;
    string public marketType;

    uint256 public strikePrice;
    uint256 public endTime;
    uint256 public bettingEndTime;

    bool public resolved;
    Outcome public winningOutcome;
    uint256 public settlementPrice;

    uint256 public sideAPool;
    uint256 public drawPool;
    uint256 public sideBPool;

    mapping(address => uint256) public sideABets;
    mapping(address => uint256) public drawBets;
    mapping(address => uint256) public sideBBets;
    mapping(address => bool) public claimed;

    address public feeWallet;

    event BetPlaced(address indexed user, Outcome indexed outcome, uint256 amount, uint256 ethFeePaid);
    event MarketResolved(Outcome indexed outcome, uint256 settlementValue);
    event Claimed(address indexed user, uint256 payout);

    function _nowSeconds() internal view returns (uint256) {
        // Ritual testnet currently exposes block.timestamp in milliseconds on-chain/RPC.
        // Market deadlines are stored in Unix seconds, so normalize defensively.
        return block.timestamp > 1e12 ? block.timestamp / 1000 : block.timestamp;
    }

    modifier beforeEnd() {
        require(_nowSeconds() < bettingEndTime, "Market: betting closed");
        _;
    }

    modifier afterEnd() {
        require(_nowSeconds() >= endTime, "Market: not ended yet");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _token,
        address _oracle,
        address _ethUsdOracle,
        string memory _question,
        string memory _sideAName,
        string memory _drawName,
        string memory _sideBName,
        string memory _marketType,
        uint256 _strikePrice,
        uint256 _endTime,
        uint256 _bettingEndTime,
        address _owner,
        address _feeWallet
    ) public initializer {
        __Ownable_init(_owner);
        token = IERC20(_token);
        oracle = IPriceOracle(_oracle);
        ethUsdOracle = IPriceOracle(_ethUsdOracle);
        question = _question;
        sideAName = _sideAName;
        drawName = _drawName;
        sideBName = _sideBName;
        marketType = _marketType;
        strikePrice = _strikePrice;
        endTime = _endTime;
        bettingEndTime = _bettingEndTime;
        feeWallet = _feeWallet;
    }

    function totalPool() public view returns (uint256) {
        return sideAPool + drawPool + sideBPool;
    }

    function outcomePrice(Outcome outcome) public view returns (uint256) {
        uint256 total = totalPool();
        if (total == 0) return 333333333333333333;
        if (outcome == Outcome.SideA) return (sideAPool * 1e18) / total;
        if (outcome == Outcome.Draw) return (drawPool * 1e18) / total;
        return (sideBPool * 1e18) / total;
    }

    function yesPrice() external view returns (uint256) {
        uint256 total = totalPool();
        if (total == 0) return 5e17;
        return (sideAPool * 1e18) / total;
    }

    function noPool() external view returns (uint256) {
        return sideBPool;
    }

    function yesPool() external view returns (uint256) {
        return sideAPool;
    }

    function result() external view returns (bool) {
        return winningOutcome == Outcome.SideA;
    }

    function buyYes(uint256 amount) external beforeEnd {
        _placeBet(Outcome.SideA, amount);
    }

    function buyNo(uint256 amount) external beforeEnd {
        _placeBet(Outcome.SideB, amount);
    }

    function buyDraw(uint256 amount) external beforeEnd {
        _placeBet(Outcome.Draw, amount);
    }

    function buyOutcome(Outcome outcome, uint256 amount) external beforeEnd {
        _placeBet(outcome, amount);
    }

    function _placeBet(Outcome outcome, uint256 amount) internal {
        require(amount > 0, "Amount must be > 0");
        require(token.transferFrom(msg.sender, address(this), amount), "TransferFrom failed");

        if (outcome == Outcome.SideA) {
            sideABets[msg.sender] += amount;
            sideAPool += amount;
        } else if (outcome == Outcome.Draw) {
            drawBets[msg.sender] += amount;
            drawPool += amount;
        } else {
            sideBBets[msg.sender] += amount;
            sideBPool += amount;
        }

        emit BetPlaced(msg.sender, outcome, amount, 0);
    }

    function resolve() external afterEnd {
        require(!resolved, "Already resolved");
        uint256 price = oracle.getPrice();
        winningOutcome = price >= strikePrice ? Outcome.SideA : Outcome.SideB;
        settlementPrice = price;
        resolved = true;
        emit MarketResolved(winningOutcome, price);
    }

    function resolveWithCustomPrice(uint256 price) external afterEnd onlyOwner {
        require(!resolved, "Already resolved");
        winningOutcome = price >= strikePrice ? Outcome.SideA : Outcome.SideB;
        settlementPrice = price;
        resolved = true;
        emit MarketResolved(winningOutcome, price);
    }

    function resolveWithOutcome(Outcome outcome, uint256 settlementValue) external afterEnd onlyOwner {
        require(!resolved, "Already resolved");
        winningOutcome = outcome;
        settlementPrice = settlementValue;
        resolved = true;
        emit MarketResolved(outcome, settlementValue);
    }

    function claim() external {
        require(resolved, "Market: not resolved yet");
        require(!claimed[msg.sender], "Already claimed");

        uint256 userBet = _userBetForOutcome(msg.sender, winningOutcome);
        require(userBet > 0, "No winning bet");

        uint256 winPool = _poolForOutcome(winningOutcome);
        require(winPool > 0, "No winning pool");

        claimed[msg.sender] = true;
        uint256 totalPayout = (userBet * totalPool()) / winPool;
        
        uint256 fee = (totalPayout * 10) / 100; // 10% fee
        uint256 userPayout = totalPayout - fee;

        if (fee > 0) {
            require(token.transfer(feeWallet, fee), "Fee transfer failed");
        }
        require(token.transfer(msg.sender, userPayout), "Payout transfer failed");
        emit Claimed(msg.sender, userPayout);
    }

    function _userBetForOutcome(address user, Outcome outcome) internal view returns (uint256) {
        if (outcome == Outcome.SideA) return sideABets[user];
        if (outcome == Outcome.Draw) return drawBets[user];
        return sideBBets[user];
    }

    function _poolForOutcome(Outcome outcome) internal view returns (uint256) {
        if (outcome == Outcome.SideA) return sideAPool;
        if (outcome == Outcome.Draw) return drawPool;
        return sideBPool;
    }

    function getUserPosition(address user) external view returns (
        uint256 _sideABet,
        uint256 _drawBet,
        uint256 _sideBBet,
        bool _claimed
    ) {
        return (sideABets[user], drawBets[user], sideBBets[user], claimed[user]);
    }
}
