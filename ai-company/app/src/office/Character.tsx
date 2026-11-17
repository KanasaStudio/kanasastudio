import { Html } from "@react-three/drei";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Employee } from "../lib/types";
import { buildPath, Spot } from "./layout";

// Geometri bersama (hemat memori di HP).
const G = {
  head: new THREE.SphereGeometry(0.42, 20, 16),
  hairCap: new THREE.SphereGeometry(0.455, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56),
  body: new THREE.CapsuleGeometry(0.3, 0.32, 6, 14),
  arm: new THREE.CapsuleGeometry(0.085, 0.3, 4, 8),
  leg: new THREE.CapsuleGeometry(0.1, 0.3, 4, 8),
  hand: new THREE.SphereGeometry(0.09, 10, 8),
  eye: new THREE.SphereGeometry(0.055, 10, 8),
  eyeShine: new THREE.SphereGeometry(0.018, 6, 6),
  blush: new THREE.CircleGeometry(0.07, 12),
  mouth: new THREE.TorusGeometry(0.06, 0.014, 6, 12, Math.PI),
  lid: new THREE.TorusGeometry(0.05, 0.014, 6, 12, Math.PI),
  bun: new THREE.SphereGeometry(0.17, 12, 10),
  tail: new THREE.CapsuleGeometry(0.11, 0.38, 4, 8),
  spike: new THREE.ConeGeometry(0.11, 0.3, 6),
  tuft: new THREE.SphereGeometry(0.16, 10, 8),
  capBrim: new THREE.CylinderGeometry(0.34, 0.34, 0.035, 18, 1, false, -Math.PI / 2, Math.PI),
  band: new THREE.TorusGeometry(0.47, 0.035, 6, 20, Math.PI),
  cup: new THREE.CylinderGeometry(0.12, 0.12, 0.09, 14),
  ring: new THREE.TorusGeometry(0.09, 0.014, 6, 16),
  shadow: new THREE.CircleGeometry(0.42, 20),
  hit: new THREE.CapsuleGeometry(0.5, 1.0, 4, 8),
  sweat: new THREE.SphereGeometry(0.05, 8, 6),
};
const M = {
  black: new THREE.MeshStandardMaterial({ color: "#1b1b1b", roughness: 0.6 }),
  white: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5 }),
  blush: new THREE.MeshBasicMaterial({ color: "#f59e8b", transparent: true, opacity: 0.55 }),
  pants: new THREE.MeshStandardMaterial({ color: "#2b2b2f", roughness: 0.8 }),
  shadow: new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.16, depthWrite: false }),
  hit: new THREE.MeshBasicMaterial({ visible: false }),
  phones: new THREE.MeshStandardMaterial({ color: "#f3f3f3", roughness: 0.4 }),
  sweat: new THREE.MeshStandardMaterial({ color: "#7dd3fc", roughness: 0.2 }),
};
const matCache = new Map<string, THREE.MeshStandardMaterial>();
const mat = (c: string, rough = 0.65) => {
  const k = `${c}-${rough}`;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: rough }));
  return matCache.get(k)!;
};

const SEAT_Y = 0.3;
const SPEED = 2.4;

interface Props {
  employee: Employee;
  spot: Spot;
  icon: string;
  speech: string | null;
  selected: boolean;
  fx: { kind: "poke" | "snack" | null; at: number };
  onSelect: (id: string) => void;
}

