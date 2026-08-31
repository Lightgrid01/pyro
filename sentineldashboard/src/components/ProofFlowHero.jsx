// src/components/ProofFlowHero.jsx
import { CREDITCOIN_EXPLORER_TX, BEACON_ADDRESS, REGISTRY_ADDRESS } from "../config";

export function ProofFlowHero({ latestVerified, status }) {
  return (
    <section className="hero">
      <div className="hero__eyebrow">ATTESTCOIN PROTOCOL — LIVE ON CC3 TESTNET</div>
      <h1 className="hero__title">
        A node can claim uptime.
        <br />
        Only Attestcoin can prove it.
      </h1>
      <p className="hero__sub">
        Every verified pulse below is a real Ethereum Sepolia transaction, checked for inclusion
        by Creditcoin's Block Prover Precompile before it ever touches a reliability score.
        Nothing here is self-reported and trusted on its own.
      </p>

      <div className="proof-chain">
        <div className="proof-chain__stage">
          <div className="proof-chain__label">1 · SOURCE</div>
          <div className="proof-chain__name">Ethereum Sepolia</div>
          <div className="proof-chain__detail">HeartbeatBeacon.pulse()</div>
          <div className="proof-chain__addr">{shorten(BEACON_ADDRESS)}</div>
        </div>

        <div className="proof-chain__arrow" data-active={status === "live"}>
          <span>inclusion proof</span>
        </div>

        <div className="proof-chain__stage">
          <div className="proof-chain__label">2 · VERIFY</div>
          <div className="proof-chain__name">Block Prover Precompile</div>
          <div className="proof-chain__detail">verifyAndEmit()</div>
          <div className="proof-chain__addr">0x...0FD2</div>
        </div>

        <div className="proof-chain__arrow" data-active={status === "live"}>
          <span>on success</span>
        </div>

        <div className="proof-chain__stage">
          <div className="proof-chain__label">3 · SCORE</div>
          <div className="proof-chain__name">UptimeRegistry</div>
          <div className="proof-chain__detail">
            {latestVerified ? (
              <a
                href={CREDITCOIN_EXPLORER_TX + latestVerified.txHash}
                target="_blank"
                rel="noreferrer"
              >
                latest: node {latestVerified.nodeId} ↗
              </a>
            ) : (
              "waiting for first proof..."
            )}
          </div>
          <div className="proof-chain__addr">{shorten(REGISTRY_ADDRESS)}</div>
        </div>
      </div>
    </section>
  );
}

function shorten(addr) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}
