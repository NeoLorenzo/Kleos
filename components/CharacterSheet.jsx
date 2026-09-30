"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import styles from "./CharacterSheet.module.css";
import InfoHint from "@/components/InfoHint";
import { ScoreDelta, ScoreMeter, Sparkline, VectorRadar } from "@/components/KleosCharts";
import { supabase } from "@/lib/supabase/client";
import { loadVectorSnapshotHistory } from "@/lib/kleos/vectorSnapshotRepository";
import { VECTOR_DEFINITIONS } from "@/lib/kleos/vectorSnapshots";
import {
  buildVectorTrajectory,
  formatTrajectorySummary
} from "@/lib/kleos/characterSheet";

const TRAJECTORY_LENGTH = 8;

export default function CharacterSheet({ userId }) {
  const [historyState, setHistoryState] = useState({
    status: "loading",
    snapshots: [],
    message: ""
  });
  const [subjectName, setSubjectName] = useState("Kleos Subject");

  useEffect(() => {
    let active = true;
    if (!userId) {
      setHistoryState({ status: "idle", snapshots: [], message: "" });
      return () => {
        active = false;
      };
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

    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    let active = true;
    if (!supabase || !userId) return undefined;

    void supabase.auth.getUser().then(({ data }) => {
      if (!active || data?.user?.id !== userId) return;
      const metadata = data.user.user_metadata || {};
      const name = String(metadata.full_name || metadata.name || "").trim();
      if (name) setSubjectName(name);
    });

    return () => {
      active = false;
    };
  }, [userId]);

  const snapshots = historyState.snapshots;
  const latest = snapshots[0] || null;
  const previous =
    snapshots[1] && snapshots[1].methodologyVersion === latest?.methodologyVersion ? snapshots[1] : null;
  const assessedCount =
    latest?.results?.filter((result) => result.status === "assessed").length || 0;
  const isLoading = historyState.status === "loading";
  const overall = numeric(latest?.overallScore);
  const previousOverall = numeric(previous?.overallScore);

  const radarAxes = VECTOR_DEFINITIONS.map((vector) => {
    const result = latest?.results?.find((item) => item.vectorId === vector.id);
    return {
      id: vector.id,
      label: vector.label,
      href: `/${vector.id}/`,
      score: result?.status === "assessed" ? Number(result.score) : null
    };
  });
  const previousScores = previous
    ? Object.fromEntries(
        previous.results
          .filter((result) => result.status === "assessed")
          .map((result) => [result.vectorId, Number(result.score)])
      )
    : null;

  return (
    <div className={styles.sheet}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <p className="fs-app-kicker">Character Sheet</p>
          <h1 id="character-sheet-title">{subjectName}</h1>
          <section aria-labelledby="character-summary-title">
            <h2 id="character-summary-title" className="sr-only">Character summary</h2>
            {isLoading ? (
              <span className={`kleos-skeleton ${styles.summarySkeleton}`} aria-hidden="true" />
            ) : (
              <p className={styles.summary}>{buildCharacterSummary(latest)}</p>
            )}
          </section>
          {latest ? (
            <p className={styles.meta}>
              Assessed {formatDate(latest.evaluatedAt)}
              <span aria-hidden="true">·</span>
              {assessedCount} of {VECTOR_DEFINITIONS.length} dimensions
              <span aria-hidden="true">·</span>
              Methodology {latest.methodologyVersion}
              <InfoHint label="About this assessment">
                Evaluated by {latest.evaluator}. {snapshots.length} snapshot
                {snapshots.length === 1 ? "" : "s"} in history. Scores from different methodology
                versions are historical records, not like-for-like measurements.
              </InfoHint>
            </p>
          ) : null}
        </div>

        {overall !== null ? (
          <div className={styles.overall}>
            <span>Overall</span>
            <div>
              <strong>{formatNumber(overall)}</strong>
              <small>/ 100</small>
            </div>
            {previousOverall !== null ? <ScoreDelta value={overall - previousOverall} /> : null}
          </div>
        ) : null}
      </header>

      {historyState.status === "error" ? (
        <p className="kleos-note is-warning">
          Vector history is temporarily unavailable. Canonical measurements remain intact.
        </p>
      ) : null}

      <section className={`fs-app-card ${styles.stateCard}`} aria-labelledby="dimension-state-title">
        <div className={styles.stateHead}>
          <div className="kleos-title-row">
            <h2 id="dimension-state-title">Current dimensional state</h2>
            <InfoHint label="How to read this">
              Scores are out of 100. The change is measured against the previous snapshot under the same
              methodology, and the trend line shows up to the last {TRAJECTORY_LENGTH} snapshots, oldest to
              newest. Select a dimension for its full assessment and evidence.
            </InfoHint>
          </div>
          {previousScores ? (
            <div className={styles.legend} aria-hidden="true">
              <span><i className={styles.legendCurrent} />Latest</span>
              <span><i className={styles.legendPrevious} />Previous</span>
            </div>
          ) : null}
        </div>

        <div className={styles.stateGrid}>
          <figure className={styles.radarFigure}>
            <VectorRadar axes={radarAxes} previous={previousScores} showValues={false} />
          </figure>

          <ol className={styles.dimensionRows}>
            {VECTOR_DEFINITIONS.map((vector) => {
              const result = latest?.results?.find((item) => item.vectorId === vector.id) || null;
              const trajectory = buildVectorTrajectory(snapshots, vector.id, { limit: TRAJECTORY_LENGTH });
              const assessed = result?.status === "assessed";
              const priorResult = previous?.results?.find((item) => item.vectorId === vector.id);
              const delta =
                assessed && priorResult?.status === "assessed"
                  ? Number(result.score) - Number(priorResult.score)
                  : null;
              return (
                <li key={vector.id}>
                  <a
                    className={styles.dimensionRow}
                    href={`/${vector.id}/`}
                    aria-label={`Open ${vector.label} dimension`}
                    title={result?.commentary || undefined}
                  >
                    <span className={styles.dimensionIdentity}>
                      <strong>{vector.label}</strong>
                      <small>{isLoading ? " " : confidenceLabel(result)}</small>
                    </span>
                    <ScoreMeter value={assessed ? Number(result.score) : NaN} size="md" />
                    <span className={assessed ? styles.score : styles.scoreUnknown}>
                      {isLoading ? "…" : assessed ? formatNumber(result.score) : "—"}
                    </span>
                    <span className={styles.delta}>
                      {delta !== null ? <ScoreDelta value={delta} /> : null}
                    </span>
                    <span
                      className={styles.dimensionTrajectory}
                      title={trajectory.length ? formatTrajectorySummary(trajectory) : "No history"}
                    >
                      <Sparkline
                        values={trajectory
                          .slice()
                          .reverse()
                          .map((point) => (point.status === "assessed" ? point.score : null))}
                        width={72}
                        height={22}
                        label={`${vector.label} trajectory: ${formatTrajectorySummary(trajectory)}`}
                      />
                    </span>
                    <ChevronRight className={styles.dimensionArrow} aria-hidden="true" />
                  </a>
                </li>
              );
            })}
          </ol>
        </div>
      </section>
    </div>
  );
}

function buildCharacterSummary(latest) {
  const assessed = (latest?.results || []).filter(
    (result) => result.status === "assessed" && Number.isFinite(Number(result.score))
  );

  if (!assessed.length) {
    return "No current character synthesis is available because no dimensions have a derived assessment yet.";
  }

  const ranked = assessed.slice().sort((a, b) => Number(b.score) - Number(a.score));
  const highest = ranked.slice(0, Math.min(2, ranked.length));
  const lowest = ranked.length > 2 ? ranked.slice(-2).reverse() : [];
  const unknown = (latest?.results || []).filter((result) => result.status !== "assessed");

  const parts = [`Strongest in ${formatRankedDimensions(highest)}`];
  if (lowest.length) parts.push(`weakest in ${formatRankedDimensions(lowest)}`);
  let sentence = `${parts.join("; ")}.`;
  if (unknown.length) {
    sentence += ` ${formatNames(unknown.map((result) => vectorLabel(result.vectorId)))} ${
      unknown.length === 1 ? "is" : "are"
    } not yet assessable.`;
  }
  return sentence;
}

function formatRankedDimensions(results) {
  return formatNames(results.map((result) => vectorLabel(result.vectorId)));
}

function formatNames(names) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function vectorLabel(vectorId) {
  return VECTOR_DEFINITIONS.find((vector) => vector.id === vectorId)?.label || vectorId;
}

function confidenceLabel(result) {
  if (!result) return "No data";
  if (result.status === "unknown") return "Not assessable";
  return result.confidence ? `${capitalize(result.confidence)} confidence` : "Unspecified confidence";
}

function numeric(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
