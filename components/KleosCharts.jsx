import styles from "./KleosCharts.module.css";

const RADAR_SIZE = 360;
const RADAR_CENTER = RADAR_SIZE / 2;
const RADAR_RADIUS = 118;
const RADAR_RINGS = [25, 50, 75, 100];

function radarPoint(index, count, value) {
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
  const radius = (Math.max(0, Math.min(100, value)) / 100) * RADAR_RADIUS;
  return [RADAR_CENTER + Math.cos(angle) * radius, RADAR_CENTER + Math.sin(angle) * radius];
}

function toPath(points) {
  return points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ") + " Z";
}

/**
 * Eight-axis radar of current vector scores. Unknown axes are drawn at the
 * centre with a muted label so missing evidence stays visible rather than implied.
 */
export function VectorRadar({ axes, previous = null, label = "Current vector state", showValues = true }) {
  const count = axes.length;
  if (!count) return null;

  const current = axes.map((axis, index) => radarPoint(index, count, axis.score ?? 0));
  const prior = previous
    ? axes.map((axis, index) => radarPoint(index, count, previous[axis.id] ?? 0))
    : null;

  return (
    <svg
      className={styles.radar}
      viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
      role="img"
      aria-label={`${label}: ${axes
        .map((axis) => `${axis.label} ${axis.score === null ? "unknown" : Math.round(axis.score)}`)
        .join(", ")}`}
    >
      {RADAR_RINGS.map((ring) => (
        <path
          key={ring}
          className={ring === 100 ? styles.radarRingOuter : styles.radarRing}
          d={toPath(axes.map((_, index) => radarPoint(index, count, ring)))}
        />
      ))}
      {axes.map((axis, index) => {
        const [x, y] = radarPoint(index, count, 100);
        return <line key={axis.id} className={styles.radarAxis} x1={RADAR_CENTER} y1={RADAR_CENTER} x2={x} y2={y} />;
      })}
      {prior ? <path className={styles.radarPrior} d={toPath(prior)} /> : null}
      <path className={styles.radarShape} d={toPath(current)} />
      {axes.map((axis, index) =>
        axis.score === null ? null : (
          <circle key={axis.id} className={styles.radarDot} cx={current[index][0]} cy={current[index][1]} r="3" />
        )
      )}
      {axes.map((axis, index) => {
        const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
        const x = RADAR_CENTER + Math.cos(angle) * (RADAR_RADIUS + 26);
        const y = RADAR_CENTER + Math.sin(angle) * (RADAR_RADIUS + 26);
        const cos = Math.cos(angle);
        const anchor = Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end";
        const unknown = axis.score === null;
        return (
          <a key={axis.id} href={axis.href} className={styles.radarLink}>
            <title>{`${axis.label}: ${unknown ? "unknown" : Math.round(axis.score)}`}</title>
            <text
              className={unknown ? styles.radarLabelUnknown : styles.radarLabel}
              x={x}
              y={showValues ? y - 6 : y + 4}
              textAnchor={anchor}
            >
              {axis.label}
            </text>
            {showValues ? (
            <text
              className={unknown ? styles.radarValueUnknown : styles.radarValue}
              x={x}
              y={y + 10}
              textAnchor={anchor}
            >
              {unknown ? "Unknown" : Math.round(axis.score)}
            </text>
            ) : null}
          </a>
        );
      })}
    </svg>
  );
}

/**
 * Compact trajectory line. Values run oldest → newest; null marks an
 * unassessed snapshot and breaks the line.
 */
export function Sparkline({ values, width = 96, height = 28, label }) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (numeric.length < 2) {
    return <span className={styles.sparkEmpty} aria-label={label}>—</span>;
  }

  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  const range = Math.max(max - min, 6);
  const mid = (max + min) / 2;
  const pad = 3;
  const step = (width - pad * 2) / Math.max(values.length - 1, 1);
  const point = (value, index) => [
    pad + index * step,
    height / 2 - ((value - mid) / range) * (height - pad * 2)
  ];

  let path = "";
  let drawing = false;
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) {
      drawing = false;
      return;
    }
    const [x, y] = point(value, index);
    path += `${drawing ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
    drawing = true;
  });

  const lastIndex = values.length - 1 - [...values].reverse().findIndex((value) => Number.isFinite(value));
  const [lastX, lastY] = point(values[lastIndex], lastIndex);

  return (
    <svg
      className={styles.spark}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={label}
    >
      <path className={styles.sparkLine} d={path} />
      <circle className={styles.sparkDot} cx={lastX} cy={lastY} r="2.5" />
    </svg>
  );
}

/** Horizontal 0–100 bar; renders a hatched empty track when unknown. */
export function ScoreMeter({ value, max = 100, size = "md", tone = "accent" }) {
  const known = Number.isFinite(value);
  const pct = known ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span
      className={[styles.meter, styles[`meter-${size}`], known ? "" : styles.meterUnknown].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      {known ? <span className={styles[`fill-${tone}`]} style={{ width: `${pct}%` }} /> : null}
    </span>
  );
}

export function ScoreDelta({ value }) {
  if (!Number.isFinite(value) || Math.round(value) === 0) {
    return <span className={styles.deltaFlat}>No change</span>;
  }
  const rounded = Math.round(value * 10) / 10;
  return (
    <span className={rounded > 0 ? styles.deltaUp : styles.deltaDown}>
      {rounded > 0 ? "▲" : "▼"} {Math.abs(rounded)}
    </span>
  );
}
