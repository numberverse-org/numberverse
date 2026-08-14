/**
 * 🦉 NOVA'S 3D HOME ROOM — the lazy-loaded three.js surface (#684 → #687 → #688).
 *
 * #687 turned the #684 foundation into a real home:
 *   • the room set (12 dioramas from Room.tsx) with a kid-friendly
 *     prev/next room switcher (EN + BN, ids shared with the 2D rooms.ts)
 *   • the real single-draw-call glTF owl (OwlModel.tsx) — animated + morphing,
 *     casting the room's one soft shadow
 *   • PBR lighting per room theme (lighting.tsx) + orbit/zoom camera with
 *     reduced-motion clamps (camera.tsx)
 *   • strict WebGL-context lifecycle: a ContextGuard force-releases the
 *     context on unmount, and the host never mounts this alongside Phaser
 *
 * #688 adds the spatial actions on top:
 *   • OwlRig.ts maps every activity id (41 care + 10 mini-games) to a
 *     clip+morph combo; the action palette re-hosts them as tap-to-play with
 *     a floating-emoji burst. 2D-only mini-games route to the 2D home.
 *   • 3D-native: tap the floor → Nova walks there (walk clip + rotation);
 *     tap Nova → pet; Feed / Pet / Bathe play natively; dress-up tints the
 *     shared KTX2 atlas.
 *
 * #689 wires the store (unchanged) so growth shows in 3D:
 *   • petStage 0 renders the egg; 1→3 scale the owl up (hatch→young→grown);
 *     species tints the feathers + shows its evolution emoji badge
 *   • the equipped outfit attaches as 3D accessories (Outfit3D.tsx)
 *   • the coin badge reads nova.coins (rewards still capped by the store)
 *   • the growth garden renders as 3D plants in the garden room, and new
 *     growth is celebrated — no silent dead-ends
 *
 * #690 perf + vestibular/WCAG safety:
 *   • DynamicResolution watches real frame time and drops pixelRatio a step
 *     under load (half-res + CSS upscale), recovers when frames do
 *   • reduced motion: egg frozen (no bob), burst = opacity dissolve (no
 *     scale/pulse), active presses neutral, camera already clamped (#687),
 *     the owl's idle clip frozen + morph dissolve slowed (#687)
 *   • flash safety: bursts are throttled ≥ 350 ms apart (never > 3/s); no
 *     saturated-red strobes (small floating emojis only)
 *   • a11y: canvas gets aria-label + role="img"; room switches and action
 *     taps speak their names so spoken feedback works without motion
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { MathUtils } from "three";
import type { Vector3 } from "three";
import { ACTIVITIES } from "../game/activities";
import { emptyGarden } from "../game/garden";
import { getAppLang } from "../game/locale";
import { ROOMS } from "../game/rooms";
import { prefersReducedMotion } from "../game/reducedMotion";
import { speak } from "../game/speech";
import { STR } from "../i18n";
import { defaultNova, speciesById, speciesEmoji, useKidStore } from "../store";
import { OrbitCamera } from "./camera";
import { DynamicResolution } from "./DynamicResolution";
import { Egg3D } from "./Egg3D";
import { Garden3D } from "./Garden3D";
import { RoomLights } from "./lighting";
import { is2DGame, rigFor } from "./OwlRig";
import { Outfit3D } from "./Outfit3D";
import { Nova } from "./OwlModel";
import { Room, ROOM_THEMES } from "./Room";

/* ── the one WebGL context stays safe: hard-release on unmount ── */

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

/* ── room persistence: the home room sticks across visits (#687) ── */

const ROOM_LS = "nv_3d_room";
function initialRoom(): number {
  try {
    const saved = window.localStorage.getItem(ROOM_LS);
    if (saved !== null) {
      const i = ROOM_THEMES.findIndex((r) => r.id === saved);
      if (i >= 0) return i;
    }
  } catch {
    /* storage blocked — start on the field */
  }
  return 0;
}

/* ── #688 dress-up swatches: tint the shared KTX2 atlas (natural = white) ── */

const DRESS_SWATCHES: { key: string; tint?: string; cls: string }[] = [
  { key: "Natural", cls: "sw-natural" },
  { key: "Gold", tint: "#ffd27a", cls: "sw-gold" },
  { key: "Rosy", tint: "#ff9eb5", cls: "sw-rosy" },
  { key: "Mint", tint: "#8ef0d6", cls: "sw-mint" },
];

