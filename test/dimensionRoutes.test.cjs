const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const DIMENSIONS = [
  "physical",
  "psychological",
  "intellectual",
  "professional",
  "financial",
  "relational",
  "creative",
  "experiential"
];

test("Kleos exposes a dashboard plus all eight dimension routes", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "app", "page.js")));

  for (const dimension of DIMENSIONS) {
    const pagePath = path.join(ROOT, "app", dimension, "page.js");
    assert.ok(fs.existsSync(pagePath), `missing route for ${dimension}`);
    const source = fs.readFileSync(pagePath, "utf8");
    assert.match(source, new RegExp(`activePage="${dimension}"`));
  }
});

test("navigation is driven by the canonical nine-page route registry", () => {
  const routeSource = fs.readFileSync(path.join(ROOT, "lib", "kleos", "routes.js"), "utf8");
  const navSource = fs.readFileSync(path.join(ROOT, "components", "KleosNav.jsx"), "utf8");

  assert.match(routeSource, /character-sheet/);
  assert.match(routeSource, /VECTOR_DEFINITIONS\.map/);
  assert.match(navSource, /KLEOS_PAGES\.map/);
  assert.doesNotMatch(navSource, /psychological-assessment/);
});

test("psychological measurements live on the Psychological page, not the dashboard", () => {
  const workspaceSource = fs.readFileSync(
    path.join(ROOT, "components", "KleosWorkspace.jsx"),
    "utf8"
  );
  const characterSheetSource = fs.readFileSync(
    path.join(ROOT, "components", "CharacterSheet.jsx"),
    "utf8"
  );

  assert.match(workspaceSource, /case "psychological"/);
  assert.match(workspaceSource, /<BigFiveAssessments/);
  assert.match(workspaceSource, /<PsychologicalAssessment/);
  assert.doesNotMatch(characterSheetSource, /<BigFiveAssessments/);
});

test("character sheet links every canonical vector to its dimension page", () => {
  const characterSheetSource = fs.readFileSync(
    path.join(ROOT, "components", "CharacterSheet.jsx"),
    "utf8"
  );

  assert.match(characterSheetSource, /href=\{`\$\{basePath\}\/\$\{vector\.id\}\/`\}/);
  assert.match(characterSheetSource, /aria-label=\{`Open \$\{vector\.label\} dimension`\}/);
});

test("character sheet is one profile surface with integrated dimension trajectories", () => {
  const characterSheetSource = fs.readFileSync(
    path.join(ROOT, "components", "CharacterSheet.jsx"),
    "utf8"
  );
  const styleSource = fs.readFileSync(
    path.join(ROOT, "components", "CharacterSheet.module.css"),
    "utf8"
  );

  assert.match(characterSheetSource, /Character Sheet/);
  assert.match(characterSheetSource, /Character summary/);
  assert.match(characterSheetSource, /Current dimensional state/);
  assert.match(characterSheetSource, /buildCharacterSummary/);
  assert.match(characterSheetSource, /formatTrajectorySummary\(trajectory\)/);
  assert.match(characterSheetSource, /Key facts/);
  assert.doesNotMatch(characterSheetSource, /id="vector-history-title"/);
  assert.doesNotMatch(characterSheetSource, /Evidence & assessment/);
  assert.doesNotMatch(characterSheetSource, /buildCharacterEvidence/);
  assert.match(styleSource, /\.dimensionRow/);
  assert.match(styleSource, /\.factColumns/);
  assert.doesNotMatch(styleSource, /\.vectorCard/);
});

test("dimension state shows assessment only and does not duplicate current evidence", () => {
  const dimensionStateSource = fs.readFileSync(
    path.join(ROOT, "components", "DimensionState.jsx"),
    "utf8"
  );

  assert.match(dimensionStateSource, /Current assessment/);
  assert.match(dimensionStateSource, /<h3>Assessment<\/h3>/);
  assert.doesNotMatch(dimensionStateSource, /Current evidence/);
  assert.doesNotMatch(dimensionStateSource, /buildCharacterEvidence/);
});
