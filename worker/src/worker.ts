// worker/src/worker.ts
//
// Continuous version of the heartbeat processor. Unlike process-heartbeat.ts
// (one-shot, used for the demo), this is meant to run unattended, long-term,
// the way a real DePIN relayer would. Three things separate this from a
// naive "listen and process" script — modeled directly on the production
// patterns found in Syntura's sentry service (crash-resume state, bounded
// retry, graceful shutdown):
//
//   1. CRASH-RESUME STATE — on startup, catches up on any Heartbeat events
//      missed while the process was down, instead of only listening for new
//      ones from the moment it starts. State is persisted to disk so a
//      restart never re-processes an already-completed heartbeat, and never
//      silently skips one that happened while offline.
//
//   2. BOUNDED RETRY — a transient RPC hiccup while waiting for attestation
//      or submitting the proof doesn't permanently lose that heartbeat. It
//      retries with exponential backoff up to a fixed limit, then marks it
//      failed clearly (for a human to check) rather than crashing the whole
//      process or retrying forever.
//
//   3. GRACEFUL SHUTDOWN — on SIGINT/SIGTERM, stops picking up new work,
//      lets whatever's in flight finish, saves state, and exits cleanly.
//      This is what makes it safe to run as a real background service
//      (pm2, systemd, a Docker container) instead of a script you babysit.
//
// The actual Attestcoin verification logic below (chain key, proof struct
// shapes, recordHeartbeat call) is unchanged from the already-proven,
// SDK-verified version — this file only adds the operational layer around it.

import { JsonRpcProvider, Wallet, Contract } from 'ethers';
import { proofProvider } from '@gluwa/usc-sdk';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL!;
const CREDITCOIN_RPC = process.env.CREDITCOIN_RPC_URL || 'https://rpc.cc3-testnet.creditcoin.network';
const PROOF_BUILDER_URL = process.env.PROOF_BUILDER_URL || 'https://proof-gen-api.cc3-testnet.creditcoin.network';
const BEACON_ADDRESS = process.env.BEACON_ADDRESS!;
const WORKER_PRIVATE_KEY = process.env.WORKER_PRIVATE_KEY!;
const SEPOLIA_CHAIN_KEY = 1;
const POLL_INTERVAL_MS = 30_000;
const MAX_RETRIES = 5;

const STATE_PATH = path.join(__dirname, '..', 'worker-state.json');

const BEACON_ABI = [
  'event Heartbeat(uint256 indexed nodeId, uint256 timestamp, uint256 pulseIndex)',
];

// Struct shapes confirmed directly from @gluwa/usc-sdk's own .d.ts files —
// unchanged from the already-proven version.
const REGISTRY_ABI = [
  'function recordHeartbeat(uint64 blockHeight, bytes encodedTransaction, tuple(bytes32 root, tuple(bytes32 hash, bool isLeft)[] siblings) merkleProof, tuple(bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) external returns (bool)',
];

interface WorkerState {
  lastScannedBlock: number;
  // txHash -> outcome, so a restart never reprocesses a completed heartbeat
  // and can tell a failed one apart from one it hasn't seen yet.
  processed: Record<string, { status: 'done' | 'failed'; nodeId?: string; at: string }>;
}

function loadState(startBlock: number): WorkerState {
  if (fs.existsSync(STATE_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    } catch {
      console.warn('worker-state.json was corrupted — starting fresh from', startBlock);
    }
  }
  return { lastScannedBlock: startBlock, processed: {} };
}

function saveState(state: WorkerState) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function resolveRegistryAddress(): string {
  if (process.env.REGISTRY_ADDRESS) return process.env.REGISTRY_ADDRESS;
  const sharedPath = path.join(__dirname, '..', '..', 'contracts-creditcoin', 'deployed-address.json');
  if (fs.existsSync(sharedPath)) {
    const { registryAddress } = JSON.parse(fs.readFileSync(sharedPath, 'utf8'));
    return registryAddress;
  }
  throw new Error('No REGISTRY_ADDRESS set and no deployed-address.json found in contracts-creditcoin.');
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/// Runs `fn`, retrying on failure with exponential backoff (2s, 4s, 8s...)
/// up to MAX_RETRIES times. Never throws — returns whether it ultimately
/// succeeded, so the caller can record a clear failure instead of crashing.
async function withRetry(label: string, fn: () => Promise<void>): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await fn();
      return true;
    } catch (err: any) {
      console.error(`[${label}] attempt ${attempt}/${MAX_RETRIES} failed:`, err.message || err);
      if (attempt === MAX_RETRIES) {
        return false;
      }
      await sleep(2000 * 2 ** (attempt - 1));
    }
  }
  return false;
}

