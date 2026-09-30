"use client";

import { useMemo, useState } from "react";
import {
  ANCHORS,
  ANCHOR_MEANINGS,
  COVERAGE_CAPS,
  METHODOLOGY_VERSION,
  PUBLIC_VECTORS,
  aggregateVectorSubdomains,
  buildSubdomains,
  formatScore,
  getExampleJudgments
} from "./publicModel";
import styles from "./ModelSimulator.module.css";

const CONFIDENCE = [
  { id: "low", label: "L" },
  { id: "medium", label: "M" },
  { id: "high", label: "H" }
];

const TIERS = [
  { label: "Unknown", min: 0, max: 50, cap: null },
  ...COVERAGE_CAPS.map((rule) => ({
    label: rule.cap === 100 ? "100" : `≤${rule.cap}`,
    min: rule.min,
    max: rule.max === 100 ? 100 : Math.ceil(rule.max),
    cap: rule.cap
  }))
];

function presetJudgments(vectorId, preset) {
  const vector = PUBLIC_VECTORS.find((item) => item.id === vectorId);
  if (preset === "example") return getExampleJudgments(vectorId);
  if (preset === "single") {
    return vector.subdomains.map((_, index) => ({
      score: index === 0 ? 100 : null,
      confidence: "high"
    }));
  }
  if (preset === "narrow") {
    let covered = 0;
    return vector.subdomains.map((subdomain) => {
      if (covered >= 50) return { score: null, confidence: "high" };
      covered += subdomain.weight;
      return { score: 100, confidence: "high" };
    });
  }
  return vector.subdomains.map(() => ({ score: 85, confidence: "high" }));
}

function explain(result, rawCapped) {
  if (result.status !== "assessed") {
    return result.coveragePct === 0
      ? "No subdomain is assessable. Kleos records the vector as unknown instead of inventing a number."
      : `Only ${formatScore(result.coveragePct)}% of the vector's weight is evidenced. Below 50%, the vector stays unknown however strong that evidence is.`;
  }
  if (rawCapped) {
    return `The assessed subdomains average ${formatScore(result.rawScore)}, but ${formatScore(result.coveragePct)}% coverage caps the vector at ${result.scoreCap}. Narrow evidence can't stand in for the whole vector.`;
  }
  return `Weighted mean of assessed subdomains: ${formatScore(result.rawScore)}, within the ${result.scoreCap} cap for ${formatScore(result.coveragePct)}% coverage. Confidence is ${result.confidence}.`;
}

