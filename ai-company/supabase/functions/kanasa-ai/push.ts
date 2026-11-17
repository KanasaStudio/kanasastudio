import webpush from "npm:web-push@3.6.7";
import { db, vaultGet } from "./db.ts";

let configured = false;

async function configure() {
  if (configured) return true;
  const [pub, priv] = await Promise.all([vaultGet("kanasa_ai_vapid_public"), vaultGet("kanasa_ai_vapid_private")]);
  if (!pub || !priv) return false;
  webpush.setVapidDetails("https://kanasastudio.github.io/kanasastudio/ai/", pub, priv);
  configured = true;
  return true;
}

export async function vapidPublicKey() {
  return await vaultGet("kanasa_ai_vapid_public");
}

// Kirim Web Push ke semua perangkat Founder. Langganan yang sudah kedaluwarsa dihapus.
export async function sendPush(payload: { title: string; body: string; link: string; priority: string; id: string }): Promise<number> {
  if (!(await configure())) return 0;
  const { data: subs } = await db.from("ai_push_subscriptions").select("*");
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: payload.priority === "critical" ? 86400 : 3600, urgency: payload.priority === "normal" ? "normal" : "high" },
      );
      sent++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await db.from("ai_push_subscriptions").delete().eq("id", s.id);
      } else {
        console.error("webpush", e?.statusCode, e?.body || e?.message);
      }
    }
  }
  return sent;
}
