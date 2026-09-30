const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("public model scores synthetic examples with the canonical methodology", () => {
  const model = read("components/public/publicModel.js");
  assert.match(model, /from "@\/lib\/kleos\/vectorMethodology\.mjs"/);
  assert.match(model, /aggregateVectorSubdomains/);
  assert.match(model, /KLEOS_VECTOR_METHODOLOGY\.vectors/);
  assert.doesNotMatch(model, /score:\s*\d+(\.\d+)?,\s*confidence:\s*"(low|medium|high)",\s*coverage/);
});

test("methodology simulator runs the canonical aggregation, not a local copy", () => {
  const simulator = read("components/public/ModelSimulator.jsx");
  assert.match(simulator, /aggregateVectorSubdomains\(subdomains\)/);
  assert.match(simulator, /COVERAGE_CAPS/);
  assert.doesNotMatch(simulator, /function aggregate/);
});

test("public surface exposes every explanatory section it links to", async () => {
  const site = read("components/KleosPublicSite.jsx");
  for (const id of ["how-it-works", "vectors", "methodology", "use-cases", "fabbro-context"]) {
    assert.match(site, new RegExp(`id="${id}"`));
    if (id !== "fabbro-context") assert.match(site, new RegExp(`href="#${id}"`));
  }
});
