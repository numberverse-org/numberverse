/**
 * 🦉 #687 — the 3D home ROOMS (Nova's 12 rooms rebuilt in 3D).
 *
 * The 2D NovaScene backdrops (rooms.ts) are procedurally-painted canvas
 * gradients. Each is re-imagined here as a tiny 3D diorama: a vertex-colored
 * sky dome + soft floor + a handful of primitive props, one directional light
 * (1024² PCF soft shadow) and matching fog. Everything is data-driven — zero
 * external assets — so the whole room set stays ~1 draw call per prop.
 */
import { BackSide, BufferAttribute, BufferGeometry, Color } from "three";
import { useMemo, type ReactElement } from "react";

/* ── gradient sky dome (vertex colors: horizon → top) ── */

function SkyDome({ top, horizon }: { top: string; horizon: string }) {
  const geo = useMemo(() => {
    const r = 60;
    const w = 32;
    const h = 16;
    const positions = new Float32Array((w + 1) * (h + 1) * 3);
    const colors = new Float32Array((w + 1) * (h + 1) * 3);
    const cTop = new Color(top);
    const cHor = new Color(horizon);
    let p = 0;
    for (let y = 0; y <= h; y++) {
      const v = y / h; // 0 top … 1 bottom
      const phi = (1 - v) * Math.PI * 0.5; // top at +Y, down to equator
      for (let x = 0; x <= w; x++) {
        const u = x / w;
        const theta = u * Math.PI * 2;
        positions[p] = r * Math.sin(phi) * Math.cos(theta);
        positions[p + 1] = r * Math.cos(phi);
        positions[p + 2] = r * Math.sin(phi) * Math.sin(theta);
        const t = v * v * 1.4; // most of the gradient near the horizon
        const c = cHor.clone().lerp(cTop, 1 - Math.min(1, t));
        colors[p] = c.r;
        colors[p + 1] = c.g;
        colors[p + 2] = c.b;
        p += 3;
      }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setAttribute("color", new BufferAttribute(colors, 3));
    const idx = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = y * (w + 1) + x;
        const b = a + w + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [top, horizon]);
  return (
    <mesh geometry={geo} frustumCulled={false}>
      <meshBasicMaterial vertexColors side={BackSide} depthWrite={false} fog={false} />
    </mesh>
  );
}

/* ── tiny prop library (primitive-based, ~1–4 meshes each) ── */

type Vec3 = [number, number, number];

export interface PropDef {
  k: string;
  pos: Vec3;
  rot?: Vec3;
  s?: number; // uniform scale
  c?: string; // primary color
  c2?: string; // secondary color
}

function Prop({ p }: { p: PropDef }) {
  const { k, pos, rot, s = 1, c = "#ffffff", c2 = "#ffffff" } = p;
  const S = { scale: s } as const;
  switch (k) {
    case "tree":
      return (
        <group position={pos} rotation={rot} scale={s}>
          <mesh position={[0, 0.5, 0]}>
            <cylinderGeometry args={[0.14, 0.2, 1, 7]} />
            <meshStandardMaterial color={c2} roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.45, 0]}>
            <coneGeometry args={[0.65, 1.3, 9]} />
            <meshStandardMaterial color={c} roughness={0.9} />
          </mesh>
        </group>
      );
    case "bush":
      return (
        <group position={pos} rotation={rot} scale={s}>
          <mesh position={[0, 0.25, 0]}>
            <sphereGeometry args={[0.3, 10, 8]} />
            <meshStandardMaterial color={c} roughness={1} />
          </mesh>
          <mesh position={[0.24, 0.16, 0]}>
            <sphereGeometry args={[0.2, 8, 6]} />
            <meshStandardMaterial color={c2} roughness={1} />
          </mesh>
        </group>
      );
    case "flower":
      return (
        <group position={pos} rotation={rot} scale={s}>
          <mesh position={[0, 0.22, 0]}>
            <cylinderGeometry args={[0.025, 0.035, 0.44, 6]} />
            <meshStandardMaterial color={c2} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.46, 0]}>
            <sphereGeometry args={[0.11, 8, 6]} />
            <meshStandardMaterial color={c} roughness={0.7} />
          </mesh>
        </group>
      );
    case "rock":
      return (
        <mesh position={pos} rotation={rot} scale={s}>
          <dodecahedronGeometry args={[0.34, 0]} />
          <meshStandardMaterial color={c} roughness={0.95} flatShading />
        </mesh>
      );
    case "cloud":
      return (
        <group position={pos} rotation={rot} scale={s}>
          <mesh>
            <sphereGeometry args={[0.6, 10, 8]} />
            <meshStandardMaterial color="#ffffff" roughness={1} transparent opacity={0.92} />
          </mesh>
          <mesh position={[0.55, -0.08, 0]} scale={[0.8, 0.6, 0.7]}>
            <sphereGeometry args={[0.5, 8, 7]} />
            <meshStandardMaterial color="#ffffff" roughness={1} transparent opacity={0.92} />
          </mesh>
          <mesh position={[-0.5, -0.05, 0.1]} scale={[0.7, 0.55, 0.6]}>
            <sphereGeometry args={[0.45, 8, 7]} />
            <meshStandardMaterial color="#ffffff" roughness={1} transparent opacity={0.92} />
          </mesh>
        </group>
      );
    case "mound":
      return (
        <mesh position={pos} rotation={rot} scale={[s, s * 0.45, s]}>
          <sphereGeometry args={[0.9, 18, 12]} />
          <meshStandardMaterial color={c} roughness={1} />
        </mesh>
      );
    case "lamp":
      return (
        <group position={pos} rotation={rot} scale={s}>
          <mesh position={[0, 0.9, 0]}>
            <cylinderGeometry args={[0.04, 0.06, 1.8, 6]} />
            <meshStandardMaterial color={c2} roughness={0.7} />
          </mesh>
          <mesh position={[0, 1.85, 0]}>
            <sphereGeometry args={[0.16, 12, 10]} />
            <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.7} />
          </mesh>
        </group>
      );
    case "table":
      return (
        <group position={pos} rotation={rot} scale={s}>
          <mesh position={[0, 0.28, 0]}>
            <cylinderGeometry args={[0.06, 0.09, 0.56, 7]} />
            <meshStandardMaterial color={c2} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.6, 0]}>
            <cylinderGeometry args={[0.5, 0.5, 0.08, 12]} />
            <meshStandardMaterial color={c} roughness={0.7} />
          </mesh>
        </group>
      );
    case "chair":
      return (
        <group position={pos} rotation={rot} scale={s}>
          <mesh position={[0, 0.22, 0]}>
            <boxGeometry args={[0.42, 0.44, 0.4]} />
            <meshStandardMaterial color={c} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.66, 0.16]}>
            <boxGeometry args={[0.42, 0.45, 0.1]} />
            <meshStandardMaterial color={c2} roughness={0.8} />
          </mesh>
        </group>
      );
    case "bed":
      return (
        <group position={pos} rotation={rot} scale={s}>
          <mesh position={[0, 0.22, 0]}>
            <boxGeometry args={[1.3, 0.28, 0.95]} />
            <meshStandardMaterial color={c2} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.42, -0.16]}>
            <boxGeometry args={[1.05, 0.12, 0.6]} />
            <meshStandardMaterial color={c} roughness={0.95} />
          </mesh>
          <mesh position={[-0.42, 0.5, 0.32]}>
            <boxGeometry args={[0.3, 0.16, 0.24]} />
            <meshStandardMaterial color="#ffffff" roughness={0.9} />
          </mesh>
        </group>
      );
    case "bath":
      return (
        <group position={pos} rotation={rot} scale={s}>
          <mesh position={[0, 0.24, 0]}>
            <boxGeometry args={[1.1, 0.34, 0.6]} />
            <meshStandardMaterial color={c} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.44, 0]}>
            <boxGeometry args={[1.18, 0.08, 0.68]} />
            <meshStandardMaterial color={c2} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.32, 0.24]} scale={[0.9, 0.16, 0.1]}>
            <sphereGeometry args={[0.5, 10, 8]} />
            <meshStandardMaterial color="#9fd9f2" roughness={0.2} transparent opacity={0.85} />
          </mesh>
        </group>
      );
    case "fridge":
      return (
        <group position={pos} rotation={rot} scale={s}>
          <mesh position={[0, 0.75, 0]}>
            <boxGeometry args={[0.55, 1.5, 0.45]} />
            <meshStandardMaterial color={c} roughness={0.4} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0.75, 0.25]}>
            <boxGeometry args={[0.05, 0.3, 0.02]} />
            <meshStandardMaterial color={c2} roughness={0.3} metalness={0.4} />
          </mesh>
        </group>
      );
    case "sofa":
      return (
        <group position={pos} rotation={rot} scale={s}>
          <mesh position={[0, 0.28, 0]}>
            <boxGeometry args={[1.1, 0.32, 0.55]} />
            <meshStandardMaterial color={c} roughness={0.9} />
          </mesh>
          <mesh position={[-0.45, 0.45, 0]}>
            <boxGeometry args={[0.2, 0.32, 0.55]} />
            <meshStandardMaterial color={c} roughness={0.9} />
          </mesh>
          <mesh position={[0.45, 0.45, 0]}>
            <boxGeometry args={[0.2, 0.32, 0.55]} />
            <meshStandardMaterial color={c} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.66, -0.22]}>
            <boxGeometry args={[1.1, 0.5, 0.14]} />
            <meshStandardMaterial color={c2} roughness={0.9} />
          </mesh>
        </group>
      );
    case "palm":
      return (
        <group position={pos} rotation={rot} scale={s}>
          <mesh position={[0, 1.2, 0]} rotation={[0.12, 0, -0.12]}>
            <cylinderGeometry args={[0.12, 0.18, 2.4, 7]} />
            <meshStandardMaterial color={c2} roughness={0.9} />
          </mesh>
          <mesh position={[0.35, 2.45, 0]} rotation={[0, 0, -0.9]}>
            <coneGeometry args={[0.42, 0.8, 6]} />
            <meshStandardMaterial color={c} roughness={0.9} />
          </mesh>
          <mesh position={[-0.35, 2.45, 0]} rotation={[0, 0, 0.9]}>
            <coneGeometry args={[0.42, 0.8, 6]} />
            <meshStandardMaterial color={c} roughness={0.9} />
          </mesh>
          <mesh position={[0, 2.62, 0.35]} rotation={[0.9, 0, 0]}>
            <coneGeometry args={[0.42, 0.8, 6]} />
            <meshStandardMaterial color={c} roughness={0.9} />
          </mesh>
        </group>
      );
    case "wave":
      return (
        <group position={pos} rotation={rot} scale={s}>
          <mesh scale={[0.5, 0.06, 0.28]}>
            <sphereGeometry args={[0.5, 8, 6]} />
            <meshStandardMaterial color={c} roughness={0.25} transparent opacity={0.75} />
          </mesh>
        </group>
      );
    case "balloon":
      return (
        <group position={pos} rotation={rot} scale={s}>
          <mesh position={[0, 0.55, 0]}>
            <sphereGeometry args={[0.22, 12, 10]} />
            <meshStandardMaterial color={c} roughness={0.3} emissive={c} emissiveIntensity={0.25} />
          </mesh>
          <mesh position={[0, 0.78, 0]}>
            <coneGeometry args={[0.045, 0.12, 5]} />
            <meshStandardMaterial color={c2} roughness={0.8} />
          </mesh>
        </group>
      );
    case "cake":
      return (
        <group position={pos} rotation={rot} scale={s}>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.42, 0.42, 0.18, 12]} />
            <meshStandardMaterial color={c} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.5, 0]}>
            <cylinderGeometry args={[0.32, 0.32, 0.18, 12]} />
            <meshStandardMaterial color={c2} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.62, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.1, 6]} />
            <meshStandardMaterial color="#f4a93b" emissive="#ff9d2e" emissiveIntensity={0.6} />
          </mesh>
        </group>
      );
    case "desk":
      return (
        <group position={pos} rotation={rot} scale={s}>
          <mesh position={[0, 0.4, 0]}>
            <boxGeometry args={[1, 0.08, 0.55]} />
            <meshStandardMaterial color={c} roughness={0.7} />
          </mesh>
          <mesh position={[-0.4, 0.2, 0]}>
            <boxGeometry args={[0.08, 0.4, 0.45]} />
            <meshStandardMaterial color={c2} roughness={0.8} />
          </mesh>
          <mesh position={[0.4, 0.2, 0]}>
            <boxGeometry args={[0.08, 0.4, 0.45]} />
            <meshStandardMaterial color={c2} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.9, -0.24]}>
            <boxGeometry args={[0.7, 0.5, 0.06]} />
            <meshStandardMaterial color="#3d5a48" roughness={0.6} />
          </mesh>
        </group>
      );
    case "planet":
      return (
        <group position={pos} rotation={rot} scale={s}>
          <mesh>
            <sphereGeometry args={[0.35, 16, 12]} />
            <meshStandardMaterial color={c} roughness={0.6} />
          </mesh>
          <mesh rotation={[Math.PI / 2.4, 0.4, 0]}>
            <torusGeometry args={[0.5, 0.05, 8, 20]} />
            <meshStandardMaterial color={c2} roughness={0.4} />
          </mesh>
        </group>
      );
    case "star":
      return (
        <mesh position={pos} rotation={rot} scale={s}>
          <octahedronGeometry args={[0.08, 0]} />
          <meshStandardMaterial color={c} emissive={c} emissiveIntensity={1} />
        </mesh>
      );
    case "mushroom":
      return (
        <group position={pos} rotation={rot} scale={s}>
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.07, 0.09, 0.22, 6]} />
            <meshStandardMaterial color="#f2ead8" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.28, 0]}>
            <sphereGeometry args={[0.2, 10, 8]} />
            <meshStandardMaterial color={c} roughness={0.8} />
          </mesh>
        </group>
      );
    case "sun":
      return (
        <group position={pos} rotation={rot} scale={s}>
          <mesh>
            <sphereGeometry args={[0.5, 16, 12]} />
            <meshStandardMaterial color={c} emissive={c} emissiveIntensity={1.2} fog={false} />
          </mesh>
        </group>
      );
    case "moon":
      return (
        <group position={pos} rotation={rot} scale={s}>
          <mesh>
            <sphereGeometry args={[0.34, 16, 12]} />
            <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.5} fog={false} />
          </mesh>
        </group>
      );
    case "building":
      return (
        <group position={pos} rotation={rot} scale={s}>
          <mesh position={[0, 0.8, 0]}>
            <boxGeometry args={[0.7, 1.6, 0.7]} />
            <meshStandardMaterial color={c} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.8, 0.36]}>
            <boxGeometry args={[0.34, 0.02, 0.02]} />
            <meshStandardMaterial color={c2} emissive={c2} emissiveIntensity={0.8} />
          </mesh>
        </group>
      );
    case "fence":
      return (
        <group position={pos} rotation={rot} scale={s}>
          <mesh position={[0, 0.3, 0]}>
            <boxGeometry args={[0.04, 0.5, 0.04]} />
            <meshStandardMaterial color={c2} roughness={0.85} />
          </mesh>
          <mesh position={[0.35, 0.3, 0]}>
            <boxGeometry args={[0.04, 0.5, 0.04]} />
            <meshStandardMaterial color={c2} roughness={0.85} />
          </mesh>
          <mesh position={[0.17, 0.4, 0]}>
            <boxGeometry args={[0.5, 0.05, 0.05]} />
            <meshStandardMaterial color={c2} roughness={0.85} />
          </mesh>
          <mesh position={[0.17, 0.2, 0]}>
            <boxGeometry args={[0.5, 0.05, 0.05]} />
            <meshStandardMaterial color={c2} roughness={0.85} />
          </mesh>
        </group>
      );
    default:
      return null;
  }
}

