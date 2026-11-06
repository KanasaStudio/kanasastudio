/* Public viewer for /letter/<id> (also used as the editor's live-preview iframe at /letter/#preview). */
import { sb } from "../db.js?v=20261106c";
import { createPlayer } from "./player.js?v=20261106c";

const host = document.getElementById("host"), msg = document.getElementById("msg");
const player = createPlayer(host, { preview: location.hash === "#preview", makeUrl: "../#/letters" });
const say = (h, p, link = true) => { msg.hidden = false; msg.innerHTML = `<div><h1></h1><p></p>${link ? '<a href="../#/letters">Make your own digital letter</a>' : ""}</div>`; msg.querySelector("h1").textContent = h; msg.querySelector("p").textContent = p; };
const TEXT = {
  missing: ["Gift not found", "This link may be mistyped, or the gift was deleted."],
  private: ["This gift is private", "The sender has turned off sharing for this link."],
  unavailable: ["Not available yet", "The sender has not finished setting up this gift."],
  expired: ["This gift has expired", "The sender's link period has ended."],
};

if (location.hash === "#preview") {
  msg.hidden = true;
  addEventListener("message", (e) => {
    if (e.origin !== location.origin || e.data?.type !== "lt-preview") return;
    msg.hidden = true; player.play(e.data.letter);
  });
  parent.postMessage({ type: "lt-ready" }, location.origin);
} else {
  const m = location.pathname.match(/\/letter\/([A-Za-z0-9_-]{6,32})\/?$/);
  const id = m ? m[1] : new URLSearchParams(location.search).get("id");
  if (m) history.replaceState(null, "", location.pathname);
  else if (id) history.replaceState(null, "", location.pathname.replace(/\/?(index\.html)?$/, "/") + id);
  if (!id || !/^[A-Za-z0-9_-]{6,32}$/.test(id)) say(...TEXT.missing);
  else sb.rpc("letter_get", { p_id: id }).then(({ data, error }) => {
    if (error || !data) return say("Could not open this gift", navigator.onLine ? "Please try again in a moment." : "You are offline. Reconnect and try again.", false);
    if (data.state !== "ok") return say(...(TEXT[data.state] || TEXT.missing));
    msg.hidden = true; document.title = data.content?.to ? `A gift for ${data.content.to}` : "A digital gift for you";
    player.play({ engine: data.engine, content: data.content });
  });
}
