import { createClient } from "npm:@supabase/supabase-js@2.56.0";

const AUTHORIZED_EMAIL = "theneolorenzo@gmail.com";
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, private, max-age=0",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = req.headers.get("Authorization")?.trim() ?? "";
  if (!supabaseUrl || !anonKey) {
    return json({ error: "SERVER_CONFIGURATION_ERROR" }, 500);
  }
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error } = await client.auth.getUser();
  const email = String(user?.email ?? "").trim().toLowerCase();

  if (error || !user?.id || email !== AUTHORIZED_EMAIL) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  return json({ authorized: true, user_id: user.id });
});
