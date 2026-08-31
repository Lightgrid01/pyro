// src/useSentinelData.js
import { useEffect, useState, useCallback, useRef } from "react";
import { JsonRpcProvider, Contract } from "ethers";
import { CREDITCOIN_RPC, REGISTRY_ADDRESS, REGISTRY_ABI, START_BLOCK, POLL_INTERVAL_MS } from "./config";

export function useSentinelData() {
  const [nodes, setNodes] = useState([]);
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("connecting"); // connecting | live | error
  const [error, setError] = useState(null);
  const providerRef = useRef(null);
  const contractRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      if (!providerRef.current) {
        providerRef.current = new JsonRpcProvider(CREDITCOIN_RPC);
        contractRef.current = new Contract(REGISTRY_ADDRESS, REGISTRY_ABI, providerRef.current);
      }
      const contract = contractRef.current;
      const latestBlock = await providerRef.current.getBlockNumber();

      const [verifiedLogs, claimedLogs] = await Promise.all([
        contract.queryFilter(contract.filters.HeartbeatVerified(), START_BLOCK, latestBlock),
        contract.queryFilter(contract.filters.HeartbeatClaimed(), START_BLOCK, latestBlock),
      ]);

      const nodeIds = new Set();
      verifiedLogs.forEach((log) => nodeIds.add(log.args.nodeId.toString()));
      claimedLogs.forEach((log) => nodeIds.add(log.args.nodeId.toString()));

      const nodeList = await Promise.all(
        Array.from(nodeIds).map(async (id) => {
          const [status, suspicious] = await Promise.all([
            contract.nodes(id),
            contract.isSuspicious(id),
          ]);
          return {
            id,
            verifiedHeartbeats: Number(status.verifiedHeartbeats),
            claimedHeartbeats: Number(status.claimedHeartbeats),
            lastVerifiedTimestamp: Number(status.lastVerifiedTimestamp),
            suspicious,
          };
        })
      );
      nodeList.sort((a, b) => Number(a.id) - Number(b.id));
      setNodes(nodeList);

      const combinedEvents = [
        ...verifiedLogs.map((log) => ({
          type: "verified",
          nodeId: log.args.nodeId.toString(),
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        })),
        ...claimedLogs.map((log) => ({
          type: "claimed",
          nodeId: log.args.nodeId.toString(),
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        })),
      ]
        .sort((a, b) => b.blockNumber - a.blockNumber)
        .slice(0, 12);
      setEvents(combinedEvents);

      setStatus("live");
      setError(null);
    } catch (err) {
      console.error("Sentinel data fetch failed:", err);
      setStatus("error");
      setError(err.message || String(err));
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return { nodes, events, status, error };
}
