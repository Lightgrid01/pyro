// src/tiers.js
// Reliability tiers, computed client-side from data already read from the
// contract (verifiedHeartbeats, isSuspicious). No new on-chain state — this
// is a view over data Attestcoin has already verified, not a new attested
// value itself.

export const TIERS = [
  { id: 0, name: "Unranked", min: 0, color: "var(--text-dim)" },
  { id: 1, name: "Bronze", min: 1, color: "#C08552" },
  { id: 2, name: "Silver", min: 3, color: "#B9C0C9" },
  { id: 3, name: "Gold", min: 6, color: "#E8B84D" },
];

export function getTier(node) {
  if (node.suspicious) return TIERS[0];
  let result = TIERS[0];
  for (const tier of TIERS) {
    if (node.verifiedHeartbeats >= tier.min) result = tier;
  }
  return result;
}
