const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const goatTables = [
  "goat_score_entries",
  "goat_strength_lifts",
  "goat_cognitive_tests",
  "goat_academic_stage_results",
  "goat_academic_module_results",
  "goat_academic_notes",
  "goat_strength_profile",
  "goat_health_characteristics",
  "goat_cv_characteristics",
  "goat_immutable_characteristics",
  "goat_misc_characteristics"
];

test("Kleos data layer covers every migrated GOAT table", () => {
  const source = read("lib/kleos/data.js");

  for (const table of goatTables) {
    assert.match(source, new RegExp(`\\b${table}\\b`), `missing ${table} from data layer`);
  }

  assert.match(source, /AUTHORIZED_KLEOS_EMAIL/);
});

test("Kleos root is independent from Ariadne application shell", () => {
  const source = read("app/page.js");

  assert.doesNotMatch(source, /components\/AppShell/);
  assert.doesNotMatch(source, /githubProviderToken/);
  assert.match(source, /buildKleosScorePrompt/);
  assert.match(source, /loadKleosData/);
  assert.match(source, /window\.location\.origin/);
});

test("Kleos prompt retains the migrated evaluation domains", () => {
  const source = read("lib/kleos/prompt.js");
  const requiredSections = [
    "Cognitive Tests",
    "Strength and Physical Capability",
    "Academic Qualifications",
    "Health Characteristics",
    "Curriculum Vitae",
    "Immutable Characteristics",
    "Miscellaneous Characteristics"
  ];

  for (const section of requiredSections) {
    assert.ok(source.includes(section), `missing prompt section: ${section}`);
  }
});

test("Kleos source control owns the migrated persistence boundary", () => {
  const schema = read("supabase/schema.sql");

  for (const table of goatTables) {
    assert.ok(schema.includes(`public.${table}`), `missing ${table} from Kleos schema`);
  }

  assert.ok(schema.includes("enable row level security"));
  assert.ok(schema.includes("revoke all on table public.goat_score_entries from anon"));
  assert.ok(schema.includes("theneolorenzo@gmail.com"));
});

test("repository documentation records intentional shared Supabase infrastructure", () => {
  const readme = read("README.md");
  const persistenceReadme = read("supabase/README.md");

  assert.match(readme, /shared Supabase/i);
  assert.match(persistenceReadme, /shared/i);
  assert.match(persistenceReadme, /Kleos/i);
});
