/**
 * 🦉 #687 — the real glTF Nova (single-draw-call owl) in the R3F scene.
 *
 * Replaces the #684 procedural placeholder:
 *   • nova.glb (Meshopt geometry + KTX2 atlases) loads via R3F's useLoader
 *     with three's own GLTFLoader — the extend callback attaches our shared
 *     KTX2 loader + the meshopt decoder (same three types end-to-end).
 *   • one AnimationMixer drives the 6 authored clips (idle/walk/hop/fly/spin/dance).
 *   • the 7 morph targets (6 emotions + beak "open") crossfade on the skinned
 *     mesh so faces change smoothly instead of snapping.
 *   • prefersReducedMotion → the mixer is frozen and the crossfade slows to a
 *     gentle dissolve (no bobbing/flapping/auto-rotate).
 *   • the single SkinnedMesh casts the room's one soft shadow.
 */
import { useFrame, useThree, useLoader } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimationClip, AnimationMixer, MeshStandardMaterial } from "three";
import type { Group, Mesh, SkinnedMesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { getKTX2Loader } from "./ktx2";

export type NovaClip = "idle" | "walk" | "hop" | "fly" | "spin" | "dance";
export type NovaMorph = "happy" | "sad" | "scared" | "excited" | "sleepy" | "grumpy";

const URL = "/assets/nova.glb";
const MESH_NAME = "Nova"; // the merged single-mesh SkinnedMesh (make_nova_owl.mjs)

interface NovaProps {
  clip?: NovaClip;
  morph?: NovaMorph;
  reduced?: boolean;
  position?: [number, number, number];
  scale?: number;
  /** #688 dress-up: multiplies the shared KTX2 atlas (white = natural) */
  tint?: string;
  /** #688 walk-to-tap: floor point to glide to; bump `id` to re-target */
  walkTo?: { x: number; z: number; id: number } | null;
  /** #688 tap-the-owl → pet reaction */
  onPet?: () => void;
  /** #689 outfit accessories render inside the owl group */
  children?: ReactNode;
}

export function Nova({
  clip = "idle",
  morph = "happy",
  reduced = false,
  position = [0, 0, 0],
  scale = 1,
  tint,
  walkTo,
  onPet,
  children,
}: NovaProps) {
  const gl = useThree((s) => s.gl);
  const gltf = useLoader(GLTFLoader, URL, (loader) => {
    loader.setKTX2Loader(getKTX2Loader(gl));
    loader.setMeshoptDecoder(MeshoptDecoder);
  });
  const { scene, animations } = gltf;

  const meshRef = useRef<SkinnedMesh | null>(null);
  const groupRef = useRef<Group | null>(null);
  const mixer = useMemo(() => new AnimationMixer(scene), [scene]);

  // shadow + keep a handle to the single SkinnedMesh ("Nova")
  useEffect(() => {
    scene.traverse((o) => {
      if ((o as Mesh).isMesh) (o as Mesh).castShadow = true;
      if (o.name === MESH_NAME && (o as SkinnedMesh).isSkinnedMesh) {
        meshRef.current = o as SkinnedMesh;
      }
    });
  }, [scene]);

  /* ── #688 walk-to-tap: the walk clip plays while gliding to a floor point ── */
  const [walkTarget, setWalkTarget] = useState<{ x: number; z: number } | null>(null);
  useEffect(() => {
    if (walkTo) setWalkTarget({ x: walkTo.x, z: walkTo.z });
  }, [walkTo]);
  const walking = walkTarget !== null;
  const effectiveClip = walking ? ("walk" as NovaClip) : clip;

  // play the requested clip (walk overrides while moving)
  useEffect(() => {
    const clipDef = AnimationClip.findByName(animations, effectiveClip);
    if (!clipDef) return;
    const action = mixer.clipAction(clipDef);
    action.reset();
    action.play();
    return () => {
      action.stop();
    };
  }, [mixer, animations, effectiveClip]);

  /* ── #688 dress-up: feather tint (multiplies the shared KTX2 atlas) ── */
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (mat instanceof MeshStandardMaterial) {
      mat.color.set(tint ?? "#ffffff");
      mat.needsUpdate = true;
    }
  }, [tint]);

  // advance the clip (frozen under reduced motion) + walk-to-target glide
  useFrame((_, delta) => {
    if (!reduced) mixer.update(delta);
    const g = groupRef.current;
    if (!g || !walkTarget) return;
    const dx = walkTarget.x - g.position.x;
    const dz = walkTarget.z - g.position.z;
    const dist = Math.hypot(dx, dz);
    const speed = reduced ? 1.0 : 1.9;
    if (dist > 0.05) {
      g.position.x += (dx / dist) * speed * delta;
      g.position.z += (dz / dist) * speed * delta;
      // face the walk direction (owl model faces +Z at rest)
      g.rotation.y = Math.atan2(dx, dz);
    } else {
      g.rotation.y = 0;
      setWalkTarget(null);
    }
  });

  // morph crossfade — always smooth; slower dissolve under reduced motion
  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || !mesh.morphTargetDictionary) return;
    const target = mesh.morphTargetDictionary[morph];
    if (target === undefined) return;
    const inf = mesh.morphTargetInfluences;
    if (!inf) return;
    const speed = reduced ? 1.5 : 8;
    for (let i = 0; i < inf.length; i++) {
      const want = i === target ? 1 : 0;
      inf[i] = inf[i] + (want - inf[i]) * Math.min(1, delta * speed);
    }
  });

  return (
    <group ref={groupRef} position={position} scale={scale}>
      <primitive
        object={scene}
        onClick={(e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          onPet?.();
        }}
      />
      {children}
    </group>
  );
}
