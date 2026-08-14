/**
 * 🦉 #687 — PBR light rig + one soft shadow (design doc §5: "one 1024² PCF
 * soft shadow map, single directional light").
 *
 * The room theme supplies the ambient tint/intensity; a hemisphere light
 * gives the PBR surfaces cheap sky/ground bounce, and ONE directional sun
 * casts the soft shadow the owl + props fall onto. Lamps/sun/stars in the
 * room props add their own small emissive glow (see Room.tsx).
 */
import type { RoomTheme } from "./Room";

export function RoomLights({ theme }: { theme: RoomTheme }) {
  const [ambientColor, ambientIntensity] = theme.ambient;
  return (
    <>
      <ambientLight color={ambientColor} intensity={ambientIntensity} />
      <hemisphereLight args={[theme.skyTop, theme.floor, 0.55]} />
      <directionalLight
        position={[4.5, 7.5, 3]}
        intensity={1.35}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0004}
        shadow-radius={6}
        shadow-camera-near={1}
        shadow-camera-far={20}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
      />
    </>
  );
}
