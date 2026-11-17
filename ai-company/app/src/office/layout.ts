import type { Employee, EmployeeStatus } from "../lib/types";

// Denah kantor (satuan meter). x ke kanan, z ke arah kamera.
export const FLOOR = { minX: -12, maxX: 12, minZ: -9, maxZ: 9 };
export const AISLE_Z = 0.45;

export interface DeskDef { x: number; z: number; w: number }
export const DESKS: Record<string, DeskDef> = {
  research: { x: -6.6, z: -2.1, w: 3.2 },
  software: { x: -1.1, z: -2.1, w: 3.6 },
  creative: { x: 4.3, z: -2.1, w: 3.0 },
  marketing: { x: -6.6, z: 3.1, w: 3.0 },
  operations: { x: -1.1, z: 3.1, w: 3.0 },
  finance: { x: 4.3, z: 3.1, w: 3.0 },
};

export const MEETING = { x: 9.2, z: -6.5, r: 1.45, entry: { x: 7.6, z: -3.5 } };
export const BREAK_ENTRY = { x: 8.4, z: 3.9 };
export const BREAK_SEATS = [
  { x: 10.75, z: 5.3, rot: -Math.PI / 2, sofa: true },
  { x: 10.75, z: 6.5, rot: -Math.PI / 2, sofa: true },
  { x: 10.75, z: 7.7, rot: -Math.PI / 2, sofa: true },
  { x: 8.0, z: 7.6, rot: Math.PI * 0.85, sofa: false },
  { x: 7.4, z: 5.9, rot: Math.PI * 0.6, sofa: false },
  { x: 9.0, z: 5.0, rot: Math.PI, sofa: false },
  { x: 9.3, z: 8.1, rot: Math.PI, sofa: false },
];

export interface Spot {
  key: string;
  x: number;
  z: number;
  rot: number;
  entry: { x: number; z: number };
  pose: Pose;
}

export type Pose = "sit" | "type" | "research" | "think" | "talk" | "rest" | "celebrate" | "concerned" | "idle" | "paused";

export function seatsFor(dept: string, count: number) {
  const d = DESKS[dept];
  if (!d) return [];
  const xs = count <= 1 ? [d.x] : Array.from({ length: count }, (_, i) => d.x - 0.9 + (1.8 * i) / (count - 1));
  return xs.map((x) => ({ x, z: d.z - 0.9 }));
}

export function meetingSeat(i: number) {
  const a = Math.PI * 0.95 + (i * Math.PI * 2) / 7;
  const x = MEETING.x + Math.sin(a) * MEETING.r;
  const z = MEETING.z + Math.cos(a) * MEETING.r;
  return { x, z, rot: Math.atan2(MEETING.x - x, MEETING.z - z) };
}

const POSE: Record<EmployeeStatus, Pose> = {
  working: "type", researching: "research", thinking: "think", reviewing: "think", meeting: "talk", resting: "rest",
  completed: "celebrate", failed: "concerned", paused: "paused", idle: "sit",
};

// Posisi tujuan karakter berdasarkan status nyatanya.
export function spotFor(e: Employee, index: number, deptIndex: number, deptCount: number): Spot {
  const pose = POSE[e.status] ?? "idle";
  const dept = e.department_id ?? "operations";
  const d = DESKS[dept] ?? DESKS.operations;
  const seat = seatsFor(dept, deptCount)[deptIndex] ?? { x: d.x, z: d.z - 0.9 };
  const sideX = seat.x <= d.x ? d.x - d.w / 2 - 0.55 : d.x + d.w / 2 + 0.55;
  const deskEntry = { x: sideX, z: seat.z };
  if (pose === "talk") {
    const m = meetingSeat(index);
    return { key: `meet-${index}`, x: m.x, z: m.z, rot: m.rot, entry: MEETING.entry, pose };
  }
  if (pose === "rest") {
    const b = BREAK_SEATS[index % BREAK_SEATS.length];
    return { key: `break-${index}`, x: b.x, z: b.z, rot: b.rot, entry: BREAK_ENTRY, pose };
  }
  if (pose === "celebrate" || pose === "concerned") {
    const p = { x: seat.x, z: d.z + 1.05 };
    return { key: `front-${dept}-${deptIndex}`, x: p.x, z: p.z, rot: 0, entry: p, pose };
  }
  return { key: `seat-${dept}-${deptIndex}`, x: seat.x, z: seat.z, rot: 0, entry: deskEntry, pose };
}

// Jalur jalan: keluar lewat titik masuk, lewat lorong tengah, lalu ke tujuan.
export function buildPath(from: { x: number; z: number }, fromEntry: { x: number; z: number }, to: Spot) {
  const pts: { x: number; z: number }[] = [];
  const near = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z) < 0.05;
  pts.push(fromEntry);
  pts.push({ x: fromEntry.x, z: AISLE_Z });
  pts.push({ x: to.entry.x, z: AISLE_Z });
  pts.push(to.entry);
  pts.push({ x: to.x, z: to.z });
  return pts.filter((p, i) => !near(p, i === 0 ? from : pts[i - 1]));
}

export const AURELIA_SPOTS = {
  idle: { x: 1.6, y: 2.6, z: -6.3 },
  think: { x: -1.1, y: 3.0, z: AISLE_Z },
  meet: { x: MEETING.x, y: 2.5, z: MEETING.z },
};
