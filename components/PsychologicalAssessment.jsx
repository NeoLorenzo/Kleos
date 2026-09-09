"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  KLEOS_FACET_OPTIONS,
  KLEOS_PSYCHOLOGICAL_FACETS,
  PSYCHOLOGICAL_INSTRUMENTS,
  PSYCHOLOGICAL_SELECT_COLUMNS,
  countPsychologicalAnswers,
  createEmptyPsychologicalDraft,
  formatPsychologicalAssessmentDate,
  getGad7Category,
  getPhq9Category,
  getPsychologicalQuestionCount,
  getSwlsCategory,
  psychologicalAssessmentToDraft,
  sortPsychologicalAssessments,
  validatePsychologicalDraft
} from "@/lib/kleos/psychologicalBattery";
import styles from "./PsychologicalAssessment.module.css";

const TOTAL_QUESTIONS = getPsychologicalQuestionCount();
const STEPS = [
  ...PSYCHOLOGICAL_INSTRUMENTS.map((instrument) => ({
    id: instrument.id,
    label: instrument.shortLabel,
    instrument
  })),
  { id: "kleos", label: "Kleos facets" }
];

export default function PsychologicalAssessment({ userId }) {
  const [history, setHistory] = useState([]);
  const [draft, setDraft] = useState(createEmptyPsychologicalDraft);
  const [stepIndex, setStepIndex] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    if (!supabase || !userId) {
      setIsLoading(false);
      return undefined;
    }

    void supabase
      .from("goat_psychological_assessments")
      .select(PSYCHOLOGICAL_SELECT_COLUMNS)
      .eq("user_id", userId)
      .order("assessed_at", { ascending: false })
      .then(({ data, error }) => {
        if (!mounted) return;
        setIsLoading(false);
        if (error) {
          setMessage(`Psychological assessment history failed to load: ${error.message}`);
          return;
        }
        setHistory(sortPsychologicalAssessments(data || []));
      });

    return () => {
      mounted = false;
    };
  }, [userId]);

  const answered = countPsychologicalAnswers(draft);
  const progress = Math.round((answered / TOTAL_QUESTIONS) * 100);
  const currentStep = STEPS[stepIndex];
  const currentStepComplete = useMemo(
    () => isStepComplete(currentStep, draft),
    [currentStep, draft]
  );

  const beginNewAssessment = () => {
    setDraft(createEmptyPsychologicalDraft());
    setStepIndex(0);
    setEditingId(null);
    setMessage("");
    setIsActive(true);
  };

  const beginEditAssessment = (assessment) => {
    setDraft(psychologicalAssessmentToDraft(assessment));
    setStepIndex(0);
    setEditingId(assessment.id);
    setMessage("");
    setIsActive(true);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const cancelAssessment = () => {
    setDraft(createEmptyPsychologicalDraft());
    setStepIndex(0);
    setEditingId(null);
    setIsActive(false);
    setMessage("");
  };

  const updateInstrumentResponse = (instrumentId, itemIndex, value) => {
    setDraft((current) => ({
      ...current,
      [instrumentId]: current[instrumentId].map((item, index) =>
        index === itemIndex ? value : item
      )
    }));
  };

  const updateFacetResponse = (facetId, value) => {
    setDraft((current) => ({
      ...current,
      kleos: { ...current.kleos, [facetId]: value }
    }));
  };

  const saveAssessment = async () => {
    if (!supabase || !userId || isSaving) return;

    const validation = validatePsychologicalDraft(draft);
    if (!validation.ok) {
      setMessage(validation.message);
      return;
    }

    setIsSaving(true);
    setMessage("");
    const now = new Date().toISOString();
    let result;

    if (editingId) {
      result = await supabase
        .from("goat_psychological_assessments")
        .update({ ...validation.payload, updated_at: now })
        .eq("id", editingId)
        .eq("user_id", userId)
        .select(PSYCHOLOGICAL_SELECT_COLUMNS)
        .single();
    } else {
      result = await supabase
        .from("goat_psychological_assessments")
        .insert({
          user_id: userId,
          assessed_at: now,
          updated_at: now,
          ...validation.payload
        })
        .select(PSYCHOLOGICAL_SELECT_COLUMNS)
        .single();
    }

    setIsSaving(false);
    if (result.error) {
      setMessage(`Psychological assessment save failed: ${result.error.message}`);
      return;
    }

    setHistory((current) => {
      const withoutEdited = editingId
        ? current.filter((assessment) => assessment.id !== editingId)
        : current;
      return sortPsychologicalAssessments([result.data, ...withoutEdited]);
    });
    setDraft(createEmptyPsychologicalDraft());
    setStepIndex(0);
    setEditingId(null);
    setIsActive(false);
    setMessage(editingId ? "Psychological assessment corrected." : "Psychological assessment saved.");

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("kleos:measurements-changed"));
    }
  };

  const deleteAssessment = async (assessment) => {
    if (!supabase || !userId || !assessment?.id || isSaving) return;
    const confirmed = window.confirm(
      `Delete the psychological assessment from ${formatPsychologicalAssessmentDate(assessment.assessed_at)}? This cannot be undone.`
    );
    if (!confirmed) return;

    setIsSaving(true);
    setMessage("");
    const { error } = await supabase
      .from("goat_psychological_assessments")
      .delete()
      .eq("id", assessment.id)
      .eq("user_id", userId);
    setIsSaving(false);

    if (error) {
      setMessage(`Psychological assessment delete failed: ${error.message}`);
      return;
    }

    setHistory((current) => current.filter((item) => item.id !== assessment.id));
    setMessage("Psychological assessment deleted.");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("kleos:measurements-changed"));
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="psychological-assessment-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Canonical Psychological Evidence</p>
          <h1 id="psychological-assessment-title">Psychological Battery</h1>
          <p className={styles.intro}>
            A repeatable set of independently scored measures. Screening scores are evidence for Kleos Bot,
            not diagnoses and not a replacement for professional assessment.
          </p>
        </div>
        {!isActive ? (
          <button type="button" className="primary-btn" onClick={beginNewAssessment}>
            Take assessment
          </button>
        ) : null}
      </header>

      {isActive ? (
        <div className={styles.assessmentFlow}>
          <div className={styles.progressHeader}>
            <div>
              <strong>{editingId ? "Correct assessment" : "New assessment"}</strong>
              <span>
                {answered} / {TOTAL_QUESTIONS} answered
              </span>
            </div>
            <div className={styles.progressTrack} aria-label={`${progress}% complete`}>
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>

          <nav className={styles.stepNav} aria-label="Psychological battery sections">
            {STEPS.map((step, index) => (
              <button
                type="button"
                key={step.id}
                className={index === stepIndex ? styles.activeStep : styles.stepButton}
                onClick={() => setStepIndex(index)}
              >
                <span>{index + 1}</span>
                {step.label}
              </button>
            ))}
          </nav>

          {currentStep.instrument ? (
            <InstrumentStep
              instrument={currentStep.instrument}
              values={draft[currentStep.id]}
              onChange={(index, value) => updateInstrumentResponse(currentStep.id, index, value)}
              phqItem9Value={draft.phq9[8]}
            />
          ) : (
            <KleosFacetStep values={draft.kleos} onChange={updateFacetResponse} />
          )}

          <div className={styles.flowActions}>
            <button type="button" className="secondary-btn" onClick={cancelAssessment} disabled={isSaving}>
              Cancel
            </button>
            {stepIndex > 0 ? (
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
                disabled={isSaving}
              >
                Previous
              </button>
            ) : null}
            {stepIndex < STEPS.length - 1 ? (
              <button
                type="button"
                className="primary-btn"
                disabled={!currentStepComplete || isSaving}
                onClick={() => setStepIndex((index) => Math.min(STEPS.length - 1, index + 1))}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                className="primary-btn"
                disabled={!currentStepComplete || answered !== TOTAL_QUESTIONS || isSaving}
                onClick={() => void saveAssessment()}
              >
                {isSaving ? "Saving…" : editingId ? "Save correction" : "Submit assessment"}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {message ? <p className={styles.message} aria-live="polite">{message}</p> : null}

      <section className={styles.history} aria-labelledby="psychological-history-title">
        <div className={styles.historyHeader}>
          <div>
            <p className={styles.eyebrow}>Longitudinal History</p>
            <h2 id="psychological-history-title">Assessment history</h2>
          </div>
          <span>{isLoading ? "Loading…" : `${history.length} recorded`}</span>
        </div>

        {!isLoading && !history.length ? (
          <p className={styles.empty}>No psychological assessments recorded yet.</p>
        ) : null}

        <div className={styles.historyList}>
          {history.map((assessment, index) => (
            <AssessmentHistoryCard
              key={assessment.id}
              assessment={assessment}
              latest={index === 0}
              onEdit={() => beginEditAssessment(assessment)}
              onDelete={() => void deleteAssessment(assessment)}
              disabled={isSaving}
            />
          ))}
        </div>
      </section>
    </section>
  );
}

function InstrumentStep({ instrument, values, onChange, phqItem9Value }) {
  return (
    <section className={styles.stepPanel}>
      <header className={styles.instrumentHeader}>
        <div>
          <p className={styles.eyebrow}>{instrument.shortLabel}</p>
          <h2>{instrument.title}</h2>
          <p>{instrument.timeframe}</p>
        </div>
        <a href={instrument.sourceUrl} target="_blank" rel="noreferrer">
          Source / terms
        </a>
      </header>

      {instrument.licensedTextExternal ? (
        <div className={styles.licenseNotice}>
          <strong>Licensed wording is intentionally not copied into this public repository.</strong>
          <p>
            Open the official PSS page using “Source / terms”, read each PSS-10 item there, then record
            the corresponding response below. Kleos stores the ten response values and scores items 4,
            5, 7 and 8 in the reverse direction.
          </p>
        </div>
      ) : null}

      <div className={styles.questionList}>
        {instrument.items.map((item, index) => (
          <Question
            key={`${instrument.id}-${index}`}
            number={index + 1}
            text={item}
            value={values[index]}
            options={instrument.responseOptions}
            onChange={(value) => onChange(index, value)}
          />
        ))}
      </div>

      {instrument.id === "phq9" && Number(phqItem9Value) > 0 ? (
        <div className={styles.safetyNotice} role="alert">
          <strong>PHQ-9 item 9 is above zero.</strong>
          <p>
            This records thoughts of death or self-harm. If you may act on those thoughts or are in
            immediate danger, contact local emergency services now. Otherwise, consider contacting a
            qualified healthcare professional or a person you trust. The questionnaire score itself is
            not a diagnosis.
          </p>
        </div>
      ) : null}

      <p className={styles.attribution}>{instrument.attribution}</p>
    </section>
  );
}

function KleosFacetStep({ values, onChange }) {
  return (
    <section className={styles.stepPanel}>
      <header className={styles.instrumentHeader}>
        <div>
          <p className={styles.eyebrow}>Kleos-specific</p>
          <h2>Supplementary psychological facets</h2>
          <p>
            These are stable Kleos tracking items, not validated subscales of WHO-5, SWLS, PSS-10,
            GAD-7 or PHQ-9. They are stored individually and are not combined into a homemade score.
          </p>
        </div>
      </header>
      <div className={styles.questionList}>
        {KLEOS_PSYCHOLOGICAL_FACETS.map((facet, index) => (
          <Question
            key={facet.id}
            number={index + 1}
            text={facet.item}
            sublabel={facet.label}
            value={values[facet.id]}
            options={KLEOS_FACET_OPTIONS}
            onChange={(value) => onChange(facet.id, value)}
          />
        ))}
      </div>
    </section>
  );
}

function Question({ number, text, sublabel, value, options, onChange }) {
  return (
    <fieldset className={styles.question}>
      <legend>
        <span className={styles.questionNumber}>{number}</span>
        <span>
          {sublabel ? <small>{sublabel}</small> : null}
          {text}
        </span>
      </legend>
      <div className={styles.options}>
        {options.map((option) => {
          const inputId = `${number}-${slugify(text)}-${option.value}`;
          return (
            <label className={styles.option} htmlFor={inputId} key={option.value}>
              <input
                id={inputId}
                type="radio"
                name={`${slugify(text)}-${number}`}
                value={option.value}
                checked={String(value) === String(option.value)}
                onChange={(event) => onChange(event.target.value)}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function AssessmentHistoryCard({ assessment, latest, onEdit, onDelete, disabled }) {
  const who5 = Number(assessment.who5_percentage);
  const swls = Number(assessment.swls_score);
  const pss10 = Number(assessment.pss10_score);
  const gad7 = Number(assessment.gad7_score);
  const phq9 = Number(assessment.phq9_score);

  return (
    <details className={styles.historyCard} open={latest}>
      <summary>
        <div>
          <strong>{formatPsychologicalAssessmentDate(assessment.assessed_at)}</strong>
          <span>{latest ? "Latest" : `Battery ${assessment.battery_version || "-"}`}</span>
        </div>
        <div className={styles.summaryScores}>
          <span>WHO-5 {Number.isFinite(who5) ? `${who5}/100` : "-"}</span>
          <span>SWLS {Number.isFinite(swls) ? `${swls}/35` : "-"}</span>
          <span>PSS-10 {Number.isFinite(pss10) ? `${pss10}/40` : "-"}</span>
          <span>GAD-7 {Number.isFinite(gad7) ? `${gad7}/21` : "-"}</span>
          <span>PHQ-9 {Number.isFinite(phq9) ? `${phq9}/27` : "-"}</span>
        </div>
      </summary>

      <div className={styles.historyBody}>
        <div className={styles.resultGrid}>
          <Result label="WHO-5" value={`${who5}/100`} detail={Number(assessment.who5_raw_score) < 13 ? "Below suggested wellbeing cut-off" : "At or above suggested wellbeing cut-off"} />
          <Result label="SWLS" value={`${swls}/35`} detail={getSwlsCategory(swls)} />
          <Result label="PSS-10" value={`${pss10}/40`} detail="No diagnostic cut-off; compare longitudinally" />
          <Result label="GAD-7" value={`${gad7}/21`} detail={getGad7Category(gad7)} />
          <Result label="PHQ-9" value={`${phq9}/27`} detail={getPhq9Category(phq9)} />
        </div>

        {Number(assessment.phq9_item_9) > 0 ? (
          <div className={styles.safetyNotice}>
            <strong>PHQ-9 item 9 response: {assessment.phq9_item_9}/3.</strong>
            <p>This is retained separately from the total so it is not hidden inside an aggregate screening score.</p>
          </div>
        ) : null}

        <div className={styles.facetGrid}>
          {KLEOS_PSYCHOLOGICAL_FACETS.map((facet) => (
            <div key={facet.id}>
              <span>{facet.label}</span>
              <strong>{assessment.kleos_facets?.[facet.id] ?? "-"}/4</strong>
            </div>
          ))}
        </div>

        <div className={styles.historyActions}>
          <button type="button" className="secondary-btn" onClick={onEdit} disabled={disabled}>
            Correct responses
          </button>
          <button type="button" className={styles.deleteButton} onClick={onDelete} disabled={disabled}>
            Delete
          </button>
        </div>
      </div>
    </details>
  );
}

function Result({ label, value, detail }) {
  return (
    <div className={styles.result}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function isStepComplete(step, draft) {
  if (step.id === "kleos") {
    return KLEOS_PSYCHOLOGICAL_FACETS.every((facet) => isAnswered(draft?.kleos?.[facet.id]));
  }
  return Array.isArray(draft?.[step.id]) && draft[step.id].every(isAnswered);
}

function isAnswered(value) {
  return value !== "" && value !== null && value !== undefined;
}

function slugify(value) {
  return String(value || "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}
