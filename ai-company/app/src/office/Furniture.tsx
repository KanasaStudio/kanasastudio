import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { memo, useMemo, useRef } from "react";
import * as THREE from "three";
import logoDarkUrl from "../assets/logo-dark.png";
import logoWhiteUrl from "../assets/logo-white.png";
import { BREAK_SEATS, DESKS, FLOOR, MEETING, meetingSeat, seatsFor } from "./layout";

export interface Palette {
  floorA: string; floorB: string; wall: string; wallTrim: string; desk: string; deskLeg: string; glass: string; glassOpacity: number;
  window: string; windowEmissive: string; plant: string; plant2: string; pot: string; rug: string;
}

export const LIGHT: Palette = {
  floorA: "#f4efe8", floorB: "#ebe4da", wall: "#fbfaf7", wallTrim: "#1b1b1b", desk: "#ffffff", deskLeg: "#2a2a2a",
  glass: "#cfe6f2", glassOpacity: 0.25, window: "#d8ecf6", windowEmissive: "#000000", plant: "#5b9e3a", plant2: "#7cbf4f",
  pot: "#ffffff", rug: "#efe3d2",
};
export const DARK: Palette = {
  floorA: "#2b3858", floorB: "#26324f", wall: "#33416a", wallTrim: "#0b1020", desk: "#e9edf5", deskLeg: "#0f1423",
  glass: "#6f8fbf", glassOpacity: 0.18, window: "#13234a", windowEmissive: "#1d3b7a", plant: "#3f7f2e", plant2: "#5ea33f",
  pot: "#d9dde6", rug: "#2b3550",
};

const loader = new THREE.TextureLoader();
const texCache = new Map<string, THREE.Texture>();
function useTex(url: string) {
  return useMemo(() => {
    if (!texCache.has(url)) {
      const t = loader.load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      texCache.set(url, t);
    }
    return texCache.get(url)!;
  }, [url]);
}

function useCanvasTex(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, deps: unknown[] = []) {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d")!;
    draw(ctx);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);
}

function Floor({ p }: { p: Palette }) {
  const tex = useCanvasTex(`floor-${p.floorA}`, 256, 256, (ctx) => {
    ctx.fillStyle = p.floorA; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = p.floorB;
    ctx.fillRect(0, 0, 128, 128); ctx.fillRect(128, 128, 128, 128);
    ctx.strokeStyle = "rgba(0,0,0,0.05)"; ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 256, 256); ctx.strokeRect(0, 0, 128, 128); ctx.strokeRect(128, 128, 128, 128);
  }, [p.floorB]);
  useMemo(() => { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(12, 9); }, [tex]);
  const w = FLOOR.maxX - FLOOR.minX, d = FLOOR.maxZ - FLOOR.minZ;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial map={tex} roughness={0.9} />
      </mesh>
      {/* tepi lantai */}
      <mesh position={[0, -0.15, FLOOR.maxZ + 0.01]}>
        <boxGeometry args={[w, 0.3, 0.02]} />
        <meshStandardMaterial color={p.wallTrim} />
      </mesh>
      <mesh position={[FLOOR.maxX + 0.01, -0.15, 0]}>
        <boxGeometry args={[0.02, 0.3, d]} />
        <meshStandardMaterial color={p.wallTrim} />
      </mesh>
    </group>
  );
}