function CharacterImpl({ employee, spot, icon, speech, selected, fx, onSelect }: Props) {
  const a = employee.appearance ?? {};
  const root = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const armL = useRef<THREE.Group>(null!);
  const armR = useRef<THREE.Group>(null!);
  const legL = useRef<THREE.Group>(null!);
  const legR = useRef<THREE.Group>(null!);
  const eyesOpen = useRef<THREE.Group>(null!);
  const eyesClosed = useRef<THREE.Group>(null!);
  const sweat = useRef<THREE.Mesh>(null!);
  const state = useRef({
    pos: new THREE.Vector3(spot.x, 0, spot.z),
    rot: spot.rot,
    path: [] as { x: number; z: number }[],
    entry: spot.entry,
    spotKey: spot.key,
    walking: false,
    seed: Math.random() * 10,
  });

  // Saat tujuan berubah, susun jalur jalan dari posisi sekarang.
  useEffect(() => {
    const s = state.current;
    if (s.spotKey === spot.key) return;
    s.path = buildPath({ x: s.pos.x, z: s.pos.z }, s.entry, spot);
    s.entry = spot.entry;
    s.spotKey = spot.key;
  }, [spot]);

  const skin = mat(a.skin ?? "#f3cbae");
  const hair = mat(a.hair ?? "#2b2522", 0.8);
  const outfit = mat(a.outfit ?? "#ffffff", 0.75);
  const accent = mat(a.accent ?? "#f7931e", 0.5);
  const style = a.hairStyle ?? "short";
  const acc = a.accessory ?? [];

  useFrame((st, dt) => {
    const s = state.current;
    const t = st.clock.elapsedTime + s.seed;
    const d = Math.min(dt, 0.05);
    let pose = spot.pose;
    // Gerak di sepanjang jalur
    if (s.path.length) {
      const target = s.path[0];
      const dx = target.x - s.pos.x;
      const dz = target.z - s.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.06) {
        s.path.shift();
      } else {
        const step = Math.min(dist, SPEED * d);
        s.pos.x += (dx / dist) * step;
        s.pos.z += (dz / dist) * step;
        const want = Math.atan2(dx, dz);
        s.rot = lerpAngle(s.rot, want, Math.min(1, d * 10));
      }
      s.walking = true;
    } else {
      s.walking = false;
      s.rot = lerpAngle(s.rot, spot.rot, Math.min(1, d * 6));
    }

    const sinceFx = (performance.now() - fx.at) / 1000;
    const fxActive = fx.kind && sinceFx < 3.2;
    const seated = !s.walking && ["sit", "type", "research", "think", "rest", "paused", "idle"].includes(pose) && !(fxActive && pose !== "rest");
    if (fxActive && !s.walking && pose !== "rest") pose = "celebrate";

    let y = 0;
    let bodyTilt = 0;
    let headYaw = 0, headPitch = 0, headRoll = 0;
    let aL = 0, aR = 0, aLz = 0.12, aRz = -0.12;
    let lL = 0, lR = 0;

    if (s.walking) {
      const w = t * 10;
      y = Math.abs(Math.sin(w)) * 0.07;
      lL = Math.sin(w) * 0.6;
      lR = -lL;
      aL = -Math.sin(w) * 0.5;
      aR = -aL;
    } else if (seated) {
      y = SEAT_Y - 0.4;
      lL = lR = -1.45;
      if (pose === "type") {
        aL = -1.15 + Math.sin(t * 18) * 0.12;
        aR = -1.15 + Math.sin(t * 18 + 1.6) * 0.12;
        headPitch = 0.12 + Math.sin(t * 2) * 0.03;
      } else if (pose === "research") {
        aL = -1.05; aR = -1.1 + Math.sin(t * 9) * 0.1;
        headYaw = Math.sin(t * 0.9) * 0.55;
        headPitch = 0.05;
      } else if (pose === "think") {
        aR = -2.3; aRz = 0.5; aL = -0.9;
        headRoll = 0.18 + Math.sin(t * 1.2) * 0.05;
        headPitch = -0.12;
      } else if (pose === "rest") {
        y = SEAT_Y - 0.3;
        bodyTilt = -0.45;
        lL = lR = -1.2;
        aL = aR = -0.3; aLz = 0.5; aRz = -0.5;
        headRoll = 0.25;
        headPitch = -0.15 + Math.sin(t * 0.8) * 0.03;
      } else {
        // duduk santai / jeda
        aL = aR = -0.7;
        bodyTilt = -0.12;
        headYaw = Math.sin(t * 0.4) * 0.25;
      }
      y += Math.sin(t * 1.6) * 0.008;
    } else if (pose === "celebrate") {
      const j = Math.max(0, Math.sin(t * 7));
      y = j * 0.32;
      aL = aR = -2.8 + Math.sin(t * 7) * 0.2;
      aLz = 0.35; aRz = -0.35;
      headPitch = -0.15;
    } else if (pose === "concerned") {
      headYaw = Math.sin(t * 2.2) * 0.35;
      headPitch = 0.22;
      bodyTilt = 0.1;
      aL = aR = -0.2;
      aLz = 0.05; aRz = -0.05;
    } else if (pose === "talk") {
      y = SEAT_Y - 0.4;
      lL = lR = -1.45;
      headPitch = Math.sin(t * 3) * 0.08;
      aR = -1.0 + Math.sin(t * 4) * 0.35;
      aL = -0.6;
    } else {
      y = Math.sin(t * 2) * 0.015;
    }

    root.current.position.set(s.pos.x, y, s.pos.z);
    root.current.rotation.y = s.rot;
    body.current.rotation.x = THREE.MathUtils.lerp(body.current.rotation.x, bodyTilt, Math.min(1, d * 8));
    head.current.rotation.set(
      THREE.MathUtils.lerp(head.current.rotation.x, headPitch, Math.min(1, d * 8)),
      THREE.MathUtils.lerp(head.current.rotation.y, headYaw, Math.min(1, d * 8)),
      THREE.MathUtils.lerp(head.current.rotation.z, headRoll, Math.min(1, d * 8)),
    );
    const k = Math.min(1, d * 12);
    armL.current.rotation.x = THREE.MathUtils.lerp(armL.current.rotation.x, aL, k);
    armR.current.rotation.x = THREE.MathUtils.lerp(armR.current.rotation.x, aR, k);
    armL.current.rotation.z = THREE.MathUtils.lerp(armL.current.rotation.z, aLz, k);
    armR.current.rotation.z = THREE.MathUtils.lerp(armR.current.rotation.z, aRz, k);
    legL.current.rotation.x = THREE.MathUtils.lerp(legL.current.rotation.x, lL, k);
    legR.current.rotation.x = THREE.MathUtils.lerp(legR.current.rotation.x, lR, k);
    const sleeping = pose === "rest" && !s.walking;
    const blink = !sleeping && Math.sin(t * 0.7) > 0.985;
    eyesOpen.current.visible = !sleeping && !blink;
    eyesClosed.current.visible = sleeping || blink;
    sweat.current.visible = pose === "concerned" && !s.walking;
    if (sweat.current.visible) sweat.current.position.y = 1.62 - ((t * 0.6) % 1) * 0.25;
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 8) return;
    onSelect(employee.id);
  };

  const hairParts = useMemo(() => {
    switch (style) {
      case "bun": return <mesh geometry={G.bun} material={hair} position={[0, 0.5, -0.12]} />;
      case "ponytail": return <mesh geometry={G.tail} material={hair} position={[0, 0.02, -0.42]} rotation={[0.35, 0, 0]} />;
      case "spiky":
        return (
          <group>
            {[[-0.2, 0.35, 0.12, 0.4], [0, 0.45, 0.05, 0], [0.2, 0.35, 0.12, -0.4], [-0.12, 0.38, -0.2, 0.3], [0.14, 0.38, -0.2, -0.3]].map(([x, y, z, r], i) => (
              <mesh key={i} geometry={G.spike} material={hair} position={[x, y, z]} rotation={[z * 1.5, 0, r]} />
            ))}
          </group>
        );
      case "messy":
        return (
          <group>
            <mesh geometry={G.tuft} material={hair} position={[-0.2, 0.22, 0.3]} scale={[1, 0.7, 0.7]} />
            <mesh geometry={G.tuft} material={hair} position={[0.05, 0.27, 0.33]} scale={[1, 0.7, 0.7]} />
            <mesh geometry={G.tuft} material={hair} position={[0.26, 0.2, 0.28]} scale={[0.9, 0.7, 0.7]} />
          </group>
        );
      case "cap":
        return (
          <group>
            <mesh geometry={G.capBrim} material={accent} position={[0, 0.16, 0.22]} />
          </group>
        );
      default:
        return <mesh geometry={G.tuft} material={hair} position={[0.08, 0.25, 0.3]} scale={[1.3, 0.65, 0.7]} />;
    }
  }, [style, hair, accent]);

  return (
    <group ref={root} onClick={onClick} scale={1.2}>
      <mesh geometry={G.shadow} material={M.shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} />
      <mesh geometry={G.hit} material={M.hit} position={[0, 0.9, 0]} />
      <group ref={body} position={[0, 0.45, 0]}>
        {/* kaki */}
        <group ref={legL} position={[-0.12, 0.05, 0]}>
          <mesh geometry={G.leg} material={M.pants} position={[0, -0.2, 0]} castShadow />
        </group>
        <group ref={legR} position={[0.12, 0.05, 0]}>
          <mesh geometry={G.leg} material={M.pants} position={[0, -0.2, 0]} castShadow />
        </group>
        {/* badan */}
        <mesh geometry={G.body} material={outfit} position={[0, 0.35, 0]} castShadow />
        <mesh geometry={G.hand} material={accent} position={[0, 0.58, 0.22]} scale={[1.2, 0.5, 0.5]} />
        {/* lengan */}
        <group ref={armL} position={[-0.36, 0.55, 0]}>
          <mesh geometry={G.arm} material={outfit} position={[0, -0.2, 0]} castShadow />
          <mesh geometry={G.hand} material={skin} position={[0, -0.4, 0]} />
        </group>
        <group ref={armR} position={[0.36, 0.55, 0]}>
          <mesh geometry={G.arm} material={outfit} position={[0, -0.2, 0]} castShadow />
          <mesh geometry={G.hand} material={skin} position={[0, -0.4, 0]} />
        </group>
        {/* kepala */}
        <group ref={head} position={[0, 1.08, 0]}>
          <mesh geometry={G.head} material={skin} castShadow />
          {style === "cap" ? (
            <mesh geometry={G.hairCap} material={accent} rotation={[-0.15, 0, 0]} position={[0, 0.02, -0.01]} />
          ) : (
            <mesh geometry={G.hairCap} material={hair} rotation={[-0.25, 0, 0]} position={[0, 0.02, -0.03]} />
          )}
          {hairParts}
          <group ref={eyesOpen}>
            <mesh geometry={G.eye} material={M.black} position={[-0.15, 0.0, 0.385]} scale={[1, 1.25, 0.6]} />
            <mesh geometry={G.eye} material={M.black} position={[0.15, 0.0, 0.385]} scale={[1, 1.25, 0.6]} />
            <mesh geometry={G.eyeShine} material={M.white} position={[-0.13, 0.03, 0.41]} />
            <mesh geometry={G.eyeShine} material={M.white} position={[0.17, 0.03, 0.41]} />
          </group>
          <group ref={eyesClosed} visible={false}>
            <mesh geometry={G.lid} material={M.black} position={[-0.15, -0.01, 0.39]} rotation={[0, 0, Math.PI]} />
            <mesh geometry={G.lid} material={M.black} position={[0.15, -0.01, 0.39]} rotation={[0, 0, Math.PI]} />
          </group>
          <mesh geometry={G.blush} material={M.blush} position={[-0.25, -0.1, 0.33]} rotation={[0, -0.55, 0]} />
          <mesh geometry={G.blush} material={M.blush} position={[0.25, -0.1, 0.33]} rotation={[0, 0.55, 0]} />
          <mesh geometry={G.mouth} material={M.black} position={[0, -0.15, 0.395]} rotation={[0, 0, Math.PI]} />
          {acc.includes("glasses") && (
            <group position={[0, 0, 0.4]}>
              <mesh geometry={G.ring} material={M.black} position={[-0.15, 0, 0]} />
              <mesh geometry={G.ring} material={M.black} position={[0.15, 0, 0]} />
            </group>
          )}
          {acc.includes("headphones") && (
            <group>
              <mesh geometry={G.band} material={M.phones} rotation={[0, 0, 0]} position={[0, 0.02, 0]} />
              <mesh geometry={G.cup} material={M.phones} position={[-0.44, 0, 0]} rotation={[0, 0, Math.PI / 2]} />
              <mesh geometry={G.cup} material={M.phones} position={[0.44, 0, 0]} rotation={[0, 0, Math.PI / 2]} />
            </group>
          )}
          <mesh ref={sweat} geometry={G.sweat} material={M.sweat} position={[0.38, 0.5, 0.2]} visible={false} />
        </group>
      </group>
      <Html position={[0, 2.1, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <div className="flex flex-col items-center gap-1" style={{ transform: "translateY(-50%)" }}>
          {speech && (
            <div className="bubble-in pointer-events-auto w-[172px] cursor-pointer rounded-2xl border border-line bg-surface px-3 py-2 text-[11px] font-bold leading-snug text-text shadow-card" onClick={() => onSelect(employee.id)}>
              <div className="mb-0.5 text-[10px] font-black text-accent-text">{employee.name.split(" ")[0]}</div>
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

function lerpAngle(a: number, b: number, t: number) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export const Character = memo(CharacterImpl);
