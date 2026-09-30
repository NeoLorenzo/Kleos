"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import DimensionState from "@/components/DimensionState";
import SectionHeading from "@/components/SectionHeading";
import StatusToast from "@/components/StatusToast";
import { supabase } from "@/lib/supabase/client";
import { AUTHORIZED_KLEOS_EMAIL } from "@/lib/kleos/data";
import styles from "./FinancialWorkspace.module.css";

const EMPTY_ANALYTICS = {
  monthly: [],
  categories: [],
  rolling: [],
  recurring: [],
  coverage: [],
  topMerchants: [],
  classificationsByTransaction: {}
};

const EMPTY_DATA = {
  connection: null,
  accounts: [],
  balancesByAccount: {},
  transactions: [],
  analytics: EMPTY_ANALYTICS
};

export default function FinancialWorkspace() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const [accessState, setAccessState] = useState("loading");
  const [user, setUser] = useState(null);
  const [finance, setFinance] = useState(EMPTY_DATA);
  const [selectedCurrency, setSelectedCurrency] = useState("EUR");
  const [merchantView, setMerchantView] = useState("recurring");
  const [statusMessage, setStatusMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const callbackHandled = useRef(false);

  const loadFinance = useCallback(async (userId, options = {}) => {
    if (!supabase || !userId) return;
    const silent = Boolean(options.silent);
    if (!silent) {
      setIsLoading(true);
      setStatusMessage("Loading financial evidence...");
    }

    try {
      const { data: connections, error: connectionError } = await supabase
        .from("financial_bank_connections")
        .select("id,provider,institution_id,institution_name,institution_country,requisition_status,provider_session_id,consent_valid_until,connected_at,last_synced_at,last_error_code,last_error_at,created_at")
        .eq("user_id", userId)
        .eq("provider", "enable_banking")
        .order("created_at", { ascending: false })
        .limit(10);
      if (connectionError) throw connectionError;

      const connection = selectPreferredConnection(connections);
      if (!connection) {
        setFinance(EMPTY_DATA);
        if (!silent) setStatusMessage("");
        return;
      }

      const { data: accounts, error: accountsError } = await supabase
        .from("financial_accounts")
        .select("id,connection_id,provider_account_id,provider_status,account_name,owner_name,currency,cash_account_type,masked_identifier,is_current,last_synced_at")
        .eq("user_id", userId)
        .eq("connection_id", connection.id)
        .eq("is_current", true)
        .order("currency", { ascending: true });
      if (accountsError) throw accountsError;

      const currentAccounts = accounts || [];
      const accountIds = currentAccounts.map((account) => account.id);
      const currencies = uniqueCurrencies(currentAccounts);
      setSelectedCurrency((current) => currencies.includes(current) ? current : (currencies[0] || "EUR"));

      let balances = [];
      let transactions = [];
      let analytics = EMPTY_ANALYTICS;

      if (accountIds.length) {
        const results = await Promise.all([
          supabase
            .from("financial_account_balances")
            .select("id,account_id,balance_type,amount,currency,reference_date,provider_changed_at,observed_at")
            .eq("user_id", userId)
            .in("account_id", accountIds)
            .order("observed_at", { ascending: false })
            .limit(Math.max(accountIds.length * 12, 60)),
          supabase
            .from("financial_transactions")
            .select("id,account_id,status,booking_date,value_date,amount,currency,counterparty_name,merchant_name,description,remittance_information,transaction_note,bank_transaction_code,bank_transaction_subcode,bank_transaction_description,provider_reference_number,first_seen_at,last_seen_at")
            .eq("user_id", userId)
            .in("account_id", accountIds)
            .order("last_seen_at", { ascending: false })
            .limit(100),
          supabase
            .from("financial_cash_flow_monthly")
            .select("user_id,month,currency,income_amount,refund_amount,spending_amount,investment_net,net_cash_flow,transfer_in,transfer_out,unknown_count,transaction_count")
            .eq("user_id", userId)
            .order("month", { ascending: false })
            .limit(240),
          supabase
            .from("financial_spending_by_category")
            .select("user_id,month,currency,category,spending_amount,transaction_count")
            .eq("user_id", userId)
            .order("month", { ascending: false })
            .limit(600),
          supabase
            .from("financial_cash_flow_rolling")
            .select("user_id,currency,window_days,income_amount,refund_amount,spending_amount,net_cash_flow,unknown_count,transaction_count")
            .eq("user_id", userId)
            .order("window_days", { ascending: true }),
          supabase
            .from("financial_recurring_expenses")
            .select("user_id,currency,normalized_label,display_label,category,typical_amount,recurrence_interval_days,detected_occurrences,first_transaction_date,last_transaction_date,annualized_estimate,active_recently")
            .eq("user_id", userId)
            .eq("active_recently", true)
            .order("annualized_estimate", { ascending: false })
            .limit(80),
          supabase
            .from("financial_classification_coverage")
            .select("user_id,currency,total_transactions,classified_transactions,unknown_transactions,spending_transactions,other_category_transactions,fx_transactions,transfer_transactions,zero_value_transactions,flow_coverage_pct,spending_category_coverage_pct")
            .eq("user_id", userId),
          supabase
            .from("financial_top_merchants")
            .select("user_id,currency,normalized_label,display_label,category,spending_amount,transaction_count,last_transaction_date")
            .eq("user_id", userId)
            .order("spending_amount", { ascending: false })
            .limit(80)
        ]);

        for (const result of results) if (result.error) throw result.error;

        const [balanceResult, transactionResult, monthlyResult, categoryResult, rollingResult, recurringResult, coverageResult, topMerchantResult] = results;
        balances = balanceResult.data || [];
        transactions = transactionResult.data || [];

        const transactionIds = transactions.map((transaction) => transaction.id);
        let classifications = [];
        if (transactionIds.length) {
          const classificationResult = await supabase
            .from("financial_transaction_classifications")
            .select("transaction_id,display_label,normalized_label,flow_type,category,subcategory,is_internal_transfer,is_fx_conversion,is_recurring,classifier_version,confidence,classification_reason")
            .eq("user_id", userId)
            .in("transaction_id", transactionIds);
          if (classificationResult.error) throw classificationResult.error;
          classifications = classificationResult.data || [];
        }

        analytics = {
          monthly: monthlyResult.data || [],
          categories: categoryResult.data || [],
          rolling: rollingResult.data || [],
          recurring: recurringResult.data || [],
          coverage: coverageResult.data || [],
          topMerchants: topMerchantResult.data || [],
          classificationsByTransaction: Object.fromEntries(
            classifications.map((classification) => [classification.transaction_id, classification])
          )
        };
      }

      setFinance({
        connection,
        accounts: currentAccounts,
        balancesByAccount: latestBalancesByAccount(balances),
        transactions: sortTransactions(transactions),
        analytics
      });
      if (!silent) setStatusMessage("");
    } catch (error) {
      if (!silent) setStatusMessage(`Financial data failed to load: ${errorMessage(error)}`);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  const syncConnection = useCallback(async (connectionId) => {
    if (!supabase || !user?.id || !connectionId || isSyncing) return false;
    setIsSyncing(true);
    setStatusMessage("Syncing Revolut financial evidence through Enable Banking...");

    const { data, error } = await supabase.functions.invoke("sync-financial-bank", {
      body: { action: "sync", connectionId }
    });

    setIsSyncing(false);
    if (error) {
      setStatusMessage(
        "Revolut sync did not complete. Existing financial evidence was preserved. " + errorMessage(error)
      );
      return false;
    }

    await loadFinance(user.id, { silent: true });
    setStatusMessage(`Revolut synced: ${Number(data?.account_count || 0)} account(s), ${Number(data?.transaction_count || 0)} transaction record(s).`);
    return true;
  }, [isSyncing, loadFinance, user?.id]);

  const finalizeAuthorization = useCallback(async ({ code, state }) => {
    if (!supabase || !user?.id || !code || !state || isSyncing) return;
    setIsSyncing(true);
    setStatusMessage("Finalizing Revolut authorization and importing financial evidence...");

    const { data, error } = await supabase.functions.invoke("sync-financial-bank", {
      body: { action: "finalize", code, state }
    });

    setIsSyncing(false);
    if (error) {
      setStatusMessage("Revolut authorization returned, but the financial import did not complete. " + errorMessage(error));
      return;
    }

    await loadFinance(user.id, { silent: true });
    setStatusMessage(`Revolut connected: ${Number(data?.account_count || 0)} account(s), ${Number(data?.transaction_count || 0)} transaction record(s) imported.`);
  }, [isSyncing, loadFinance, user?.id]);

  useEffect(() => {
    if (!supabase) {
      setAccessState("unconfigured");
      return undefined;
    }

    let active = true;
    const handleUser = async (nextUser) => {
      if (!active) return;
      const email = String(nextUser?.email || "").trim().toLowerCase();
      if (!nextUser) {
        setUser(null);
        setAccessState("signed-out");
        setFinance(EMPTY_DATA);
        return;
      }
      if (email !== AUTHORIZED_KLEOS_EMAIL) {
        setUser(nextUser);
        setAccessState("unauthorized");
        setFinance(EMPTY_DATA);
        return;
      }
      setUser(nextUser);
      setAccessState("authorized");
      await loadFinance(nextUser.id);
    };

    void supabase.auth.getUser().then(({ data }) => handleUser(data?.user || null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void handleUser(session?.user || null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadFinance]);

  useEffect(() => {
    if (accessState !== "authorized" || !user?.id || callbackHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const providerError = params.get("error");
    const providerErrorDescription = params.get("error_description");
    if (!code && !providerError) return;

    callbackHandled.current = true;
    const cleanCallbackUrl = () => {
      window.history.replaceState({}, "", `${window.location.origin}${window.location.pathname}`);
    };

    if (providerError) {
      setStatusMessage(`Revolut authorization was not completed${providerErrorDescription ? `: ${providerErrorDescription}` : "."}`);
      if (state) {
        void supabase.functions.invoke("sync-financial-bank", {
          body: { action: "authorization-error", state, error: providerError }
        }).finally(cleanCallbackUrl);
      } else {
        cleanCallbackUrl();
      }
      return;
    }

    void finalizeAuthorization({ code, state }).finally(cleanCallbackUrl);
  }, [accessState, finalizeAuthorization, user?.id]);

  const signIn = async () => {
    if (!supabase) return;
    setStatusMessage("");
    const redirectTo = typeof window !== "undefined"
      ? `${window.location.origin}${basePath}/financial/`
      : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, queryParams: { prompt: "select_account" } }
    });
    if (error) setStatusMessage(error.message || "Google sign-in failed.");
  };


  const connectRevolut = async () => {
    if (!supabase || !user?.id || isConnecting) return;
    setIsConnecting(true);
    setStatusMessage("Creating a secure read-only Revolut authorization through Enable Banking...");
    const redirectUrl = `${window.location.origin}${window.location.pathname}`;
    const { data, error } = await supabase.functions.invoke("sync-financial-bank", {
      body: { action: "connect", country: "PT", redirectUrl }
    });
    if (error || !data?.authorization_url) {
      setIsConnecting(false);
      setStatusMessage(`Revolut connection could not be started: ${errorMessage(error)}`);
      return;
    }
    window.location.assign(data.authorization_url);
  };

  const currentConnection = finance.connection;
  const currentAccounts = finance.accounts;
  const currencies = uniqueCurrencies(currentAccounts);
  const currentMonth = currentMonthKey();
  const monthlyRows = finance.analytics.monthly.filter((row) => row.currency === selectedCurrency);
  const currentMonthSummary = monthlyRows.find((row) => String(row.month).slice(0, 10) === currentMonth) || null;
  const categoryRows = finance.analytics.categories
    .filter((row) => row.currency === selectedCurrency && String(row.month).slice(0, 10) === currentMonth)
    .sort((left, right) => Number(right.spending_amount) - Number(left.spending_amount));
  const coverage = finance.analytics.coverage.find((row) => row.currency === selectedCurrency) || null;
  const recurringRows = finance.analytics.recurring.filter((row) => row.currency === selectedCurrency).slice(0, 8);
  const topMerchantRows = finance.analytics.topMerchants.filter((row) => row.currency === selectedCurrency).slice(0, 8);
  const trendRows = [...monthlyRows]
    .sort((left, right) => String(right.month).localeCompare(String(left.month)))
    .slice(0, 6);
  const rolling30 = rollingWindow(finance.analytics.rolling, selectedCurrency, 30);
  const rolling90 = rollingWindow(finance.analytics.rolling, selectedCurrency, 90);
  const rolling365 = rollingWindow(finance.analytics.rolling, selectedCurrency, 365);
  const categoryTotal = categoryRows.reduce((sum, row) => sum + Number(row.spending_amount || 0), 0);

  const accessGate = renderAccessGate({ accessState, user, statusMessage, onSignIn: signIn });
  const connectionState = currentConnection ? connectionLabel(currentConnection) : "Not connected";
  const connectionTone =
    connectionState === "Connected"
      ? "is-success"
      : connectionState === "Reauthorization required"
        ? "is-warning"
        : "is-quiet";
  const maxCategory = categoryRows.reduce((max, row) => Math.max(max, Number(row.spending_amount || 0)), 0);
  const maxTrend = trendRows.reduce(
    (max, row) => Math.max(max, Number(row.income_amount || 0), Number(row.spending_amount || 0)),
    0
  );
  const lowCoverage = coverage && Number(coverage.spending_category_coverage_pct || 0) < 85;
  const merchantRows = merchantView === "recurring" ? recurringRows : topMerchantRows;

  return (
    <main className="kleos-shell">
      <section className="kleos-board">
        {accessGate || (
          <div className="kleos-scroll">
            <DimensionState userId={user.id} vectorId="financial">
              {currentAccounts.length ? (
                <section className="fs-app-card kleos-card">
                  <SectionHeading
                    title="Cash Flow"
                    sub={`${formatMonthLabel(currentMonth)} to date`}
                    hint={
                      <>
                        Economic cash flow excludes transfers, internal FX conversions, ATM cash movements, and
                        zero-value authorization records.
                        {currentMonthSummary && (Number(currentMonthSummary.transfer_in) || Number(currentMonthSummary.transfer_out)) ? (
                          <> Transfers excluded from cash-flow KPIs this month: {formatMoney(currentMonthSummary.transfer_in || 0, selectedCurrency)} in · {formatMoney(currentMonthSummary.transfer_out || 0, selectedCurrency)} out.</>
                        ) : null}
                        {coverage ? (
                          <> Flow classification {formatPercent(coverage.flow_coverage_pct)} · specific spending categories {formatPercent(coverage.spending_category_coverage_pct)} · {Number(coverage.fx_transactions || 0)} FX records excluded.</>
                        ) : null}
                      </>
                    }
                  >
                    {currencies.length > 1 ? (
                      <div className="kleos-segmented" role="group" aria-label="Cash-flow currency">
                        {currencies.map((currency) => (
                          <button
                            type="button"
                            key={currency}
                            aria-pressed={currency === selectedCurrency}
                            onClick={() => setSelectedCurrency(currency)}
                          >
                            {currency}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </SectionHeading>

                  <div className="kleos-stats">
                    <Metric label="Income · month" value={formatMoney(currentMonthSummary?.income_amount || 0, selectedCurrency)} />
                    <Metric label="Spending · month" value={formatMoney(currentMonthSummary?.spending_amount || 0, selectedCurrency)} />
                    <Metric
                      label="Net cash flow · month"
                      value={formatSignedMoney(currentMonthSummary?.net_cash_flow || 0, selectedCurrency)}
                      tone={Number(currentMonthSummary?.net_cash_flow || 0) > 0 ? "positive" : ""}
                    />
                    <Metric label="Refunds · month" value={formatMoney(currentMonthSummary?.refund_amount || 0, selectedCurrency)} />
                  </div>
                  <dl className={styles.rollingRow}>
                    <div><dt>30-day spend</dt><dd>{formatMoney(rolling30?.spending_amount || 0, selectedCurrency)}</dd></div>
                    <div><dt>90-day spend</dt><dd>{formatMoney(rolling90?.spending_amount || 0, selectedCurrency)}</dd></div>
                    <div><dt>365-day spend</dt><dd>{formatMoney(rolling365?.spending_amount || 0, selectedCurrency)}</dd></div>
                  </dl>
                  {lowCoverage ? (
                    <p className="kleos-note is-warning">
                      Only {formatPercent(coverage.spending_category_coverage_pct)} of spending has a specific category this month, so category totals are incomplete.
                    </p>
                  ) : null}
                </section>
              ) : null}

              {currentAccounts.length ? (
                <section className="fs-app-card kleos-card">
                  <SectionHeading
                    title="Spending"
                    sub={`${formatMonthLabel(currentMonth)} · ${selectedCurrency}`}
                    hint="Gross booked spending by deterministic transaction category. Refunds are tracked separately rather than counted as income."
                  />
                  <div className={styles.analyticsColumns}>
                    <div>
                      <h3 className="kleos-subheading">By category</h3>
                      {categoryRows.length ? (
                        <div className={styles.categoryList}>
                          {categoryRows.slice(0, 8).map((row) => {
                            const amount = Number(row.spending_amount || 0);
                            const share = categoryTotal > 0 ? (amount / categoryTotal) * 100 : 0;
                            const width = maxCategory > 0 ? (amount / maxCategory) * 100 : 0;
                            return (
                              <div
                                className={styles.categoryRow}
                                key={`${row.month}-${row.currency}-${row.category}`}
                                title={`${Number(row.transaction_count || 0)} transaction(s) · ${share.toFixed(1)}% of spending`}
                              >
                                <span className={styles.categoryName}>{humanize(row.category)}</span>
                                <div className={styles.categoryTrack} aria-hidden="true">
                                  <span className={styles.categoryFill} style={{ width: `${Math.max(2, Math.min(100, width))}%` }} />
                                </div>
                                <strong>{formatMoney(amount, selectedCurrency)}</strong>
                              </div>
                            );
                          })}
                        </div>
                      ) : <p className="kleos-subtitle">No booked spending in this currency for the current month.</p>}
                    </div>
                    <div>
                      <div className={styles.trendHead}>
                        <h3 className="kleos-subheading">Last {trendRows.length} months</h3>
                        {trendRows.length ? (
                          <div className={styles.trendLegend} aria-hidden="true">
                            <span><i className={styles.trendIncome} />Income</span>
                            <span><i className={styles.trendSpend} />Spend</span>
                          </div>
                        ) : null}
                      </div>
                      {trendRows.length ? (
                        <div className={styles.trendChart}>
                          {[...trendRows].reverse().map((row) => (
                            <div
                              className={styles.trendMonth}
                              key={`bar-${row.month}`}
                              title={`${formatMonthLabel(row.month)}: income ${formatMoney(row.income_amount, selectedCurrency)}, spend ${formatMoney(row.spending_amount, selectedCurrency)}, net ${formatSignedMoney(row.net_cash_flow, selectedCurrency)}`}
                            >
                              <div className={styles.trendBars} aria-hidden="true">
                                <span className={styles.trendIncome} style={{ height: `${maxTrend ? (Number(row.income_amount || 0) / maxTrend) * 100 : 0}%` }} />
                                <span className={styles.trendSpend} style={{ height: `${maxTrend ? (Number(row.spending_amount || 0) / maxTrend) * 100 : 0}%` }} />
                              </div>
                              <small>{formatShortMonth(row.month)}</small>
                            </div>
                          ))}
                        </div>
                      ) : <p className="kleos-subtitle">No monthly cash-flow history yet.</p>}
                      {trendRows.length ? (
                        <details className="kleos-disclosure">
                          <summary>Monthly values</summary>
                          <div className="table-wrap">
                            <table className={styles.compactTable}>
                              <thead><tr><th>Month</th><th className="num">Income</th><th className="num">Spend</th><th className="num">Net</th></tr></thead>
                              <tbody>
                                {trendRows.map((row) => (
                                  <tr key={`${row.month}-${row.currency}`}>
                                    <td>{formatMonthLabel(row.month)}</td>
                                    <td className="num">{formatMoney(row.income_amount, selectedCurrency)}</td>
                                    <td className="num">{formatMoney(row.spending_amount, selectedCurrency)}</td>
                                    <td className={`num${Number(row.net_cash_flow) > 0 ? " kleos-positive" : ""}`}>{formatSignedMoney(row.net_cash_flow, selectedCurrency)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      ) : null}
                    </div>
                  </div>
                </section>
              ) : null}

              {currentAccounts.length ? (
                <section className="fs-app-card kleos-card">
                  <SectionHeading
                    title="Merchants"
                    hint={
                      merchantView === "recurring"
                        ? "Likely recurring commitments, detected from repeated merchant, amount, and cadence evidence. This is derived classification, not a bank-provided fact."
                        : "Largest classified merchant spending over the last 365 days in the selected currency."
                    }
                  >
                    <div className="kleos-segmented" role="group" aria-label="Merchant view">
                      <button type="button" aria-pressed={merchantView === "recurring"} onClick={() => setMerchantView("recurring")}>
                        Recurring
                      </button>
                      <button type="button" aria-pressed={merchantView === "top"} onClick={() => setMerchantView("top")}>
                        Top · 365 days
                      </button>
                    </div>
                  </SectionHeading>
                  {merchantRows.length ? (
                    <ul className={styles.merchantList}>
                      {merchantRows.map((row) => (
                        <li key={`${merchantView}-${row.currency}-${row.normalized_label}-${row.category}`}>
                          <span className={styles.merchantName}>
                            <strong>{row.display_label || humanize(row.normalized_label)}</strong>
                            <small>
                              {merchantView === "recurring" ? formatCadence(row.recurrence_interval_days) : humanize(row.category)}
                            </small>
                          </span>
                          <span className={styles.merchantAmount}>
                            {formatMoney(merchantView === "recurring" ? row.typical_amount : row.spending_amount, selectedCurrency)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="kleos-subtitle">
                      {merchantView === "recurring"
                        ? `No active recurring charges detected in ${selectedCurrency}.`
                        : "No merchant spending available."}
                    </p>
                  )}
                </section>
              ) : null}

              <section className="fs-app-card kleos-card">
                <SectionHeading
                  title="Recent Transactions"
                  hint="Raw bank rows remain canonical evidence; flow/category are derived, while remittance notes and transaction codes remain bank-provided context."
                />
                <div className={`table-wrap ${styles.transactionsWrap}`}>
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Category</th>
                        <th className="num">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {finance.transactions.length ? finance.transactions.map((transaction) => {
                        const classification = finance.analytics.classificationsByTransaction[transaction.id];
                        const primaryLabel = classification?.display_label || transactionDescription(transaction);
                        const contextNote = transactionContextNote(transaction, primaryLabel);
                        const amount = Number(transaction.amount);
                        const pending = String(transaction.status || "").toLowerCase() !== "booked";
                        return (
                          <tr key={transaction.id}>
                            <td className={styles.dateCell}>{formatCalendarDate(transaction.booking_date || transaction.value_date)}</td>
                            <td>
                              <div className={styles.transactionDescription}>
                                <strong>
                                  {primaryLabel}
                                  {pending ? <span className="kleos-pill is-quiet">{humanize(transaction.status)}</span> : null}
                                </strong>
                                {contextNote ? <span>{contextNote}</span> : null}
                                {transaction.bank_transaction_code ? <small>{humanize(transaction.bank_transaction_code)}</small> : null}
                              </div>
                            </td>
                            <td>
                              <div className={styles.categoryCell}>
                                <span>
                                  {classification ? humanize(classification.category) : "—"}
                                  {classification?.subcategory ? ` · ${humanize(classification.subcategory)}` : ""}
                                </span>
                                {classification ? (
                                  <small>
                                    {humanize(classification.flow_type)}
                                    {classification.is_recurring ? " · Recurring" : ""}
                                  </small>
                                ) : null}
                              </div>
                            </td>
                            <td className={`num ${amount > 0 ? "kleos-positive" : ""} ${styles.amountCell}`}>
                              {amount > 0 ? "+" : ""}{formatMoney(transaction.amount, transaction.currency)}
                            </td>
                          </tr>
                        );
                      }) : <tr><td colSpan="4">No synchronized transactions yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="fs-app-card kleos-card">
                <SectionHeading
                  title={
                    <span className={styles.titleWithStatus}>
                      Bank connection
                      <span className={`kleos-pill ${connectionTone}`}>
                        <span className={styles.statusDot} aria-hidden="true" />
                        {connectionState}
                      </span>
                    </span>
                  }
                  sub={
                    currentConnection
                      ? `${currentConnection.institution_name || "Revolut"} via Enable Banking · synced ${formatDateTime(currentConnection.last_synced_at)}`
                      : "Revolut via Enable Banking"
                  }
                  hint={
                    <>
                      Read-only Open Banking synchronization. Kleos never stores your Revolut password or a full account identifier.
                      {currentConnection?.consent_valid_until ? ` Consent valid until ${formatDateTime(currentConnection.consent_valid_until)}.` : ""}
                      {" "}Balances remain separated by currency; Kleos does not perform implicit FX conversion.
                    </>
                  }
                >
                  {currentConnection?.provider_session_id ? (
                    <button type="button" className="fs-app-button is-secondary" onClick={() => void syncConnection(currentConnection.id)} disabled={isSyncing}>
                      <RefreshCw aria-hidden="true" className={isSyncing ? styles.spinning : undefined} />
                      {isSyncing ? "Syncing…" : "Sync Revolut"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={`fs-app-button ${currentConnection ? "is-ghost" : "is-primary"}`}
                    onClick={connectRevolut}
                    disabled={isConnecting || isSyncing}
                  >
                    {isConnecting ? "Opening…" : currentConnection ? "Reconnect" : "Connect Revolut"}
                  </button>
                </SectionHeading>

                {currentAccounts.length ? (
                  <div className={styles.accountGrid}>
                    {currentAccounts.map((account) => {
                      const balance = pickDisplayBalance(finance.balancesByAccount[account.id] || []);
                      return (
                        <article className={styles.accountCard} key={account.id}>
                          <div className={styles.accountIdentity}>
                            <span className={styles.currencyBadge}>{account.currency || balance?.currency || "—"}</span>
                            <div>
                              <strong>{account.account_name || "Revolut account"}</strong>
                              <span>{account.masked_identifier || account.cash_account_type || "Open Banking account"}</span>
                            </div>
                          </div>
                          <div className={styles.accountBalance} title={balance?.balance_type ? humanize(balance.balance_type) : undefined}>
                            <strong>{balance ? formatMoney(balance.amount, balance.currency) : "Balance unavailable"}</strong>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="kleos-subtitle">{isLoading ? "Loading accounts…" : "No synchronized Revolut accounts yet."}</p>
                )}
                {currentConnection?.last_error_code ? (
                  <p className="kleos-note is-warning">Last provider error: {currentConnection.last_error_code} · {formatDateTime(currentConnection.last_error_at)}</p>
                ) : null}
              </section>
            </DimensionState>
          </div>
        )}
        {accessGate ? null : <StatusToast message={statusMessage} />}
      </section>
    </main>
  );
}

function Metric({ label, value, tone = "" }) {
  return (
    <div className="kleos-stat">
      <span>{label}</span>
      <strong className={tone === "positive" ? "kleos-positive" : undefined}>{value}</strong>
    </div>
  );
}

function renderAccessGate({ accessState, user, statusMessage, onSignIn }) {
  if (accessState === "authorized") return null;
  const title = {
    loading: "Checking Kleos Access",
    unconfigured: "Supabase Required",
    "signed-out": "Private Kleos Workspace",
    unauthorized: "Access Denied"
  }[accessState] || "Private Kleos Workspace";
  const body = {
    loading: "Verifying the signed-in account before loading any financial data.",
    unconfigured: "This deployment needs the shared Ariadne Supabase URL and publishable key.",
    "signed-out": `Sign in with ${AUTHORIZED_KLEOS_EMAIL} to open Kleos.`,
    unauthorized: `${user?.email || "This account"} is not authorized for Kleos.`
  }[accessState];
  return (
    <section
      className={`fs-app-card access-panel${accessState === "loading" ? " is-loading" : ""}`}
      aria-busy={accessState === "loading" ? "true" : undefined}
    >
      <div className="access-mark"><img src="/brand/kleos-mark.svg" alt="" aria-hidden="true" /></div>
      <h2>{title}</h2>
      <p>{statusMessage || body}</p>
      {accessState === "signed-out" ? (
        <button type="button" className="fs-app-button is-primary" onClick={onSignIn}>Sign In With Google</button>
      ) : null}
    </section>
  );
}

function selectPreferredConnection(connections) {
  const rows = Array.isArray(connections) ? connections : [];
  if (!rows.length) return null;
  const invalidStatuses = new Set(["EXPIRED", "REVOKED", "CLOSED", "INVALID", "CANCELLED"]);
  const usable = rows
    .filter((connection) => {
      const status = String(connection?.requisition_status || "").toUpperCase();
      return Boolean(connection?.provider_session_id && connection?.last_synced_at) && !invalidStatuses.has(status);
    })
    .sort((left, right) => connectionRecency(right) - connectionRecency(left));
  return usable[0] || rows[0] || null;
}

function connectionRecency(connection) {
  const value = connection?.last_synced_at || connection?.connected_at || connection?.created_at;
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function uniqueCurrencies(accounts) {
  const currencies = [...new Set((accounts || []).map((account) => String(account.currency || "").toUpperCase()).filter(Boolean))];
  const priority = ["EUR", "GBP", "USD", "SGD"];
  return currencies.sort((left, right) => {
    const leftIndex = priority.indexOf(left);
    const rightIndex = priority.indexOf(right);
    if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
}

function latestBalancesByAccount(rows) {
  const map = {};
  for (const row of rows || []) {
    if (!map[row.account_id]) map[row.account_id] = [];
    if (!map[row.account_id].some((item) => item.balance_type === row.balance_type && item.currency === row.currency)) {
      map[row.account_id].push(row);
    }
  }
  return map;
}

function pickDisplayBalance(balances) {
  const priority = ["CLAV", "ITAV", "CLBD", "ITBD", "XPCD", "FWAV", "OPAV", "OPBD"];
  for (const type of priority) {
    const match = balances.find((balance) => balance.balance_type === type);
    if (match) return match;
  }
  return balances[0] || null;
}

function sortTransactions(rows) {
  return [...(rows || [])].sort((left, right) => {
    const leftTime = new Date(left.booking_date || left.value_date || left.last_seen_at || 0).getTime();
    const rightTime = new Date(right.booking_date || right.value_date || right.last_seen_at || 0).getTime();
    return rightTime - leftTime;
  });
}

function rollingWindow(rows, currency, days) {
  return (rows || []).find((row) => row.currency === currency && Number(row.window_days) === days) || null;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function connectionLabel(connection) {
  if (connection.last_synced_at && String(connection.requisition_status || "").toUpperCase() === "AUTHORIZED") return "Connected";
  const status = String(connection.requisition_status || "").toUpperCase();
  if (status === "AUTHORIZED") return "Authorized";
  if (["EXPIRED", "REVOKED", "CLOSED", "INVALID", "CANCELLED"].includes(status)) return "Reauthorization required";
  return status ? `Pending (${humanize(status)})` : "Pending";
}

function transactionDescription(transaction) {
  return transaction.merchant_name || transaction.counterparty_name || transaction.description || "Transaction";
}

export function transactionContextNote(transaction, primaryLabel) {
  const candidates = [
    transaction?.transaction_note,
    ...(Array.isArray(transaction?.remittance_information) ? transaction.remittance_information : [])
  ].map((value) => String(value || "").trim()).filter(Boolean);
  const primary = normalizeComparable(primaryLabel);
  const seen = new Set();
  const useful = [];

  for (const candidate of candidates) {
    const comparable = normalizeComparable(candidate);
    if (!comparable || seen.has(comparable)) continue;
    seen.add(comparable);
    if (isRedundantTransactionContext(comparable, primary)) continue;
    useful.push(candidate);
    if (useful.length >= 2) break;
  }

  return useful.join(" · ") || null;
}

function isRedundantTransactionContext(candidate, primary) {
  if (!candidate) return true;
  if (primary && (candidate === primary || candidate.startsWith(primary) || primary.startsWith(candidate))) return true;
  if (/^(from|to)\s+/.test(candidate)) return true;
  if (/^payment from\s+/.test(candidate)) return true;
  return false;
}

function normalizeComparable(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
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

function formatSignedMoney(amount, currency) {
  const number = Number(amount);
  if (!Number.isFinite(number)) return "—";
  const formatted = formatMoney(Math.abs(number), currency);
  if (number > 0) return `+${formatted}`;
  if (number < 0) return `−${formatted}`;
  return formatted;
}

function formatPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(1)}%` : "—";
}

function formatCadence(days) {
  const number = Number(days);
  if (!Number.isFinite(number) || number <= 0) return "Recurring";
  if (number >= 330) return "Annual";
  if (number >= 25 && number <= 36) return "Monthly";
  return `~${Math.round(number)} days`;
}

function formatMonthLabel(value) {
  if (!value) return "—";
  const text = String(value).slice(0, 10);
  const date = new Date(`${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function formatShortMonth(value) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short" });
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function formatCalendarDate(value) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, sameYear
    ? { day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "numeric" });
}

function humanize(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function errorMessage(error) {
  return error?.message || (error instanceof Error ? error.message : "Unknown error");
}
