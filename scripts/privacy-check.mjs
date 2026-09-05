import fs from "node:fs";
import path from "node:path";

const roots = ["app", "lib", "public"];
const forbidden = [
  { label: "Supabase service role key", pattern: /service_role/i },
  { label: "Supabase secret key", pattern: /sb_secret_[A-Za-z0-9_-]+/ },
  { label: "private key material", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: "generic secret assignment", pattern: /(?:password|client_secret|jwt_secret)\s*[:=]\s*["'][^"']{8,}["']/i }
];

const textExtensions = new Set([".js", ".mjs", ".json", ".css", ".md", ".svg", ".webmanifest"]);
const violations = [];

for (const root of roots) {
  if (fs.existsSync(root)) {
    walk(root);
  }
}

if (violations.length) {
  console.error("Privacy check failed:");
  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.label}`);
  }
  process.exit(1);
}

console.log("Privacy check passed.");

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
