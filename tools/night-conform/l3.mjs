// L3 — a whole night: the web's full step() under the engine's night tape, compared every tick with the engine's trace.
//
//   node l3.mjs tape.json engine-trace.json [--json report.json] [--ticks N]
//
// The engine side: `night-tape trace tape.json --out engine-trace.json`. The web starts from the engine's state the tick its
// trains start (field clock −59: hero, party), then plays the same inputs — dropped while the engine's hero was held — so every
// difference after that is a difference in the rules. Positions as in L1/L2: x from the tower's left edge (bodies), feet above the ground.
import { readFileSync, writeFileSync } from "node:fs";
import { Night, SPEC } from "../../night/night.js";

const args = process.argv.slice(2);
const [tapePath, tracePath] = args.filter((a) => !a.startsWith("--") && !/^\d+$/.test(a));
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
if (!tapePath || !tracePath) { console.error("usage: node l3.mjs tape.json engine-trace.json [--json out] [--ticks N]"); process.exit(2); }
const tape = JSON.parse(readFileSync(tapePath, "utf8"));
const tr = JSON.parse(readFileSync(tracePath, "utf8"));
const S = SPEC, G = S.GROUND, TX = S.TOWER_X;

// The tape's inputs by tick (0-based, as the engine's trace index).
const inputs = [];
for (const f of tape.frames) for (let i = 0; i < f.count; i++) inputs.push(f.input);

const start = tr.findIndex((t) => (t.fieldClock ?? 0) < 0);
if (start < 0) { console.error("the engine trace never starts its trains"); process.exit(2); }
const e0 = tr[start];

// The web night, set to the engine's state at the start (the hero, the party at their posts).
const w = Object.create(Night.prototype);
w.hooks = {}; w.keys = { left: false, right: false, jump: false }; w.reset();
w.clock = e0.fieldClock; w.field.clock = e0.fieldClock;
const [hx, hfeet, hvx, hvy, hground, hearts] = e0.hero;
Object.assign(w.hero, { x: hx + TX, y: G - hfeet - S.HERO.h, vx: hvx, vy: hvy, ground: !!hground, hearts, coyote: hground ? S.HERO.coyote : 0 });
e0.party.forEach(([x, feet], i) => { if (w.party[i]) Object.assign(w.party[i], { x: x - 0.1 + TX, y: G - feet - 1 }); });

let nextId = 0;
const ids = new Map();
const webFoes = () => w.foes.filter((f) => f.alive).map((f) => {
  if (!ids.has(f)) ids.set(f, nextId++);
  return [ids.get(f), f.kind === "bat" ? 1 : 0, f.x + 0.1 - TX, G - (f.y + 1)];
});
const webHero = () => [w.hero.x - TX, G - (w.hero.y + S.HERO.h), w.hero.vx, w.hero.vy, w.hero.ground ? 1 : 0, w.hero.hearts];

