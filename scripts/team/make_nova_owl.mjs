/**
 * 🦉 #686/#687 — the stylized-realistic Nova owl, generated entirely from code.
 *
 * A production-style character rig with zero external DCC tooling:
 *
 *   • SKELETON — 13-bone armature (root/spine/neck/head/earL/earR/wingL/wingR/
 *     legL/legR/footL/footR/tail). Every vertex is rigidly bound (weight = 1)
 *     to one bone, so glTF exports real joints + inverse-bind matrices and
 *     three's AnimationMixer drives the poses.
 *   • SINGLE DRAW CALL (#687) — all 18 body/face parts are merged into ONE
 *     SkinnedMesh with ONE MeshStandardMaterial. All PBR maps are baked into
 *     shared atlases (4096² base + 2048² normal + 2048² ORM), and each part's
 *     UVs are remapped into its atlas rect — so the whole owl renders in a
 *     single WebGL draw call (design doc §1.3b: "1 draw call for Nova").
 *   • MORPH TARGETS — six facial expressions (happy/sad/scared/excited/sleepy/
 *     grumpy) as positional blend shapes on the head vertices, plus "open" on
 *     the beak halves — merged into 7 named targets on the single mesh.
 *   • PBR TEXTURES — procedural + deterministic (no canvas, no image files).
 *   • ANIMATION — six loopable clips sampled at 30 fps: idle, walk, hop, fly,
 *     spin, dance.
 *
 * Output: apps/kid/assets-src/nova_src.gltf (feeds build_nova_glb.sh →
 * nova.glb via Meshopt + KTX2). Pivot: feet at y=0.
 *
 *   node scripts/team/make_nova_owl.mjs [out.gltf]
 */
import * as THREE from "../../apps/kid/node_modules/three/build/three.module.js";
import { GLTFExporter } from "../../apps/kid/node_modules/three/examples/jsm/exporters/GLTFExporter.js";
import { mergeGeometries } from "../../apps/kid/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { polyfillBrowserGlobals, makeTexture, makeNormalMap, makeORM, fbm, valueNoise } from "./gltf_helpers.mjs";

polyfillBrowserGlobals();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
// #989 — keep the source .gltf outside public/ (Vite copies public/ verbatim,
// so an intermediate here would ship as dead dist weight).
const OUT = process.argv[2]
  ? join(process.cwd(), process.argv[2])
  : join(ROOT, "apps/kid/assets-src/nova_src.gltf");

// ───────────────────────────────── skeleton ─────────────────────────────────

function buildSkeleton() {
  const bones = {};
  const mk = (name, x, y, z, parent, rot) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    if (rot) b.rotation.set(...rot);
    if (parent) parent.add(b);
    bones[name] = b;
    return b;
  };
  const root = mk("root", 0, 0.92, 0, null);
  const spine = mk("spine", 0, 0.5, 0, root);
  const neck = mk("neck", 0, 0.42, 0, spine);
  const head = mk("head", 0, 0.3, 0, neck);
  mk("earL", -0.38, 0.42, -0.08, head, [-0.35, 0.5, 0]);
  mk("earR", 0.38, 0.42, -0.08, head, [-0.35, -0.5, 0]);
  // wings rest folded down (−z tilt); flap = animate z back toward 0/positive
  mk("wingL", 0.7, 0.08, -0.05, spine, [0, 0, -0.45]);
  mk("wingR", -0.7, 0.08, -0.05, spine, [0, 0, 0.45]);
  const legL = mk("legL", 0.22, 0.02, 0.05, root);
  const legR = mk("legR", -0.22, 0.02, 0.05, root);
  mk("footL", 0, -0.54, 0.1, legL);
  mk("footR", 0, -0.54, 0.1, legR);
  mk("tail", 0, -0.3, -0.6, spine);
  const list = ["root", "spine", "neck", "head", "earL", "earR", "wingL", "wingR", "legL", "legR", "footL", "footR", "tail"].map((n) => bones[n]);
  return { bones, list, skeleton: new THREE.Skeleton(list) };
}

// ───────────────────────────────── geometry parts ─────────────────────────────────

/** Lathe teardrop body (spine-local, pivot at chest). */
function bodyGeo() {
  const profile = [
    new THREE.Vector2(0.56, -0.52),
    new THREE.Vector2(0.64, -0.45),
    new THREE.Vector2(0.7, -0.35),
    new THREE.Vector2(0.74, -0.22),
    new THREE.Vector2(0.76, -0.08),
    new THREE.Vector2(0.75, 0.06),
    new THREE.Vector2(0.72, 0.18),
    new THREE.Vector2(0.66, 0.3),
    new THREE.Vector2(0.56, 0.38),
    new THREE.Vector2(0.44, 0.42),
    new THREE.Vector2(0.32, 0.44),
  ];
  return new THREE.LatheGeometry(profile, 72);
}

/** Cream belly — flattened sphere on the chest front (spine-local). */
function bellyGeo() {
  const g = new THREE.SphereGeometry(0.45, 48, 36);
  g.scale(1.05, 1.12, 0.52);
  g.translate(0, -0.04, 0.42);
  return g;
}

/** Head (head-local, face +z). Carries the 6 emotion morph targets. */
function headGeo() {
  return new THREE.SphereGeometry(0.62, 72, 52);
}

