"use client";

import { useEffect, useRef, useState } from "react";
import {
  ANCHORS,
  METHODOLOGY_VERSION,
  PUBLIC_VECTORS,
  SNAPSHOT_DATES,
  formatScore
} from "./publicModel";
import styles from "./EvidencePipeline.module.css";

const PHYSICAL = PUBLIC_VECTORS.find((vector) => vector.id === "physical");

const STEPS = [
  {
    id: "evidence",
    title: "Evidence",
    heading: "Bring in what is already true.",
    body: "Kleos draws on records you already produce: Apple Health physiology, Heracles strength data, open-banking transactions, validated assessments, transcripts, and your own records. Every source keeps its own identity.",
    points: ["Sources stay distinct and traceable", "Raw evidence is never overwritten by interpretation"]
  },
  {
    id: "assessment",
    title: "Assessment",
    heading: "Judge each subdomain against fixed anchors.",
    body: "Each subdomain first passes an assessability gate: does the evidence actually characterise it? If so, it gets one of seven fixed anchors. No interpolated 78s, no scores made up to fill gaps.",
    points: ["Seven canonical anchors: 0, 25, 50, 70, 85, 95, 100", "Missing evidence stays unknown and is never marked down"]
  },
  {
    id: "state",
    title: "State",
    heading: "Let arithmetic produce the score.",
    body: "The evaluator never writes a vector score. Kleos calculates it from fixed weights, caps it by evidence coverage, and derives confidence the same way every time.",
    points: ["Weighted mean of assessed subdomains", "Narrow evidence can't produce a near-perfect vector"]
  },
  {
    id: "history",
    title: "History",
    heading: "Freeze every evaluation in time.",
    body: "Each evaluation becomes an immutable snapshot with its methodology version, so you can ask what changed, when, and on what evidence the earlier view rested.",
    points: ["Append-only, dated snapshots", "Methodology changes are versioned, never silently mixed"]
  }
];

const EVIDENCE = [
  { source: "Apple Health", label: "Resting heart rate", value: "45 bpm", note: "90-day median" },
  { source: "Apple Health", label: "Heart-rate variability", value: "80 ms", note: "30-day average" },
  { source: "Apple Health", label: "Sleep", value: "7h 28m", note: "1 night recorded", weak: true },
  { source: "Heracles", label: "Deadlift · estimated 1RM", value: "180 kg", note: "2.0× bodyweight" },
  { source: "Nutrition", label: "Protein intake", value: "176 g", note: "7-day average" },
  { source: "Clinical", label: "Blood panel", value: "In range", note: "Jun 2026" }
];

const GATE_NOTES = {
  clinical_health: "Recent blood panel, no flagged markers",
  cardiorespiratory_activity: "Resting HR, HRV, and steps agree",
  strength_function: "Six current lifts from Heracles",
  sleep_recovery: "One night can't characterise sleep",
  nutrition_body_composition: "Macros are mixed and inconsistent"
};

