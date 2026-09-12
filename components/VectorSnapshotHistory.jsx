"use client";

import { useEffect, useState } from "react";
import { loadVectorSnapshotHistory } from "@/lib/kleos/vectorSnapshotRepository";
import { VECTOR_DEFINITIONS } from "@/lib/kleos/vectorSnapshots";

export default function VectorSnapshotHistory({ userId }) {
  const [state, setState] = useState({ status: "loading", snapshots: [], message: "" });

  useEffect(() => {
    let active = true;
    if (!userId) {
      setState({ status: "idle", snapshots: [], message: "" });
      return () => { active = false; };
    }

    setState({ status: "loading", snapshots: [], message: "" });
    loadVectorSnapshotHistory(userId, { limit: 30 })
      .then((snapshots) => {
        if (!active) return;
        setState({ status: "ready", snapshots, message: "" });
      })
      .catch((error) => {
        if (!active) return;
        setState({ status: "error", snapshots: [], message: error?.message || "Snapshot history failed to load." });
      });

    return () => { active = false; };
  }, [userId]);

  if (state.status === "loading") {
    return <section className="kleos-card wide-card">Loading snapshot history...</section>;
  }

  if (state.status === "error") {
    return (
      <section className="kleos-card wide-card">
        <div className="section-header">
          <h2>Snapshot History</h2>
          <p>{state.message}</p>
        </div>
      </section>
    );
  }

  if (!state.snapshots.length) return null;

  return (
    <section className="kleos-card wide-card" aria-labelledby="snapshot-history-title">
      <div className="section-header">
        <h2 id="snapshot-history-title">Snapshot History</h2>
        <p>
          Methodology versions are shown explicitly. Scores produced under different methodology versions are historical records,
          not directly comparable longitudinal measurements. Methodology 2.0.0 establishes the new deterministic baseline.
        </p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Methodology</th>
              {VECTOR_DEFINITIONS.map((vector) => <th key={vector.id}>{vector.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {state.snapshots.map((snapshot, index) => {
              const scores = new Map(snapshot.results.map((result) => [result.vectorId, result]));
              const versionChanged = index < state.snapshots.length - 1
                && state.snapshots[index + 1].methodologyVersion !== snapshot.methodologyVersion;
              return (
                <tr key={snapshot.id || `${snapshot.evaluatedAt}-${index}`}>
                  <td>{formatDate(snapshot.evaluatedAt)}</td>
                  <td>
                    {snapshot.methodologyVersion}
                    {snapshot.methodologyVersion === "2.0.0" ? " · deterministic" : " · legacy"}
                    {versionChanged ? " · baseline boundary" : ""}
                  </td>
                  {VECTOR_DEFINITIONS.map((vector) => {
                    const result = scores.get(vector.id);
                    return <td key={vector.id}>{result?.status === "assessed" ? formatScore(result.score) : "—"}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function formatScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? (Number.isInteger(number) ? String(number) : number.toFixed(1)) : "—";
}
