// pythoneer.io/night — one night in the browser, then the Py goes on the house shelf (HOUSE.md: this site writes the exhibits).
import { Night, NIGHT, GUEST_AFTER } from "./night.js";
import { Room, bringPyHome, pyHalf, spHalf, doorTo, receiveDoor, member } from "./house.js";
import { drawFrame } from "./pixels.js";
import { track } from "./track.js";

const APP_STORE = "https://apps.apple.com/app/id6754533772";
const $ = (s) => document.querySelector(s);
let night = null, room = null, paused = false;
// The app's rule, shown on screen: after three losses on this night a guest (combat power 200) helps.
const LOSS_KEY = "pythoneer.night4.losses";
const losses = () => { try { return Number(localStorage.getItem(LOSS_KEY) || 0); } catch { return 0; } };
const setLosses = (n) => { try { localStorage.setItem(LOSS_KEY, String(n)); } catch {} };
function guestLine() {
  const n = losses();
  return n >= GUEST_AFTER ? "A guest Shooter (power 200) joins you on the first floor tonight."
    : n > 0 ? `Lost ${n} of ${GUEST_AFTER} — after ${GUEST_AFTER} losses a guest joins the tower.` : `After ${GUEST_AFTER} losses a guest joins the tower.`;
}

function start() {
  night?.stop();
  $("#intro").hidden = true; $("#result").hidden = true; $("#say").textContent = "";
  night = new Night($("#night"), {
    onEnd: end,
    onSay: (t) => { $("#say").textContent = t; },
    onPyOut: () => { $("#say").textContent = "The Py is out — crack its shell"; },
    onClose: () => { paused = !paused; if (paused) night.stop(); else start(); },
    guest: losses() >= GUEST_AFTER,
  });
  $("#guest").textContent = guestLine();
  track("arcade_play", { game: "night", k: String(NIGHT.k) });
  hud();
}

function hud() {
  if (!night || night.stopped) return;
  const s = night.status();
  $("#hearts").textContent = "♥".repeat(Math.max(0, s.hearts)) + "♡".repeat(Math.max(0, 3 - s.hearts));
  $("#left").textContent = `Swarm ${s.left}`;
  $("#pystate").textContent = s.py ? `Py: ${s.py}` : `Py: comes out in ${s.pyCountdown}`;
  requestAnimationFrame(hud);
}

function end(r) {
  const st = r.stats;
  setLosses(r.win ? 0 : losses() + 1);
  track("duel_end", { game: "night", won: r.win ? "1" : "0", secs: String(st.seconds), escapes: String(st.escapes),
    shot: String(st.shot), bubble: String(st.bubble), hero: String(st.hero) });
  setTimeout(() => {
    $("#result").hidden = false;
    const art = $("#result-art"), ctx = art.getContext("2d"); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, 96, 96);
    if (r.win) {
      const py = night.art.py;
      const n = bringPyHome(member("tpl-vines", "Vines", { idle: py[0], walk: py[1], die: py[2] }, "Night 4"));
      track("move_in", { n: String(n), what: "py" });
      drawFrame(ctx, py[0], 8, 8, 10);
      $("#result-title").textContent = "Sealed!";
      $("#result-line").textContent = `Vines is on your shelf · ${n}/38. ${st.seconds}s · the tower took ${st.shot + st.bubble}, you took ${st.hero}.`;
      room?.refresh(); renderHouse();
    } else {
      drawFrame(ctx, night.art.hero[2], 8, 8, 10);
      $("#result-title").textContent = r.cause === "torch" ? "The torch went out" : "Out of hearts";
      $("#result-line").textContent = `${st.seconds}s · ${st.escapes} reached the ground. ${guestLine()}`;
    }
  }, r.win ? 1600 : 900);
}

function renderHouse() {
  const py = pyHalf(), sp = spHalf();
  const pys = py?.pys?.have?.length || 0;
  $("#house-count").textContent = `Pys ${pys}/${py?.pys?.total || 38} · Pets ${py?.pets?.have?.length || 0}/${py?.pets?.total || 6} · Fish ${py?.fish?.have?.length || 0}/${py?.fish?.total || 6}`;
  $("#sp-count").textContent = sp.residents.length ? `${sp.residents.length} from Spriteer` : "No one from Spriteer yet";
}

function bindPad() {
  for (const b of document.querySelectorAll("[data-key]")) {
    const k = b.dataset.key;
    const on = (e) => { night?.press(k, true); e.preventDefault(); };
    const off = (e) => { night?.press(k, false); e.preventDefault(); };
    b.addEventListener("pointerdown", on);
    b.addEventListener("pointerup", off); b.addEventListener("pointerleave", off); b.addEventListener("pointercancel", off);
  }
}

async function boot() {
  await receiveDoor(location.hash);          // a house arriving from spriteer.com
  bindPad();
  $("#guest").textContent = guestLine();
  $("#start").onclick = start;
  $("#again").onclick = start;
  $("#to-house").onclick = () => $("#house").scrollIntoView({ behavior: "smooth" });
  room = new Room($("#room"));
  renderHouse();
  $("#to-sp").onclick = async (e) => {
    e.preventDefault();
    track("house_door", { to: "sp" });
    location.href = await doorTo("https://spriteer.com/?ct=py-house");
  };
  new IntersectionObserver((es, o) => {
    if (es.some((e) => e.isIntersecting)) { track("house_open", { pys: String(pyHalf()?.pys?.have?.length || 0) }); o.disconnect(); }
  }).observe($("#house"));
  for (const a of document.querySelectorAll("a[data-store]")) a.href = `${APP_STORE}?ct=${a.dataset.store}`;
  // A still frame behind the intro card.
  const preview = new Night($("#night"), {});
  setTimeout(() => preview.stop(), 120);
}

boot();
