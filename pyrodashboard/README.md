# Pyro Dashboard

Reads live from the real deployed contracts  no mock data anywhere.

## Run locally

```powershell
npm install
npm run dev
```

Opens on http://localhost:5173 by default.

## What it shows

- **Hero proof chain**  the actual Sepolia -> Attestcoin -> Creditcoin flow,
  with the most recent verified heartbeat's real transaction linked.

- **Verify it yourself**  paste a real Sepolia transaction hash and get
  an honest answer on whether it was genuinely Attestcoin-verified,
  reading a manifest the worker writes directly at the moment it
  processes each real heartbeat (public/sepolia-map.json)  not a
  derivation, a fact recorded at the source.
(example sepolia hash: 0x22ca8f0516d5b1e2a0d8afccf114085ffe7305ce22953b3f6a2861bb48a3f943)

- **Node grid**  every node that has ever pulsed, discovered automatically
  from on-chain events (not hardcoded). Each card shows a dual waveform:
  solid cyan for Attestcoin-verified heartbeats, dashed amber for
  self-reported claims. A node whose claims outpace its proofs gets a
  visible red border and a FLAGGED badge, which is isSuspicious() read
  directly from the contract. Each card also shows a reliability tier and,
  where it applies, a Reward eligible badge sourced from the RewardGate
  contract's isEligible() call.

- **Live feed**  the 12 most recent verified/claimed events, each linking
  to the real Creditcoin explorer transaction.

## Before your demo

- src/config.js has the deployed contract addresses hardcoded. If you
  redeploy any of the three contracts, update REGISTRY_ADDRESS,
  BEACON_ADDRESS, or REWARD_GATE_ADDRESS there.
- START_BLOCK is set near the actual deployment block so event scans
  don't crawl all of CC3 Testnet's history. If events ever stop showing up,
  double check this hasn't drifted.
- public/sepolia-map.json is written by the worker (process-heartbeat.ts)
  whenever it processes a real heartbeat. If you want the verify-lookup
  search to recognize a new transaction, run the worker on it, then commit
  and redeploy so the updated file goes live.
- Data refreshes every 15s automatically (see POLL_INTERVAL_MS in config).

## Deploy

Same flow as your other projects  push to GitHub, deploy on Vercel:

```powershell
npm install -g vercel
vercel
```
