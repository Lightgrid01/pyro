// scripts/pulse.js — manually triggers one HeartbeatBeacon.pulse() call on Sepolia.
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const addressPath = path.join(__dirname, "..", "deployed-address.json");
  if (!fs.existsSync(addressPath)) {
    throw new Error("deployed-address.json not found — deploy HeartbeatBeacon first.");
  }
  const { beaconAddress } = JSON.parse(fs.readFileSync(addressPath, "utf8"));

  const nodeId = process.env.NODE_ID || "1";
  console.log(`Pulsing beacon ${beaconAddress} for node ${nodeId}...`);

  const beacon = await hre.ethers.getContractAt("HeartbeatBeacon", beaconAddress);
  const tx = await beacon.pulse(nodeId);
  console.log("Transaction sent:", tx.hash);

  const receipt = await tx.wait();
  console.log("Confirmed in block:", receipt.blockNumber);
  console.log("\nWatch the worker terminal now — it should pick this up shortly.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});