import { Html, RoundedBox } from "@react-three/drei";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import { memo, useRef } from "react";
import * as THREE from "three";
import type { Employee } from "../lib/types";
import { AURELIA_SPOTS } from "./layout";

// AURELIA-01: robot melayang berbentuk logo KANASA STUDIO.
function RobotImpl({ employee, icon, speech, selected, onSelect }: {
  employee: Employee; icon: string; speech: string | null; selected: boolean; onSelect: (id: string) => void;
}) {
  const root = useRef<THREE.Group>(null!);
  const glow = useRef<THREE.MeshStandardMaterial>(null!);
  const pos = useRef(new THREE.Vector3(AURELIA_SPOTS.idle.x, AURELIA_SPOTS.idle.y, AURELIA_SPOTS.idle.z));
  const target =
    employee.status === "meeting" ? AURELIA_SPOTS.meet
    : employee.status === "thinking" || employee.status === "reviewing" ? AURELIA_SPOTS.think
    : AURELIA_SPOTS.idle;

  useFrame((st, dt) => {
    const t = st.clock.elapsedTime;
    const k = Math.min(1, dt * 1.5);
    pos.current.x += (target.x - pos.current.x) * k;
    pos.current.y += (target.y - pos.current.y) * k;
    pos.current.z += (target.z - pos.current.z) * k;
    root.current.position.set(pos.current.x, pos.current.y + Math.sin(t * 1.8) * 0.12, pos.current.z);
    root.current.rotation.y = Math.sin(t * 0.6) * 0.35 + 0.5;
    root.current.rotation.z = Math.sin(t * 1.3) * 0.05;
    const busy = employee.status === "thinking" || employee.status === "reviewing";
    glow.current.emissiveIntensity = busy ? 1.2 + Math.sin(t * 8) * 0.8 : 0.9 + Math.sin(t * 2) * 0.3;
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 8) return;
    onSelect(employee.id);
  };

  return (
    <group ref={root} onClick={onClick} scale={0.95}>
      <mesh position={[0, 0, 0]} visible={false}>
        <sphereGeometry args={[1.1, 8, 8]} />
      </mesh>
      {/* telinga/antena */}
      <RoundedBox args={[0.16, 0.7, 0.2]} radius={0.07} position={[-0.78, 0.05, 0]}>
        <meshStandardMaterial color="#1b1b1b" roughness={0.5} />
      </RoundedBox>
      <RoundedBox args={[0.16, 0.7, 0.2]} radius={0.07} position={[0.78, 0.05, 0]}>
        <meshStandardMaterial color="#1b1b1b" roughness={0.5} />
      </RoundedBox>
      {/* kepala */}
      <RoundedBox args={[1.35, 1.05, 0.9]} radius={0.3} smoothness={4} castShadow>
        <meshStandardMaterial color="#ffffff" roughness={0.35} />
      </RoundedBox>
      {/* layar wajah */}
      <RoundedBox args={[1.05, 0.7, 0.1]} radius={0.16} position={[0, -0.02, 0.43]}>
        <meshStandardMaterial color="#141414" roughness={0.25} />
      </RoundedBox>
      {/* mata ^ ^ dan senyum */}
      <group position={[0, 0, 0.5]}>
        <mesh position={[-0.24, 0.08, 0]} rotation={[0, 0, 0]}>
          <torusGeometry args={[0.1, 0.025, 6, 12, Math.PI]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.6} />
        </mesh>
        <mesh position={[0.24, 0.08, 0]}>
          <torusGeometry args={[0.1, 0.025, 6, 12, Math.PI]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.6} />
        </mesh>
        <mesh position={[0, -0.1, 0]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.13, 0.025, 6, 14, Math.PI]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.6} />
        </mesh>
      </group>
      {/* inti oranye */}
      <mesh position={[0, -0.72, 0]}>
        <sphereGeometry args={[0.13, 14, 10]} />
        <meshStandardMaterial ref={glow} color="#f7931e" emissive="#f7931e" emissiveIntensity={1} />
      </mesh>
      <mesh position={[0, -2.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.5, 20]} />
        <meshBasicMaterial color="#000" transparent opacity={0.08} depthWrite={false} />
      </mesh>
      <Html position={[0, 1.15, 0]} center zIndexRange={[25, 0]} style={{ pointerEvents: "none" }}>
        <div className="flex flex-col items-center gap-1" style={{ transform: "translateY(-50%)" }}>
          {speech && (
            <div className="bubble-in pointer-events-auto w-[188px] cursor-pointer rounded-2xl border border-accent/40 bg-surface px-3 py-2 text-[11px] font-bold leading-snug text-text shadow-card" onClick={() => onSelect(employee.id)}>
              <div className="mb-0.5 text-[10px] font-black text-accent-text">AURELIA-01 · CEO</div>
              {speech}
            </div>
          )}
          <div className={`grid min-w-8 place-items-center rounded-full border px-2 py-1 text-[12px] font-black shadow-card ${selected ? "border-accent bg-accent text-white" : "border-line bg-surface text-text"}`}>
            {icon}
          </div>
        </div>
      </Html>
    </group>
  );
}

export const Robot = memo(RobotImpl);
