// Night conformance — does the web night (night/night.js, a hand port) match the engine (PythoneerEngineKit)?
//
//   node conform.mjs engine-spec.json engine-hero.json [--json report.json]
//
// The engine side comes from its CLI: `night-tape spec --night 4` (L1) and `night-tape hero --night 4 --tapes hero-tapes.json` (L2).
// L1 compares the numbers and the night as the engine opens it; L2 runs the same hero tapes here, every tick.
// Positions are relative on both sides: x from the tower's left edge, heights counted up from the ground row.
// Exit 0 when everything matches, 1 when something differs.
import { readFileSync, writeFileSync } from "node:fs";
import { Night, SPEC } from "../../night/night.js";

const [enginePath, heroPath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const jsonOut = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;
if (!enginePath || !heroPath) { console.error("usage: node conform.mjs engine-spec.json engine-hero.json [--json report.json]"); process.exit(2); }
const eng = JSON.parse(readFileSync(enginePath, "utf8"));
const engHero = JSON.parse(readFileSync(heroPath, "utf8"));
const tapes = JSON.parse(readFileSync(new URL("./hero-tapes.json", import.meta.url), "utf8"));
const S = SPEC, EPS = 1e-9;
// --what-if key=value: try an engine value in the replica before L2 (e.g. --what-if gravity=0.04998) — HERO is the live object.
const whatIf = process.argv.includes("--what-if") ? process.argv[process.argv.indexOf("--what-if") + 1] : null;
// A Night without its constructor (that one binds the window and starts the frame loop): the state reset() makes, nothing drawn.
function bare() { const w = Object.create(Night.prototype); w.hooks = {}; w.keys = { left: false, right: false, jump: false }; w.reset(); return w; }

// ---------------------------------------------------------------- L1: the numbers
const rows = [];
const near = (a, b, eps = EPS) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) <= eps : JSON.stringify(a) === JSON.stringify(b));
function row(item, engine, web, note = "", eps = EPS) { rows.push({ item, engine, web, ok: near(engine, web, eps), note }); }

row("hero gravity (tiles/tick²)", eng.hero.gravity, S.HERO.gravity);
row("hero run speed", eng.hero.move, S.HERO.move);
row("hero jump speed", eng.hero.jump, S.HERO.jump);
row("hero max fall", eng.hero.maxFall, S.HERO.maxFall);
row("hero coyote ticks", eng.hero.coyote, S.HERO.coyote);
row("hero hearts", eng.hero.hearts, S.HERO.hearts);
row("hero size w×h", [eng.hero.w, eng.hero.h], [S.HERO.w, S.HERO.h]);
const webHero = bare().hero;
row("hero start x (left side)", eng.hero.x, webHero.x - S.TOWER_X, "from the tower's left edge");
row("hero start feet", eng.hero.feet, S.GROUND - (webHero.y + S.HERO.h));
rows.push({ item: "hero held still after the tower stands (ticks)", engine: eng.watchTicks ?? 0, web: 0, ok: null,
  note: "by design: the app plays the Py's entrance (cinematicLock); the web opens with the tower standing and no entrance to watch" });
row("tower width", eng.tower.width, S.PLAN[0][1].length);
row("tower plan (top → bottom)", eng.tower.plan, S.PLAN.map(([, p]) => p));
row("floor heights (top → bottom)", eng.tower.floors, S.FLOOR_ROWS.map((r) => S.GROUND - r));
row("hall step plates", eng.tower.steps, S.STEPS);
row("hall step height", eng.tower.stepHeight, S.GROUND - S.STEP_ROW);
row("torch [column, height]", eng.tower.torch, [S.TORCH_X - S.TOWER_X, 1]);
if (eng.tower.perch) rows.push({ item: "Py perch [x, height]", engine: eng.tower.perch, web: [S.PERCH_X - S.TOWER_X, S.GROUND - S.PERCH_Y],
  ok: Math.abs(eng.tower.perch[0] + 0.1 - (S.PERCH_X - S.TOWER_X)) <= 0.15 && eng.tower.perch[1] === S.GROUND - S.PERCH_Y, note: "engine: the seat's tile; web: the Py's body x" });
