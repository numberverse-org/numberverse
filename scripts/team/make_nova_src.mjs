/**
 * 🦉 #685 — generate the placeholder Nova source model (`nova_src.gltf`).
 *
 * The real stylized-realistic owl (armature + morph targets) is #686, built in
 * Blender and exported to glTF. Until then this script writes a PROCEDURAL owl
 * — the same cute proportions as the Nova3D.tsx island placeholder — through
 * three's GLTFExporter, so `build_nova_glb.sh` has a reproducible input NOW
 * and the pipeline is proven end-to-end. When #686 lands, its Blender export
 * simply replaces this file (same name, same pivot) and re-runs the build.
 *
 * Pivot: the owl's feet sit at y = 0 (conventional ground pivot) — the loader
 * places the model at its feet.
 *
 *   node scripts/team/make_nova_src.mjs [out.gltf]
 */
// three is a dependency of apps/kid (pnpm strict node_modules) — resolve via
// the workspace so this script runs from the repo root without a hoist.
import * as THREE from "../../apps/kid/node_modules/three/build/three.module.js";
import { GLTFExporter } from "../../apps/kid/node_modules/three/examples/jsm/exporters/GLTFExporter.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// three's GLTFExporter uses the browser FileReader to inline buffers as data
// URIs in the glTF-JSON path. Node 26 has Blob but no global FileReader —
// polyfill the two methods the exporter actually calls.
if (!globalThis.FileReader) {
  globalThis.FileReader = class FileReader {
    onload = null;
    onloadend = null;
    result = null;
    readAsDataURL(blob) {
      blob.arrayBuffer().then((ab) => {
        const b64 = Buffer.from(ab).toString("base64");
        this.result = `data:${blob.type || "application/octet-stream"};base64,${b64}`;
        if (this.onload) this.onload();
        if (this.onloadend) this.onloadend();
      });
    }
  };
}

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
// #989 — the source .gltf is NOT shipped: keep it outside public/ so Vite
// never copies the multi-MB intermediate into dist (only nova.glb ships).
const out = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(root, "apps/kid/assets-src/nova_src.gltf");

function owlNode() {
  const owl = new THREE.Group();
  const feather = new THREE.MeshStandardMaterial({ color: "#b0763f", roughness: 0.85 });
  const belly = new THREE.MeshStandardMaterial({ color: "#f5e6c8", roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: "#3b2b20", roughness: 0.9 });
  const beakM = new THREE.MeshStandardMaterial({ color: "#f4a942", roughness: 0.6 });
  const foot = new THREE.MeshStandardMaterial({ color: "#e8923a", roughness: 0.8 });
  const white = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.2 });

  const part = (g, m, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    owl.add(mesh);
    return mesh;
  };

  // body + belly + wings (local coords, feet at y ≈ 0 → shift up 1.05)
  part(new THREE.SphereGeometry(0.92, 24, 24), feather, 0, 1.05, 0, 1, 1.15, 0.95);
  part(new THREE.SphereGeometry(0.58, 20, 20), belly, 0, 0.93, 0.5);
  part(new THREE.SphereGeometry(0.62, 16, 16), feather, -0.92, 1.05, 0, 0.32, 0.7, 0.5);
  part(new THREE.SphereGeometry(0.62, 16, 16), feather, 0.92, 1.05, 0, 0.32, 0.7, 0.5);
  // head + tufts + face mask
  part(new THREE.SphereGeometry(0.62, 24, 24), feather, 0, 2.07, 0, 1, 0.92, 0.92);
  const tuft = (sx) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 10), feather);
    c.position.set(0.38 * sx, 2.67, 0);
    c.rotation.z = 0.35 * -sx;
    owl.add(c);
  };
  tuft(-1);
  tuft(1);
  part(new THREE.SphereGeometry(0.58, 20, 20), belly, 0, 2.07, 0.5);
  // eyes + pupils
  part(new THREE.SphereGeometry(0.26, 16, 16), white, -0.26, 2.15, 0.86);
  part(new THREE.SphereGeometry(0.26, 16, 16), white, 0.26, 2.15, 0.86);
  part(new THREE.SphereGeometry(0.13, 12, 12), dark, -0.27, 2.15, 1.05);
  part(new THREE.SphereGeometry(0.13, 12, 12), dark, 0.27, 2.15, 1.05);
  // beak (cone, pointing forward) + feet
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 12), beakM);
  beak.position.set(0, 1.89, 0.98);
  beak.rotation.x = Math.PI / 2;
  owl.add(beak);
  part(new THREE.SphereGeometry(0.14, 10, 10), foot, -0.34, 0.0, 0.22);
  part(new THREE.SphereGeometry(0.14, 10, 10), foot, 0.34, 0.0, 0.22);

  return owl;
}

const owl = owlNode();
const exporter = new GLTFExporter();
const result = await exporter.parseAsync(owl, { binary: false });
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 2));
console.log(`✓ wrote ${out} (placeholder owl source, feet at y=0)`);
