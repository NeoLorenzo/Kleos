"use client";

import { useState } from "react";
import {
  PUBLIC_VECTORS,
  angleDeg,
  confidenceLabel,
  formatScore,
  polar
} from "./publicModel";
import styles from "./VectorExplorer.module.css";

const R = 150;

export default function VectorExplorer() {
  const [selected, setSelected] = useState(0);
  const vector = PUBLIC_VECTORS[selected];
  const assessed = vector.result.status === "assessed";

  const onKeyDown = (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((selected + 1) % PUBLIC_VECTORS.length);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((selected + PUBLIC_VECTORS.length - 1) % PUBLIC_VECTORS.length);
    }
  };

  return (
    <div className={styles.explorer}>
      <div className={styles.wheel}>
        <svg viewBox="-230 -230 460 460" className={styles.wheelSvg} aria-hidden="true">
          <circle r={R} className={styles.wheelRing} />
          <circle r={R * 0.55} className={styles.wheelRingInner} />
          {PUBLIC_VECTORS.map((item, index) => {
            const isSelected = index === selected;
            const itemAssessed = item.result.status === "assessed";
            const length = itemAssessed ? 30 + ((R - 30) * item.result.score) / 100 : R * 0.45;
            return (
              <g
                key={item.id}
                transform={`rotate(${angleDeg(index)})`}
                className={`${styles.spoke} ${isSelected ? styles.spokeOn : ""}`}
              >
                <line x1="0" y1="-30" x2="0" y2={-R} className={styles.spokeTrack} />
                <line
                  x1="0"
                  y1="-30"
                  x2="0"
                  y2={-length}
                  className={itemAssessed ? styles.spokeValue : styles.spokeUnknown}
                />
              </g>
            );
          })}
          <circle r="22" className={styles.hub} />
        </svg>

        <div className={styles.hubLabel} aria-live="polite">
          <strong>{assessed ? formatScore(vector.result.score) : "?"}</strong>
        </div>

        <div className={styles.wheelButtons} role="tablist" aria-label="Kleos vectors" onKeyDown={onKeyDown}>
          {PUBLIC_VECTORS.map((item, index) => {
            const [x, y] = polar(index, R + 46);
            const isSelected = index === selected;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`vector-tab-${item.id}`}
                aria-selected={isSelected}
                aria-controls="vector-panel"
                tabIndex={isSelected ? 0 : -1}
                className={`${styles.wheelButton} ${isSelected ? styles.wheelButtonOn : ""}`}
                style={{ left: `${((x + 230) / 460) * 100}%`, top: `${((y + 230) / 460) * 100}%` }}
                onClick={() => setSelected(index)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className={styles.panel}
        role="tabpanel"
        id="vector-panel"
        aria-labelledby={`vector-tab-${vector.id}`}
        key={vector.id}
      >
        <p className={styles.panelKicker}>
          {String(selected + 1).padStart(2, "0")} · {vector.label}
        </p>
        <h3>{vector.question}</h3>
        <p className={styles.definition}>{vector.definition}</p>

        <div className={styles.stats}>
          <div>
            <span>Example state</span>
            <strong className={assessed ? "" : styles.unknownValue}>
              {assessed ? formatScore(vector.result.score) : "Unknown"}
            </strong>
          </div>
          <div>
            <span>Coverage</span>
            <strong>{formatScore(vector.result.coveragePct)}%</strong>
          </div>
          <div>
            <span>Confidence</span>
            <strong className={styles.capitalize}>
              {assessed ? vector.result.confidence : "—"}
            </strong>
          </div>
        </div>

        <ul className={styles.subdomains}>
          {vector.subdomains.map((subdomain, index) => {
            const known = subdomain.status === "assessed";
            return (
              <li key={subdomain.id} style={{ "--i": index }}>
                <span className={styles.subLabel}>{subdomain.label}</span>
                <span className={styles.weight}>{subdomain.weight}%</span>
                <span className={`${styles.subBar} ${known ? "" : styles.subBarUnknown}`}>
                  {known ? <i style={{ "--w": `${subdomain.score}%` }} /> : null}
                </span>
                <span className={known ? styles.anchor : styles.anchorUnknown}>
                  {known ? subdomain.score : "Unknown"}
                </span>
              </li>
            );
          })}
        </ul>

        <blockquote className={styles.commentary}>
          <span>Assessment · {confidenceLabel(vector.result.confidence)}</span>
          <p>{vector.commentary}</p>
        </blockquote>

        <div className={styles.evidence}>
          <span>Typical evidence</span>
          <ul>
            {vector.evidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
