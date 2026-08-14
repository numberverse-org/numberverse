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
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
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
}

export function Nova({ clip = "idle", morph = "happy", reduced = false, position = [0, 0, 0], scale = 1 }: NovaProps) {
  const gl = useThree((s) => s.gl);
  const gltf = useLoader(GLTFLoader, URL, (loader) => {
    loader.setKTX2Loader(getKTX2Loader(gl));
    loader.setMeshoptDecoder(MeshoptDecoder);
  });
  const { scene, animations } = gltf;

  const meshRef = useRef<THREE.SkinnedMesh | null>(null);
  const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene]);

  // shadow + keep a handle to the single SkinnedMesh ("Nova")
  useEffect(() => {
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
      if (o.name === MESH_NAME && (o as THREE.SkinnedMesh).isSkinnedMesh) {
        meshRef.current = o as THREE.SkinnedMesh;
      }
    });
  }, [scene]);

  // play the requested clip
  useEffect(() => {
    const clipDef = THREE.AnimationClip.findByName(animations, clip);
    if (!clipDef) return;
    const action = mixer.clipAction(clipDef);
    action.play();
    return () => {
      action.stop();
    };
  }, [mixer, animations, clip]);

  // freeze the owl under reduced motion; otherwise advance the clip
  useFrame((_, delta) => {
    if (!reduced) mixer.update(delta);
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
    <group position={position} scale={scale}>
      <primitive object={scene} />
    </group>
  );
}
