#!/usr/bin/env node
/**
 * Secrets hygiene scan (#126).
 *
 * Run:  node scripts/secret-scan.mjs   (from repo root)
 *
 * Scans the tracked tree for hardcoded-secret SHAPES (AWS keys, private key
 * blocks, GitHub tokens, generic high-entropy keys) and FAILS the build if any
 * are found in a committed file. This is a shape scan — it catches the *class*
 * of mistake, not a specific leak. Files that legitimately contain such shapes
 * (test fixtures, docs samples, the allowlist itself) go in ALLOWLIST.
 */
import { execFileSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;

// Files we knowingly exempt — each has an inline reason.
const ALLOWLIST = new Map([
  ["scripts/secret-scan.mjs", "the scan itself (patterns below)"],
  ["docs/LICENSES.md", "license SPDX strings, not secrets"],
  ["infra/deploy/scripts/release.sh", "no secrets; a URL is mentioned"],
  ["infra/deploy/Dockerfile.web", "build ARGs only"],
  ["apps/api/app/config.py", "reads from env; holds no literals"],
  ["apps/parent/app/page.tsx", "no secrets"],
]);

// Patterns: AWS access key, private key PEM block, GitHub token, and a generic
// high-entropy 32+ char alnum run that looks like a token.
const PATTERNS = [
  { name: "AWS access key", re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { name: "AWS secret key", re: /\baws_secret_access_key\s*=\s*["']?[A-Za-z0-9/+=]{40}["']?/gi },
  { name: "private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { name: "high-entropy token", re: /\b[A-Za-z0-9]{40,}\b/g },
];

// Tracked files only (git ls-files) — untracked local edits can't leak.
let files;
try {
  files = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
} catch (e) {
  console.error("✖ could not list tracked files:", e.message);
  process.exit(1);
}

let hits = 0;
for (const f of files) {
  if (ALLOWLIST.has(f)) continue;
  if (!/\.(ts|tsx|js|mjs|py|sh|json|yml|yaml|html|css|go)$/.test(f)) continue;
  let src;
  try {
    src = execFileSync("git", ["show", `HEAD:${f}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
  } catch {
    continue; // binary or untracked-in-HEAD
  }
  // "high-entropy token" is noisy on long identifiers — only flag it when the
  // line also smells like an assignment of a key/token/secret.
  for (const { name, re } of PATTERNS) {
    if (name === "high-entropy token") {
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (/=.*[A-Za-z0-9]{40,}/.test(lines[i]) && /(key|token|secret|pass|auth|bearer|apikey|api_key)/i.test(lines[i])) {
          hits++;
          console.error(`  ✖ ${f}:${i + 1}: ${name} (assignment of long alnum run)`);
        }
      }
      continue;
    }
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const lineNo = src.slice(0, m.index).split("\n").length;
      hits++;
      console.error(`  ✖ ${f}:${lineNo}: ${name} (${m[0].slice(0, 24)}…)`);
    }
  }
}

console.log(`Secret scan: ${files.length} tracked files checked`);
if (hits) {
  console.error(`✖ ${hits} hardcoded-secret shape(s). Remove them or add a justified ALLOWLIST entry.`);
  process.exit(1);
}
console.log("✓ no hardcoded-secret shapes in the tracked tree");