/** Curled feather leaf in the wing frame: span +x, chord +z, droop −y. */
function makeWingLeaf(span, chord, ws, hs, x, y, z, droop, sweep) {
  const g = new THREE.PlaneGeometry(span, chord, ws, hs);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const lx = p.getX(i);
    const cz = p.getY(i); // PlaneGeometry lies in XY; map Y→Z chord
    const u = 0.5 + lx / span; // 0 root … 1 tip
    const edge = Math.abs(cz) / (chord / 2); // 0 center … 1 edge
    const taper = 1 - 0.42 * u; // round the tip
    p.setXYZ(
      i,
      lx * taper + x,
      -droop * u * (1 + 0.25 * edge) - sweep * u * u + y,
      cz * taper + z
    );
  }
  g.computeVertexNormals();
  return g;
}

/** One wing: shoulder ball + three stacked feather leaves (wing-local). */
function wingGeo(mirror) {
  const parts = [];
  const shoulder = new THREE.SphereGeometry(0.24, 32, 24);
  shoulder.scale(0.7, 1.1, 0.6);
  shoulder.translate(0.12, 0.04, -0.02);
  parts.push(shoulder);
  parts.push(makeWingLeaf(0.72, 0.4, 16, 10, 0.42, -0.04, -0.06, 0.24, 0.12));
  parts.push(makeWingLeaf(0.62, 0.34, 14, 10, 0.72, -0.16, -0.03, 0.3, 0.16));
  parts.push(makeWingLeaf(0.5, 0.28, 12, 8, 0.94, -0.28, 0.0, 0.36, 0.2));
  const merged = mergeGeometries(parts);
  if (mirror) {
    merged.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
    const idx = merged.index;
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i);
      const b = idx.getX(i + 1);
      const c = idx.getX(i + 2);
      idx.setX(i + 1, c);
      idx.setX(i + 2, b);
    }
    merged.computeVertexNormals();
  }
  return merged;
}

/** Three fanning tail feathers (tail-local, pivot at base). */
function tailGeo() {
  const base = (rotZ, droop) => {
    const g = new THREE.PlaneGeometry(0.46, 0.34, 8, 6);
    g.rotateZ(rotZ);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i);
      const ly = p.getY(i);
      const u = (ly + 0.17) / 0.34; // 0 base … 1 tip
      p.setZ(i, -droop * u * u + 0.06);
      p.setX(i, lx * (1 - 0.25 * u));
      p.setY(i, ly + 0.17);
    }
    g.computeVertexNormals();
    return g;
  };
  const merged = mergeGeometries([base(0, 0.34), base(-0.22, 0.3), base(0.22, 0.3)]);
  merged.translate(0, 0.05, -0.02);
  return merged;
}

function legGeo() {
  const g = new THREE.CylinderGeometry(0.075, 0.1, 0.52, 12, 2);
  g.translate(0, -0.26, 0);
  return g;
}

function footGeo() {
  const main = new THREE.SphereGeometry(0.17, 20, 14);
  main.scale(1.35, 0.5, 1.15);
  main.translate(0, -0.16, 0.04);
  const toe = (tx, tz) => {
    const t = new THREE.SphereGeometry(0.052, 10, 8);
    t.scale(1.15, 0.75, 1.3);
    t.translate(tx, -0.22, 0.18 + tz);
    return t;
  };
  return mergeGeometries([main, toe(0.09, 0.04), toe(-0.09, 0.04), toe(0, 0.1)]);
}

function beakTopGeo() {
  const g = new THREE.ConeGeometry(0.17, 0.36, 20);
  g.rotateX(Math.PI / 2); // apex → +z
  g.translate(0, -0.16, 0.6);
  return g;
}
function beakBottomGeo() {
  const g = new THREE.ConeGeometry(0.13, 0.22, 20);
  g.rotateX(-Math.PI / 2);
  g.translate(0, -0.32, 0.56);
  return g;
}

function eyeGeo() {
  const g = new THREE.SphereGeometry(0.21, 26, 20);
  g.translate(0, 0.1, 0.5);
  return g;
}
function pupilGeo(x) {
  const g = new THREE.SphereGeometry(0.1, 18, 14);
  g.translate(x, 0.1, 0.64);
  return g;
}
function tuftGeo(mirror) {
  const g = new THREE.ConeGeometry(0.085, 0.4, 12);
  g.rotateX(-0.5);
  g.rotateZ(mirror ? 0.4 : -0.4);
  g.translate(0, 0.12, 0.02);
  return g;
}

// ───────────────────────────────── morph targets ─────────────────────────────────

