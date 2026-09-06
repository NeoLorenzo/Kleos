"use client";

import { useEffect, useMemo, useState } from "react";
import { AUTHORIZED_KLEOS_EMAIL } from "@/lib/kleos/data";
import {
  cognitiveRowToDraft,
  liftRowToDraft,
  scoreRowToDraft,
  validateCognitiveDraft,
  validateLiftDraft,
  validateScoreDraft
} from "@/lib/kleos/measurementRecords";
import { supabase } from "@/lib/supabase/client";

const TABLES = {
  score: {
    table: "goat_score_entries",
    select: "id,score,entry_date,llm_commentary,created_at",
    label: "GOAT score"
  },
  lift: {
    table: "goat_strength_lifts",
    select: "id,exercise_name,weight_kg,reps,performed_at,created_at",
    label: "strength lift"
  },
  cognitive: {
    table: "goat_cognitive_tests",
    select: "id,test_name,score_text,taken_at,hunger,distractions,wakefulness,mood,created_at",
    label: "cognitive test"
  }
};

export default function MeasurementCorrections() {
  const [authorized, setAuthorized] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [records, setRecords] = useState({ score: [], lift: [], cognitive: [] });
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    if (!supabase) return undefined;

    const applyUser = (user) => {
      const email = String(user?.email || "").trim().toLowerCase();
      setAuthorized(Boolean(user && email === AUTHORIZED_KLEOS_EMAIL));
    };

    void supabase.auth.getUser().then(({ data }) => applyUser(data?.user || null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (open && authorized) void loadRecords();
  }, [open, authorized]);

  const sortedRecords = useMemo(
    () => ({
      score: [...records.score].sort((a, b) => String(b.entry_date).localeCompare(String(a.entry_date))),
      lift: [...records.lift].sort((a, b) => String(b.performed_at).localeCompare(String(a.performed_at))),
      cognitive: [...records.cognitive].sort((a, b) => String(b.taken_at).localeCompare(String(a.taken_at)))
    }),
    [records]
  );

  const loadRecords = async () => {
    if (!supabase) return;
    setLoading(true);
    setStatus("");

    const [scores, lifts, cognitive] = await Promise.all([
      supabase.from(TABLES.score.table).select(TABLES.score.select),
      supabase.from(TABLES.lift.table).select(TABLES.lift.select),
      supabase.from(TABLES.cognitive.table).select(TABLES.cognitive.select)
    ]);

    setLoading(false);
    const failed = [scores, lifts, cognitive].find((result) => result.error);
    if (failed?.error) {
      setStatus(`Measurement history failed to load: ${failed.error.message}`);
      return;
    }

    setRecords({
      score: scores.data || [],
      lift: lifts.data || [],
      cognitive: cognitive.data || []
    });
  };

  const beginEdit = (kind, row) => {
    setStatus("");
    setEditing({ kind, id: row.id });
    setDraft(
      kind === "score"
        ? scoreRowToDraft(row)
        : kind === "lift"
          ? liftRowToDraft(row)
          : cognitiveRowToDraft(row)
    );
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraft(null);
    setStatus("");
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    if (!supabase || !editing || !draft) return;

    const validation =
      editing.kind === "score"
        ? validateScoreDraft(draft)
        : editing.kind === "lift"
          ? validateLiftDraft(draft)
          : validateCognitiveDraft(draft);

    if (!validation.ok) {
      setStatus(validation.message);
      return;
    }

    setLoading(true);
    setStatus("");
    const config = TABLES[editing.kind];
    const { error } = await supabase
      .from(config.table)
      .update(validation.payload)
      .eq("id", editing.id);
    setLoading(false);

    if (error) {
      setStatus(`${config.label} update failed: ${error.message}`);
      return;
    }

    window.location.reload();
  };

  const deleteRecord = async (kind, row) => {
    if (!supabase) return;
    const config = TABLES[kind];
    const summary = describeRecord(kind, row);
    if (!window.confirm(`Delete this ${config.label}?\n\n${summary}\n\nThis cannot be undone.`)) {
      return;
    }

    setLoading(true);
    setStatus("");
    const { error } = await supabase.from(config.table).delete().eq("id", row.id);
    setLoading(false);

    if (error) {
      setStatus(`${config.label} deletion failed: ${error.message}`);
      return;
    }

    window.location.reload();
  };

  if (!authorized) return null;

  return (
    <>
      <button className="correction-launcher" type="button" onClick={() => setOpen(true)}>
        Correct measurements
      </button>

      {open ? (
        <div className="correction-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className="correction-panel" role="dialog" aria-modal="true" aria-label="Correct recorded measurements">
            <header className="correction-header">
              <div>
                <h2>Correct recorded measurements</h2>
                <p>Edit or delete canonical GOAT score, strength, and cognitive history.</p>
              </div>
              <button type="button" className="correction-close" onClick={() => setOpen(false)} aria-label="Close">
                ×
              </button>
            </header>

            {status ? <p className="correction-status">{status}</p> : null}
            {loading && !editing ? <p className="correction-status">Loading…</p> : null}

            {editing && draft ? (
              <EditForm
                kind={editing.kind}
                draft={draft}
                setDraft={setDraft}
                onSubmit={saveEdit}
                onCancel={cancelEdit}
                disabled={loading}
              />
            ) : (
              <div className="correction-groups">
                <RecordGroup
                  title="GOAT Score History"
                  kind="score"
                  rows={sortedRecords.score}
                  onEdit={beginEdit}
                  onDelete={deleteRecord}
                  disabled={loading}
                />
                <RecordGroup
                  title="Strength History"
                  kind="lift"
                  rows={sortedRecords.lift}
                  onEdit={beginEdit}
                  onDelete={deleteRecord}
                  disabled={loading}
                />
                <RecordGroup
                  title="Cognitive History"
                  kind="cognitive"
                  rows={sortedRecords.cognitive}
                  onEdit={beginEdit}
                  onDelete={deleteRecord}
                  disabled={loading}
                />
              </div>
            )}
          </section>
        </div>
      ) : null}

      <style jsx global>{`
        .correction-launcher {
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 30;
          border: 1px solid rgba(255,255,255,.2);
          border-radius: 999px;
          padding: 10px 15px;
          background: #111820;
          color: #f7f7f5;
          font: inherit;
          cursor: pointer;
          box-shadow: 0 10px 30px rgba(0,0,0,.28);
        }
        .correction-backdrop {
          position: fixed;
          inset: 0;
          z-index: 40;
          display: flex;
          justify-content: flex-end;
          background: rgba(0,0,0,.55);
        }
        .correction-panel {
          width: min(620px, 100%);
          height: 100%;
          overflow-y: auto;
          background: #10161d;
          color: #f4f4f0;
          padding: 24px;
          box-shadow: -12px 0 40px rgba(0,0,0,.35);
        }
        .correction-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
        .correction-header h2 { margin: 0 0 6px; font-size: 22px; }
        .correction-header p, .correction-status { color: #aeb7c1; margin: 0; }
        .correction-close { border: 0; background: transparent; color: inherit; font-size: 30px; cursor: pointer; }
        .correction-status { margin-top: 14px; }
        .correction-groups { display: grid; gap: 24px; margin-top: 24px; }
        .correction-group h3 { margin: 0 0 10px; font-size: 16px; }
        .correction-list { display: grid; gap: 8px; }
        .correction-row { display: flex; gap: 12px; justify-content: space-between; align-items: center; padding: 11px 12px; border: 1px solid rgba(255,255,255,.1); border-radius: 10px; }
        .correction-row-text { min-width: 0; font-size: 13px; color: #d9dee3; overflow-wrap: anywhere; }
        .correction-actions { display: flex; gap: 7px; flex: 0 0 auto; }
        .correction-actions button, .correction-form button { border: 1px solid rgba(255,255,255,.16); border-radius: 8px; padding: 7px 10px; background: #19222c; color: inherit; cursor: pointer; }
        .correction-actions button:last-child { color: #ffb3b3; }
        .correction-actions button:disabled, .correction-form button:disabled { opacity: .5; cursor: default; }
        .correction-empty { color: #87929d; font-size: 13px; }
        .correction-form { display: grid; gap: 13px; margin-top: 24px; }
        .correction-form label { display: grid; gap: 6px; color: #c7ced5; font-size: 13px; }
        .correction-form input, .correction-form select, .correction-form textarea { width: 100%; box-sizing: border-box; border: 1px solid rgba(255,255,255,.14); border-radius: 8px; padding: 9px 10px; background: #0b1016; color: #f4f4f0; font: inherit; }
        .correction-form-actions { display: flex; gap: 9px; }
        @media (max-width: 640px) {
          .correction-panel { padding: 18px; }
          .correction-launcher { right: 12px; bottom: 12px; }
          .correction-row { align-items: flex-start; flex-direction: column; }
        }
      `}</style>
    </>
  );
}