function Walls({ p }: { p: Palette }) {
  const H = 4.2;
  const panes = [-3.6, -1.2, 1.2, 3.6];
  return (
    <group>
      <mesh position={[0, H / 2, FLOOR.minZ - 0.15]} receiveShadow>
        <boxGeometry args={[FLOOR.maxX - FLOOR.minX + 0.3, H, 0.3]} />
        <meshStandardMaterial color={p.wall} roughness={0.95} />
      </mesh>
      <mesh position={[FLOOR.minX - 0.15, H / 2, 0]} receiveShadow>
        <boxGeometry args={[0.3, H, FLOOR.maxZ - FLOOR.minZ]} />
        <meshStandardMaterial color={p.wall} roughness={0.95} />
      </mesh>
      {/* list atas hitam */}
      <mesh position={[0, H + 0.05, FLOOR.minZ - 0.15]}>
        <boxGeometry args={[FLOOR.maxX - FLOOR.minX + 0.3, 0.12, 0.34]} />
        <meshStandardMaterial color={p.wallTrim} />
      </mesh>
      <mesh position={[FLOOR.minX - 0.15, H + 0.05, 0]}>
        <boxGeometry args={[0.34, 0.12, FLOOR.maxZ - FLOOR.minZ]} />
        <meshStandardMaterial color={p.wallTrim} />
      </mesh>
      {/* jendela */}
      {panes.map((x) => (
        <group key={x} position={[x, 2.3, FLOOR.minZ + 0.02]}>
          <mesh>
            <boxGeometry args={[2.2, 2.6, 0.04]} />
            <meshStandardMaterial color={p.window} emissive={p.windowEmissive} emissiveIntensity={0.6} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0, 0.03]}><boxGeometry args={[2.3, 0.08, 0.06]} /><meshStandardMaterial color={p.wallTrim} /></mesh>
          <mesh position={[0, 1.3, 0.03]}><boxGeometry args={[2.3, 0.08, 0.06]} /><meshStandardMaterial color={p.wallTrim} /></mesh>
          <mesh position={[0, -1.3, 0.03]}><boxGeometry args={[2.3, 0.08, 0.06]} /><meshStandardMaterial color={p.wallTrim} /></mesh>
          <mesh position={[-1.13, 0, 0.03]}><boxGeometry args={[0.08, 2.68, 0.06]} /><meshStandardMaterial color={p.wallTrim} /></mesh>
          <mesh position={[1.13, 0, 0.03]}><boxGeometry args={[0.08, 2.68, 0.06]} /><meshStandardMaterial color={p.wallTrim} /></mesh>
          <mesh position={[0, 0, 0.03]}><boxGeometry args={[0.06, 2.68, 0.06]} /><meshStandardMaterial color={p.wallTrim} /></mesh>
        </group>
      ))}
    </group>
  );
}

function Sign() {
  const logo = useTex(logoDarkUrl);
  const tex = useCanvasTex("sign", 512, 256, (ctx) => {
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = "#1b1b1b";
    ctx.font = "900 78px 'Nunito Variable', Nunito, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("Kanasa", 200, 92);
    ctx.fillText("Studio.", 200, 172);
  });
  return (
    <group position={[FLOOR.minX + 0.02, 2.4, 1.4]} rotation={[0, Math.PI / 2, 0]}>
      <mesh>
        <planeGeometry args={[4.2, 2.1]} />
        <meshStandardMaterial map={tex} roughness={0.6} />
      </mesh>
      <mesh position={[-1.35, 0, 0.01]}>
        <planeGeometry args={[1.2, 1.2]} />
        <meshBasicMaterial map={logo} transparent />
      </mesh>
    </group>
  );
}

function Chair({ x, z, rot = 0 }: { x: number; z: number; rot?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.42, 0]} castShadow><boxGeometry args={[0.62, 0.1, 0.58]} /><meshStandardMaterial color="#232323" roughness={0.7} /></mesh>
      <RoundedBox args={[0.6, 0.7, 0.1]} radius={0.05} position={[0, 0.8, -0.3]} rotation={[-0.08, 0, 0]} castShadow>
        <meshStandardMaterial color="#232323" roughness={0.7} />
      </RoundedBox>
      <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.04, 0.04, 0.4, 8]} /><meshStandardMaterial color="#555" /></mesh>
      <mesh position={[0, 0.04, 0]}><cylinderGeometry args={[0.32, 0.32, 0.05, 5]} /><meshStandardMaterial color="#333" /></mesh>
    </group>
  );
}

