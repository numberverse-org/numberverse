/**
 * 🦉 NOVA'S 3D HOME ROOM — the lazy-loaded three.js surface (#684 → #687).
 *
 * #687 turns the #684 foundation into a real home:
 *   • the room set (12 dioramas from Room.tsx) with a kid-friendly
 *     prev/next room switcher (EN + BN, ids shared with the 2D rooms.ts)
 *   • the real single-draw-call glTF owl (OwlModel.tsx) instead of the
 *     procedural placeholder — animated + morphing, casting the room's
 *     one soft shadow
 *   • PBR lighting per room theme (lighting.tsx) + orbit/zoom camera with
 *     reduced-motion clamps (camera.tsx)
 *   • strict WebGL-context lifecycle: a ContextGuard force-releases the
 *     context on unmount, and the host never mounts this alongside Phaser
 */
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { getAppLang } from "../game/locale";
import { ROOMS } from "../game/rooms";
import { prefersReducedMotion } from "../game/reducedMotion";
import { STR } from "../i18n";
import { OrbitCamera } from "./camera";
import { RoomLights } from "./lighting";
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

/* ── the 3D home room ── */

export default function Nova3D() {
  const reduced = prefersReducedMotion();
  const lang = getAppLang() === "bn" ? "bn" : "en";
  const t = STR[lang];
  const [roomIdx, setRoomIdx] = useState(initialRoom);

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
        <Nova clip="idle" morph="happy" reduced={reduced} position={[0, 0.04, 0]} scale={0.95} />
        <OrbitCamera reduced={reduced} />
      </Canvas>

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
    </div>
  );
}
