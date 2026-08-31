// scripts/deploy.js — deploys HeartbeatBeacon to Sepolia
//
// Usage:
//   npx hardhat run scripts/deploy.js --network sepolia
//
// Requires .env in this folder:
//   SEPOLIA_RPC_URL=https://...        (e.g. from Alchemy/Infura)
//   DEPLOYER_PRIVATE_KEY=0x...         (your funded dev wallet's private key)

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying HeartbeatBeacon with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  const HeartbeatBeacon = await hre.ethers.getContractFactory("HeartbeatBeacon");
  const beacon = await HeartbeatBeacon.deploy();
  await beacon.waitForDeployment();

  const address = await beacon.getAddress();
  console.log("HeartbeatBeacon deployed to:", address);

  // Save the address so contracts-creditcoin's deploy script can pick it up
  // automatically without you having to copy/paste it by hand.
  const outPath = path.join(__dirname, "..", "deployed-address.json");
  fs.writeFileSync(outPath, JSON.stringify({ beaconAddress: address, network: "sepolia" }, null, 2));
  console.log("Saved address to", outPath);

  console.log("\nVerify on Etherscan (optional):");
  console.log(`npx hardhat verify --network sepolia ${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