function RecordGroup({ title, kind, rows, onEdit, onDelete, disabled }) {
  return (
    <section className="correction-group">
      <h3>{title}</h3>
      <div className="correction-list">
        {rows.length ? rows.map((row) => (
          <div className="correction-row" key={row.id}>
            <div className="correction-row-text">{describeRecord(kind, row)}</div>
            <div className="correction-actions">
              <button type="button" onClick={() => onEdit(kind, row)} disabled={disabled}>Edit</button>
              <button type="button" onClick={() => onDelete(kind, row)} disabled={disabled}>Delete</button>
            </div>
          </div>
        )) : <div className="correction-empty">No records.</div>}
      </div>
    </section>
  );
}

function EditForm({ kind, draft, setDraft, onSubmit, onCancel, disabled }) {
  const setField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));

  return (
    <form className="correction-form" onSubmit={onSubmit}>
      <h3>Edit {TABLES[kind].label}</h3>
      {kind === "score" ? (
        <>
          <Field label="Score"><input type="number" min="0" max="100" step="0.1" value={draft.score} onChange={(event) => setField("score", event.target.value)} /></Field>
          <Field label="Date"><input type="date" value={draft.entryDate} onChange={(event) => setField("entryDate", event.target.value)} /></Field>
          <Field label="LLM commentary"><textarea rows="4" value={draft.commentary} onChange={(event) => setField("commentary", event.target.value)} /></Field>
        </>
      ) : null}

      {kind === "lift" ? (
        <>
          <Field label="Exercise"><input value={draft.exerciseName} onChange={(event) => setField("exerciseName", event.target.value)} /></Field>
          <Field label="Weight KG"><input type="number" min="0" step="0.5" value={draft.weightKg} onChange={(event) => setField("weightKg", event.target.value)} /></Field>
          <Field label="Reps"><input type="number" min="1" step="1" value={draft.reps} onChange={(event) => setField("reps", event.target.value)} /></Field>
          <Field label="Date"><input type="date" value={draft.performedAt} onChange={(event) => setField("performedAt", event.target.value)} /></Field>
        </>
      ) : null}

      {kind === "cognitive" ? (
        <>
          <Field label="Test"><input value={draft.testName} onChange={(event) => setField("testName", event.target.value)} /></Field>
          <Field label="Score"><input value={draft.score} onChange={(event) => setField("score", event.target.value)} /></Field>
          <Field label="Date/time"><input type="datetime-local" value={draft.takenAt} onChange={(event) => setField("takenAt", event.target.value)} /></Field>
          {["hunger", "distractions", "wakefulness", "mood"].map((field) => (
            <Field key={field} label={`${field[0].toUpperCase()}${field.slice(1)} /10`}>
              <input type="number" min="0" max="10" step="1" value={draft[field]} onChange={(event) => setField(field, event.target.value)} />
            </Field>
          ))}
        </>
      ) : null}

      <div className="correction-form-actions">
        <button type="submit" disabled={disabled}>Save correction</button>
        <button type="button" onClick={onCancel} disabled={disabled}>Cancel</button>
      </div>
    </form>
  );
}

function Field({ label, children }) {
  return <label>{label}{children}</label>;
}

function describeRecord(kind, row) {
  if (kind === "score") {
    return `${formatNumber(row.score)} / 100 — ${row.entry_date}${row.llm_commentary ? ` — ${row.llm_commentary}` : ""}`;
  }
  if (kind === "lift") {
    return `${row.exercise_name} — ${formatNumber(row.weight_kg)} KG × ${row.reps} — ${formatDate(row.performed_at)}`;
  }
  return `${row.test_name} — ${row.score_text} — ${formatDateTime(row.taken_at)} — H ${row.hunger}/10, D ${row.distractions}/10, W ${row.wakefulness}/10, M ${row.mood}/10`;
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "");
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)));
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}
