// src/config.js — edit these if you redeploy contracts or the deployment
// block changes. Everything else in the app reads from here.

export const CREDITCOIN_RPC = "https://rpc.cc3-testnet.creditcoin.network";
export const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

export const REGISTRY_ADDRESS = "0xa32659ec3c61E84adceF44cA34AD075949acAC97";
export const BEACON_ADDRESS = "0xD3A97BcE1b0964e2959a08d37EE7F3A030CAED4c";

// Approximate Creditcoin block the registry was deployed at — event scans
// start here instead of block 0, since CC3 Testnet already has millions of
// blocks of unrelated history. Safe to move this earlier if it's ever wrong;
// it just costs a slightly slower first load.
export const START_BLOCK = 5371000;

export const CREDITCOIN_EXPLORER_TX = "https://creditcoin-testnet.blockscout.com/tx/";
export const SEPOLIA_EXPLORER_TX = "https://sepolia.etherscan.io/tx/";

export const POLL_INTERVAL_MS = 15000;

export const REGISTRY_ABI = [
  "event HeartbeatVerified(uint256 indexed nodeId, uint256 sourceTimestamp, uint256 verifiedCount)",
  "event HeartbeatClaimed(uint256 indexed nodeId, uint256 claimedCount)",
  "function nodes(uint256) view returns (uint256 verifiedHeartbeats, uint256 lastVerifiedTimestamp, uint256 claimedHeartbeats)",
  "function isSuspicious(uint256) view returns (bool)",
];
