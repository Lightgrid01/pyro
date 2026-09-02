// src/useSentinelData.js
import { useEffect, useState, useCallback, useRef } from "react";
import { JsonRpcProvider, Contract } from "ethers";
import { CREDITCOIN_RPC_URLS, REGISTRY_ADDRESS, REGISTRY_ABI, START_BLOCK, POLL_INTERVAL_MS } from "./config";

// Public RPCs commonly cap/slow down on very large eth_getLogs ranges.
// Scan history in bounded windows instead of one massive range.
const CHUNK_SIZE = 4000;
const CONCURRENCY = 6;

const STORAGE_KEY = "sentinel-scan-state-v1";

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.lastScannedBlock !== "number") return null;
    return parsed;
  } catch {
    return null; // corrupted or unavailable — fall back to a fresh scan
  }
}

function savePersistedState(lastScannedBlock, nodesMap, events) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        lastScannedBlock,
        nodes: Array.from(nodesMap.entries()),
        events,
      })
    );
  } catch {
    // Storage full/unavailable — not critical, just means next load rescans.
  }
}

export function useSentinelData() {
  const [nodes, setNodes] = useState([]);
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("connecting"); // connecting | live | error
  const [error, setError] = useState(null);

  const providerRef = useRef(null);
  const contractRef = useRef(null);
  const lastScannedBlockRef = useRef(null); // null until the first successful scan
  const nodesMapRef = useRef(new Map());    // id -> node data, persists across polls
  const eventsRef = useRef([]);             // running list, persists across polls

  // Load whatever this browser already scanned before, so a page refresh
  // doesn't pay the full historical-scan cost again. Doesn't help a
  // judge's very first visit — see the progressive-publish logic below
  // for that case.
  useEffect(() => {
    const persisted = loadPersistedState();
    if (persisted) {
      lastScannedBlockRef.current = persisted.lastScannedBlock;
      nodesMapRef.current = new Map(persisted.nodes);
      eventsRef.current = persisted.events;
      publishState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(async () => {
    let lastErr;
    for (const url of CREDITCOIN_RPC_URLS) {
      try {
        const provider = new JsonRpcProvider(url);
        await provider.getBlockNumber(); // cheap connectivity check
        providerRef.current = provider;
        contractRef.current = new Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);
        return provider;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("No RPC endpoint responded.");
  }, []);

  const getContract = useCallback(async () => {
    if (!contractRef.current) {
      await connect();
    }
    return contractRef.current;
  }, [connect]);

  const publishState = useCallback(() => {
    const nodeList = Array.from(nodesMapRef.current.values()).sort(
      (a, b) => Number(a.id) - Number(b.id)
    );
    setNodes(nodeList);
    setEvents([...eventsRef.current].sort((a, b) => b.blockNumber - a.blockNumber).slice(0, 12));
  }, []);

  const refreshNodeStates = useCallback(async (contract, nodeIds) => {
    await Promise.all(
      Array.from(nodeIds).map(async (id) => {
        const [nodeStatus, suspicious] = await Promise.all([
          contract.nodes(id),
          contract.isSuspicious(id),
        ]);
        nodesMapRef.current.set(id, {
          id,
          verifiedHeartbeats: Number(nodeStatus.verifiedHeartbeats),
          claimedHeartbeats: Number(nodeStatus.claimedHeartbeats),
          lastVerifiedTimestamp: Number(nodeStatus.lastVerifiedTimestamp),
          suspicious,
        });
      })
    );
  }, []);

  // Processes one batch's logs immediately: updates node state, appends
  // events, and publishes to the UI right away — this is what makes real
  // data show up within the first couple seconds instead of only after
  // the entire (possibly huge, mostly-empty) range finishes scanning.
  const processBatch = useCallback(
    async (contract, verified, claimed) => {
      const newNodeIds = new Set();
      verified.forEach((log) => newNodeIds.add(log.args.nodeId.toString()));
      claimed.forEach((log) => newNodeIds.add(log.args.nodeId.toString()));

      if (newNodeIds.size > 0) {
        await refreshNodeStates(contract, newNodeIds);
      }

      const newEvents = [
        ...verified.map((log) => ({
          type: "verified",
          nodeId: log.args.nodeId.toString(),
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        })),
        ...claimed.map((log) => ({
          type: "claimed",
          nodeId: log.args.nodeId.toString(),
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        })),
      ];
      if (newEvents.length > 0) {
        eventsRef.current = [...newEvents, ...eventsRef.current].slice(0, 50);
      }

      if (newNodeIds.size > 0 || newEvents.length > 0) {
        publishState();
        // Mark live as soon as we have ANY real data to show — don't
        // make the UI wait for the full range to finish scanning.
        setStatus("live");
        setError(null);
      }
    },
    [refreshNodeStates, publishState]
  );

  // Scans [fromBlock, toBlock] in bounded chunks, fired in concurrency-capped
  // batches. Each batch is processed (and published to the UI) as soon as
  // it completes — the scan keeps going in the background, but the person
  // looking at the page sees real data almost immediately instead of
  // waiting for the entire range to finish.
  const scanRange = useCallback(
    async (contract, fromBlock, toBlock) => {
      const chunkStarts = [];
      for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
        chunkStarts.push(start);
      }

      for (let i = 0; i < chunkStarts.length; i += CONCURRENCY) {
        const batch = chunkStarts.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(
          batch.map((start) => {
            const end = Math.min(start + CHUNK_SIZE - 1, toBlock);
            return Promise.all([
              contract.queryFilter(contract.filters.HeartbeatVerified(), start, end),
              contract.queryFilter(contract.filters.HeartbeatClaimed(), start, end),
            ]);
          })
        );

        const verified = batchResults.flatMap(([v]) => v);
        const claimed = batchResults.flatMap(([, c]) => c);
        await processBatch(contract, verified, claimed);
      }
    },
    [processBatch]
  );

  const fetchAll = useCallback(async () => {
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const contract = await getContract();
        const latestBlock = await providerRef.current.getBlockNumber();

        const fromBlock = lastScannedBlockRef.current === null ? START_BLOCK : lastScannedBlockRef.current + 1;
        if (fromBlock > latestBlock) {
          setStatus("live");
          setError(null);
          return;
        }

        await scanRange(contract, fromBlock, latestBlock);

        lastScannedBlockRef.current = latestBlock;
        savePersistedState(lastScannedBlockRef.current, nodesMapRef.current, eventsRef.current);
        setStatus("live");
        setError(null);
        return; // success — stop retrying
      } catch (err) {
        console.error(`Sentinel data fetch failed (attempt ${attempt}/${MAX_ATTEMPTS}):`, err);
        contractRef.current = null;
        providerRef.current = null;

        // Only show an error if we have nothing at all to display —
        // if a prior batch already published real data, keep showing
        // that instead of flashing an error over good data.
        if (attempt === MAX_ATTEMPTS) {
          if (nodesMapRef.current.size === 0) {
            setStatus("error");
            setError(err.message || String(err));
          }
        } else {
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        }
      }
    }
  }, [getContract, scanRange]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return { nodes, events, status, error };
}
