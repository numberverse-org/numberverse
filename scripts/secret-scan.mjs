#!/usr/bin/env node
/**
 * Secrets hygiene scan (#126, #1779).
 *
 * Run:  node scripts/secret-scan.mjs                          (fast working-tree sweep)
 *       node scripts/secret-scan.mjs --history                (adds a bounded git-history sweep)
 *       node scripts/secret-scan.mjs --root /path/to/repo     (scan a different repo root)
 *
 * Scans the WORKING TREE for hardcoded-secret SHAPES (AWS keys, private key
 * blocks, GitHub tokens, generic high-entropy keys) and FAILS the build if any
 * are found. It covers tracked files (read from disk, so uncommitted edits are
 * seen), untracked files (respecting .gitignore), and — with --history — the
 * last 200 commits' diffs. This is a shape scan — it catches the *class* of
 * mistake, not a specific leak. Files that legitimately contain such shapes
 * (test fixtures, docs samples, the allowlist itself) go in ALLOWLIST.
 *
 * --history is an OPT-IN sweep intended for the nightly/release job (see the
 * owner of infra/deploy/scripts/release.sh). It prints informational HISTORY:
 * lines to stdout and never fails the build on its own; CI can decide what to
 * do with them. The default run stays fast and only scans the working tree.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";

// Repo root. `--root` overrides it (used by hermetic tests under /tmp).
const DEFAULT_ROOT = new URL("..", import.meta.url).pathname;

const argv = process.argv.slice(2);
let ROOT = DEFAULT_ROOT;
let HISTORY = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--history") HISTORY = true;
  else if (argv[i] === "--root") ROOT = resolvePath(argv[++i]);
  else if (argv[i].startsWith("--root=")) ROOT = resolvePath(argv[i].slice("--root=".length));
}

// Files we knowingly exempt — each has an inline reason.
const ALLOWLIST = new Map([
  ["scripts/secret-scan.mjs", "the scan itself (patterns below)"],
  ["scripts/test-secret-scan.mjs", "the scan's own test (builds AKIA/… shapes on purpose)"],
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

const SRC_EXT_RE = /\.(ts|tsx|js|mjs|py|sh|json|yml|yaml|html|css|go)$/;
// Untracked dirs we never scan even if .gitignore misses them.
const SKIP_DIR_RE = /(?:^|\/)node_modules\/|(?:^|\/)\.venv\/|(?:^|\/)__pycache__\//;
// Keyword smell that makes a long alnum run look like a secret assignment.
const KEYWORD_RE = /(key|token|secret|pass|auth|bearer|apikey|api_key)/i;
// A plain assignment "=" — NOT part of ==, ===, !=, <=, >=, =>, +=, etc.
const ASSIGN_EQ_RE = /(^|[^=!<>+*\/%])=(?![=<>])/;
// Known env-var-name signals for the adjacent-value high-entropy rule.
const ENV_SIGNALS = [
  /^\s*(?:export\s+)?[A-Z][A-Z0-9_]{2,}\s*=\s*/,
  /NV_[A-Z0-9_]{2,}\s*=\s*/,
  /process\.env\.[A-Z0-9_]{2,}\s*=\s*/,
];
const LONG_RUN_RE = /[A-Za-z0-9]{40,}/;
const ENV_VALUE_RUN_RE = /[A-Za-z0-9+/=_-]{40,}/;

function git(args) {
  return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

/**
 * Old keyword-required high-entropy rule: an actual assignment "=" followed by
 * a 40+ alnum run, plus a keyword (key/token/secret/…) somewhere on the line.
 * Comparison operators (==, !==, <=, …) do NOT count as assignments, so a line
 * like `assert h == "e3b0…2b855"` in a test vector stays quiet.
 */
function highEntropyRun(line) {
  const eq = line.match(ASSIGN_EQ_RE);
  if (!eq) return null;
  if (!KEYWORD_RE.test(line)) return null;
  const tail = line.slice(eq.index + eq[0].length);
  const m = tail.match(LONG_RUN_RE);
  if (m && !m[0].startsWith("CHANGE_ME")) return m[0];
  return null;
}

/**
 * Second high-entropy rule (#1779): a long alnum run assigned adjacent to a
 * known env-var name (NV_X=…, FOO_BAR=…, export FOO=…, process.env.X=…) must be
 * flagged even when the line has no inline key/token/secret keyword. URLs are
 * paths, not tokens; CHANGE_ME placeholders are never real secrets.
 */
function envAdjacentRun(line) {
  for (const sig of ENV_SIGNALS) {
    const sm = line.match(sig);
    if (!sm) continue;
    const value = line.slice(sm.index + sm[0].length);
    if (/:\/\//.test(value)) continue; // a URL default value, not a token
    const m = value.match(ENV_VALUE_RUN_RE);
    if (m && !m[0].startsWith("CHANGE_ME")) return m[0];
  }
  return null;
}

/** Scan one file's source; onHit(lineNo, patternName, matchText). Returns hit count. */
function scanSrc(src, onHit) {
  let hits = 0;
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const run = highEntropyRun(lines[i]) || envAdjacentRun(lines[i]);
    if (run) {
      hits++;
      onHit(i + 1, "high-entropy token", run);
    }
  }
  for (const { name, re } of PATTERNS) {
    if (name === "high-entropy token") continue; // handled line-by-line above
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      if (m[0].startsWith("CHANGE_ME")) continue;
      const lineNo = src.slice(0, m.index).split("\n").length;
      hits++;
      onHit(lineNo, name, m[0]);
    }
  }
  return hits;
}

