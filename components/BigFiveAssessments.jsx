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
import styles from "./BigFiveAssessments.module.css";

export default function BigFiveAssessments({ userId, assessments = [] }) {
  const [history, setHistory] = useState(() => sortBigFiveAssessments(assessments));
  const [draft, setDraft] = useState(createEmptyBigFiveDraft);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

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

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("kleos:measurements-changed"));
    }
  };

  const updateScore = (column, value) => {
    setDraft((current) => ({ ...current, [column]: value }));
  };

  return (
    <section className={styles.panel} aria-labelledby="big-five-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Canonical Evidence</p>
          <h3 id="big-five-title">Big Five assessments</h3>
          <p className={styles.note}>
            Store raw BigFive-Test scores only. The test date must be the date printed in the report,
            never the PDF export, upload, download, or import date.
          </p>
        </div>
        <span className={styles.count}>
          {history.length} assessment{history.length === 1 ? "" : "s"}
        </span>
      </header>

      <form className={styles.form} onSubmit={saveAssessment}>
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
                label={`${domain.label} domain score`}
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

        <div className={styles.actions}>
          <button type="submit" className="primary-btn" disabled={isSaving}>
            {isSaving ? "Saving…" : "Save Big Five Assessment"}
          </button>
          <p className={styles.formHint}>All 5 domain scores and all 30 facet scores are required.</p>
        </div>
      </form>

      {message ? <p className={styles.message}>{message}</p> : null}

      <div className={styles.history}>
        <h4>Assessment history</h4>
        {history.length ? (
          history.map((assessment, index) => (
            <details
              className={styles.assessment}
              key={assessment.id || `${assessment.test_date}-${assessment.created_at || index}`}
              defaultOpen={index === 0}
            >
              <summary>
                <strong>{formatBigFiveTestDate(assessment.test_date)}</strong>
                <span>{domainSummary(assessment)}</span>
              </summary>

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
                          <dd>{formatScore(assessment[facet.column])}</dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                ))}
              </div>
            </details>
          ))
        ) : (
          <p className={styles.empty}>No Big Five assessments recorded yet.</p>
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