/* ── #688 floating-emoji burst over the owl (the 2D burstEmoji, in the DOM) ── */

interface Burst {
  id: number;
  emoji: string[];
}
function EmojiBurst({ burst, reduced }: { burst: Burst | null; reduced: boolean }) {
  const [items, setItems] = useState<{ id: number; e: string; x: number; y: number; d: number; delay: number }[]>([]);
  useEffect(() => {
    if (!burst || burst.emoji.length === 0) return;
    const n = burst.emoji.length;
    const list = burst.emoji.map((e, i) => ({
      id: burst.id * 100 + i,
      e,
      x: (i - (n - 1) / 2) * 34 + (Math.random() * 22 - 11),
      y: Math.random() * 20 + 6,
      d: 0.7 + Math.random() * 0.5,
      delay: i * 60,
    }));
    setItems(list);
    const timer = window.setTimeout(() => setItems([]), 1500);
    return () => window.clearTimeout(timer);
  }, [burst]);
  if (items.length === 0) return null;
  return (
    // #690 reduced motion → pure opacity dissolve (island-burst--reduced), no scale/pulse
    <div className={`island-burst${reduced ? " island-burst--reduced" : ""}`} aria-hidden="true">
      {items.map((it) => (
        <span
          key={it.id}
          className="island-burst-emoji"
          style={{
            left: `calc(50% + ${it.x}px)`,
            top: `calc(38% + ${it.y}px)`,
            animationDelay: `${it.delay}ms`,
            animationDuration: `${it.d}s`,
          }}
        >
          {it.e}
        </span>
      ))}
    </div>
  );
}


/* ── #689 egg→grown per species: 0=egg 1=hatch 2=young 3=grown ── */

const STAGE_SCALE = [0, 0.55, 0.75, 0.95] as const;
const SPECIES_TINT: Record<string, string | undefined> = {
  owl: undefined, cat: "#f0a868", peacock: "#2a9d8f", dragon: "#6abf6a",
};

/* ── the 3D home room ── */

interface Nova3DProps {
  /** #688 — a tapped 2D-only mini-game routes back to the 2D home */
  onPlay2d?: () => void;
  /** #689 — the active kid (store keys: nova / garden / coins) */
  kidId?: string;
}

