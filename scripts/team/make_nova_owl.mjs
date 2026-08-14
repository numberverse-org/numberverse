/**
 * 🦉 #686 — the stylized-realistic Nova owl, generated entirely from code.
 *
 * A production-style character rig with zero external DCC tooling:
 *
 *   • SKELETON — 13-bone armature (root/spine/neck/head/earL/earR/wingL/wingR/
 *     legL/legR/footL/footR/tail). Each body part is a SkinnedMesh rigidly bound
 *     (weight = 1) to one bone, so glTF exports real joints + inverse-bind
 *     matrices and three's AnimationMixer drives the poses.
 *   • MORPH TARGETS — six facial expressions (happy/sad/scared/excited/sleepy/
 *     grumpy) as positional blend shapes on the head mesh, plus "open" on the
 *     beak halves for mouth animation.
 *   • PBR TEXTURES — 2048² base-color (feather, belly, head-with-facial-disc),
 *     1024² normal + ORM maps, all procedural and deterministic (PNG via
 *     gltf_helpers, no canvas, no image files).
 *   • ANIMATION — six loopable clips sampled at 30 fps: idle, walk, hop, fly,
 *     spin, dance.
 *
 * Output: apps/kid/public/assets/nova_src.gltf (feeds build_nova_glb.sh →
 * nova.glb via Meshopt + KTX2). Pivot: feet at y=0.
 *
 *   node scripts/team/make_nova_owl.mjs [out.gltf]
 */
import * as THREE from "../../apps/kid/node_modules/three/build/three.module.js";
import { GLTFExporter } from "../../apps/kid/node_modules/three/examples/jsm/exporters/GLTFExporter.js";
import { mergeGeometries } from "../../apps/kid/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { polyfillBrowserGlobals, makeTexture, makeNormalMap, makeORM, fbm, valueNoise } from "./gltf_helpers.mjs";

polyfillBrowserGlobals();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = process.argv[2]
  ? join(process.cwd(), process.argv[2])
  : join(ROOT, "apps/kid/public/assets/nova_src.gltf");

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

// ───────────────────────────────── skinning helper ─────────────────────────────────

function skinPart(geo, mat, boneIndex, name, skeleton) {
  const n = geo.attributes.position.count;
  const idx = new Uint16Array(n * 4);
  idx.fill(boneIndex);
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(idx, 4));
  const w = new Float32Array(n * 4);
  w.fill(1);
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(w, 4));
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.name = name;
  mesh.skeleton = skeleton;
  mesh.bindMatrix = new THREE.Matrix4();
  mesh.bindMatrixInverse = new THREE.Matrix4();
  return mesh;
}

function plainPart(geo, mat, name, parentBone) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  if (parentBone) parentBone.add(mesh);
  return mesh;
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

/**
 * Wire a mesh's morph targets so GLTFExporter emits them. three.js only
 * initializes morphTargetInfluences when morph attributes exist at Mesh
 * construction; we assign geometry.morphAttributes AFTER the mesh is built,
 * so we must set the weights + name dictionary explicitly. Weights start 0
 * (rest pose) — the Nova3D runtime drives them per emotion.
 */
function wireMorphs(mesh, names) {
  mesh.morphTargetDictionary = {};
  mesh.morphTargetInfluences = [];
  for (let i = 0; i < names.length; i++) {
    mesh.morphTargetDictionary[names[i]] = i;
    mesh.morphTargetInfluences.push(0);
  }
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

  // ── glossy / accent small maps ──
  const beakBase = makeTexture(256, 256, (u, v) => {
    const stripe = 1 - 0.18 * (Math.sin(u * 60) + 1) * 0.5;
    return [244 * stripe, 169 * stripe, 66 * stripe, 255];
  });
  const eyeWhite = makeTexture(64, 64, (u, v) => {
    const du = u - 0.5, dv = v - 0.5;
    const r = Math.sqrt(du * du + dv * dv) * 2.2;
    const shade = 1 - Math.min(1, r) * 0.18;
    return [252 * shade, 250 * shade, 245 * shade, 255];
  });
  const pupil = makeTexture(64, 64, (u, v) => {
    const du = u - 0.5, dv = v - 0.5;
    const r = Math.sqrt(du * du + dv * dv) * 2;
    const glint = r < 0.55 ? 0 : Math.exp(-(((u - 0.62) ** 2) / 0.008 + ((v - 0.38) ** 2) / 0.008));
    const base = 22 + 20 * Math.min(1, r);
    return [base + 200 * glint, base + 200 * glint, base + 200 * glint, 255];
  });
  const footBase = makeTexture(256, 256, (u, v) => {
    const n = valueNoise(u * 14, v * 14);
    const scale = 0.9 + 0.1 * n;
    return [232 * scale, 146 * scale, 58 * scale, 255];
  });

  return { featherBase, featherNormal, featherORM, bellyBase, bellyNormal, bellyORM, headBase, headORM, beakBase, eyeWhite, pupil, footBase };
}

