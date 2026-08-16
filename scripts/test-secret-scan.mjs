#!/usr/bin/env node
/**
 * Self-contained tests for #1779 — secret-scan covers the working tree
 * (untracked + uncommitted edits) and git history.
 *
 * Run:  node scripts/test-secret-scan.mjs
 *
 * Builds hermetic temp git repos under /tmp (never touches this repo's git)
 * and asserts the scan's exit codes + output for tracked / untracked /
 * env-var-adjacent / CHANGE_ME / history / clean cases. Plain node asserts,
 * no npm deps.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "secret-scan.mjs");

// Build the AWS demo key at runtime so THIS file never contains the contiguous
// literal shape (the repo-root regression case scans this file too).
const AKIA = "AKIA" + "IOSFODNN7EXAMPLE";

let fails = 0;
const repos = [];
const check = (name, ok, extra = "") => {
  if (ok) console.log(`  ✓ ${name}`);
  else { fails++; console.error(`  ✖ ${name}${extra ? " — " + extra : ""}`); }
};

const run = (args) => {
  try {
    const out = execFileSync("node", [SCRIPT, ...args], { encoding: "utf8" });
    return { code: 0, out, err: "" };
  } catch (e) {
    return { code: e.status ?? 1, out: e.stdout ?? "", err: e.stderr ?? "" };
  }
};

const git = (repo, ...args) =>
  execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();

const mkrepo = () => {
  const repo = mkdtempSync(join(tmpdir(), "nv-secscan-"));
  repos.push(repo);
  git(repo, "init", "-q");
  git(repo, "config", "user.email", "secscan-test@example.com");
  git(repo, "config", "user.name", "SecScan Test");
  return repo;
};

const commitAll = (repo, msg) => {
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", msg);
};

console.log("①  Tracked working-tree secret — read from DISK, not HEAD…");
{
  const repo = mkrepo();
  writeFileSync(join(repo, "leaked.ts"), `const K = "${AKIA}";\n`);
  commitAll(repo, "add key");
  const r = run(["--root", repo]);
  check("tracked working-tree AKIA key reported (exit 1)",
    r.code === 1 && r.err.includes("AWS access key"),
    JSON.stringify(r.err.slice(0, 200)));
}

console.log("②  History sweep — secret removed from the working tree…");
{
  const repo = mkrepo();
  writeFileSync(join(repo, "leaked.ts"), `const K = "${AKIA}";\n`);
  commitAll(repo, "add key");
  writeFileSync(join(repo, "leaked.ts"), "const K = 1;\n");
  commitAll(repo, "remove key");

  const r0 = run(["--root", repo]);
  check("working tree clean after key removed (exit 0)",
    r0.code === 0,
    JSON.stringify(r0.err.slice(0, 200)));

  const rh = run(["--root", repo, "--history"]);
  check("--history surfaces the removed key",
    rh.code === 0 && /HISTORY: [0-9a-f]{8}:leaked\.ts:\d+: AWS access key/.test(rh.out),
    JSON.stringify(rh.out.slice(0, 300)));
}

console.log("③  Untracked-file case — a file never committed must still be scanned…");
{
  const repo = mkrepo();
  writeFileSync(join(repo, "safe.ts"), "export const ok = 1;\n");
  commitAll(repo, "init");
  writeFileSync(join(repo, "untracked.ts"), `const K = "${AKIA}";\n`);
  const r = run(["--root", repo]);
  check("untracked .ts AKIA key reported (exit 1)",
    r.code === 1 && r.err.includes("untracked.ts"),
    JSON.stringify(r.err.slice(0, 200)));
}

console.log("④  Env-var-adjacent rule — no inline keyword needed…");
{
  const repo = mkrepo();
  const val = "QzPz" + "a".repeat(40);
  // Name deliberately has NO key/token/secret keyword in it.
  writeFileSync(join(repo, "env.ts"), `const NV_GATEWAY_0 = "${val}";\n`);
  commitAll(repo, "env");
  const r = run(["--root", repo]);
  check("NV_ env-var-adjacent 40+ run flagged without keyword (exit 1)",
    r.code === 1 && r.err.includes("high-entropy token"),
    JSON.stringify(r.err.slice(0, 200)));
}

console.log("⑤  CHANGE_ME placeholder guard…");
{
  const repo = mkrepo();
  const val = "CHANGE_ME_" + "a".repeat(40);
  writeFileSync(join(repo, "placeholder.ts"), `NV_GATEWAY_0=${val}\n`);
  commitAll(repo, "placeholder");
  const r = run(["--root", repo]);
  check("CHANGE_ME placeholder NOT flagged (exit 0)",
    r.code === 0,
    JSON.stringify(r.err.slice(0, 200)));
}

console.log("⑥  Clean temp repo exits 0…");
{
  const repo = mkrepo();
  writeFileSync(join(repo, "ok.ts"), "export const ok = 1;\n");
  commitAll(repo, "init");
  const r = run(["--root", repo]);
  check("clean temp repo exits 0 with summary",
    r.code === 0 && r.out.includes("working-tree files checked"),
    JSON.stringify((r.out + r.err).slice(0, 200)));
}

console.log("⑦  Repo-root regression — this tree must stay clean…");
{
  const r = run([]);
  check("repo root clean run exits 0",
    r.code === 0 && r.out.includes("working-tree files checked"),
    JSON.stringify((r.out + r.err).slice(0, 300)));
}

for (const repo of repos) rmSync(repo, { recursive: true, force: true });
console.log();
if (fails) { console.error(`✖ ${fails} FAILURE(S)`); process.exit(1); }
console.log("✓ secret-scan working-tree + history coverage holds (#1779)");