export default function Nova3D({ onPlay2d, kidId = "" }: Nova3DProps = {}) {
  const reduced = prefersReducedMotion();
  const lang = getAppLang() === "bn" ? "bn" : "en";
  const t = STR[lang];
  const [roomIdx, setRoomIdx] = useState(initialRoom);
  const [actionId, setActionId] = useState<string | null>(null); // rig trigger
  const [burst, setBurst] = useState<Burst | null>(null);
  const [walkTo, setWalkTo] = useState<{ x: number; z: number; id: number } | null>(null);
  const [tint, setTint] = useState<string | undefined>(undefined);
  const [dressOpen, setDressOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const burstId = useRef(0);
  const walkId = useRef(0);
  const lastBurstMs = useRef(0); // #690 flash safety: throttle bursts ≥ 350 ms (never > 3/s)
  const hintTimer = useRef<number | null>(null);
  const [showWalkHint, setShowWalkHint] = useState(false);

  /* ── #689 the store drives the 3D pet (read-only — rewards stay capped) ── */
  const nova = useKidStore((s) => s.nova[kidId]) ?? defaultNova();
  const garden = useKidStore((s) => s.garden[kidId]) ?? emptyGarden();
  const petStage = Math.max(0, Math.min(3, nova.petStage));
  const grown = petStage > 0; // egg vs owl
  const owlScale = STAGE_SCALE[petStage] ?? 0.95;
  const effectiveTint = tint ?? SPECIES_TINT[nova.species]; // dress-up wins, else species
  const equipped = grown ? nova.equipped : "none";
  const sp = speciesById(nova.species);
  const speciesLabel = lang === "bn" ? sp.nameBn : sp.name;

  /* garden growth celebration — new plants appear visibly, never silent */
  const GARDEN_LS = (id: string) => `nv_3d_garden_${id}`;
  const [gardenToast, setGardenToast] = useState<string | null>(null);
  useEffect(() => {
    try {
      const prev = Number(window.localStorage.getItem(GARDEN_LS(kidId)) ?? "-1");
      if (prev >= 0 && garden.plants.length > prev) {
        setGardenToast(t.islandGardenGrew);
        fireBurst(["🌱", "🌷", "⭐"]);
      }
      window.localStorage.setItem(GARDEN_LS(kidId), String(garden.plants.length));
    } catch {
      /* storage blocked — growth simply isn't tracked this visit */
    }
    const timer = window.setTimeout(() => setGardenToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [garden.plants.length, kidId, t.islandGardenGrew]);

  const theme = ROOM_THEMES[roomIdx];
  const room2d = ROOMS.find((r) => r.id === theme.id);

  const nextRoom = (dir: 1 | -1) => {
    setRoomIdx((i) => {
      const n = (i + dir + ROOM_THEMES.length) % ROOM_THEMES.length;
      try {
        window.localStorage.setItem(ROOM_LS, ROOM_THEMES[n].id);
      } catch {
        /* storage blocked — session-only */
      }
      return n;
    });
    // #690 spoken feedback fires regardless of motion (names come from ROOMS)
    const nextId = ROOM_THEMES[(roomIdx + dir + ROOM_THEMES.length) % ROOM_THEMES.length].id;
    const nextRoom2d = ROOMS.find((r) => r.id === nextId);
    if (nextRoom2d) speak(lang === "bn" ? nextRoom2d.nameBn ?? nextRoom2d.name : nextRoom2d.name, { lang });
  };

  /** #690 — WCAG 2.3.1: no flash > 3/s. Bursts coalesce to ≥ 350 ms apart. */
  const fireBurst = (emoji: string[]) => {
    const now = performance.now();
    if (now - lastBurstMs.current < 350) return; // too soon — skip this one
    lastBurstMs.current = now;
    burstId.current += 1;
    setBurst({ id: burstId.current, emoji });
  };

  /* ── #688 spatial actions ── */

  const playAction = (id: string) => {
    if (is2DGame(id)) {
      onPlay2d?.();
      return;
    }
    const rig = rigFor(id);
    setActionId(id);
    fireBurst(rig.burst ?? []);
    // #690 spoken feedback without motion
    const act = ACTIVITIES.find((a) => a.id === id);
    if (act) speak(lang === "bn" ? act.nameBn : act.name, { lang });
    const holdMs = (rig.hold ?? 1.6) * 1000;
    window.setTimeout(() => {
      setActionId((cur) => (cur === id ? null : cur));
    }, holdMs);
  };

  const rig = actionId ? rigFor(actionId) : null;
  const clip = rig?.clip ?? "idle";
  const morph = rig?.morph ?? "happy";

  const onPet = () => {
    const rigPet = rigFor("game-stroke");
    setActionId("game-stroke");
    fireBurst(rigPet.burst ?? []);
    const act = ACTIVITIES.find((a) => a.id === "game-stroke");
    if (act) speak(lang === "bn" ? act.nameBn : act.name, { lang });
    window.setTimeout(() => {
      setActionId((cur) => (cur === "game-stroke" ? null : cur));
    }, 2000);
  };

  const onFloorClick = (e: { stopPropagation: () => void; point: Vector3 }) => {
    e.stopPropagation();
    // keep the owl inside the floor circle
    const x = MathUtils.clamp(e.point.x, -4.6, 4.6);
    const z = MathUtils.clamp(e.point.z, -3.4, 3.4);
    walkId.current += 1;
    setWalkTo({ x, z, id: walkId.current });
    // one gentle "tap the floor" hint per room visit
    if (!showWalkHint) {
      setShowWalkHint(true);
      if (hintTimer.current) window.clearTimeout(hintTimer.current);
      hintTimer.current = window.setTimeout(() => setShowWalkHint(false), 3800);
    }
  };

  return (
    <div className="island-scene" data-motion={reduced ? "reduced" : "full"}>
      {/* #690 a11y: the island is a meaningful image for screen readers */}
      <Canvas
        shadows
        aria-label={`${t.islandTitle} — ${speciesLabel}`}
        role="img"
        dpr={reduced ? [0.75, 1.25] : [1, 1.5]}
        camera={{ position: [4.8, 3.2, 5.6], fov: 45 }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        onCreated={({ gl }) => gl.setClearColor("#8ed0f2", 1)}
      >
        <ContextGuard />
        {/* #690 dynamic render resolution: half-res + CSS upscale under load */}
        <DynamicResolution reduced={reduced} />
        <RoomLights theme={theme} />
        <Room theme={theme} />
        {grown ? (
          <Nova
            clip={clip}
            morph={morph}
            reduced={reduced}
            position={[0, 0.04, 0]}
            scale={owlScale}
            tint={effectiveTint}
            walkTo={walkTo}
            onPet={onPet}
          >
            {/* #689 the equipped outfit rides the owl group */}
            {equipped !== "none" && <Outfit3D outfitId={equipped} />}
          </Nova>
        ) : (
          <Egg3D hopping={actionId !== null} reduced={reduced} />
        )}
        {/* invisible floor: tap to walk Nova there (#688, grown pets only) */}
        {grown && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} onClick={onFloorClick}>
            <planeGeometry args={[15, 13]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}
        {/* #689 the growth garden lives in its room (new plants = visible reward) */}
        {theme.id === "garden" && <Garden3D garden={garden} position={[2.8, 0.02, 2.6]} />}
        <OrbitCamera reduced={reduced} />
      </Canvas>

      {/* #688 floating emoji burst + #689 garden-growth toast + walk hint */}
      <EmojiBurst burst={burst} reduced={reduced} />
      {gardenToast && <p className="island-walkhint">{gardenToast}</p>}
      {showWalkHint && <p className="island-walkhint">👣 {t.islandWalkHint}</p>}

      {/* #689 pet badge: evolution emoji + coin count (rewards stay capped) */}
      <div className="island-petbadge" aria-label={`${speciesLabel} · ${t.islandCoins} ${nova.coins}`}>
        <span className="island-petemoji" aria-hidden="true">
          {speciesEmoji(nova.species, petStage)}
        </span>
        <span className="island-coin" aria-hidden="true">
          🪙 {nova.coins}
        </span>
      </div>

      {/* #688 dress-up: feather tint swatches (natural/gold/rosy/mint) */}
      <div className="island-dress" role="group" aria-label={t.islandDressup}>
        <button
          className="island-dressbtn"
          aria-expanded={dressOpen}
          aria-label={t.islandDressup}
          onClick={() => setDressOpen((o) => !o)}
        >
          🎨
        </button>
        {dressOpen && (
          <div className="island-dressrow">
            {DRESS_SWATCHES.map((s) => (
              <button
                key={s.key}
                className={`island-swatch ${s.cls}${tint === s.tint ? " is-on" : ""}`}
                style={s.tint ? { background: s.tint } : undefined}
                aria-label={t[`islandDressup${s.key}` as keyof typeof t] as string}
                onClick={() => setTint(s.tint)}
              />
            ))}
          </div>
        )}
      </div>

      {/* kid-friendly room switcher (prev/next cycle) */}
      <div className="island-roombar" role="region" aria-label={t.islandTitle}>
        <button
          className="island-roombtn"
          onClick={() => nextRoom(-1)}
          aria-label={t.islandRoomPrev}
        >
          ‹
        </button>
        <span className="island-roomname" aria-live="polite">
          {room2d?.emoji ?? "🦉"} {lang === "bn" ? room2d?.nameBn ?? room2d?.name : room2d?.name}
        </span>
        <button
          className="island-roombtn"
          onClick={() => nextRoom(1)}
          aria-label={t.islandRoomNext}
        >
          ›
        </button>
      </div>

      {/* #688 action palette: all 51 activities re-hosted as spatial actions */}
      <div className="island-palette" role="region" aria-label={t.islandActions}>
        <button
          className="island-palette-toggle"
          aria-expanded={paletteOpen}
          aria-label={t.islandActions}
          onClick={() => setPaletteOpen((o) => !o)}
        >
          {paletteOpen ? "✕" : "🎭"}
        </button>
        {paletteOpen && (
          <div className="island-palette-tray">
            {ACTIVITIES.map((a) => (
              <button
                key={a.id}
                className={`island-action${actionId === a.id ? " is-playing" : ""}`}
                onClick={() => playAction(a.id)}
                aria-label={`${a.name}${is2DGame(a.id) ? ` (${t.islandIn2d})` : ""}`}
              >
                <span className="island-action-emoji">{a.emoji}</span>
                <span className="island-action-name">
                  {lang === "bn" ? a.nameBn : a.name}
                </span>
                {is2DGame(a.id) && <span className="island-action-2d">{t.islandIn2d}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
