const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { test, before } = require("node:test");
const path = require("node:path");

let bot;
let snapshotModel;

before(async () => {
  const snapshotSource = await readFile(path.join(process.cwd(), "lib/kleos/vectorSnapshots.js"), "utf8");
  const snapshotUrl = `data:text/javascript;base64,${Buffer.from(snapshotSource).toString("base64")}`;
  snapshotModel = await import(snapshotUrl);

  const botSource = await readFile(path.join(process.cwd(), "lib/kleos/kleosBotEvaluation.js"), "utf8");
  const patchedSource = botSource.replace(
    'from "@/lib/kleos/vectorSnapshots";',
    `from "${snapshotUrl}";`
  );
  bot = await import(`data:text/javascript;base64,${Buffer.from(patchedSource).toString("base64")}`);
});

function validResults() {
  return snapshotModel.VECTOR_IDS.map((vectorId, index) => index === 5
    ? {
        vectorId,
        status: "unknown",
        score: null,
        confidence: "unknown",
        commentary: "Insufficient evidence for a defensible relational assessment."
      }
    : {
        vectorId,
        status: "assessed",
        score: 60 + index,
        confidence: "medium",
        commentary: `Current canonical evidence supports ${vectorId}.`
      });
}

test("Kleos Bot owns stable evaluator and methodology metadata", () => {
  const result = bot.normalizeKleosBotEvaluation(
    { results: validResults() },
    { evaluatedAt: "2026-09-07T11:00:00+01:00" }
  );

  assert.equal(result.ok, true);
  assert.equal(result.value.evaluator, "kleos-bot");
  assert.equal(result.value.methodologyVersion, "1.0.0");
  assert.equal(result.value.runKey, "2026-W37:1.0.0");
});

test("weekly retries resolve to the same run key in Europe/Lisbon", () => {
  assert.equal(
    bot.buildKleosBotRunKey("2026-09-07T08:00:00+01:00"),
    bot.buildKleosBotRunKey("2026-09-13T20:00:00+01:00")
  );
  assert.notEqual(
    bot.buildKleosBotRunKey("2026-09-13T20:00:00+01:00"),
    bot.buildKleosBotRunKey("2026-09-14T08:00:00+01:00")
  );
});

test("malformed model output cannot become a persisted snapshot payload", () => {
  const missingVector = validResults().slice(0, 7);
  const result = bot.normalizeKleosBotEvaluation(
    { results: missingVector },
    { evaluatedAt: "2026-09-07T11:00:00+01:00" }
  );
  assert.equal(result.ok, false);
});

test("Kleos Bot preserves explicit unknown rather than inventing a score", () => {
  const result = bot.normalizeKleosBotEvaluation(
    { results: validResults() },
    { evaluatedAt: "2026-09-07T11:00:00+01:00" }
  );
  assert.equal(result.ok, true);
  const relational = result.value.results.find((item) => item.vectorId === "relational");
  assert.deepEqual(relational, {
    vectorId: "relational",
    status: "unknown",
    score: null,
    confidence: "unknown",
    commentary: "Insufficient evidence for a defensible relational assessment."
  });
});
