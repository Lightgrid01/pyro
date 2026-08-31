// scripts/deploy.js — deploys UptimeRegistry (the ASC) to Creditcoin CC3 Testnet
//
// Usage:
//   npx hardhat run scripts/deploy.js --network creditcoin_testnet
//
// Requires .env in this folder:
//   CREDITCOIN_RPC_URL=https://rpc.cc3-testnet.creditcoin.network
//   DEPLOYER_PRIVATE_KEY=0x...              (same funded dev wallet, now needs tCTC)
//   BEACON_ADDRESS=0x...                    (optional override — see below)
//
// If BEACON_ADDRESS is not set, this script automatically reads the address
// saved by ../contracts-sepolia/scripts/deploy.js, so you don't have to
// copy/paste it by hand as long as you deployed the beacon first.

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function resolveBeaconAddress() {
  if (process.env.BEACON_ADDRESS) {
    return process.env.BEACON_ADDRESS;
  }
  const sharedPath = path.join(__dirname, "..", "..", "contracts-sepolia", "deployed-address.json");
  if (fs.existsSync(sharedPath)) {
    const { beaconAddress } = JSON.parse(fs.readFileSync(sharedPath, "utf8"));
    console.log("Using beacon address from contracts-sepolia deployment:", beaconAddress);
    return beaconAddress;
  }
  throw new Error(
    "No beacon address found. Deploy HeartbeatBeacon.sol first (contracts-sepolia), " +
    "or set BEACON_ADDRESS in this project's .env manually."
  );
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying UptimeRegistry with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "tCTC");

  const beaconAddress = await resolveBeaconAddress();

  const UptimeRegistry = await hre.ethers.getContractFactory("UptimeRegistry");
  const registry = await UptimeRegistry.deploy(beaconAddress);
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("UptimeRegistry deployed to:", address);
  console.log("Constructor arg (beacon address):", beaconAddress);

  const outPath = path.join(__dirname, "..", "deployed-address.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify({ registryAddress: address, beaconAddress, network: "creditcoin_testnet" }, null, 2)
  );
  console.log("Saved address to", outPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
