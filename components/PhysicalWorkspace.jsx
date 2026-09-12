"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { AUTHORIZED_KLEOS_EMAIL, createEmptyKleosData, loadKleosData } from "@/lib/kleos/data";
import KleosNav from "@/components/KleosNav";
import DimensionState from "@/components/DimensionState";
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
    <div className={styles.statCard}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

function SectionHeader({ title, note }) {
  return (
    <div className="section-header">
      <h2>{title}</h2>
      {note ? <p>{note}</p> : null}
    </div>
  );
}

function EmptyChart({ text = "Not enough data yet." }) {
  return <div className={styles.emptyChart}>{text}</div>;
}

function LineChart({ rows, valueField = "qty", label, unit = "" }) {
  const points = rows
    .map((row) => ({ date: row.metric_date, value: Number(row[valueField]) }))
    .filter((point) => Number.isFinite(point.value));

  if (points.length < 2) return <EmptyChart />;

  const width = 640;
  const height = 180;
  const padding = 22;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const coordinates = points.map((point, index) => {
    const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
    return { ...point, x, y };
  });
  const path = coordinates.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");

  return (
    <div className={styles.chartBlock}>
      <div className={styles.chartHeader}>
        <span>{label}</span>
        <small>{formatNumber(points[points.length - 1].value)} {unit}</small>
      </div>
      <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label} trend`}>
        <path className={styles.gridLine} d={`M${padding},${height / 2} L${width - padding},${height / 2}`} />
        <path className={styles.linePath} d={path} />
        {coordinates.map((point) => (
          <circle key={`${point.date}-${point.x}`} className={styles.lineDot} cx={point.x} cy={point.y} r="3" />
        ))}
      </svg>
      <div className={styles.chartAxis}>
        <span>{formatDate(points[0].date)}</span>
        <span>{formatDate(points[points.length - 1].date)}</span>
      </div>
    </div>
  );
}

function BarChart({ rows, label, unit = "" }) {
  const points = rows
    .slice(-30)
    .map((row) => ({ date: row.metric_date, value: Number(row.qty) }))
    .filter((point) => Number.isFinite(point.value));
  if (!points.length) return <EmptyChart />;
  const max = Math.max(...points.map((point) => point.value), 1);

  return (
    <div className={styles.chartBlock}>
      <div className={styles.chartHeader}>
        <span>{label}</span>
        <small>{formatNumber(points[points.length - 1].value, 0)} {unit}</small>
      </div>
      <div className={styles.bars} aria-label={`${label} recent daily values`}>
        {points.map((point) => (
          <div key={point.date} className={styles.barSlot} title={`${formatDate(point.date)}: ${formatNumber(point.value, 0)} ${unit}`}>
            <span className={styles.bar} style={{ height: `${Math.max(4, (point.value / max) * 100)}%` }} />
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
    ["Core", Number(details.core)],
    ["REM", Number(details.rem)],
    ["Deep", Number(details.deep)],
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
          <span key={name}><i className={styles[`legend${name}`]} />{name} {formatHours(value)}</span>
        ))}
      </div>
    </div>
  );
}

function StrengthTable({ metrics }) {
  if (!metrics.length) return <p className={styles.muted}>No Heracles strength snapshot has been synced yet.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Exercise</th><th>Equipment</th><th>Estimated 1RM</th><th>Relative to BW</th><th>Sessions</th><th>State</th><th>Achieved</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => (
            <tr key={`${metric.source_exercise_id}-${metric.exercise_name}`}>
              <td>{metric.exercise_name}</td>
              <td>{metric.equipment_name || "Not recorded"}</td>
              <td>{formatNumber(metric.best_1rm)} kg</td>
              <td>{metric.best_1rm_relative_bw == null ? "Unavailable" : `${formatNumber(metric.best_1rm_relative_bw, 2)}× BW`}</td>
              <td>{metric.qualifying_sessions}</td>
              <td>{metric.is_current ? "Current" : "Stale"}</td>
              <td>{formatDate(metric.achieved_on)}</td>
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
  const latestWeight = latest(healthMetrics, "weight_body_mass");
  const latestRhr = latest(healthMetrics, "resting_heart_rate");
  const latestHrv = latest(healthMetrics, "heart_rate_variability");
  const latestSpO2 = latest(healthMetrics, "blood_oxygen_saturation");
  const latestSteps = latest(healthMetrics, "step_count");
  const latestRespiratory = latest(healthMetrics, "respiratory_rate");
  const latestTemperature = latest(healthMetrics, "apple_sleeping_wrist_temperature");
  const sleepHours = Number(latestSleep?.details?.totalSleep);
  const weightChange30 = changeOverWindow(healthMetrics, "weight_body_mass", 30);

  const summaryStats = useMemo(() => [
    { label: "Height", value: `${STATIC_HEIGHT_CM} cm`, note: "Static physical characteristic" },
    { label: "Weight", value: latestWeight ? `${formatNumber(latestWeight.qty)} kg` : "—", note: latestWeight ? `${formatDate(latestWeight.metric_date)} · ${latestWeight.source || "Apple Health"}` : "No recent body mass" },
    { label: "Sleep", value: Number.isFinite(sleepHours) ? formatHours(sleepHours) : "—", note: latestSleep ? formatDate(latestSleep.metric_date) : "No Watch sleep yet" },
    { label: "Resting HR", value: latestRhr ? `${formatNumber(latestRhr.qty, 0)} bpm` : "—", note: latestRhr ? formatDate(latestRhr.metric_date) : "No recent value" },
    { label: "HRV", value: latestHrv ? `${formatNumber(latestHrv.qty, 0)} ms` : "—", note: latestHrv ? formatDate(latestHrv.metric_date) : "No recent value" },
    { label: "Blood oxygen", value: latestSpO2 ? `${formatNumber(latestSpO2.qty)}%` : "—", note: latestSpO2 ? formatDate(latestSpO2.metric_date) : "No recent value" },
    { label: "Steps", value: latestSteps ? formatNumber(latestSteps.qty, 0) : "—", note: latestSteps ? formatDate(latestSteps.metric_date) : "No recent value" }
  ], [latestWeight, latestSleep, latestRhr, latestHrv, latestSpO2, latestSteps, sleepHours]);

  const signIn = async () => {
    if (!supabase) return;
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}${basePath}/physical/` : undefined;
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo, queryParams: { prompt: "select_account" } } });
    if (error) setStatusMessage(error.message || "Google sign-in failed.");
  };

  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setStatusMessage(error.message || "Sign-out failed.");
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
    setStatusMessage(error ? `Health save failed: ${error.message}` : "Clinical/manual health records saved.");
  };

  if (accessState === "loading") {
    return <div className="access-panel"><div className="access-mark">K</div><h2>Loading Kleos</h2><p>Checking private access.</p></div>;
  }

  if (accessState !== "authorized") {
    return (
      <div className="access-panel">
        <div className="access-mark">K</div>
        <h2>{accessState === "unconfigured" ? "Kleos is not configured" : accessState === "unauthorized" ? "Access restricted" : "Sign in to Kleos"}</h2>
        <p>{accessState === "unauthorized" ? "This private workspace is locked to the authorized account." : "Use the authorized Google account to open the private Physical workspace."}</p>
        {accessState === "signed-out" ? <button className="primary-btn" type="button" onClick={signIn}>Continue with Google</button> : null}
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

  return (
    <div className="kleos-shell">
      <div className="kleos-board">
        <header className="kleos-header">
          <div>
            <p className="kleos-kicker">Kleos · Physical</p>
            <h1>Physical</h1>
            <p className="kleos-subtitle">Live physiology, body, activity, nutrition and strength evidence.</p>
          </div>
          <div className="kleos-header-actions">
            <button className="secondary-btn" type="button" onClick={() => void loadPhysicalData(user.id)}>Refresh</button>
            <button className="secondary-btn" type="button" onClick={signOut}>Sign out</button>
          </div>
        </header>
        <KleosNav basePath={basePath} />
        <main className="kleos-scroll">
          <DimensionState userId={user.id} vectorId="physical" kleosData={kleosData} />

          <section className="kleos-card wide-card">
            <SectionHeader title="Current State" note="Headline physical measurements. Height is deterministic; live measurements come from Apple Health and connected sources." />
            <div className={styles.statGrid}>{summaryStats.map((stat) => <StatCard key={stat.label} {...stat} />)}</div>
          </section>

          <div className="kleos-grid">
            <section className="kleos-card wide-card">
              <SectionHeader title="Sleep & Recovery" note="Raw measurements and personal trends only; Kleos does not manufacture a generic recovery score." />
              <div className={styles.statGrid}>
                <StatCard label="Respiratory rate" value={latestRespiratory ? `${formatNumber(latestRespiratory.qty)} /min` : "—"} note={latestRespiratory ? formatDate(latestRespiratory.metric_date) : "No recent value"} />
                <StatCard label="Wrist temperature" value={latestTemperature ? `${formatNumber(latestTemperature.qty, 2)} °C` : "—"} note={latestTemperature ? formatDate(latestTemperature.metric_date) : "No recent value"} />
                <StatCard label="Heart rate range" value={latest(healthMetrics, "heart_rate") ? `${formatNumber(latest(healthMetrics, "heart_rate").min_value, 0)}–${formatNumber(latest(healthMetrics, "heart_rate").max_value, 0)} bpm` : "—"} note="Daily observed range" />
              </div>
              <div className={styles.sleepBlock}>
                <div>
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
            </section>

            <section className="kleos-card">
              <SectionHeader title="Body" note="Body weight is a general Physical metric, independent of the Heracles strength UI." />
              <div className={styles.statGridSingle}>
                <StatCard label="Height" value={`${STATIC_HEIGHT_CM} cm`} note="Static" />
                <StatCard label="Weight" value={latestWeight ? `${formatNumber(latestWeight.qty)} kg` : "—"} note={weightChange30 == null ? "30-day change unavailable" : `${weightChange30 >= 0 ? "+" : ""}${formatNumber(weightChange30)} kg over 30 days`} />
              </div>
              <LineChart rows={rowsFor(healthMetrics, "weight_body_mass")} label="Weight · 90 days" unit="kg" />
            </section>

            <section className="kleos-card">
              <SectionHeader title="Activity" note="Daily movement and general activity from Apple Health." />
              <div className={styles.statGridSingle}>
                <StatCard label="Steps" value={latestSteps ? formatNumber(latestSteps.qty, 0) : "—"} note={`7-day avg ${formatNumber(averageRecent(healthMetrics, "step_count", 7), 0)}`} />
                {activity.map(([label, name, unit]) => {
                  const row = latest(healthMetrics, name);
                  return <StatCard key={name} label={label} value={row ? formatMetricValue(row, unit) : "—"} note={row ? formatDate(row.metric_date) : "No recent value"} />;
                })}
              </div>
              <BarChart rows={rowsFor(healthMetrics, "step_count")} label="Steps · recent days" unit="steps" />
            </section>

            <section className="kleos-card wide-card">
              <SectionHeader title="Nutrition" note="High-value MacroFactor/Apple Health nutrition signals. Micronutrients stay out of the main dashboard." />
              <div className={styles.statGrid}>
                {nutrition.map(([label, name, unit]) => {
                  const row = latest(healthMetrics, name);
                  const avg = averageRecent(healthMetrics, name, 7);
                  return <StatCard key={name} label={label} value={row ? `${formatNumber(row.qty)} ${unit}` : "—"} note={avg == null ? "7-day average unavailable" : `7-day avg ${formatNumber(avg)} ${unit}`} />;
                })}
              </div>
            </section>

            <section className="kleos-card wide-card">
              <div className={styles.sectionActions}>
                <SectionHeader title="Strength Performance" note="Heracles remains the authority for resistance-training performance. Body weight is no longer presented as Heracles-owned." />
                <button className="secondary-btn" type="button" onClick={syncStrength} disabled={isSyncingStrength}>{isSyncingStrength ? "Syncing…" : "Sync Heracles"}</button>
              </div>
              <StrengthTable metrics={kleosData.strengthMetrics || []} />
            </section>

            <details className="kleos-card wide-card">
              <summary>Mobility details</summary>
              <p className="kleos-subtitle">Secondary gait and stair metrics kept available without occupying headline dashboard space.</p>
              <div className={styles.statGrid}>
                {mobility.map(([label, name, unit]) => {
                  const row = latest(healthMetrics, name);
                  return <StatCard key={name} label={label} value={row ? formatMetricValue(row, unit) : "—"} note={row ? formatDate(row.metric_date) : "No recent value"} />;
                })}
              </div>
            </details>

            <details className="kleos-card wide-card">
              <summary>Clinical & Manual Records</summary>
              <p className="kleos-subtitle">Manual context remains available as evidence but is secondary to structured live measurements.</p>
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
              <button className="primary-btn" type="button" onClick={saveHealth} disabled={isSaving}>{isSaving ? "Saving…" : "Save Health Records"}</button>
            </details>
          </div>
        </main>
        {statusMessage ? <div className="status-line">{statusMessage}</div> : null}
      </div>
    </div>
  );
}
