// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

interface IBetFactoryCOFI {
    function forwardResolutionRequest(uint8 resolutionType) external;
    function notifyStatusChange(uint8 oldStatus, uint8 newStatus) external;
}
