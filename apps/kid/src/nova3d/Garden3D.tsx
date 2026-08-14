/**
 * 🦉 #689 — the growth garden, visible in 3D.
 *
 * The store's garden (game/garden.ts) grows from 2D lessons: every correct
 * round waters the current plant, every mastered skill plants a trophy flower.
 * Here those plants are rendered as tiny 3D primitives in the garden room, so
 * growth is visible the moment the kid returns to the island — no silent
 * dead-ends. Stages 0..5 mirror the 2D STAGE_EMOJI (seed→sprout→young→bloom→
 * flower→fruit). A plant at stage ≥4 gets a flower sphere in its own colour;
 * at stage 5 it fruits.
 */
import { STAGE_EMOJI, MAX_PLANTS, type GardenState } from "../game/garden";

const PLANT_COLORS = ["#ff8fb0", "#ffd166", "#8ef0a0", "#7db9ff", "#c9a7ff", "#ff9e6d", "#7ee8d2", "#f2a93b"];

/* one plant: stem + leaf, flower at stage ≥3, fruit at stage 5 */
function Plant({ stage, color }: { stage: number; color: string }) {
  const stemH = 0.18 + stage * 0.09; // 0.18 seed … ~0.63 fruit
  const flower = stage >= 3;
  const fruit = stage >= 5;
  return (
    <group>
      {stage > 0 && (
        <mesh position={[0, stemH / 2, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.05, stemH, 8]} />
          <meshStandardMaterial color={stage >= 3 ? "#2f9e55" : "#7bc96b"} roughness={0.9} />
        </mesh>
      )}
      {stage > 1 && (
        <mesh position={[0, stemH - 0.05, 0.02]} rotation={[0, 0, -0.5]} castShadow>
          <sphereGeometry args={[0.09, 8, 8]} />
          <meshStandardMaterial color="#4c8c4a" roughness={0.9} />
        </mesh>
      )}
      {flower && (
        <mesh position={[0, stemH + 0.08, 0]} castShadow>
          <sphereGeometry args={[fruit ? 0.13 : 0.11, 10, 10]} />
          <meshStandardMaterial color={fruit ? "#f2a93b" : color} roughness={0.6} />
        </mesh>
      )}
      {stage <= 0 && (
        <mesh position={[0, 0.03, 0]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial color="#6b8e5a" roughness={1} />
        </mesh>
      )}
    </group>
  );
}

/** a small garden patch — up to MAX_PLANTS primitives, staged like the 2D 🌱 */
export function Garden3D({ garden, position }: { garden: GardenState; position: [number, number, number] }) {
  const plants = garden.plants.slice(0, MAX_PLANTS);
  if (plants.length === 0) return null;
  const cols = Math.ceil(Math.sqrt(plants.length));
  return (
    <group position={position}>
      {/* the soil patch */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]} receiveShadow>
        <circleGeometry args={[0.55 + cols * 0.16, 24]} />
        <meshStandardMaterial color="#7a5b3a" roughness={1} />
      </mesh>
      {plants.map((p, i) => {
        const cx = ((i % cols) - (cols - 1) / 2) * 0.28;
        const cz = (Math.floor(i / cols) - (Math.ceil(plants.length / cols) - 1) / 2) * 0.28;
        return (
          <group key={p.id} position={[cx, 0.02, cz]}>
            <Plant stage={p.stage} color={PLANT_COLORS[i % PLANT_COLORS.length]} />
          </group>
        );
      })}
    </group>
  );
}

export { STAGE_EMOJI };
