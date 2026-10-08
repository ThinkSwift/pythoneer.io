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

const heroFeet = S.GROUND - (S.GROUND - S.HERO.h) - S.HERO.h;     // the web hero starts standing on the ground
row("hero gravity (tiles/tick²)", eng.hero.gravity, S.HERO.gravity);
row("hero run speed", eng.hero.move, S.HERO.move);
row("hero jump speed", eng.hero.jump, S.HERO.jump);
row("hero max fall", eng.hero.maxFall, S.HERO.maxFall);
row("hero coyote ticks", eng.hero.coyote, S.HERO.coyote);
row("hero hearts", eng.hero.hearts, S.HERO.hearts);
row("hero size w×h", [eng.hero.w, eng.hero.h], [S.HERO.w, S.HERO.h]);
row("hero start x (left side)", eng.hero.x, S.TORCH_X - 0.4 - S.TOWER_X, "from the tower's left edge");
row("hero start feet", eng.hero.feet, heroFeet);
row("hero held still after the tower stands (ticks)", eng.watchTicks ?? 0, 0, "engine: the Py's entrance plays first (cinematicLock); input is dropped meanwhile");
row("tower width", eng.tower.width, S.PLAN[0][1].length);
row("tower plan (top → bottom)", eng.tower.plan, S.PLAN.map(([, p]) => p));
row("floor heights (top → bottom)", eng.tower.floors, S.FLOOR_ROWS.map((r) => S.GROUND - r));
row("hall step plates", eng.tower.steps, S.STEPS);
row("hall step height", eng.tower.stepHeight, S.GROUND - S.STEP_ROW);
row("torch [column, height]", eng.tower.torch, [S.TORCH_X - S.TOWER_X, 1], "web: drawn at the hero's feet");
if (eng.tower.perch) row("Py perch [x, height]", eng.tower.perch, [S.PERCH_X - S.TOWER_X, S.GROUND - S.PERCH_Y]);
else rows.push({ item: "Py perch", engine: "not out while the hero stood still", web: [S.PERCH_X - S.TOWER_X, S.GROUND - S.PERCH_Y], ok: null });
row("night level", eng.ladder.level, S.NIGHT.level);
row("Py armor (shell layers)", eng.ladder.armor, S.NIGHT.armor);
row("car gap (ticks)", eng.ladder.carGap, S.NIGHT.carGap);
row("Py comes out at share", eng.ladder.pyArrivalFraction, S.NIGHT.pyAt);
row("balloon every (ticks)", eng.ladder.balloonEvery, S.BALLOON_EVERY);
row("seal window (ticks)", eng.ladder.sealWindow, S.SEAL_WINDOW);
row("walker speed", eng.ladder.patrolSpeed * 1.2 * 0.9 * eng.ladder.level, S.FOE_SPEED, "engine: patrolSpeed · 1.2 · 0.9 · level (as the web assumes)");
row("flyer share of the mix", eng.ladder.mix.flyer / eng.ladder.bodies, S.NIGHT.flyerShare);

// Party posts: the engine's members after they reach their posts vs the web's PARTY.
const engParty = (eng.party || []).map((p) => ({ kind: p.kind, post: p.post, x: +p.x.toFixed(2), feet: +p.feet.toFixed(2) }));
const webParty = S.PARTY.map((p) => ({ kind: "npc_" + p.role, post: [Math.floor(p.post - S.TOWER_X), S.GROUND - p.row], x: p.post - S.TOWER_X, feet: S.GROUND - p.row }));
row("party (kind, post, x, feet)", engParty, webParty);

// Spawns: the engine's (hero standing still, until the torch falls) vs the web's queue over the same span.
const n = bare();
const webSpawns = n.queue.map((q) => ({ tick: q.at + 60, kind: q.kind, x: q.side === 0 ? 2 : 17,
  feet: +(q.kind === "bat" ? S.GROUND - (S.FLOOR_ROWS[0] - 2.4 + 1) : S.GROUND - S.FLOOR_ROWS[0]).toFixed(2) }));
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
row("walker spawn [x, feet]", [+firstZ(es).x.toFixed(2), +firstZ(es).feet.toFixed(2)], [firstZ(ws).x, firstZ(ws).feet], "", 0.06);
if (firstB(es) && firstB(ws)) row("flyer spawn [x, feet]", [+firstB(es).x.toFixed(2), +firstB(es).feet.toFixed(2)], [firstB(ws).x, firstB(ws).feet], "", 0.06);
row("bodies in the whole night", "—", S.NIGHT.bodies, "engine total not observed (the torch fell first)");
rows[rows.length - 1].ok = null;

// ---------------------------------------------------------------- L2: the hero alone
if (whatIf) { const [k, v] = whatIf.split("="); S.HERO[k] = +v; console.log(`(L2 with the web's HERO.${k} = ${v})`); }
function webTrace(tape) {
  const w = bare();
  const out = [];
  for (const [ticks, move, jump] of tape.segments) {
    for (let i = 0; i < ticks; i++) {
      w.keys.left = move < 0; w.keys.right = move > 0; w.keys.jump = jump === 1 && i === 0;
      w.stepHero();
      const h = w.hero;
      out.push([h.x - S.TOWER_X, S.GROUND - (h.y + S.HERO.h), h.vx, h.vy, h.ground ? 1 : 0]);
    }
  }
  return out;
}
const FIELDS = ["x", "feet", "vx", "vy", "ground"];
const l2 = tapes.map((tape) => {
  const e = engHero.find((t) => t.name === tape.name), w = webTrace(tape);
  if (!e) return { name: tape.name, ok: false, note: "no engine trace" };
  // Compare the motion: x as displacement from the start (the start itself is an L1 row), the rest absolute.
  const ex0 = e.ticks[0][0] - e.ticks[0][2], wx0 = w[0][0] - w[0][2];
  let first = null;
  for (let t = 0; t < Math.min(e.ticks.length, w.length) && !first; t++) {
    const a = [e.ticks[t][0] - ex0, ...e.ticks[t].slice(1)], b = [w[t][0] - wx0, ...w[t].slice(1)];
    for (let f = 0; f < 5; f++) if (Math.abs(a[f] - b[f]) > 1e-6) { first = { tick: t + 1, field: FIELDS[f], engine: +a[f].toFixed(4), web: +b[f].toFixed(4) }; break; }
  }
  const end = (tr, x0) => ({ dx: +(tr[tr.length - 1][0] - x0).toFixed(3), feet: +tr[tr.length - 1][1].toFixed(3) });
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
