// scripts/deploy-reward-gate.js — deploys RewardGate on Creditcoin CC3 Testnet,
// wired to the already-deployed UptimeRegistry. Does not touch or redeploy
// UptimeRegistry itself — this is purely additive.
//
// Usage:
//   npx hardhat run scripts/deploy-reward-gate.js --network creditcoin_testnet

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const addressPath = path.join(__dirname, "..", "deployed-address.json");
  if (!fs.existsSync(addressPath)) {
    throw new Error("deployed-address.json not found — deploy UptimeRegistry first.");
  }
  const { registryAddress } = JSON.parse(fs.readFileSync(addressPath, "utf8"));

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying RewardGate with account:", deployer.address);
  console.log("Wired to existing UptimeRegistry:", registryAddress);

  const RewardGate = await hre.ethers.getContractFactory("RewardGate");
  const gate = await RewardGate.deploy(registryAddress);
  await gate.waitForDeployment();

  const address = await gate.getAddress();
  console.log("RewardGate deployed to:", address);

  const existing = JSON.parse(fs.readFileSync(addressPath, "utf8"));
  existing.rewardGateAddress = address;
  fs.writeFileSync(addressPath, JSON.stringify(existing, null, 2));
  console.log("Saved rewardGateAddress into deployed-address.json");

  console.log("\nQuick sanity check:");
  console.log("  npx hardhat console --network creditcoin_testnet");
  console.log(`  const g = await ethers.getContractAt("RewardGate", "${address}")`);
  console.log("  await g.isEligible(1)   // should return true — node 1 has a verified heartbeat");
  console.log("  await g.isEligible(99)  // should return false — node 99 is flagged");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
