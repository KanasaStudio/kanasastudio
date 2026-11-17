import { useEffect, useState } from "react";

export type ThemePref = "light" | "dark" | "system";

function read(): ThemePref {
  try { return (localStorage.getItem("kanasa-theme") as ThemePref) || "system"; } catch { return "system"; }
}

const media = () => window.matchMedia("(prefers-color-scheme: dark)");

export function applyTheme(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && media().matches);
  document.documentElement.classList.toggle("dark", dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#060B19" : "#1B1B1B");
  return dark;
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(read);
  const [dark, setDark] = useState(() => applyTheme(read()));
  useEffect(() => {
    setDark(applyTheme(pref));
    try { localStorage.setItem("kanasa-theme", pref); } catch { /* abaikan */ }
    const m = media();
    const on = () => pref === "system" && setDark(applyTheme("system"));
    m.addEventListener("change", on);
    window.dispatchEvent(new CustomEvent("kanasa-theme", { detail: pref }));
    return () => m.removeEventListener("change", on);
  }, [pref]);
  useEffect(() => {
    const on = (e: Event) => { const p = (e as CustomEvent).detail as ThemePref; if (p !== pref) setPref(p); };
    window.addEventListener("kanasa-theme", on);
    return () => window.removeEventListener("kanasa-theme", on);
  }, [pref]);
  return { pref, setPref, dark, toggle: () => setPref(dark ? "light" : "dark") };
}

// Preferensi lokal perangkat (bukan data perusahaan): mode 2D & kualitas grafis.
export function useLocalPref<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : initial; } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* abaikan */ }
    window.dispatchEvent(new CustomEvent("kanasa-pref", { detail: { key, v } }));
  }, [key, v]);
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent).detail; if (d.key === key && JSON.stringify(d.v) !== JSON.stringify(v)) setV(d.v); };
    window.addEventListener("kanasa-pref", on);
    return () => window.removeEventListener("kanasa-pref", on);
  }, [key, v]);
  return [v, setV] as const;
}
