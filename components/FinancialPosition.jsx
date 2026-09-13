"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import styles from "./FinancialPosition.module.css";

const ASSET_CATEGORIES = [
  "cash_bank",
  "brokerage_investments",
  "trust_beneficial_interest",
  "property",
  "private_company_interest",
  "crypto",
  "vehicle",
  "tangible_valuables",
  "receivable",
  "other"
];

const LIABILITY_CATEGORIES = [
  "mortgage",
  "personal_bank_loan",
  "credit_card",
  "student_debt",
  "tax_liability",
  "bnpl",
  "margin_debt",
  "family_personal_loan",
  "other"
];

const CONTROL_LEVELS = ["direct", "shared", "restricted", "trustee_controlled", "unknown"];
const LIQUIDITY_CLASSES = ["immediate", "within_30_days", "within_1_year", "illiquid", "unknown"];
const VALUATION_METHODS = ["manual_estimate", "statement", "market_price", "appraisal", "nominal", "other"];
const CONFIDENCE_LEVELS = ["low", "medium", "high"];

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function newAssetForm() {
  const today = todayKey();
  return {
    name: "",
    category: "other",
    currency: "EUR",
    ownership_pct: "100",
    control_level: "direct",
    liquidity_class: "unknown",
    started_on: today,
    value: "",
    valuation_date: today,
    valuation_method: "manual_estimate",
    confidence: "medium"
  };
}

function newLiabilityForm() {
  const today = todayKey();
  return {
    name: "",
    category: "other",
    currency: "EUR",
    started_on: today,
    amount: "",
    balance_date: today,
    confidence: "high"
  };
}

