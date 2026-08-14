/**
 * 🦉 #689 — outfits visually attach to the 3D owl.
 *
 * Nova's accessories (NOVA_OUTFITS: scarf/panjabi/cape/hat/glasses/bow/boots/
 * backpack + festival sets) are rendered as tiny primitives mounted to the owl
 * group. Positions come from the real nova.glb bounds (feet y≈0.14 → head top
 * y≈2.79, wings ±1.34, owl faces +Z) so a hat actually sits on the head and a
 * cape actually hangs behind the shoulders. The owl animates; the accessory
 * rides the group (walks with Nova, bobs gently at idle).
 *
 * No store writes here — buying/equipping stays in the 2D Nova (novaBuy /
 * novaEquip still cap coins at NOVA_DAILY_CAP). The island only READS the
 * equipped id and shows it.
 */
import type { ReactElement } from "react";
import { NOVA_OUTFITS } from "../store";

/** accessory body color per outfit id (matches the 2D card look) */
const OUTFIT_COLOR: Record<string, string> = {
  scarf: "#d62828", panjabi: "#f4a261", cape: "#9d4edd", hat: "#ffd166",
  glasses: "#2a9d8f", bow: "#ff8fb0", boots: "#7a4e2a", backpack: "#4cc9f0",
  "eid-panjabi": "#2a9d8f", "eid-topi": "#6a040f",
  "boishakh-sharee": "#e63946", "boishakh-fan": "#ffd166",
};

function Kind({ kind, color }: { kind: string; color: string }): ReactElement {
  switch (kind) {
    /* 🧣 cozy scarf — a torus around the neck */
    case "scarf":
      return (
        <mesh position={[0, 2.08, 0.42]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <torusGeometry args={[0.44, 0.13, 12, 26]} />
          <meshStandardMaterial color={color} roughness={0.85} />
        </mesh>
      );
    /* 🇧🇩 panjabi / 🥻 sharee — a tunic band around the chest */
    case "tunic":
      return (
        <mesh position={[0, 1.7, 0.05]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <torusGeometry args={[0.72, 0.2, 12, 26]} />
          <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
      );
    /* 🦸 hero cape — a thin box behind the shoulders */
    case "cape":
      return (
        <mesh position={[0, 1.85, -0.78]} castShadow>
          <boxGeometry args={[1.35, 1.5, 0.08]} />
          <meshStandardMaterial color={color} roughness={0.85} />
        </mesh>
      );
    /* 🎩 party hat / 🧢 eid-topi — a cone on the head */
    case "hat":
      return (
        <group position={[0, 2.55, 0.26]} rotation={[0, 0, 0.16]}>
          <mesh position={[0, 0.22, 0]} castShadow>
            <coneGeometry args={[0.32, 0.52, 20]} />
            <meshStandardMaterial color={color} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0, 0]} castShadow>
            <torusGeometry args={[0.34, 0.06, 10, 24]} />
            <meshStandardMaterial color="#ffffff" roughness={0.6} />
          </mesh>
        </group>
      );
    /* 🕶️ cool shades — two small boxes in front of the eyes */
    case "glasses":
      return (
        <>
          <mesh position={[-0.42, 2.3, 0.6]} rotation={[0, 0, -0.25]} castShadow>
            <boxGeometry args={[0.34, 0.22, 0.06]} />
            <meshStandardMaterial color={color} roughness={0.3} />
          </mesh>
          <mesh position={[0.42, 2.3, 0.6]} rotation={[0, 0, 0.25]} castShadow>
            <boxGeometry args={[0.34, 0.22, 0.06]} />
            <meshStandardMaterial color={color} roughness={0.3} />
          </mesh>
        </>
      );
    /* 🎀 cute bow — two spheres on the side of the head */
    case "bow":
      return (
        <group position={[0.5, 2.42, 0.42]} rotation={[0, 0, -0.4]}>
          <mesh position={[-0.13, 0, 0]} castShadow>
            <sphereGeometry args={[0.12, 12, 12]} />
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
          <mesh position={[0.13, 0, 0]} castShadow>
            <sphereGeometry args={[0.12, 12, 12]} />
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <sphereGeometry args={[0.06, 10, 10]} />
            <meshStandardMaterial color="#ffd166" roughness={0.5} />
          </mesh>
        </group>
      );
    /* 🥾 adventure boots — two boxes over the feet */
    case "boots":
      return (
        <>
          <mesh position={[-0.28, 0.32, 0.05]} castShadow>
            <boxGeometry args={[0.3, 0.32, 0.52]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
          <mesh position={[0.28, 0.32, 0.05]} castShadow>
            <boxGeometry args={[0.3, 0.32, 0.52]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
        </>
      );
    /* 🎒 school bag — a box on the back */
    case "backpack":
      return (
        <mesh position={[0, 1.8, -0.88]} castShadow>
          <boxGeometry args={[0.7, 0.82, 0.28]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
      );
    default:
      return <></>;
  }
}

/** the equipped accessory, mounted to the owl group (#689) */
export function Outfit3D({ outfitId }: { outfitId: string }): ReactElement | null {
  const outfit = NOVA_OUTFITS.find((o) => o.id === outfitId);
  if (!outfit || outfitId === "none") return null;
  return <Kind kind={outfit.kind} color={OUTFIT_COLOR[outfit.id] ?? "#ffffff"} />;
}
