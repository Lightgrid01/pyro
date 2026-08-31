// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {INativeQueryVerifier, NativeQueryVerifierLib} from
    "@gluwa/usc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";
import {EvmV1Decoder} from
    "@gluwa/usc-contracts/contracts/write-ability/common/EvmV1Decoder.sol";

/// @title UptimeRegistry
/// @notice An Attestcoin Smart Contract (ASC) deployed on Creditcoin CC3 Testnet.
///         Verifies that a DePIN node's heartbeat transaction really happened on
///         Ethereum Sepolia (via the Block Prover Precompile at 0x0FD2) before
///         crediting that node's uptime score. A node cannot inflate its score
///         by lying — every point of verified uptime is backed by a real,
///         attested Sepolia transaction.
///
/// @dev Mirrors the standard ASC pattern (see ASCMinter.sol in Creditcoin's
///      dApp Builder Infrastructure docs): replay protection -> synchronous
///      proof verification -> status check -> event extraction -> business logic.
contract UptimeRegistry {
    INativeQueryVerifier public immutable VERIFIER;

    /// @dev Must match the Sepolia HeartbeatBeacon's event signature:
    ///      Heartbeat(uint256 indexed nodeId, uint256 timestamp, uint256 pulseIndex)
    bytes32 public constant HEARTBEAT_EVENT_SIGNATURE =
        keccak256("Heartbeat(uint256,uint256,uint256)");

    /// @dev The Sepolia address of the deployed HeartbeatBeacon contract.
    ///      Only heartbeats emitted by this exact contract are accepted —
    ///      prevents a node from emitting a look-alike event from elsewhere.
    address public immutable BEACON_ADDRESS;

    /// @dev chainKey for Ethereum Sepolia on CC3 Testnet, per Attestcoin docs.
    uint64 public constant SEPOLIA_CHAIN_KEY = 1;

    struct NodeStatus {
        uint256 verifiedHeartbeats;   // count of Attestcoin-verified heartbeats
        uint256 lastVerifiedTimestamp; // block.timestamp of the source-chain heartbeat
        uint256 claimedHeartbeats;     // self-reported count, no proof required
    }

    mapping(uint256 => NodeStatus) public nodes;
    mapping(bytes32 => bool) public processedQueries; // replay protection

    event HeartbeatVerified(uint256 indexed nodeId, uint256 sourceTimestamp, uint256 verifiedCount);
    event HeartbeatClaimed(uint256 indexed nodeId, uint256 claimedCount);

    constructor(address beaconAddress) {
        VERIFIER = NativeQueryVerifierLib.getVerifier();
        BEACON_ADDRESS = beaconAddress;
    }

    /// @notice Self-reported heartbeat — NOT verified, NOT trusted on its own.
    ///         Exists purely so the dashboard can show "claimed vs verified" and
    ///         visibly flag a node whose self-reports outpace its verified proofs.
    function reportClaimedHeartbeat(uint256 nodeId) external {
        nodes[nodeId].claimedHeartbeats += 1;
        emit HeartbeatClaimed(nodeId, nodes[nodeId].claimedHeartbeats);
    }

    /// @notice Submits an Attestcoin proof for a Sepolia heartbeat transaction.
    ///         Called by the off-chain worker once the transaction is attested.
    function recordHeartbeat(
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        INativeQueryVerifier.MerkleProof calldata merkleProof,
        INativeQueryVerifier.ContinuityProof calldata continuityProof
    ) external returns (bool success) {
        // --- Replay protection ---
        bytes32 txKey = keccak256(abi.encodePacked(SEPOLIA_CHAIN_KEY, blockHeight, encodedTransaction));
        require(!processedQueries[txKey], "Heartbeat already processed");

        // --- Synchronous proof verification via the Block Prover Precompile ---
        bool verified = VERIFIER.verifyAndEmit(
            SEPOLIA_CHAIN_KEY,
            blockHeight,
            encodedTransaction,
            merkleProof,
            continuityProof
        );
        require(verified, "Attestcoin verification failed");

        processedQueries[txKey] = true;

        // --- Validate the transaction actually succeeded on Sepolia ---
        // The precompile only proves inclusion, not success — this check is mandatory.
        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        require(receipt.receiptStatus == 1, "Sepolia transaction did not succeed");

        // --- Extract the Heartbeat event and confirm it came from our beacon ---
        EvmV1Decoder.LogEntry[] memory logs =
            EvmV1Decoder.getLogsByEventSignature(receipt, HEARTBEAT_EVENT_SIGNATURE);
        require(logs.length > 0, "No Heartbeat event found");

        (uint256 nodeId, uint256 sourceTimestamp, bool found) =
            _extractHeartbeat(logs);
        require(found, "Heartbeat log did not match beacon address");

        // --- Business logic: credit verified uptime ---
        NodeStatus storage node = nodes[nodeId];
        node.verifiedHeartbeats += 1;
        node.lastVerifiedTimestamp = sourceTimestamp;

        emit HeartbeatVerified(nodeId, sourceTimestamp, node.verifiedHeartbeats);
        return true;
    }

    /// @dev Confirms the log originated from BEACON_ADDRESS and decodes nodeId + timestamp.
    ///      Field names (address_, topics, data) confirmed directly against the real
    ///      EvmV1Decoder.LogEntry struct in the Gluwa Solidity contracts package.
    function _extractHeartbeat(EvmV1Decoder.LogEntry[] memory logs)
        internal
        view
        returns (uint256 nodeId, uint256 sourceTimestamp, bool found)
    {
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].address_ == BEACON_ADDRESS) {
                // topics[1] = indexed nodeId; data = abi.encode(timestamp, pulseIndex)
                nodeId = uint256(logs[i].topics[1]);
                (sourceTimestamp, ) = abi.decode(logs[i].data, (uint256, uint256));
                return (nodeId, sourceTimestamp, true);
            }
        }
        return (0, 0, false);
    }

    /// @notice Convenience view for the dashboard — flags a node as "suspicious"
    ///         when its self-reported claims meaningfully exceed verified proofs.
    function isSuspicious(uint256 nodeId) external view returns (bool) {
        NodeStatus memory n = nodes[nodeId];
        return n.claimedHeartbeats > n.verifiedHeartbeats + 2;
    }
}
