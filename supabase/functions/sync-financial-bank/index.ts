import { createClient } from "npm:@supabase/supabase-js@2.56.0";
import {
  finalizeTransactionKeys,
  normalizeAccount,
  normalizeCountry,
  selectRevolutInstitution,
} from "../_shared/financial.mjs";

const AUTHORIZED_EMAIL = "theneolorenzo@gmail.com";
const GOCARDLESS_BASE_URL = "https://bankaccountdata.gocardless.com/api/v2";

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
  requisition_id: string;
  institution_id: string;
  institution_name: string;
  institution_country: string;
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

async function createProviderAccessToken(secretId: string, secretKey: string) {
  const response = await fetch(`${GOCARDLESS_BASE_URL}/token/new/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret_id: secretId, secret_key: secretKey }),
  });
  const payload = await response.json().catch(() => null) as { access?: string } | null;
  if (!response.ok || !payload?.access) {
    throw new ProviderError("GOCARDLESS_TOKEN_FAILED", response.status || 502);
  }
  return payload.access;
}

async function providerGet(accessToken: string, path: string) {
  const response = await fetch(`${GOCARDLESS_BASE_URL}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ProviderError(`GOCARDLESS_GET_FAILED_${response.status}`, response.status);
  }
  return payload;
}

async function providerGetOptional(accessToken: string, path: string) {
  try {
    return await providerGet(accessToken, path);
  } catch (error) {
    if (error instanceof ProviderError && [403, 404, 409].includes(error.status)) {
      return null;
    }
    throw error;
  }
}

