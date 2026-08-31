// worker/src/worker.ts
//
// Watches HeartbeatBeacon on Sepolia for new Heartbeat events. For each one:
//   1. Wait until Creditcoin has attested the block containing that tx
//      (proofBuilder.waitUntilHeightAttested)
//   2. Fetch the inclusion proof (proofBuilder.getProof)
//   3. Submit chainKey/blockHeight/txBytes/merkleProof/continuityProof to
//      UptimeRegistry.recordHeartbeat() on Creditcoin
//
// This mirrors the SDK's documented end-to-end example exactly — see
// docs.creditcoin.org/attestcoin-protocol/dapp-builder-infrastructure/attestcoin-sdk-usc-sdk

import { JsonRpcProvider, Wallet, Contract, Interface } from 'ethers';
import { chainInfo, proofProvider } from '@gluwa/usc-sdk';
import 'dotenv/config';

const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL!;
const CREDITCOIN_RPC = process.env.CREDITCOIN_RPC_URL || 'https://rpc.cc3-testnet.creditcoin.network';
const PROOF_BUILDER_URL = process.env.PROOF_BUILDER_URL || 'https://proof-gen-api.cc3-testnet.creditcoin.network';
const BEACON_ADDRESS = process.env.BEACON_ADDRESS!;
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS!;
const WORKER_PRIVATE_KEY = process.env.WORKER_PRIVATE_KEY!;
const SEPOLIA_CHAIN_KEY = 1; // confirmed from Attestcoin Chains-Environments docs

const BEACON_ABI = [
  'event Heartbeat(uint256 indexed nodeId, uint256 timestamp, uint256 pulseIndex)',
];

// Struct shapes confirmed directly from @gluwa/usc-sdk's own .d.ts files
// (node_modules/@gluwa/usc-sdk/dist/proof-provider/{merkle,index}.d.ts):
//   MerkleProofEntry    { hash: string, isLeft: boolean }
//   TransactionMerkleProof { root: string, siblings: MerkleProofEntry[] }
//   ContinuityProof     { lowerEndpointDigest: string, roots: string[] }
// UptimeRegistry.sol's Solidity struct field names must match these exactly
// (hash/isLeft, not sibling/isLeft) once you fill in contracts/external/.
const REGISTRY_ABI = [
  'function recordHeartbeat(uint64 blockHeight, bytes encodedTransaction, tuple(bytes32 root, tuple(bytes32 hash, bool isLeft)[] siblings) merkleProof, tuple(bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) external returns (bool)',
];

async function main() {
  const sepoliaProvider = new JsonRpcProvider(SEPOLIA_RPC);
  const creditcoinProvider = new JsonRpcProvider(CREDITCOIN_RPC);
  const workerWallet = new Wallet(WORKER_PRIVATE_KEY, creditcoinProvider);

  const beacon = new Contract(BEACON_ADDRESS, BEACON_ABI, sepoliaProvider);
  const registry = new Contract(REGISTRY_ADDRESS, REGISTRY_ABI, workerWallet);

  const proofBuilder = new proofProvider.service.ProofBuilder(
    SEPOLIA_CHAIN_KEY,
    PROOF_BUILDER_URL,
    5000,
  );

  console.log('Worker started. Watching for Heartbeat events on Sepolia...');

  beacon.on('Heartbeat', async (nodeId, timestamp, pulseIndex, event) => {
    const txHash = event.log.transactionHash;
    console.log(`Heartbeat seen: node ${nodeId}, tx ${txHash}. Waiting for attestation...`);

    try {
      const tx = await sepoliaProvider.getTransaction(txHash);
      const blockNumber = tx!.blockNumber!;

      await proofBuilder.waitUntilHeightAttested(SEPOLIA_CHAIN_KEY, blockNumber);
      console.log(`Block ${blockNumber} attested. Generating proof for ${txHash}...`);

      const result = await proofBuilder.getProof(txHash);
      if (!result.success || !result.data) {
        throw new Error(`Proof generation failed: ${result.error}`);
      }

      const { headerNumber, txBytes, merkleProof, continuityProof } = result.data;

      const submitTx = await registry.recordHeartbeat(
        headerNumber,
        txBytes,
        merkleProof,
        continuityProof,
      );
      const receipt = await submitTx.wait();
      console.log(`recordHeartbeat submitted for node ${nodeId}: ${receipt.hash}`);
    } catch (err) {
      console.error(`Failed to process heartbeat for node ${nodeId}, tx ${txHash}:`, (err as Error).message);
    }
  });
}

main().catch(console.error);
