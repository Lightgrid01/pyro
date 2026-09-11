# Pyro

**An attested uptime registry for DePIN networks, built on the Attestcoin Protocol.**

DePIN networks (decentralized physical infrastructure — sensor networks, node
operators, hardware providers) have a trust problem: most reward systems
just trust whatever a node self-reports about its uptime. Nothing stops an
operator from lying to farm rewards.

Sentinel fixes this by requiring every uptime claim to be backed by a real,
cryptographically verified cross-chain transaction — not a self-report.

```
Node sends real tx on Ethereum Sepolia
        |
        v
Attestcoin Protocol verifies inclusion (Block Prover Precompile, one block, ~15s)
        |
        v
UptimeRegistry on Creditcoin credits verified uptime
        |
        v
A node that only self-reports (no real tx) gets flagged automatically
```

## The problem

DePIN reward systems (Helium, IoTeX, and most others) rely on nodes
self-reporting liveness to a centralized or semi-trusted backend. A node
operator who wants to farm rewards without actually running real
infrastructure just... reports good numbers. There is no trustless way to
tell the difference between a node that is actually online and one that is
lying, without a centralized auditor.

## The solution

Sentinel requires every uptime claim to be backed by a real transaction on
a source chain (Ethereum Sepolia), verified through Creditcoin's Attestcoin
Protocol before it counts toward a node's score.

1. A node proves liveness by sending a transaction to `HeartbeatBeacon` on
   Sepolia — a real, mined transaction, not a signed message or an API call.
2. An off-chain worker waits for Creditcoin to attest the block containing
   that transaction, then fetches a real inclusion proof from Attestcoin's
   proof service.
3. The proof is submitted to `UptimeRegistry`, an Attestcoin Smart Contract
   (ASC) on Creditcoin. The contract calls the Block Prover Precompile to
   verify the proof **in the same transaction** — synchronous, one block,
   no async waiting, no oracle, no bridge.
4. Only after verification succeeds does the node's `verifiedHeartbeats`
   count increase.
5. Nodes can also self-report claims (`reportClaimedHeartbeat`) with no
   proof required — this exists specifically so the contract can compare
   claimed vs. verified and flag nodes whose claims outpace their proof
   (`isSuspicious()`).

This has been proven end-to-end on live testnets, not just designed on
paper — see **Proof it works**, below.

## Attestcoin Protocol integration

This is the core of the project, not a bolted-on feature.

- **Source chain:** Ethereum Sepolia (`chainKey = 1` on Creditcoin CC3
  Testnet)
- **Verification path:** `UptimeRegistry.recordHeartbeat()` calls
  `INativeQueryVerifier.verifyAndEmit()` against the Block Prover
  Precompile (`0x0000000000000000000000000000000000000FD2`), synchronously,
  in the same transaction as the business logic that updates the score.
- **Why this matters:** the verification and the state change happen
  atomically. There is no window where a proof is "pending" — either the
  transaction proves inclusion and updates the score, or it reverts.
- **Replay protection:** every verified transaction is hashed
  (`chainKey + blockHeight + encodedTransaction`) and recorded in
  `processedQueries`, so the same Sepolia transaction can never be
  double-counted.
- **Event decoding:** the contract uses `EvmV1Decoder` (from
  `@gluwa/usc-contracts`) to extract the `Heartbeat` event's `nodeId` and
  `timestamp` directly from the verified transaction's logs, and confirms
  the log actually originated from our known `HeartbeatBeacon` address —
  not just any transaction, the *right* transaction.
- **Off-chain proof generation:** the worker (`worker/src/worker.ts`,
  `worker/src/process-heartbeat.ts`) uses `@gluwa/usc-sdk`'s
  `ProofBuilder` to wait for attestation and fetch the real Merkle +
  continuity proof, exactly as documented in Creditcoin's SDK reference.

Full technical detail: [`TECH.md`](./TECH.md) (contract-by-contract
breakdown, gas notes, and design decisions).

## Proof it works

These are real, live, currently-verifiable transactions — not staged for
this README.

| What | Transaction |
| --- | --- |
| Node heartbeat on Sepolia | [`0x22ca8f05...48a3f943`](https://sepolia.etherscan.io/tx/0x22ca8f0516d5b1e2a0d8afccf114085ffe7305ce22953b3f6a2861bb48a3f943) |
| Same heartbeat, verified on Creditcoin | [`0x028f62cf...59444673f`](https://creditcoin-testnet.blockscout.com/tx/0x028f62cf8f900e1f0cfd7ab1f6acb7c9ee64e4bd1841b50d3520a5959444673f) |

A node that self-reported 3 claims with **zero** real Sepolia transactions
behind them was correctly flagged: `isSuspicious(99)` returns `true`,
`verifiedHeartbeats: 0`, `claimedHeartbeats: 3` — all on-chain, no manual
intervention.

## Deployed contracts

| Contract | Network | Address |
| --- | --- | --- |
| `HeartbeatBeacon` | Ethereum Sepolia | [`0xD3A97BcE1b0964e2959a08d37EE7F3A030CAED4c`](https://sepolia.etherscan.io/address/0xD3A97BcE1b0964e2959a08d37EE7F3A030CAED4c) |
| `UptimeRegistry` (ASC) | Creditcoin CC3 Testnet | [`0xa32659ec3c61E84adceF44cA34AD075949acAC97`](https://creditcoin-testnet.blockscout.com/address/0xa32659ec3c61E84adceF44cA34AD075949acAC97) |

## Project structure

```
contracts-sepolia/     HeartbeatBeacon.sol — the liveness ping nodes send
contracts-creditcoin/  UptimeRegistry.sol — the ASC that verifies proofs
worker/                Off-chain proof pipeline (watches, verifies, submits)
simulator/              Simulates a small fleet of nodes, incl. a "liar" node
sentinel-dashboard/     Live control-room UI reading real on-chain state
```

## Running it locally

Each subfolder has its own README/SETUP with exact steps. Short version:

```powershell
# 1. Deploy the beacon (Sepolia)
cd contracts-sepolia && npm install && npx hardhat run scripts/deploy.js --network sepolia

# 2. Deploy the registry (Creditcoin) — auto-picks up the beacon address
cd ..\contracts-creditcoin && npm install && npx hardhat run scripts/deploy.js --network creditcoin_testnet

# 3. Send a real heartbeat
cd ..\contracts-sepolia && npx hardhat run scripts/pulse.js --network sepolia

# 4. Process it through Attestcoin
cd ..\worker && npm install && npx ts-node src/process-heartbeat.ts <tx-hash-from-step-3>

# 5. View it live
cd ..\sentinel-dashboard && npm install && npm run dev
```

## Why DePIN, why Attestcoin

DePIN's core unsolved problem — proving a node is real and online without a
centralized auditor — is exactly the shape of problem Attestcoin's
cross-chain verification is built for. Most projects in this space bolt
attestation onto a broader product; Sentinel is deliberately narrow: one
hard trust problem, solved with real cryptographic verification, proven
live end-to-end on testnet.

## Built for BUIDL CTC 2026 Fall

Original work, built for this hackathon. Not a reuse of any prior project.