const ZONES = {
  browL: { x: -0.24, y: 0.33, sx: 0.16, sy: 0.11 },
  browR: { x: 0.24, y: 0.33, sx: 0.16, sy: 0.11 },
  browMid: { x: 0, y: 0.3, sx: 0.11, sy: 0.09 },
  cheekL: { x: -0.36, y: -0.05, sx: 0.17, sy: 0.13 },
  cheekR: { x: 0.36, y: -0.05, sx: 0.17, sy: 0.13 },
  beakBase: { x: 0, y: -0.22, sx: 0.2, sy: 0.12 },
};
const EMOTIONS = {
  happy: [["cheekL", [0, 0.05, 0.02]], ["cheekR", [0, 0.05, 0.02]], ["browL", [0, 0.03, 0.01]], ["browR", [0, 0.03, 0.01]], ["beakBase", [0, 0.02, 0.01]]],
  sad: [["browMid", [0, 0.05, 0.02]], ["browL", [0.01, 0.02, 0.01]], ["browR", [-0.01, 0.02, 0.01]], ["cheekL", [0, -0.03, 0]], ["cheekR", [0, -0.03, 0]], ["beakBase", [0, -0.02, 0.01]]],
  scared: [["browL", [0, 0.07, 0.04]], ["browR", [0, 0.07, 0.04]], ["browMid", [0, 0.06, 0.03]], ["cheekL", [0, 0.02, 0.01]], ["cheekR", [0, 0.02, 0.01]], ["beakBase", [0, -0.015, 0.01]]],
  excited: [["browL", [0, 0.05, 0.03]], ["browR", [0, 0.05, 0.03]], ["browMid", [0, 0.04, 0.02]], ["cheekL", [0, 0.05, 0.02]], ["cheekR", [0, 0.05, 0.02]]],
  sleepy: [["browL", [0, -0.06, 0.03]], ["browR", [0, -0.06, 0.03]], ["browMid", [0, -0.05, 0.02]], ["cheekL", [0, -0.02, 0]], ["cheekR", [0, -0.02, 0]]],
  grumpy: [["browMid", [0, -0.06, 0.04]], ["browL", [0.01, -0.02, 0.02]], ["browR", [-0.01, -0.02, 0.02]], ["cheekL", [0, 0.03, 0.01]], ["cheekR", [0, 0.03, 0.01]], ["beakBase", [0, 0.02, 0.01]]],
};

/** Build the 6 emotion morph deltas on the head geometry. */
function headMorphs(geo) {
  const pos = geo.attributes.position;
  const g2 = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) ** 2) / (2 * sx * sx) + ((y - cy) ** 2) / (2 * sy * sy)));
  const front = (z) => (z <= 0 ? 0 : Math.min(1, z / 0.18)); // only front hemisphere
  const morphs = [];
  for (const name of Object.keys(EMOTIONS)) {
    const d = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const f = front(z);
      if (f === 0) continue;
      let dx = 0, dy = 0, dz = 0;
      for (const [zone, [vx, vy, vz]] of EMOTIONS[name]) {
        const Z = ZONES[zone];
        const m = g2(x, y, Z.x, Z.y, Z.sx, Z.sy) * f;
        dx += m * vx;
        dy += m * vy;
        dz += m * vz;
      }
      const o = i * 3;
      d[o] = dx;
      d[o + 1] = dy;
      d[o + 2] = dz;
    }
    morphs.push(new THREE.BufferAttribute(d, 3));
  }
  return morphs;
}

/** Simple translation morph: every vertex moves by the same delta. */
function openMorph(geo, dx, dy, dz) {
  const pos = geo.attributes.position;
  const d = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    d[i * 3] = dx;
    d[i * 3 + 1] = dy;
    d[i * 3 + 2] = dz;
  }
  return new THREE.BufferAttribute(d, 3);
}

// ───────────────────────────────── PBR textures ─────────────────────────────────

function buildTextures() {
  // ── feather base (2048²): warm brown mottle + vertical strand shading ──
  const featherBase = makeTexture(2048, 2048, (u, v) => {
    const n = fbm(u * 9, v * 9, 4);
    const n2 = fbm(u * 23, v * 23, 3);
    const strand = (Math.sin(v * 220 + n * 90) + 1) * 0.5; // vertical feather shafts
    const dark = 0.86 + 0.13 * n - 0.05 * n2 + 0.045 * strand;
    const grad = 1 - 0.1 * v; // slightly darker toward the top
    return [166 * dark * grad, 113 * dark * grad, 61 * dark * grad, 255];
  });
  const featherNormal = makeNormalMap(
    1024,
    1024,
    (u, v) => fbm(u * 12, v * 12, 4) * 0.7 + fbm(u * 40, v * 40, 3) * 0.3,
    3.2
  );
  const featherORM = makeORM(1024, 1024, () => 0.78, () => 0.88);

  // ── belly base (2048²): soft cream ──
  const bellyBase = makeTexture(2048, 2048, (u, v) => {
    const n = fbm(u * 8, v * 8, 3);
    const warm = 0.93 + 0.07 * n;
    return [246 * warm, 232 * warm, 200 * warm, 255];
  });
  const bellyNormal = makeNormalMap(1024, 1024, (u, v) => fbm(u * 10, v * 10, 3) * 0.5, 2.2);
  const bellyORM = makeORM(1024, 1024, () => 0.9, () => 0.9);

  // ── head base (2048²): feather brown + cream facial disc + eye sockets ──
  // SphereGeometry UV: front (+z) = (0.75, 0.5), top pole v=1, bottom v=0.
  const headBase = makeTexture(2048, 2048, (u, v) => {
    const n = fbm(u * 10, v * 10, 4);
    const dark = 0.86 + 0.13 * n;
    const feather = [166 * dark, 113 * dark, 61 * dark, 255];
    // facial disc — soft cream ellipse around the front pole
    const du = u - 0.75;
    const dv = v - 0.5;
    const disc = Math.exp(-((du * du) / (0.13 * 0.13) + (dv * dv) / (0.2 * 0.2)));
    // eye sockets — subtle dark masks behind the eyeballs
    const so = (u0, v0) => Math.exp(-(((u - u0) ** 2) / 0.035 + ((v - v0) ** 2) / 0.035));
    const socket = so(0.677, 0.545) + so(0.823, 0.545);
    // beak zone slightly pale
    const beakZone = Math.exp(-((u - 0.75) ** 2) / 0.008 + -((v - 0.42) ** 2) / 0.012);
    const m = Math.min(1, disc + socket * 0.45);
    const r = feather[0] * (1 - m) + 244 * m - 28 * socket;
    const g = feather[1] * (1 - m) + 230 * m - 24 * socket;
    const b = feather[2] * (1 - m) + 197 * m - 18 * socket;
    return [r * (1 + 0.06 * beakZone), g * (1 + 0.04 * beakZone), b * (1 + 0.03 * beakZone), 255];
  });
  const headORM = makeORM(1024, 1024, (u, v) => {
    const disc = Math.exp(-(((u - 0.75) ** 2) / 0.13 ** 2 + ((v - 0.5) ** 2) / 0.2 ** 2));
    return 0.78 + 0.15 * disc; // disc is a touch shinier (downy)
  }, (u, v) => 0.85 + 0.08 * Math.exp(-(((u - 0.75) ** 2) / 0.06 + ((v - 0.5) ** 2) / 0.06)));

  // ── glossy / accent maps — sized to their ATLAS rects (single-draw-call) ──
  // The 4096² base atlas reserves 1024² for beak/foot, 512² for eye/pupil, so
  // these are generated at exactly the rect resolution (no upscale blur).
  const beakBase = makeTexture(1024, 1024, (u, v) => {
    const stripe = 1 - 0.18 * (Math.sin(u * 60) + 1) * 0.5;
    return [244 * stripe, 169 * stripe, 66 * stripe, 255];
  });
  const eyeWhite = makeTexture(512, 512, (u, v) => {
    const du = u - 0.5, dv = v - 0.5;
    const r = Math.sqrt(du * du + dv * dv) * 2.2;
    const shade = 1 - Math.min(1, r) * 0.18;
    return [252 * shade, 250 * shade, 245 * shade, 255];
  });
  const pupil = makeTexture(512, 512, (u, v) => {
    const du = u - 0.5, dv = v - 0.5;
    const r = Math.sqrt(du * du + dv * dv) * 2;
    const glint = r < 0.55 ? 0 : Math.exp(-(((u - 0.62) ** 2) / 0.008 + ((v - 0.38) ** 2) / 0.008));
    const base = 22 + 20 * Math.min(1, r);
    return [base + 200 * glint, base + 200 * glint, base + 200 * glint, 255];
  });
  const footBase = makeTexture(1024, 1024, (u, v) => {
    const n = valueNoise(u * 14, v * 14);
    const scale = 0.9 + 0.1 * n;
    return [232 * scale, 146 * scale, 58 * scale, 255];
  });

  return { featherBase, featherNormal, featherORM, bellyBase, bellyNormal, bellyORM, headBase, headORM, beakBase, eyeWhite, pupil, footBase };
}

