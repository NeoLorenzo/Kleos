"use client";

import { useEffect, useMemo, useState } from "react";
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

  if (!authorized) return null;

  return (
    <>
      <button className="fs-app-button is-secondary correction-launcher" type="button" onClick={() => setOpen(true)}>
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
            className="fs-app-modal correction-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Correct recorded measurements"
          >
            <header className="fs-app-modal-header">
              <div className="correction-heading">
                <h2>Correct recorded measurements</h2>
                <p>Edit or delete canonical cognitive history. Strength evidence is read-only from Heracles.</p>
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

            {editingId && draft ? (
              <EditForm
                draft={draft}
                setDraft={setDraft}
                onSubmit={saveEdit}
                onCancel={cancelEdit}
                disabled={loading}
                status={status}
              />
            ) : (
              <div className="fs-app-modal-body">
                {status ? <p className="correction-status">{status}</p> : null}
                {loading ? <p className="correction-status">Loading…</p> : null}
                <div className="correction-groups">
                  <RecordGroup
                    rows={sortedRecords}
                    onEdit={beginEdit}
                    onDelete={deleteRecord}
                    disabled={loading}
                  />
                </div>
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
        }
        .correction-backdrop {
          position: fixed;
          inset: 0;
          z-index: 40;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: rgba(0, 0, 0, 0.62);
        }
        .correction-modal {
          width: min(var(--fs-app-modal-max-width), calc(100vw - 32px));
        }
        .correction-heading {
          min-width: 0;
        }
        .correction-heading p,
        .correction-status {
          margin: 4px 0 0;
          color: var(--fs-app-text-muted);
          font-size: var(--fs-app-type-body-size);
          line-height: var(--fs-app-type-body-line-height);
        }
        .correction-groups {
          display: grid;
          gap: var(--fs-space-4);
        }
        .correction-group h3 {
          margin: 0 0 var(--fs-space-3);
          color: var(--fs-app-text);
          font-size: var(--fs-app-type-section-title-size);
          font-weight: var(--fs-app-type-section-title-weight);
        }
        .correction-list {
          display: grid;
          gap: var(--fs-space-2);
        }
        .correction-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--fs-space-3);
          padding: 11px 12px;
          border: var(--fs-border-width) solid var(--fs-app-border);
          border-radius: var(--fs-radius-control);
          background: var(--fs-app-surface-raised);
        }
        .correction-row-text {
          min-width: 0;
          overflow-wrap: anywhere;
          color: var(--fs-app-text-secondary);
          font-size: var(--fs-app-type-body-size);
        }
        .correction-actions {
          display: flex;
          flex: 0 0 auto;
          gap: var(--fs-space-2);
        }
        .correction-delete {
          color: var(--fs-app-danger);
        }
        .correction-empty {
          color: var(--fs-app-text-muted);
          font-size: var(--fs-app-type-body-size);
        }
        .correction-form {
          min-height: 0;
          display: contents;
        }
        .correction-form-body {
          display: grid;
          gap: var(--fs-space-3);
        }
        .correction-form-body label {
          display: grid;
          gap: 6px;
          color: var(--fs-app-text-secondary);
          font-size: var(--fs-app-type-metadata-size);
          font-weight: var(--fs-app-type-metadata-weight);
        }
        @media (max-width: 640px) {
          .correction-backdrop {
            align-items: flex-end;
            padding: 0;
          }
          .correction-modal {
            width: 100%;
            max-height: 92vh;
            border-bottom-right-radius: 0;
            border-bottom-left-radius: 0;
          }
          .correction-launcher {
            right: 12px;
            bottom: 12px;
          }
          .correction-row {
            align-items: flex-start;
            flex-direction: column;
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
              <div className="correction-row-text">{describeRecord(row)}</div>
              <div className="correction-actions">
                <button type="button" className="fs-app-button is-secondary" onClick={() => onEdit(row)} disabled={disabled}>
                  Edit
                </button>
                <button type="button" className="fs-app-button is-ghost correction-delete" onClick={() => onDelete(row)} disabled={disabled}>
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

function EditForm({ draft, setDraft, onSubmit, onCancel, disabled, status }) {
  const setField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));

  return (
    <form className="correction-form" onSubmit={onSubmit}>
      <div className="fs-app-modal-body correction-form-body">
        {status ? <p className="correction-status">{status}</p> : null}
        <h3 className="fs-app-card-title">Edit cognitive test</h3>
        <Field label="Test">
          <input className="fs-app-control" value={draft.testName} onChange={(event) => setField("testName", event.target.value)} />
        </Field>
        <Field label="Score">
          <input className="fs-app-control" value={draft.score} onChange={(event) => setField("score", event.target.value)} />
        </Field>
        <Field label="Date/time">
          <input className="fs-app-control" type="datetime-local" value={draft.takenAt} onChange={(event) => setField("takenAt", event.target.value)} />
        </Field>
        {["hunger", "distractions", "wakefulness", "mood"].map((field) => (
          <Field key={field} label={`${field[0].toUpperCase()}${field.slice(1)} /10`}>
            <input
              className="fs-app-control"
              type="number"
              min="0"
              max="10"
              step="1"
              value={draft[field]}
              onChange={(event) => setField(field, event.target.value)}
            />
          </Field>
        ))}
      </div>
      <footer className="fs-app-modal-footer">
        <button type="button" className="fs-app-button is-secondary" onClick={onCancel} disabled={disabled}>Cancel</button>
        <button type="submit" className="fs-app-button is-primary" disabled={disabled}>Save correction</button>
      </footer>
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
