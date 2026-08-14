/**
 * 🦉 #689 — the egg (petStage 0) that wobbles until it hatches.
 */
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

export function Egg3D({ hopping, reduced }: { hopping: boolean; reduced: boolean }) {
  const ref = useRef<THREE.Group | null>(null);
  useFrame((state, delta) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    if (hopping) {
      g.position.y = Math.max(0, Math.abs(Math.sin(t * 7))) * 0.34;
      g.rotation.z = Math.sin(t * 9) * 0.14;
    } else {
      g.position.y = 0;
      g.rotation.z = Math.sin(t * (reduced ? 0.4 : 2.2)) * 0.06;
    }
    void delta;
  });
  return (
    <group ref={ref} position={[0, 0.12, 0]}>
      <mesh position={[0, 0.5, 0]} scale={[0.72, 1, 0.72]} castShadow>
        <sphereGeometry args={[0.6, 20, 20]} />
        <meshStandardMaterial color="#f6ead8" roughness={0.55} />
      </mesh>
      <mesh position={[0.18, 0.42, 0.16]} rotation={[0, 0, 0.7]}>
        <boxGeometry args={[0.05, 0.14, 0.02]} />
        <meshStandardMaterial color="#cbb68a" roughness={0.9} />
      </mesh>
    </group>
  );
}
