const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function collectTextFiles(relativeDir, extensions) {
  const start = path.join(root, relativeDir);
  const files = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        files.push(full);
      }
    }
  }

  walk(start);
  return files;
}

test("Kleos adopts Fabbro Design System 0.1.2", () => {
  assert.equal(read("fabbro-design/VERSION").trim(), "0.1.2");

  const product = JSON.parse(read("fabbro-design/product.json"));
  assert.equal(product.version, "0.1.2");
  assert.equal(product.product, "Kleos");
  assert.equal(product.symbol, "Radiance");
  assert.equal(product.coreIdea, "Recognition");
  assert.equal(product.accent.toUpperCase(), "#CB30E0");

  const core = JSON.parse(read("fabbro-design/core.json"));
  assert.equal(core.version, "0.1.2");
  assert.equal(core.color.background.toUpperCase(), "#000000");
  assert.match(core.typography.familyPrimary, /Inter/);
});

test("Kleos application is wired to the canonical Fabbro snapshot", () => {
  const globals = read("app/globals.css");
  const layout = read("app/layout.js");
  const manifest = JSON.parse(read("public/manifest.webmanifest"));

  assert.match(globals, /@import "\.\.\/fabbro-design\/fabbro-tokens\.css";/);
  assert.match(layout, /data-fabbro-product="kleos"/);
  assert.equal(manifest.background_color.toUpperCase(), "#000000");
  assert.equal(manifest.theme_color.toUpperCase(), "#000000");
});

test("deployed Kleos brand assets match the approved snapshot", () => {
  assert.equal(
    read("public/brand/kleos-mark.svg"),
    read("fabbro-design/assets/Kleos Logo.svg")
  );
  assert.equal(
    read("public/brand/kleos-lockup.svg"),
    read("fabbro-design/assets/Kleos Logo Colored With Text Beside.svg")
  );
  assert.equal(
    read("public/brand/fabbro-mark.svg"),
    read("fabbro-design/assets/Fabbro Systems Logo.svg")
  );
  assert.equal(read("public/icon.svg"), read("fabbro-design/assets/Kleos Logo.svg"));
});

test("legacy Kleos brand violet and boxed-K identity do not return", () => {
  const forbidden = [
    "#a78bfa",
    "#7c3aed",
    "#8b5cf6",
    "rgba(124, 58, 237",
    "rgba(167, 139, 250"
  ];

  const files = [
    ...collectTextFiles("app", [".css", ".js", ".jsx"]),
    ...collectTextFiles("components", [".css", ".js", ".jsx"]),
    ...collectTextFiles("public", [".svg", ".json", ".webmanifest"])
  ];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8").toLowerCase();
    for (const legacy of forbidden) {
      assert.equal(
        content.includes(legacy.toLowerCase()),
        false,
        `${path.relative(root, file)} still contains legacy brand value ${legacy}`
      );
    }
  }

  const workspace = read("components/KleosWorkspace.jsx");
  assert.doesNotMatch(workspace, /className="access-mark">K</);
});
