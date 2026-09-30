"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  AUTHORIZED_KLEOS_EMAIL,
  createEmptyKleosData,
  loadKleosData
} from "@/lib/kleos/data";
import { getKleosPage } from "@/lib/kleos/routes";
import CharacterSheet from "@/components/CharacterSheet";
import DimensionState from "@/components/DimensionState";
import BigFiveAssessments from "@/components/BigFiveAssessments";
import PsychologicalAssessment from "@/components/PsychologicalAssessment";
import SectionHeading from "@/components/SectionHeading";
import StatusToast from "@/components/StatusToast";
import { History, Inbox } from "lucide-react";

const COGNITIVE_TESTS = [
  "Mensa Norway",
  "Forward Digit Span",
  "Backward Digit Span",
  "Sequential Digit Span"
];

function getDateTimeLocalValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function createDefaultCognitiveForm() {
  return {
    testName: COGNITIVE_TESTS[0],
    score: "",
    takenAt: getDateTimeLocalValue(),
    hunger: "",
    distractions: "",
    wakefulness: "",
    mood: ""
  };
}

export default function KleosWorkspace({ activePage = "character-sheet" }) {
  const page = getKleosPage(activePage);
  const isDashboard = page.id === "character-sheet";
  const [accessState, setAccessState] = useState("loading");
  const [user, setUser] = useState(null);
  const [kleosData, setKleosData] = useState(createEmptyKleosData);
  const [cognitiveForm, setCognitiveForm] = useState(createDefaultCognitiveForm);
  const [strengthProfileForm, setStrengthProfileForm] = useState({ heightCm: "" });
  const [academicNotesDraft, setAcademicNotesDraft] = useState("");
  const [healthForm, setHealthForm] = useState({
    bloodTestText: "",
    miscText: ""
  });
  const [cvDraft, setCvDraft] = useState("");
  const [immutableDraft, setImmutableDraft] = useState("");
  const [miscDraft, setMiscDraft] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingStrength, setIsSyncingStrength] = useState(false);
  const [isRecordingTest, setIsRecordingTest] = useState(false);

  const loadData = async (userId, options = {}) => {
    const isMounted = options.isMounted || (() => true);
    const silent = Boolean(options.silent);
    if (!silent) setStatusMessage("Loading private Kleos data...");

    try {
      const nextData = await loadKleosData(userId);

      if (isMounted()) {
        setKleosData(nextData);
        setAcademicNotesDraft(nextData.academicNotes);
        setStrengthProfileForm({
          heightCm:
            nextData.strengthProfile.heightCm === ""
              ? ""
              : String(nextData.strengthProfile.heightCm)
        });
        setHealthForm({
          bloodTestText: nextData.healthProfile?.bloodTestText || "",
          miscText: nextData.healthProfile?.miscText || ""
        });
        setCvDraft(nextData.cvText || "");
        setImmutableDraft(nextData.immutableText);
        setMiscDraft(nextData.miscText);
        if (!silent) setStatusMessage("");
      }
    } catch (error) {
      if (isMounted() && !silent) {
        setStatusMessage(`Kleos data failed to load: ${getErrorMessage(error)}`);
      }
    }
  };

  const syncHeraclesStrength = async (userId, options = {}) => {
    if (!supabase || !userId) return;
    const isMounted = options.isMounted || (() => true);
    const silent = Boolean(options.silent);

    if (isMounted()) {
      setIsSyncingStrength(true);
      if (!silent) setStatusMessage("Syncing strength and body weight from Heracles...");
    }

    const { data, error } = await supabase.functions.invoke("sync-heracles-strength", {
      body: {}
    });

    if (!isMounted()) return;
    setIsSyncingStrength(false);

    if (error) {
      if (!silent) {
        setStatusMessage(
          `Heracles strength sync failed: ${getErrorMessage(error)} Existing snapshot preserved.`
        );
      }
      return;
    }

    await loadData(userId, { isMounted, silent: true });
    if (isMounted() && !silent) {
      const current = Number(data?.current_count || 0);
      const stale = Number(data?.stale_count || 0);
      const bodyWeight = Number(data?.body_weight_kg);
      const bodyWeightText = Number.isFinite(bodyWeight) && bodyWeight > 0
        ? ` Body weight ${formatNumber(bodyWeight)} KG synced.`
        : " No current Heracles body weight available.";
      setStatusMessage(
        `Heracles strength synced: ${current} current, ${stale} stale.${bodyWeightText}`
      );
    }
  };

  useEffect(() => {
    if (!supabase) {
      setAccessState("unconfigured");
      return undefined;
    }

    let isMounted = true;
    let autoSyncedUserId = null;

    const handleAuthUser = async (nextUser) => {
      if (!isMounted) return;

      const email = String(nextUser?.email || "").trim().toLowerCase();
      if (!nextUser) {
        setUser(null);
        setAccessState("signed-out");
        setStatusMessage("");
        return;
      }

      if (email !== AUTHORIZED_KLEOS_EMAIL) {
        setUser(nextUser);
        setAccessState("unauthorized");
        setStatusMessage("Kleos is locked to the authorized account.");
        return;
      }

      setUser(nextUser);
      setAccessState("authorized");
      await loadData(nextUser.id, { isMounted: () => isMounted });

      if (isMounted && autoSyncedUserId !== nextUser.id) {
        autoSyncedUserId = nextUser.id;
        void syncHeraclesStrength(nextUser.id, {
          isMounted: () => isMounted,
          silent: true
        });
      }
    };

    void supabase.auth.getUser().then(({ data }) => {
      void handleAuthUser(data?.user || null);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void handleAuthUser(session?.user || null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return undefined;

    const handleMeasurementCorrection = () => {
      void loadData(user.id);
    };

    window.addEventListener("kleos:measurements-changed", handleMeasurementCorrection);
    return () => {
      window.removeEventListener("kleos:measurements-changed", handleMeasurementCorrection);
    };
  }, [user?.id]);

  const signInWithGoogle = async () => {
    if (!supabase) return;

    setStatusMessage("");
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}${page.path}`
        : undefined;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: { prompt: "select_account" }
      }
    });

    if (error) {
      setStatusMessage(error.message || "Google sign-in failed.");
    }
  };

  const saveCognitiveTest = async (event) => {
    event.preventDefault();
    if (!user?.id || isSaving) return;

    const conditionScores = ["hunger", "distractions", "wakefulness", "mood"].reduce(
      (scores, key) => ({ ...scores, [key]: Number(cognitiveForm[key]) }),
      {}
    );
    const hasInvalidCondition = Object.values(conditionScores).some(
      (score) => !Number.isInteger(score) || score < 0 || score > 10
    );
    if (!cognitiveForm.score.trim() || hasInvalidCondition) {
      setStatusMessage("Enter the cognitive score and every condition rating from 0 to 10.");
      return;
    }

    setIsSaving(true);
    setStatusMessage("");
    const { data, error } = await supabase
      .from("goat_cognitive_tests")
      .insert({
        user_id: user.id,
        test_name: cognitiveForm.testName,
        score_text: cognitiveForm.score.trim(),
        taken_at: new Date(cognitiveForm.takenAt).toISOString(),
        ...conditionScores
      })
      .select("id,test_name,score_text,taken_at,hunger,distractions,wakefulness,mood,created_at")
      .single();

    setIsSaving(false);
    if (error) {
      setStatusMessage(`Cognitive test save failed: ${error.message}`);
      return;
    }

    setKleosData((current) => ({
      ...current,
      cognitiveTests: [data, ...current.cognitiveTests].sort(compareDatedRows("taken_at"))
    }));
    setCognitiveForm(createDefaultCognitiveForm());
    setIsRecordingTest(false);
    setStatusMessage("Cognitive test saved.");
  };

  const saveMiscText = async () => {
    if (!user?.id || isSaving) return;

    setIsSaving(true);
    setStatusMessage("");
    const { data, error } = await supabase
      .from("goat_misc_characteristics")
      .upsert(
        {
          user_id: user.id,
          content: miscDraft,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      )
      .select("content")
      .single();

    setIsSaving(false);
    if (error) {
      setStatusMessage(`Miscellaneous appendix save failed: ${error.message}`);
      return;
    }

    setKleosData((current) => ({ ...current, miscText: data?.content || "" }));
    setStatusMessage("Miscellaneous appendix saved.");
  };

  const saveAcademicNotes = async () => {
    if (!user?.id || isSaving) return;

    setIsSaving(true);
    setStatusMessage("");
    const { data, error } = await supabase
      .from("goat_academic_notes")
      .upsert(
        {
          user_id: user.id,
          content: academicNotesDraft,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      )
      .select("content")
      .single();

    setIsSaving(false);
    if (error) {
      setStatusMessage(`Academic notes save failed: ${error.message}`);
      return;
    }

    setKleosData((current) => ({ ...current, academicNotes: data?.content || "" }));
    setStatusMessage("Academic notes saved.");
  };

  const saveStrengthProfile = async () => {
    if (!user?.id || isSaving) return;

    const heightCm =
      strengthProfileForm.heightCm === "" ? null : Number(strengthProfileForm.heightCm);

    if (heightCm !== null && (!Number.isFinite(heightCm) || heightCm <= 0)) {
      setStatusMessage("Height must be a positive number when provided.");
      return;
    }

    setIsSaving(true);
    setStatusMessage("");
    const { data, error } = await supabase
      .from("goat_strength_profile")
      .upsert(
        {
          user_id: user.id,
          height_cm: heightCm,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      )
      .select("body_weight_kg,body_weight_measured_on,height_cm")
      .single();

    setIsSaving(false);
    if (error) {
      setStatusMessage(`Strength profile save failed: ${error.message}`);
      return;
    }

    setKleosData((current) => ({
      ...current,
      strengthProfile: {
        bodyWeightKg: data?.body_weight_kg ?? "",
        bodyWeightMeasuredOn: data?.body_weight_measured_on ?? "",
        heightCm: data?.height_cm ?? ""
      }
    }));
    setStatusMessage("Height saved.");
  };

  const saveHealthForm = async () => {
    if (!user?.id || isSaving) return;

    setIsSaving(true);
    setStatusMessage("");
    const { data, error } = await supabase
      .from("goat_health_characteristics")
      .upsert(
        {
          user_id: user.id,
          blood_test_content: healthForm.bloodTestText,
          misc_content: healthForm.miscText,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      )
      .select("blood_test_content,misc_content")
      .single();

    setIsSaving(false);
    if (error) {
      setStatusMessage(`Health save failed: ${error.message}`);
      return;
    }

    setKleosData((current) => ({
      ...current,
      healthProfile: {
        bloodTestText: data?.blood_test_content || "",
        miscText: data?.misc_content || ""
      }
    }));
    setStatusMessage("Health characteristics saved.");
  };

  const saveCvText = async () => {
    if (!user?.id || isSaving) return;

    setIsSaving(true);
    setStatusMessage("");
    const { data, error } = await supabase
      .from("goat_cv_characteristics")
      .upsert(
        {
          user_id: user.id,
          content: cvDraft,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      )
      .select("content")
      .single();

    setIsSaving(false);
    if (error) {
      setStatusMessage(`CV save failed: ${error.message}`);
      return;
    }

    setKleosData((current) => ({ ...current, cvText: data?.content || "" }));
    setStatusMessage("CV saved.");
  };

  const saveImmutableText = async () => {
    if (!user?.id || isSaving) return;

    setIsSaving(true);
    setStatusMessage("");
    const { data, error } = await supabase
      .from("goat_immutable_characteristics")
      .upsert(
        {
          user_id: user.id,
          content: immutableDraft,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      )
      .select("content")
      .single();

    setIsSaving(false);
    if (error) {
      setStatusMessage(`Immutable characteristics save failed: ${error.message}`);
      return;
    }

    setKleosData((current) => ({ ...current, immutableText: data?.content || "" }));
    setStatusMessage("Immutable characteristics saved.");
  };

  const renderPageContent = () => {
    if (isDashboard) {
      return (
        <>
          <CharacterSheet userId={user.id} />
          <details className="fs-app-card kleos-card wide-card">
            <summary>Shared profile context</summary>
            <p className="kleos-subtitle">
              Plain-text context for the evaluator that doesn&apos;t belong to a single dimension.
            </p>
            <div className="kleos-grid">
              <TextRecord
                title="Immutable characteristics"
                value={immutableDraft}
                onChange={setImmutableDraft}
                placeholder="Plain-text immutable characteristics for the LLM context prompt."
                actionLabel="Save Immutable"
                onSave={saveImmutableText}
                disabled={isSaving}
                dirty={immutableDraft !== kleosData.immutableText}
                bare
              />
              <TextRecord
                title="Miscellaneous characteristics"
                value={miscDraft}
                onChange={setMiscDraft}
                placeholder="Plain-text cross-dimensional appendix for the LLM context prompt."
                actionLabel="Save Appendix"
                onSave={saveMiscText}
                disabled={isSaving}
                dirty={miscDraft !== kleosData.miscText}
                bare
              />
            </div>
          </details>
        </>
      );
    }

    return (
      <DimensionState userId={user.id} vectorId={page.id} kleosData={kleosData}>
        {renderDimensionMeasurements()}
      </DimensionState>
    );
  };

  const renderDimensionMeasurements = () => {
    switch (page.id) {
      case "physical":
        return (
          <div className="kleos-grid">
            <section className="fs-app-card kleos-card wide-card">
              <SectionHeader
                title="Strength & Body Metrics"
                note="Heracles strength and body weight are read-only in Kleos. Height remains user-managed."
              />
              <div className="inline-form">
                <label>
                  Body Weight KG (Heracles)
                  <input
                    type="text"
                    value={
                      kleosData.strengthProfile.bodyWeightMeasuredOn
                        ? formatNumber(kleosData.strengthProfile.bodyWeightKg)
                        : ""
                    }
                    placeholder="Awaiting Heracles sync"
                    readOnly
                    aria-readonly="true"
                  />
                  <small>
                    {kleosData.strengthProfile.bodyWeightMeasuredOn
                      ? `Measured ${formatCalendarDate(kleosData.strengthProfile.bodyWeightMeasuredOn)} · synced from Heracles`
                      : "Synced from Heracles; not user-editable."}
                  </small>
                </label>
                <label>
                  Height CM
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={strengthProfileForm.heightCm}
                    onChange={(event) =>
                      setStrengthProfileForm((current) => ({
                        ...current,
                        heightCm: event.target.value
                      }))
                    }
                  />
                </label>
                <button
                  type="button"
                  className="fs-app-button is-primary"
                  onClick={saveStrengthProfile}
                  disabled={isSaving}
                >
                  Save Height
                </button>
                <button
                  type="button"
                  className="fs-app-button is-secondary"
                  onClick={() => void syncHeraclesStrength(user.id)}
                  disabled={isSyncingStrength}
                >
                  {isSyncingStrength ? "Syncing…" : "Sync Heracles"}
                </button>
              </div>
              <CompactTable
                columns={[
                  "Exercise",
                  "Machine / Equipment",
                  "Estimated 1RM",
                  "Relative to BW",
                  "Sessions",
                  "State",
                  "Achieved"
                ]}
                rows={kleosData.strengthMetrics.map((metric) => {
                  const dumbbell = isDumbbellExercise(metric.exercise_name);
                  return [
                    metric.exercise_name,
                    metric.equipment_name || "Not recorded",
                    `${formatNumber(metric.best_1rm)} KG${dumbbell ? " per dumbbell" : ""}`,
                    metric.best_1rm_relative_bw === null || metric.best_1rm_relative_bw === undefined
                      ? "Unavailable"
                      : `${formatBodyWeightMultiple(metric.best_1rm_relative_bw)}× BW${dumbbell ? " per dumbbell" : ""}`,
                    metric.qualifying_sessions,
                    metric.is_current ? "Current" : "Stale",
                    formatCalendarDate(metric.achieved_on)
                  ];
                })}
                emptyText="No Heracles strength snapshot has been synced yet."
              />
            </section>

            <section className="fs-app-card kleos-card wide-card">
              <SectionHeader title="Health Characteristics" />
              <div className="stacked-form">
                <label>
                  Latest Blood Test
                  <textarea
                    className="large-textarea"
                    value={healthForm.bloodTestText}
                    onChange={(event) =>
                      setHealthForm((current) => ({
                        ...current,
                        bloodTestText: event.target.value
                      }))
                    }
                    placeholder="Plain-text latest blood test results for the Kleos evidence context."
                  />
                </label>
                <label>
                  Miscellaneous Health
                  <textarea
                    className="large-textarea"
                    value={healthForm.miscText}
                    onChange={(event) =>
                      setHealthForm((current) => ({
                        ...current,
                        miscText: event.target.value
                      }))
                    }
                    placeholder="Plain-text miscellaneous health details for the Kleos evidence context."
                  />
                </label>
              </div>
              <button
                type="button"
                className="fs-app-button is-primary"
                onClick={saveHealthForm}
                disabled={isSaving}
              >
                Save Health
              </button>
            </section>
          </div>
        );

      case "psychological":
        return (
          <div className="kleos-scroll">
            <PsychologicalAssessment userId={user.id} />
            <BigFiveAssessments
              userId={user.id}
              assessments={kleosData.bigFiveAssessments || []}
            />
          </div>
        );

      case "intellectual":
        return (
          <div className="kleos-scroll">
            <section className="fs-app-card kleos-card">
              <SectionHeading
                title="Cognitive tests"
                hint="Cognitive measurements are evidence for the Intellectual dimension. Each score records the conditions it was produced in: hunger, distractions, wakefulness and mood, each rated 0–10."
              >
                <button
                  type="button"
                  className="fs-app-button is-ghost"
                  onClick={() => window.dispatchEvent(new Event("kleos:open-measurement-corrections"))}
                >
                  <History aria-hidden="true" />
                  Edit history
                </button>
                <button
                  type="button"
                  className={`fs-app-button ${isRecordingTest ? "is-ghost" : "is-secondary"}`}
                  onClick={() => setIsRecordingTest((current) => !current)}
                  aria-expanded={isRecordingTest}
                >
                  {isRecordingTest ? "Close form" : "Record test"}
                </button>
              </SectionHeading>
              {isRecordingTest ? (
                <form className="kleos-form-panel" onSubmit={saveCognitiveTest}>
                  <div className="compact-form">
                    <label>
                      Test
                      <select
                        value={cognitiveForm.testName}
                        onChange={(event) =>
                          setCognitiveForm((current) => ({
                            ...current,
                            testName: event.target.value
                          }))
                        }
                      >
                        {COGNITIVE_TESTS.map((testName) => (
                          <option key={testName} value={testName}>
                            {testName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Score
                      <input
                        value={cognitiveForm.score}
                        placeholder="e.g. 128"
                        onChange={(event) =>
                          setCognitiveForm((current) => ({ ...current, score: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Date/time
                      <input
                        type="datetime-local"
                        value={cognitiveForm.takenAt}
                        onChange={(event) =>
                          setCognitiveForm((current) => ({
                            ...current,
                            takenAt: event.target.value
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="compact-form kleos-condition-row">
                    {["hunger", "distractions", "wakefulness", "mood"].map((fieldName) => (
                      <label key={fieldName}>
                        {capitalize(fieldName)} /10
                        <input
                          type="number"
                          min="0"
                          max="10"
                          step="1"
                          placeholder="0–10"
                          value={cognitiveForm[fieldName]}
                          onChange={(event) =>
                            setCognitiveForm((current) => ({
                              ...current,
                              [fieldName]: event.target.value
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <div className="kleos-form-footer">
                    <button type="submit" className="fs-app-button is-primary" disabled={isSaving}>
                      Save Test
                    </button>
                  </div>
                </form>
              ) : null}
              <CompactTable
                columns={["Test", "Score", "Date", "Conditions"]}
                numeric={[1]}
                rows={kleosData.cognitiveTests.map((test) => [
                  test.test_name,
                  test.score_text,
                  formatShortDateTime(test.taken_at),
                  `Hunger ${test.hunger} · Distraction ${test.distractions} · Wake ${test.wakefulness} · Mood ${test.mood}`
                ])}
                emptyText="No cognitive tests recorded yet."
              />
            </section>

            <section className="fs-app-card kleos-card">
              <SectionHeading
                title="Academic record"
                hint="Academic records and context contribute to the Intellectual dimension; professional implications remain visible through the Professional assessment."
              />
              <h3 className="kleos-subheading">Stages</h3>
              <CompactTable
                columns={["Year", "Stage", "Mean", "Weighting", "Credits", "Result"]}
                numeric={[2, 3, 4]}
                rows={kleosData.academicStages.map((stage) => [
                  stage.academic_year,
                  stage.stage,
                  stage.stage_mean === null ? "-" : `${formatNumber(stage.stage_mean)}%`,
                  stage.weighting === null ? "-" : `${formatNumber(stage.weighting)}%`,
                  stage.credits || "-",
                  stage.stage_result || "-"
                ])}
                emptyText="Academic stage data is not available."
              />
              <h3 className="kleos-subheading kleos-subheading-spaced">Modules</h3>
              <CompactTable
                columns={["Year", "Module", "Mark", "Credits"]}
                numeric={[2, 3]}
                rows={kleosData.academicModules.map((module) => [
                  module.academic_year,
                  module.module_name,
                  `${formatNumber(module.mark)}% ${module.result}`,
                  module.credits
                ])}
                emptyText="Academic module data is not available."
              />
              <details className="kleos-disclosure kleos-disclosure-spaced">
                <summary>Academic notes</summary>
                <TextRecord
                  title="Notes for the evaluator"
                  value={academicNotesDraft}
                  onChange={setAcademicNotesDraft}
                  placeholder="Academic-specific notes for the Kleos evidence context."
                  actionLabel="Save Academic Notes"
                  onSave={saveAcademicNotes}
                  disabled={isSaving}
                  dirty={academicNotesDraft !== kleosData.academicNotes}
                  bare
                />
              </details>
            </section>
          </div>
        );

      case "professional":
        return (
          <section className="fs-app-card kleos-card">
            <SectionHeading
              title="Professional record"
              hint="CV and career evidence live with the Professional dimension. The plain-text CV below is supplied to the evaluator as evidence."
            />
            <TextRecord
              title="Curriculum vitae"
              value={cvDraft}
              onChange={setCvDraft}
              placeholder="Paste plain-text CV for the Kleos evidence context."
              actionLabel="Save CV"
              onSave={saveCvText}
              disabled={isSaving}
              dirty={cvDraft !== kleosData.cvText}
              tall
              bare
            />
          </section>
        );

      case "financial":
      case "relational":
      case "creative":
      case "experiential":
        return (
          <section className="fs-app-card kleos-card kleos-empty-card">
            <Inbox aria-hidden="true" />
            <div>
              <h2>No structured evidence source yet</h2>
              <p>
                This page is the canonical home for future {page.label.toLowerCase()} evidence and
                measurement workflows. Until then, the assessment above draws on shared profile context.
              </p>
            </div>
          </section>
        );

      default:
        return null;
    }
  };

  const accessGate = renderAccessGate({
    accessState,
    user,
    statusMessage,
    onSignIn: signInWithGoogle
  });

  return (
    <main className="kleos-shell">
      <section className="kleos-board">
        {accessGate || (
          <div className="kleos-scroll">
            {renderPageContent()}
          </div>
        )}
        {accessGate ? null : <StatusToast message={statusMessage} />}
      </section>
    </main>
  );
}

function SectionHeader({ kicker, title, note }) {
  return (
    <div className="section-header">
      {kicker ? <p className="fs-app-kicker">{kicker}</p> : null}
      <h2>{title}</h2>
      {note ? <p>{note}</p> : null}
    </div>
  );
}

function TextRecord({
  title,
  value,
  onChange,
  placeholder,
  actionLabel,
  onSave,
  disabled,
  dirty,
  tall = false,
  bare = false
}) {
  const words = String(value || "").trim() ? String(value).trim().split(/\s+/).length : 0;
  return (
    <section className={bare ? "kleos-text-record" : "fs-app-card kleos-card kleos-text-record"}>
      <label>
        <span className="kleos-text-record-title">
          {title}
          <small>{words ? `${words.toLocaleString()} words` : "Empty"}</small>
        </span>
        <textarea
          className={`large-textarea${tall ? " is-tall" : ""}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      </label>
      <div className="kleos-form-footer">
        {dirty ? <p className="kleos-note">Unsaved changes</p> : null}
        <button
          type="button"
          className={`fs-app-button ${dirty ? "is-primary" : "is-secondary"}`}
          onClick={onSave}
          disabled={disabled || !dirty}
        >
          {actionLabel}
        </button>
      </div>
    </section>
  );
}

function renderAccessGate({ accessState, user, statusMessage, onSignIn }) {
  if (accessState === "authorized") return null;

  const titleByState = {
    loading: "Checking Kleos Access",
    unconfigured: "Supabase Required",
    "signed-out": "Private Kleos Workspace",
    unauthorized: "Access Denied"
  };

  const bodyByState = {
    loading: "Verifying the signed-in account before loading any Kleos data.",
    unconfigured: "This deployment needs the shared Ariadne Supabase URL and publishable key.",
    "signed-out": `Sign in with ${AUTHORIZED_KLEOS_EMAIL} to open Kleos.`,
    unauthorized: `${user?.email || "This account"} is not authorized for Kleos.`
  };

  return (
    <section
      className={`fs-app-card access-panel${accessState === "loading" ? " is-loading" : ""}`}
      aria-busy={accessState === "loading" ? "true" : undefined}
    >
      <div className="access-mark">
        <img src="/brand/kleos-mark.svg" alt="" aria-hidden="true" />
      </div>
      <h2>{titleByState[accessState] || "Private Kleos Workspace"}</h2>
      <p>{statusMessage || bodyByState[accessState]}</p>
      {accessState === "signed-out" ? (
        <button type="button" className="fs-app-button is-primary" onClick={onSignIn}>
          Sign In With Google
        </button>
      ) : null}
    </section>
  );
}

function CompactTable({ columns, rows, emptyText, numeric = [] }) {
  const numericColumns = new Set(numeric);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column, columnIndex) => (
              <th key={column} className={numericColumns.has(columnIndex) ? "num" : undefined}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, rowIndex) => (
              <tr key={`${rowIndex}-${row.join("|")}`}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${cellIndex}-${cell}`}
                    className={numericColumns.has(cellIndex) ? "num" : undefined}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td className="kleos-table-empty" colSpan={columns.length}>{emptyText}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function compareDatedRows(dateKey) {
  return (left, right) =>
    new Date(right[dateKey] || 0).getTime() - new Date(left[dateKey] || 0).getTime();
}

function formatCalendarDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString();
}

function formatShortDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatNumber(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return "-";
  return Number.isInteger(numberValue) ? String(numberValue) : numberValue.toFixed(1);
}

function formatBodyWeightMultiple(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return "-";
  return numberValue.toFixed(2);
}

function getErrorMessage(error) {
  return error?.message || (error instanceof Error ? error.message : "Unknown error");
}

function capitalize(value) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function isDumbbellExercise(exerciseName) {
  return String(exerciseName || "").toLowerCase().includes("dumbbell");
}