function Monitor({ x, z, logo, rotY = 0 }: { x: number; z: number; logo: THREE.Texture; rotY?: number }) {
  return (
    <group position={[x, 0.79, z]} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0.38, 0]} castShadow><boxGeometry args={[0.95, 0.58, 0.06]} /><meshStandardMaterial color="#1e1e1e" roughness={0.4} /></mesh>
      <mesh position={[0, 0.38, 0.035]}><planeGeometry args={[0.86, 0.5]} /><meshStandardMaterial color="#2a3b55" emissive="#4a7bd1" emissiveIntensity={0.35} /></mesh>
      <mesh position={[0, 0.38, -0.032]} rotation={[0, Math.PI, 0]}><planeGeometry args={[0.22, 0.22]} /><meshBasicMaterial map={logo} transparent /></mesh>
      <mesh position={[0, 0.08, 0]}><boxGeometry args={[0.06, 0.18, 0.06]} /><meshStandardMaterial color="#2a2a2a" /></mesh>
      <mesh position={[0, 0.0, 0]}><boxGeometry args={[0.32, 0.03, 0.2]} /><meshStandardMaterial color="#2a2a2a" /></mesh>
    </group>
  );
}

function Desk({ id, p, count, logo }: { id: string; p: Palette; count: number; logo: THREE.Texture }) {
  const d = DESKS[id];
  const seats = seatsFor(id, count);
  const color = useMemo(() => {
    const m: Record<string, string> = { research: "#38bdf8", software: "#818cf8", creative: "#f97316", marketing: "#f472b6", operations: "#34d399", finance: "#fbbf24" };
    return m[id];
  }, [id]);
  return (
    <group>
      <group position={[d.x, 0, d.z]}>
        <mesh position={[0, 0.76, 0]} castShadow receiveShadow><boxGeometry args={[d.w, 0.07, 1.05]} /><meshStandardMaterial color={p.desk} roughness={0.5} /></mesh>
        <mesh position={[0, 0.735, 0.53]}><boxGeometry args={[d.w, 0.05, 0.02]} /><meshStandardMaterial color={color} /></mesh>
        <mesh position={[-d.w / 2 + 0.05, 0.37, 0]}><boxGeometry args={[0.06, 0.74, 0.95]} /><meshStandardMaterial color={p.deskLeg} /></mesh>
        <mesh position={[d.w / 2 - 0.3, 0.37, 0.05]} castShadow><boxGeometry args={[0.55, 0.72, 0.85]} /><meshStandardMaterial color={p.deskLeg} /></mesh>
        <mesh position={[d.w / 2 - 0.3, 0.55, 0.48]}><boxGeometry args={[0.4, 0.03, 0.01]} /><meshStandardMaterial color="#888" /></mesh>
        {/* barang di meja */}
        <mesh position={[-d.w / 2 + 0.3, 0.86, 0.2]}><cylinderGeometry args={[0.07, 0.06, 0.14, 10]} /><meshStandardMaterial color="#f7931e" /></mesh>
        <mesh position={[d.w / 2 - 0.25, 0.85, 0.25]}><cylinderGeometry args={[0.06, 0.06, 0.12, 8]} /><meshStandardMaterial color="#1b1b1b" /></mesh>
        <mesh position={[d.w / 2 - 0.25, 0.95, 0.25]}><boxGeometry args={[0.02, 0.12, 0.02]} /><meshStandardMaterial color="#f7931e" /></mesh>
        <mesh position={[d.w / 2 - 0.55, 0.81, 0.3]} rotation={[0, 0.3, 0]}><boxGeometry args={[0.32, 0.03, 0.24]} /><meshStandardMaterial color="#f5f1ea" /></mesh>
      </group>
      {seats.map((s, i) => (
        <group key={i}>
          <Chair x={s.x} z={s.z - 0.05} />
          {id === "research" ? (
            <>
              <Monitor x={s.x - 0.48} z={d.z + 0.1} logo={logo} rotY={Math.PI + 0.18} />
              <Monitor x={s.x + 0.48} z={d.z + 0.1} logo={logo} rotY={Math.PI - 0.18} />
            </>
          ) : (
            <Monitor x={s.x} z={d.z + 0.12} logo={logo} rotY={Math.PI} />
          )}
          <mesh position={[s.x, 0.81, d.z - 0.25]}><boxGeometry args={[0.55, 0.025, 0.18]} /><meshStandardMaterial color="#e5e5e5" /></mesh>
        </group>
      ))}
    </group>
  );
}

