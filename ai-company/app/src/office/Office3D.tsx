import { MapControls, OrthographicCamera } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Employee } from "../lib/types";
import { bubbleIcon, bubbleText, OfficeContext } from "./bubbles";
import { Character } from "./Character";
import { Office } from "./Furniture";
import { spotFor } from "./layout";
import { Robot } from "./Robot";

function FitCamera() {
  const { size, camera } = useThree();
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera;
    if (!(cam as any).isOrthographicCamera) return;
    // HP portrait: zoom lebih dekat (bisa digeser), layar lebar: seluruh kantor terlihat.
    const fit = size.width < 700 ? Math.min(size.width / 20, size.height / 15) : Math.min(size.width / 33, size.height / 23);
    if (fitted.current !== cam.uuid || Math.abs(cam.zoom - fit) / fit > 0.6) {
      cam.zoom = fit;
      cam.updateProjectionMatrix();
      fitted.current = cam.uuid;
    }
  }, [size, camera]);
  return null;
}

// Jaga kamera tetap di area kantor & pantau FPS untuk saran mode 2D.
function Guard({ onSlow }: { onSlow: () => void }) {
  const frames = useRef({ n: 0, t: 0, slow: 0, reported: false });
  useFrame((st, dt) => {
    const f = frames.current;
    f.n++; f.t += dt;
    if (f.t >= 2) {
      const fps = f.n / f.t;
      f.slow = fps < 18 ? f.slow + 1 : 0;
      if (f.slow >= 3 && !f.reported) { f.reported = true; onSlow(); }
      f.n = 0; f.t = 0;
    }
    const controls = st.controls as unknown as { target: THREE.Vector3 } | null;
    if (controls?.target) {
      controls.target.x = THREE.MathUtils.clamp(controls.target.x, -10, 10);
      controls.target.z = THREE.MathUtils.clamp(controls.target.z, -8, 8);
      controls.target.y = 0;
    }
  });
  return null;
}

export default function Office3D({
  employees, ctx, dark, quality, selectedId, onSelect, fx, bars, onSlow,
}: {
  employees: Employee[]; ctx: OfficeContext; dark: boolean; quality: "high" | "low"; selectedId: string | null;
  onSelect: (id: string) => void; fx: { kind: "poke" | "snack" | null; at: number }; bars: number[]; onSlow: () => void;
}) {
  const staff = useMemo(() => employees.filter((e) => !e.is_ceo), [employees]);
  const ceo = employees.find((e) => e.is_ceo);

  // Indeks per departemen untuk menentukan kursi.
  const deptIndex = useMemo(() => {
    const counts: Record<string, number> = {};
    const idx = new Map<string, { i: number }>();
    for (const e of staff) {
      const d = e.department_id ?? "operations";
      idx.set(e.id, { i: counts[d] ?? 0 });
      counts[d] = (counts[d] ?? 0) + 1;
    }
    return { idx, counts };
  }, [staff]);

  // Gelembung bicara bergiliran agar layar HP tidak penuh.
  const [speaker, setSpeaker] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSpeaker((s) => s + 1), 6500);
    return () => clearInterval(t);
  }, []);
  const [fxActive, setFxActive] = useState(false);
  useEffect(() => {
    if (!fx.kind) return;
    setFxActive(true);
    const t = setTimeout(() => setFxActive(false), 3500);
    return () => clearTimeout(t);
  }, [fx]);
  const order = useMemo(() => [ceo, ...staff].filter(Boolean) as Employee[], [ceo, staff]);
  const speakingId = order.length ? order[speaker % order.length].id : null;

  const speechFor = (e: Employee) => {
    if (fxActive) return fx.kind === "snack" ? "Terima kasih camilannya, Founder! 🍪" : "Hai Founder! 👋";
    if (e.id === selectedId || e.id === speakingId) return bubbleText(e, ctx);
    return null;
  };

  const hq = quality === "high";
  return (
    <Canvas
      shadows={hq}
      dpr={hq ? [1, 2] : [1, 1.25]}
      gl={{ antialias: hq, powerPreference: "high-performance" }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = dark ? 1.0 : 1.05; }}
      style={{ touchAction: "none" }}
    >
      <color attach="background" args={[dark ? "#070c1a" : "#f6f1ea"]} />
      <OrthographicCamera makeDefault position={[28, 22, 28]} near={-100} far={200} zoom={14} />
      <FitCamera />
      <MapControls
        makeDefault
        enableDamping
        dampingFactor={0.12}
        minZoom={8}
        maxZoom={80}
        minPolarAngle={0.55}
        maxPolarAngle={1.05}
        minAzimuthAngle={Math.PI / 4 - 0.7}
        maxAzimuthAngle={Math.PI / 4 + 0.7}
        screenSpacePanning={false}
        target={[4, 0, 4]}
      />
      <Guard onSlow={onSlow} />
      <hemisphereLight args={[dark ? "#8fa2d6" : "#fff7ec", dark ? "#1a2240" : "#d9cbb8", dark ? 1.0 : 1.0]} />
      <ambientLight intensity={dark ? 0.5 : 0.35} />
      <directionalLight
        position={[12, 22, 14]}
        intensity={dark ? 0.9 : 1.6}
        color={dark ? "#9fb4ff" : "#fff3e0"}
        castShadow={hq}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.0005}
      />
      <Suspense fallback={null}>
        <Office dark={dark} deptCounts={deptIndex.counts} bars={bars} />
        {staff.map((e, i) => {
          const di = deptIndex.idx.get(e.id)?.i ?? 0;
          const spot = spotFor(e, i, di, deptIndex.counts[e.department_id ?? "operations"] ?? 1);
          return (
            <Character
              key={e.id}
              employee={e}
              spot={spot}
              icon={bubbleIcon(e)}
              speech={speechFor(e)}
              selected={e.id === selectedId}
              fx={fx}
              onSelect={onSelect}
            />
          );
        })}
        {ceo && <Robot employee={ceo} icon={bubbleIcon(ceo)} speech={speechFor(ceo)} selected={ceo.id === selectedId} onSelect={onSelect} />}
      </Suspense>
    </Canvas>
  );
}
