import { usePyroData } from "./usePyroData";
import { useSepoliaMap } from "./useSepoliaMap";
import { ProofFlowHero } from "./components/ProofFlowHero";
import { VerifyLookup } from "./components/VerifyLookup";
import { PulseNode } from "./components/PulseNode";
import { LiveFeed } from "./components/LiveFeed";
import "./App.css";

function App() {
  const { nodes, events, status, error } = usePyroData();
  const { lookup: lookupSepoliaTx } = useSepoliaMap();
  const latestVerified = events.find((e) => e.type === "verified");

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <img src="/logo.png" alt="Pyro" className="topbar__logo" />
          Pyro
        </div>
        <div className={`topbar__status topbar__status--${status}`}>
          <span className="topbar__status-dot" />
          {status === "connecting" && "Connecting"}
          {status === "live" && "Live on CC3 testnet"}
          {status === "error" && "Connection error"}
        </div>
      </header>

      <ProofFlowHero latestVerified={latestVerified} status={status} />

      <VerifyLookup lookupSepoliaTx={lookupSepoliaTx} />

      {error && <div className="error-banner">{error}</div>}

      <main className="layout">
        <section className="grid">
          <div className="grid__header">{nodes.length} nodes tracked</div>
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
        An Attestcoin Protocol integration built for BUIDL CTC 2026 Fall.
      </footer>
    </div>
  );
}

export default App;
