"use client";

import { useEffect, useState } from "react";
import {
  PUBLIC_VECTORS,
  angleDeg,
  formatScore,
  polar
} from "./publicModel";
import { usePrefersReducedMotion } from "./useInView";
import styles from "./RadianceField.module.css";

const R = 220;
const CORE = 26;
const RINGS = [50, 70, 85, 95, 100];

const TICKER = {
  physical: { source: "Heracles", evidence: "Deadlift · e1RM 180 kg · 2.0× BW", target: "Strength & function", anchor: "85" },
  psychological: { source: "Big Five inventory", evidence: "Conscientiousness · 91st percentile", target: "Agency & follow-through", anchor: "85" },
  intellectual: { source: "Academic transcript", evidence: "Stage result · First class", target: "Knowledge & mastery", anchor: "85" },
  professional: { source: "CV", evidence: "Led a six-person product team", target: "Role & responsibility", anchor: "70" },
  financial: { source: "Open banking", evidence: "4% of assets are liquid", target: "Liquidity & resilience", anchor: "25" },
  relational: { source: "Evidence register", evidence: "No community evidence on record", target: "Community & belonging", anchor: null },
  creative: { source: "Portfolio", evidence: "14 original works in 12 months", target: "Output cadence", anchor: "70" },
  experiential: { source: "Experience log", evidence: "One recent trip logged", target: "Recent novelty", anchor: null }
};

function ringPoints(value) {
  return PUBLIC_VECTORS.map((_, index) => polar(index, (R * value) / 100).join(",")).join(" ");
}

export default function RadianceField() {
  const reduced = usePrefersReducedMotion();
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(0);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 120);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready || pinned || reduced) return undefined;
    const timer = setInterval(() => {
      setActive((current) => (current + 1) % PUBLIC_VECTORS.length);
    }, 2800);
    return () => clearInterval(timer);
  }, [ready, pinned, reduced]);

  const shape = PUBLIC_VECTORS.map((vector, index) => {
    const value = vector.result.status === "assessed" ? vector.result.score : 0;
    return polar(index, Math.max(CORE, (R * value) / 100)).join(",");
  }).join(" ");

  const activeVector = PUBLIC_VECTORS[active];
  const ticker = TICKER[activeVector.id];

  return (
    <div
      className={`${styles.field} ${ready ? styles.ready : ""}`}
      aria-label="Illustrative Kleos state: eight vectors radiating from one person"
      role="img"
    >
      <div className={styles.glow} aria-hidden="true" />

      <svg className={styles.svg} viewBox="-320 -320 640 640" aria-hidden="true">
        <defs>
          <linearGradient id="kleos-ray" x1="0" y1="0" x2="0" y2={-R} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.3" stopColor="#ffffff" />
            <stop offset="1" stopColor="var(--fs-accent)" />
          </linearGradient>
          <filter id="kleos-bloom" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        <g className={styles.rings}>
          {RINGS.map((value) => (
            <polygon key={value} points={ringPoints(value)} data-anchor={value} />
          ))}
          {PUBLIC_VECTORS.map((vector, index) => {
            const [x, y] = polar(index, R + 14);
            return <line key={vector.id} x1="0" y1="0" x2={x} y2={y} />;
          })}
        </g>

        <g className={styles.anchorLabels}>
          {RINGS.slice(0, 4).map((value) => {
            const [x, y] = polar(0.5, (R * value) / 100);
            return (
              <text key={value} x={x + 6} y={y}>
                {value}
              </text>
            );
          })}
        </g>

        <polygon className={styles.shape} points={shape} />

        {PUBLIC_VECTORS.map((vector, index) => {
          const assessed = vector.result.status === "assessed";
          const length = assessed ? (R * vector.result.score) / 100 : R * 0.5;
          const isActive = index === active;
          return (
            <g
              key={vector.id}
              transform={`rotate(${angleDeg(index)})`}
              className={`${styles.axis} ${isActive ? styles.activeAxis : ""}`}
              style={{ "--i": index }}
            >
              {!reduced
                ? [0, 1].map((particle) => (
                    <circle
                      key={particle}
                      className={styles.particle}
                      r="2.4"
                      cx="0"
                      cy="0"
                      style={{ "--p": particle }}
                    />
                  ))
                : null}

              {assessed ? (
                <>
                  <line
                    className={styles.bloom}
                    x1="0"
                    y1={-CORE - 4}
                    x2="0"
                    y2={-length}
                    filter="url(#kleos-bloom)"
                  />
                  <line
                    className={styles.ray}
                    x1="0"
                    y1={-CORE - 4}
                    x2="0"
                    y2={-length}
                    pathLength="1"
                    stroke="url(#kleos-ray)"
                  />
                  <circle className={styles.tip} cx="0" cy={-length} r="4.5" />
                </>
              ) : (
                <line
                  className={styles.unknownRay}
                  x1="0"
                  y1={-CORE - 4}
                  x2="0"
                  y2={-length}
                />
              )}
            </g>
          );
        })}

        <circle className={styles.coreHalo} r={CORE + 12} />
        <circle className={styles.core} r={CORE} />
      </svg>

      <div className={styles.labels}>
        {PUBLIC_VECTORS.map((vector, index) => {
          const [x, y] = polar(index, R + 52);
          const assessed = vector.result.status === "assessed";
          return (
            <button
              key={vector.id}
              type="button"
              className={`${styles.label} ${index === active ? styles.activeLabel : ""}`}
              style={{
                left: `${((x + 320) / 640) * 100}%`,
                top: `${((y + 320) / 640) * 100}%`,
                "--i": index
              }}
              onMouseEnter={() => {
                setActive(index);
                setPinned(true);
              }}
              onFocus={() => {
                setActive(index);
                setPinned(true);
              }}
              onMouseLeave={() => setPinned(false)}
              onBlur={() => setPinned(false)}
              aria-label={`${vector.label}: ${assessed ? formatScore(vector.result.score) : "unknown"}`}
            >
              <span>{vector.label}</span>
              <strong>{assessed ? formatScore(vector.result.score) : "Unknown"}</strong>
            </button>
          );
        })}
      </div>

      <div className={styles.ticker} aria-live="polite" key={activeVector.id}>
        <div className={styles.tickerRow}>
          <span className={styles.tickerSource}>{ticker.source}</span>
          <span className={styles.tickerEvidence}>{ticker.evidence}</span>
        </div>
        <div className={styles.tickerArrow} aria-hidden="true" />
        <div className={styles.tickerRow}>
          <span className={styles.tickerTarget}>
            {activeVector.label} · {ticker.target}
          </span>
          <span className={ticker.anchor ? styles.tickerAnchor : styles.tickerUnknown}>
            {ticker.anchor ? `Anchor ${ticker.anchor}` : "Stays unknown"}
          </span>
        </div>
      </div>
    </div>
  );
}