function buildMaterials(T) {
  const feather = new THREE.MeshStandardMaterial({
    map: T.featherBase,
    normalMap: T.featherNormal,
    roughnessMap: T.featherORM,
    metalnessMap: T.featherORM,
    aoMap: T.featherORM,
    roughness: 0.9,
    metalness: 0,
  });
  const belly = new THREE.MeshStandardMaterial({
    map: T.bellyBase,
    normalMap: T.bellyNormal,
    roughnessMap: T.bellyORM,
    metalnessMap: T.bellyORM,
    aoMap: T.bellyORM,
    roughness: 0.92,
    metalness: 0,
  });
  const head = new THREE.MeshStandardMaterial({
    map: T.headBase,
    normalMap: T.featherNormal,
    roughnessMap: T.headORM,
    metalnessMap: T.headORM,
    aoMap: T.headORM,
    roughness: 0.88,
    metalness: 0,
  });
  const beak = new THREE.MeshStandardMaterial({ map: T.beakBase, roughness: 0.42, metalness: 0 });
  const beakDark = new THREE.MeshStandardMaterial({ color: 0xb96a2b, roughness: 0.5, metalness: 0 });
  const eyeWhite = new THREE.MeshStandardMaterial({ map: T.eyeWhite, roughness: 0.18, metalness: 0 });
  const pupil = new THREE.MeshStandardMaterial({ map: T.pupil, roughness: 0.12, metalness: 0 });
  const foot = new THREE.MeshStandardMaterial({
    map: T.footBase,
    normalMap: T.featherNormal,
    roughnessMap: T.featherORM,
    metalnessMap: T.featherORM,
    aoMap: T.featherORM,
    roughness: 0.7,
    metalness: 0,
  });
  return { feather, belly, head, beak, beakDark, eyeWhite, pupil, foot };
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

// ───────────────────────────────── assemble ─────────────────────────────────

function triCount(geo) {
  return (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
}

async function main() {
  const { bones, skeleton } = buildSkeleton();
  const T = buildTextures();
  const M = buildMaterials(T);

  const rig = new THREE.Group();
  rig.name = "NovaRig";
  rig.add(bones.root);

  const scene = new THREE.Scene();
  scene.add(rig);

  const B = bones;
  const boneIdx = (name) => skeleton.bones.indexOf(B[name]);

  // skinned parts (rigid single-bone binding)
  const parts = [];
  parts.push(skinPart(bodyGeo(), M.feather, boneIdx("spine"), "body", skeleton));
  parts.push(skinPart(bellyGeo(), M.belly, boneIdx("spine"), "belly", skeleton));

  const headMesh = skinPart(headGeo(), M.head, boneIdx("head"), "head", skeleton);
  headMesh.geometry.morphAttributes.position = headMorphs(headMesh.geometry);
  headMesh.geometry.morphTargetsRelative = true;
  // GLTFExporter only emits morph targets when morphTargetInfluences is set
  // (length = target count). Setting it AFTER geometry.morphAttributes is
  // populated makes the 6 emotion targets exportable + drivable via weights.
  wireMorphs(headMesh, Object.keys(EMOTIONS));
  parts.push(headMesh);

  parts.push(skinPart(wingGeo(false), M.feather, boneIdx("wingL"), "wingL", skeleton));
  parts.push(skinPart(wingGeo(true), M.feather, boneIdx("wingR"), "wingR", skeleton));
  parts.push(skinPart(tailGeo(), M.feather, boneIdx("tail"), "tail", skeleton));
  parts.push(skinPart(legGeo(), M.feather, boneIdx("legL"), "legL", skeleton));
  parts.push(skinPart(legGeo(), M.feather, boneIdx("legR"), "legR", skeleton));
  parts.push(skinPart(footGeo(), M.foot, boneIdx("footL"), "footL", skeleton));
  parts.push(skinPart(footGeo(), M.foot, boneIdx("footR"), "footR", skeleton));
  for (const p of parts) rig.add(p);

  // morph-driven beak halves (children of head bone — rigid, follow head)
  const beakTop = plainPart(beakTopGeo(), M.beak, "beakTop", B.head);
  beakTop.geometry.morphAttributes.position = [openMorph(beakTop.geometry, 0, 0.05, 0.03)];
  beakTop.geometry.morphTargetsRelative = true;
  wireMorphs(beakTop, ["open"]);
  const beakBottom = plainPart(beakBottomGeo(), M.beakDark, "beakBottom", B.head);
  beakBottom.geometry.morphAttributes.position = [openMorph(beakBottom.geometry, 0, -0.05, 0.04)];
  beakBottom.geometry.morphTargetsRelative = true;
  wireMorphs(beakBottom, ["open"]);

  // rigid-on-head face parts
  plainPart(eyeGeo(), M.eyeWhite, "eyeL", B.head).position.x = -0.27;
  plainPart(eyeGeo(), M.eyeWhite, "eyeR", B.head).position.x = 0.27;
  plainPart(pupilGeo(-0.27), M.pupil, "pupilL", B.head);
  plainPart(pupilGeo(0.27), M.pupil, "pupilR", B.head);
  plainPart(tuftGeo(false), M.feather, "tuftL", B.earL);
  plainPart(tuftGeo(true), M.feather, "tuftR", B.earR);

  // bind pose: wings already carry their rest tilt on the bone
  bones.root.updateMatrixWorld(true);
  skeleton.calculateInverses();

  const clips = buildClips();
  const exporter = new GLTFExporter();
  const gltf = await exporter.parseAsync(scene, { binary: false, animations: clips });

  const totalTris = [...rig.children.filter((c) => c.isMesh)].reduce((s, m) => s + triCount(m.geometry), 0);
  writeFileSync(OUT, JSON.stringify(gltf, null, 2));

  console.log(`✓ wrote ${OUT}`);
  console.log(`  bones: ${skeleton.bones.length} · meshes: ${rig.children.filter((c) => c.isMesh).length}`);
  console.log(`  triangles: ${totalTris} (target 20k–40k)`);
  console.log(`  morphs: ${Object.keys(EMOTIONS).join(", ")} + beak open`);
  console.log(`  clips: ${clips.map((c) => c.name).join(", ")}`);
  console.log(`  textures: feather/belly/head base 2048² · normal+ORM 1024² · glossy accents`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