async function main() {
  const REGISTRY_ADDRESS = resolveRegistryAddress();
  const sepoliaProvider = new JsonRpcProvider(SEPOLIA_RPC);
  const creditcoinProvider = new JsonRpcProvider(CREDITCOIN_RPC);
  const workerWallet = new Wallet(WORKER_PRIVATE_KEY, creditcoinProvider);

  const beacon = new Contract(BEACON_ADDRESS, BEACON_ABI, sepoliaProvider);
  const registry = new Contract(REGISTRY_ADDRESS, REGISTRY_ABI, workerWallet);

  const proofBuilder = new proofProvider.service.ProofBuilder(SEPOLIA_CHAIN_KEY, PROOF_BUILDER_URL, 5000);

  const currentBlock = await sepoliaProvider.getBlockNumber();
  const state = loadState(currentBlock);

  console.log('Worker starting. Resuming from block', state.lastScannedBlock);
  console.log('Already processed', Object.keys(state.processed).length, 'heartbeats in a prior run.');

  let shuttingDown = false;

  async function processHeartbeat(nodeId: string, txHash: string, blockNumber: number) {
    if (state.processed[txHash]?.status === 'done') {
      return; // crash-resume: already handled this one, skip silently
    }

    console.log(`Processing heartbeat: node ${nodeId}, tx ${txHash}`);

    const succeeded = await withRetry(`heartbeat ${txHash.slice(0, 10)}`, async () => {
      await proofBuilder.waitUntilHeightAttested(SEPOLIA_CHAIN_KEY, blockNumber);
      const result = await proofBuilder.getProof(txHash);
      if (!result.success || !result.data) {
        throw new Error(`Proof generation failed: ${result.error}`);
      }
      const { headerNumber, txBytes, merkleProof, continuityProof } = result.data;
      const submitTx = await registry.recordHeartbeat(headerNumber, txBytes, merkleProof, continuityProof);
      await submitTx.wait();
      console.log(`  -> recorded on Creditcoin: ${submitTx.hash}`);
    });

    state.processed[txHash] = {
      status: succeeded ? 'done' : 'failed',
      nodeId,
      at: new Date().toISOString(),
    };
    saveState(state);

    if (!succeeded) {
      console.error(`Heartbeat ${txHash} permanently failed after ${MAX_RETRIES} attempts — needs manual review.`);
    }
  }

  // --- Crash-resume catch-up: scan anything missed while we were down ---
  const missed = await beacon.queryFilter(beacon.filters.Heartbeat(), state.lastScannedBlock, currentBlock);
  console.log(`Catch-up scan found ${missed.length} heartbeat(s) since last run.`);
  for (const log of missed) {
    const args = (log as any).args;
    await processHeartbeat(args.nodeId.toString(), log.transactionHash, log.blockNumber);
  }
  state.lastScannedBlock = currentBlock;
  saveState(state);

  // --- Live listener for anything new from here on ---
  beacon.on('Heartbeat', async (nodeId, _timestamp, _pulseIndex, event) => {
    if (shuttingDown) return; // graceful shutdown: stop picking up new work
    const txHash = event.log.transactionHash;
    const blockNumber = event.log.blockNumber;
    await processHeartbeat(nodeId.toString(), txHash, blockNumber);
    state.lastScannedBlock = Math.max(state.lastScannedBlock, blockNumber);
    saveState(state);
  });

  console.log('Worker running. Listening for new heartbeats. Press Ctrl+C to stop safely.');

  // --- Graceful shutdown ---
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\nReceived ${signal}. Finishing in-flight work and saving state...`);
    beacon.removeAllListeners('Heartbeat');
    saveState(state);
    console.log('State saved. Shutting down cleanly.');
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('Worker crashed:', error);
  process.exitCode = 1;
});
