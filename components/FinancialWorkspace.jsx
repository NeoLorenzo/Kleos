"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DimensionState from "@/components/DimensionState";
import { supabase } from "@/lib/supabase/client";
import { AUTHORIZED_KLEOS_EMAIL } from "@/lib/kleos/data";
import styles from "./FinancialWorkspace.module.css";

const EMPTY_DATA = {
  connection: null,
  accounts: [],
  balancesByAccount: {},
  transactions: []
};

export default function FinancialWorkspace() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const [accessState, setAccessState] = useState("loading");
  const [user, setUser] = useState(null);
  const [finance, setFinance] = useState(EMPTY_DATA);
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
        .order("account_name", { ascending: true });
      if (accountsError) throw accountsError;

      const accountIds = (accounts || []).map((account) => account.id);
      let balances = [];
      let transactions = [];
      if (accountIds.length) {
        const [balanceResult, transactionResult] = await Promise.all([
          supabase
            .from("financial_account_balances")
            .select("id,account_id,balance_type,amount,currency,reference_date,provider_changed_at,observed_at")
            .eq("user_id", userId)
            .in("account_id", accountIds)
            .order("observed_at", { ascending: false })
            .limit(Math.max(accountIds.length * 12, 60)),
          supabase
            .from("financial_transactions")
            .select("id,account_id,status,booking_date,value_date,amount,currency,counterparty_name,merchant_name,description,first_seen_at,last_seen_at")
            .eq("user_id", userId)
            .in("account_id", accountIds)
            .order("last_seen_at", { ascending: false })
            .limit(100)
        ]);
        if (balanceResult.error) throw balanceResult.error;
        if (transactionResult.error) throw transactionResult.error;
        balances = balanceResult.data || [];
        transactions = transactionResult.data || [];
      }

      setFinance({
        connection,
        accounts: accounts || [],
        balancesByAccount: latestBalancesByAccount(balances),
        transactions: sortTransactions(transactions)
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
        "Revolut sync did not complete. Existing financial evidence was preserved. "
          + errorMessage(error)
      );
      return false;
    }

    await loadFinance(user.id, { silent: true });
    const accountCount = Number(data?.account_count || 0);
    const transactionCount = Number(data?.transaction_count || 0);
    setStatusMessage(`Revolut synced: ${accountCount} account(s), ${transactionCount} transaction record(s).`);
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
      setStatusMessage(
        "Revolut authorization returned, but the financial import did not complete. "
          + errorMessage(error)
      );
      return;
    }

    await loadFinance(user.id, { silent: true });
    const accountCount = Number(data?.account_count || 0);
    const transactionCount = Number(data?.transaction_count || 0);
    setStatusMessage(`Revolut connected: ${accountCount} account(s), ${transactionCount} transaction record(s) imported.`);
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
      const cleanUrl = `${window.location.origin}${window.location.pathname}`;
      window.history.replaceState({}, "", cleanUrl);
    };

    if (providerError) {
      setStatusMessage(
        `Revolut authorization was not completed${providerErrorDescription ? `: ${providerErrorDescription}` : "."}`
      );
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

  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setStatusMessage(error.message || "Sign-out failed.");
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

  return (
    <main className="kleos-shell">
      <section className="kleos-board">
        <header className="kleos-header">
          <div>
            <p className="kleos-kicker">Kleos Dimension</p>
            <h1>Financial</h1>
            <p className="kleos-subtitle">Current financial state, Open Banking evidence, and assessment history.</p>
          </div>
          {accessState === "authorized" ? (
            <div className="kleos-header-actions">
              <button type="button" className="secondary-btn" onClick={signOut}>Sign Out</button>
            </div>
          ) : null}
        </header>

        {renderAccessGate({ accessState, user, statusMessage, onSignIn: signIn }) || (
          <div className="kleos-scroll">
            <DimensionState userId={user.id} vectorId="financial" />

            <section className="kleos-card wide-card">
              <div className={styles.sectionHeaderRow}>
                <div className="section-header">
                  <p className="kleos-kicker">Bank Connectivity</p>
                  <h2>Revolut via Enable Banking</h2>
                  <p>Read-only Open Banking synchronization. Kleos never stores your Revolut password or a full account identifier.</p>
                </div>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={connectRevolut}
                    disabled={isConnecting || isSyncing}
                  >
                    {isConnecting ? "Opening…" : currentConnection ? "Reconnect Revolut" : "Connect Revolut"}
                  </button>
                  {currentConnection?.provider_session_id ? (
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => void syncConnection(currentConnection.id)}
                      disabled={isSyncing}
                    >
                      {isSyncing ? "Syncing…" : "Sync Revolut"}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className={styles.connectionGrid}>
                <Metric label="Connection" value={currentConnection ? connectionLabel(currentConnection) : "Not connected"} />
                <Metric label="Institution" value={currentConnection?.institution_name || "—"} />
                <Metric label="Last sync" value={formatDateTime(currentConnection?.last_synced_at)} />
                <Metric label="Accounts" value={currentAccounts.length ? String(currentAccounts.length) : "—"} />
              </div>
              {currentConnection?.consent_valid_until ? (
                <p className={styles.errorNote}>Consent valid until {formatDateTime(currentConnection.consent_valid_until)}.</p>
              ) : null}
              {currentConnection?.last_error_code ? (
                <p className={styles.errorNote}>
                  Last provider error: {currentConnection.last_error_code} · {formatDateTime(currentConnection.last_error_at)}
                </p>
              ) : null}
            </section>

            <section className="kleos-card wide-card">
              <div className="section-header">
                <p className="kleos-kicker">Current Evidence</p>
                <h2>Accounts & Balances</h2>
                <p>Balances remain separated by currency; Kleos does not perform implicit FX conversion.</p>
              </div>
              {currentAccounts.length ? (
                <div className={styles.accountGrid}>
                  {currentAccounts.map((account) => {
                    const balance = pickDisplayBalance(finance.balancesByAccount[account.id] || []);
                    return (
                      <article className={styles.accountCard} key={account.id}>
                        <div>
                          <strong>{account.account_name || "Revolut account"}</strong>
                          <span>{account.masked_identifier || account.cash_account_type || "Open Banking account"}</span>
                        </div>
                        <div className={styles.accountBalance}>
                          <strong>{balance ? formatMoney(balance.amount, balance.currency) : "Balance unavailable"}</strong>
                          <span>{balance?.balance_type ? humanize(balance.balance_type) : account.currency || ""}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="kleos-subtitle">
                  {isLoading ? "Loading accounts…" : "No synchronized Revolut accounts yet."}
                </p>
              )}
            </section>

            <section className="kleos-card wide-card">
              <div className="section-header">
                <p className="kleos-kicker">Cash Flow Evidence</p>
                <h2>Recent Transactions</h2>
                <p>Most recent synchronized booked and pending activity across the current Revolut connection.</p>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Account</th>
                      <th>Status</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finance.transactions.length ? finance.transactions.map((transaction) => {
                      const account = currentAccounts.find((item) => item.id === transaction.account_id);
                      return (
                        <tr key={transaction.id}>
                          <td>{formatCalendarDate(transaction.booking_date || transaction.value_date)}</td>
                          <td>{transactionDescription(transaction)}</td>
                          <td>{account?.account_name || account?.masked_identifier || "Revolut"}</td>
                          <td><span className={styles.statusBadge}>{humanize(transaction.status)}</span></td>
                          <td className={Number(transaction.amount) < 0 ? styles.negativeAmount : ""}>
                            {formatMoney(transaction.amount, transaction.currency)}
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr><td colSpan="5">No synchronized transactions yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {statusMessage ? <p className="status-line">{statusMessage}</p> : null}
          </div>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
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
    <section className="access-panel">
      <div className="access-mark">K</div>
      <h2>{title}</h2>
      <p>{statusMessage || body}</p>
      {accessState === "signed-out" ? (
        <button type="button" className="primary-btn" onClick={onSignIn}>Sign In With Google</button>
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
      return Boolean(connection?.provider_session_id && connection?.last_synced_at)
        && !invalidStatuses.has(status);
    })
    .sort((left, right) => connectionRecency(right) - connectionRecency(left));

  if (usable.length) return usable[0];
  return rows[0] || null;
}

function connectionRecency(connection) {
  const value = connection?.last_synced_at || connection?.connected_at || connection?.created_at;
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
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

function connectionLabel(connection) {
  if (connection.last_synced_at && String(connection.requisition_status || "").toUpperCase() === "AUTHORIZED") {
    return "Connected";
  }
  const status = String(connection.requisition_status || "").toUpperCase();
  if (status === "AUTHORIZED") return "Authorized";
  if (["EXPIRED", "REVOKED", "CLOSED", "INVALID", "CANCELLED"].includes(status)) {
    return "Reauthorization required";
  }
  return status ? `Pending (${humanize(status)})` : "Pending";
}

function transactionDescription(transaction) {
  return transaction.merchant_name
    || transaction.counterparty_name
    || transaction.description
    || "Transaction";
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

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function formatCalendarDate(value) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
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