function PipelineVisual({ stage }) {
  const result = PHYSICAL.result;
  const history = PHYSICAL.history;
  const chartMin = 50;
  const chartMax = 80;
  const cx = (index) => 24 + (index / (history.length - 1)) * 392;
  const cy = (value) => 150 - ((value - chartMin) / (chartMax - chartMin)) * 124;
  const historyPath = history.map((value, index) => `${index ? "L" : "M"}${cx(index)},${cy(value)}`).join(" ");

  return (
    <div className={styles.visual} data-stage={stage}>
      <div className={styles.visualHead}>
        <span className={styles.vectorPill}>Physical vector</span>
        <span className={styles.visualTitle}>{STEPS[stage].title}</span>
      </div>

      <div className={`${styles.layer} ${stage === 0 ? styles.layerActive : ""}`}>
        <ul className={styles.evidenceList}>
          {EVIDENCE.map((item, index) => (
            <li key={item.label} style={{ "--i": index }} className={item.weak ? styles.weak : ""}>
              <span className={styles.source}>{item.source}</span>
              <span className={styles.evidenceLabel}>
                {item.label}
                <small>{item.note}</small>
              </span>
              <strong>{item.value}</strong>
            </li>
          ))}
        </ul>
      </div>

      <div className={`${styles.layer} ${stage === 1 ? styles.layerActive : ""}`}>
        <ul className={styles.gateList}>
          {PHYSICAL.subdomains.map((subdomain, index) => {
            const assessed = subdomain.status === "assessed";
            return (
              <li key={subdomain.id} style={{ "--i": index }}>
                <div className={styles.gateTop}>
                  <span className={assessed ? styles.gatePass : styles.gateFail} aria-hidden="true">
                    {assessed ? "✓" : "?"}
                  </span>
                  <strong>{subdomain.label}</strong>
                  <span className={styles.gateConfidence}>
                    {assessed ? `${subdomain.confidence} confidence` : "Unknown"}
                  </span>
                </div>
                <p>{GATE_NOTES[subdomain.id]}</p>
                <div className={styles.anchorScale} aria-hidden="true">
                  {ANCHORS.map((anchor) => (
                    <span
                      key={anchor}
                      className={anchor === subdomain.score ? styles.anchorOn : ""}
                    >
                      {anchor}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={`${styles.layer} ${stage === 2 ? styles.layerActive : ""}`}>
        <div className={styles.stateLayer}>
          <div className={styles.coverage}>
            <div className={styles.coverageHead}>
              <span>Evidence coverage</span>
              <strong>{formatScore(result.coveragePct)}%</strong>
            </div>
            <div className={styles.coverageBar}>
              {PHYSICAL.subdomains.map((subdomain, index) => (
                <span
                  key={subdomain.id}
                  style={{ flexGrow: subdomain.weight, "--i": index }}
                  className={subdomain.status === "assessed" ? styles.covered : styles.uncovered}
                  title={subdomain.label}
                />
              ))}
            </div>
          </div>

          <dl className={styles.equation}>
            <div style={{ "--i": 0 }}>
              <dt>Weighted mean of assessed subdomains</dt>
              <dd>{formatScore(result.rawScore)}</dd>
            </div>
            <div style={{ "--i": 1 }}>
              <dt>Coverage cap for 80–89.9%</dt>
              <dd>{result.scoreCap}</dd>
            </div>
            <div style={{ "--i": 2 }}>
              <dt>Confidence (coverage under 85%)</dt>
              <dd className={styles.confidenceValue}>{result.confidence}</dd>
            </div>
          </dl>

          <div className={styles.final}>
            <span>Physical</span>
            <strong>{formatScore(result.score)}</strong>
            <small>min({formatScore(result.rawScore)}, {result.scoreCap}) · calculated, never guessed</small>
          </div>
        </div>
      </div>

      <div className={`${styles.layer} ${stage === 3 ? styles.layerActive : ""}`}>
        <div className={styles.historyLayer}>
          <svg viewBox="0 0 440 176" className={styles.historyChart} aria-hidden="true">
            {[55, 65, 75].map((value) => (
              <g key={value}>
                <line x1="24" x2="416" y1={cy(value)} y2={cy(value)} className={styles.gridLine} />
                <text x="0" y={cy(value) + 4} className={styles.gridLabel}>
                  {value}
                </text>
              </g>
            ))}
            <path d={`${historyPath} L${cx(history.length - 1)},150 L${cx(0)},150 Z`} className={styles.historyArea} />
            <path d={historyPath} className={styles.historyLine} pathLength="1" />
            {history.map((value, index) => (
              <g key={SNAPSHOT_DATES[index]}>
                <circle cx={cx(index)} cy={cy(value)} r={index === history.length - 1 ? 5 : 3.5} className={styles.historyDot} />
                <text x={cx(index)} y="170" className={styles.historyDate} textAnchor="middle">
                  {SNAPSHOT_DATES[index].slice(0, 3)}
                </text>
              </g>
            ))}
          </svg>

          <ul className={styles.snapshotList}>
            <li style={{ "--i": 0 }}>
              <span className={styles.lock} aria-hidden="true" />
              <strong>Sep 30, 2026</strong>
              <span>Methodology {METHODOLOGY_VERSION}</span>
              <b>{formatScore(result.score)}</b>
            </li>
            <li style={{ "--i": 1 }}>
              <span className={styles.lock} aria-hidden="true" />
              <strong>Aug 31, 2026</strong>
              <span>Methodology {METHODOLOGY_VERSION}</span>
              <b>{formatScore(history[history.length - 2])}</b>
            </li>
            <li style={{ "--i": 2 }} className={styles.legacy}>
              <span className={styles.lock} aria-hidden="true" />
              <strong>Feb 14, 2026</strong>
              <span>Methodology 1.x · legacy</span>
              <b>Not comparable</b>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function EvidencePipeline() {
  const [stage, setStage] = useState(0);
  const stepRefs = useRef([]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setStage(Number(entry.target.dataset.step));
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );
    stepRefs.current.forEach((node) => node && observer.observe(node));
    return () => observer.disconnect();
  }, []);

  const goTo = (index) => {
    stepRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className={styles.pipeline}>
      <div className={styles.steps}>
        {STEPS.map((step, index) => (
          <article
            key={step.id}
            ref={(node) => {
              stepRefs.current[index] = node;
            }}
            data-step={index}
            className={`${styles.step} ${stage === index ? styles.stepActive : ""}`}
          >
            <span className={styles.stepNumber}>
              {String(index + 1).padStart(2, "0")} · {step.title}
            </span>
            <h3>{step.heading}</h3>
            <p>{step.body}</p>
            <ul>
              {step.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <div className={styles.inlineVisual}>
              <PipelineVisual stage={index} />
            </div>
          </article>
        ))}
      </div>

      <div className={styles.stickyColumn}>
        <div className={styles.sticky}>
          <nav className={styles.progress} aria-label="How Kleos works">
            {STEPS.map((step, index) => (
              <button
                key={step.id}
                type="button"
                className={stage === index ? styles.progressActive : ""}
                aria-current={stage === index ? "step" : undefined}
                onClick={() => goTo(index)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                {step.title}
              </button>
            ))}
          </nav>
          <PipelineVisual stage={stage} />
        </div>
      </div>
    </div>
  );
}
