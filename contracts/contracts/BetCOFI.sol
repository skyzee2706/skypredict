// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IBetFactoryCOFI.sol";

/// @title BetCOFI - Binary prediction market contract
/// @notice Users bet on side A or B. After endDate, creator requests resolution from GenLayer oracle.
/// Winners claim proportional share of the losing pool.
contract BetCOFI is ReentrancyGuard, Ownable {
    enum BetStatus { ACTIVE, RESOLVING, RESOLVED, UNDETERMINED }
    enum ResolutionType { CRYPTO, STOCKS, NEWS }

    address public immutable creator;
    string public title;
    string public resolutionCriteria;
    string public sideAName;
    string public sideBName;
    uint256 public immutable creationDate;
    uint256 public immutable endDate;
    address public immutable factory;
    IERC20 public immutable token;
    ResolutionType public immutable resolutionType;
    bytes public resolutionData; 

    uint256 private constant RESOLUTION_TIMEOUT = 7 days;

    bool public isResolved;
    bool public isSideAWinner;
    BetStatus public status;
    uint256 public resolutionRequestedAt;

    uint256 public totalSideA;
    uint256 public totalSideB;
    mapping(address => uint256) public betsOnSideA;
    mapping(address => uint256) public betsOnSideB;
    mapping(address => bool) public hasClaimed;

    // Resolution results from oracle
    uint256 public resolvedPrice;
    string public winnerValue;

    event BetPlacedOnA(address indexed bettor, uint256 amount);
    event BetPlacedOnB(address indexed bettor, uint256 amount);
    event BetResolved(bool sideAWins, uint256 timestamp, uint256 priceValue, string winnerValue);
    event BetUndetermined(uint256 timestamp);
    event WinningsClaimed(address indexed winner, uint256 amount);
    event ResolutionReceived(bool sideAWins);

    constructor(
        address _creator,
        string memory _title,
        string memory _resolutionCriteria,
        string memory _sideAName,
        string memory _sideBName,
        uint256 _endDate,
        address _token,
        address _factory,
        ResolutionType _resolutionType,
        bytes memory _resolutionData
    ) Ownable(_factory) {
        require(_creator != address(0), "Invalid creator address");
        require(_token != address(0), "Invalid token address");
        require(_factory != address(0), "Invalid factory address");
        require(bytes(_title).length > 0, "Title cannot be empty");
        require(bytes(_sideAName).length > 0, "Side A name cannot be empty");
        require(bytes(_sideBName).length > 0, "Side B name cannot be empty");

        creator = _creator;
        title = _title;
        resolutionCriteria = _resolutionCriteria;
        sideAName = _sideAName;
        sideBName = _sideBName;
        creationDate = block.timestamp;
        endDate = _endDate;
        factory = _factory;
        token = IERC20(_token);
        resolutionType = _resolutionType;
        resolutionData = _resolutionData;
        status = BetStatus.ACTIVE;
    }

    // ============ Betting ============

    function betOnSideAViaFactory(address bettor, uint256 amount) external {
        require(msg.sender == factory, "Only factory can call");
        require(block.timestamp < endDate, "Betting has ended");
        require(status == BetStatus.ACTIVE, "Bet not active");
        require(amount > 0, "Must bet more than 0");

        betsOnSideA[bettor] += amount;
        totalSideA += amount;

        emit BetPlacedOnA(bettor, amount);
    }

    function betOnSideBViaFactory(address bettor, uint256 amount) external {
        require(msg.sender == factory, "Only factory can call");
        require(block.timestamp < endDate, "Betting has ended");
        require(status == BetStatus.ACTIVE, "Bet not active");
        require(amount > 0, "Must bet more than 0");

        betsOnSideB[bettor] += amount;
        totalSideB += amount;

        emit BetPlacedOnB(bettor, amount);
    }

    // ============ Resolution ============

    /// @notice Creator calls after endDate to request oracle resolution
    function resolve() external {
        require(msg.sender == creator, "Only creator can resolve");
        require(block.timestamp >= endDate, "Cannot resolve before end date");
        require(status == BetStatus.ACTIVE, "Bet not active");

        uint8 oldStatus = uint8(status);
        status = BetStatus.RESOLVING;
        resolutionRequestedAt = block.timestamp;

        IBetFactoryCOFI(factory).notifyStatusChange(oldStatus, uint8(status));
        IBetFactoryCOFI(factory).forwardResolutionRequest(uint8(resolutionType));
    }

    /// @notice Called by factory when oracle resolution arrives via bridge
    function setResolution(bytes calldata _message) external {
        require(msg.sender == factory, "Only factory can dispatch");

        (
            address betAddress,
            bool sideAWins,
            bool isUndetermined,
            ,
            ,
            uint256 priceValue,
            string memory winnerVal
        ) = abi.decode(_message, (address, bool, bool, uint256, bytes32, uint256, string));

        require(betAddress == address(this), "Response for wrong bet");
        require(status == BetStatus.RESOLVING, "Not awaiting resolution");

        uint8 oldStatus = uint8(status);
        isResolved = true;
        resolvedPrice = priceValue;
        winnerValue = winnerVal;

        if (isUndetermined) {
            status = BetStatus.UNDETERMINED;
            emit BetUndetermined(block.timestamp);
        } else {
            isSideAWinner = sideAWins;
            status = BetStatus.RESOLVED;
            emit BetResolved(sideAWins, block.timestamp, priceValue, winnerVal);
        }

        IBetFactoryCOFI(factory).notifyStatusChange(oldStatus, uint8(status));
        emit ResolutionReceived(sideAWins);
    }

    // ============ Claiming ============

    /// @notice Winners claim winnings, or everyone gets refund if UNDETERMINED
    function claim() external nonReentrant {
        require(isResolved, "Bet not resolved yet");
        require(!hasClaimed[msg.sender], "Already claimed");

        uint256 payout = 0;

        if (status == BetStatus.UNDETERMINED) {
            uint256 userBetOnA = betsOnSideA[msg.sender];
            uint256 userBetOnB = betsOnSideB[msg.sender];
            payout = userBetOnA + userBetOnB;
            require(payout > 0, "No bet to refund");
        } else if (isSideAWinner) {
            if (totalSideA == 0) {
                // Side A won but no one bet on A - refund side B
                uint256 userBetOnB = betsOnSideB[msg.sender];
                require(userBetOnB > 0, "No bet to refund");
                payout = userBetOnB;
            } else {
                // Normal: side A winners claim
                uint256 userBetOnA = betsOnSideA[msg.sender];
                require(userBetOnA > 0, "No winning bet to claim");
                uint256 winningsShare = (userBetOnA * totalSideB) / totalSideA;
                payout = userBetOnA + winningsShare;
            }
        } else {
            if (totalSideB == 0) {
                // Side B won but no one bet on B - refund side A
                uint256 userBetOnA = betsOnSideA[msg.sender];
                require(userBetOnA > 0, "No bet to refund");
                payout = userBetOnA;
            } else {
                // Normal: side B winners claim
                uint256 userBetOnB = betsOnSideB[msg.sender];
                require(userBetOnB > 0, "No winning bet to claim");
                uint256 winningsShare = (userBetOnB * totalSideA) / totalSideB;
                payout = userBetOnB + winningsShare;
            }
        }

        hasClaimed[msg.sender] = true;
        require(token.transfer(msg.sender, payout), "Transfer failed");
        emit WinningsClaimed(msg.sender, payout);
    }

    /// @notice Creator can cancel if oracle doesn't respond within RESOLUTION_TIMEOUT
    function cancelBet() external {
        require(msg.sender == creator, "Only creator can cancel");
        require(status == BetStatus.RESOLVING, "Can only cancel while resolving");
        require(block.timestamp >= resolutionRequestedAt + RESOLUTION_TIMEOUT, "Timeout not reached");

        uint8 oldStatus = uint8(status);
        isResolved = true;
        status = BetStatus.UNDETERMINED;

        IBetFactoryCOFI(factory).notifyStatusChange(oldStatus, uint8(status));
        emit BetUndetermined(block.timestamp);
    }

    // ============ Views ============

    function getInfo() external view returns (
        address _creator,
        string memory _title,
        string memory _resolutionCriteria,
        string memory _sideAName,
        string memory _sideBName,
        uint256 _creationDate,
        uint256 _endDate,
        bool _isResolved,
        bool _isSideAWinner,
        uint256 _totalSideA,
        uint256 _totalSideB,
        uint256 _resolvedPrice,
        string memory _winnerValue
    ) {
        return (
            creator,
            title,
            resolutionCriteria,
            sideAName,
            sideBName,
            creationDate,
            endDate,
            isResolved,
            isSideAWinner,
            totalSideA,
            totalSideB,
            resolvedPrice,
            winnerValue
        );
    }

    function getUserBets(address user) external view returns (uint256 onSideA, uint256 onSideB) {
        return (betsOnSideA[user], betsOnSideB[user]);
    }

    function calculatePotentialWinnings(address user) external view returns (
        uint256 ifSideAWins,
        uint256 ifSideBWins
    ) {
        uint256 userBetOnA = betsOnSideA[user];
        uint256 userBetOnB = betsOnSideB[user];

        if (userBetOnA > 0 && totalSideA > 0) {
            uint256 winningsShare = totalSideB > 0 ? (userBetOnA * totalSideB) / totalSideA : 0;
            ifSideAWins = userBetOnA + winningsShare;
        }

        if (userBetOnB > 0 && totalSideB > 0) {
            uint256 winningsShare = totalSideA > 0 ? (userBetOnB * totalSideA) / totalSideB : 0;
            ifSideBWins = userBetOnB + winningsShare;
        }
    }
}
