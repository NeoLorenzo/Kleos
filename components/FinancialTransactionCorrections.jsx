"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import styles from "./FinancialTransactionCorrections.module.css";

const INFLOW_SEMANTICS = [
  ["", "No explicit inflow meaning"],
  ["earned_income", "Earned income"],
  ["business_income", "Business / freelance income"],
  ["investment_income", "Investment income"],
  ["trust_distribution", "Trust distribution / owned capital"],
  ["family_support", "Family support"],
  ["internal_transfer", "Internal transfer"],
  ["sale_proceeds", "Sale proceeds"],
  ["refund_reimbursement", "Refund / reimbursement"],
  ["other_inflow", "Other inflow"]
];

const FLOW_TYPES = ["expense", "income", "transfer", "refund", "fee", "interest", "investment", "tax", "zero_value", "unknown"];
const CATEGORY_SUGGESTIONS = [
  "food_dining", "groceries", "transport", "travel", "subscriptions_software", "entertainment",
  "fitness_health", "education", "telecom_utilities", "household", "shopping", "bank_fees",
  "transfers", "currency_exchange", "account_topup", "cash_withdrawal", "income", "interest",
  "investments", "taxes", "other"
];

const SEMANTIC_FLOW = {
  earned_income: "income",
  business_income: "income",
  investment_income: "income",
  trust_distribution: "transfer",
  family_support: "transfer",
  internal_transfer: "transfer",
  sale_proceeds: "transfer",
  refund_reimbursement: "refund",
  other_inflow: "transfer"
};

