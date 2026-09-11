// src/components/PulseNode.jsx
import { buildPulsePath } from "../waveform";
import { getTier } from "../tiers";

export function PulseNode({ node }) {
  const { id, verifiedHeartbeats, claimedHeartbeats, lastVerifiedTimestamp, suspicious, rewardEligible } = node;

  const verifiedPath = buildPulsePath(verifiedHeartbeats || 0);
  const claimedPath = buildPulsePath(claimedHeartbeats || 0);
  const tier = getTier(node);

  const lastSeen = lastVerifiedTimestamp
    ? new Date(lastVerifiedTimestamp * 1000).toLocaleString()
    : "never";

  return (
    <div className={`pulse-node ${suspicious ? "pulse-node--flagged" : ""}`}>
      <div className="pulse-node__header">
        <span className="pulse-node__id">NODE {String(id).padStart(3, "0")}</span>
        {suspicious ? (
          <span className="pulse-node__badge pulse-node__badge--flagged">FLAGGED</span>
        ) : (
          <span className="pulse-node__badge pulse-node__badge--ok">VERIFIED</span>
        )}
      </div>

      <svg viewBox="0 0 280 60" className="pulse-node__wave" preserveAspectRatio="none">
        <path d={claimedPath} className="pulse-node__wave-claimed" fill="none" />
        <path d={verifiedPath} className="pulse-node__wave-verified" fill="none" />
      </svg>

      <div className="pulse-node__legend">
        <span className="pulse-node__legend-item">
          <i className="pulse-node__swatch pulse-node__swatch--verified" />
          verified × {verifiedHeartbeats}
        </span>
        <span className="pulse-node__legend-item">
          <i className="pulse-node__swatch pulse-node__swatch--claimed" />
          claimed × {claimedHeartbeats}
        </span>
      </div>

      <div className="pulse-node__footer">
        <span className="pulse-node__tier" style={{ color: tier.color, borderColor: tier.color }}>
          {tier.name} tier
        </span>
        {rewardEligible && (
          <span className="pulse-node__badge pulse-node__badge--ok">Reward eligible</span>
        )}
        <span className="pulse-node__meta">last proof: {lastSeen}</span>
      </div>
    </div>
  );
}