export default function FinancialPosition({ userId }) {
  const [position, setPosition] = useState({
    balanceSheet: [],
    assets: [],
    liabilities: [],
    liabilityStatus: null
  });
  const [assetForm, setAssetForm] = useState(newAssetForm);
  const [liabilityForm, setLiabilityForm] = useState(newLiabilityForm);
  const [editingAssetId, setEditingAssetId] = useState(null);
  const [editingLiabilityId, setEditingLiabilityId] = useState(null);
  const [showAssetForm, setShowAssetForm] = useState(false);
  const [showLiabilityForm, setShowLiabilityForm] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");

  const loadPosition = useCallback(async () => {
    if (!supabase || !userId) return;
    setIsLoading(true);
    const results = await Promise.all([
      supabase
        .from("financial_balance_sheet_current")
        .select("user_id,currency,manual_asset_value,bank_asset_value,total_assets,total_liabilities,net_worth,liquid_assets,liquid_net_worth,manual_asset_count,valued_manual_asset_count,bank_account_count,liability_count,valued_liability_count,latest_asset_valuation_date,latest_bank_balance_date,latest_liability_balance_date")
        .eq("user_id", userId)
        .order("currency", { ascending: true }),
      supabase
        .from("financial_current_assets")
        .select("user_id,asset_id,name,category,asset_currency,ownership_pct,control_level,liquidity_class,source_type,started_on,gross_value,currency,ownership_adjusted_value,valuation_date,valuation_method,valuation_source,confidence")
        .eq("user_id", userId)
        .order("name", { ascending: true }),
      supabase
        .from("financial_current_liabilities")
        .select("user_id,liability_id,name,category,liability_currency,source_type,started_on,amount,currency,balance_date,balance_source,confidence")
        .eq("user_id", userId)
        .order("name", { ascending: true }),
      supabase
        .from("financial_liability_status")
        .select("user_id,active_liability_count,positive_balance_liability_count,latest_liability_balance_date,latest_no_known_liabilities_as_of,latest_no_known_liabilities_confirmed_at,affirmative_no_known_liabilities")
        .eq("user_id", userId)
        .maybeSingle()
    ]);

    const error = results.find((result) => result.error)?.error;
    if (error) {
      setStatusMessage(`Financial position failed to load: ${error.message || "Unknown error"}`);
      setIsLoading(false);
      return;
    }

    setPosition({
      balanceSheet: results[0].data || [],
      assets: results[1].data || [],
      liabilities: results[2].data || [],
      liabilityStatus: results[3].data || null
    });
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    void loadPosition();
  }, [loadPosition]);

  const resetAssetForm = () => {
    setAssetForm(newAssetForm());
    setEditingAssetId(null);
    setShowAssetForm(false);
  };

  const resetLiabilityForm = () => {
    setLiabilityForm(newLiabilityForm());
    setEditingLiabilityId(null);
    setShowLiabilityForm(false);
  };

  const saveAsset = async (event) => {
    event.preventDefault();
    if (!supabase || !userId || savingKey) return;
    const name = assetForm.name.trim();
    const currency = assetForm.currency.trim().toUpperCase();
    const ownership = Number(assetForm.ownership_pct);
    const value = assetForm.value === "" ? null : Number(assetForm.value);
    if (!name || !/^[A-Z]{3}$/.test(currency) || !Number.isFinite(ownership) || ownership <= 0 || ownership > 100 || (value !== null && (!Number.isFinite(value) || value < 0))) {
      setStatusMessage("Asset details are incomplete or invalid.");
      return;
    }

    setSavingKey("asset");
    setStatusMessage("");
    const identity = {
      user_id: userId,
      name,
      category: assetForm.category,
      currency,
      ownership_pct: ownership,
      control_level: assetForm.control_level,
      liquidity_class: assetForm.liquidity_class,
      source_type: "manual",
      started_on: assetForm.started_on || assetForm.valuation_date || todayKey(),
      updated_at: new Date().toISOString()
    };

    let assetId = editingAssetId;
    let identityError = null;
    if (editingAssetId) {
      const result = await supabase
        .from("financial_assets")
        .update(identity)
        .eq("id", editingAssetId)
        .eq("user_id", userId)
        .select("id")
        .single();
      identityError = result.error;
      assetId = result.data?.id || editingAssetId;
    } else {
      const result = await supabase
        .from("financial_assets")
        .insert(identity)
        .select("id")
        .single();
      identityError = result.error;
      assetId = result.data?.id || null;
    }

    if (identityError || !assetId) {
      setSavingKey("");
      setStatusMessage(`Asset could not be saved: ${identityError?.message || "Missing asset id"}`);
      return;
    }

    if (value !== null) {
      const { error } = await supabase.from("financial_asset_valuations").insert({
        user_id: userId,
        asset_id: assetId,
        value,
        currency,
        valuation_date: assetForm.valuation_date || todayKey(),
        valuation_method: assetForm.valuation_method,
        valuation_source: "user",
        confidence: assetForm.confidence
      });
      if (error) {
        setSavingKey("");
        setStatusMessage(`Asset saved, but the new valuation was not recorded: ${error.message}`);
        await loadPosition();
        return;
      }
    }

    setSavingKey("");
    setStatusMessage(editingAssetId ? "Asset updated." : "Asset added.");
    resetAssetForm();
    await loadPosition();
  };

  const saveLiability = async (event) => {
    event.preventDefault();
    if (!supabase || !userId || savingKey) return;
    const name = liabilityForm.name.trim();
    const currency = liabilityForm.currency.trim().toUpperCase();
    const amount = liabilityForm.amount === "" ? null : Number(liabilityForm.amount);
    if (!name || !/^[A-Z]{3}$/.test(currency) || (amount !== null && (!Number.isFinite(amount) || amount < 0))) {
      setStatusMessage("Liability details are incomplete or invalid.");
      return;
    }

    setSavingKey("liability");
    setStatusMessage("");
    const identity = {
      user_id: userId,
      name,
      category: liabilityForm.category,
      currency,
      source_type: "manual",
      started_on: liabilityForm.started_on || liabilityForm.balance_date || todayKey(),
      updated_at: new Date().toISOString()
    };

    let liabilityId = editingLiabilityId;
    let identityError = null;
    if (editingLiabilityId) {
      const result = await supabase
        .from("financial_liabilities")
        .update(identity)
        .eq("id", editingLiabilityId)
        .eq("user_id", userId)
        .select("id")
        .single();
      identityError = result.error;
      liabilityId = result.data?.id || editingLiabilityId;
    } else {
      const result = await supabase
        .from("financial_liabilities")
        .insert(identity)
        .select("id")
        .single();
      identityError = result.error;
      liabilityId = result.data?.id || null;
    }

    if (identityError || !liabilityId) {
      setSavingKey("");
      setStatusMessage(`Liability could not be saved: ${identityError?.message || "Missing liability id"}`);
      return;
    }

    if (amount !== null) {
      const { error } = await supabase.from("financial_liability_balances").insert({
        user_id: userId,
        liability_id: liabilityId,
        amount,
        currency,
        balance_date: liabilityForm.balance_date || todayKey(),
        balance_source: "user",
        confidence: liabilityForm.confidence
      });
      if (error) {
        setSavingKey("");
        setStatusMessage(`Liability saved, but the balance observation was not recorded: ${error.message}`);
        await loadPosition();
        return;
      }
    }

    setSavingKey("");
    setStatusMessage(editingLiabilityId ? "Liability updated." : "Liability added.");
    resetLiabilityForm();
    await loadPosition();
  };

  const editAsset = (asset) => {
    setEditingAssetId(asset.asset_id);
    setAssetForm({
      name: asset.name || "",
      category: asset.category || "other",
      currency: asset.asset_currency || asset.currency || "EUR",
      ownership_pct: String(asset.ownership_pct ?? 100),
      control_level: asset.control_level || "unknown",
      liquidity_class: asset.liquidity_class || "unknown",
      started_on: asset.started_on || todayKey(),
      value: "",
      valuation_date: todayKey(),
      valuation_method: asset.valuation_method || "manual_estimate",
      confidence: asset.confidence || "medium"
    });
    setShowAssetForm(true);
  };

  const editLiability = (liability) => {
    setEditingLiabilityId(liability.liability_id);
    setLiabilityForm({
      name: liability.name || "",
      category: liability.category || "other",
      currency: liability.liability_currency || liability.currency || "EUR",
      started_on: liability.started_on || todayKey(),
      amount: "",
      balance_date: todayKey(),
      confidence: liability.confidence || "high"
    });
    setShowLiabilityForm(true);
  };

  const archiveRecord = async (table, idColumn, id, label) => {
    if (!supabase || !userId || savingKey) return;
    setSavingKey(`${table}:${id}`);
    const { error } = await supabase
      .from(table)
      .update({ ended_on: todayKey(), updated_at: new Date().toISOString() })
      .eq(idColumn, id)
      .eq("user_id", userId);
    setSavingKey("");
    if (error) {
      setStatusMessage(`${label} could not be archived: ${error.message}`);
      return;
    }
    setStatusMessage(`${label} archived; historical observations were preserved.`);
    await loadPosition();
  };

  const confirmNoKnownLiabilities = async () => {
    if (!supabase || !userId || savingKey || position.liabilities.length) return;
    setSavingKey("attestation");
    const { error } = await supabase.from("financial_liability_attestations").insert({
      user_id: userId,
      attestation_type: "no_known_liabilities",
      scope: "personal",
      as_of_date: todayKey()
    });
    setSavingKey("");
    if (error) {
      setStatusMessage(`Liability attestation could not be recorded: ${error.message}`);
      return;
    }
    setStatusMessage("No-known-liabilities attestation recorded for today.");
    await loadPosition();
  };

  const attestedToday = position.liabilityStatus?.latest_no_known_liabilities_as_of === todayKey();

  return (
    <section className="kleos-card wide-card">
      <div className={styles.headerRow}>
        <div className="section-header">
          <p className="kleos-kicker">Balance Sheet</p>
          <h2>Financial Position</h2>
          <p>Manual assets and liabilities combine with synchronized bank cash. Every total remains currency-native; currencies are never silently converted.</p>
        </div>
        <div className={styles.actions}>
          <button type="button" className="secondary-btn" onClick={() => { setShowAssetForm(true); setEditingAssetId(null); setAssetForm(newAssetForm()); }}>Add Asset</button>
          <button type="button" className="secondary-btn" onClick={() => { setShowLiabilityForm(true); setEditingLiabilityId(null); setLiabilityForm(newLiabilityForm()); }}>Add Liability</button>
        </div>
      </div>

      {isLoading ? <p className="kleos-subtitle">Loading financial position…</p> : null}

      {position.balanceSheet.length ? (
        <div className={styles.balanceGrid}>
          {position.balanceSheet.map((row) => (
            <article className={styles.currencyCard} key={row.currency}>
              <div className={styles.currencyTitle}>
                <strong>{row.currency}</strong>
                <span>{Number(row.manual_asset_count || 0)} manual asset(s) · {Number(row.bank_account_count || 0)} synced account(s)</span>
              </div>
              <div className={styles.metricGrid}>
                <MiniMetric label="Net worth" value={formatMoney(row.net_worth, row.currency)} />
                <MiniMetric label="Assets" value={formatMoney(row.total_assets, row.currency)} />
                <MiniMetric label="Liabilities" value={formatMoney(row.total_liabilities, row.currency)} />
                <MiniMetric label="Liquid assets" value={formatMoney(row.liquid_assets, row.currency)} />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="kleos-subtitle">No balance-sheet observations yet. Add an asset or liability; synchronized bank cash will appear automatically when available.</p>
      )}

      <div className={styles.columns}>
        <div>
          <div className={styles.subheader}>
            <div>
              <h3>Assets</h3>
              <p>Manual assets only. Revolut balances above are bank-synced and should not be duplicated here.</p>
            </div>
          </div>
          {position.assets.length ? (
            <div className={styles.recordList}>
              {position.assets.map((asset) => (
                <article className={styles.recordCard} key={asset.asset_id}>
                  <div>
                    <strong>{asset.name}</strong>
                    <span>{humanize(asset.category)} · {humanize(asset.control_level)} · {humanize(asset.liquidity_class)}</span>
                    <small>{Number(asset.ownership_pct).toFixed(0)}% ownership · {asset.valuation_date ? `valued ${formatDate(asset.valuation_date)}` : "no valuation yet"}</small>
                  </div>
                  <div className={styles.recordValue}>
                    <strong>{asset.ownership_adjusted_value == null ? "Unvalued" : formatMoney(asset.ownership_adjusted_value, asset.currency || asset.asset_currency)}</strong>
                    <div className={styles.recordActions}>
                      <button type="button" className="secondary-btn" onClick={() => editAsset(asset)}>Edit</button>
                      <button type="button" className="secondary-btn" onClick={() => void archiveRecord("financial_assets", "id", asset.asset_id, "Asset")}>Archive</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="kleos-subtitle">No manual assets recorded.</p>}
        </div>

        <div>
          <div className={styles.subheader}>
            <div>
              <h3>Liabilities</h3>
              <p>Debt absence requires affirmative evidence; an empty list alone is treated as unknown.</p>
            </div>
          </div>
          {position.liabilities.length ? (
            <div className={styles.recordList}>
              {position.liabilities.map((liability) => (
                <article className={styles.recordCard} key={liability.liability_id}>
                  <div>
                    <strong>{liability.name}</strong>
                    <span>{humanize(liability.category)}</span>
                    <small>{liability.balance_date ? `balance observed ${formatDate(liability.balance_date)}` : "no balance observation yet"}</small>
                  </div>
                  <div className={styles.recordValue}>
                    <strong>{liability.amount == null ? "Unvalued" : formatMoney(liability.amount, liability.currency || liability.liability_currency)}</strong>
                    <div className={styles.recordActions}>
                      <button type="button" className="secondary-btn" onClick={() => editLiability(liability)}>Edit</button>
                      <button type="button" className="secondary-btn" onClick={() => void archiveRecord("financial_liabilities", "id", liability.liability_id, "Liability")}>Archive</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.attestationBox}>
              <strong>{position.liabilityStatus?.affirmative_no_known_liabilities ? "No known personal liabilities" : "No liabilities recorded"}</strong>
              <p>
                {position.liabilityStatus?.affirmative_no_known_liabilities
                  ? `Affirmatively confirmed as of ${formatDate(position.liabilityStatus.latest_no_known_liabilities_as_of)}.`
                  : "This is currently missing evidence, not evidence of zero debt."}
              </p>
              <button type="button" className="secondary-btn" onClick={() => void confirmNoKnownLiabilities()} disabled={savingKey === "attestation" || attestedToday}>
                {attestedToday ? "Confirmed today" : savingKey === "attestation" ? "Recording…" : "Confirm no known liabilities today"}
              </button>
            </div>
          )}
        </div>
      </div>

      {showAssetForm ? (
        <PositionForm title={editingAssetId ? "Edit asset" : "Add asset"} onSubmit={saveAsset} onCancel={resetAssetForm} saving={savingKey === "asset"}>
          <Field label="Name"><input value={assetForm.name} onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })} required /></Field>
          <Field label="Category"><Select value={assetForm.category} options={ASSET_CATEGORIES} onChange={(value) => setAssetForm({ ...assetForm, category: value })} /></Field>
          <Field label="Currency"><input value={assetForm.currency} maxLength="3" disabled={Boolean(editingAssetId)} onChange={(e) => setAssetForm({ ...assetForm, currency: e.target.value.toUpperCase() })} required /></Field>
          <Field label="Ownership %"><input type="number" min="0.01" max="100" step="0.01" value={assetForm.ownership_pct} onChange={(e) => setAssetForm({ ...assetForm, ownership_pct: e.target.value })} required /></Field>
          <Field label="Control"><Select value={assetForm.control_level} options={CONTROL_LEVELS} onChange={(value) => setAssetForm({ ...assetForm, control_level: value })} /></Field>
          <Field label="Liquidity"><Select value={assetForm.liquidity_class} options={LIQUIDITY_CLASSES} onChange={(value) => setAssetForm({ ...assetForm, liquidity_class: value })} /></Field>
          <Field label="Owned since"><input type="date" value={assetForm.started_on} onChange={(e) => setAssetForm({ ...assetForm, started_on: e.target.value })} required /></Field>
          <Field label={editingAssetId ? "New value (optional)" : "Current value (optional)"}><input type="number" min="0" step="0.01" value={assetForm.value} onChange={(e) => setAssetForm({ ...assetForm, value: e.target.value })} /></Field>
          <Field label="Valuation date"><input type="date" value={assetForm.valuation_date} onChange={(e) => setAssetForm({ ...assetForm, valuation_date: e.target.value })} /></Field>
          <Field label="Valuation method"><Select value={assetForm.valuation_method} options={VALUATION_METHODS} onChange={(value) => setAssetForm({ ...assetForm, valuation_method: value })} /></Field>
          <Field label="Confidence"><Select value={assetForm.confidence} options={CONFIDENCE_LEVELS} onChange={(value) => setAssetForm({ ...assetForm, confidence: value })} /></Field>
        </PositionForm>
      ) : null}

      {showLiabilityForm ? (
        <PositionForm title={editingLiabilityId ? "Edit liability" : "Add liability"} onSubmit={saveLiability} onCancel={resetLiabilityForm} saving={savingKey === "liability"}>
          <Field label="Name"><input value={liabilityForm.name} onChange={(e) => setLiabilityForm({ ...liabilityForm, name: e.target.value })} required /></Field>
          <Field label="Category"><Select value={liabilityForm.category} options={LIABILITY_CATEGORIES} onChange={(value) => setLiabilityForm({ ...liabilityForm, category: value })} /></Field>
          <Field label="Currency"><input value={liabilityForm.currency} maxLength="3" disabled={Boolean(editingLiabilityId)} onChange={(e) => setLiabilityForm({ ...liabilityForm, currency: e.target.value.toUpperCase() })} required /></Field>
          <Field label="Liability since"><input type="date" value={liabilityForm.started_on} onChange={(e) => setLiabilityForm({ ...liabilityForm, started_on: e.target.value })} required /></Field>
          <Field label={editingLiabilityId ? "New balance (optional)" : "Current balance (optional)"}><input type="number" min="0" step="0.01" value={liabilityForm.amount} onChange={(e) => setLiabilityForm({ ...liabilityForm, amount: e.target.value })} /></Field>
          <Field label="Balance date"><input type="date" value={liabilityForm.balance_date} onChange={(e) => setLiabilityForm({ ...liabilityForm, balance_date: e.target.value })} /></Field>
          <Field label="Confidence"><Select value={liabilityForm.confidence} options={CONFIDENCE_LEVELS} onChange={(value) => setLiabilityForm({ ...liabilityForm, confidence: value })} /></Field>
        </PositionForm>
      ) : null}

      {statusMessage ? <p className={styles.status}>{statusMessage}</p> : null}
    </section>
  );
}

function PositionForm({ title, onSubmit, onCancel, saving, children }) {
  return (
    <form className={styles.formPanel} onSubmit={onSubmit}>
      <div className={styles.formHeader}>
        <h3>{title}</h3>
        <button type="button" className="secondary-btn" onClick={onCancel}>Cancel</button>
      </div>
      <div className={styles.formGrid}>{children}</div>
      <div className={styles.formActions}>
        <button type="submit" className="primary-btn" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}

function Field({ label, children }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>;
}

function Select({ value, options, onChange }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => <option value={option} key={option}>{humanize(option)}</option>)}
    </select>
  );
}

function MiniMetric({ label, value }) {
  return <div className={styles.metric}><span>{label}</span><strong>{value}</strong></div>;
}

function formatMoney(amount, currency) {
  const number = Number(amount);
  if (!Number.isFinite(number)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: String(currency || "EUR").toUpperCase(), currencyDisplay: "narrowSymbol" }).format(number);
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
