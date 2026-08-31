// src/useSentinelData.js
import { useEffect, useState, useCallback, useRef } from "react";
import { JsonRpcProvider, Contract } from "ethers";
import { CREDITCOIN_RPC, REGISTRY_ADDRESS, REGISTRY_ABI, START_BLOCK, POLL_INTERVAL_MS } from "./config";

// Public RPCs commonly cap/slow down on very large eth_getLogs ranges.
// Scan history in bounded windows instead of one massive range.
const CHUNK_SIZE = 4000;

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

  const getContract = useCallback(() => {
    if (!providerRef.current) {
      providerRef.current = new JsonRpcProvider(CREDITCOIN_RPC);
      contractRef.current = new Contract(REGISTRY_ADDRESS, REGISTRY_ABI, providerRef.current);
    }
    return contractRef.current;
  }, []);

  // Scans [fromBlock, toBlock] in bounded chunks, fired in concurrency-capped
  // batches — fast on the initial large backfill, but not so many
  // simultaneous requests that a public RPC starts rate-limiting us.
  const scanRange = useCallback(async (contract, fromBlock, toBlock) => {
    const chunkStarts = [];
    for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
      chunkStarts.push(start);
    }

    const verified = [];
    const claimed = [];
    const CONCURRENCY = 6;

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
      batchResults.forEach(([v, c]) => {
        verified.push(...v);
        claimed.push(...c);
      });
    }

    return { verified, claimed };
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

  const publishState = useCallback(() => {
    const nodeList = Array.from(nodesMapRef.current.values()).sort(
      (a, b) => Number(a.id) - Number(b.id)
    );
    setNodes(nodeList);
    setEvents([...eventsRef.current].sort((a, b) => b.blockNumber - a.blockNumber).slice(0, 12));
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const contract = getContract();
      const latestBlock = await providerRef.current.getBlockNumber();

      // Only scan what's new since the last successful poll. On the very
      // first run this is the full historical range (chunked); every poll
      // after that is a small, fast range.
      const fromBlock = lastScannedBlockRef.current === null ? START_BLOCK : lastScannedBlockRef.current + 1;
      if (fromBlock > latestBlock) {
        // Nothing new since last poll — still counts as live.
        setStatus("live");
        setError(null);
        return;
      }

      const { verified, claimed } = await scanRange(contract, fromBlock, latestBlock);

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
      eventsRef.current = [...newEvents, ...eventsRef.current].slice(0, 50);

      lastScannedBlockRef.current = latestBlock;
      publishState();
      setStatus("live");
      setError(null);
    } catch (err) {
      console.error("Sentinel data fetch failed:", err);
      setStatus("error");
      setError(err.message || String(err));
    }
  }, [getContract, scanRange, refreshNodeStates, publishState]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return { nodes, events, status, error };
}
