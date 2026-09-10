"use client";

import { useEffect, useMemo, useState } from "react";
import { buildCharacterEvidence } from "@/lib/kleos/characterSheet";
import { loadLatestVectorSnapshot } from "@/lib/kleos/vectorSnapshotRepository";
import { getVectorDefinition } from "@/lib/kleos/vectorSnapshots";
import styles from "./DimensionState.module.css";

export default function DimensionState({ userId, vectorId, kleosData }) {
  const vector = getVectorDefinition(vectorId);
  const evidence = useMemo(
    () => buildCharacterEvidence(kleosData || {})[vectorId] || [],
    [kleosData, vectorId]
  );
  const [state, setState] = useState({ status: "loading", snapshot: null, message: "" });

  useEffect(() => {
    let active = true;

    if (!userId) {
      setState({ status: "idle", snapshot: null, message: "" });
      return () => {
        active = false;
      };
    }

    setState({ status: "loading", snapshot: null, message: "" });
    loadLatestVectorSnapshot(userId)
      .then((snapshot) => {
        if (active) setState({ status: "ready", snapshot, message: "" });
      })
      .catch((error) => {
        if (active) {
          setState({
            status: "error",
            snapshot: null,
            message: error?.message || "Current dimension assessment could not be loaded."
          });
        }
      });

    return () => {
      active = false;
    };
  }, [userId]);

  if (!vector) return null;

  const result = state.snapshot?.results?.find((item) => item.vectorId === vectorId) || null;
  const assessed = result?.status === "assessed";

  return (
    <section className="kleos-card wide-card" aria-labelledby={`${vectorId}-state-title`}>
      <div className="section-header">
        <p className="kleos-kicker">Current Dimension State</p>
        <h2 id={`${vectorId}-state-title`}>{vector.label}</h2>
        <p>{vector.description}</p>
      </div>

      {state.status === "loading" ? <p className={styles.muted}>Loading current assessment…</p> : null}
      {state.status === "error" ? <p className={styles.muted}>{state.message}</p> : null}

      {state.status === "ready" ? (
        <div className={styles.stateGrid}>
          <div className={styles.scoreCard}>
            <span>Current assessment</span>
            <strong>{assessed ? `${formatNumber(result.score)} / 100` : "Unknown"}</strong>
            <em>{assessed ? `${capitalize(result.confidence)} confidence` : "Insufficient evidence"}</em>
          </div>

          <div className={styles.copy}>
            <h3>Assessment</h3>
            <p>
              {result?.commentary ||
                "No derived assessment commentary is available for this dimension yet."}
            </p>
          </div>

          <div className={styles.copy}>
            <h3>Current evidence</h3>
            <ul>
              {(evidence.length ? evidence : ["No mapped raw evidence summary is available."]).map(
                (item) => (
                  <li key={item}>{item}</li>
                )
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function capitalize(value) {
  const text = String(value || "");
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : "";
}
