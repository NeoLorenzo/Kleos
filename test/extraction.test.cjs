const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const persistedGoatTables = [
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

const activeClientTables = [
  "heracles_strength_metrics",
  ...persistedGoatTables.filter(
    (table) => table !== "goat_score_entries" && table !== "goat_strength_lifts"
  )
];

test("Kleos client data layer covers active UI tables without loading retired GOAT score or manual strength history", () => {
  const source = read("lib/kleos/data.js");

  for (const table of activeClientTables) {
    assert.match(source, new RegExp(`\\b${table}\\b`), `missing ${table} from data layer`);
  }

  assert.doesNotMatch(source, /\bgoat_score_entries\b/);
  assert.doesNotMatch(source, /\bgoat_strength_lifts\b/);
  assert.match(source, /AUTHORIZED_KLEOS_EMAIL/);
});

test("Kleos root is independent from Ariadne and uses the character-sheet orientation", () => {
  const rootSource = read("app/page.js");
  const workspaceSource = read("components/KleosWorkspace.jsx");
  const source = `${rootSource}\n${workspaceSource}`;

  assert.doesNotMatch(source, /components\/AppShell/);
  assert.doesNotMatch(source, /githubProviderToken/);
  assert.doesNotMatch(source, /buildKleosScorePrompt/);
  assert.doesNotMatch(source, /Copy LLM Context/);
  assert.match(rootSource, /KleosWorkspace/);
  assert.match(rootSource, /activePage="character-sheet"/);
  assert.match(workspaceSource, /CharacterSheet/);
  assert.match(workspaceSource, /loadKleosData/);
  assert.match(workspaceSource, /window\.location\.origin/);
});

test("legacy Kleos prompt module retains the migrated evaluation domains without owning the root UI", () => {
  const source = read("lib/kleos/prompt.js");
  const rootSource = read("app/page.js");
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
  assert.doesNotMatch(rootSource, /lib\/kleos\/prompt/);
});

test("Kleos source control owns the migrated persistence boundary", () => {
  const schema = read("supabase/schema.sql");

  for (const table of persistedGoatTables) {
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
  assert.match(persistenceReadme, /shar(?:e|es|ed|ing)/i);
  assert.match(persistenceReadme, /Kleos/i);
});
