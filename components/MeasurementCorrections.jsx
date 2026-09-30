"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
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

  useEffect(() => {
    const openCorrections = () => setOpen(true);
    window.addEventListener("kleos:open-measurement-corrections", openCorrections);
    return () => window.removeEventListener("kleos:open-measurement-corrections", openCorrections);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  if (!authorized) return null;

  const dialog = open ? (
    <div
      className="correction-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <section
        className="fs-app-modal correction-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="correction-title"
      >
        <header className="fs-app-modal-header">
          <div>
            <h2 id="correction-title">{editingId ? "Edit cognitive test" : "Cognitive test history"}</h2>
            <p className="correction-subtitle">
              Edit or delete canonical cognitive history. Strength evidence is read-only from Heracles.
            </p>
          </div>
          <button
            type="button"
            className="fs-app-button is-icon"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="fs-app-modal-body">
          {status ? <p className="correction-status">{status}</p> : null}
          {loading && !editingId && !records.length ? <p className="correction-status">Loading…</p> : null}

          {editingId && draft ? (
            <EditForm
              draft={draft}
              setDraft={setDraft}
              onSubmit={saveEdit}
              onCancel={cancelEdit}
              disabled={loading}
            />
          ) : (
            <RecordGroup
              rows={sortedRecords}
              onEdit={beginEdit}
              onDelete={deleteRecord}
              disabled={loading}
            />
          )}
        </div>
      </section>
    </div>
  ) : null;

  return (
    <>
      {dialog ? createPortal(dialog, document.getElementById("kleos-app-root") || document.body) : null}

      <style jsx global>{`
        .correction-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: grid;
          place-items: center;
          padding: 16px;
          background: rgba(0, 0, 0, 0.66);
          backdrop-filter: blur(3px);
          font-family: var(--fs-font-primary);
        }
        .correction-panel .fs-app-modal-header {
          align-items: flex-start;
        }
        .correction-subtitle {
          margin: 4px 0 0;
          color: var(--fs-app-text-muted);
          font-size: 13px;
          line-height: 1.45;
        }
        .correction-status {
          margin: 0 0 12px;
          padding: 8px 12px;
          border: 1px solid var(--fs-app-border-raised);
          border-radius: var(--fs-radius-control);
          background: var(--fs-app-surface-raised);
          color: var(--fs-app-text-secondary);
          font-size: 13px;
        }
        .correction-group h3 {
          margin: 0 0 10px;
          color: var(--fs-app-text-muted);
          font-size: 12px;
          font-weight: 500;
        }
        .correction-list {
          overflow: hidden;
          border: 1px solid var(--fs-app-border);
          border-radius: 10px;
        }
        .correction-row {
          display: flex;
          gap: 12px;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
        }
        .correction-row + .correction-row {
          border-top: 1px solid var(--fs-app-border);
        }
        .correction-row:hover {
          background: var(--fs-app-hover);
        }
        .correction-row-text {
          display: grid;
          gap: 2px;
          min-width: 0;
        }
        .correction-row-text strong {
          color: var(--fs-app-text);
          font-size: 13px;
          font-weight: 600;
        }
        .correction-row-text span {
          color: var(--fs-app-text-muted);
          font-size: 12px;
          font-variant-numeric: tabular-nums;
        }
        .correction-actions {
          display: flex;
          gap: 4px;
          flex: 0 0 auto;
        }
        .correction-empty {
          padding: 20px;
          color: var(--fs-app-text-muted);
          font-size: 13px;
          text-align: center;
        }
        .correction-form {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .correction-form .is-wide {
          grid-column: 1 / -1;
        }
        .correction-form-actions {
          grid-column: 1 / -1;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding-top: 4px;
        }
        @media (max-width: 640px) {
          .correction-row {
            align-items: flex-start;
            flex-direction: column;
          }
          .correction-form {
            grid-template-columns: 1fr;
          }
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
              <div className="correction-row-text">
                <strong>{row.test_name} · {row.score_text}</strong>
                <span>
                  {formatDateTime(row.taken_at)} · H {row.hunger}/10 · D {row.distractions}/10 · W {row.wakefulness}/10 · M {row.mood}/10
                </span>
              </div>
              <div className="correction-actions">
                <button type="button" className="fs-app-button is-ghost" onClick={() => onEdit(row)} disabled={disabled}>
                  Edit
                </button>
                <button type="button" className="fs-app-button is-ghost is-danger" onClick={() => onDelete(row)} disabled={disabled}>
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
      <Field label="Test" wide>
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
        <button type="button" className="fs-app-button is-secondary" onClick={onCancel} disabled={disabled}>Cancel</button>
        <button type="submit" className="fs-app-button is-primary" disabled={disabled}>Save correction</button>
      </div>
    </form>
  );
}

function Field({ label, wide = false, children }) {
  return <label className={wide ? "is-wide" : undefined}>{label}{children}</label>;
}

function describeRecord(row) {
  return `${row.test_name} — ${row.score_text} — ${formatDateTime(row.taken_at)} — H ${row.hunger}/10, D ${row.distractions}/10, W ${row.wakefulness}/10, M ${row.mood}/10`;
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}
