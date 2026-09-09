// src/useSepoliaMap.js
import { useEffect, useState, useCallback } from "react";

// Fetches the static mapping the worker writes directly when it processes
// each heartbeat. This is a fact recorded at the source, not derived or
// decoded after the fact — see worker/src/process-heartbeat.ts.
export function useSepoliaMap() {
  const [map, setMap] = useState({});

  useEffect(() => {
    let cancelled = false;
    fetch("/sepolia-map.json")
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        if (!cancelled) setMap(data);
      })
      .catch(() => {
        // File may not exist yet on a brand new deployment — that's fine,
        // just means no verified heartbeats have been recorded there yet.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const lookup = useCallback(
    (rawHash) => {
      if (!rawHash) return null;
      return map[rawHash.trim().toLowerCase()] || null;
    },
    [map]
  );

  return { lookup };
}
