// scripts/liar-demo.js — demonstrates the core trust mechanism: a node that
// self-reports uptime without any real, Attestcoin-verified Sepolia
// transaction behind it gets flagged by the contract itself.
//
// Usage:
//   npx hardhat run scripts/liar-demo.js --network creditcoin_testnet
//
// Pick a node ID via env var (defaults to 99) — no editing this file needed:
//   set LIAR_NODE_ID=299 && npx hardhat run scripts/liar-demo.js --network creditcoin_testnet

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const LIAR_NODE_ID = Number(process.env.LIAR_NODE_ID || "99");

async function main() {
  const addressPath = path.join(__dirname, "..", "deployed-address.json");
  if (!fs.existsSync(addressPath)) {
    throw new Error("deployed-address.json not found - deploy UptimeRegistry first.");
  }
  const saved = JSON.parse(fs.readFileSync(addressPath, "utf8"));
  const registryAddress = saved.registryAddress;

  console.log("Registry address:", registryAddress);
  console.log("Liar node ID:", LIAR_NODE_ID);
  console.log("");

  const registry = await hre.ethers.getContractAt("UptimeRegistry", registryAddress);

  console.log("Sending 3 self-reported claims with NO real Sepolia transaction behind any of them...");
  for (let i = 1; i <= 3; i++) {
    const tx = await registry.reportClaimedHeartbeat(LIAR_NODE_ID);
    await tx.wait();
    console.log("  Claim " + i + " submitted: " + tx.hash);
  }

  console.log("");
  const status = await registry.nodes(LIAR_NODE_ID);
  const suspicious = await registry.isSuspicious(LIAR_NODE_ID);

  console.log("Node " + LIAR_NODE_ID + " on-chain status:");
  console.log("  verifiedHeartbeats: " + status.verifiedHeartbeats.toString() + "  <- zero, no real Sepolia tx ever backed this node");
  console.log("  claimedHeartbeats: " + status.claimedHeartbeats.toString() + "  <- self-reported, unproven");
  console.log("  isSuspicious(): " + suspicious);

  if (suspicious) {
    console.log("\nFLAGGED: this node's claims outpace its Attestcoin-verified proof. Exactly the demo moment.");
  } else {
    console.log("\nNot yet flagged - claimed count needs to exceed verified + 2.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