/* ── room themes (palettes lifted from rooms.ts 2D draws) ── */

export interface RoomTheme {
  id: string;
  skyTop: string;
  skyHorizon: string;
  floor: string;
  fog: number; // fog far (props melt into the horizon)
  ambient: [string, number]; // ambient color + intensity
  props: PropDef[];
}

export const ROOM_THEMES: RoomTheme[] = [
  {
    id: "field", skyTop: "#4fb3e8", skyHorizon: "#cdeefb", floor: "#5cbf4a", fog: 26,
    ambient: ["#d6f2ff", 0.6],
    props: [
      { k: "sun", pos: [6.5, 6, -6] },
      { k: "cloud", pos: [-4, 4.4, -4], s: 0.9 },
      { k: "cloud", pos: [3, 5.2, -7], s: 1.1 },
      { k: "mound", pos: [-3.5, -0.02, -2], s: 1.7, c: "#8fd98a" },
      { k: "mound", pos: [4, -0.02, -3], s: 2, c: "#a8e79f" },
      { k: "tree", pos: [-4.6, 0, -2.4], s: 1, c: "#3e9b4f", c2: "#8b5e34" },
      { k: "tree", pos: [4.7, 0, -2.8], s: 0.8, c: "#3e9b4f", c2: "#8b5e34" },
      { k: "flower", pos: [-2.4, 0, 1.4], c: "#ff8fb0", c2: "#4c8c4a" },
      { k: "flower", pos: [1.6, 0, 2.2], c: "#ffd166", c2: "#4c8c4a" },
      { k: "flower", pos: [-1, 0, 2.8], c: "#c9a7ff", c2: "#4c8c4a" },
      { k: "flower", pos: [3.1, 0, 1.6], c: "#ff9e6d", c2: "#4c8c4a" },
      { k: "flower", pos: [0.4, 0, 3.2], c: "#8ef0a0", c2: "#4c8c4a" },
    ],
  },
  {
    id: "garden", skyTop: "#7ec5ec", skyHorizon: "#d8f3fb", floor: "#7bc96b", fog: 26,
    ambient: ["#e2f7ff", 0.65],
    props: [
      { k: "sun", pos: [6.8, 6.2, -6] },
      { k: "cloud", pos: [-5, 4.6, -5], s: 0.8 },
      { k: "fence", pos: [-3.6, 0, 3.4], s: 1.4, c2: "#c8905f" },
      { k: "fence", pos: [3.8, 0, 3.4], s: 1.4, c2: "#c8905f" },
      { k: "tree", pos: [-4.8, 0, -2], s: 0.95, c: "#3e9b4f", c2: "#8b5e34" },
      { k: "bush", pos: [3.8, 0, -1.6], s: 0.9, c: "#5cb85c", c2: "#7ed957" },
      { k: "flower", pos: [-1.8, 0, 1.8], c: "#ff8fb0", c2: "#4c8c4a" },
      { k: "flower", pos: [2.2, 0, 2.4], c: "#ffd166", c2: "#4c8c4a" },
      { k: "flower", pos: [-2.6, 0, 2.8], c: "#c9a7ff", c2: "#4c8c4a" },
      { k: "flower", pos: [1.2, 0, 3.4], c: "#ff9e6d", c2: "#4c8c4a" },
      { k: "flower", pos: [-0.4, 0, 3.6], c: "#8ef0a0", c2: "#4c8c4a" },
      { k: "flower", pos: [3.4, 0, 2.8], c: "#ff8fb0", c2: "#4c8c4a" },
    ],
  },
  {
    id: "bathroom", skyTop: "#9fd7ea", skyHorizon: "#eaf7fb", floor: "#bfe6f4", fog: 24,
    ambient: ["#eafaff", 0.7],
    props: [
      { k: "bath", pos: [-2.2, 0.02, -0.6], s: 1.2, c: "#f4fbfe", c2: "#7ec8dd" },
      { k: "cloud", pos: [4.4, 4.6, -3.4], s: 0.9 },
      { k: "bush", pos: [3.6, 0, -1.4], s: 0.7, c: "#7ec8dd", c2: "#9fd7ea" },
      { k: "fridge", pos: [4.2, 0, -2.6], s: 1, c: "#d8f0f8", c2: "#4f9db8" },
    ],
  },
  {
    id: "kitchen", skyTop: "#8fb6d8", skyHorizon: "#fdf3e0", floor: "#d9a06a", fog: 22,
    ambient: ["#ffe9c9", 0.7],
    props: [
      { k: "fridge", pos: [4, 0.02, -2.4], s: 1.05, c: "#e8f4f8", c2: "#8a6a48" },
      { k: "table", pos: [-2.4, 0.02, 0.2], s: 1, c: "#e8b07c", c2: "#8a6a48" },
      { k: "chair", pos: [-2.4, 0.02, 1.8], s: 0.95, c: "#c8905f", c2: "#f0d4b0" },
      { k: "chair", pos: [-1, 0.02, 0.9], s: 0.95, c: "#c8905f", c2: "#f0d4b0" },
      { k: "bush", pos: [3, 0, 2.2], s: 0.8, c: "#7ec8dd", c2: "#bfe3f5" },
      { k: "lamp", pos: [0.4, 0, 3.2], s: 0.8, c: "#ffd166", c2: "#8a6a48" },
    ],
  },
  {
    id: "bedroom", skyTop: "#3a2c5c", skyHorizon: "#8a6ab0", floor: "#5a4478", fog: 18,
    ambient: ["#b39ce0", 0.65],
    props: [
      { k: "moon", pos: [6, 5.4, -5], s: 1 },
      { k: "star", pos: [-5, 4.6, -4], c: "#ffd166" },
      { k: "star", pos: [4, 5.2, -5.4], c: "#fff6d8" },
      { k: "star", pos: [-2, 5.8, -6], c: "#c9a8e0" },
      { k: "bed", pos: [-1.4, 0.02, 0.2], s: 1.1, c: "#c9a8e0", c2: "#8a6ab0" },
      { k: "lamp", pos: [3.4, 0.02, 1.4], s: 0.85, c: "#ffd166", c2: "#3a2c5c" },
      { k: "table", pos: [2.2, 0.02, -2.4], s: 0.7, c: "#6b4d8f", c2: "#3a2c5c" },
    ],
  },
  {
    id: "living", skyTop: "#c9926a", skyHorizon: "#f8ecd8", floor: "#d9b38c", fog: 22,
    ambient: ["#ffe9c9", 0.7],
    props: [
      { k: "sofa", pos: [-2.4, 0.02, -0.4], s: 1.05, c: "#b06a48", c2: "#d9b38c" },
      { k: "table", pos: [-0.2, 0.02, 0.8], s: 0.7, c: "#8a6a48", c2: "#b58a5c" },
      { k: "lamp", pos: [3.2, 0.02, 0.8], s: 0.9, c: "#ffe9a8", c2: "#8a6a48" },
      { k: "chair", pos: [1.4, 0.02, -1.8], s: 0.9, c: "#c8905f", c2: "#f4e0c8" },
      { k: "bush", pos: [4, 0, -2.6], s: 0.9, c: "#7ec8dd", c2: "#bfe3f5" },
    ],
  },
  {
    id: "beach", skyTop: "#4fb3e8", skyHorizon: "#fff1d6", floor: "#e9d8a8", fog: 30,
    ambient: ["#e8f8ff", 0.65],
    props: [
      { k: "sun", pos: [6.8, 6.4, -6] },
      { k: "palm", pos: [-3.6, 0.02, -1.4], s: 1.05, c: "#2f9e55", c2: "#8b5e34" },
      { k: "palm", pos: [3.8, 0.02, -1.8], s: 0.85, c: "#2f9e55", c2: "#8b5e34" },
      { k: "wave", pos: [-4, 0.02, 3], s: 1.6, c: "#8fd4f7" },
      { k: "wave", pos: [0, 0.02, 3.6], s: 1.4, c: "#5bb6d8" },
      { k: "wave", pos: [4.2, 0.02, 3.2], s: 1.5, c: "#79c8e4" },
      { k: "rock", pos: [1.8, 0.02, -2.4], s: 0.7, c: "#c9c2b0" },
      { k: "cloud", pos: [-2, 4.8, -5], s: 0.8 },
    ],
  },
  {
    id: "forest", skyTop: "#16283f", skyHorizon: "#2c5a4a", floor: "#1e4a3c", fog: 20,
    ambient: ["#3a6b4f", 0.6],
    props: [
      { k: "moon", pos: [5.6, 5.6, -5], s: 0.9 },
      { k: "tree", pos: [-4, 0, -2], s: 1.2, c: "#2c7a52", c2: "#4a3320" },
      { k: "tree", pos: [-1.6, 0, -3], s: 1, c: "#3a8a5c", c2: "#4a3320" },
      { k: "tree", pos: [4.2, 0, -2.4], s: 1.1, c: "#2c7a52", c2: "#4a3320" },
      { k: "tree", pos: [2, 0, -3.4], s: 0.9, c: "#3a8a5c", c2: "#4a3320" },
      { k: "mushroom", pos: [-2.6, 0, 1.6], s: 1, c: "#e06b9a" },
      { k: "mushroom", pos: [2.8, 0, 1.8], s: 0.8, c: "#f2a93b" },
      { k: "bush", pos: [0.4, 0, 2.6], s: 0.8, c: "#2c7a52", c2: "#1e4a3c" },
      { k: "rock", pos: [-0.6, 0, 3], s: 0.6, c: "#5a6b5a" },
    ],
  },
  {
    id: "space", skyTop: "#0b0f2e", skyHorizon: "#3a2a7a", floor: "#1b1757", fog: 40,
    ambient: ["#6a5ac0", 0.5],
    props: [
      { k: "sun", pos: [7, 7, -8], s: 1.4 },
      { k: "planet", pos: [-4.4, 2.4, -4], s: 1, c: "#e06b9a", c2: "#f2a93b" },
      { k: "planet", pos: [4, 3.4, -5], s: 0.8, c: "#4fc3f7", c2: "#8ef0a0" },
      { k: "star", pos: [-5, 4.6, -4], c: "#ffffff" },
      { k: "star", pos: [-3, 5.6, -6], c: "#ffd166" },
      { k: "star", pos: [5, 5.2, -6], c: "#8ef0a0" },
      { k: "star", pos: [1, 6, -7], c: "#ff8fb0" },
      { k: "star", pos: [-1, 4.2, -5], c: "#ffffff" },
      { k: "star", pos: [3, 4.4, -6.5], c: "#c9a7ff" },
    ],
  },
  {
    id: "party", skyTop: "#6b3fa0", skyHorizon: "#e06b9a", floor: "#9a4fbf", fog: 24,
    ambient: ["#e88ad0", 0.7],
    props: [
      { k: "cake", pos: [-0.6, 0.02, -0.6], s: 1.3, c: "#8ef0a0", c2: "#e06b9a" },
      { k: "balloon", pos: [-3.4, 0, 0.4], s: 1, c: "#ff8fb0", c2: "#e06b9a" },
      { k: "balloon", pos: [-2.4, 0, 1.4], s: 0.8, c: "#7db9ff", c2: "#e06b9a" },
      { k: "balloon", pos: [3.4, 0, 0.8], s: 1.1, c: "#8ef0a0", c2: "#e06b9a" },
      { k: "balloon", pos: [2.6, 0, 2], s: 0.85, c: "#ffd166", c2: "#e06b9a" },
      { k: "table", pos: [3.2, 0.02, -2.4], s: 0.8, c: "#f2a93b", c2: "#6b3fa0" },
      { k: "star", pos: [-5, 5, -5], c: "#ffd166" },
      { k: "star", pos: [5, 5.4, -5], c: "#8ef0a0" },
      { k: "star", pos: [0, 6, -6], c: "#ffffff" },
    ],
  },
  {
    id: "school", skyTop: "#8fb6d8", skyHorizon: "#f7f0e0", floor: "#d8b78a", fog: 24,
    ambient: ["#eef4ea", 0.75],
    props: [
      { k: "desk", pos: [-2.4, 0.02, 0.4], s: 1, c: "#d8b78a", c2: "#8a6a48" },
      { k: "chair", pos: [-2.4, 0.02, 2], s: 0.9, c: "#c8905f", c2: "#f0d4b0" },
      { k: "desk", pos: [2.4, 0.02, 0.4], s: 1, c: "#d8b78a", c2: "#8a6a48" },
      { k: "chair", pos: [2.4, 0.02, 2], s: 0.9, c: "#c8905f", c2: "#f0d4b0" },
      { k: "tree", pos: [-4.6, 0, -2], s: 0.9, c: "#5a8a6a", c2: "#8a6a48" },
      { k: "tree", pos: [4.6, 0, -2], s: 0.9, c: "#5a8a6a", c2: "#8a6a48" },
      { k: "sun", pos: [6.5, 6, -6] },
      { k: "cloud", pos: [-4, 4.6, -4], s: 0.85 },
    ],
  },
  {
    id: "rooftop", skyTop: "#0e1233", skyHorizon: "#3a2a6a", floor: "#22264f", fog: 30,
    ambient: ["#4a5a9a", 0.6],
    props: [
      { k: "moon", pos: [5.8, 5.8, -5], s: 1.1 },
      { k: "building", pos: [-4.4, 0, -2], s: 1, c: "#1a1e44", c2: "#ffd166" },
      { k: "building", pos: [-2.4, 0, -2.6], s: 0.8, c: "#22264f", c2: "#7db9ff" },
      { k: "building", pos: [4.2, 0, -2.2], s: 0.9, c: "#1a1e44", c2: "#8ef0a0" },
      { k: "building", pos: [2.4, 0, -3], s: 0.7, c: "#22264f", c2: "#ff8fb0" },
      { k: "star", pos: [-5, 5.2, -5], c: "#ffffff" },
      { k: "star", pos: [-2, 6, -6], c: "#ffd166" },
      { k: "star", pos: [3, 5.6, -5.4], c: "#8ef0a0" },
      { k: "star", pos: [0.5, 6.4, -7], c: "#ffffff" },
      { k: "lamp", pos: [-0.6, 0.02, 2.4], s: 0.8, c: "#ffd166", c2: "#3a2a6a" },
    ],
  },
];

export const ROOM_IDS = ROOM_THEMES.map((r) => r.id);

/* ── the room environment (sky + floor + fog + props) ── */

export function Room({ theme }: { theme: RoomTheme }) {
  const props = useMemo(
    () => theme.props.map((p, i) => <Prop key={i} p={p} />),
    [theme]
  );
  return (
    <group>
      <SkyDome top={theme.skyTop} horizon={theme.skyHorizon} />
      <fog attach="fog" args={[theme.skyHorizon, 14, theme.fog]} />
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <circleGeometry args={[9, 44]} />
        <meshStandardMaterial color={theme.floor} roughness={0.95} />
      </mesh>
      {props}
    </group>
  );
}

/* re-export the room list type for the picker */
export type { ReactElement };
