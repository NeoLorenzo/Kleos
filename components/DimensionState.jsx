"use client";

import { useEffect, useState } from "react";
import FinancialPosition from "@/components/FinancialPosition";
import FinancialTransactionCorrections from "@/components/FinancialTransactionCorrections";
import InfoHint from "@/components/InfoHint";
import { ScoreDelta, ScoreMeter, Sparkline } from "@/components/KleosCharts";
import { buildVectorTrajectory, formatTrajectorySummary } from "@/lib/kleos/characterSheet";
import { loadVectorSnapshotHistory } from "@/lib/kleos/vectorSnapshotRepository";
import { getVectorDefinition } from "@/lib/kleos/vectorSnapshots";
import styles from "./DimensionState.module.css";

const HISTORY_LIMIT = 12;

/**
 * Dimension page hero: identity, current assessment, trajectory and the
 * weighted methodology subdomains behind the score. Page-specific evidence
 * follows as children.
 */
export default function DimensionState({ userId, vectorId, actions = null, children = null }) {
  const vector = getVectorDefinition(vectorId);
  const [state, setState] = useState({ status: "loading", snapshots: [], message: "" });

  useEffect(() => {
    let active = true;

    if (!userId) {
      setState({ status: "idle", snapshots: [], message: "" });
      return () => {
        active = false;
      };
    }

    setState({ status: "loading", snapshots: [], message: "" });
    loadVectorSnapshotHistory(userId, { limit: HISTORY_LIMIT })
      .then((snapshots) => {
        if (active) setState({ status: "ready", snapshots, message: "" });
      })
      .catch((error) => {
        if (active) {
          setState({
            status: "error",
            snapshots: [],
            message: error?.message || "Current dimension assessment could not be loaded."
          });
        }
      });

    return () => {
      active = false;
    };
  }, [userId]);

  if (!vector) return null;

  const latest = state.snapshots[0] || null;
  const result = latest?.results?.find((item) => item.vectorId === vectorId) || null;
  const assessed = result?.status === "assessed";
  const previous =
    state.snapshots[1]?.methodologyVersion === latest?.methodologyVersion ? state.snapshots[1] : null;
  const previousResult = previous?.results?.find((item) => item.vectorId === vectorId);
  const delta =
    assessed && previousResult?.status === "assessed"
      ? Number(result.score) - Number(previousResult.score)
      : null;
  const trajectory = buildVectorTrajectory(state.snapshots, vectorId, { limit: HISTORY_LIMIT });
  const subdomains = (result?.subdomains || [])
    .slice()
    .sort((left, right) => Number(right.weight || 0) - Number(left.weight || 0));
  const isLoading = state.status === "loading";
  const confidenceText = assessed
    ? `${capitalize(result.confidence)} confidence`
    : isLoading
      ? ""
      : "Insufficient evidence";
  const coverageText =
    result?.coveragePct !== null && result?.coveragePct !== undefined
      ? `${formatNumber(result.coveragePct)}% coverage`
      : "";

  return (
    <>
      <section className={`fs-app-card ${styles.hero}`} aria-labelledby={`${vectorId}-state-title`}>
        <div className={styles.head}>
          <h1 id={`${vectorId}-state-title`}>{vector.label}</h1>
          <p className={styles.description}>{vector.description}</p>
        </div>

        <div className={styles.copy}>
          <h3>Assessment</h3>
          {state.status === "error" ? <p>{state.message}</p> : null}
          {isLoading ? (
            <div className={styles.copySkeleton} aria-hidden="true">
              <span className="kleos-skeleton" />
              <span className="kleos-skeleton" />
            </div>
          ) : null}
          {state.status === "ready" ? (
            <p>
              {result?.commentary ||
                "No derived assessment commentary is available for this dimension yet."}
            </p>
          ) : null}
        </div>

        {actions ? <div className={styles.actions}>{actions}</div> : null}

        <aside className={styles.scoreColumn} aria-live="polite">
          <div className="kleos-title-row">
            <span className={styles.scoreLabel}>Current assessment</span>
            {latest ? (
              <InfoHint label="About this assessment">
                Assessed {formatDate(latest.evaluatedAt)} by {latest.evaluator} using methodology{" "}
                {latest.methodologyVersion}. The change compares against the previous snapshot under the
                same methodology; the trend covers the last {trajectory.length} snapshot
                {trajectory.length === 1 ? "" : "s"}.
              </InfoHint>
            ) : null}
          </div>

          {isLoading ? (
            <div className={styles.scoreSkeleton} aria-hidden="true">
              <span className="kleos-skeleton" />
              <span className="kleos-skeleton" />
            </div>
          ) : (
            <>
              <div className={styles.scoreValue}>
                <strong className={assessed ? "" : styles.unknown}>
                  {assessed ? formatNumber(result.score) : "Unknown"}
                </strong>
                {assessed ? <span>/ 100</span> : null}
                <span className={styles.trend} title={formatTrajectorySummary(trajectory)}>
                  <Sparkline
                    values={trajectory
                      .slice()
                      .reverse()
                      .map((point) => (point.status === "assessed" ? point.score : null))}
                    width={64}
                    height={20}
                    label={`${vector.label} trajectory: ${formatTrajectorySummary(trajectory)}`}
                  />
                </span>
                {delta !== null ? <ScoreDelta value={delta} /> : null}
              </div>
              <ScoreMeter value={assessed ? Number(result.score) : NaN} size="md" />
              <p className={styles.scoreFoot}>{[confidenceText, coverageText].filter(Boolean).join(" · ")}</p>
            </>
          )}

          {subdomains.length ? (
            <div className={styles.subdomains}>
              <div className="kleos-title-row">
                <h3>Subdomains</h3>
                <InfoHint label="About subdomains">
                  Methodology 2.x scores are calculated deterministically from fixed, weighted subdomains.
                  The percentage beside each subdomain is its weight in the final score; hover a row for
                  its commentary.
                </InfoHint>
              </div>
              <ul>
                {subdomains.map((subdomain) => {
                  const known = subdomain.status === "assessed";
                  return (
                    <li key={subdomain.subdomainId} title={subdomain.commentary || undefined}>
                      <span className={styles.subdomainName}>{formatSubdomainId(subdomain.subdomainId)}</span>
                      <span className={styles.subdomainWeight}>{formatNumber(subdomain.weight)}%</span>
                      <ScoreMeter value={known ? Number(subdomain.score) : NaN} size="sm" tone="neutral" />
                      <span className={known ? styles.subdomainScore : styles.subdomainUnknown}>
                        {known ? formatNumber(subdomain.score) : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </aside>
      </section>

      {vectorId === "financial" ? <FinancialPosition userId={userId} /> : null}
      {children}
      {vectorId === "financial" ? <FinancialTransactionCorrections userId={userId} /> : null}
    </>
  );
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "an unknown date";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
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