else rows.push({ item: "Py perch", engine: "not out while the hero stood still", web: [S.PERCH_X - S.TOWER_X, S.GROUND - S.PERCH_Y], ok: null });
row("night level", eng.ladder.level, S.NIGHT.level);
row("Py armor (shell layers)", eng.ladder.armor, S.NIGHT.armor);
row("Py comes out at share", eng.ladder.pyArrivalFraction, S.NIGHT.pyAt);
row("balloon every (ticks)", eng.ladder.balloonEvery, S.BALLOON_EVERY);
row("seal window (ticks)", eng.ladder.sealWindow, S.SEAL_WINDOW);
row("walker speed", eng.ladder.patrolSpeed * 1.2 * 0.9 * eng.ladder.level, S.FOE_SPEED, "engine: patrolSpeed · 1.2 · 0.9 · level (as the web assumes)");
row("waves [walkers, flyers] per lane", eng.ladder.waves, S.NIGHT.waves);
row("trains [car gap, cars, rest, lane lag, wave gap, first clock]", [eng.ladder.carGap, eng.ladder.trainLength, eng.ladder.trainRest, eng.ladder.laneLag, eng.ladder.waveGap, eng.ladder.firstClock],
  [S.NIGHT.carGap, S.NIGHT.train, S.NIGHT.trainRest, S.NIGHT.laneLag, S.NIGHT.waveGap, S.NIGHT.firstClock]);
row("on-screen cap", eng.ladder.onScreenCap, S.NIGHT.maxOnScreen);
row("bump reach", 0.9, S.BUMP_REACH, "GC bumpReach");

// Party posts: the engine's members after they reach their posts vs the web's PARTY.
// Members stand within 0.15 of the web's post (the engine centres the 0.8-wide body in its tile: x + 0.1).
const engParty = (eng.party || []).map((p) => `${p.kind} x${Math.round(p.x * 10) / 10} feet${p.feet}`);
const webParty = S.PARTY.map((p) => `npc_${p.role} x${Math.round((p.post - S.TOWER_X) * 10) / 10} feet${S.GROUND - p.row}`);
const partyOk = (eng.party || []).length === S.PARTY.length && (eng.party || []).every((p, i) => p.kind === "npc_" + S.PARTY[i].role
  && Math.abs(p.x - (S.PARTY[i].post - S.TOWER_X)) <= 0.15 && p.feet === S.GROUND - S.PARTY[i].row);
rows.push({ item: "party posts (kind, x, feet)", engine: engParty, web: webParty, ok: partyOk, note: "x within 0.15" });

// Spawns: the engine's (hero standing still, until the torch falls) vs the web's spawner over the same span (fed the engine's on-field count, so the cap holds the left lane back at the same ticks).
const webSpawns = [];
{ const f = Night.newField(); let out = 0;
  for (let t = 1; t <= 30 * 120 && webSpawns.length < 400; t++)
    // web tick t is engine tick t − 1 (the engine's field clock starts one tick before its "tower stands" mark); the count the
    // engine's left lane sees is the one at the end of its previous tick → onField[t − 3]
    for (const sp of Night.fieldTick(f, t >= 3 ? eng.onField?.[t - 3] ?? 0 : 0)) { out++; webSpawns.push({ tick: t, kind: sp.kind, x: (sp.side === 0 ? 2 : 17) + 0.1,
      feet: sp.kind === "bat" ? S.GROUND - (S.FLOOR_ROWS[0] - 3) : S.GROUND - S.FLOOR_ROWS[0] }); } }
const es = eng.spawns.filter((s) => !s.py);
const span = es.length;
const ws = webSpawns.slice(0, span);
const t0e = es[0]?.tick ?? 0, t0w = ws[0]?.tick ?? 0;
row("first spawn (ticks after the tower stands)", t0e, t0w, "", 1);
const kinds = (a) => a.reduce((m, s) => ((m[s.kind] = (m[s.kind] || 0) + 1), m), {});
row(`spawn kinds, first ${span}`, kinds(es), kinds(ws));
let firstOrder = -1;
for (let i = 0; i < span; i++) if (es[i].kind !== ws[i]?.kind || es[i].tick - t0e !== (ws[i]?.tick ?? 0) - t0w) { firstOrder = i; break; }
rows.push({ item: `spawn order and timing, first ${span}`, engine: firstOrder < 0 ? "same" : `#${firstOrder}: ${es[firstOrder].kind} @${es[firstOrder].tick - t0e}`,
  web: firstOrder < 0 ? "same" : `#${firstOrder}: ${ws[firstOrder]?.kind} @${(ws[firstOrder]?.tick ?? 0) - t0w}`, ok: firstOrder < 0, note: "ticks from the first spawn" });