// ───────────────────── single-draw-call: shared texture atlases ─────────────────────
//
// #687 budget: the whole owl is ONE mesh with ONE material → ONE WebGL draw
// call. Each part's former per-part texture becomes a sub-rect in three shared
// atlases (base / normal / ORM), and every part's UVs are remapped into its
// rect. The three atlases share the SAME normalized rect layout, so a single
// UV transform per part samples map + normalMap + roughness/metalnessMap
// consistently. Rects are generated at exactly their pixel size → no blur.

const RECT = {
  FEATHER:   { x: 0,     y: 0,     w: 0.5,   h: 0.5   }, // body/wings/tail/legs/tufts
  BELLY:     { x: 0.5,   y: 0,     w: 0.5,   h: 0.5   },
  HEAD:      { x: 0,     y: 0.5,   w: 0.5,   h: 0.5   },
  BEAK:      { x: 0.5,   y: 0.5,   w: 0.25,  h: 0.25  }, // beak top (striped)
  BEAK_DARK: { x: 0.75,  y: 0.5,   w: 0.25,  h: 0.25  }, // beak bottom (solid)
  FOOT:      { x: 0.5,   y: 0.75,  w: 0.25,  h: 0.25  },
  EYE:       { x: 0.75,  y: 0.75,  w: 0.125, h: 0.125 },
  PUPIL:     { x: 0.875, y: 0.75,  w: 0.125, h: 0.125 },
};

/** blit a DataTexture's pixels into `dst` at `rect` (normalized), scaling if needed. */
function blit(dst, atlasW, rect, src, srcW, srcH) {
  const x0 = Math.round(rect.x * atlasW);
  const y0 = Math.round(rect.y * atlasW); // square atlases
  const rw = Math.round(rect.w * atlasW);
  const rh = Math.round(rect.h * atlasW);
  for (let y = 0; y < rh; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y * srcH) / rh));
    const sRow = sy * srcW * 4;
    const dRow = ((y0 + y) * atlasW + x0) * 4;
    for (let x = 0; x < rw; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x * srcW) / rw));
      const so = sRow + sx * 4;
      const do_ = dRow + x * 4;
      dst[do_] = src[so];
      dst[do_ + 1] = src[so + 1];
      dst[do_ + 2] = src[so + 2];
      dst[do_ + 3] = src[so + 3];
    }
  }
}

/** solid fill for atlas regions that had no map (flat normal / solid ORM). */
function fillSolid(dst, atlasW, rect, [r, g, b, a = 255]) {
  const x0 = Math.round(rect.x * atlasW);
  const y0 = Math.round(rect.y * atlasW);
  const rw = Math.round(rect.w * atlasW);
  const rh = Math.round(rect.h * atlasW);
  for (let y = 0; y < rh; y++) {
    const dRow = ((y0 + y) * atlasW + x0) * 4;
    for (let x = 0; x < rw; x++) {
      const d = dRow + x * 4;
      dst[d] = r;
      dst[d + 1] = g;
      dst[d + 2] = b;
      dst[d + 3] = a;
    }
  }
}

