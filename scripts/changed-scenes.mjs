#!/usr/bin/env node
/**
 * #1999 — map the PR's changed scene files to scene keys for the playability
 * sweep (e2e/scene-playability.spec.ts), so PR CI only boots the scenes a PR
 * actually touched (release runs the FULL sweep with NV_SWEEP_SCENES unset).
 *
 * The scene key is the class name = the `*Scene.ts` file's basename minus `.ts`
 * (every scene registers `super("<SameName>")`). We emit a comma-joined list on
 * stdout for `NV_SWEEP_SCENES`.
 *
 * Usage:  node scripts/changed-scenes.mjs [base-ref]
 *   base-ref defaults to "origin/main"; in CI use the merge base or HEAD^.
 */
import { execSync } from "node:child_process";

const base = process.argv[2] ?? "origin/main";

function git(...args) {
  return execSync(["git", ...args].join(" "), { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

let changed = "";
try {
  changed = git("diff", "--name-only", `${base}...HEAD`);
} catch {
  // base ref not present (fresh repo / shallow checkout) → fall back to the
  // working-tree diff against HEAD, so a PR with unstaged scene edits still runs.
  changed = git("diff", "--name-only", "HEAD") + "\n" + git("diff", "--name-only", "--cached", "HEAD");
}

const sceneKeys = new Set();
let hitSharedBase = false;
for (const line of changed.split("\n")) {
  const sceneMatch = line.match(/(?:^|\/)apps\/kid\/src\/game\/([A-Za-z0-9_]+)Scene\.ts$/);
  if (sceneMatch) sceneKeys.add(sceneMatch[1]);
  // A shared scene BASE is a non-`*Scene.ts` helper in game/ that scenes inherit
  // from (binSort/reorder/tapChoice/question/backgrounds/celebrate/ui/hints). A
  // change there fans out to every subclass — the diff won't name them directly.
  const baseMatch = line.match(/(?:^|\/)apps\/kid\/src\/game\/(binSort|reorder|tapChoice|question|backgrounds|celebrate|ui|hints)\.ts$/);
  if (baseMatch) hitSharedBase = true;
}

if (hitSharedBase) {
  // `__ALL__` = full sweep (the caller treats this as "sweep everything").
  console.log("__ALL__");
} else {
  // A comma list, or EMPTY when no scene file changed (the caller skips the
  // sweep entirely for empty — nothing was touched).
  console.log([...sceneKeys].join(","));
}