const firstZ = (a) => a.find((s) => s.kind === "zombie"), firstB = (a) => a.find((s) => s.kind === "bat");
const pairNear = (a, b, eps) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= eps);
for (const [label, pick] of [["walker", firstZ], ["flyer", firstB]]) {
  const e = pick(es), w = pick(ws);
  if (!e || !w) continue;
  const ev = [+e.x.toFixed(2), +e.feet.toFixed(2)], wv = [+w.x.toFixed(2), +w.feet.toFixed(2)];
  rows.push({ item: `${label} spawn [body x, feet]`, engine: ev, web: wv, ok: pairNear(ev, wv, 0.15), note: "within 0.15 — the engine reads it after its first tick of motion" });
}
row("bodies in the whole night (both lanes)", 2 * eng.ladder.waves.reduce((n, [g, f]) => n + g + f, 0), S.NIGHT.bodies);

// ---------------------------------------------------------------- L2: the hero alone
if (whatIf) { const [k, v] = whatIf.split("="); S.HERO[k] = +v; console.log(`(L2 with the web's HERO.${k} = ${v})`); }
function webTrace(tape) {
  const w = bare();
  // Walkers placed before the tape and held still (only the hero steps here): a foe's x is its tile, its body x+0.1 … x+0.9.
  const placed = (tape.foes || []).map(([col, h]) => ({ kind: "zombie", side: 0, x: S.TOWER_X + col, y: S.GROUND - h - 1, vx: 0, vy: 0, alive: true, wp: 0, anim: 0, trapped: 0 }));
  w.foes.push(...placed);
  const out = [];
  for (const [ticks, move, jump] of tape.segments) {
    for (let i = 0; i < ticks; i++) {
      w.keys.left = move < 0; w.keys.right = move > 0; w.keys.jump = jump === 1 && i === 0;
      w.stepHero();
      const h = w.hero;
      out.push([h.x - S.TOWER_X, S.GROUND - (h.y + S.HERO.h), h.vx, h.vy, h.ground ? 1 : 0, placed.filter((f) => f.alive).length]);
    }
  }
  return out;
}
const FIELDS = ["x", "feet", "vx", "vy", "ground", "walkers standing"];
const l2 = tapes.map((tape) => {
  const e = engHero.find((t) => t.name === tape.name), w = webTrace(tape);
  if (!e) return { name: tape.name, ok: false, note: "no engine trace" };
  // Compare the motion: x as displacement from the start (the start itself is an L1 row), the rest absolute.
  const ex0 = e.ticks[0][0] - e.ticks[0][2], wx0 = w[0][0] - w[0][2];
  let first = null;
  for (let t = 0; t < Math.min(e.ticks.length, w.length) && !first; t++) {
    const a = [e.ticks[t][0] - ex0, ...e.ticks[t].slice(1)], b = [w[t][0] - wx0, ...w[t].slice(1)];
    for (let f = 0; f < Math.min(a.length, b.length); f++) if (Math.abs(a[f] - b[f]) > 1e-6) { first = { tick: t + 1, field: FIELDS[f], engine: +a[f].toFixed(4), web: +b[f].toFixed(4) }; break; }
  }
  const end = (tr, x0) => ({ dx: +(tr[tr.length - 1][0] - x0).toFixed(3), feet: +tr[tr.length - 1][1].toFixed(3), ...(tape.foes ? { standing: tr[tr.length - 1][5] } : {}) });
  return { name: tape.name, ok: !first, disturbed: e.disturbed, first, engineEnd: end(e.ticks, ex0), webEnd: end(w, wx0) };
});

// ---------------------------------------------------------------- report
const fmt = (v) => (typeof v === "number" ? +v.toFixed(5) : JSON.stringify(v));
console.log(`L1 — night ${eng.night}: the numbers and the night as the engine opens it`);
for (const r of rows) console.log(`${r.ok === null ? "·" : r.ok ? "✓" : "✗"} ${r.item}\n    engine ${fmt(r.engine)}\n    web    ${fmt(r.web)}${r.note ? `\n    (${r.note})` : ""}`);
console.log(`\nL2 — the hero alone (tolerance 1e-6; x as displacement from the start)`);
for (const r of l2) {
  console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.disturbed ? " (engine trace disturbed by a foe)" : ""}` +
    (r.first ? ` — parts at tick ${r.first.tick}: ${r.first.field} engine ${r.first.engine} · web ${r.first.web}` : "") +
    ` · end engine ${JSON.stringify(r.engineEnd)} web ${JSON.stringify(r.webEnd)}`);
}
const l1bad = rows.filter((r) => r.ok === false).length, l2bad = l2.filter((r) => !r.ok).length;
console.log(`\n${l1bad} of ${rows.filter((r) => r.ok !== null).length} L1 rows differ · ${l2bad} of ${l2.length} L2 tapes differ`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ l1: rows, l2 }, null, 2));
process.exit(l1bad || l2bad ? 1 : 0);