function atlasTexture(px, w, h, colorSpace) {
  const t = new THREE.DataTexture(px, w, h, THREE.RGBAFormat);
  t.colorSpace = colorSpace === "srgb" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

/** Bake all PBR maps into three shared atlases and return ONE material. */
function buildOwlMaterial(T) {
  const BASE = 4096, MID = 2048; // base atlas / normal+ORM atlas
  const base = new Uint8Array(BASE * BASE * 4);
  const normal = new Uint8Array(MID * MID * 4);
  const orm = new Uint8Array(MID * MID * 4);

  // defaults first (anything missed stays neutral, never black/NaN)
  fillSolid(normal, MID, { x: 0, y: 0, w: 1, h: 1 }, [128, 128, 255]);
  fillSolid(orm, MID, { x: 0, y: 0, w: 1, h: 1 }, [230, 204, 0]);

  // ── base atlas ──
  blit(base, BASE, RECT.FEATHER, T.featherBase.image.data, T.featherBase.image.width, T.featherBase.image.height);
  blit(base, BASE, RECT.BELLY, T.bellyBase.image.data, T.bellyBase.image.width, T.bellyBase.image.height);
  blit(base, BASE, RECT.HEAD, T.headBase.image.data, T.headBase.image.width, T.headBase.image.height);
  blit(base, BASE, RECT.BEAK, T.beakBase.image.data, T.beakBase.image.width, T.beakBase.image.height);
  fillSolid(base, BASE, RECT.BEAK_DARK, [0xb9, 0x6a, 0x2b]); // solid beak-bottom brown
  blit(base, BASE, RECT.FOOT, T.footBase.image.data, T.footBase.image.width, T.footBase.image.height);
  blit(base, BASE, RECT.EYE, T.eyeWhite.image.data, T.eyeWhite.image.width, T.eyeWhite.image.height);
  blit(base, BASE, RECT.PUPIL, T.pupil.image.data, T.pupil.image.width, T.pupil.image.height);

  // ── normal atlas (head + foot reused the feather normal map in the 8-material era) ──
  blit(normal, MID, RECT.FEATHER, T.featherNormal.image.data, T.featherNormal.image.width, T.featherNormal.image.height);
  blit(normal, MID, RECT.BELLY, T.bellyNormal.image.data, T.bellyNormal.image.width, T.bellyNormal.image.height);
  blit(normal, MID, RECT.HEAD, T.featherNormal.image.data, T.featherNormal.image.width, T.featherNormal.image.height);
  blit(normal, MID, RECT.FOOT, T.featherNormal.image.data, T.featherNormal.image.width, T.featherNormal.image.height);
  // beak/eyes/pupils stay flat → already filled default [128,128,255]

  // ── ORM atlas (roughness×255 = G, metal×255 = B, AO×255 = R — AO unused in glb) ──
  blit(orm, MID, RECT.FEATHER, T.featherORM.image.data, T.featherORM.image.width, T.featherORM.image.height);
  blit(orm, MID, RECT.BELLY, T.bellyORM.image.data, T.bellyORM.image.width, T.bellyORM.image.height);
  blit(orm, MID, RECT.HEAD, T.headORM.image.data, T.headORM.image.width, T.headORM.image.height);
  blit(orm, MID, RECT.FOOT, T.featherORM.image.data, T.featherORM.image.width, T.featherORM.image.height);
  fillSolid(orm, MID, RECT.BEAK, [230, Math.round(0.42 * 255), 0]); // beak rough 0.42
  fillSolid(orm, MID, RECT.BEAK_DARK, [230, Math.round(0.5 * 255), 0]); // 0.5
  fillSolid(orm, MID, RECT.EYE, [230, Math.round(0.18 * 255), 0]); // 0.18
  fillSolid(orm, MID, RECT.PUPIL, [230, Math.round(0.12 * 255), 0]); // 0.12

  // ONE ORM texture object for BOTH roughness+metalness — GLTFExporter skips
  // the canvas-combine step when metalnessMap === roughnessMap (same image).
  const ormTex = atlasTexture(orm, MID, MID);
  return new THREE.MeshStandardMaterial({
    map: atlasTexture(base, BASE, BASE, "srgb"),
    normalMap: atlasTexture(normal, MID, MID),
    roughnessMap: ormTex,
    metalnessMap: ormTex,
    roughness: 0.9,
    metalness: 0,
  });
}

// ───────────────────────────────── animation clips ─────────────────────────────────

const FPS = 30;
const osc = (t, dur, amp, cycles, phase = 0, offset = 0) => offset + amp * Math.sin((2 * Math.PI * cycles * t) / dur + phase);

function times(dur) {
  const out = [];
  const n = Math.round(dur * FPS);
  for (let i = 0; i <= n; i++) out.push(i / FPS);
  return out;
}

function posTrack(bone, dur, fn) {
  const t = times(dur);
  const v = [];
  for (const ti of t) v.push(...fn(ti));
  return new THREE.VectorKeyframeTrack(`${bone}.position`, t, v);
}
function rotTrack(bone, dur, fn) {
  const t = times(dur);
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const v = [];
  for (const ti of t) {
    e.set(...fn(ti));
    q.setFromEuler(e);
    v.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, t, v);
}

/** Piecewise-linear keyframe helper for hop-style beats. pts: [[t,v],…]. */
function seg(t, pts) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [t0, v0] = pts[i - 1];
      const [t1, v1] = pts[i];
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return pts[pts.length - 1][1];
}

