"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { latLngToVector3 } from "@/lib/geo";

export type GlobeDestination = { id: string; name: string; lat: number; lon: number };
type GlobeProps = { destinations: GlobeDestination[]; focus: GlobeDestination | null; activeId: string | null; onSelect: (destination: GlobeDestination) => void };

function supportsWebGL2() {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.WebGL2RenderingContext && document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

const GLOBE_RADIUS = 1.4;
const CAMERA_DISTANCE = 4.2;

function GlobeMarkers({ destinations, activeId, onSelect }: { destinations: GlobeDestination[]; activeId: string | null; onSelect: (destination: GlobeDestination) => void }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  return <>{destinations.map((destination) => {
    const position = latLngToVector3(destination.lat, destination.lon, GLOBE_RADIUS + 0.015);
    const active = activeId === destination.id;
    const showLabel = hoveredId === destination.id || active;
    return <group key={destination.id} position={position} onPointerDown={(event) => { event.stopPropagation(); onSelect(destination); }} onPointerOver={(event) => { event.stopPropagation(); setHoveredId(destination.id); document.body.style.cursor = "pointer"; }} onPointerOut={() => { setHoveredId(null); document.body.style.cursor = "auto"; }}>
      <mesh>
        <sphereGeometry args={[active ? 0.055 : 0.04, 12, 12]} />
        <meshStandardMaterial color={active ? "#e2a63b" : "#f3eee3"} emissive={active ? "#e2a63b" : "#3fa88c"} emissiveIntensity={active ? 1.4 : 0.9} />
      </mesh>
      {active && <mesh><sphereGeometry args={[0.09, 16, 16]} /><meshBasicMaterial color="#e2a63b" transparent opacity={0.35} depthWrite={false} /></mesh>}
      {showLabel && <Html position={[0, 0.12, 0]} distanceFactor={9} center style={{ pointerEvents: "none" }}><span className="globe-label">{destination.name}</span></Html>}
    </group>;
  })}</>;
}

function FocusRig({ focus }: { focus: GlobeDestination | null }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as OrbitControlsImpl | null;
  const animator = useRef({ progress: 1, from: new THREE.Vector3(0, 0, CAMERA_DISTANCE), to: new THREE.Vector3(0, 0, CAMERA_DISTANCE), fromTarget: new THREE.Vector3(), toTarget: new THREE.Vector3() });
  const basePosition = useRef(new THREE.Vector3(0, 0, CAMERA_DISTANCE));

  useEffect(() => {
    const animation = animator.current;
    if (!focus) { animation.to.copy(basePosition.current); animation.toTarget.set(0, 0, 0); animation.progress = 0; return; }
    const point = latLngToVector3(focus.lat, focus.lon, 1);
    animation.from.copy(camera.position);
    animation.to.copy(point.clone().multiplyScalar(CAMERA_DISTANCE * 0.94));
    animation.fromTarget.copy(controls?.target ?? new THREE.Vector3());
    animation.toTarget.copy(point.clone().multiplyScalar(0.92));
    animation.progress = 0;
  }, [camera, controls, focus]);

  useFrame(() => {
    const animation = animator.current;
    if (animation.progress >= 1) return;
    animation.progress = Math.min(1, animation.progress + 0.035);
    const eased = 1 - Math.pow(1 - animation.progress, 3);
    camera.position.lerpVectors(animation.from, animation.to, eased);
    const target = new THREE.Vector3().lerpVectors(animation.fromTarget, animation.toTarget, eased);
    controls?.target.copy(target);
    controls?.update();
  });

  return null;
}

export function LandingGlobe({ destinations, focus, activeId, onSelect }: GlobeProps) {
  const [supported] = useState(supportsWebGL2);
  if (!supported) return <div className="globe-fallback" role="status"><p>The interactive 3D globe needs WebGL2, which this browser does not currently support.</p><p>You can still use destination search and live navigation below.</p></div>;
  return <div className="globe-canvas" aria-label="Interactive 3D globe of destinations"><Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, CAMERA_DISTANCE], fov: 45 }} gl={{ antialias: true }}>
    <ambientLight intensity={0.85} />
    <directionalLight position={[4, 3, 5]} intensity={1.1} />
    <pointLight position={[-4, -2, -4]} intensity={0.4} color="#3fa88c" />
    <mesh>
      <sphereGeometry args={[GLOBE_RADIUS, 48, 48]} />
      <meshStandardMaterial color="#123240" roughness={0.9} metalness={0.05} />
    </mesh>
    <mesh>
      <sphereGeometry args={[GLOBE_RADIUS + 0.004, 24, 24]} />
      <meshBasicMaterial color="#e2a63b" wireframe transparent opacity={0.12} />
    </mesh>
    <mesh>
      <sphereGeometry args={[GLOBE_RADIUS * 1.02, 32, 32]} />
      <meshBasicMaterial color="#3fa88c" transparent opacity={0.07} side={THREE.BackSide} depthWrite={false} />
    </mesh>
    <GlobeMarkers destinations={destinations} activeId={activeId} onSelect={onSelect} />
    <FocusRig focus={focus} />
    <OrbitControls enablePan={false} minDistance={2.4} maxDistance={7.5} autoRotate autoRotateSpeed={0.5} />
  </Canvas></div>;
}
