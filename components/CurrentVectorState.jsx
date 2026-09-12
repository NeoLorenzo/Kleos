"use client";

import { useEffect, useState } from "react";
import { loadLatestVectorSnapshot } from "@/lib/kleos/vectorSnapshotRepository";
import { VECTOR_DEFINITIONS } from "@/lib/kleos/vectorSnapshots";

export default function CurrentVectorState({ userId }) {
  const [state, setState] = useState({ status: "loading", snapshot: null, message: "" });

  useEffect(() => {
    let active = true;

    if (!userId) {
      setState({ status: "idle", snapshot: null, message: "" });
      return () => { active = false; };
    }

    setState({ status: "loading", snapshot: null, message: "" });
    loadLatestVectorSnapshot(userId)
      .then((snapshot) => {
        if (!active) return;
        setState({ status: "ready", snapshot, message: "" });
      })
      .catch((error) => {
        if (!active) return;
        setState({
          status: "error",
          snapshot: null,
          message: error?.message || "Current vector state failed to load."
        });
      });

    return () => { active = false; };
  }, [userId]);

  if (state.status === "loading") {
    return <section className="kleos-card wide-card">Loading current vector state...</section>;
  }

  if (state.status === "error") {
    return (
      <section className="kleos-card wide-card">
        <div className="section-header">
          <h2>Current Vector State</h2>
          <p>{state.message}</p>
        </div>
      </section>
    );
  }

  if (!state.snapshot) {
    return (
      <section className="kleos-card wide-card">
        <div className="section-header">
          <h2>Current Vector State</h2>
          <p>No vector snapshot has been recorded yet. Missing state remains unknown until Kleos Bot writes an assessment.</p>
        </div>
      </section>
    );
  }

  const snapshot = state.snapshot;
  const resultsByVectorId = new Map(snapshot.results.map((result) => [result.vectorId, result]));
  const deterministic = snapshot.methodologyVersion.startsWith("2.");

  return (
    <section className="kleos-card wide-card" aria-labelledby="current-vector-state-title">
      <div className="section-header">
        <h2 id="current-vector-state-title">Current Vector State</h2>
        <p>
          Assessed {formatDateTime(snapshot.evaluatedAt)} by {snapshot.evaluator} · methodology {snapshot.methodologyVersion}
          {snapshot.overallScore === null ? "" : ` · overall ${formatNumber(snapshot.overallScore)} / 100`}
        </p>
        <p>
          {deterministic
            ? "Methodology 2.x: final vector scores are calculated deterministically from fixed weighted subdomains and coverage rules."
            : "Legacy 1.x methodology: this snapshot used holistic model scoring and is not directly comparable with Methodology 2.x snapshots."}
        </p>
      </div>

      <div className="kleos-grid">
        {VECTOR_DEFINITIONS.map((vector) => {
          const result = resultsByVectorId.get(vector.id);
          const assessed = result?.status === "assessed";
          return (
            <article className="kleos-card" key={vector.id}>
              <div className="section-header">
                <h2>{vector.label}</h2>
                <p>{vector.description}</p>
              </div>
              <div className="score-readout">
                <span>{assessed ? `${capitalize(result.confidence)} confidence` : "Insufficient evidence"}</span>
                <strong>{assessed ? `${formatNumber(result.score)} / 100` : "Unknown"}</strong>
                <em>
                  {result?.coveragePct === null || result?.coveragePct === undefined
                    ? assessed ? "Legacy holistic assessment" : "Not scored"
                    : `${formatNumber(result.coveragePct)}% evidence coverage`}
                </em>
              </div>
              {result?.commentary ? (
                <details>
                  <summary>Assessment context</summary>
                  <p className="kleos-subtitle">{result.commentary}</p>
                </details>
              ) : null}
              {result?.subdomains?.length ? (
                <details>
                  <summary>Methodology subdomains</summary>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Subdomain</th>
                          <th>Weight</th>
                          <th>Score</th>
                          <th>Confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.subdomains
                          .slice()
                          .sort((a, b) => String(a.subdomainId).localeCompare(String(b.subdomainId)))
                          .map((subdomain) => (
                            <tr key={subdomain.subdomainId}>
                              <td title={subdomain.commentary}>{formatSubdomainId(subdomain.subdomainId)}</td>
                              <td>{formatNumber(subdomain.weight)}%</td>
                              <td>{subdomain.status === "assessed" ? formatNumber(subdomain.score) : "Unknown"}</td>
                              <td>{capitalize(subdomain.confidence)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
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

function formatSubdomainId(value) {
  return String(value || "")
    .split("_")
    .filter(Boolean)
    .map((part) => capitalize(part))
    .join(" ");
}