const WING_REST = 0.45; // rest-fold tilt (mirrored for wingR)

function buildClips() {
  // idle — slow breathing, look-around, feather flutter, tail sway
  const idle = new THREE.AnimationClip("idle", 4, [
    posTrack("spine", 4, (t) => [0, osc(t, 4, 0.018, 1), 0]),
    rotTrack("neck", 4, (t) => [0.03 * osc(t, 4, 1, 1, 0.6), 0, 0]),
    rotTrack("head", 4, (t) => [0.04 * osc(t, 4, 1, 1, 0.3), 0.1 * osc(t, 8, 1), 0]),
    rotTrack("wingL", 4, (t) => [0, 0, -WING_REST + 0.045 * osc(t, 4, 1, 2)]),
    rotTrack("wingR", 4, (t) => [0, 0, WING_REST - 0.045 * osc(t, 4, 1, 2)]),
    rotTrack("tail", 4, (t) => [0, 0, 0.05 * osc(t, 4, 1, 0.5)]),
    rotTrack("earL", 4, (t) => [0.12 * osc(t, 4, 1, 1.3), 0, 0]),
    rotTrack("earR", 4, (t) => [0.12 * osc(t, 4, 1, 1.3, 2.1), 0, 0]),
  ]);

  // walk — alternate leg swing, body bob, head level, little flaps
  const walk = new THREE.AnimationClip("walk", 1.5, [
    posTrack("root", 1.5, (t) => [0, 0.035 * (0.5 + 0.5 * osc(t, 1.5, 1, 2)), 0]),
    rotTrack("legL", 1.5, (t) => [-0.48 * osc(t, 1.5, 1, 1), 0, 0]),
    rotTrack("legR", 1.5, (t) => [-0.48 * osc(t, 1.5, 1, 1, Math.PI), 0, 0]),
    rotTrack("spine", 1.5, (t) => [0.06 * osc(t, 1.5, 1, 1), 0, 0]),
    rotTrack("head", 1.5, (t) => [-0.08 * osc(t, 1.5, 1, 1), 0, 0]),
    rotTrack("wingL", 1.5, (t) => [0, 0, -WING_REST + 0.09 * osc(t, 1.5, 1, 2, 0, 0.5)]),
    rotTrack("wingR", 1.5, (t) => [0, 0, WING_REST - 0.09 * osc(t, 1.5, 1, 2, 0, 0.5)]),
    rotTrack("tail", 1.5, (t) => [0, 0, 0.06 * osc(t, 1.5, 1, 1)]),
  ]);

  // hop — crouch → launch → land, one bounce
  const hop = new THREE.AnimationClip("hop", 0.8, [
    posTrack("root", 0.8, (t) => [0, seg(t, [[0, 0], [0.2, 0], [0.4, 0.24], [0.56, 0], [0.8, 0]]), 0]),
    rotTrack("legL", 0.8, (t) => [seg(t, [[0, 0], [0.2, -0.45], [0.45, -0.15], [0.8, 0]]), 0, 0]),
    rotTrack("legR", 0.8, (t) => [seg(t, [[0, 0], [0.2, -0.45], [0.45, -0.15], [0.8, 0]]), 0, 0]),
    rotTrack("wingL", 0.8, (t) => [0, 0, -WING_REST + seg(t, [[0, 0], [0.18, 0], [0.3, 0.55], [0.5, -0.3], [0.8, 0]])]),
    rotTrack("wingR", 0.8, (t) => [0, 0, WING_REST - seg(t, [[0, 0], [0.18, 0], [0.3, 0.55], [0.5, -0.3], [0.8, 0]])]),
    rotTrack("spine", 0.8, (t) => [0.14 * osc(t, 0.8, 1, 1), 0, 0]),
  ]);

  // fly — big wing beats, body pitched forward, legs tucked
  const fly = new THREE.AnimationClip("fly", 2.6, [
    posTrack("root", 2.6, (t) => [0, 0.16 + 0.05 * osc(t, 2.6, 1, 2), 0]),
    rotTrack("spine", 2.6, (t) => [0.16 + 0.03 * osc(t, 2.6, 1, 2), 0, 0]),
    rotTrack("head", 2.6, (t) => [-0.12, 0, 0]),
    rotTrack("wingL", 2.6, (t) => [0, 0, -WING_REST + 0.85 + 0.75 * osc(t, 2.6, 1, 1.6)]),
    rotTrack("wingR", 2.6, (t) => [0, 0, WING_REST - 0.85 - 0.75 * osc(t, 2.6, 1, 1.6)]),
    rotTrack("legL", 2.6, (t) => [0.62, 0, 0]),
    rotTrack("legR", 2.6, (t) => [0.62, 0, 0]),
    rotTrack("tail", 2.6, (t) => [0, 0, 0.09 * osc(t, 2.6, 1, 1.6)]),
  ]);

  // spin — full 360° turn on the spot, wings half out
  const spin = new THREE.AnimationClip("spin", 2.4, [
    rotTrack("root", 2.4, (t) => [0, (2 * Math.PI * t) / 2.4, 0]),
    posTrack("root", 2.4, (t) => [0, 0.02 * osc(t, 2.4, 1, 2), 0]),
    rotTrack("spine", 2.4, (t) => [-0.08, 0, 0]),
    rotTrack("wingL", 2.4, (t) => [0, 0, -0.18 + 0.05 * osc(t, 2.4, 1, 4)]),
    rotTrack("wingR", 2.4, (t) => [0, 0, 0.18 - 0.05 * osc(t, 2.4, 1, 4)]),
    rotTrack("tail", 2.4, (t) => [0, 0, 0.08 * osc(t, 2.4, 1, 2)]),
  ]);

  // dance — side sway + head wiggle + jazz wings + bounce
  const dance = new THREE.AnimationClip("dance", 3.2, [
    posTrack("root", 3.2, (t) => [0.14 * osc(t, 3.2, 1, 1.5), 0.07 * (0.5 + 0.5 * osc(t, 3.2, 1, 3)), 0]),
    rotTrack("head", 3.2, (t) => [0.12 * osc(t, 3.2, 1, 2), 0.34 * osc(t, 3.2, 1, 4), 0]),
    rotTrack("neck", 3.2, (t) => [0.06 * osc(t, 3.2, 1, 4), -0.08 * osc(t, 3.2, 1, 4), 0]),
    rotTrack("wingL", 3.2, (t) => [0, 0, -WING_REST + 0.16 * osc(t, 3.2, 1, 4, 0, 0.5)]),
    rotTrack("wingR", 3.2, (t) => [0, 0, WING_REST - 0.16 * osc(t, 3.2, 1, 4, 0, 0.5)]),
    rotTrack("legL", 3.2, (t) => [0.1 * osc(t, 3.2, 1, 1.5), 0, 0]),
    rotTrack("legR", 3.2, (t) => [-0.1 * osc(t, 3.2, 1, 1.5), 0, 0]),
    rotTrack("tail", 3.2, (t) => [0, 0, 0.14 * osc(t, 3.2, 1, 3)]),
  ]);

  return [idle, walk, hop, fly, spin, dance];
}