async function providerPost(accessToken: string, path: string, body: unknown) {
  const response = await fetch(`${GOCARDLESS_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ProviderError(`GOCARDLESS_POST_FAILED_${response.status}`, response.status);
  }
  return payload;
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

  if (!production && !local) {
    throw new Error("INVALID_REDIRECT_URL");
  }

  url.hash = "";
  url.search = "";
  return url;
}

function providerErrorCode(error: unknown) {
  if (error instanceof ProviderError) return error.code;
  if (error instanceof Error && error.message) return error.message.slice(0, 120);
  return "FINANCIAL_SYNC_FAILED";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secretId = Deno.env.get("GOCARDLESS_SECRET_ID");
  const secretKey = Deno.env.get("GOCARDLESS_SECRET_KEY");
  const authorization = req.headers.get("Authorization")?.trim() || "";

  if (!supabaseUrl || !anonKey || !serviceKey || !secretId || !secretKey) {
    return json({ error: "SERVER_CONFIGURATION_ERROR" }, 500);
  }
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

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

  if (action === "connect") {
    try {
      const country = normalizeCountry(body.country, "PT");
      const redirectUrl = validateRedirectUrl(body.redirectUrl);
      const accessToken = await createProviderAccessToken(secretId, secretKey);
      const institutions = await providerGet(
        accessToken,
        `/institutions/?country=${encodeURIComponent(country)}`,
      );
      const institution = selectRevolutInstitution(institutions);
      if (!institution?.id || !institution?.name) {
        return json({ error: "REVOLUT_INSTITUTION_NOT_FOUND", country }, 404);
      }

      const connectionId = crypto.randomUUID();
      redirectUrl.searchParams.set("bank_connection", connectionId);
      const requisition = await providerPost(accessToken, "/requisitions/", {
        redirect: redirectUrl.toString(),
        institution_id: institution.id,
        reference: connectionId,
        user_language: "en",
      }) as Record<string, unknown> | null;

      const requisitionId = String(requisition?.id || "").trim();
      const authorizationUrl = String(requisition?.link || "").trim();
      if (!requisitionId || !authorizationUrl) {
        return json({ error: "GOCARDLESS_REQUISITION_INVALID" }, 502);
      }

      const { error } = await admin.from("financial_bank_connections").insert({
        id: connectionId,
        user_id: caller.id,
        provider: "gocardless",
        institution_id: institution.id,
        institution_name: institution.name,
        institution_country: country,
        requisition_id: requisitionId,
        provider_reference: connectionId,
        requisition_status: String(requisition?.status || "CR"),
      });
      if (error) return json({ error: "KLEOS_CONNECTION_PERSISTENCE_FAILED" }, 500);

      return json({
        connection_id: connectionId,
        institution_name: institution.name,
        country,
        authorization_url: authorizationUrl,
      });
    } catch (error) {
      const code = providerErrorCode(error);
      const status = error instanceof ProviderError && error.status >= 400 && error.status < 500
        ? 502
        : 500;
      return json({ error: code }, status);
    }
  }

  if (action === "sync") {
    const connectionId = String(body.connectionId || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(connectionId)) {
      return json({ error: "INVALID_CONNECTION_ID" }, 400);
    }

    const { data: connection, error: connectionError } = await admin
      .from("financial_bank_connections")
      .select("id,user_id,requisition_id,institution_id,institution_name,institution_country")
      .eq("id", connectionId)
      .eq("user_id", caller.id)
      .maybeSingle<ConnectionRow>();

    if (connectionError) return json({ error: "KLEOS_CONNECTION_LOOKUP_FAILED" }, 500);
    if (!connection) return json({ error: "FINANCIAL_CONNECTION_NOT_FOUND" }, 404);

    const recordFailure = async (code: string, requisitionStatus?: string) => {
      await admin.from("financial_bank_connections").update({
        ...(requisitionStatus ? { requisition_status: requisitionStatus } : {}),
        last_error_code: code,
        last_error_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", connection.id).eq("user_id", caller.id);
    };

    try {
      const accessToken = await createProviderAccessToken(secretId, secretKey);
      const requisition = await providerGet(
        accessToken,
        `/requisitions/${encodeURIComponent(connection.requisition_id)}/`,
      ) as Record<string, unknown> | null;
      const requisitionStatus = String(requisition?.status || "").trim();
      const providerAccounts = Array.isArray(requisition?.accounts)
        ? requisition.accounts.map((value) => String(value || "").trim()).filter(Boolean)
        : [];

      if (!providerAccounts.length) {
        await recordFailure("REVOLUT_AUTHORIZATION_INCOMPLETE", requisitionStatus);
        return json({
          error: "REVOLUT_AUTHORIZATION_INCOMPLETE",
          requisition_status: requisitionStatus,
          preserved_existing_snapshot: true,
        }, 409);
      }

      const normalizedAccounts = [];
      for (const providerAccountId of providerAccounts) {
        const encodedId = encodeURIComponent(providerAccountId);
        const [metadata, details, balances, transactions] = await Promise.all([
          providerGet(accessToken, `/accounts/${encodedId}/`),
          providerGetOptional(accessToken, `/accounts/${encodedId}/details/`),
          providerGet(accessToken, `/accounts/${encodedId}/balances/`),
          providerGet(accessToken, `/accounts/${encodedId}/transactions/`),
        ]);

        const normalized = normalizeAccount({
          providerAccountId,
          metadata,
          details,
          balances,
          transactions,
        });
        if (!normalized.provider_account_id) {
          throw new Error("FINANCIAL_ACCOUNT_CONTRACT_INVALID");
        }
        normalizedAccounts.push(await finalizeTransactionKeys(normalized));
      }

      const syncedAt = new Date().toISOString();
      const { data, error } = await admin.rpc("persist_financial_bank_sync", {
        p_user_id: caller.id,
        p_connection_id: connection.id,
        p_requisition_status: requisitionStatus,
        p_accounts: normalizedAccounts,
        p_synced_at: syncedAt,
      });
      if (error) {
        await recordFailure("KLEOS_FINANCIAL_PERSISTENCE_FAILED", requisitionStatus);
        return json({
          error: "KLEOS_FINANCIAL_PERSISTENCE_FAILED",
          preserved_existing_snapshot: true,
        }, 500);
      }

      return json({
        source: "revolut_open_banking",
        institution_name: connection.institution_name,
        country: connection.institution_country,
        requisition_status: requisitionStatus,
        ...(data && typeof data === "object" && !Array.isArray(data) ? data : {}),
      });
    } catch (error) {
      const code = providerErrorCode(error);
      await recordFailure(code);
      return json({ error: code, preserved_existing_snapshot: true }, 502);
    }
  }

  return json({ error: "INVALID_ACTION" }, 400);
});
