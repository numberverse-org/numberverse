/**
 * 🦉 #687 — orbit/zoom camera rig with reduced-motion clamps.
 *
 * Touch: one-finger drag orbits, two-finger pinch zooms. Reduced motion
 * disables auto-rotate entirely and keeps the camera closer to the owl so
 * nothing needs panning; polar is clamped above the floor and below the
 * sky dome so the room never reads upside-down.
 */
import { OrbitControls } from "@react-three/drei";

export function OrbitCamera({ reduced }: { reduced: boolean }) {
  return (
    <OrbitControls
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={3.2}
      maxDistance={12}
      minPolarAngle={Math.PI / 5}
      maxPolarAngle={Math.PI / 2.05}
      autoRotate={!reduced}
      autoRotateSpeed={0.5}
    />
  );
}