export default function FinancialTransactionCorrections({ userId }) {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  const loadRows = useCallback(async () => {
    if (!supabase || !userId) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from("financial_transaction_review_queue")
      .select("user_id,transaction_id,status,transaction_date,amount,currency,counterparty_name,merchant_name,description,remittance_information,transaction_note,bank_transaction_code,display_label,normalized_label,flow_type,category,subcategory,is_internal_transfer,is_fx_conversion,is_recurring,economic_inflow_type,interpretation_source,interpretation_override_id,interpretation_rule_id,user_confirmed_at,base_display_label,base_normalized_label,base_flow_type,base_category")
      .eq("user_id", userId)
      .order("transaction_date", { ascending: false })
      .limit(60);

    if (error) {
      setMessage(`Transaction review failed to load: ${error.message || "Unknown error"}`);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const visibleRows = useMemo(() => {
    if (filter === "credits") return rows.filter((row) => Number(row.amount) > 0);
    if (filter === "needs_category") return rows.filter((row) => row.category === "other" || row.flow_type === "unknown");
    if (filter === "confirmed") return rows.filter((row) => row.interpretation_source !== "deterministic");
    return rows;
  }, [filter, rows]);

  const openEditor = (row) => {
    setEditing(row);
    setForm({
      flow_type: row.flow_type || "unknown",
      category: row.category || "other",
      subcategory: row.subcategory || "",
      display_label: row.display_label || "",
      economic_inflow_type: row.economic_inflow_type || "",
      internal_transfer: "auto",
      apply_matching: false
    });
    setMessage("");
  };

  const changeSemantic = (value) => {
    if (!form) return;
    if (!value) {
      setForm({
        ...form,
        economic_inflow_type: "",
        flow_type: editing?.base_flow_type || editing?.flow_type || "unknown",
        category: editing?.base_category || editing?.category || "other",
        internal_transfer: "auto"
      });
      return;
    }
    setForm({
      ...form,
      economic_inflow_type: value,
      flow_type: SEMANTIC_FLOW[value],
      category: value,
      internal_transfer: value === "internal_transfer" ? "yes" : "auto"
    });
  };

  const saveCorrection = async (event) => {
    event.preventDefault();
    if (!supabase || !editing || !form || isSaving) return;
    setIsSaving(true);
    setMessage("");

    const { data, error } = await supabase.rpc("save_financial_transaction_correction", {
      p_transaction_id: editing.transaction_id,
      p_flow_type: form.flow_type || null,
      p_category: form.category.trim() || null,
      p_subcategory: form.subcategory.trim() || null,
      p_display_label: form.display_label.trim() || null,
      p_economic_inflow_type: form.economic_inflow_type || null,
      p_is_internal_transfer: form.internal_transfer === "auto" ? null : form.internal_transfer === "yes",
      p_apply_matching: Boolean(form.apply_matching)
    });

    setIsSaving(false);
    if (error) {
      setMessage(`Correction could not be saved: ${error.message || "Unknown error"}`);
      return;
    }

    const affected = Number(data?.affected_transactions || 1);
    setMessage(`Correction saved${form.apply_matching ? ` and applied to ${affected} matching transaction(s)` : ""}. Refreshing financial analytics…`);
    setEditing(null);
    setForm(null);
    window.location.reload();
  };

  const resetCorrection = async (clearMatchingRule = false) => {
    if (!supabase || !editing || isSaving || editing.interpretation_source === "deterministic") return;
    setIsSaving(true);
    const { error } = await supabase.rpc("clear_financial_transaction_correction", {
      p_transaction_id: editing.transaction_id,
      p_clear_matching_rule: Boolean(clearMatchingRule)
    });
    setIsSaving(false);
    if (error) {
      setMessage(`Correction could not be reset: ${error.message || "Unknown error"}`);
      return;
    }
    window.location.reload();
  };

  return (
    <section className="kleos-card wide-card">
      <div className={styles.headerRow}>
        <div className="section-header">
          <p className="kleos-kicker">User-confirmed interpretation</p>
          <h2>Review Transactions</h2>
          <p>Correct derived meaning without changing the canonical Revolut transaction. Reusable rules match only the same normalized label, currency, and debit/credit direction.</p>
        </div>
        <select className={styles.filter} value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Transaction review filter">
          <option value="all">Recent</option>
          <option value="credits">Credits / inflows</option>
          <option value="needs_category">Needs review</option>
          <option value="confirmed">User-confirmed</option>
        </select>
      </div>

      {isLoading ? <p className="kleos-subtitle">Loading transaction interpretations…</p> : null}
      {!isLoading && !visibleRows.length ? <p className="kleos-subtitle">No transactions match this filter.</p> : null}

      {visibleRows.length ? (
        <div className={styles.list}>
          {visibleRows.map((row) => (
            <article className={styles.row} key={row.transaction_id}>
              <div className={styles.identity}>
                <div className={styles.titleLine}>
                  <strong>{row.display_label || row.counterparty_name || row.description || "Transaction"}</strong>
                  <SourceBadge source={row.interpretation_source} />
                </div>
                <span>{formatDate(row.transaction_date)} · {humanize(row.flow_type)} · {humanize(row.category)}</span>
                {row.economic_inflow_type ? <small>{humanize(row.economic_inflow_type)} · {humanize(independenceLabel(row.economic_inflow_type))}</small> : null}
              </div>
              <div className={styles.amountBlock}>
                <strong>{formatMoney(row.amount, row.currency)}</strong>
                <button type="button" className="secondary-btn" onClick={() => openEditor(row)}>Correct</button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {editing && form ? (
        <form className={styles.editor} onSubmit={saveCorrection}>
          <div className={styles.editorHeader}>
            <div>
              <p className="kleos-kicker">Correction</p>
              <h3>{editing.display_label || editing.counterparty_name || editing.description || "Transaction"}</h3>
              <span>{formatMoney(editing.amount, editing.currency)} · {formatDate(editing.transaction_date)}</span>
            </div>
            <button type="button" className="secondary-btn" onClick={() => { setEditing(null); setForm(null); }}>Cancel</button>
          </div>

          {Number(editing.amount) > 0 ? (
            <label className={styles.field}>
              <span>Inflow meaning</span>
              <select value={form.economic_inflow_type} onChange={(event) => changeSemantic(event.target.value)}>
                {INFLOW_SEMANTICS.map(([value, label]) => <option value={value} key={value || "none"}>{label}</option>)}
              </select>
              <small>This determines whether the inflow counts as independent income, owned-capital draw, support, transfer, sale proceeds, or refund.</small>
            </label>
          ) : null}

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Flow</span>
              <select value={form.flow_type} onChange={(event) => setForm({ ...form, flow_type: event.target.value })}>
                {FLOW_TYPES.map((value) => <option value={value} key={value}>{humanize(value)}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              <span>Category</span>
              <input list="financial-category-suggestions" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
              <datalist id="financial-category-suggestions">
                {CATEGORY_SUGGESTIONS.map((value) => <option value={value} key={value} />)}
              </datalist>
            </label>
            <label className={styles.field}>
              <span>Subcategory</span>
              <input value={form.subcategory} onChange={(event) => setForm({ ...form, subcategory: event.target.value })} placeholder="Optional" />
            </label>
            <label className={styles.field}>
              <span>Display label</span>
              <input value={form.display_label} onChange={(event) => setForm({ ...form, display_label: event.target.value })} />
            </label>
            <label className={styles.field}>
              <span>Internal transfer</span>
              <select value={form.internal_transfer} onChange={(event) => setForm({ ...form, internal_transfer: event.target.value })}>
                <option value="auto">Automatic</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
          </div>

          <label className={styles.ruleToggle}>
            <input type="checkbox" checked={form.apply_matching} onChange={(event) => setForm({ ...form, apply_matching: event.target.checked })} />
            <span>Apply to matching historical and future transactions</span>
          </label>
          <p className={styles.ruleNote}>Match scope: “{editing.base_display_label || editing.display_label}” · {editing.currency} · {Number(editing.amount) >= 0 ? "credit" : "debit"}. No fuzzy matching is used.</p>

          <div className={styles.editorActions}>
            <button type="submit" className="primary-btn" disabled={isSaving}>{isSaving ? "Saving…" : "Save correction"}</button>
            {editing.interpretation_override_id ? (
              <button type="button" className="secondary-btn" disabled={isSaving} onClick={() => void resetCorrection(false)}>
                Reset transaction override
              </button>
            ) : null}
            {editing.interpretation_rule_id ? (
              <button type="button" className="secondary-btn" disabled={isSaving} onClick={() => void resetCorrection(true)}>
                {editing.interpretation_override_id ? "Remove override + matching rule" : "Remove matching rule"}
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {message ? <p className={styles.status}>{message}</p> : null}
    </section>
  );
}

function SourceBadge({ source }) {
  const label = source === "transaction_override" ? "User confirmed" : source === "counterparty_rule" ? "Rule" : "Automatic";
  return <span className={`${styles.sourceBadge} ${source !== "deterministic" ? styles.confirmedBadge : ""}`}>{label}</span>;
}

function independenceLabel(semantic) {
  if (["earned_income", "business_income"].includes(semantic)) return "independent_earned";
  if (semantic === "investment_income") return "independent_investment";
  if (semantic === "trust_distribution") return "owned_capital_distribution";
  if (semantic === "family_support") return "external_support";
  if (semantic === "internal_transfer") return "internal_transfer";
  if (semantic === "sale_proceeds") return "asset_sale";
  if (semantic === "refund_reimbursement") return "refund";
  return "other";
}

function formatMoney(amount, currency) {
  const number = Number(amount);
  if (!Number.isFinite(number)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: String(currency || "EUR").toUpperCase(),
      currencyDisplay: "narrowSymbol"
    }).format(number);
  } catch (_error) {
    return `${number.toFixed(2)} ${currency || ""}`.trim();
  }
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

function humanize(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}
