"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { AUTHORIZED_KLEOS_EMAIL, createEmptyKleosData, loadKleosData } from "@/lib/kleos/data";
import { RefreshCw } from "lucide-react";
import DimensionState from "@/components/DimensionState";
import SectionHeading from "@/components/SectionHeading";
import StatusToast from "@/components/StatusToast";
import styles from "./PhysicalWorkspace.module.css";

const STATIC_HEIGHT_CM = 190;
const HEALTH_WINDOW_DAYS = 90;
const HEALTH_METRICS = [
  "weight_body_mass",
  "sleep_analysis",
  "resting_heart_rate",
  "heart_rate_variability",
  "blood_oxygen_saturation",
  "respiratory_rate",
  "apple_sleeping_wrist_temperature",
  "heart_rate",
  "step_count",
  "walking_running_distance",
  "apple_exercise_time",
  "apple_stand_time",
  "flights_climbed",
  "time_in_daylight",
  "protein",
  "carbohydrates",
  "total_fat",
  "fiber",
  "sodium",
  "walking_asymmetry_percentage",
  "walking_double_support_percentage",
  "walking_step_length",
  "walking_speed",
  "stair_speed_up",
  "stair_speed_down"
];

function cutoffDate(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function formatNumber(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function formatHours(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const hours = Math.floor(number);
  const minutes = Math.round((number - hours) * 60);
  return `${hours}h ${minutes}m`;
}

function formatMetricValue(row, fallbackUnit = "") {
  if (!row) return "—";
  const value = row.qty ?? row.avg_value;
  if (value === null || value === undefined) return "—";
  const unit = row.units || fallbackUnit;
  return `${formatNumber(value)}${unit ? ` ${unit}` : ""}`;
}

function rowsFor(metrics, name) {
  return metrics.filter((row) => row.metric_name === name);
}

function latest(metrics, name) {
  const rows = rowsFor(metrics, name);
  return rows.length ? rows[rows.length - 1] : null;
}

function latestNumeric(metrics, name, field = "qty") {
  const row = latest(metrics, name);
  const value = Number(row?.[field]);
  return Number.isFinite(value) ? value : null;
}

function averageRecent(metrics, name, days = 7) {
  const cutoff = cutoffDate(days);
  const values = rowsFor(metrics, name)
    .filter((row) => row.metric_date >= cutoff)
    .map((row) => Number(row.qty ?? row.avg_value))
    .filter(Number.isFinite);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function changeOverWindow(metrics, name, days = 30) {
  const cutoff = cutoffDate(days);
  const rows = rowsFor(metrics, name).filter((row) => row.metric_date >= cutoff);
  if (rows.length < 2) return null;
  const first = Number(rows[0].qty ?? rows[0].avg_value);
  const last = Number(rows[rows.length - 1].qty ?? rows[rows.length - 1].avg_value);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  return last - first;
}

function StatCard({ label, value, note }) {
  return (
    <div className="kleos-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function EmptyChart({ text = "Not enough data yet." }) {
  return <div className={styles.emptyChart}>{text}</div>;
}

function LineChart({ rows, valueField = "qty", label, unit = "", flush = false }) {
  const points = rows
    .map((row) => ({ date: row.metric_date, value: Number(row[valueField]) }))
    .filter((point) => Number.isFinite(point.value));

  if (points.length < 2) {
    return (
      <div className={flush ? `${styles.chartBlock} ${styles.flush}` : styles.chartBlock}>
        <div className={styles.chartHeader}><span>{label}</span></div>
        <EmptyChart />
      </div>
    );
  }

  const width = 640;
  const height = 168;
  const padX = 4;
  const padY = 14;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const coordinates = points.map((point, index) => {
    const x = padX + (index / Math.max(points.length - 1, 1)) * (width - padX * 2);
    const y = height - padY - ((point.value - min) / range) * (height - padY * 2);
    return { ...point, x, y };
  });
  const path = coordinates.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = `${path} L${coordinates[coordinates.length - 1].x.toFixed(1)},${height} L${coordinates[0].x.toFixed(1)},${height} Z`;
  const last = coordinates[coordinates.length - 1];
  const gradientId = `grad-${label.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <div className={flush ? `${styles.chartBlock} ${styles.flush}` : styles.chartBlock}>
      <div className={styles.chartHeader}>
        <span>{label}</span>
        <strong>
          {formatNumber(last.value)}
          {unit ? <small> {unit}</small> : null}
        </strong>
      </div>
      <div className={styles.chartFrame}>
        <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${label} trend, latest ${formatNumber(last.value)} ${unit}`}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className={styles.areaStart} />
              <stop offset="100%" className={styles.areaEnd} />
            </linearGradient>
          </defs>
          <path className={styles.gridLine} d={`M0,${padY} L${width},${padY}`} vectorEffect="non-scaling-stroke" />
          <path className={styles.gridLine} d={`M0,${height - padY} L${width},${height - padY}`} vectorEffect="non-scaling-stroke" />
          <path d={area} fill={`url(#${gradientId})`} />
          <path className={styles.linePath} d={path} vectorEffect="non-scaling-stroke" />
        </svg>
        <span className={styles.axisMax}>{formatNumber(max)}</span>
        <span className={styles.axisMin}>{formatNumber(min)}</span>
      </div>
      <div className={styles.chartAxis}>
        <span>{formatDate(points[0].date)}</span>
        <span>{formatDate(points[points.length - 1].date)}</span>
      </div>
    </div>
  );
}

function BarChart({ rows, label, unit = "", flush = false }) {
  const points = rows
    .slice(-30)
    .map((row) => ({ date: row.metric_date, value: Number(row.qty) }))
    .filter((point) => Number.isFinite(point.value));
  if (!points.length) {
    return (
      <div className={flush ? `${styles.chartBlock} ${styles.flush}` : styles.chartBlock}>
        <div className={styles.chartHeader}><span>{label}</span></div>
        <EmptyChart />
      </div>
    );
  }
  const max = Math.max(...points.map((point) => point.value), 1);
  const average = points.reduce((sum, point) => sum + point.value, 0) / points.length;

  return (
    <div className={flush ? `${styles.chartBlock} ${styles.flush}` : styles.chartBlock}>
      <div className={styles.chartHeader}>
        <span>{label}</span>
        <strong>
          {formatNumber(average, 0)}
          <small> avg {unit}</small>
        </strong>
      </div>
      <div className={styles.bars} aria-label={`${label} recent daily values`}>
        <span className={styles.barAverage} style={{ bottom: `${(average / max) * 100}%` }} aria-hidden="true" />
        {points.map((point, index) => (
          <div key={point.date} className={styles.barSlot} title={`${formatDate(point.date)}: ${formatNumber(point.value, 0)} ${unit}`}>
            <span
              className={index === points.length - 1 ? styles.barLatest : styles.bar}
              style={{ height: `${Math.max(3, (point.value / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className={styles.chartAxis}>
        <span>{formatDate(points[0].date)}</span>
        <span>{formatDate(points[points.length - 1].date)}</span>
      </div>
    </div>
  );
}

function SleepStages({ sleep }) {
  const details = sleep?.details || {};
  const stages = [
    ["Deep", Number(details.deep)],
    ["Core", Number(details.core)],
    ["REM", Number(details.rem)],
    ["Awake", Number(details.awake)]
  ].filter(([, value]) => Number.isFinite(value) && value >= 0);
  const total = stages.reduce((sum, [, value]) => sum + value, 0);
  if (!total) return <EmptyChart text="Sleep staging will appear after a staged Watch sleep record arrives." />;

  return (
    <div className={styles.sleepStages}>
      <div className={styles.sleepStageBar}>
        {stages.map(([name, value]) => (
          <span key={name} className={styles[`stage${name}`]} style={{ width: `${(value / total) * 100}%` }} title={`${name}: ${formatHours(value)}`} />
        ))}
      </div>
      <div className={styles.stageLegend}>
        {stages.map(([name, value]) => (
          <span key={name}>
            <i className={styles[`stage${name}`]} />
            <b>{name}</b>
            {formatHours(value)}
            <em>{Math.round((value / total) * 100)}%</em>
          </span>
        ))}
      </div>
    </div>
  );
}

function StrengthTable({ metrics }) {
  if (!metrics.length) {
    return (
      <div className="kleos-empty">
        <strong>No strength snapshot yet</strong>
        <p>No Heracles strength snapshot has been synced yet.</p>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Exercise</th><th>Equipment</th><th className="num">Estimated 1RM</th><th className="num">Relative to BW</th><th className="num">Sessions</th><th>State</th><th className="num">Achieved</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => (
            <tr key={`${metric.source_exercise_id}-${metric.exercise_name}`} className={metric.is_current ? undefined : styles.staleRow}>
              <td>{metric.exercise_name}</td>
              <td>{metric.equipment_name || "Not recorded"}</td>
              <td className="num">{formatNumber(metric.best_1rm)} kg</td>
              <td className="num">{metric.best_1rm_relative_bw == null ? "Unavailable" : `${formatNumber(metric.best_1rm_relative_bw, 2)}× BW`}</td>
              <td className="num">{metric.qualifying_sessions}</td>
              <td>{metric.is_current ? "Current" : <span className="kleos-pill is-quiet">Stale</span>}</td>
              <td className="num">{formatDate(metric.achieved_on)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PhysicalWorkspace() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const [accessState, setAccessState] = useState("loading");
  const [user, setUser] = useState(null);
  const [kleosData, setKleosData] = useState(createEmptyKleosData);
  const [healthMetrics, setHealthMetrics] = useState([]);
  const [healthForm, setHealthForm] = useState({ bloodTestText: "", miscText: "" });
  const [statusMessage, setStatusMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingStrength, setIsSyncingStrength] = useState(false);

  const loadPhysicalData = async (userId, { silent = false } = {}) => {
    if (!supabase || !userId) return;
    if (!silent) setStatusMessage("Loading Physical data…");
    const [profile, healthResult] = await Promise.all([
      loadKleosData(userId),
      supabase
        .from("goat_health_metrics")
        .select("metric_name,metric_date,observed_at,units,qty,min_value,avg_value,max_value,source,details")
        .eq("user_id", userId)
        .in("metric_name", HEALTH_METRICS)
        .gte("metric_date", cutoffDate(HEALTH_WINDOW_DAYS))
        .order("metric_date", { ascending: true })
    ]);
    if (healthResult.error) throw healthResult.error;
    setKleosData(profile);
    setHealthMetrics(healthResult.data || []);
    setHealthForm({
      bloodTestText: profile.healthProfile?.bloodTestText || "",
      miscText: profile.healthProfile?.miscText || ""
    });
    if (!silent) setStatusMessage("");
  };

  useEffect(() => {
    if (!supabase) {
      setAccessState("unconfigured");
      return undefined;
    }
    let mounted = true;

    const handleUser = async (nextUser) => {
      if (!mounted) return;
      const email = String(nextUser?.email || "").trim().toLowerCase();
      if (!nextUser) {
        setUser(null);
        setAccessState("signed-out");
        return;
      }
      if (email !== AUTHORIZED_KLEOS_EMAIL) {
        setUser(nextUser);
        setAccessState("unauthorized");
        return;
      }
      setUser(nextUser);
      setAccessState("authorized");
      try {
        await loadPhysicalData(nextUser.id);
      } catch (error) {
        if (mounted) setStatusMessage(`Physical data failed to load: ${error.message || error}`);
      }
    };

    void supabase.auth.getUser().then(({ data }) => void handleUser(data?.user || null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => void handleUser(session?.user || null));
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const latestSleep = latest(healthMetrics, "sleep_analysis");
  const latestSpO2 = latest(healthMetrics, "blood_oxygen_saturation");
  const latestRespiratory = latest(healthMetrics, "respiratory_rate");
  const latestTemperature = latest(healthMetrics, "apple_sleeping_wrist_temperature");
  const sleepHours = Number(latestSleep?.details?.totalSleep);
  const weightChange30 = changeOverWindow(healthMetrics, "weight_body_mass", 30);


  const signIn = async () => {
    if (!supabase) return;
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}${basePath}/physical/` : undefined;
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo, queryParams: { prompt: "select_account" } } });
    if (error) setStatusMessage(error.message || "Google sign-in failed.");
  };

  const syncStrength = async () => {
    if (!user?.id || !supabase || isSyncingStrength) return;
    setIsSyncingStrength(true);
    setStatusMessage("Syncing Heracles strength…");
    const { error } = await supabase.functions.invoke("sync-heracles-strength", { body: {} });
    setIsSyncingStrength(false);
    if (error) {
      setStatusMessage(`Heracles strength sync failed: ${error.message || error}`);
      return;
    }
    try {
      await loadPhysicalData(user.id, { silent: true });
      setStatusMessage("Heracles strength synced.");
    } catch (loadError) {
      setStatusMessage(`Strength synced, but refresh failed: ${loadError.message || loadError}`);
    }
  };

  const saveHealth = async () => {
    if (!user?.id || !supabase || isSaving) return;
    setIsSaving(true);
    const { error } = await supabase
      .from("goat_health_characteristics")
      .upsert({ user_id: user.id, blood_test_content: healthForm.bloodTestText, misc_content: healthForm.miscText, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    setIsSaving(false);
    if (!error) {
      setKleosData((current) => ({ ...current, healthProfile: { ...healthForm } }));
    }
    setStatusMessage(error ? `Health save failed: ${error.message}` : "Clinical/manual health records saved.");
  };

  if (accessState === "loading") {
    return (
      <div className="kleos-shell">
        <div className="fs-app-card access-panel is-loading" aria-busy="true">
          <div className="access-mark"><img src="/brand/kleos-mark.svg" alt="" aria-hidden="true" /></div>
          <h2>Loading Kleos</h2>
          <p>Checking private access.</p>
        </div>
      </div>
    );
  }

  if (accessState !== "authorized") {
    return (
      <div className="kleos-shell">
        <div className="fs-app-card access-panel">
          <div className="access-mark"><img src="/brand/kleos-mark.svg" alt="" aria-hidden="true" /></div>
          <h2>{accessState === "unconfigured" ? "Kleos is not configured" : accessState === "unauthorized" ? "Access restricted" : "Sign in to Kleos"}</h2>
          <p>{accessState === "unauthorized" ? "This private workspace is locked to the authorized account." : "Use the authorized Google account to open the private Physical workspace."}</p>
          {accessState === "signed-out" ? <button className="fs-app-button is-primary" type="button" onClick={signIn}>Continue with Google</button> : null}
        </div>
      </div>
    );
  }

  const nutrition = [
    ["Protein", "protein", "g"],
    ["Carbohydrates", "carbohydrates", "g"],
    ["Fat", "total_fat", "g"],
    ["Fiber", "fiber", "g"],
    ["Sodium", "sodium", "mg"]
  ];
  const activity = [
    ["Walking / running", "walking_running_distance", "km"],
    ["Exercise", "apple_exercise_time", "min"],
    ["Stand time", "apple_stand_time", "min"],
    ["Flights climbed", "flights_climbed", ""],
    ["Daylight", "time_in_daylight", "min"]
  ];
  const mobility = [
    ["Walking asymmetry", "walking_asymmetry_percentage", "%"],
    ["Double support", "walking_double_support_percentage", "%"],
    ["Step length", "walking_step_length", "cm"],
    ["Walking speed", "walking_speed", "km/hr"],
    ["Stair ascent", "stair_speed_up", "m/s"],
    ["Stair descent", "stair_speed_down", "m/s"]
  ];
  const heartRate = latest(healthMetrics, "heart_rate");
  const healthDirty =
    healthForm.bloodTestText !== (kleosData.healthProfile?.bloodTestText || "") ||
    healthForm.miscText !== (kleosData.healthProfile?.miscText || "");

  return (
    <div className="kleos-shell">
      <div className="kleos-board">
        <main className="kleos-scroll">
          <DimensionState
            userId={user.id}
            vectorId="physical"
            kleosData={kleosData}
            actions={
              <button className="fs-app-button is-secondary" type="button" onClick={() => void loadPhysicalData(user.id)}>
                <RefreshCw aria-hidden="true" />
                Refresh
              </button>
            }
          >
            <section className="fs-app-card kleos-card">
              <SectionHeading
                title="Sleep & Recovery"
                hint="Raw measurements and personal trends from Apple Watch. Kleos does not manufacture a generic recovery score."
              />
              <div className={styles.sleepBlock}>
                <div className={styles.sleepSummary}>
                  <h3>Latest sleep</h3>
                  <strong className={styles.bigValue}>{Number.isFinite(sleepHours) ? formatHours(sleepHours) : "—"}</strong>
                  <small>{latestSleep ? formatDate(latestSleep.metric_date) : "No staged Watch sleep record"}</small>
                </div>
                <SleepStages sleep={latestSleep} />
              </div>
              <div className={styles.chartGrid}>
                <LineChart rows={rowsFor(healthMetrics, "resting_heart_rate")} label="Resting heart rate" unit="bpm" />
                <LineChart rows={rowsFor(healthMetrics, "heart_rate_variability")} label="HRV" unit="ms" />
              </div>
              <dl className={styles.metricList}>
                <Metric label="Blood oxygen" value={latestSpO2 ? `${formatNumber(latestSpO2.qty)}%` : "—"} />
                <Metric label="Respiratory rate" value={latestRespiratory ? `${formatNumber(latestRespiratory.qty)} /min` : "—"} />
                <Metric label="Wrist temperature" value={latestTemperature ? `${formatNumber(latestTemperature.qty, 2)} °C` : "—"} />
                <Metric label="Heart rate range" value={heartRate ? `${formatNumber(heartRate.min_value, 0)}–${formatNumber(heartRate.max_value, 0)} bpm` : "—"} />
              </dl>
            </section>

            <div className="kleos-grid">
              <section className="fs-app-card kleos-card">
                <SectionHeading
                  title="Body"
                  hint="Body weight is a general Physical metric, independent of the Heracles strength UI. Height is a static characteristic."
                />
                <LineChart rows={rowsFor(healthMetrics, "weight_body_mass")} label="Weight · 90 days" unit="kg" flush />
                <dl className={styles.metricList}>
                  <Metric label="Height" value={`${STATIC_HEIGHT_CM} cm`} />
                  <Metric
                    label="30-day change"
                    value={weightChange30 == null ? "—" : `${weightChange30 >= 0 ? "+" : ""}${formatNumber(weightChange30)} kg`}
                  />
                </dl>
              </section>

              <section className="fs-app-card kleos-card">
                <SectionHeading title="Activity" hint="Daily movement and general activity from Apple Health." />
                <BarChart rows={rowsFor(healthMetrics, "step_count")} label="Steps · last 30 days" unit="steps" flush />
                <dl className={styles.metricList}>
                  {activity.map(([label, name, unit]) => {
                    const row = latest(healthMetrics, name);
                    return <Metric key={name} label={label} value={row ? formatMetricValue(row, unit) : "—"} />;
                  })}
                </dl>
              </section>
            </div>

            <section className="fs-app-card kleos-card">
              <SectionHeading
                title="Nutrition"
                sub="Latest day, with the 7-day average beneath."
                hint="High-value MacroFactor / Apple Health nutrition signals. Micronutrients stay out of the main dashboard."
              />
              <div className="kleos-stats">
                {nutrition.map(([label, name, unit]) => {
                  const row = latest(healthMetrics, name);
                  const avg = averageRecent(healthMetrics, name, 7);
                  return <StatCard key={name} label={label} value={row ? `${formatNumber(row.qty)} ${unit}` : "—"} note={avg == null ? "No 7-day average" : `${formatNumber(avg)} ${unit} avg`} />;
                })}
              </div>
            </section>

            <section className="fs-app-card kleos-card">
              <SectionHeading
                title="Strength Performance"
                hint="Heracles remains the authority for resistance-training performance. An exercise is current when trained in at least 3 sessions in the last 30 days. Body weight is no longer presented as Heracles-owned."
              >
                <button className="fs-app-button is-secondary" type="button" onClick={syncStrength} disabled={isSyncingStrength}>
                  <RefreshCw aria-hidden="true" className={isSyncingStrength ? styles.spinning : undefined} />
                  {isSyncingStrength ? "Syncing…" : "Sync Heracles"}
                </button>
              </SectionHeading>
              <StrengthTable metrics={kleosData.strengthMetrics || []} />
            </section>

            <details className="fs-app-card kleos-card">
              <summary>Mobility</summary>
              <p className="kleos-subtitle">Secondary gait and stair metrics.</p>
              <dl className={`${styles.metricList} ${styles.metricListWide}`}>
                {mobility.map(([label, name, unit]) => {
                  const row = latest(healthMetrics, name);
                  return <Metric key={name} label={label} value={row ? formatMetricValue(row, unit) : "—"} />;
                })}
              </dl>
            </details>

            <details className="fs-app-card kleos-card">
              <summary>Clinical & manual records</summary>
              <p className="kleos-subtitle">Plain-text context supplied to the evaluator alongside structured measurements.</p>
              <div className="stacked-form">
                <label>
                  Latest Blood Test
                  <textarea className="large-textarea" value={healthForm.bloodTestText} onChange={(event) => setHealthForm((current) => ({ ...current, bloodTestText: event.target.value }))} placeholder="Plain-text latest blood test results for Kleos evidence." />
                </label>
                <label>
                  Miscellaneous Health
                  <textarea className="large-textarea" value={healthForm.miscText} onChange={(event) => setHealthForm((current) => ({ ...current, miscText: event.target.value }))} placeholder="Plain-text health details that are not represented by structured metrics." />
                </label>
              </div>
              <div className="kleos-form-footer">
                {healthDirty ? <p className="kleos-note">Unsaved changes</p> : null}
                <button className={`fs-app-button ${healthDirty ? "is-primary" : "is-secondary"}`} type="button" onClick={saveHealth} disabled={isSaving || !healthDirty}>{isSaving ? "Saving…" : "Save Health Records"}</button>
              </div>
            </details>
          </DimensionState>
        </main>
        <StatusToast message={statusMessage} />
      </div>
    </div>
  );
}
