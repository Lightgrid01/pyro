// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IUptimeRegistry {
    function nodes(uint256 nodeId)
        external
        view
        returns (uint256 verifiedHeartbeats, uint256 lastVerifiedTimestamp, uint256 claimedHeartbeats);

    function isSuspicious(uint256 nodeId) external view returns (bool);
}

/// @title RewardGate
/// @notice Answers the question a reliability score alone doesn't: what does
///         a node actually get for being verified? This contract reads
///         UptimeRegistry's existing, already-proven state (no redeploy of
///         that contract, no loss of its real transaction history) and
///         turns it into a concrete, on-chain eligibility decision for a
///         DePIN reward pool.
///
///         A node only becomes eligible once it has enough Attestcoin-
///         verified heartbeats and has never been flagged as suspicious.
///         Nothing here can be gamed by self-reporting, because it reads
///         directly from the same verified counters UptimeRegistry only
///         increments after a real Attestcoin proof succeeds.
contract RewardGate {
    IUptimeRegistry public immutable REGISTRY;

    /// @dev Minimum Attestcoin-verified heartbeats required for reward
    ///      pool eligibility. Deliberately low for a testnet demo — a
    ///      production deployment would tune this per real reward economics.
    uint256 public constant MIN_VERIFIED_FOR_ELIGIBILITY = 1;

    event EligibilityChecked(uint256 indexed nodeId, bool eligible);

    constructor(address registryAddress) {
        REGISTRY = IUptimeRegistry(registryAddress);
    }

    /// @notice Whether a node currently qualifies for the reward pool.
    /// @dev Pure read — costs no gas to call off-chain, and nothing about
    ///      eligibility can be set directly; it only ever follows from
    ///      UptimeRegistry's own verified state.
    function isEligible(uint256 nodeId) public view returns (bool) {
        (uint256 verifiedHeartbeats, , ) = REGISTRY.nodes(nodeId);
        bool suspicious = REGISTRY.isSuspicious(nodeId);
        return verifiedHeartbeats >= MIN_VERIFIED_FOR_ELIGIBILITY && !suspicious;
    }

    /// @notice Same check, but emits an event — useful for a dashboard or
    ///         indexer that wants an on-chain record of eligibility checks,
    ///         not just a silent view call.
    function checkAndRecord(uint256 nodeId) external returns (bool eligible) {
        eligible = isEligible(nodeId);
        emit EligibilityChecked(nodeId, eligible);
    }
}
