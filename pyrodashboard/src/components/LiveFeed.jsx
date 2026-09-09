// src/components/LiveFeed.jsx
import { CREDITCOIN_EXPLORER_TX } from "../config";

export function LiveFeed({ events }) {
  return (
    <aside className="feed">
      <div className="feed__header">
        <span className="feed__dot" />
        LIVE ATTESTATION FEED
      </div>
      {events.length === 0 && <div className="feed__empty">No events in the scanned range yet.</div>}
      <ul className="feed__list">
        {events.map((e, i) => (
          <li key={e.txHash + i} className={`feed__item feed__item--${e.type}`}>
            <span className="feed__type">{e.type === "verified" ? "VERIFIED" : "CLAIMED"}</span>
            <span className="feed__node">node {e.nodeId}</span>
            <a
              className="feed__link"
              href={CREDITCOIN_EXPLORER_TX + e.txHash}
              target="_blank"
              rel="noreferrer"
            >
              {e.txHash.slice(0, 8)}… ↗
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
