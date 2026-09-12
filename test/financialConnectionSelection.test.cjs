const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const financialWorkspacePath = path.join(process.cwd(), "components/FinancialWorkspace.jsx");

test("Financial workspace prefers a usable synced connection over a newer pending reconnect", () => {
  const source = fs.readFileSync(financialWorkspacePath, "utf8");

  assert.match(source, /const connection = selectPreferredConnection\(connections\)/);
  assert.match(source, /provider_session_id && connection\?\.last_synced_at/);
  assert.match(source, /invalidStatuses\.has\(status\)/);
  assert.match(source, /connectionRecency\(right\) - connectionRecency\(left\)/);
  assert.doesNotMatch(source, /const connection = connections\?\.\[0\] \|\| null/);
});