// 1. Working-tree enumeration: tracked (git ls-files -c) read from DISK so
// uncommitted edits are seen, PLUS untracked non-ignored files. Deleted-from-
// disk tracked files are skipped (nothing to scan). ALLOWLIST stays path-based.
let tracked, untracked;
try {
  tracked = git(["ls-files", "-c"]).split("\n").filter(Boolean);
  untracked = git(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
} catch (e) {
  console.error("✖ could not list working-tree files:", e.message);
  process.exit(1);
}

let hits = 0;
let checked = 0;
const seen = new Set();
for (const f of [...tracked, ...untracked]) {
  if (seen.has(f)) continue;
  seen.add(f);
  if (ALLOWLIST.has(f)) continue;
  if (!SRC_EXT_RE.test(f)) continue;
  if (SKIP_DIR_RE.test(f)) continue;
  const full = join(ROOT, f);
  if (!existsSync(full)) continue; // deleted from disk → nothing to scan
  let src;
  try {
    src = readFileSync(full, "utf8");
  } catch {
    try {
      src = git(["show", `HEAD:${f}`]);
    } catch {
      continue; // binary or otherwise unreadable
    }
  }
  checked++;
  hits += scanSrc(src, (lineNo, name, run) => {
    console.error(`  ✖ ${f}:${lineNo}: ${name} (${run.slice(0, 24)}…)`);
  });
}

console.log(`Secret scan: ${checked} working-tree files checked`);

// 2. Optional bounded history sweep (#1779). Informational only — prints
// HISTORY: lines to stdout and never changes the exit code.
if (HISTORY) historySweep();

function historySweep() {
  let log;
  try {
    log = git(["log", "-p", "--all", "--max-count=200", "--no-color"]);
  } catch (e) {
    console.error(`  ! history sweep unavailable: ${e.message}`);
    return;
  }
  let infoHits = 0;
  let commits = 0;
  let short = "????";
  let file = null;
  let newLine = 0;
  let inHunk = false;
  for (const line of log.split("\n")) {
    if (line.startsWith("commit ")) {
      short = line.slice("commit ".length, "commit ".length + 8);
      commits++;
      file = null;
      inHunk = false;
      continue;
    }
    if (line.startsWith("diff --git ")) {
      file = null;
      inHunk = false;
      continue;
    }
    const plusFile = line.match(/^\+{3} b\/(.+)$/);
    if (plusFile) {
      file = plusFile[1];
      continue;
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      inHunk = true;
      continue;
    }
    if (!inHunk || !file) continue;
    if (line.startsWith("+") && !line.startsWith("+++")) {
      if (!ALLOWLIST.has(file) && SRC_EXT_RE.test(file)) {
        const content = line.slice(1);
        const run = highEntropyRun(content) || envAdjacentRun(content);
        if (run) {
          infoHits++;
          console.log(`HISTORY: ${short}:${file}:${newLine}: high-entropy token (${run.slice(0, 24)}…)`);
        }
        for (const { name, re } of PATTERNS) {
          if (name === "high-entropy token") continue;
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(content))) {
            if (m[0].startsWith("CHANGE_ME")) continue;
            infoHits++;
            console.log(`HISTORY: ${short}:${file}:${newLine}: ${name} (${m[0].slice(0, 24)}…)`);
          }
        }
      }
      newLine++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      // removed line — not present in the new file
    } else if (line.startsWith("\\") || line === "") {
      // "\ No newline at end of file" marker / blank line
    } else {
      newLine++; // context line — present in the new file
    }
  }
  console.log(`History sweep: ${commits} commits, ${infoHits} informational HISTORY hit(s)`);
}

if (hits) {
  console.error(`✖ ${hits} hardcoded-secret shape(s). Remove them or add a justified ALLOWLIST entry.`);
  process.exit(1);
}
console.log("✓ no hardcoded-secret shapes in the working tree");
