/**
 * 🦉 NOVA'S 3D ISLAND — the lazy-loaded three.js surface (#684).
 *
 * The FOUNDATION of the 3D Nova epic (issue #755 / milestone v32):
 *   • mounted ONLY from Nova3DHome via React.lazy → its own Vite chunk
 *     (three + @react-three/fiber + drei never touch the core bundle)
 *   • a procedural stylized owl placeholder + a soft-shaded island
 *     (the real glTF owl with armature + morph targets ships in #686)
 *   • strict WebGL-context lifecycle: a ContextGuard force-releases the
 *     context on unmount, and the host never mounts this alongside Phaser
 *   • prefersReducedMotion → no idle bob / auto-rotate (opacity dissolves)
 */
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "../game/reducedMotion";

/* ── stylized owl placeholder (cute proportions; #686 replaces this) ── */

function Owl({ reduced }: { reduced: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current || reduced) return;
    const t = clock.getElapsedTime();
    // gentle idle bob + sway — skipped under reduced motion
    ref.current.position.y = Math.sin(t * 1.2) * 0.04;
    ref.current.rotation.y = Math.sin(t * 0.4) * 0.06;
  });

  const feather = new THREE.MeshStandardMaterial({ color: "#b0763f", roughness: 0.85 });
  const belly = new THREE.MeshStandardMaterial({ color: "#f5e6c8", roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: "#3b2b20", roughness: 0.9 });
  const beakM = new THREE.MeshStandardMaterial({ color: "#f4a942", roughness: 0.6 });
  const foot = new THREE.MeshStandardMaterial({ color: "#e8923a", roughness: 0.8 });

  return (
    <group ref={ref} position={[0, 1.15, 0]}>
      {/* body */}
      <mesh material={feather} scale={[1, 1.15, 0.95]}>
        <sphereGeometry args={[0.92, 24, 24]} />
      </mesh>
      {/* belly */}
      <mesh material={belly} position={[0, -0.12, 0.5]}>
        <sphereGeometry args={[0.58, 20, 20]} />
      </mesh>
      {/* wings */}
      <mesh material={feather} position={[-0.92, 0, 0]} scale={[0.32, 0.7, 0.5]}>
        <sphereGeometry args={[0.62, 16, 16]} />
      </mesh>
      <mesh material={feather} position={[0.92, 0, 0]} scale={[0.32, 0.7, 0.5]}>
        <sphereGeometry args={[0.62, 16, 16]} />
      </mesh>
      {/* head */}
      <mesh material={feather} position={[0, 1.02, 0]} scale={[1, 0.92, 0.92]}>
        <sphereGeometry args={[0.62, 24, 24]} />
      </mesh>
      {/* ear tufts */}
      <mesh material={feather} position={[-0.38, 1.62, 0]} rotation={[0, 0, -0.35]}>
        <coneGeometry args={[0.16, 0.5, 10]} />
      </mesh>
      <mesh material={feather} position={[0.38, 1.62, 0]} rotation={[0, 0, 0.35]}>
        <coneGeometry args={[0.16, 0.5, 10]} />
      </mesh>
      {/* face mask */}
      <mesh material={belly} position={[0, 1.02, 0.5]}>
        <sphereGeometry args={[0.58, 20, 20]} />
      </mesh>
      {/* eyes — big white + dark pupils (cute) */}
      <mesh position={[-0.26, 1.1, 0.86]}>
        <sphereGeometry args={[0.26, 16, 16]} />
        <meshStandardMaterial color="#ffffff" roughness={0.2} />
      </mesh>
      <mesh position={[0.26, 1.1, 0.86]}>
        <sphereGeometry args={[0.26, 16, 16]} />
        <meshStandardMaterial color="#ffffff" roughness={0.2} />
      </mesh>
      <mesh material={dark} position={[-0.27, 1.1, 1.05]}>
        <sphereGeometry args={[0.13, 12, 12]} />
      </mesh>
      <mesh material={dark} position={[0.27, 1.1, 1.05]}>
        <sphereGeometry args={[0.13, 12, 12]} />
      </mesh>
      {/* beak */}
      <mesh material={beakM} position={[0, 0.84, 0.98]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.16, 0.34, 12]} />
      </mesh>
      {/* feet */}
      <mesh material={foot} position={[-0.34, -1.05, 0.22]}>
        <sphereGeometry args={[0.14, 10, 10]} />
      </mesh>
      <mesh material={foot} position={[0.34, -1.05, 0.22]}>
        <sphereGeometry args={[0.14, 10, 10]} />
      </mesh>
    </group>
  );
}

