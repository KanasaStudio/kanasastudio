import { supabase } from "./supabase";
import { callAI } from "./api";

const b64ToBytes = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function enablePush() {
  if (!pushSupported()) throw new Error("Browser ini tidak mendukung Web Push. Pasang aplikasi (Add to Home Screen) lewat Chrome Android.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Izin notifikasi ditolak. Aktifkan lewat pengaturan situs di browser.");
  const reg = await navigator.serviceWorker.ready;
  const { vapidPublicKey } = await callAI<{ vapidPublicKey: string }>("status");
  if (!vapidPublicKey) throw new Error("Kunci VAPID server belum tersedia.");
  const sub = (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapidPublicKey) }));
  const json = sub.toJSON();
  const { error } = await supabase.from("ai_push_subscriptions").upsert({
    endpoint: sub.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth, user_agent: navigator.userAgent.slice(0, 200),
  }, { onConflict: "endpoint" });
  if (error) throw new Error(error.message);
  return sub;
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.from("ai_push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}
