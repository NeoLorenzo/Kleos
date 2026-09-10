"use client";

import { useEffect, useState } from "react";
import styles from "./CharacterSheet.module.css";
import { supabase } from "@/lib/supabase/client";
import { loadVectorSnapshotHistory } from "@/lib/kleos/vectorSnapshotRepository";
import { VECTOR_DEFINITIONS } from "@/lib/kleos/vectorSnapshots";
import { formatBigFiveTestDate } from "@/lib/kleos/bigFive";
import {
  buildVectorTrajectory,
  formatTrajectorySummary
} from "@/lib/kleos/characterSheet";

export default function CharacterSheet({ userId, kleosData, basePath = "" }) {
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
  const assessedCount =
    latest?.results?.filter((result) => result.status === "assessed").length || 0;
  const unknownCount = VECTOR_DEFINITIONS.length - assessedCount;

  const latestStage =
    [...(kleosData?.academicStages || [])]
      .filter((stage) => Number.isFinite(Number(stage.stage_mean)))
      .sort((a, b) => Number(b.stage || 0) - Number(a.stage || 0))[0] || null;
  const latestCognitive = kleosData?.cognitiveTests?.[0] || null;
  const latestBigFive = kleosData?.bigFiveAssessments?.[0] || null;

  return (
    <section className={styles.sheet} aria-labelledby="character-sheet-title">
      <header className={styles.identity}>
        <div className={styles.identityPrimary}>
          <p className={styles.eyebrow}>Character Sheet</p>
          <h2 id="character-sheet-title">{subjectName}</h2>
          <p className={styles.identitySubtitle}>
            Evidence-backed current profile across eight canonical dimensions.
          </p>
        </div>

        <dl className={styles.metadata} aria-label="Assessment metadata">
          <Meta label="Last assessment" value={latest ? formatDate(latest.evaluatedAt) : "Unavailable"} />
          <Meta label="Evaluator" value={latest?.evaluator || "Unavailable"} />
          <Meta label="Methodology" value={latest?.methodologyVersion || "Unavailable"} />
          <Meta label="Coverage" value={`${assessedCount} assessed · ${unknownCount} unknown`} />
          <Meta
            label="History"
            value={`${snapshots.length} snapshot${snapshots.length === 1 ? "" : "s"}`}
          />
        </dl>
      </header>

      {historyState.status === "error" ? (
        <p className={styles.alert}>
          Vector history is temporarily unavailable. Canonical measurements remain intact.
        </p>
      ) : null}

      <section className={styles.summarySection} aria-labelledby="character-summary-title">
        <SectionHeading eyebrow="Current State" title="Character summary" id="character-summary-title" />
        <p className={styles.characterSummary}>{buildCharacterSummary(latest)}</p>
      </section>

      <section className={styles.dimensionsSection} aria-labelledby="dimension-state-title">
        <SectionHeading
          eyebrow="Eight Dimensions"
          title="Current dimensional state"
          id="dimension-state-title"
          note="Recent trajectory runs oldest → newest. Select a row for the full dimension."
        />

        <div className={styles.dimensionTable}>
          <div className={styles.dimensionHeader} aria-hidden="true">
            <span>Dimension</span>
            <span>State</span>
            <span>Confidence</span>
            <span>Trajectory</span>
            <span>Assessment</span>
            <span />
          </div>

          <div className={styles.dimensionRows}>
            {VECTOR_DEFINITIONS.map((vector) => {
              const result = latest?.results?.find((item) => item.vectorId === vector.id) || null;
              const trajectory = buildVectorTrajectory(snapshots, vector.id, { limit: 6 });
              return (
                <a
                  className={styles.dimensionRow}
                  href={`${basePath}/${vector.id}/`}
                  key={vector.id}
                  aria-label={`Open ${vector.label} dimension`}
                >
                  <span className={styles.dimensionIdentity}>
                    <strong>{vector.label}</strong>
                    <small>{vector.description}</small>
                  </span>
                  <span className={styles.dimensionScore}>
                    {result?.status === "assessed" ? formatNumber(result.score) : "—"}
                    <small>{result?.status === "assessed" ? "/ 100" : "Unknown"}</small>
                  </span>
                  <span className={styles.dimensionConfidence}>{confidenceLabel(result)}</span>
                  <span className={styles.dimensionTrajectory}>
                    {trajectory.length ? formatTrajectorySummary(trajectory) : "No history"}
                  </span>
                  <span className={styles.dimensionAssessment}>{assessmentSummary(result)}</span>
                  <span className={styles.dimensionArrow} aria-hidden="true">→</span>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      <section className={styles.factsSection} aria-labelledby="key-facts-title">
        <SectionHeading
          eyebrow="Selected Records"
          title="Key facts"
          id="key-facts-title"
          note="Summary only. Detailed measurements and editing live inside each dimension."
        />

        <div className={styles.factColumns}>
          <FactGroup title="Physical">
            <Fact label="Body metrics" value={bodyMetricSummary(kleosData?.strengthProfile)} />
            <Fact label="Heracles strength" value={strengthMetricSummary(kleosData?.strengthMetrics)} />
            <Fact label="Strength sync" value={strengthSyncSummary(kleosData?.strengthMetrics)} />
            <Fact
              label="Health profile"
              value={
                hasText(kleosData?.healthProfile?.bloodTestText) ||
                hasText(kleosData?.healthProfile?.miscText)
                  ? "Recorded"
                  : "Not recorded"
              }
            />
          </FactGroup>

          <FactGroup title="Intellectual & psychological">
            <Fact
              label="Latest academic stage"
              value={
                latestStage
                  ? `${latestStage.academic_year} · ${formatNumber(latestStage.stage_mean)}% mean`
                  : "No completed stage mean"
              }
            />
            <Fact
              label="Latest cognitive test"
              value={
                latestCognitive
                  ? `${latestCognitive.test_name} · ${latestCognitive.score_text}`
                  : "No cognitive test recorded"
              }
            />
            <Fact
              label="Big Five"
              value={
                latestBigFive
                  ? `${kleosData.bigFiveAssessments.length} recorded · latest ${formatBigFiveTestDate(latestBigFive.test_date)}`
                  : "No assessment recorded"
              }
            />
            <Fact
              label="Academic modules"
              value={`${kleosData?.academicModules?.length || 0} recorded`}
            />
          </FactGroup>

          <FactGroup title="Professional & record status">
            <Fact
              label="Professional profile"
              value={hasText(kleosData?.cvText) ? "CV recorded" : "No CV recorded"}
            />
            <Fact
              label="Assessed dimensions"
              value={`${assessedCount} of ${VECTOR_DEFINITIONS.length}`}
            />
            <Fact
              label="Unknown dimensions"
              value={`${unknownCount} of ${VECTOR_DEFINITIONS.length}`}
            />
            <Fact
              label="Assessment snapshots"
              value={`${snapshots.length} recorded`}
            />
          </FactGroup>
        </div>
      </section>
    </section>
  );
}

function Meta({ label, value }) {
  return (
    <div className={styles.metaRow}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function SectionHeading({ eyebrow, title, id, note = "" }) {
  return (
    <header className={styles.sectionHeading}>
      <div>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h3 id={id}>{title}</h3>
      </div>
      {note ? <p className={styles.sectionNote}>{note}</p> : null}
    </header>
  );
}

function FactGroup({ title, children }) {
  return (
    <section className={styles.factGroup}>
      <h4>{title}</h4>
      <dl>{children}</dl>
    </section>
  );
}

function Fact({ label, value }) {
  return (
    <div className={styles.factRow}>
      <dt>{label}</dt>
      <dd>{value}</dd>
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
  const parts = [`${assessed.length} of ${VECTOR_DEFINITIONS.length} dimensions are currently assessed.`];

  if (highest.length) {
    parts.push(`Highest current scores: ${formatRankedDimensions(highest)}.`);
  }
  if (lowest.length) {
    parts.push(`Lowest current scores: ${formatRankedDimensions(lowest)}.`);
  }

  const commentary = assessed
    .map((result) => firstSentence(result.commentary))
    .filter(Boolean)
    .slice(0, 2);
  if (commentary.length) {
    parts.push(`Current assessment notes: ${commentary.join(" ")}`);
  }

  return parts.join(" ");
}

function formatRankedDimensions(results) {
  return results
    .map((result) => `${vectorLabel(result.vectorId)} ${formatNumber(result.score)}`)
    .join(" · ");
}

function vectorLabel(vectorId) {
  return VECTOR_DEFINITIONS.find((vector) => vector.id === vectorId)?.label || vectorId;
}

function firstSentence(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/^.*?[.!?](?:\s|$)/);
  return (match?.[0] || text).trim();
}

function assessmentSummary(result) {
  if (!result) return "No current assessment.";
  if (result.status !== "assessed") {
    return result.commentary || "Insufficient evidence for a current assessment.";
  }
  return firstSentence(result.commentary) || "Assessment available on the dimension page.";
}

function confidenceLabel(result) {
  if (!result) return "No data";
  if (result.status === "unknown") return "Unknown";
  return result.confidence ? capitalize(result.confidence) : "Unspecified";
}

function bodyMetricSummary(profile) {
  const height = numeric(profile?.heightCm);
  const weight = numeric(profile?.bodyWeightKg);
  if (height === null && weight === null) return "Not recorded";
  return [
    height === null ? null : `${formatNumber(height)} cm`,
    weight === null ? null : `${formatNumber(weight)} kg`
  ]
    .filter(Boolean)
    .join(" · ");
}

function strengthMetricSummary(metrics = []) {
  const current = metrics.filter((metric) => metric.is_current).length;
  const stale = metrics.length - current;
  if (!metrics.length) return "No Heracles strength snapshot yet";
  return `${current} current · ${stale} stale`;
}

function strengthSyncSummary(metrics = []) {
  const checkedTimes = metrics
    .map((metric) => new Date(metric.last_checked_at || 0).getTime())
    .filter(Number.isFinite)
    .filter((time) => time > 0);
  if (!checkedTimes.length) return "Never synced";
  return `Checked ${formatDate(new Date(Math.max(...checkedTimes)).toISOString())}`;
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
