// simulator/src/simulate-nodes.ts
//
// Simulates a small DePIN fleet. Each "node" is really just a funded Sepolia
// wallet. Honest nodes call HeartbeatBeacon.pulse(nodeId) AND report the same
// count via UptimeRegistry.reportClaimedHeartbeat(nodeId) on Creditcoin.
//
// One node (LIAR_NODE_ID) only calls reportClaimedHeartbeat — it never sends
// a real Sepolia transaction. Once the worker has processed a few rounds,
// UptimeRegistry.isSuspicious(LIAR_NODE_ID) flips true, because its claimed
// count outpaces its verified count. That's the demo moment.

import { JsonRpcProvider, Wallet, Contract } from 'ethers';
import 'dotenv/config';

const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL!;
const CREDITCOIN_RPC = process.env.CREDITCOIN_RPC_URL || 'https://rpc.cc3-testnet.creditcoin.network';
const BEACON_ADDRESS = process.env.BEACON_ADDRESS!;
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS!;

// Each node needs its own funded key on both chains (or reuse one funded
// key across all simulated nodes for simplicity — fine for a demo).
const NODE_KEYS: string[] = (process.env.NODE_PRIVATE_KEYS || '').split(',').filter(Boolean);
const LIAR_NODE_ID = Number(process.env.LIAR_NODE_ID || '99');
const PULSE_INTERVAL_MS = Number(process.env.PULSE_INTERVAL_MS || 60_000);

const BEACON_ABI = ['function pulse(uint256 nodeId) external'];
const REGISTRY_ABI = ['function reportClaimedHeartbeat(uint256 nodeId) external'];

async function main() {
  const sepoliaProvider = new JsonRpcProvider(SEPOLIA_RPC);
  const creditcoinProvider = new JsonRpcProvider(CREDITCOIN_RPC);

  const nodes = NODE_KEYS.map((pk, i) => ({
    nodeId: i + 1,
    sepoliaWallet: new Wallet(pk, sepoliaProvider),
    creditcoinWallet: new Wallet(pk, creditcoinProvider),
  }));

  console.log(`Simulating ${nodes.length} nodes. Liar node ID: ${LIAR_NODE_ID}`);

  setInterval(async () => {
    for (const node of nodes) {
      const isLiar = node.nodeId === LIAR_NODE_ID;
      try {
        if (!isLiar) {
          // Honest node: real Sepolia heartbeat
          const beacon = new Contract(BEACON_ADDRESS, BEACON_ABI, node.sepoliaWallet);
          const tx = await beacon.pulse(node.nodeId);
          console.log(`[node ${node.nodeId}] Sepolia pulse tx: ${tx.hash}`);
        }

        // Everyone (including the liar) self-reports on Creditcoin — no
        // proof required for this call, which is exactly the point.
        const registry = new Contract(REGISTRY_ADDRESS, REGISTRY_ABI, node.creditcoinWallet);
        const claimTx = await registry.reportClaimedHeartbeat(node.nodeId);
        console.log(`[node ${node.nodeId}] claimed heartbeat tx: ${claimTx.hash}${isLiar ? '  <-- LIAR, no real Sepolia tx behind this' : ''}`);
      } catch (err) {
        console.error(`[node ${node.nodeId}] error:`, (err as Error).message);
      }
    }
  }, PULSE_INTERVAL_MS);
}

main().catch(console.error);