export default function ModelSimulator() {
  const [vectorId, setVectorId] = useState("relational");
  const [judgments, setJudgments] = useState(() => getExampleJudgments("relational"));
  const [hint, setHint] = useState(null);

  const subdomains = useMemo(
    () => buildSubdomains(vectorId, judgments.map((item) => [item.score, item.confidence])),
    [vectorId, judgments]
  );
  const result = useMemo(() => aggregateVectorSubdomains(subdomains), [subdomains]);
  const rawCapped = result.status === "assessed" && result.rawScore > result.scoreCap;
  const coverage = result.coveragePct;
  const activeTier = TIERS.findIndex((tier, index) =>
    index === 0 ? coverage < 50 : coverage >= tier.min && coverage <= (tier.cap === 100 ? 100 : tier.max - 0.001)
  );

  const selectVector = (id) => {
    setVectorId(id);
    setJudgments(getExampleJudgments(id));
    setHint(null);
  };

  const update = (index, patch) => {
    setJudgments((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  return (
    <div className={styles.simulator}>
      <div className={styles.toolbar}>
        <div className={styles.vectorChips} role="radiogroup" aria-label="Vector to simulate">
          {PUBLIC_VECTORS.map((vector) => (
            <button
              key={vector.id}
              type="button"
              role="radio"
              aria-checked={vector.id === vectorId}
              className={vector.id === vectorId ? styles.chipOn : ""}
              onClick={() => selectVector(vector.id)}
            >
              {vector.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.inputs}>
          <div className={styles.inputsHead}>
            <span>Subdomain</span>
            <span>Anchor</span>
            <span>Confidence</span>
          </div>

          {subdomains.map((subdomain, index) => {
            const judgment = judgments[index];
            const known = judgment.score !== null;
            return (
              <div className={styles.inputRow} key={subdomain.id}>
                <div className={styles.inputLabel}>
                  <strong>{subdomain.label}</strong>
                  <span>{subdomain.weight}% weight</span>
                </div>

                <div className={styles.anchors} role="radiogroup" aria-label={`${subdomain.label} anchor`}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!known}
                    aria-label="Unknown"
                    className={`${styles.unknownButton} ${!known ? styles.anchorOn : ""}`}
                    onClick={() => {
                      update(index, { score: null });
                      setHint(null);
                    }}
                    title="Unknown: evidence cannot characterise this subdomain"
                  >
                    ?
                  </button>
                  {ANCHORS.map((anchor) => (
                    <button
                      key={anchor}
                      type="button"
                      role="radio"
                      aria-checked={judgment.score === anchor}
                      className={judgment.score === anchor ? styles.anchorOn : ""}
                      onClick={() => {
                        update(index, { score: anchor });
                        setHint(anchor);
                      }}
                      onMouseEnter={() => setHint(anchor)}
                      onFocus={() => setHint(anchor)}
                      title={ANCHOR_MEANINGS[anchor]}
                    >
                      {anchor}
                    </button>
                  ))}
                </div>

                <div
                  className={`${styles.confidence} ${known ? "" : styles.confidenceOff}`}
                  role="radiogroup"
                  aria-label={`${subdomain.label} confidence`}
                >
                  {CONFIDENCE.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={known && judgment.confidence === option.id}
                      aria-label={`${option.id} confidence`}
                      disabled={!known}
                      className={known && judgment.confidence === option.id ? styles.confidenceOn : ""}
                      onClick={() => update(index, { confidence: option.id })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          <p className={styles.hint} aria-live="polite">
            {hint === null ? (
              <>
                <b>?</b> Unknown means the evidence can&apos;t characterise the subdomain. It lowers
                coverage and never counts as a low score.
              </>
            ) : (
              <>
                <b>{hint}</b> {ANCHOR_MEANINGS[hint]}.
              </>
            )}
          </p>

          <div className={styles.presets}>
            <span>Try</span>
            <button type="button" onClick={() => setJudgments(presetJudgments(vectorId, "single"))}>
              One brilliant data point
            </button>
            <button type="button" onClick={() => setJudgments(presetJudgments(vectorId, "narrow"))}>
              Narrow but perfect
            </button>
            <button type="button" onClick={() => setJudgments(presetJudgments(vectorId, "full"))}>
              Fully evidenced
            </button>
            <button type="button" onClick={() => setJudgments(presetJudgments(vectorId, "example"))}>
              Reset example
            </button>
          </div>
        </div>

        <div className={styles.output} aria-live="polite">
          <span className={styles.outputKicker}>Vector state</span>
          <div className={styles.scoreLine}>
            <strong
              className={result.status === "assessed" ? styles.score : styles.scoreUnknown}
              key={`${result.score}-${result.status}`}
            >
              {result.status === "assessed" ? formatScore(result.score) : "Unknown"}
            </strong>
            {rawCapped ? (
              <span className={styles.capBadge}>
                <s>{formatScore(result.rawScore)}</s> capped
              </span>
            ) : null}
          </div>

          <div className={styles.metrics}>
            <div>
              <span>Coverage</span>
              <strong>{formatScore(coverage)}%</strong>
            </div>
            <div>
              <span>Raw mean</span>
              <strong>{result.status === "assessed" ? formatScore(result.rawScore) : "—"}</strong>
            </div>
            <div>
              <span>Confidence</span>
              <strong className={styles.capitalize}>{result.confidence}</strong>
            </div>
          </div>

          <div className={styles.ladder}>
            <span className={styles.ladderLabel}>Score cap by evidence coverage</span>
            <div className={styles.ladderTrack}>
              <span className={styles.ladderFill} style={{ width: `${coverage}%` }} />
              <span className={styles.ladderMarker} style={{ left: `${coverage}%` }} />
            </div>
            <div className={styles.tiers}>
              {TIERS.map((tier, index) => (
                <span
                  key={tier.label}
                  className={index === activeTier ? styles.tierOn : ""}
                  style={{ flexGrow: Math.max(tier.max - tier.min, 6) }}
                >
                  {tier.label}
                </span>
              ))}
            </div>
          </div>

          <p className={styles.explanation}>{explain(result, rawCapped)}</p>

          <p className={styles.provenance}>
            <code>aggregateVectorSubdomains()</code> · the same deterministic function Kleos uses for
            real snapshots · Methodology {METHODOLOGY_VERSION}
          </p>
        </div>
      </div>
    </div>
  );
}