/* ── island decoration: a few trees + rocks so it reads as a place ── */

function Tree({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.12, 0.16, 1, 8]} />
        <meshStandardMaterial color="#8b5e34" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.45, 0]}>
        <coneGeometry args={[0.55, 1.1, 10]} />
        <meshStandardMaterial color="#3e9b4f" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Rock({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <mesh position={[x, 0.12 * s, z]} scale={s} rotation={[0.4, 0.3, 0]}>
      <dodecahedronGeometry args={[0.4, 0]} />
      <meshStandardMaterial color="#9aa5ad" roughness={0.95} flatShading />
    </mesh>
  );
}

function Flower({ x, z, c }: { x: number; z: number; c: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 0.44, 6]} />
        <meshStandardMaterial color="#4c8c4a" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.09, 8, 8]} />
        <meshStandardMaterial color={c} roughness={0.7} />
      </mesh>
    </group>
  );
}

/* ── the island: ground + grass mound + decorations ── */

function Island({ reduced }: { reduced: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current || reduced) return;
    // a single slowly-drifting cloud, purely decorative
    const t = clock.getElapsedTime();
    ref.current.position.x = Math.sin(t * 0.1) * 0.6;
  });
  return (
    <group>
      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[4.2, 40]} />
        <meshStandardMaterial color="#6dbb57" roughness={0.95} />
      </mesh>
      {/* grass mound under Nova */}
      <mesh position={[0, 0.18, 0]} scale={[1, 0.4, 1]}>
        <sphereGeometry args={[1.5, 24, 16]} />
        <meshStandardMaterial color="#79c963" roughness={1} />
      </mesh>
      <Tree x={-2.6} z={-1.4} s={1.1} />
      <Tree x={2.8} z={-1.2} s={0.9} />
      <Tree x={-1.2} z={-2.6} s={0.8} />
      <Tree x={2.4} z={1.9} s={1} />
      <Rock x={-2.2} z={1.6} />
      <Rock x={1.8} z={2.4} s={0.7} />
      <Rock x={0.2} z={-3.1} s={0.6} />
      <Flower x={-1.5} z={2.2} c="#ffd166" />
      <Flower x={2.1} z={-2.1} c="#f78fb3" />
      <Flower x={0.6} z={2.6} c="#c9b1ff" />
      {/* a slow cloud drift */}
      <group ref={ref} position={[1.8, 3.4, -2.4]}>
        <mesh scale={[1.2, 0.45, 0.8]}>
          <sphereGeometry args={[0.6, 14, 14]} />
          <meshStandardMaterial color="#ffffff" roughness={1} transparent opacity={0.9} />
        </mesh>
        <mesh position={[0.7, 0.1, 0]} scale={[0.8, 0.4, 0.6]}>
          <sphereGeometry args={[0.5, 12, 12]} />
          <meshStandardMaterial color="#ffffff" roughness={1} transparent opacity={0.9} />
        </mesh>
      </group>
      {/* Nova lives on the mound */}
      <Owl reduced={reduced} />
    </group>
  );
}

/* ── #684 WebGL-context lifecycle: hard-release on unmount ── */

function ContextGuard() {
  const gl = useThree((s) => s.gl);
  useEffect(
    () => () => {
      // Repeated mount/unmount cycles must NEVER leak WebGL contexts
      // (browsers cap at 8–16). R3F disposes the renderer; this force-releases
      // the actual GPU context so re-entry starts clean.
      try {
        gl.forceContextLoss();
      } catch {
        /* already lost — fine */
      }
    },
    [gl]
  );
  return null;
}

/* ── the lazy island scene ── */

export default function Nova3D() {
  const reduced = prefersReducedMotion();
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [4.8, 3.2, 5.6], fov: 45 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      onCreated={({ gl }) => gl.setClearColor("#8ed0f2", 1)}
    >
      <ContextGuard />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#bfe3ff", "#5a8f3c", 0.5]} />
      <directionalLight
        position={[4, 7, 3]}
        intensity={1.15}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <Island reduced={reduced} />
      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={3.5}
        maxDistance={11}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.1}
        autoRotate={!reduced}
        autoRotateSpeed={0.6}
      />
    </Canvas>
  );
}
