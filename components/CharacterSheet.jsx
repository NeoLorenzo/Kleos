"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./CharacterSheet.module.css";
import { loadVectorSnapshotHistory } from "@/lib/kleos/vectorSnapshotRepository";
import { VECTOR_DEFINITIONS } from "@/lib/kleos/vectorSnapshots";
import {
  buildCharacterEvidence,
  buildVectorTrajectory,
  formatTrajectorySummary
} from "@/lib/kleos/characterSheet";

export default function CharacterSheet({ userId, kleosData }) {
  const [historyState, setHistoryState] = useState({ status: "loading", snapshots: [], message: "" });

  useEffect(() => {
    let active = true;
    if (!userId) {
      setHistoryState({ status: "idle", snapshots: [], message: "" });
      return () => { active = false; };
    }

    setHistoryState({ status: "loading", snapshots: [], message: "" });
    loadVectorSnapshotHistory(userId, { limit: 50 })
      .then((snapshots) => {
        if (active) setHistoryState({ status: "ready", snapshots, message: "" });
      })
      .catch((error) => {
        if (active) {
          setHistoryState({
            status: "error",
            snapshots: [],
            message: error?.message || "Vector history could not be loaded."
          });
        }
      });

    return () => { active = false; };
  }, [userId]);

  const snapshots = historyState.snapshots;
  const latest = snapshots[0] || null;
  const evidence = useMemo(() => buildCharacterEvidence(kleosData), [kleosData]);
  const assessedCount = latest?.results?.filter((result) => result.status === "assessed").length || 0;
  const unknownCount = VECTOR_DEFINITIONS.length - assessedCount;

  const latestStage = [...(kleosData?.academicStages || [])]
    .filter((stage) => Number.isFinite(Number(stage.stage_mean)))
    .sort((a, b) => Number(b.stage || 0) - Number(a.stage || 0))[0] || null;
  const latestCognitive = kleosData?.cognitiveTests?.[0] || null;
  const latestLift = kleosData?.strengthLifts?.[0] || null;

  return (
    <section className={styles.sheet} aria-labelledby="character-sheet-title">
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Current Character State</p>
          <h2 id="character-sheet-title">Eight-dimensional overview</h2>
          <p className={styles.heroMeta}>
            {latest
              ? `Derived assessment from ${formatDate(latest.evaluatedAt)} · ${latest.evaluator} · methodology ${latest.methodologyVersion}`
              : historyState.status === "loading"
                ? "Loading the latest derived vector state…"
                : "No derived vector snapshot is available yet. Raw evidence remains accessible below."}
          </p>
        </div>
        <div className={styles.summary} aria-label="Character-state summary">
          <span>{assessedCount} assessed</span>
          <span>{unknownCount} unknown / unavailable</span>
          <span>{snapshots.length} historical snapshot{snapshots.length === 1 ? "" : "s"}</span>
        </div>
      </header>

      {historyState.status === "error" ? (
        <p className={styles.muted}>Vector history is temporarily unavailable. Raw measurements remain intact and editable.</p>
      ) : null}

      <div className={styles.vectorGrid} aria-label="Eight canonical vectors">
        {VECTOR_DEFINITIONS.map((vector) => {
          const result = latest?.results?.find((item) => item.vectorId === vector.id) || null;
          return (
            <article className={styles.vectorCard} key={vector.id}>
              <header className={styles.vectorHeader}>
                <h3>{vector.label}</h3>
                <span className={styles.confidence}>{confidenceLabel(result)}</span>
              </header>
              <p className={`${styles.score} ${result?.status === "assessed" ? "" : styles.unknown}`}>
                {result?.status === "assessed" ? `${formatNumber(result.score)} / 100` : "Unknown"}
              </p>
              <p className={styles.description}>{vector.description}</p>
              <details className={styles.details}>
                <summary>Evidence & assessment</summary>
                <p className={styles.commentary}>
                  {result?.commentary || "No derived assessment commentary is available for this vector."}
                </p>
                <ul className={styles.evidenceList}>
                  {(evidence[vector.id] || ["No mapped raw evidence summary available."]).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </details>
            </article>
          );
        })}
      </div>

      <section className={styles.historyPanel} aria-labelledby="vector-history-title">
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Trajectory</p>
            <h3 id="vector-history-title" className={styles.sectionTitle}>Vector history</h3>
          </div>
          <p className={styles.muted}>Oldest → newest · ? = explicitly unknown</p>
        </header>
        <div className={styles.trajectoryGrid}>
          {VECTOR_DEFINITIONS.map((vector) => {
            const trajectory = buildVectorTrajectory(snapshots, vector.id, { limit: 8 });
            return (
              <article className={styles.trajectoryItem} key={vector.id}>
                <strong>{vector.label}</strong>
                <p className={styles.trajectory}>{formatTrajectorySummary(trajectory)}</p>
                {trajectory.length ? (
                  <details className={styles.historyDetails}>
                    <summary>Inspect history</summary>
                    <ol className={styles.historyList}>
                      {trajectory.slice().reverse().map((point, index) => (
                        <li key={point.snapshotId || `${point.evaluatedAt || "snapshot"}-${index}`}>
                          <span>{formatDate(point.evaluatedAt)}</span>
                          <strong>{trajectoryValue(point)}</strong>
                          <span>{trajectoryContext(point)}</span>
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.recordsPanel} aria-labelledby="key-records-title">
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Canonical Evidence</p>
            <h3 id="key-records-title" className={styles.sectionTitle}>Key measurements & records</h3>
          </div>
          <p className={styles.muted}>Raw records explain and outlive derived assessments.</p>
        </header>
        <div className={styles.recordsGrid}>
          <Record label="Body metrics" value={bodyMetricSummary(kleosData?.strengthProfile)} />
          <Record
            label="Latest recorded lift"
            value={latestLift ? `${latestLift.exercise_name} · ${formatNumber(latestLift.weight_kg)} kg × ${latestLift.reps}` : "No lift recorded"}
          />
          <Record
            label="Latest academic stage"
            value={latestStage ? `${latestStage.academic_year} · ${formatNumber(latestStage.stage_mean)}% mean` : "No completed stage mean"}
          />
          <Record
            label="Latest cognitive test"
            value={latestCognitive ? `${latestCognitive.test_name} · ${latestCognitive.score_text}` : "No cognitive test recorded"}
          />
          <Record label="Academic modules" value={`${kleosData?.academicModules?.length || 0} recorded`} />
          <Record label="Strength lifts" value={`${kleosData?.strengthLifts?.length || 0} recorded`} />
          <Record label="Health profile" value={hasText(kleosData?.healthProfile?.bloodTestText) || hasText(kleosData?.healthProfile?.miscText) ? "Recorded" : "Not recorded"} />
          <Record label="Professional profile" value={hasText(kleosData?.cvText) ? "CV recorded" : "No CV recorded"} />
        </div>
      </section>
    </section>
  );
}

function Record({ label, value }) {
  return (
    <div className={styles.record}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function confidenceLabel(result) {
  if (!result) return "No data";
  if (result.status === "unknown") return "Unknown";
  return `${capitalize(result.confidence)} confidence`;
}

function trajectoryValue(point) {
  if (point.status === "assessed") return `${formatNumber(point.score)} / 100`;
  if (point.status === "unknown") return "Unknown";
  return "Missing";
}

function trajectoryContext(point) {
  const parts = [];
  if (point.status === "assessed" && point.confidence) {
    parts.push(`${capitalize(point.confidence)} confidence`);
  } else if (point.status === "unknown") {
    parts.push("insufficient evidence");
  }
  if (point.methodologyVersion) parts.push(`methodology ${point.methodologyVersion}`);
  if (point.evaluator) parts.push(point.evaluator);
  return parts.join(" · ") || "context unavailable";
}

function bodyMetricSummary(profile) {
  const height = numeric(profile?.heightCm);
  const weight = numeric(profile?.bodyWeightKg);
  if (height === null && weight === null) return "Not recorded";
  return [
    height === null ? null : `${formatNumber(height)} cm`,
    weight === null ? null : `${formatNumber(weight)} kg`
  ].filter(Boolean).join(" · ");
}

function numeric(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hasText(value) {
  return Boolean(String(value || "").trim());
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
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
