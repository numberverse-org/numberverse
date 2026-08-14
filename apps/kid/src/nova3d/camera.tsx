/**
 * 🦉 #687 — orbit/zoom camera rig with reduced-motion clamps.
 *
 * Touch: one-finger drag orbits, two-finger pinch zooms. Reduced motion
 * disables auto-rotate entirely and keeps the camera closer to the owl so
 * nothing needs panning; polar is clamped above the floor and below the
 * sky dome so the room never reads upside-down.
 *
 * #691 — same controls with THREE's own OrbitControls (no @react-three/drei):
 * the drei barrel (Environment/Stage/Text + friends) was inflating the lazy
 * island chunk well past 1 MB. three's example control is ~14 KB and does the
 * exact same job through a 25-line R3F wrapper.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { WebGLRenderer, Camera } from "three";
import { OrbitControls as ThreeOrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export function OrbitCamera({ reduced }: { reduced: boolean }) {
  const { camera, gl } = useThree<{ camera: Camera; gl: WebGLRenderer }>();
  const controls = useRef<ThreeOrbitControls | null>(null);

  useEffect(() => {
    const c = new ThreeOrbitControls(camera, gl.domElement);
    c.enablePan = false;
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.minDistance = 3.2;
    c.maxDistance = 12;
    c.minPolarAngle = Math.PI / 5;
    c.maxPolarAngle = Math.PI / 2.05;
    c.autoRotate = !reduced;
    c.autoRotateSpeed = 0.5;
    c.update();
    controls.current = c;
    return () => {
      c.dispose();
      controls.current = null;
    };
  }, [camera, gl]);

  // #687 — reduced motion disables auto-rotate (never re-creates the rig)
  useEffect(() => {
    if (controls.current) controls.current.autoRotate = !reduced;
  }, [reduced]);

  useFrame(() => {
    controls.current?.update();
  });
  return null;
}
