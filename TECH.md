# Sentinel — Technical Documentation

> **Hackathon-stage software.** Contracts follow standard patterns (replay
> protection, checked external calls, no admin backdoor on scoring) but
> have **not** undergone an external security audit. Do not deploy with
> meaningful value before one.

## Architecture overview

```
+------------------+     +---------------------+     +------------------------+
| Ethereum Sepolia |     | Attestcoin Protocol  |     | Creditcoin CC3 Testnet |
| HeartbeatBeacon  |     | (Block Prover        |     | UptimeRegistry (ASC)   |
| .pulse(nodeId)   +---->| Precompile, 0x...FD2)+---->| .recordHeartbeat()     |
+------------------+     +---------------------+     +------------------------+
        ^                                                       |
        |                                                       v
+------------------+                                  +------------------------+
| Node simulator /  |                                  | sentinel-dashboard     |
| real node client  |                                  | (reads live on-chain   |
+------------------+                                  |  state, no mock data)  |
                                                        +------------------------+
```

## Contracts

### `HeartbeatBeacon.sol` (Ethereum Sepolia)

Minimal by design — one function, one event:

```solidity
function pulse(uint256 nodeId) external {
    uint256 idx = ++pulseCount[nodeId];
    emit Heartbeat(nodeId, block.timestamp, idx);
}
```

This is deliberately the *only* thing a node needs to do to prove liveness:
send a transaction. Everything else — proof generation, verification,
scoring — happens off-chain and on Creditcoin. The beacon carries no
business logic, so there's nothing here that could be gamed; the only
thing that matters is that this is a real, mined Sepolia transaction.

### `UptimeRegistry.sol` (Creditcoin CC3 Testnet — the ASC)

This is the Attestcoin Smart Contract. The core function:

```solidity
function recordHeartbeat(
    uint64 blockHeight,
    bytes calldata encodedTransaction,
    INativeQueryVerifier.MerkleProof calldata merkleProof,
    INativeQueryVerifier.ContinuityProof calldata continuityProof
) external returns (bool success)
```

Execution order, all in one atomic transaction:

1. **Replay check** — `keccak256(chainKey, blockHeight, encodedTransaction)`
   must not already be in `processedQueries`.
2. **Synchronous verification** — calls
   `INativeQueryVerifier.verifyAndEmit()` against the Block Prover
   Precompile. This is the actual Attestcoin call: it checks Merkle
   inclusion and chain continuity for the given Sepolia block, in the same
   transaction, no async step.
3. **Success check** — the precompile only proves *inclusion*, not that
   the source transaction succeeded. `EvmV1Decoder.decodeReceiptFields()`
   is used to confirm `receiptStatus == 1`. Skipping this check would let
   a *failed* Sepolia transaction still count as a valid heartbeat — this
   is called out explicitly in Creditcoin's own ASC documentation as a
   required check, and it's enforced here.
4. **Event extraction** — `EvmV1Decoder.getLogsByEventSignature()` pulls
   the `Heartbeat` log out of the verified transaction's receipt, and the
   contract confirms the log's `address_` field matches the known
   `HeartbeatBeacon` address — not just any event with a matching
   signature, the *right* contract's event.
5. **Business logic** — only after all of the above, `verifiedHeartbeats`
   is incremented for that node.

Separately, `reportClaimedHeartbeat(nodeId)` lets a node self-report with
no proof required at all — this exists specifically as the "lie" path, so
`isSuspicious()` has something to compare against:

```solidity
function isSuspicious(uint256 nodeId) external view returns (bool) {
    NodeStatus memory n = nodes[nodeId];
    return n.claimedHeartbeats > n.verifiedHeartbeats + 2;
}
```

## Why atomic verification matters here

A weaker design would have the off-chain worker verify the proof itself
and then just tell the contract "this one's good, trust me." That
reintroduces exactly the trust problem Sentinel exists to remove — a
centralized process asserting truth. By calling the precompile directly
inside `recordHeartbeat()`, verification and state change happen in the
same transaction: there is no step where you have to trust anything other
than the chain itself.

## Off-chain worker

`worker/src/worker.ts` (continuous) and
`worker/src/process-heartbeat.ts` (one-shot, used for the demo) both
follow the same flow, using `@gluwa/usc-sdk`'s `ProofBuilder`:

1. Detect a `Heartbeat` event on Sepolia (or take a known tx hash).
2. `proofBuilder.waitUntilHeightAttested(chainKey, blockNumber)` — polls
   until Creditcoin has attested the block containing that transaction.
3. `proofBuilder.getProof(txHash)` — fetches the real Merkle proof and
   continuity proof from Attestcoin's proof service.
4. Submit `recordHeartbeat()` to `UptimeRegistry` with the returned proof.

The worker holds no special authority — it's a relayer, not a trusted
party. Anyone could run this same code and submit the same proof; nothing
about the design depends on this specific worker instance being honest.

## Security considerations

- **Replay protection** — `processedQueries` mapping keyed on
  `(chainKey, blockHeight, encodedTransaction)` prevents the same Sepolia
  transaction from being submitted twice.
- **Source authenticity** — verifying `logs[i].address_ == BEACON_ADDRESS`
  prevents a proof for an unrelated transaction (that happens to emit a
  same-shaped event) from being accepted.
- **Receipt status check** — prevents a reverted/failed Sepolia
  transaction from counting as a valid heartbeat.
- **No admin backdoor on scoring** — there is no owner-only function that
  can directly set `verifiedHeartbeats`; the only path to a higher score
  is through a real, verified proof.

## Roadmap

Known next steps, in rough priority order:

- **On-chain node identity** — bind a node ID to a signature proving the
  caller actually controls it, closing the gap noted below under Known
  limitations.
- **Multi-source-chain support** — `INativeQueryVerifier` is already
  chain-agnostic; adding a second supported source chain (beyond Sepolia)
  is a config change to the worker and a new `chainKey`, not a redesign.
- **Worker resilience** — crash-resume state persistence (last processed
  block, pending/done heartbeats), bounded retry with backoff, and graceful
  shutdown on SIGINT/SIGTERM. The current worker is correct but minimal;
  a production deployment would run it as a hardened long-lived service
  rather than a one-shot script.
- **Reward/incentive layer** — the dashboard's reliability tiers are
  currently a read-only view over verified state. A natural extension is
  making tier eligibility gate an actual on-chain reward or stake
  mechanism, not just a UI badge.
- **Multi-verifier consensus for high-stakes nodes** — for nodes where a
  false positive matters more, require agreement from more than one
  independent worker before crediting a heartbeat, rather than trusting
  any single relayer to submit correctly.

## Known limitations (current design tradeoffs)

- Node IDs are currently just numbers a node operator chooses when
  calling `pulse()` — there's no on-chain identity binding yet (see
  Roadmap above: node identity binding is the fix, similar to how
  HashCredit binds a BTC address via `claimBtcAddress()`).
- Tiers shown in the dashboard are computed client-side from verified
  on-chain data, not stored on-chain themselves. This was a deliberate
  choice, not an oversight — adding it on-chain would have meant
  redeploying `UptimeRegistry` this late in the build, losing the
  already-proven live transaction history. The tradeoff: tiers are
  transparent and reproducible by anyone reading the same on-chain data,
  just not enforced by the contract itself yet.
- Currently one source chain (Sepolia) is wired up end-to-end, even
  though the underlying verifier interface already supports more (see
  Roadmap above).
