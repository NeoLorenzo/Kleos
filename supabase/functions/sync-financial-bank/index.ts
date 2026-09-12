import { createClient } from "npm:@supabase/supabase-js@2.56.0";
import {
  createEnableBankingJwt,
  finalizeTransactionKeys,
  normalizeAccount,
  normalizeCountry,
  selectRevolutInstitution,
} from "../_shared/financial.mjs";

const AUTHORIZED_EMAIL = "theneolorenzo@gmail.com";
const ENABLE_BANKING_BASE_URL = "https://api.enablebanking.com";
const MAX_TRANSACTION_PAGES = 40;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, private, max-age=0",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff",
};

type AuthUser = { id: string; email?: string };
type ConnectionRow = {
  id: string;
  user_id: string;
  provider: string;
  requisition_id: string;
  provider_reference: string;
  provider_session_id?: string | null;
  institution_id: string;
  institution_name: string;
  institution_country: string;
  requisition_status?: string | null;
};

class ProviderError extends Error {
  status: number;
  code: string;

  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function authenticateCaller(
  supabaseUrl: string,
  anonKey: string,
  authorization: string,
): Promise<AuthUser | null> {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) return null;

  const user = await response.json().catch(() => null) as AuthUser | null;
  const email = String(user?.email || "").trim().toLowerCase();
  return user?.id && email === AUTHORIZED_EMAIL ? user : null;
}

