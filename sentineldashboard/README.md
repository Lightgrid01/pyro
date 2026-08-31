# Sentinel Dashboard

Reads live from the real deployed contracts — no mock data anywhere.

## Run locally

```powershell
npm install
npm run dev
```

Opens on http://localhost:5173 by default.

## What it shows

- **Hero proof chain** — the actual Sepolia -> Attestcoin -> Creditcoin flow,
  with the most recent verified heartbeat's real transaction linked.
- **Node grid** — every node that has ever pulsed, discovered automatically
  from on-chain events (not hardcoded). Each card shows a dual waveform:
  solid cyan for Attestcoin-verified heartbeats, dashed amber for
  self-reported claims. A node whose claims outpace its proofs gets a
  visible red border and a FLAGGED badge -- this is isSuspicious() read
  directly from the contract.
- **Live feed** — the 12 most recent verified/claimed events, each linking
  to the real Creditcoin explorer transaction.

## Before your demo

- src/config.js has the deployed contract addresses hardcoded. If you
  redeploy either contract, update REGISTRY_ADDRESS / BEACON_ADDRESS there.
- START_BLOCK is set near the actual deployment block so event scans
  don't crawl all of CC3 Testnet's history. If events ever stop showing up,
  double check this hasn't drifted.
- Data refreshes every 15s automatically (see POLL_INTERVAL_MS in config).

## Deploy

Same flow as your other projects — push to GitHub, deploy on Vercel:

```powershell
npm install -g vercel
vercel
```
