import { useSentinelData } from "./useSentinelData";
import { ProofFlowHero } from "./components/ProofFlowHero";
import { PulseNode } from "./components/PulseNode";
import { LiveFeed } from "./components/LiveFeed";
import "./App.css";

function App() {
  const { nodes, events, status, error } = useSentinelData();
  const latestVerified = events.find((e) => e.type === "verified");

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__mark" />
          SENTINEL
        </div>
        <div className={`topbar__status topbar__status--${status}`}>
          <span className="topbar__status-dot" />
          {status === "connecting" && "CONNECTING"}
          {status === "live" && "LIVE — CC3 TESTNET"}
          {status === "error" && "CONNECTION ERROR"}
        </div>
      </header>

      <ProofFlowHero latestVerified={latestVerified} status={status} />

      {error && <div className="error-banner">{error}</div>}

      <main className="layout">
        <section className="grid">
          <div className="grid__header">NODE REGISTRY — {nodes.length} TRACKED</div>
          <div className="grid__cards">
            {nodes.length === 0 && status === "live" && (
              <div className="grid__empty">No nodes have pulsed yet in the scanned range.</div>
            )}
            {nodes.map((node) => (
              <PulseNode key={node.id} node={node} />
            ))}
          </div>
        </section>

        <LiveFeed events={events} />
      </main>

      <footer className="footer">
        Attestcoin Protocol integration — BUIDL CTC 2026 Fall
      </footer>
    </div>
  );
}

export default App;
