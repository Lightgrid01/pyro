# Sentinel — Demo Video Scenario

Total target length: ~3 minutes. Each block below is
[on-screen action] + [narration line]. Record the screen actions silently
first, following the timing; generate the narration separately (TTS or
your own voice) and lay it over afterward — you never have to talk and
run commands at the same time.

Before recording: pick two fresh node IDs you haven't used before (e.g.
`2` for the honest node, `299` for the liar), so the demo feels live.

---

## 0:00 – 0:25 — Open on the dashboard

**Screen:** `sentinel-dashboard` at `localhost:5173`, hero section visible.

**Narration:**
> "DePIN networks have a trust problem. A node can claim it was online all
> day, and most systems just believe it. Sentinel doesn't. Every uptime
> claim here has to be backed by a real, cryptographically verified
> transaction — checked by Creditcoin's Attestcoin Protocol, not trusted
> on its own."

---

## 0:25 – 0:45 — Point at the proof chain

**Screen:** Slow pan/zoom across the three-stage proof chain in the hero
(Sepolia -> Block Prover Precompile -> UptimeRegistry).

**Narration:**
> "Here's the actual flow. A node sends a real transaction on Ethereum
> Sepolia. Creditcoin's Block Prover Precompile verifies that transaction
> really happened — no oracle, no bridge, no trusted middleman. Only then
> does a reliability score update."

---

## 0:45 – 1:30 — Send a real heartbeat (terminal)

**Screen:** Terminal, `contracts-sepolia` folder.

**Commands to run on screen:**
```powershell
set NODE_ID=2
npx hardhat run scripts/pulse.js --network sepolia
```

**Narration:**
> "I'm sending a real heartbeat from node 2 right now — this is a genuine
> transaction landing on Ethereum Sepolia, not a simulated one."

*(let the transaction confirm on screen, showing the real tx hash)*

---

## 1:30 – 2:15 — Process it through Attestcoin (terminal)

**Screen:** Terminal, `worker` folder.

**Command to run on screen:**
```powershell
npx ts-node src/process-heartbeat.ts <paste-the-tx-hash-from-previous-step>
```

**Narration (while it waits for attestation):**
> "Now Creditcoin has to independently attest the block that transaction
> landed in — this takes a little time, because it's real cross-chain
> verification, not a shortcut."

**Narration (once it confirms):**
> "And there it is — the proof came back, got submitted to the
> UptimeRegistry contract on Creditcoin, and node 2's verified uptime just
> went up. That's a real transaction hash you can check yourself."

---

## 2:15 – 2:35 — Show it live on the dashboard

**Screen:** Switch to dashboard, node 2's card visible with a clean
waveform and a tier badge.

**Narration:**
> "Switching back to the dashboard — node 2 shows up immediately, with a
> clean verified pulse and a reliability tier, computed directly from
> that on-chain proof."

---

## 2:35 – 3:05 — The liar node (terminal)

**Screen:** Terminal, `contracts-creditcoin` folder.

**Command to run on screen:**
```powershell
npx hardhat run scripts/liar-demo.js --network creditcoin_testnet
```
*(with `LIAR_NODE_ID` set to `299` beforehand)*

**Narration:**
> "Now here's what happens when a node lies. Node 299 is about to claim
> three heartbeats — with zero real Sepolia transactions behind any of
> them."

---

## 3:05 – 3:25 — Show the flag on the dashboard

**Screen:** Dashboard, node 299's card — red border, diverging waveform,
FLAGGED badge, Unranked tier.

**Narration:**
> "And the contract catches it. No manual review, no moderator — node 299
> is automatically flagged, because its claims outpace what Attestcoin
> could actually verify. This is the whole point: uptime you can't fake."

---

## 3:25 – 3:30 — Close

**Screen:** Wide shot of the full dashboard, both nodes visible side by
side.

**Narration:**
> "Sentinel — attested uptime for DePIN, built on the Attestcoin
> Protocol."

---

## Notes for recording

- Windows: `Win+G` opens Game Bar's recorder, or use OBS for more control.
- Record screen actions first, in silence, following the timestamps above
  loosely — you don't need to hit them exactly, just keep the same order.
- For narration: paste each block's line into a TTS tool (or read it
  yourself) and line it up roughly with the matching screen segment in
  any basic video editor (even Clipchamp, which ships free on Windows).
- If a step runs long (attestation waiting, especially), speed up that
  section 2-3x in the edit rather than cutting it — showing that it's
  real waiting time is part of the point.
