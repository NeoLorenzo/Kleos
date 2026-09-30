"use client";

import {
  METHODOLOGY_VERSION,
  PUBLIC_VECTORS,
  confidenceLabel,
  formatScore,
  polar
} from "./publicModel";
import { useCountUp, useInView } from "./useInView";
import styles from "./CharacterSheetPreview.module.css";

const RADAR_R = 118;

function radarPoints(values) {
  return values
    .map((value, index) => polar(index, (RADAR_R * (value ?? 0)) / 100).join(","))
    .join(" ");
}

export function Sparkline({ values, width = 72, height = 22, className = "" }) {
  const known = values.map((value, index) => ({ value, index })).filter((point) => point.value !== null);
  if (known.length < 2) return <span className={styles.noHistory}>No history</span>;
  const min = Math.min(...known.map((point) => point.value)) - 2;
  const max = Math.max(...known.map((point) => point.value)) + 2;
  const x = (index) => (index / (values.length - 1)) * (width - 4) + 2;
  const y = (value) => height - 2 - ((value - min) / (max - min || 1)) * (height - 4);
  const d = known.map((point, i) => `${i ? "L" : "M"}${x(point.index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
  const last = known[known.length - 1];
  return (
    <svg className={`${styles.sparkline} ${className}`} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} pathLength="1" />
      <circle cx={x(last.index)} cy={y(last.value)} r="2.2" />
    </svg>
  );
}

function VectorRow({ vector, active, order }) {
  const assessed = vector.result.status === "assessed";
  const value = useCountUp(assessed ? vector.result.score : null, active, 1500 + order * 60);

  return (
    <div className={styles.row} style={{ "--i": order }}>
      <div className={styles.rowLabel}>
        <strong>{vector.label}</strong>
        <span>{confidenceLabel(vector.result.confidence)}</span>
      </div>
      <div className={`${styles.bar} ${assessed ? "" : styles.barUnknown}`}>
        {assessed ? <span style={{ "--w": `${vector.result.score}%` }} /> : null}
      </div>
      <span className={styles.score}>{assessed ? value.toFixed(1) : "—"}</span>
      <span
        className={`${styles.delta} ${vector.delta > 0 ? styles.up : ""} ${vector.delta < 0 ? styles.down : ""}`}
      >
        {vector.delta === null ? "" : `${vector.delta > 0 ? "▲" : vector.delta < 0 ? "▼" : "■"} ${Math.abs(vector.delta).toFixed(1)}`}
      </span>
      <Sparkline values={vector.history} />
    </div>
  );
}

export default function CharacterSheetPreview() {
  const [ref, inView] = useInView({ threshold: 0.18 });
  const latest = PUBLIC_VECTORS.map((vector) =>
    vector.result.status === "assessed" ? vector.result.score : 0
  );
  const previous = PUBLIC_VECTORS.map((vector) => vector.history[vector.history.length - 2] ?? 0);
  const assessedCount = PUBLIC_VECTORS.filter((vector) => vector.result.status === "assessed").length;

  return (
    <div ref={ref} className={`${styles.stage} ${inView ? styles.visible : ""}`}>
      <div className={styles.window} aria-label="Illustrative Kleos character sheet with synthetic data" role="img">
        <div className={styles.chrome}>
          <span className={styles.dots} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className={styles.url}>kleos.fabbrosystems.com</span>
          <span className={styles.chromeTag}>Synthetic example</span>
        </div>

        <div className={styles.app}>
          <aside className={styles.sidebar} aria-hidden="true">
            <img src="/brand/kleos-lockup.svg" alt="" className={styles.sideLockup} />
            <small>Overview</small>
            <span className={styles.sideActive}>Character Sheet</span>
            <small>Dimensions</small>
            {PUBLIC_VECTORS.map((vector) => (
              <span key={vector.id}>{vector.label}</span>
            ))}
          </aside>

          <div className={styles.main}>
            <p className={styles.kicker}>Character sheet</p>
            <h3 className={styles.name}>Alex Example</h3>
            <p className={styles.summary}>
              Strongest in Intellectual and Psychological; weakest in Financial. Experiential is not
              yet assessable.
            </p>
            <p className={styles.meta}>
              Assessed Sep 30, 2026 · {assessedCount} of 8 dimensions · Methodology {METHODOLOGY_VERSION}
            </p>

            <div className={styles.card}>
              <div className={styles.cardHead}>
                <strong>Current dimensional state</strong>
                <span className={styles.legend}>
                  <i className={styles.legendLatest} /> Latest
                  <i className={styles.legendPrevious} /> Previous
                </span>
              </div>

              <div className={styles.cardBody}>
                <svg className={styles.radar} viewBox="-170 -160 340 320" aria-hidden="true">
                  {[25, 50, 75, 100].map((value) => (
                    <polygon
                      key={value}
                      className={styles.radarRing}
                      points={radarPoints(new Array(8).fill(value))}
                    />
                  ))}
                  {PUBLIC_VECTORS.map((vector, index) => {
                    const [x, y] = polar(index, RADAR_R);
                    const [lx, ly] = polar(index, RADAR_R + 24);
                    return (
                      <g key={vector.id}>
                        <line className={styles.radarAxis} x1="0" y1="0" x2={x} y2={y} />
                        <text
                          className={styles.radarLabel}
                          x={lx}
                          y={ly}
                          textAnchor={Math.abs(lx) < 4 ? "middle" : lx > 0 ? "start" : "end"}
                          dominantBaseline="middle"
                        >
                          {vector.label}
                        </text>
                      </g>
                    );
                  })}
                  <polygon className={styles.radarPrevious} points={radarPoints(previous)} />
                  <polygon className={styles.radarLatest} points={radarPoints(latest)} />
                  {latest.map((value, index) => {
                    if (!value) return null;
                    const [x, y] = polar(index, (RADAR_R * value) / 100);
                    return <circle key={index} className={styles.radarDot} cx={x} cy={y} r="3" />;
                  })}
                </svg>

                <div className={styles.rows}>
                  {PUBLIC_VECTORS.map((vector, index) => (
                    <VectorRow key={vector.id} vector={vector} active={inView} order={index} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.callouts} aria-hidden="true">
        <span className={styles.calloutA}>
          <b>{formatScore(PUBLIC_VECTORS[5].result.score)}</b> Relational is capped by 60% coverage
        </span>
        <span className={styles.calloutB}>
          <b>Unknown</b> Experiential is never scored from thin evidence
        </span>
      </div>
    </div>
  );
}
