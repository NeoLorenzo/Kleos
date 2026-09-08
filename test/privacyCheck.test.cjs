const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const privacyCheck = path.join(root, "scripts", "privacy-check.mjs");

function makeFixture(t) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "kleos-privacy-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  return fixture;
}

function runPrivacyCheck(scanRoot) {
  return spawnSync(process.execPath, [privacyCheck, scanRoot], {
    cwd: root,
    encoding: "utf8"
  });
}

test("privacy scanner rejects forbidden secrets in JSX client components", (t) => {
  const fixture = makeFixture(t);
  const components = path.join(fixture, "components");
  fs.mkdirSync(components);
  fs.writeFileSync(
    path.join(components, "Example.jsx"),
    'export const client_secret = "definitely-not-public";\n'
  );

  const result = runPrivacyCheck(components);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Example\.jsx/);
  assert.match(result.stderr, /generic secret assignment/);
});

test("privacy scanner rejects forbidden material in generated export artifacts", (t) => {
  const fixture = makeFixture(t);
  const out = path.join(fixture, "out");
  fs.mkdirSync(out);
  fs.writeFileSync(
    path.join(out, "index.html"),
    '<script>window.runtimeSecret = "sb_secret_forbidden_fixture";</script>\n'
  );

  const result = runPrivacyCheck(out);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /index\.html/);
  assert.match(result.stderr, /Supabase secret key/);
});

test("privacy scanner allows intentionally public Supabase publishable configuration", (t) => {
  const fixture = makeFixture(t);
  fs.writeFileSync(
    path.join(fixture, "config.js"),
    'export const NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_public_fixture";\n'
  );

  const result = runPrivacyCheck(fixture);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Privacy check passed/);
});

test("privacy scanner fails closed when an explicitly requested root is missing", (t) => {
  const fixture = makeFixture(t);
  const missing = path.join(fixture, "out");

  const result = runPrivacyCheck(missing);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /requested scan root does not exist/);
});
