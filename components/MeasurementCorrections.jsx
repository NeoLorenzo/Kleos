"use client";

import { useEffect, useMemo, useState } from "react";
import { AUTHORIZED_KLEOS_EMAIL } from "@/lib/kleos/data";
import {
  cognitiveRowToDraft,
  removeMeasurementRecord,
  replaceMeasurementRecord,
  validateCognitiveDraft
} from "@/lib/kleos/measurementRecords";
import { supabase } from "@/lib/supabase/client";

const COGNITIVE_TABLE = {
  table: "goat_cognitive_tests",
  select: "id,test_name,score_text,taken_at,hunger,distractions,wakefulness,mood,created_at",
  label: "cognitive test"
};

export default function MeasurementCorrections() {
  const [authorized, setAuthorized] = useState(false);
  const [userId, setUserId] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [records, setRecords] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    if (!supabase) return undefined;

    const applyUser = (user) => {
      const email = String(user?.email || "").trim().toLowerCase();
      const isAuthorized = Boolean(user?.id && email === AUTHORIZED_KLEOS_EMAIL);
      setAuthorized(isAuthorized);
      setUserId(isAuthorized ? user.id : null);

      if (!isAuthorized) {
        setOpen(false);
        setEditingId(null);
        setDraft(null);
        setRecords([]);
      }
    };

    void supabase.auth.getUser().then(({ data }) => applyUser(data?.user || null));
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (open && authorized && userId) void loadRecords();
  }, [open, authorized, userId]);

  const sortedRecords = useMemo(
    () => [...records].sort((a, b) => String(b.taken_at).localeCompare(String(a.taken_at))),
    [records]
  );

  const loadRecords = async () => {
    if (!supabase || !userId) return;
    setLoading(true);
    setStatus("");

    const { data, error } = await supabase
      .from(COGNITIVE_TABLE.table)
      .select(COGNITIVE_TABLE.select)
      .eq("user_id", userId);

    setLoading(false);
    if (error) {
      setStatus(`Measurement history failed to load: ${error.message}`);
      return;
    }

    setRecords(data || []);
  };

  const beginEdit = (row) => {
    setStatus("");
    setEditingId(row.id);
    setDraft(cognitiveRowToDraft(row));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
    setStatus("");
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    if (!supabase || !editingId || !draft || !userId) return;

    const validation = validateCognitiveDraft(draft);
    if (!validation.ok) {
      setStatus(validation.message);
      return;
    }

    setLoading(true);
    setStatus("");
    const { data, error } = await supabase
      .from(COGNITIVE_TABLE.table)
      .update(validation.payload)
      .eq("id", editingId)
      .eq("user_id", userId)
      .select(COGNITIVE_TABLE.select)
      .single();
    setLoading(false);

    if (error) {
      setStatus(`${COGNITIVE_TABLE.label} update failed: ${error.message}`);
      return;
    }

    setRecords((current) => replaceMeasurementRecord({ cognitive: current }, "cognitive", data).cognitive);
    window.dispatchEvent(new Event("kleos:measurements-changed"));
    setEditingId(null);
    setDraft(null);
    setStatus(`${COGNITIVE_TABLE.label} updated.`);
  };

  const deleteRecord = async (row) => {
    if (!supabase || !userId) return;
    const summary = describeRecord(row);
    if (!window.confirm(`Delete this ${COGNITIVE_TABLE.label}?\n\n${summary}\n\nThis cannot be undone.`)) {
      return;
    }

    setLoading(true);
    setStatus("");
    const { error } = await supabase
      .from(COGNITIVE_TABLE.table)
      .delete()
      .eq("id", row.id)
      .eq("user_id", userId)
      .select("id")
      .single();
    setLoading(false);

    if (error) {
      setStatus(`${COGNITIVE_TABLE.label} deletion failed: ${error.message}`);
      return;
    }

    setRecords((current) => removeMeasurementRecord({ cognitive: current }, "cognitive", row.id).cognitive);
    window.dispatchEvent(new Event("kleos:measurements-changed"));
    setStatus(`${COGNITIVE_TABLE.label} deleted.`);
  };

  if (!authorized) return null;

  return (
    <>
      <button className="correction-launcher" type="button" onClick={() => setOpen(true)}>
        Correct measurements
      </button>

      {open ? (
        <div
          className="correction-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            className="correction-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Correct recorded measurements"
          >
            <header className="correction-header">
              <div>
                <h2>Correct recorded measurements</h2>
                <p>Edit or delete canonical cognitive history. Strength evidence is read-only from Heracles.</p>
              </div>
              <button
                type="button"
                className="correction-close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </header>

            {status ? <p className="correction-status">{status}</p> : null}
            {loading && !editingId ? <p className="correction-status">Loading…</p> : null}

            {editingId && draft ? (
              <EditForm
                draft={draft}
                setDraft={setDraft}
                onSubmit={saveEdit}
                onCancel={cancelEdit}
                disabled={loading}
              />
            ) : (
              <div className="correction-groups">
                <RecordGroup
                  rows={sortedRecords}
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

function RecordGroup({ rows, onEdit, onDelete, disabled }) {
  return (
    <section className="correction-group">
      <h3>Cognitive History</h3>
      <div className="correction-list">
        {rows.length ? (
          rows.map((row) => (
            <div className="correction-row" key={row.id}>
              <div className="correction-row-text">{describeRecord(row)}</div>
              <div className="correction-actions">
                <button type="button" onClick={() => onEdit(row)} disabled={disabled}>
                  Edit
                </button>
                <button type="button" onClick={() => onDelete(row)} disabled={disabled}>
                  Delete
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="correction-empty">No records.</div>
        )}
      </div>
    </section>
  );
}

function EditForm({ draft, setDraft, onSubmit, onCancel, disabled }) {
  const setField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));

  return (
    <form className="correction-form" onSubmit={onSubmit}>
      <h3>Edit cognitive test</h3>
      <Field label="Test">
        <input value={draft.testName} onChange={(event) => setField("testName", event.target.value)} />
      </Field>
      <Field label="Score">
        <input value={draft.score} onChange={(event) => setField("score", event.target.value)} />
      </Field>
      <Field label="Date/time">
        <input type="datetime-local" value={draft.takenAt} onChange={(event) => setField("takenAt", event.target.value)} />
      </Field>
      {["hunger", "distractions", "wakefulness", "mood"].map((field) => (
        <Field key={field} label={`${field[0].toUpperCase()}${field.slice(1)} /10`}>
          <input
            type="number"
            min="0"
            max="10"
            step="1"
            value={draft[field]}
            onChange={(event) => setField(field, event.target.value)}
          />
        </Field>
      ))}
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

function describeRecord(row) {
  return `${row.test_name} — ${row.score_text} — ${formatDateTime(row.taken_at)} — H ${row.hunger}/10, D ${row.distractions}/10, W ${row.wakefulness}/10, M ${row.mood}/10`;
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}
