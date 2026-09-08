import fs from "node:fs";
import path from "node:path";

const defaultRoots = ["app", "components", "lib", "public"];
const requestedRoots = process.argv.slice(2);
const roots = requestedRoots.length ? requestedRoots : defaultRoots;
const forbidden = [
  { label: "Supabase service role key", pattern: /service_role/i },
  { label: "Supabase secret key", pattern: /sb_secret_[A-Za-z0-9_-]+/ },
  { label: "private key material", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: "generic secret assignment", pattern: /(?:password|client_secret|jwt_secret)\s*[:=]\s*["'][^"']{8,}["']/i }
];

const textExtensions = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".json",
  ".css",
  ".html",
  ".htm",
  ".md",
  ".svg",
  ".txt",
  ".xml",
  ".map",
  ".webmanifest"
]);
const violations = [];
const missingRoots = [];

for (const root of roots) {
  if (fs.existsSync(root)) {
    walk(root);
  } else if (requestedRoots.length) {
    missingRoots.push(root);
  }
}

if (missingRoots.length) {
  console.error("Privacy check failed: requested scan root does not exist.");
  for (const root of missingRoots) {
    console.error(`- ${root}`);
  }
  process.exit(1);
}

if (violations.length) {
  console.error("Privacy check failed:");
  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.label}`);
  }
  process.exit(1);
}

console.log(`Privacy check passed for: ${roots.join(", ")}`);

function walk(target) {
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target)) {
      walk(path.join(target, entry));
    }
    return;
  }

  if (!textExtensions.has(path.extname(target))) {
    return;
  }

  const content = fs.readFileSync(target, "utf8");
  for (const rule of forbidden) {
    if (rule.pattern.test(content)) {
      violations.push({ file: target, label: rule.label });
    }
  }
}