// ───────────────────────────────── assemble (single draw call) ─────────────────────────────────

/** Concatenate all part geometries (position/normal/uv/skin) into ONE geometry.
 *  NO vertex dedup — parts are separate primitives, and keeping ranges intact
 *  is what lets us splice morph deltas per part afterwards. */
function mergeRig(parts) {
  const total = parts.reduce((s, p) => s + p.geo.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const skinIdx = new Uint16Array(total * 4);
  const skinWgt = new Float32Array(total * 4);
  const index = [];
  const ranges = [];
  let v = 0;
  for (const p of parts) {
    const g = p.geo;
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, v * 3);
    nrm.set(g.attributes.normal.array, v * 3);
    uv.set(g.attributes.uv.array, v * 2);
    for (let i = 0; i < n; i++) {
      skinIdx[(v + i) * 4] = p.boneIndex; // rigid bind: weight 1 → bone
      skinWgt[(v + i) * 4] = 1;
    }
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) index.push(gi[i] + v);
    ranges.push({ start: v, end: v + n });
    v += n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setAttribute("skinIndex", new THREE.BufferAttribute(skinIdx, 4));
  geo.setAttribute("skinWeight", new THREE.BufferAttribute(skinWgt, 4));
  geo.setIndex(index);
  return { geo, ranges };
}

/** Remap a part's UVs into its atlas rect (same rect for base/normal/ORM). */
function remapUVs(geo, rect) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, rect.x + uv.getX(i) * rect.w, rect.y + uv.getY(i) * rect.h);
  }
}

/** Rotate morph deltas (VECTORS — no translation) into scene space. Morph deltas
 *  are authored in the part's bone-local space; once the base geometry is baked
 *  into scene space the deltas must follow the same rotation, or expressions /
 *  beak-open offsets would point along the bone's local axes instead of the
 *  world's (a no-op today — head bones carry no rotation — but correct anyway). */
function rotateDeltas(attr, mtx) {
  const arr = attr.array;
  const v = new THREE.Vector3();
  for (let i = 0; i < arr.length; i += 3) {
    v.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(mtx);
    arr[i] = v.x;
    arr[i + 1] = v.y;
    arr[i + 2] = v.z;
  }
  return attr;
}

/** Collect a part's morph deltas as [{ name, attr }] — computed from the LOCAL
 *  geometry (zone coords / open deltas are bone-local), then rotated into the
 *  same scene space the base geometry is baked into. */
function collectMorphDeltas(p, bindRot) {
  const out = [];
  if (p.morphs === EMOTIONS) {
    // head → the 6 facial expressions
    const attrs = headMorphs(p.geo);
    Object.keys(EMOTIONS).forEach((name, i) => {
      out.push({ name, attr: rotateDeltas(attrs[i], bindRot) });
    });
  } else if (p.morphs) {
    // beak halves → shared "open" target (parts don't overlap → additive-safe)
    for (const [name, delta] of Object.entries(p.morphs)) {
      out.push({ name, attr: rotateDeltas(openMorph(p.geo, ...delta), bindRot) });
    }
  }
  return out;
}

/** Build the 7 merged morph targets (deltas spliced at each part's vertex range). */
function buildMergedMorphs(parts, ranges, totalVerts) {
  const names = [...Object.keys(EMOTIONS), "open"];
  const data = names.map(() => new Float32Array(totalVerts * 3));
  for (const p of parts) {
    const r = ranges[p.rangeIndex];
    if (!r || !p.morphDeltas) continue;
    for (const md of p.morphDeltas) {
      const m = names.indexOf(md.name);
      if (m < 0) continue;
      data[m].set(md.attr.array, r.start * 3);
    }
  }
  return { names, data };
}

