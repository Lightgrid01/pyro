// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title HeartbeatBeacon
/// @notice Deployed on Ethereum Sepolia. DePIN nodes call `pulse()` on a
///         schedule to prove liveness. Each call emits a `Heartbeat` event
///         that is later verified on Creditcoin via the Attestcoin Protocol
///         (Block Prover Precompile) — a node cannot fabricate a heartbeat
///         without a real, mined Sepolia transaction backing it.
contract HeartbeatBeacon {
    /// @dev Increments per node so heartbeats can be counted/ordered off-chain
    ///      without relying on anything other than the event log itself.
    mapping(uint256 => uint256) public pulseCount;

    event Heartbeat(uint256 indexed nodeId, uint256 timestamp, uint256 pulseIndex);

    /// @notice Called by a DePIN node (or its operator wallet) to prove liveness.
    /// @param nodeId Arbitrary numeric identifier chosen at node registration time.
    function pulse(uint256 nodeId) external {
        uint256 idx = ++pulseCount[nodeId];
        emit Heartbeat(nodeId, block.timestamp, idx);
    }
}