const limit = opt("--ticks") ? +opt("--ticks") : tr.length;
const parts = {};                                     // what parted first, per kind of thing
const timeline = [];
const note = (kind, t, detail) => { if (!parts[kind]) parts[kind] = { tick: t, fieldClock: tr[t].fieldClock, ...detail }; };
for (let t = start + 1; t < Math.min(tr.length, limit); t++) {
  const e = tr[t], inp = inputs[t] ?? {};
  w.keys.left = !e.lock && inp.move < 0; w.keys.right = !e.lock && inp.move > 0;
  w.keys.jump = !e.lock && !!inp.jump; w.hero.jumpHeld = false;     // the engine's jump is one tick's press
  for (const [col, h] of e.touches ?? []) if (w.py && w.py.down && Math.hypot(col + TX + 0.5 - (w.py.x + 0.5), G - h + 0.5 - (w.py.y + 0.5)) < 2.2) w.seal();
  w.step();
  const wh = webHero(), eh = e.hero;
  const heroOff = [0, 1, 5].find((i) => Math.abs(wh[i] - eh[i]) > 1e-6);
  if (heroOff !== undefined) note("hero", t, { field: ["x", "feet", "vx", "vy", "ground", "hearts"][heroOff], engine: +eh[heroOff].toFixed(4), web: +wh[heroOff].toFixed(4) });
  const wf = webFoes(), ef = e.foes;
  const wIds = new Set(wf.map((f) => f[0])), eIds = new Set(ef.map((f) => f[0]));
  const born = [...eIds].filter((i) => !wIds.has(i) && i >= nextId), gone = [...eIds].filter((i) => !wIds.has(i) && i < nextId), extra = [...wIds].filter((i) => !eIds.has(i));
  if (born.length || extra.length || gone.length) note("swarm alive", t, { engineOnly: [...born, ...gone].slice(0, 6), webOnly: extra.slice(0, 6), engine: ef.length, web: wf.length });
  for (const f of ef) {
    const g = wf.find((x) => x[0] === f[0]);
    if (g && (Math.abs(g[2] - f[2]) > 1e-6 || Math.abs(g[3] - f[3]) > 1e-6)) {
      note(f[1] ? "flyer path" : "walker path", t, { id: f[0], engine: [+f[2].toFixed(3), +f[3].toFixed(3)], web: [+g[2].toFixed(3), +g[3].toFixed(3)] });
      break;
    }
  }
  const wp = w.party.map((p) => [p.x + 0.1 - TX, G - (p.y + 1)]);
  e.party.forEach((p, i) => { const q = wp[i]; if (q && (Math.abs(q[0] - p[0]) > 1e-6 || Math.abs(q[1] - p[1]) > 0.06)) note("party", t, { member: i, engine: p.map((v) => +v.toFixed(3)), web: q.map((v) => +v.toFixed(3)) }); });
  const pyOut = e.py && !(Math.abs(e.py[0] - (S.PERCH_X - TX)) < 0.01 && Math.abs(e.py[1] - (G - S.PERCH_Y - 1)) < 0.01);
  if (!!w.py !== !!pyOut && (w.py || pyOut)) note("Py out", t, { engine: !!pyOut, web: !!w.py });
  if (w.over && e.result === undefined) note("result", t, { engine: "playing", web: w.over.win ? "won" : "lost: " + w.over.cause });
  if (!w.over && e.result !== undefined) note("result", t, { engine: e.result ? "won" : "lost", web: "playing" });
  if ((t - start) % 150 === 0) timeline.push({ tick: t, clock: e.fieldClock, heroX: [+eh[0].toFixed(2), +wh[0].toFixed(2)], hearts: [eh[5], wh[5]], swarm: [ef.length, wf.length], py: [!!pyOut, !!w.py] });
  if (w.over && e.result !== undefined) break;
}

const order = Object.entries(parts).sort((a, b) => a[1].tick - b[1].tick);
console.log(`L3 — night ${tape.survival?.battle ?? "?"}: the web's step() under the engine's tape, from the trains' start (tick ${start}, clock ${e0.fieldClock})`);
if (!order.length) console.log("✓ the same night, every tick");
for (const [kind, d] of order) console.log(`✗ ${kind} parts at tick ${d.tick} (clock ${d.fieldClock}): ${JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k]) => k !== "tick" && k !== "fieldClock")))}`);
console.log("\ntick   clock  heroX eng/web   hearts  swarm eng/web  Py out");
for (const r of timeline) console.log(`${String(r.tick).padStart(5)} ${String(r.clock).padStart(6)}  ${r.heroX.join(" / ").padEnd(14)} ${r.hearts.join("/").padEnd(7)} ${r.swarm.join(" / ").padEnd(13)} ${r.py.join("/")}`);
const end = tr[tr.length - 1];
console.log(`\nend — engine: ${end.result === 1 ? "won" : end.result === 0 ? "lost" : "playing"} at tick ${end.t} · web: ${w.over ? (w.over.win ? "won" : "lost (" + w.over.cause + ")") : "playing"} at clock ${w.clock}`);
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify({ parts, timeline }, null, 2));
process.exit(order.length ? 1 : 0);