async function providerRequest(
  jwt: string,
  path: string,
  options: { method?: string; body?: unknown; optionalStatuses?: number[] } = {},
) {
  const method = options.method || "GET";
  const response = await fetch(`${ENABLE_BANKING_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  if (options.optionalStatuses?.includes(response.status)) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const providerCode = sanitizeCode(
      payload?.error
        || payload?.code
        || payload?.error_code
        || payload?.detail
        || `HTTP_${response.status}`,
    );
    throw new ProviderError(`ENABLE_BANKING_${providerCode}`, response.status);
  }
  return payload;
}

async function fetchAllTransactions(jwt: string, providerAccountId: string) {
  const transactions: unknown[] = [];
  const seenContinuationKeys = new Set<string>();
  let continuationKey = "";

  for (let page = 0; page < MAX_TRANSACTION_PAGES; page += 1) {
    const query = continuationKey
      ? `?continuation_key=${encodeURIComponent(continuationKey)}`
      : "";
    const payload = await providerRequest(
      jwt,
      `/accounts/${encodeURIComponent(providerAccountId)}/transactions${query}`,
    ) as Record<string, unknown> | null;
    const pageTransactions = Array.isArray(payload?.transactions) ? payload.transactions : [];
    transactions.push(...pageTransactions);

    const next = String(payload?.continuation_key || "").trim();
    if (!next) return { transactions };
    if (seenContinuationKeys.has(next)) throw new Error("ENABLE_BANKING_CONTINUATION_LOOP");
    seenContinuationKeys.add(next);
    continuationKey = next;
  }

  throw new Error("ENABLE_BANKING_TRANSACTION_PAGINATION_LIMIT");
}

async function loadNormalizedAccounts(jwt: string, accountSeeds: unknown[]) {
  const normalizedAccounts = [];
  for (const seed of accountSeeds) {
    const metadata = typeof seed === "string" ? { uid: seed } : (seed || {});
    const providerAccountId = String((metadata as Record<string, unknown>)?.uid || "").trim();
    if (!providerAccountId) throw new Error("FINANCIAL_ACCOUNT_PROVIDER_ID_REQUIRED");
    const encodedId = encodeURIComponent(providerAccountId);

    const [details, balances, transactions] = await Promise.all([
      providerRequest(jwt, `/accounts/${encodedId}/details`, {
        optionalStatuses: [403, 404, 409],
      }),
      providerRequest(jwt, `/accounts/${encodedId}/balances`),
      fetchAllTransactions(jwt, providerAccountId),
    ]);

    const normalized = normalizeAccount({
      providerAccountId,
      metadata,
      details,
      balances,
      transactions,
    });
    if (!normalized.provider_account_id) throw new Error("FINANCIAL_ACCOUNT_CONTRACT_INVALID");
    normalizedAccounts.push(await finalizeTransactionKeys(normalized));
  }
  return normalizedAccounts;
}

function validateRedirectUrl(value: unknown) {
  let url: URL;
  try {
    url = new URL(String(value || ""));
  } catch (_error) {
    throw new Error("INVALID_REDIRECT_URL");
  }

  const production = url.protocol === "https:"
    && url.hostname === "neolorenzo.github.io"
    && (url.pathname === "/Kleos/financial" || url.pathname === "/Kleos/financial/");
  const local = (url.protocol === "http:" || url.protocol === "https:")
    && ["localhost", "127.0.0.1"].includes(url.hostname)
    && (url.pathname === "/financial" || url.pathname === "/financial/");

  if (!production && !local) throw new Error("INVALID_REDIRECT_URL");
  url.hash = "";
  url.search = "";
  return url.toString();
}

function providerErrorCode(error: unknown) {
  if (error instanceof ProviderError) return error.code;
  if (error instanceof Error && error.message) return sanitizeCode(error.message);
  return "FINANCIAL_SYNC_FAILED";
}

function sanitizeCode(value: unknown) {
  const text = String(value || "UNKNOWN").trim().toUpperCase();
  return text.replace(/[^A-Z0-9_-]+/g, "_").slice(0, 120) || "UNKNOWN";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const appId = Deno.env.get("ENABLE_BANKING_APP_ID");
  const privateKey = Deno.env.get("ENABLE_BANKING_PRIVATE_KEY");
  const authorization = req.headers.get("Authorization")?.trim() || "";

  if (!supabaseUrl || !anonKey || !serviceKey || !appId || !privateKey) {
    return json({ error: "SERVER_CONFIGURATION_ERROR" }, 500);
  }
  if (!authorization.toLowerCase().startsWith("bearer ")) return json({ error: "UNAUTHORIZED" }, 401);

  let caller: AuthUser | null;
  try {
    caller = await authenticateCaller(supabaseUrl, anonKey, authorization);
  } catch (_error) {
    return json({ error: "AUTHENTICATION_UNAVAILABLE" }, 503);
  }
  if (!caller?.id) return json({ error: "UNAUTHORIZED" }, 401);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "").trim().toLowerCase();
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let providerJwt: string;
  try {
    providerJwt = await createEnableBankingJwt({ appId, privateKeyPem: privateKey });
  } catch (_error) {
    return json({ error: "ENABLE_BANKING_CREDENTIALS_INVALID" }, 500);
  }

  const findConnection = async (connectionId: string) => {
    const { data, error } = await admin
      .from("financial_bank_connections")
      .select("id,user_id,provider,requisition_id,provider_reference,provider_session_id,institution_id,institution_name,institution_country,requisition_status")
      .eq("id", connectionId)
      .eq("user_id", caller!.id)
      .eq("provider", "enable_banking")
      .maybeSingle();
    if (error) throw new Error("KLEOS_CONNECTION_LOOKUP_FAILED");
    return data as ConnectionRow | null;
  };

  const recordFailure = async (connectionId: string, code: string, providerStatus?: string) => {
    await admin.from("financial_bank_connections").update({
      ...(providerStatus ? { requisition_status: providerStatus } : {}),
      last_error_code: sanitizeCode(code),
      last_error_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", connectionId).eq("user_id", caller!.id).eq("provider", "enable_banking");
  };

  if (action === "connect") {
    try {
      const country = normalizeCountry(body.country, "PT");
      const redirectUrl = validateRedirectUrl(body.redirectUrl);
      const aspsps = await providerRequest(
        providerJwt,
        `/aspsps?country=${encodeURIComponent(country)}&psu_type=personal&service=AIS`,
      );
      const institution = selectRevolutInstitution(aspsps, country);
      if (!institution?.name) return json({ error: "REVOLUT_INSTITUTION_NOT_FOUND", country }, 404);

      const maximumConsentValidity = Number(institution.maximum_consent_validity);
      const ninetyDaysSeconds = 90 * 24 * 60 * 60;
      const validitySeconds = Number.isFinite(maximumConsentValidity) && maximumConsentValidity > 0
        ? Math.min(maximumConsentValidity, ninetyDaysSeconds)
        : ninetyDaysSeconds;
      const validUntil = new Date(Date.now() + validitySeconds * 1000).toISOString();
      const connectionId = crypto.randomUUID();

      const providerAuthorization = await providerRequest(providerJwt, "/auth", {
        method: "POST",
        body: {
          access: {
            balances: true,
            transactions: true,
            valid_until: validUntil,
          },
          aspsp: { name: institution.name, country },
          state: connectionId,
          redirect_url: redirectUrl,
          psu_type: "personal",
        },
      }) as Record<string, unknown> | null;

      const authorizationId = String(providerAuthorization?.authorization_id || "").trim();
      const authorizationUrl = String(providerAuthorization?.url || "").trim();
      if (!authorizationId || !authorizationUrl) {
        return json({ error: "ENABLE_BANKING_AUTHORIZATION_INVALID" }, 502);
      }

      const { error } = await admin.from("financial_bank_connections").insert({
        id: connectionId,
        user_id: caller.id,
        provider: "enable_banking",
        institution_id: `${country}:${institution.name}`,
        institution_name: institution.name,
        institution_country: country,
        requisition_id: authorizationId,
        provider_reference: connectionId,
        requisition_status: "PENDING_AUTHORIZATION",
        consent_valid_until: validUntil,
      });
      if (error) return json({ error: "KLEOS_CONNECTION_PERSISTENCE_FAILED" }, 500);

      return json({
        connection_id: connectionId,
        institution_name: institution.name,
        country,
        authorization_url: authorizationUrl,
        consent_valid_until: validUntil,
      });
    } catch (error) {
      return json({ error: providerErrorCode(error) }, 502);
    }
  }

  if (action === "authorization-error") {
    const state = String(body.state || "").trim();
    if (!isUuid(state)) return json({ error: "INVALID_AUTHORIZATION_STATE" }, 400);
    const connection = await findConnection(state).catch(() => null);
    if (!connection || connection.provider_reference !== state) {
      return json({ error: "FINANCIAL_CONNECTION_NOT_FOUND" }, 404);
    }
    const errorCode = `ENABLE_BANKING_AUTH_${sanitizeCode(body.error || "ACCESS_DENIED")}`;
    await recordFailure(connection.id, errorCode, "INVALID");
    return json({ recorded: true });
  }

  if (action === "finalize") {
    const state = String(body.state || "").trim();
    const code = String(body.code || "").trim();
    if (!isUuid(state) || !code) return json({ error: "INVALID_AUTHORIZATION_CALLBACK" }, 400);

    const connection = await findConnection(state).catch(() => null);
    if (!connection || connection.provider_reference !== state) {
      return json({ error: "FINANCIAL_CONNECTION_NOT_FOUND" }, 404);
    }

    try {
      const session = await providerRequest(providerJwt, "/sessions", {
        method: "POST",
        body: { code },
      }) as Record<string, unknown> | null;
      const sessionId = String(session?.session_id || "").trim();
      const accountSeeds = Array.isArray(session?.accounts) ? session.accounts : [];
      if (!sessionId || !accountSeeds.length) {
        await recordFailure(connection.id, "ENABLE_BANKING_SESSION_EMPTY", "INVALID");
        return json({
          error: "ENABLE_BANKING_SESSION_EMPTY",
          preserved_existing_snapshot: true,
        }, 409);
      }

      const normalizedAccounts = await loadNormalizedAccounts(providerJwt, accountSeeds);
      const syncedAt = new Date().toISOString();
      const validUntil = String((session?.access as Record<string, unknown> | undefined)?.valid_until || "").trim() || null;
      const { error: connectionUpdateError } = await admin.from("financial_bank_connections").update({
        provider_session_id: sessionId,
        requisition_status: "AUTHORIZED",
        connected_at: syncedAt,
        consent_valid_until: validUntil,
        last_error_code: null,
        last_error_at: null,
        updated_at: syncedAt,
      }).eq("id", connection.id).eq("user_id", caller.id).eq("provider", "enable_banking");
      if (connectionUpdateError) throw new Error("KLEOS_CONNECTION_PERSISTENCE_FAILED");

      const { data, error } = await admin.rpc("persist_financial_bank_sync", {
        p_user_id: caller.id,
        p_connection_id: connection.id,
        p_requisition_status: "AUTHORIZED",
        p_accounts: normalizedAccounts,
        p_synced_at: syncedAt,
      });
      if (error) throw new Error("KLEOS_FINANCIAL_PERSISTENCE_FAILED");

      return json({
        source: "revolut_enable_banking",
        institution_name: connection.institution_name,
        country: connection.institution_country,
        session_status: "AUTHORIZED",
        ...(data && typeof data === "object" && !Array.isArray(data) ? data : {}),
      });
    } catch (error) {
      const errorCode = providerErrorCode(error);
      await recordFailure(connection.id, errorCode);
      return json({ error: errorCode, preserved_existing_snapshot: true }, 502);
    }
  }

  if (action === "sync") {
    const connectionId = String(body.connectionId || "").trim();
    if (!isUuid(connectionId)) return json({ error: "INVALID_CONNECTION_ID" }, 400);
    const connection = await findConnection(connectionId).catch(() => null);
    if (!connection) return json({ error: "FINANCIAL_CONNECTION_NOT_FOUND" }, 404);
    const sessionId = String(connection.provider_session_id || "").trim();
    if (!sessionId) return json({ error: "ENABLE_BANKING_SESSION_REQUIRED" }, 409);

    try {
      const session = await providerRequest(
        providerJwt,
        `/sessions/${encodeURIComponent(sessionId)}`,
      ) as Record<string, unknown> | null;
      const sessionStatus = String(session?.status || "").trim().toUpperCase();
      if (sessionStatus !== "AUTHORIZED") {
        await recordFailure(connection.id, `ENABLE_BANKING_SESSION_${sessionStatus || "INVALID"}`, sessionStatus || "INVALID");
        return json({
          error: "REVOLUT_REAUTHORIZATION_REQUIRED",
          session_status: sessionStatus || "INVALID",
          preserved_existing_snapshot: true,
        }, 409);
      }

      const providerAccounts = Array.isArray(session?.accounts)
        ? session.accounts.map((value) => String(value || "").trim()).filter(Boolean)
        : [];
      if (!providerAccounts.length) {
        await recordFailure(connection.id, "ENABLE_BANKING_SESSION_EMPTY", sessionStatus);
        return json({ error: "ENABLE_BANKING_SESSION_EMPTY", preserved_existing_snapshot: true }, 409);
      }

      const normalizedAccounts = await loadNormalizedAccounts(providerJwt, providerAccounts);
      const syncedAt = new Date().toISOString();
      const { data, error } = await admin.rpc("persist_financial_bank_sync", {
        p_user_id: caller.id,
        p_connection_id: connection.id,
        p_requisition_status: sessionStatus,
        p_accounts: normalizedAccounts,
        p_synced_at: syncedAt,
      });
      if (error) throw new Error("KLEOS_FINANCIAL_PERSISTENCE_FAILED");

      return json({
        source: "revolut_enable_banking",
        institution_name: connection.institution_name,
        country: connection.institution_country,
        session_status: sessionStatus,
        ...(data && typeof data === "object" && !Array.isArray(data) ? data : {}),
      });
    } catch (error) {
      const errorCode = providerErrorCode(error);
      await recordFailure(connection.id, errorCode);
      return json({ error: errorCode, preserved_existing_snapshot: true }, 502);
    }
  }

  return json({ error: "INVALID_ACTION" }, 400);
});