function Plant({ x, z, s = 1, p }: { x: number; z: number; s?: number; p: Palette }) {
  const leaves = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const a = (i / 7) * Math.PI * 2;
    return { a, r: 0.22 + (i % 2) * 0.1, y: 0.9 + (i % 3) * 0.18 };
  }), []);
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position={[0, 0.25, 0]} castShadow><cylinderGeometry args={[0.28, 0.22, 0.5, 14]} /><meshStandardMaterial color={p.pot} roughness={0.5} /></mesh>
      <mesh position={[0, 0.6, 0]}><cylinderGeometry args={[0.03, 0.03, 0.5, 6]} /><meshStandardMaterial color="#4a3b2a" /></mesh>
      {leaves.map((l, i) => (
        <mesh key={i} position={[Math.sin(l.a) * l.r, l.y, Math.cos(l.a) * l.r]} rotation={[Math.cos(l.a) * 0.7, l.a, -Math.sin(l.a) * 0.7]} scale={[0.55, 0.28, 1]} castShadow>
          <sphereGeometry args={[0.3, 8, 6]} />
          <meshStandardMaterial color={i % 2 ? p.plant : p.plant2} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function HangingPlant({ x, z, p }: { x: number; z: number; p: Palette }) {
  return (
    <group position={[x, 3.9, z]}>
      <mesh><cylinderGeometry args={[0.22, 0.17, 0.25, 12]} /><meshStandardMaterial color={p.pot} /></mesh>
      {[-0.15, 0, 0.15].map((dx, j) => (
        <group key={j}>
          {Array.from({ length: 6 }, (_, i) => (
            <mesh key={i} position={[dx + Math.sin(i + j) * 0.05, -0.2 - i * 0.2, 0.05 * Math.cos(i * 2 + j)]}>
              <sphereGeometry args={[0.09, 6, 5]} />
              <meshStandardMaterial color={(i + j) % 2 ? p.plant : p.plant2} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Shelf({ p }: { p: Palette }) {
  const boxes = ["#f7931e", "#ffffff", "#1b1b1b", "#f7931e", "#e7e2da", "#1b1b1b", "#ffffff", "#f7931e"];
  return (
    <group position={[FLOOR.minX + 0.35, 0, -2.2]} rotation={[0, Math.PI / 2, 0]}>
      {[0.6, 1.3, 2.0, 2.7].map((y) => (
        <mesh key={y} position={[0, y, 0]}><boxGeometry args={[2.4, 0.05, 0.5]} /><meshStandardMaterial color={p.wallTrim} /></mesh>
      ))}
      {[-1.18, 1.18].map((x) => (
        <mesh key={x} position={[x, 1.45, 0]}><boxGeometry args={[0.05, 2.9, 0.5]} /><meshStandardMaterial color={p.wallTrim} /></mesh>
      ))}
      {boxes.map((c, i) => (
        <mesh key={i} position={[-0.9 + (i % 4) * 0.6, 0.85 + Math.floor(i / 4) * 0.7, 0]} castShadow>
          <boxGeometry args={[0.4 + (i % 3) * 0.05, 0.42, 0.38]} />
          <meshStandardMaterial color={c} />
        </mesh>
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={`b${i}`} position={[-0.6 + i * 0.12, 2.32, 0]}><boxGeometry args={[0.09, 0.5, 0.34]} /><meshStandardMaterial color={i % 2 ? "#1b1b1b" : "#f7931e"} /></mesh>
      ))}
    </group>
  );
}

function FounderOffice({ p, logo }: { p: Palette; logo: THREE.Texture }) {
  const plate = useCanvasTex("founder-plate", 256, 64, (ctx) => {
    ctx.fillStyle = "#1b1b1b"; ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = "#f7931e"; ctx.font = "900 34px 'Nunito Variable', system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("FOUNDER", 128, 34);
  });
  return (
    <group>
      {/* partisi kaca */}
      <mesh position={[-8.6, 1.4, -5.3]}><boxGeometry args={[6.8, 2.8, 0.06]} /><meshStandardMaterial color={p.glass} transparent opacity={p.glassOpacity} roughness={0.1} /></mesh>
      <mesh position={[-8.6, 2.82, -5.3]}><boxGeometry args={[6.8, 0.06, 0.1]} /><meshStandardMaterial color={p.wallTrim} /></mesh>
      <mesh position={[-5.2, 1.4, -5.3]}><boxGeometry args={[0.08, 2.8, 0.1]} /><meshStandardMaterial color={p.wallTrim} /></mesh>
      {/* meja founder */}
      <group position={[-8.6, 0, -7.3]}>
        <mesh position={[0, 0.78, 0]} castShadow><boxGeometry args={[2.6, 0.08, 1.1]} /><meshStandardMaterial color="#1b1b1b" roughness={0.4} /></mesh>
        <mesh position={[0, 0.39, 0.3]}><boxGeometry args={[2.4, 0.76, 0.06]} /><meshStandardMaterial color="#2a2a2a" /></mesh>
        <mesh position={[0, 0.9, 0.42]} rotation={[-0.4, 0, 0]}><planeGeometry args={[0.8, 0.2]} /><meshBasicMaterial map={plate} /></mesh>
        <Monitor x={-0.5} z={-0.2} logo={logo} rotY={Math.PI} />
      </group>
      <Chair x={-8.6} z={-8.2} rot={0} />
    </group>
  );
}

function MeetingRoom({ p, bars }: { p: Palette; bars: number[] }) {
  const max = Math.max(1, ...bars);
  return (
    <group>
      <mesh position={[6.4, 1.4, -6.6]}><boxGeometry args={[0.06, 2.8, 4.8]} /><meshStandardMaterial color={p.glass} transparent opacity={p.glassOpacity} roughness={0.1} /></mesh>
      <mesh position={[9.95, 1.4, -4.2]}><boxGeometry args={[4.1, 2.8, 0.06]} /><meshStandardMaterial color={p.glass} transparent opacity={p.glassOpacity} roughness={0.1} /></mesh>
      <mesh position={[6.4, 2.82, -6.6]}><boxGeometry args={[0.1, 0.06, 4.8]} /><meshStandardMaterial color={p.wallTrim} /></mesh>
      <mesh position={[9.2, 2.82, -4.2]}><boxGeometry args={[5.6, 0.06, 0.1]} /><meshStandardMaterial color={p.wallTrim} /></mesh>
      {[6.4, 7.9, 12].map((x) => (
        <mesh key={x} position={[x, 1.4, -4.2]}><boxGeometry args={[0.08, 2.8, 0.1]} /><meshStandardMaterial color={p.wallTrim} /></mesh>
      ))}
      {/* meja bundar */}
      <mesh position={[MEETING.x, 0.74, MEETING.z]} castShadow receiveShadow><cylinderGeometry args={[0.95, 0.95, 0.07, 28]} /><meshStandardMaterial color={p.desk} /></mesh>
      <mesh position={[MEETING.x, 0.37, MEETING.z]}><cylinderGeometry args={[0.08, 0.25, 0.74, 10]} /><meshStandardMaterial color={p.deskLeg} /></mesh>
      {Array.from({ length: 5 }, (_, i) => {
        const s = meetingSeat(i);
        return <Chair key={i} x={s.x} z={s.z} rot={s.rot} />;
      })}
      {/* whiteboard: batang = tugas selesai per departemen (data nyata) */}
      <group position={[9.4, 2.0, FLOOR.minZ + 0.06]}>
        <mesh><boxGeometry args={[2.8, 1.6, 0.05]} /><meshStandardMaterial color="#ffffff" roughness={0.3} /></mesh>
        <mesh position={[0, 0, -0.01]}><boxGeometry args={[2.95, 1.75, 0.04]} /><meshStandardMaterial color={p.wallTrim} /></mesh>
        {bars.map((b, i) => {
          const h = 0.12 + (b / max) * 1.0;
          return (
            <mesh key={i} position={[-1.0 + i * 0.4, -0.65 + h / 2, 0.04]}>
              <boxGeometry args={[0.24, h, 0.02]} />
              <meshStandardMaterial color={i % 2 ? "#1b1b1b" : "#f7931e"} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

function BreakRoom({ p }: { p: Palette }) {
  const cat = useRef<THREE.Group>(null!);
  useFrame((st) => {
    const s = 1 + Math.sin(st.clock.elapsedTime * 1.4) * 0.03;
    cat.current.scale.set(1, s, 1);
  });
  return (
    <group>
      <mesh position={[9.4, 0.01, 6.4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[2.3, 32]} /><meshStandardMaterial color={p.rug} /></mesh>
      {/* sofa oranye */}
      <group position={[11.25, 0, 6.5]}>
        <RoundedBox args={[1.0, 0.45, 3.6]} radius={0.12} position={[0, 0.32, 0]} castShadow><meshStandardMaterial color="#f7931e" roughness={0.85} /></RoundedBox>
        <RoundedBox args={[0.35, 0.8, 3.6]} radius={0.12} position={[0.38, 0.65, 0]} castShadow><meshStandardMaterial color="#f08a12" roughness={0.85} /></RoundedBox>
        <RoundedBox args={[1.0, 0.55, 0.3]} radius={0.1} position={[0, 0.45, -1.9]}><meshStandardMaterial color="#e57f0c" roughness={0.85} /></RoundedBox>
        <RoundedBox args={[1.0, 0.55, 0.3]} radius={0.1} position={[0, 0.45, 1.9]}><meshStandardMaterial color="#e57f0c" roughness={0.85} /></RoundedBox>
      </group>
      {/* bean bag */}
      {BREAK_SEATS.filter((s) => !s.sofa).map((s, i) => (
        <mesh key={i} position={[s.x, 0.25, s.z]} scale={[1, 0.6, 1]} castShadow>
          <sphereGeometry args={[0.5, 16, 12]} />
          <meshStandardMaterial color={i % 2 ? "#1b1b1b" : "#f7931e"} roughness={0.9} />
        </mesh>
      ))}
      {/* meja kopi kecil + mesin kopi */}
      <mesh position={[9.5, 0.35, 6.5]}><cylinderGeometry args={[0.45, 0.45, 0.05, 20]} /><meshStandardMaterial color={p.desk} /></mesh>
      <mesh position={[9.5, 0.17, 6.5]}><cylinderGeometry args={[0.05, 0.05, 0.34, 8]} /><meshStandardMaterial color={p.deskLeg} /></mesh>
      <group position={[7.2, 0, 8.4]}>
        <mesh position={[0, 0.45, 0]}><boxGeometry args={[1.4, 0.9, 0.6]} /><meshStandardMaterial color={p.desk} /></mesh>
        <mesh position={[-0.3, 1.15, 0]} castShadow><boxGeometry args={[0.45, 0.5, 0.4]} /><meshStandardMaterial color="#1b1b1b" /></mesh>
        <mesh position={[-0.3, 1.2, 0.205]}><circleGeometry args={[0.05, 10]} /><meshStandardMaterial color="#f7931e" emissive="#f7931e" emissiveIntensity={1.5} /></mesh>
        <mesh position={[0.3, 0.97, 0]}><cylinderGeometry args={[0.06, 0.05, 0.12, 10]} /><meshStandardMaterial color="#ffffff" /></mesh>
      </group>
      {/* kucing tidur */}
      <group ref={cat} position={[9.1, 0, 7.6]} rotation={[0, 0.6, 0]}>
        <mesh position={[0, 0.16, 0]} scale={[1.3, 0.75, 0.9]}><sphereGeometry args={[0.22, 14, 10]} /><meshStandardMaterial color="#fafafa" /></mesh>
        <mesh position={[0.28, 0.2, 0.05]}><sphereGeometry args={[0.15, 12, 10]} /><meshStandardMaterial color="#fafafa" /></mesh>
        <mesh position={[0.32, 0.33, -0.03]} rotation={[0, 0, -0.3]}><coneGeometry args={[0.05, 0.1, 4]} /><meshStandardMaterial color="#f7931e" /></mesh>
        <mesh position={[0.24, 0.33, 0.1]} rotation={[0, 0, 0.3]}><coneGeometry args={[0.05, 0.1, 4]} /><meshStandardMaterial color="#1b1b1b" /></mesh>
        <mesh position={[-0.1, 0.27, 0.05]} scale={[1, 0.5, 1]}><sphereGeometry args={[0.1, 8, 6]} /><meshStandardMaterial color="#f7931e" /></mesh>
        <mesh position={[0.05, 0.25, -0.12]} scale={[1, 0.5, 1]}><sphereGeometry args={[0.08, 8, 6]} /><meshStandardMaterial color="#3b3b3b" /></mesh>
        <mesh position={[-0.3, 0.1, 0.15]} rotation={[0, 0.8, Math.PI / 2]}><capsuleGeometry args={[0.04, 0.3, 4, 6]} /><meshStandardMaterial color="#fafafa" /></mesh>
      </group>
    </group>
  );
}

function Reception({ p, logo }: { p: Palette; logo: THREE.Texture }) {
  return (
    <group position={[-9.2, 0, 6.6]}>
      <RoundedBox args={[3.0, 1.05, 0.9]} radius={0.12} position={[0, 0.52, 0]} castShadow><meshStandardMaterial color={p.desk} roughness={0.5} /></RoundedBox>
      <mesh position={[0, 0.52, 0.46]}><boxGeometry args={[3.0, 0.18, 0.02]} /><meshStandardMaterial color="#f7931e" /></mesh>
      <mesh position={[0, 0.78, 0.462]}><planeGeometry args={[0.4, 0.4]} /><meshBasicMaterial map={logo} transparent /></mesh>
      <mesh position={[0.9, 1.15, 0]}><cylinderGeometry args={[0.15, 0.12, 0.2, 10]} /><meshStandardMaterial color="#1b1b1b" /></mesh>
      <mesh position={[0.9, 1.35, 0]}><sphereGeometry args={[0.18, 8, 6]} /><meshStandardMaterial color={p.plant} /></mesh>
    </group>
  );
}

function Lamp({ x, z, dark }: { x: number; z: number; dark: boolean }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.03, 0]}><cylinderGeometry args={[0.22, 0.22, 0.05, 12]} /><meshStandardMaterial color="#1b1b1b" /></mesh>
      <mesh position={[0, 0.9, 0]}><cylinderGeometry args={[0.025, 0.025, 1.8, 6]} /><meshStandardMaterial color="#1b1b1b" /></mesh>
      <mesh position={[0, 1.9, 0]}><coneGeometry args={[0.32, 0.4, 16, 1, true]} /><meshStandardMaterial color="#f5ead8" emissive="#ffcf8a" emissiveIntensity={dark ? 1.4 : 0.4} side={THREE.DoubleSide} /></mesh>
      {dark && <pointLight position={[0, 1.7, 0]} intensity={6} distance={6} color="#ffbf73" />}
    </group>
  );
}

function OfficeImpl({ dark, deptCounts, bars }: { dark: boolean; deptCounts: Record<string, number>; bars: number[] }) {
  const p = dark ? DARK : LIGHT;
  const logoW = useTex(logoWhiteUrl);
  const logoD = useTex(logoDarkUrl);
  return (
    <group>
      <Floor p={p} />
      <Walls p={p} />
      <Sign />
      <Shelf p={p} />
      <FounderOffice p={p} logo={logoW} />
      <MeetingRoom p={p} bars={bars} />
      <BreakRoom p={p} />
      <Reception p={p} logo={logoD} />
      {Object.keys(DESKS).map((id) => (
        <Desk key={id} id={id} p={p} count={Math.max(1, deptCounts[id] ?? 1)} logo={logoW} />
      ))}
      <Plant x={-11.2} z={8.2} s={1.3} p={p} />
      <Plant x={-11.2} z={-4.6} s={1.1} p={p} />
      <Plant x={5.8} z={-8.4} s={1.0} p={p} />
      <Plant x={11.3} z={3.3} s={1.2} p={p} />
      <Plant x={-4.4} z={-8.4} s={0.9} p={p} />
      <Plant x={2.2} z={7.6} s={1.0} p={p} />
      <HangingPlant x={-6} z={FLOOR.minZ + 0.4} p={p} />
      <HangingPlant x={4.8} z={FLOOR.minZ + 0.4} p={p} />
      <HangingPlant x={FLOOR.minX + 0.4} z={5} p={p} />
      <Lamp x={-3.6} z={-6.8} dark={dark} />
      <Lamp x={6.9} z={2.4} dark={dark} />
      <Lamp x={-11.2} z={3.6} dark={dark} />
    </group>
  );
}

export const Office = memo(OfficeImpl);
