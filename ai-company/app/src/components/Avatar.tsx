import type { Appearance, EmployeeStatus } from "../lib/types";

const DOT: Record<string, string> = {
  working: "#F7931E", researching: "#F7931E", thinking: "#F7931E", reviewing: "#F7931E", meeting: "#38BDF8",
  resting: "#38BDF8", completed: "#22C55E", failed: "#EF4444", paused: "#9CA3AF", idle: "#A8A29E",
};

// Avatar chibi 2D (SVG) yang konsisten dengan karakter 3D di kantor.
export function Avatar({ appearance, size = 44, status, ring = true }: { appearance: Appearance; size?: number; status?: EmployeeStatus; ring?: boolean }) {
  const a = appearance ?? {};
  const sleeping = status === "resting";
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} className={`rounded-full ${ring ? "bg-accent-soft ring-1 ring-line" : ""}`}>
        {a.style === "robot" ? <Robot /> : <Person a={a} sleeping={sleeping} />}
      </svg>
      {status && (
        <span
          className="absolute bottom-0 right-0 rounded-full ring-2 ring-surface"
          style={{ width: Math.max(9, size * 0.24), height: Math.max(9, size * 0.24), background: DOT[status] ?? "#A8A29E" }}
        />
      )}
    </span>
  );
}

function Robot() {
  return (
    <g>
      <rect x="9" y="22" width="5" height="16" rx="2.5" fill="#1B1B1B" />
      <rect x="50" y="22" width="5" height="16" rx="2.5" fill="#1B1B1B" />
      <rect x="12" y="15" width="40" height="34" rx="12" fill="#FFFFFF" stroke="#1B1B1B" strokeWidth="2.5" />
      <rect x="17" y="21" width="30" height="21" rx="8" fill="#1B1B1B" />
      <path d="M22 29 l4 -3 M22 29 l4 3" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M42 29 l-4 -3 M42 29 l-4 3" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M27 36 q5 4 10 0" stroke="#FFFFFF" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <circle cx="32" cy="55" r="3" fill="#F7931E" />
    </g>
  );
}

function Person({ a, sleeping }: { a: Appearance; sleeping: boolean }) {
  const skin = a.skin ?? "#F3CBAE";
  const hair = a.hair ?? "#2B2522";
  const outfit = a.outfit ?? "#FFFFFF";
  const style = a.hairStyle ?? "short";
  const acc = a.accessory ?? [];
  return (
    <g>
      {/* badan */}
      <path d="M14 64 q2 -14 18 -14 q16 0 18 14 z" fill={outfit} stroke="#1B1B1B" strokeOpacity=".15" />
      <path d="M28 50 l4 5 l4 -5" fill={a.accent ?? "#F7931E"} opacity=".9" />
      {style === "ponytail" && <path d="M44 22 q12 6 6 22 q-4 -10 -8 -14 z" fill={hair} />}
      {style === "bun" && <circle cx="32" cy="9" r="6" fill={hair} />}
      {/* kepala */}
      <circle cx="32" cy="29" r="17" fill={skin} />
      {/* rambut */}
      {style === "cap" ? (
        <g>
          <path d="M15 26 q2 -16 17 -16 q15 0 17 16 z" fill={a.accent ?? "#1B1B1B"} />
          <path d="M12 26 h28 q-2 4 -14 4 q-12 0 -14 -4 z" fill="#1B1B1B" />
          <path d="M45 24 q4 4 3 10" stroke={hair} strokeWidth="3" strokeLinecap="round" />
        </g>
      ) : style === "spiky" ? (
        <path d="M14 30 l2 -12 l5 4 l3 -10 l5 6 l4 -9 l4 8 l5 -6 l2 9 l5 -3 l-1 13 q-4 -9 -19 -9 q-14 0 -19 9 z" fill={hair} stroke="#1B1B1B" strokeOpacity=".15" />
      ) : style === "messy" ? (
        <path d="M14 31 q-1 -20 18 -20 q19 0 18 20 q-3 -6 -7 -8 q-1 4 -5 4 q1 -4 -1 -6 q-3 5 -9 6 q2 -3 1 -6 q-5 4 -11 5 q-2 2 -4 5 z" fill={hair} />
      ) : (
        <path d="M15 30 q-1 -18 17 -18 q18 0 17 18 q-4 -8 -10 -9 q-6 4 -14 3 q-6 1 -10 6 z" fill={hair} />
      )}
      {/* wajah */}
      {sleeping ? (
        <g stroke="#1B1B1B" strokeWidth="2" strokeLinecap="round" fill="none">
          <path d="M23 32 q3 2 6 0" />
          <path d="M35 32 q3 2 6 0" />
        </g>
      ) : (
        <g fill="#1B1B1B">
          <ellipse cx="26" cy="31" rx="2.2" ry="2.8" />
          <ellipse cx="38" cy="31" rx="2.2" ry="2.8" />
          <circle cx="26.8" cy="30" r=".8" fill="#fff" />
          <circle cx="38.8" cy="30" r=".8" fill="#fff" />
        </g>
      )}
      <ellipse cx="21" cy="36" rx="3" ry="1.8" fill="#F59E8B" opacity=".55" />
      <ellipse cx="43" cy="36" rx="3" ry="1.8" fill="#F59E8B" opacity=".55" />
      <path d="M29 38 q3 2.5 6 0" stroke="#1B1B1B" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {acc.includes("glasses") && (
        <g stroke="#1B1B1B" strokeWidth="1.6" fill="none">
          <circle cx="26" cy="31" r="5" />
          <circle cx="38" cy="31" r="5" />
          <path d="M31 31 h2" />
        </g>
      )}
      {acc.includes("headphones") && (
        <g>
          <path d="M13 29 q0 -21 19 -21 q19 0 19 21" stroke="#F2F2F2" strokeWidth="3.5" fill="none" />
          <rect x="10" y="26" width="7" height="11" rx="3.5" fill="#F2F2F2" stroke="#1B1B1B" strokeOpacity=".3" />
          <rect x="47" y="26" width="7" height="11" rx="3.5" fill="#F2F2F2" stroke="#1B1B1B" strokeOpacity=".3" />
        </g>
      )}
    </g>
  );
}
