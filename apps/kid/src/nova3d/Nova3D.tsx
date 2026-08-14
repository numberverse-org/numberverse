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
 */
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ACTIVITIES } from "../game/activities";
import { getAppLang } from "../game/locale";
import { ROOMS } from "../game/rooms";
import { prefersReducedMotion } from "../game/reducedMotion";
import { STR } from "../i18n";
import { OrbitCamera } from "./camera";
import { RoomLights } from "./lighting";
import { is2DGame, rigFor } from "./OwlRig";
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
function EmojiBurst({ burst }: { burst: Burst | null }) {
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
    <div className="island-burst" aria-hidden="true">
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

/* ── the 3D home room ── */

interface Nova3DProps {
  /** #688 — a tapped 2D-only mini-game routes back to the 2D home */
  onPlay2d?: () => void;
}

export default function Nova3D({ onPlay2d }: Nova3DProps = {}) {
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
  const hintTimer = useRef<number | null>(null);
  const [showWalkHint, setShowWalkHint] = useState(false);

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
  };

  /* ── #688 spatial actions ── */

  const playAction = (id: string) => {
    if (is2DGame(id)) {
      onPlay2d?.();
      return;
    }
    const rig = rigFor(id);
    burstId.current += 1;
    setActionId(id);
    setBurst({ id: burstId.current, emoji: rig.burst ?? [] });
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
    burstId.current += 1;
    setActionId("game-stroke");
    setBurst({ id: burstId.current, emoji: rigPet.burst ?? [] });
    window.setTimeout(() => {
      setActionId((cur) => (cur === "game-stroke" ? null : cur));
    }, 2000);
  };

  const onFloorClick = (e: { stopPropagation: () => void; point: THREE.Vector3 }) => {
    e.stopPropagation();
    // keep the owl inside the floor circle
    const x = THREE.MathUtils.clamp(e.point.x, -4.6, 4.6);
    const z = THREE.MathUtils.clamp(e.point.z, -3.4, 3.4);
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
    <div className="island-scene">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [4.8, 3.2, 5.6], fov: 45 }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        onCreated={({ gl }) => gl.setClearColor("#8ed0f2", 1)}
      >
        <ContextGuard />
        <RoomLights theme={theme} />
        <Room theme={theme} />
        <Nova
          clip={clip}
          morph={morph}
          reduced={reduced}
          position={[0, 0.04, 0]}
          scale={0.95}
          tint={tint}
          walkTo={walkTo}
          onPet={onPet}
        />
        {/* invisible floor: tap to walk Nova there (#688) */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} onClick={onFloorClick}>
          <planeGeometry args={[15, 13]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <OrbitCamera reduced={reduced} />
      </Canvas>

      {/* #688 floating emoji burst + walk hint */}
      <EmojiBurst burst={burst} />
      {showWalkHint && <p className="island-walkhint">👣 {t.islandWalkHint}</p>}

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
