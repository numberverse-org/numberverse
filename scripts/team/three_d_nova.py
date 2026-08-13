#!/usr/bin/env python3
"""🦉 3D Nova — file the bold-move roadmap as GitHub issues.

Reads docs/plans/3d-nova-pipeline.md §8 and files the phased roadmap into the
pipeline as GitHub issues under the `v32 — 3D Nova island` milestone. Each issue
carries Goal + Done-when acceptance criteria the Oracle can gate.

Run:  python3 scripts/team/three_d_nova.py [--create]
      (no --create = dry-run)
"""
import sys, json, subprocess

REPO = "numberverse-org/numberverse"
MILESTONE = "v32 — 3D Nova island"
CREATE = "--create" in sys.argv

# (title, priority, labels, goal, [done-when criteria])
SPEC = [
    ("3D Nova: lazy three.js island + WebGL context lifecycle", "high",
     ["feature", "kid-first"],
     "Mount a lazy-loaded @react-three/fiber <Canvas> that hosts the 3D Nova island without disturbing the Phaser learning games.",
     [
        "react.lazy() dynamic-import chunk for three + R3F + drei (core bundle stays <1.5MB)",
        "R3F canvas unmounts (renderer.dispose + forceContextLoss) before any Phaser learning game mounts",
        "Only one WebGL context ever hot at a time; no context-leak after 20 mount/unmount cycles",
        "Oracle standup SHIP-OK",
     ]),
    ("3D Nova: deterministic glTF asset pipeline (Blender → glTF-Transform)", "high",
     ["feature", "documentation"],
     "A committed, idempotent build script that turns the Blender Nova rig into a compressed .glb.",
     [
        "scripts/team/build_nova_glb.sh runs gltf-transform: meshopt geometry+morph+animation, KTX2 (ETC1S base-color, UASTC normal/ORM)",
        "Output nova.glb < 2 MiB committed to apps/kid/public/assets/",
        "Blender source (.blend or .gltf) committed so the pipeline is reproducible",
     ]),
    ("3D Nova: stylized-realistic owl model (armature + morph targets)", "high",
     ["feature", "kid-first"],
     "The stylized-realistic Nova owl: skeletal armature for body poses + blend-shape morph targets for facial expressions.",
     [
        "20–40k triangle owl; base-color 2048² + normal/ORM 1024², PBR",
        "Armature clips for the core poses (idle, walk, hop, fly, spin, dance)",
        "Morph targets for happy/sad/scared/excited/sleepy/grumpy",
        "Loads via AnimationMixer in three.js; no Draco (Meshopt only)",
     ]),
    ("3D Nova: home room, PBR lighting, soft shadow, orbit camera", "medium",
     ["feature", "kid-first"],
     "The 3D home: rooms rebuilt in 3D, one directional light + 1024² PCF soft shadow, orbit/zoom camera.",
     [
        "6 existing rooms represented in 3D",
        "Single draw-call owl + <100 total scene draw calls",
        "Camera orbit/zoom with reduced-motion clamps",
     ]),
    ("3D Nova: spatial activities (re-host 41+20, add 3D-native)", "high",
     ["feature", "kid-first"],
     "Re-host the 41 activities + 20 pet mini-games as 3D spatial actions, plus new 3D-only activities.",
     [
        "OwlRig.ts maps every existing activity id → clip + morph combo",
        "3D-native additions: walk Nova, orbit/zoom, 3D feed/pet/bathe, 3D dress-up",
        "i18n EN+BN for every new action; audit.mjs clean",
     ]),
    ("3D Nova: wire garden, coins, outfits, species to the 3D owl", "medium",
     ["feature", "kid-first"],
     "Reuse store.ts (unchanged) so growth, rewards, outfits, and species drive the 3D owl's appearance.",
     [
        "petStage/species reflect in the 3D model (egg→grown per species)",
        "Outfits visually attach in 3D; coins/rewards still respect NOVA_DAILY_CAP",
        "Garden growth still rewards (no silent dead-ends)",
     ]),
    ("3D Nova: performance + reduced-motion + WCAG flash safety", "medium",
     ["guardrail", "polish"],
     "Hold 60fps on mid-range Android and honor vestibular/WCAG safety.",
     [
        "Half-res render + CSS upscale under load; dynamic resolution",
        "prefersReducedMotion(): no idle bob, opacity-fade instead of scale/pulse, camera clamped",
        "No flash > 3/s; no saturated-red flashes anywhere",
        "aria-label on canvas; spoken feedback still fires without motion",
     ]),
    ("3D Nova: offline precache (Workbox 5 MiB) + Oracle 3D-Nova-Perf role + release", "medium",
     ["documentation", "guardrail"],
     "Make the 3D island fully offline and add an Oracle role that gates its perf/a11y.",
     [
        "vite.config.ts Workbox maximumFileSizeToCacheInBytes = 5 MiB + nova.glb precached",
        "New Oracle role '3D Nova Perf': island chunk <1MB, glb <2MiB, no red flash, reduced-motion honored",
        "Island rides release.sh; CHANGELOG documents v32",
     ]),
]

def sh(args):
    return subprocess.run(args, capture_output=True, text=True)

def existing_titles():
    out = sh(["gh", "issue", "list", "--repo", REPO, "--state", "all", "--limit", "1000",
              "--json", "title"])
    try:
        return {t["title"] for t in json.loads(out.stdout)}
    except Exception:
        return set()

def ensure_milestone():
    out = sh(["gh", "api", f"repos/{REPO}/milestones", "--jq", ".[].title"])
    if MILESTONE in out.stdout.splitlines():
        return
    sh(["gh", "api", f"repos/{REPO}/milestones", "-f", f"title={MILESTONE}",
        "-f", "description=3D Nova island — stylized-realistic owl in three.js, lazy-loaded"])

def body(goal, done):
    parts = ["## Goal", goal, "", "## Done when"]
    parts += [f"- [ ] {d}" for d in done]
    return "\n".join(parts)

def main():
    specs = [{"title": t, "priority": p, "labels": l, "body": body(g, d)}
             for (t, p, l, g, d) in SPEC]
    print(f"🦉 3D Nova · {len(specs)} issues · milestone: {MILESTONE}\n")
    for i, s in enumerate(specs, 1):
        print(f"{i:>2} [{s['priority']:<6}] {s['title']}")
    if not CREATE:
        print("\n(dry run — re-run with --create)")
        return 0
    ensure_milestone()
    ex = existing_titles()
    created, skipped, errors = [], [], []
    for i, s in enumerate(specs, 1):
        if s["title"] in ex:
            skipped.append(s["title"]); continue
        args = ["gh", "issue", "create", "--repo", REPO, "--title", s["title"],
                "--body", s["body"], "--milestone", MILESTONE,
                "--label", f"priority: {s['priority']}", "--label", "status: backlog"]
        for l in s["labels"]:
            args += ["--label", l]
        r = sh(args)
        url = r.stdout.strip().splitlines()[-1] if r.stdout.strip() else None
        if r.returncode == 0 and url:
            created.append((s["title"], url))
        else:
            errors.append((s["title"], (r.stderr or r.stdout).strip()[:120]))
    print(f"\nTOTAL {len(specs)} | created {len(created)} | skipped {len(skipped)} | errors {len(errors)}")
    for t, e in errors:
        print(f"  ERROR {t}: {e}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
