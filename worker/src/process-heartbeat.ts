// src/process-heartbeat.ts
//
// One-shot version of the worker: takes a Sepolia tx hash on the command
// line, waits for Attestcoin attestation, generates the proof, and submits
// it to UptimeRegistry.recordHeartbeat() on Creditcoin. Easier to debug
// step-by-step than the always-on worker.ts listener.
//
// Usage:
//   npx ts-node src/process-heartbeat.ts 0xTX_HASH_FROM_PULSE_SCRIPT

import { JsonRpcProvider, Wallet, Contract } from 'ethers';
import { proofProvider } from '@gluwa/usc-sdk';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL!;
const CREDITCOIN_RPC = process.env.CREDITCOIN_RPC_URL || 'https://rpc.cc3-testnet.creditcoin.network';
const PROOF_BUILDER_URL = process.env.PROOF_BUILDER_URL || 'https://proof-gen-api.cc3-testnet.creditcoin.network';
const WORKER_PRIVATE_KEY = process.env.WORKER_PRIVATE_KEY!;
const SEPOLIA_CHAIN_KEY = 1;

const REGISTRY_ABI = [
  'function recordHeartbeat(uint64 blockHeight, bytes encodedTransaction, tuple(bytes32 root, tuple(bytes32 hash, bool isLeft)[] siblings) merkleProof, tuple(bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) external returns (bool)',
  'function nodes(uint256) view returns (uint256 verifiedHeartbeats, uint256 lastVerifiedTimestamp, uint256 claimedHeartbeats)',
  'function isSuspicious(uint256 nodeId) view returns (bool)',
  'event HeartbeatVerified(uint256 indexed nodeId, uint256 sourceTimestamp, uint256 verifiedCount)',
];

function resolveRegistryAddress(): string {
  if (process.env.REGISTRY_ADDRESS) return process.env.REGISTRY_ADDRESS;
  const sharedPath = path.join(__dirname, '..', '..', 'contracts-creditcoin', 'deployed-address.json');
  if (fs.existsSync(sharedPath)) {
    const { registryAddress } = JSON.parse(fs.readFileSync(sharedPath, 'utf8'));
    return registryAddress;
  }
  throw new Error('No REGISTRY_ADDRESS set and no deployed-address.json found in contracts-creditcoin.');
}

interface SepoliaMappingEntry {
  nodeId: string;
  creditcoinTxHash: string;
  verifiedCount: number;
  sourceTimestamp: number;
}

// Written directly into the dashboard's public folder, next to it as a
// sibling project — the dashboard just fetches this static file, no
// on-chain decoding required. This script is the one place that genuinely
// knows the real Sepolia tx hash (it's our own command-line input above),
// so recording it here is a fact, not a derivation.
function recordSepoliaMapping(sepoliaTxHash: string, entry: SepoliaMappingEntry) {
  const mapPath = path.join(__dirname, '..', '..', 'sentineldashboard', 'public', 'sepolia-map.json');
  let map: Record<string, SepoliaMappingEntry> = {};

  if (fs.existsSync(mapPath)) {
    try {
      map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    } catch {
      console.warn('sepolia-map.json existed but was not valid JSON — starting fresh.');
      map = {};
    }
  }

  map[sepoliaTxHash.toLowerCase()] = entry;

  fs.mkdirSync(path.dirname(mapPath), { recursive: true });
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 2));
  console.log('Recorded Sepolia hash mapping to', mapPath);
}

async function main() {
  const txHash = process.argv[2];
  if (!txHash) {
    console.error('Usage: npx ts-node src/process-heartbeat.ts <sepolia-tx-hash>');
    process.exit(1);
  }

  const REGISTRY_ADDRESS = resolveRegistryAddress();
  const sepoliaProvider = new JsonRpcProvider(SEPOLIA_RPC);
  const creditcoinProvider = new JsonRpcProvider(CREDITCOIN_RPC);
  const workerWallet = new Wallet(WORKER_PRIVATE_KEY, creditcoinProvider);
  const registry = new Contract(REGISTRY_ADDRESS, REGISTRY_ABI, workerWallet);

  console.log('Registry address:', REGISTRY_ADDRESS);
  console.log('Processing tx:', txHash);

  const tx = await sepoliaProvider.getTransaction(txHash);
  if (!tx || !tx.blockNumber) {
    throw new Error('Transaction not found or not yet mined on Sepolia.');
  }
  const blockNumber = tx.blockNumber;
  console.log('Found in Sepolia block:', blockNumber);

  const proofBuilder = new proofProvider.service.ProofBuilder(SEPOLIA_CHAIN_KEY, PROOF_BUILDER_URL, 10000);

  console.log('Waiting for Creditcoin to attest this block... (can take a couple minutes)');
  await proofBuilder.waitUntilHeightAttested(SEPOLIA_CHAIN_KEY, blockNumber);
  console.log('Block attested. Fetching proof...');

  const result = await proofBuilder.getProof(txHash);
  if (!result.success || !result.data) {
    throw new Error(`Proof generation failed: ${result.error}`);
  }
  const { headerNumber, txBytes, merkleProof, continuityProof } = result.data;
  console.log('Proof received. headerNumber:', headerNumber);

  console.log('Submitting recordHeartbeat() to Creditcoin...');
  const submitTx = await registry.recordHeartbeat(headerNumber, txBytes, merkleProof, continuityProof);
  console.log('Submitted:', submitTx.hash);

  const receipt = await submitTx.wait();
  console.log('Confirmed in Creditcoin block:', receipt.blockNumber);

  const parsedEvent = receipt.logs
    .map((log: any) => {
      try { return registry.interface.parseLog(log); } catch { return null; }
    })
    .find((e: any) => e && e.name === 'HeartbeatVerified');

  if (parsedEvent) {
    console.log('\n✅ HeartbeatVerified event confirmed on-chain:');
    console.log('   nodeId:', parsedEvent.args.nodeId.toString());
    console.log('   sourceTimestamp:', parsedEvent.args.sourceTimestamp.toString());
    console.log('   verifiedCount:', parsedEvent.args.verifiedCount.toString());

    // Record the Sepolia hash -> verification mapping directly, since this
    // script is the one place that genuinely knows the real Sepolia tx hash
    // (it's our own input above). No decoding, no derivation — just the
    // facts, written where the dashboard can read them.
    recordSepoliaMapping(txHash, {
      nodeId: parsedEvent.args.nodeId.toString(),
      creditcoinTxHash: submitTx.hash,
      verifiedCount: Number(parsedEvent.args.verifiedCount),
      sourceTimestamp: Number(parsedEvent.args.sourceTimestamp),
    });
  } else {
    console.log('\n⚠️  No HeartbeatVerified event found in the receipt logs — check manually.');
  }

  const nodeStatus = await registry.nodes(1);
  console.log('\nNode 1 status on-chain:');
  console.log('   verifiedHeartbeats:', nodeStatus.verifiedHeartbeats.toString());
  console.log('   lastVerifiedTimestamp:', nodeStatus.lastVerifiedTimestamp.toString());
  console.log('   claimedHeartbeats:', nodeStatus.claimedHeartbeats.toString());
}

main().catch((error) => {
  console.error('Failed:', error.message || error);
  process.exitCode = 1;
});