function triCount(geo) {
  return (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
}

async function main() {
  const { bones, skeleton } = buildSkeleton();
  const T = buildTextures();
  const material = buildOwlMaterial(T);
  const boneIdx = (name) => skeleton.bones.indexOf(bones[name]);

  // Bind-pose world matrices FIRST: each part must be baked from its bone's
  // LOCAL space into scene space before merging. At bind pose three's skinning
  // (currentWorld × inverseBind) collapses to identity, so the merged geometry
  // HAS to already sit where the owl should appear — otherwise every part
  // renders at the origin (the collapsed-blob bug this bakes away).
  bones.root.updateMatrixWorld(true);

  // Every part: geometry (in its bone's local space), its bone, its atlas rect,
  // and optional morphs. Plain parts get their old mesh-offset baked in and are
  // rigid-bound to their parent bone exactly like the old SkinnedMesh parts.
  const parts = [
    { name: "body", geo: bodyGeo(), bone: "spine", rect: RECT.FEATHER },
    { name: "belly", geo: bellyGeo(), bone: "spine", rect: RECT.BELLY },
    { name: "head", geo: headGeo(), bone: "head", rect: RECT.HEAD, morphs: EMOTIONS },
    { name: "wingL", geo: wingGeo(false), bone: "wingL", rect: RECT.FEATHER },
    { name: "wingR", geo: wingGeo(true), bone: "wingR", rect: RECT.FEATHER },
    { name: "tail", geo: tailGeo(), bone: "tail", rect: RECT.FEATHER },
    { name: "legL", geo: legGeo(), bone: "legL", rect: RECT.FEATHER },
    { name: "legR", geo: legGeo(), bone: "legR", rect: RECT.FEATHER },
    { name: "footL", geo: footGeo(), bone: "footL", rect: RECT.FOOT },
    { name: "footR", geo: footGeo(), bone: "footR", rect: RECT.FOOT },
    { name: "beakTop", geo: beakTopGeo(), bone: "head", rect: RECT.BEAK, morphs: { open: [0, 0.05, 0.03] } },
    { name: "beakBottom", geo: beakBottomGeo(), bone: "head", rect: RECT.BEAK_DARK, morphs: { open: [0, -0.05, 0.04] } },
    { name: "eyeL", geo: eyeGeo(), bone: "head", rect: RECT.EYE, xOffset: -0.27 },
    { name: "eyeR", geo: eyeGeo(), bone: "head", rect: RECT.EYE, xOffset: 0.27 },
    { name: "pupilL", geo: pupilGeo(-0.27), bone: "head", rect: RECT.PUPIL },
    { name: "pupilR", geo: pupilGeo(0.27), bone: "head", rect: RECT.PUPIL },
    { name: "tuftL", geo: tuftGeo(false), bone: "earL", rect: RECT.FEATHER },
    { name: "tuftR", geo: tuftGeo(true), bone: "earR", rect: RECT.FEATHER },
  ];

  // Bind each part to its bone + remap UVs into its atlas rect, baking the part
  // and its morph deltas into scene space via the bone's bind world matrix.
  const mergedParts = parts.map((p, i) => {
    if (p.xOffset) p.geo.translate(p.xOffset, 0, 0);
    remapUVs(p.geo, p.rect);
    const bindMtx = bones[p.bone].matrixWorld;
    const bindRot = new THREE.Matrix4().extractRotation(bindMtx);
    // 1) morph deltas FIRST (zone coords are bone-local), rotated into scene space
    const morphDeltas = collectMorphDeltas(p, bindRot);
    // 2) base geometry baked into scene space (position + normal)
    p.geo.applyMatrix4(bindMtx);
    return { ...p, boneIndex: boneIdx(p.bone), rangeIndex: i, morphDeltas };
  });

  const { geo, ranges } = mergeRig(mergedParts);
  const { names, data } = buildMergedMorphs(mergedParts, ranges, geo.attributes.position.count);
  geo.morphAttributes.position = data.map((d) => new THREE.BufferAttribute(d, 3));
  geo.morphTargetsRelative = true;

  const owl = new THREE.SkinnedMesh(geo, material);
  owl.name = "Nova";
  owl.skeleton = skeleton;
  owl.bindMatrix = new THREE.Matrix4();
  owl.bindMatrixInverse = new THREE.Matrix4();
  owl.morphTargetDictionary = {};
  names.forEach((n, i) => (owl.morphTargetDictionary[n] = i));
  owl.morphTargetInfluences = new Array(names.length).fill(0);

  const rig = new THREE.Group();
  rig.name = "NovaRig";
  rig.add(bones.root);
  rig.add(owl);

  const scene = new THREE.Scene();
  scene.add(rig);

  // bind pose: wings already carry their rest tilt on the bone
  bones.root.updateMatrixWorld(true);
  skeleton.calculateInverses();

  const clips = buildClips();
  const exporter = new GLTFExporter();
  const gltf = await exporter.parseAsync(scene, { binary: false, animations: clips });

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(gltf, null, 2));

  console.log(`✓ wrote ${OUT}`);
  console.log(`  bones: ${skeleton.bones.length} · meshes: 1 (single draw call) · morphs: ${names.join(", ")}`);
  console.log(`  triangles: ${triCount(geo)} (target 20k–40k)`);
  console.log(`  clips: ${clips.map((c) => c.name).join(", ")}`);
  console.log(`  material: 1 MeshStandardMaterial (4096² base + 2048² normal + 2048² ORM atlases)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
