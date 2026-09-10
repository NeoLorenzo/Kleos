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

test("dashboard links every canonical vector to its dimension page", () => {
  const characterSheetSource = fs.readFileSync(
    path.join(ROOT, "components", "CharacterSheet.jsx"),
    "utf8"
  );

  assert.match(characterSheetSource, /href=\{`\$\{basePath\}\/\$\{vector\.id\}\/`\}/);
  assert.match(characterSheetSource, /Open \{vector\.label\}/);
});
