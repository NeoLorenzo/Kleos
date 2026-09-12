const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { before, test } = require("node:test");

let migration;
let edgeFunction;
let openApi;
let transportDoc;

before(async () => {
  [migration, edgeFunction, openApi, transportDoc] = await Promise.all([
    readFile(
      path.join(process.cwd(), "supabase/migrations/20260912_0026_kleos_bot_compact_evaluation_evidence.sql"),
      "utf8"
    ),
    readFile(path.join(process.cwd(), "supabase/functions/kleos-bot-api/index.ts"), "utf8"),
    readFile(path.join(process.cwd(), "documentation/kleos-bot-action.openapi.yaml"), "utf8"),
    readFile(path.join(process.cwd(), "documentation/kleos-bot-shortcut-transport.md"), "utf8")
  ]);
});

test("compact evaluator evidence keeps the privileged owner boundary and removes high-volume raw groups", () => {
  assert.match(migration, /get_kleos_bot_evaluation_evidence_admin/i);
  assert.match(migration, /session_user <> 'postgres'/i);
  assert.match(migration, /get_kleos_bot_evidence_admin\(\)/i);
  assert.match(migration, /- 'goat_health_metric_evidence'/i);
  assert.match(migration, /- 'financial_recent_transactions'/i);
  assert.match(migration, /- 'financial_spending_by_category'/i);
  assert.match(migration, /- 'financial_cash_flow_monthly'/i);
  assert.match(migration, /- 'financial_recurring_expenses'/i);
  assert.match(migration, /goat_health_metric_summary/i);
  assert.match(migration, /financial_summary/i);
  assert.match(migration, /cash_flow_last_12_months/i);
  assert.match(migration, /spending_last_3_months_by_category/i);
  assert.match(migration, /limit 30/i);
  assert.match(
    migration,
    /revoke all on function public\.get_kleos_bot_evaluation_evidence_admin\(\) from service_role/i
  );
});

test("health compaction retains current trends and only the latest structured sleep details", () => {
  assert.match(migration, /latest_qty/i);
  assert.match(migration, /avg_7d/i);
  assert.match(migration, /avg_30d/i);
  assert.match(migration, /min_30d/i);
  assert.match(migration, /max_30d/i);
  assert.match(migration, /when h\.metric_name = 'sleep_analysis'/i);
  assert.doesNotMatch(migration, /recent_samples'\s*,\s*h\.recent_samples/i);
});

test("GPT Action API authenticates before privileged access and never embeds a plaintext action token", () => {
  assert.match(edgeFunction, /EXPECTED_TOKEN_HASH = "[a-f0-9]{64}"/i);
  assert.match(edgeFunction, /sha256Hex/i);
  assert.match(edgeFunction, /constantTimeEqual/i);
  assert.match(edgeFunction, /x-kleos-bot-token/i);
  assert.doesNotMatch(edgeFunction, /SUPABASE_SERVICE_ROLE_KEY/);

  const authIndex = edgeFunction.indexOf("await isAuthorized(req)");
  const evidenceIndex = edgeFunction.indexOf("get_kleos_bot_evaluation_evidence_admin");
  const persistenceIndex = edgeFunction.indexOf("create_kleos_bot_snapshot_admin");
  assert.ok(authIndex >= 0 && evidenceIndex > authIndex);
  assert.ok(authIndex >= 0 && persistenceIndex > authIndex);
});

test("GPT Action persistence delegates to the canonical admin writer and validates all eight vectors", () => {
  for (const vector of [
    "physical",
    "psychological",
    "intellectual",
    "professional",
    "financial",
    "relational",
    "creative",
    "experiential"
  ]) {
    assert.match(edgeFunction, new RegExp(`"${vector}"`));
  }
  assert.match(edgeFunction, /body\.results\.length !== VECTOR_IDS\.length/);
  assert.match(edgeFunction, /METHODOLOGY_VERSION = "1\.0\.0"/);
  assert.match(edgeFunction, /const evaluatedAt = new Date\(\)\.toISOString\(\)/);
  assert.match(edgeFunction, /create_kleos_bot_snapshot_admin/);
  assert.match(edgeFunction, /executionKey/);
  assert.match(edgeFunction, /INVALID_OR_DUPLICATE_VECTOR/);
});

test("OpenAPI schema exposes only the compact read and canonical write operations", () => {
  assert.match(openApi, /operationId: getKleosEvaluationEvidence/);
  assert.match(openApi, /operationId: persistKleosEvaluation/);
  assert.match(openApi, /name: x-kleos-bot-token/);
  assert.match(openApi, /x-openai-isConsequential: false/);
  assert.match(openApi, /x-openai-isConsequential: true/);
  assert.match(openApi, /minItems: 8/);
  assert.match(openApi, /maxItems: 8/);
  assert.doesNotMatch(openApi, /financial_recent_transactions/);
});

test("Shortcut documentation makes the phone a trigger rather than an evidence transport", () => {
  assert.match(transportDoc, /The Shortcut must not retrieve, serialize, transform, or inject evidence JSON\./i);
  assert.match(transportDoc, /Ask ChatGPT/);
  assert.match(transportDoc, /Run one Kleos vector evaluation\./);
  assert.match(transportDoc, /Remove the old \*\*Get Contents of URL\*\*/i);
  assert.match(transportDoc, /getKleosEvaluationEvidence/);
  assert.match(transportDoc, /persistKleosEvaluation/);
});
