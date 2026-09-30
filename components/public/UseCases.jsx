"use client";

import { PUBLIC_VECTORS, SNAPSHOT_DATES, formatScore } from "./publicModel";
import { useInView } from "./useInView";
import styles from "./UseCases.module.css";

const HRV = [62, 64, 61, 66, 68, 65, 70, 72, 69, 74, 76, 73, 77, 80];
const LIFTS = [
  { name: "Back squat", value: "145 kg", ratio: "1.61× BW" },
  { name: "Bench press", value: "110 kg", ratio: "1.22× BW" },
  { name: "Deadlift", value: "180 kg", ratio: "2.00× BW" }
];
const BIG_FIVE = [
  { trait: "Openness", value: 84 },
  { trait: "Conscientiousness", value: 91 },
  { trait: "Extraversion", value: 42 },
  { trait: "Agreeableness", value: 67 },
  { trait: "Neuroticism", value: 22 }
];
const TREND_IDS = ["physical", "intellectual", "financial"];

function areaPath(values, width, height, min, max) {
  const x = (index) => (index / (values.length - 1)) * width;
  const y = (value) => height - ((value - min) / (max - min)) * height;
  const line = values.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  return { line, area: `${line} L${width},${height} L0,${height} Z` };
}

function TrainingVisual() {
  const { line, area } = areaPath(HRV, 300, 70, 55, 84);
  return (
    <div className={styles.visual}>
      <div className={styles.metricHead}>
        <span>Heart-rate variability · 14 days</span>
        <strong>
          80 <small>ms</small>
        </strong>
      </div>
      <svg viewBox="0 0 300 70" preserveAspectRatio="none" className={styles.area} aria-hidden="true">
        <path d={area} className={styles.areaFill} />
        <path d={line} className={styles.areaLine} pathLength="1" />
      </svg>
      <ul className={styles.lifts}>
        {LIFTS.map((lift) => (
          <li key={lift.name}>
            <strong>{lift.name}</strong>
            <span>{lift.value}</span>
            <span className={styles.ratio}>{lift.ratio}</span>
            <span className={styles.badge}>Heracles</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FinancialVisual() {
  return (
    <div className={styles.visual}>
      <div className={styles.metricHead}>
        <span>Net worth</span>
        <strong>€412,300</strong>
      </div>
      <div className={styles.split} aria-hidden="true">
        <span className={styles.splitLiquid} />
        <span className={styles.splitIlliquid} />
      </div>
      <div className={styles.splitLegend}>
        <span>
          <i className={styles.dotLiquid} /> Liquid €16,400 · 4%
        </span>
        <span>
          <i className={styles.dotIlliquid} /> Illiquid €395,900
        </span>
      </div>
      <div className={styles.subScores}>
        <div>
          <span>Balance-sheet security</span>
          <b>85</b>
        </div>
        <div>
          <span>Liquidity & resilience</span>
          <b className={styles.low}>25</b>
        </div>
        <div>
          <span>Cash-flow independence</span>
          <b className={styles.low}>25</b>
        </div>
      </div>
    </div>
  );
}

function PersonalityVisual() {
  return (
    <div className={styles.visual}>
      <div className={styles.metricHead}>
        <span>Big Five · domain percentile</span>
        <strong>
          5 <small>instruments</small>
        </strong>
      </div>
      <ul className={styles.traits}>
        {BIG_FIVE.map((trait, index) => (
          <li key={trait.trait} style={{ "--i": index }}>
            <span>{trait.trait}</span>
            <span className={styles.traitTrack}>
              <i style={{ "--w": `${trait.value}%` }} />
            </span>
            <b>{trait.value}</b>
          </li>
        ))}
      </ul>
      <div className={styles.instruments}>
        {["WHO-5", "SWLS", "GAD-7", "PHQ-9"].map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
    </div>
  );
}

function ChangeVisual() {
  const series = TREND_IDS.map((id) => PUBLIC_VECTORS.find((vector) => vector.id === id));
  const min = 45;
  const max = 90;
  const width = 520;
  const height = 170;
  const x = (index) => 10 + (index / (SNAPSHOT_DATES.length - 1)) * (width - 110);
  const y = (value) => height - ((value - min) / (max - min)) * height;

  return (
    <div className={styles.visual}>
      <svg viewBox={`0 0 ${width} ${height + 18}`} className={styles.trend} aria-hidden="true">
        {[55, 70, 85].map((value) => (
          <line key={value} x1="0" x2={width - 96} y1={y(value)} y2={y(value)} className={styles.trendGrid} />
        ))}
        {series.map((vector, seriesIndex) => {
          const d = vector.history
            .map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`)
            .join(" ");
          const last = vector.history[vector.history.length - 1];
          return (
            <g key={vector.id} className={styles[`series${seriesIndex}`]}>
              <path d={d} pathLength="1" className={styles.trendLine} />
              <circle cx={x(vector.history.length - 1)} cy={y(last)} r="3.5" />
              <text x={x(vector.history.length - 1) + 9} y={y(last) + 4}>
                {vector.label}
              </text>
            </g>
          );
        })}
        {SNAPSHOT_DATES.map((date, index) => (
          <text key={date} x={x(index)} y={height + 15} textAnchor="middle" className={styles.trendDate}>
            {date.slice(0, 3)}
          </text>
        ))}
      </svg>
      <div className={styles.deltas}>
        {series.map((vector) => {
          const delta = vector.history[vector.history.length - 1] - vector.history[0];
          return (
            <span key={vector.id}>
              {vector.label}
              <b className={delta >= 0 ? styles.pos : styles.neg}>
                {delta >= 0 ? "+" : "−"}
                {formatScore(Math.abs(Math.round(delta * 10) / 10))}
              </b>
            </span>
          );
        })}
      </div>
    </div>
  );
}

const CASES = [
  {
    id: "training",
    vector: "Physical",
    question: "Is my training actually working?",
    body: "Apple Health recovery data and Heracles strength data in one picture. You see whether HRV, sleep, and your lifts are moving together or pulling apart.",
    Visual: TrainingVisual
  },
  {
    id: "money",
    vector: "Financial",
    question: "Where do I really stand financially?",
    body: "Open banking and an explicit asset register. Kleos doesn't mistake net worth for security: liquidity and independence are scored separately.",
    Visual: FinancialVisual
  },
  {
    id: "personality",
    vector: "Psychological",
    question: "What am I like, measured properly?",
    body: "Validated instruments (Big Five, WHO-5, SWLS, GAD-7, PHQ-9) are stored as dated, canonical evidence. No horoscope-grade labels.",
    Visual: PersonalityVisual
  },
  {
    id: "change",
    vector: "Longitudinal",
    question: "What has actually changed since spring?",
    body: "Immutable snapshots mean you compare like with like. What improved, what slipped, and what evidence carried each version.",
    Visual: ChangeVisual
  }
];

function UseCaseCard({ item, index }) {
  const [ref, inView] = useInView({ threshold: 0.3 });
  const { Visual } = item;
  return (
    <article
      ref={ref}
      className={`${styles.card} ${inView ? styles.inView : ""}`}
      style={{ "--delay": `${(index % 2) * 120}ms` }}
    >
      <div className={styles.cardCopy}>
        <span className={styles.vectorTag}>{item.vector}</span>
        <h3>{item.question}</h3>
        <p>{item.body}</p>
      </div>
      <Visual />
    </article>
  );
}

export default function UseCases() {
  return (
    <div className={styles.grid}>
      {CASES.map((item, index) => (
        <UseCaseCard key={item.id} item={item} index={index} />
      ))}
    </div>
  );
}
