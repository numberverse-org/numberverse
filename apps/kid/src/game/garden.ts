/**
 * 🌱 THE GROWTH GARDEN — a living reward that grows with every correct answer.
 *
 * The whole app is the garden: every correct round waters the current plant,
 * and every newly-mastered skill plants a flower named after that lesson. A
 * kid who plays keeps seeing their garden grow — a tangible, motivating,
 * visible "you did it" that is 100% local-first and derived from the same
 * progress that already syncs to the server.
 *
 * Growth model (kept simple for 2–6 year-olds):
 *   · each plant passes 6 stages: seed → sprout → young → bloom → flower → fruit
 *   · 3 correct answers move a plant up one stage (18 correct = a full fruit)
 *   · when the active plant fruits, the NEXT correct answer plants a wild sprout
 *   · mastering a skill always plants a trophy flower named after the lesson
 *   · the garden caps at 8 plants — a full garden just sparkles (no waste)
 */

export interface GardenPlant {
  id: string;
  /** What this plant is — a skill title for mastery flowers, "Wild sprout" otherwise. */
  title: string;
  /** The skill that planted this flower (mastery trophies only). */
  skillId?: string;
  /** Growth stage 0..5 (see STAGE_EMOJI). */
  stage: number;
  /** Water progress toward the NEXT stage (0..WATER_PER_STAGE-1). */
  water: number;
}

export interface GardenState {
  plants: GardenPlant[];
}

/** Correct answers needed to advance one stage. */
export const WATER_PER_STAGE = 3;
/** Max plants in the garden display. */
export const MAX_PLANTS = 8;
/** 0 = seed … 5 = fruit. */
export const STAGE_EMOJI = ["🌱", "🌿", "🪴", "🌷", "🌸", "🌳"] as const;
export const STAGE_NAME_EN = ["Seed", "Sprout", "Young", "Bloom", "Flower", "Fruitful"] as const;
export const STAGE_NAME_BN = ["বীজ", "চারা", "কচি", "কুঁড়ি", "ফুল", "ফল"] as const;

export const emptyGarden = (): GardenState => ({ plants: [] });

function plantId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* older webviews */
  }
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The plant that should grow next: the LAST plant that hasn't fruited yet. */
function activePlant(g: GardenState): GardenPlant | undefined {
  for (let i = g.plants.length - 1; i >= 0; i--) {
    if (g.plants[i].stage < 5) return g.plants[i];
  }
  return undefined;
}

/** New wild sprout — appears when the current plant finishes growing. */
function wildSprout(): GardenPlant {
  return { id: plantId(), title: "Wild sprout", stage: 0, water: 0 };
}

/**
 * Water the garden — a correct answer adds water. #1190: the amount can scale
 * with round difficulty (a hard win waters more, up to WATER_PER_STAGE), so the
 * garden keeps its 3-correct cadence for easy rounds but a hard/band-4+ correct
 * advances a stage in 2. Pure — the caller persists it.
 */
export function waterGarden(g: GardenState, amount = 1): GardenState {
  const add = Math.max(1, Math.min(Math.round(amount), WATER_PER_STAGE));
  let plant = activePlant(g);
  if (!plant) {
    // No plant is still growing — plant a wild sprout (unless the garden is full).
    if (g.plants.length >= MAX_PLANTS) return g; // full garden sparkles instead
    plant = wildSprout();
    g = { plants: [...g.plants, plant] };
  }
  const water = plant.water + add;
  if (water >= WATER_PER_STAGE) {
    // Stage up (or fruit) — one big, visible jump feels better than many tiny ones.
    const stage = Math.min(5, plant.stage + 1);
    // #1429 — carry the overflow into the NEXT stage instead of silently
    // discarding it. A hard win can never waste the extra water it earned.
    const nextWater = stage >= 5 ? 0 : water - WATER_PER_STAGE;
    return {
      plants: g.plants.map((p) => (p.id === plant!.id ? { ...p, stage, water: nextWater } : p)),
    };
  }
  return { plants: g.plants.map((p) => (p.id === plant!.id ? { ...p, water } : p)) };
}

/**
 * A skill was just mastered → plant a trophy flower named after the lesson.
 * Always rewarding: if the garden is full, the OLDEST plant bursts into fruit
 * instead (so mastery never silently does nothing).
 */
export function masteryPlant(g: GardenState, skillId: string, title: string): GardenState {
  // One flower per skill — re-mastering the same lesson doesn't double-plant.
  if (g.plants.some((p) => p.skillId === skillId)) return g;
  if (g.plants.length >= MAX_PLANTS) {
    // Plants are only ever appended, so the FIRST slot is the true oldest plant.
    const oldest = g.plants[0];
    return {
      plants: g.plants.map((p) =>
        p.id === oldest.id ? { ...p, stage: 5, water: 0, title: `${p.title} ✨` } : p
      ),
    };
  }
  const flower: GardenPlant = {
    id: plantId(),
    title,
    skillId,
    stage: 0,
    water: 0, // a fresh seed — but it's a TROPHY, so it gets a head start below
  };
  // Trophy flowers start at stage 2 (already sprouting) so mastery is instantly visible.
  flower.stage = 2;
  return { plants: [...g.plants, flower] };
}

/** Progress summary for the home tile: total plants + how many are fruiting. */
export function gardenSummary(g: GardenState): { plants: number; fruits: number } {
  return {
    plants: g.plants.length,
    fruits: g.plants.filter((p) => p.stage >= 5).length,
  };
}
