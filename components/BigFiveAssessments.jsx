"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  BIG_FIVE_DOMAINS,
  BIG_FIVE_SELECT_COLUMNS,
  createEmptyBigFiveDraft,
  formatBigFiveTestDate,
  sortBigFiveAssessments,
  validateBigFiveDraft
} from "@/lib/kleos/bigFive";
import { ScoreMeter } from "@/components/KleosCharts";
import SectionHeading from "@/components/SectionHeading";
import styles from "./BigFiveAssessments.module.css";

// BigFive-Test (IPIP-NEO-120) reports domains on 24–120 and facets on 4–20.
const DOMAIN_SCORE_MAX = 120;
const FACET_SCORE_MAX = 20;

export default function BigFiveAssessments({ userId, assessments = [] }) {
  const [history, setHistory] = useState(() => sortBigFiveAssessments(assessments));
  const [draft, setDraft] = useState(createEmptyBigFiveDraft);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    setHistory(sortBigFiveAssessments(assessments));
  }, [assessments]);

  const saveAssessment = async (event) => {
    event.preventDefault();
    if (!supabase || !userId || isSaving) return;

    const validation = validateBigFiveDraft(draft);
    if (!validation.ok) {
      setMessage(validation.message);
      return;
    }

    setIsSaving(true);
    setMessage("");

    const { data, error } = await supabase
      .from("goat_big_five_assessments")
      .insert({
        user_id: userId,
        ...validation.payload
      })
      .select(BIG_FIVE_SELECT_COLUMNS)
      .single();

    setIsSaving(false);
    if (error) {
      setMessage(`Big Five assessment save failed: ${error.message}`);
      return;
    }

    setHistory((current) => sortBigFiveAssessments([data, ...current]));
    setDraft(createEmptyBigFiveDraft());
    setMessage("Big Five assessment saved.");
    setIsRecording(false);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("kleos:measurements-changed"));
    }
  };

  const updateScore = (column, value) => {
    setDraft((current) => ({ ...current, [column]: value }));
  };

  return (
    <section className="fs-app-card kleos-card" aria-labelledby="big-five-title">
      <SectionHeading
        title="Big Five personality"
        id="big-five-title"
        hint="Store raw BigFive-Test scores only. The test date must be the date printed in the report, never the PDF export, upload, download, or import date. Domains are scored 24–120 and facets 4–20."
      >
          <button
            type="button"
            className={`fs-app-button ${isRecording ? "is-ghost" : "is-secondary"}`}
            onClick={() => setIsRecording((current) => !current)}
            aria-expanded={isRecording}
          >
            {isRecording ? "Close form" : "Record assessment"}
          </button>
      </SectionHeading>

      {isRecording ? (
        <form className={`kleos-form-panel ${styles.form}`} onSubmit={saveAssessment}>
          <label className={styles.dateField}>
            Actual test date
            <input
              type="date"
              required
              value={draft.testDate}
              onChange={(event) =>
                setDraft((current) => ({ ...current, testDate: event.target.value }))
              }
            />
          </label>

          <div className={styles.domainFormGrid}>
            {BIG_FIVE_DOMAINS.map((domain) => (
              <fieldset className={styles.domainFieldset} key={domain.id}>
                <legend>{domain.label}</legend>
                <ScoreInput
                  label="Domain score"
                  value={draft[domain.column]}
                  onChange={(value) => updateScore(domain.column, value)}
                  prominent
                />
                <div className={styles.facetInputs}>
                  {domain.facets.map((facet) => (
                    <ScoreInput
                      key={facet.id}
                      label={facet.label}
                      value={draft[facet.column]}
                      onChange={(value) => updateScore(facet.column, value)}
                    />
                  ))}
                </div>
              </fieldset>
            ))}
          </div>

          <div className="kleos-form-footer">
            <p className="kleos-note">All 5 domain scores and all 30 facet scores are required.</p>
            <button type="submit" className="fs-app-button is-primary" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save Big Five Assessment"}
            </button>
          </div>
        </form>
      ) : null}

      {message ? <p className="kleos-note">{message}</p> : null}

      <div className={styles.history}>
        {history.length ? (
          history.map((assessment, index) => (
            <details
              className={styles.assessment}
              key={assessment.id || `${assessment.test_date}-${assessment.created_at || index}`}
              open={index === 0 ? true : undefined}
            >
              <summary>
                <span className={styles.assessmentDate}>
                  <strong>{formatBigFiveTestDate(assessment.test_date)}</strong>
                  {index === 0 ? <span className="kleos-pill is-accent">Latest</span> : null}
                </span>
                <span className={styles.summaryScores}>{domainSummary(assessment)}</span>
              </summary>

              <ul className={styles.domainBars}>
                {BIG_FIVE_DOMAINS.map((domain) => (
                  <li key={domain.id}>
                    <span>{domain.label}</span>
                    <ScoreMeter value={Number(assessment[domain.column])} max={DOMAIN_SCORE_MAX} size="md" />
                    <strong>{formatScore(assessment[domain.column])}</strong>
                  </li>
                ))}
              </ul>

              <details className={`kleos-disclosure ${styles.facets}`}>
                <summary>Facets</summary>
              <div className={styles.domainResults}>
                {BIG_FIVE_DOMAINS.map((domain) => (
                  <article className={styles.domainResult} key={domain.id}>
                    <header>
                      <span>{domain.label}</span>
                      <strong>{formatScore(assessment[domain.column])}</strong>
                    </header>
                    <dl>
                      {domain.facets.map((facet) => (
                        <div key={facet.id}>
                          <dt>{facet.label}</dt>
                          <dd>
                            <ScoreMeter value={Number(assessment[facet.column])} max={FACET_SCORE_MAX} size="sm" tone="neutral" />
                            <b>{formatScore(assessment[facet.column])}</b>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                ))}
              </div>
              </details>
            </details>
          ))
        ) : (
          <div className="kleos-empty">
            <strong>No Big Five assessments recorded yet.</strong>
            <p>Record the domain and facet scores from a BigFive-Test report to add personality evidence.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function ScoreInput({ label, value, onChange, prominent = false }) {
  return (
    <label className={prominent ? styles.domainScoreInput : styles.scoreInput}>
      {label}
      <input
        type="number"
        min="0"
        step="any"
        required
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function domainSummary(assessment) {
  return BIG_FIVE_DOMAINS.map(
    (domain) => `${shortDomainLabel(domain.id)} ${formatScore(assessment[domain.column])}`
  ).join(" · ");
}

function shortDomainLabel(domainId) {
  return {
    neuroticism: "N",
    extraversion: "E",
    openness: "O",
    agreeableness: "A",
    conscientiousness: "C"
  }[domainId];
}

function formatScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
