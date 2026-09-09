// src/components/VerifyLookup.jsx
import { useState } from "react";
import { CREDITCOIN_EXPLORER_TX, SEPOLIA_EXPLORER_TX } from "../config";

export function VerifyLookup({ lookupSepoliaTx }) {
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);

  function handleCheck(e) {
    e.preventDefault();
    const match = lookupSepoliaTx(input);
    setResult(match ? { found: true, ...match, sepoliaHash: input.trim() } : { found: false });
  }

  return (
    <section className="verify-lookup">
      <div className="verify-lookup__label">See for yourself instead of taking our word for it</div>
      <p className="verify-lookup__hint">
        Paste a Sepolia transaction hash below, like one from the README, and we will tell you
        honestly whether Attestcoin actually verified it.
      </p>
      <form className="verify-lookup__form" onSubmit={handleCheck}>
        <input
          className="verify-lookup__input"
          type="text"
          placeholder="0x22ca8f0516d5b1e2a0d8afccf114085ffe7305ce22953b3f6a2861bb48a3f943"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
        />
        <button className="verify-lookup__button" type="submit">
          Check
        </button>
      </form>

      {result && (
        <div
          className={`verify-lookup__result ${
            result.found ? "verify-lookup__result--found" : "verify-lookup__result--not-found"
          }`}
        >
          {result.found ? (
            <>
              <div className="verify-lookup__result-title">Genuinely verified</div>
              <div className="verify-lookup__result-detail">
                This transaction was checked by the Block Prover Precompile and credited to node{" "}
                {result.nodeId} as verified heartbeat #{result.verifiedCount}.
              </div>
              <div className="verify-lookup__result-links">
                <a href={SEPOLIA_EXPLORER_TX + result.sepoliaHash} target="_blank" rel="noreferrer">
                  View on Sepolia
                </a>
                <a href={CREDITCOIN_EXPLORER_TX + result.creditcoinTxHash} target="_blank" rel="noreferrer">
                  View Creditcoin verification
                </a>
              </div>
            </>
          ) : (
            <>
              <div className="verify-lookup__result-title">Not found</div>
              <div className="verify-lookup__result-detail">
                That hash has not been recorded as a verified heartbeat yet. Try the real
                transaction hash from the README, or send your own with pulse.js.
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
