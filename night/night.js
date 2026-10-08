// One night of Pythoneer 4.0 — Night 4, "Vine Gauntlet" (tpl-vines), picked by the Pythoneer session for the web.
// A web replica of the torch night (engine GameCore `beaconMode`, §21-12); values are the engine's, cited inline.
// 30 ticks per second, positions in tiles. Lose: any swarm body or the Py touches the torch, or three hearts gone.
// Win: crack the Py's shell (2 layers) by stomping or bubbles, then touch it — or tap near it — while it is down.
import { sprite, tile, drawFrame, drawSilhouette } from "./pixels.js";

export const TPS = 30;
// --- the tower (GC towerTiers / fieldBuild): 20 wide, five floors three rows apart, the first five above the ground
const TOWER_X = 1, W = 22, TOP = 3;
const PLAN = [
  [1, ".PPPP..PPPPPP..PPPP."],   // roof
  [4, ".PPPPPPPP..PPPPPPPP."],
  [7, "...PPPPPPPPPPPPPP..."],
  [10, ".PPPPPPPP..PPPPPPPP."],
  [13, "...PPPPPPPPPPPPPP..."],   // first floor
];
const FLOOR_ROWS = PLAN.map(([r]) => r + TOP);            // 4, 7, 10, 13, 16
const GROUND = FLOOR_ROWS[4] + 5;                          // 21 — the first floor is five tiles above the ground
const H = GROUND + 2;
const STEPS = [[4, 6], [13, 15]];                          // hall step plates, three above the ground (GC hallSteps)
const STEP_ROW = GROUND - 3;
const TORCH_X = TOWER_X + 10;                              // the torch at the hero's feet, tower centre
// Route per floor (GC towerGoal): roof inward, then inward, outward, inward, outward; the ground walks to the torch.
const INWARD = [true, true, false, true, false];

// --- night 4 (BattleTable k 4 · BattleLadder): pressure beat, 142 bodies, infantry 18 : flyer 3, level 1.12, armor 2
export const NIGHT = { k: 4, name: "Vine Gauntlet", pak: "tpl-vines", bodies: 142, flyerShare: 3 / 21, level: 1.12, armor: 2,
  carGap: 11, train: 10, trainRest: 50, waveGap: 120, shares: [0.3, 0.3, 0.4], pyAt: 0.65, maxOnScreen: 50 };
const HERO = { w: 0.8, h: 0.95, gravity: 0.05, jump: 0.64, move: 0.14, maxFall: 0.45, coyote: 6, stomp: 0.52 * 0.65, invuln: 30, hearts: 3 };
const FOE_SPEED = 0.05 * 1.2 * 0.9 * NIGHT.level;         // patrolSpeed · kind factor · level
const SEAL_WINDOW = 240;                                   // GC sealWindow (8 s)
const PY_OUT_LIMIT = 90 * TPS;                             // after 90 s the Py rushes the torch
// From night 4 the perched Py throws balloons: one freezes a party member for 150 ticks; the hero pops it by touch (GC 3885-3948).
const BALLOON_EVERY = Math.max(150, 330 - 5 * 4), BALLOON_FREEZE = 150;
// Where the Py sits and when it first throws, as measured in the engine on night 4 (Pythoneer session, 3 runs):
// tower-left + 9.1, on the roof; the first throw 379 ticks after it sits, then every balloonEvery.
const PERCH_X = TOWER_X + 9.1, PERCH_Y = FLOOR_ROWS[0] - 1, FIRST_BALLOON = 379;
// The party: two members = one pair on 3F, left and right, in front of the exits at tower columns 4 and 15
// (GC towerPostPlan ~3578, towerPosts ~3608), in party order [bubbler, shooter]; each keeps within postLeash 2 of its post.
// Combat power bubbler 124 · shooter 112 (Pythoneer session, night 4).
const power = (p) => Math.pow(p / 100, 1.5) * 4.4;
const POST_LEASH = 2;
const PARTY = [
  { role: "bubbler", row: FLOOR_ROWS[2], post: TOWER_X + 4, cooldown: Math.round(120 / power(124)), range: 7 },
  { role: "shooter", row: FLOOR_ROWS[2], post: TOWER_X + 15, cooldown: Math.round(70 / power(112)), range: 5.5 },
];
// After three losses on the same night a guest with combat power 200 helps for that night (BattleLadder 160-173).
// Three members = a pair on 3F and the odd one alone in the centre of the lowest floor (GC towerPostPlan).
export const GUEST_AFTER = 3;
const GUEST = { role: "shooter", row: FLOOR_ROWS[4], post: TOWER_X + 9.5, cooldown: Math.round(70 / power(200)), range: 5.5, guest: true };

function solidAt(col, row) {
  if (row === GROUND) return true;
  const i = FLOOR_ROWS.indexOf(row);
  if (i >= 0) { const c = col - TOWER_X; return c >= 0 && c < 20 && PLAN[i][1][c] === "P"; }
  if (row === STEP_ROW) { const c = col - TOWER_X; return STEPS.some(([a, b]) => c >= a && c <= b); }
  return false;
}
/** The floor top the feet land on while falling from `y0` to `y1` (one-way platforms), or null. */
function landing(x, w, y0, y1) {
  for (let row = Math.floor(y0); row <= Math.floor(y1) + 1; row++) {
    if (row < y0 - 0.001 || row > y1 + 0.001) continue;
    for (let c = Math.floor(x + 0.1); c <= Math.floor(x + w - 0.1); c++) if (solidAt(c, row)) return row;
  }
  return null;
}
const floorIndex = (row) => FLOOR_ROWS.indexOf(row);

export class Night {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas; this.ctx = canvas.getContext("2d"); this.hooks = hooks;
    this.art = {
      hero: ["idle", "walk", "die"].map((p) => sprite("hero_" + p)),
      zombie: ["idle", "walk", "die"].map((p) => sprite("zombie_" + p)),
      bat: ["idle", "walk", "die"].map((p) => sprite("bat_" + p)),
      shooter: ["idle", "walk", "die"].map((p) => sprite("npc_shooter_" + p)),
      bubbler: ["idle", "walk", "die"].map((p) => sprite("npc_bubbler_" + p)),
      plank: tile("Bump Plank"), roof: tile("Vine"), grass: tile("Grass"), dirt: tile("Dirt"), brick: tile("Brick"), torch: tile("Torch"),
    };
    this.art.py = Night.pyArt(this.art.zombie);
    this.keys = { left: false, right: false, jump: false };
    this.reset();
    this.bindKeys();
    this.last = performance.now(); this.acc = 0;
    const loop = (now) => {
      this.acc += Math.min(200, now - this.last); this.last = now;
      while (this.acc >= 1000 / TPS) { this.step(); this.acc -= 1000 / TPS; }
      this.draw();
      if (!this.stopped) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** No Py art exists: the engine draws zombie_idle solid black with red eyes and a red glow (WorldRenderer 499-516). */
  static pyArt(zombie) {
    return zombie.map((f) => f.map((v, i) => {
      if (!(v & 0xff)) return 0;
      const r = v >>> 24, g = (v >>> 16) & 0xff, b = (v >>> 8) & 0xff;
      const bright = r > 180 && g < 80 && b < 80;              // zombie's red eyes stay red, everything else goes black
      return bright ? 0xff3030ff >>> 0 : ((13 << 24) | (8 << 16) | (26 << 8) | 0xff) >>> 0;
    }));
  }

  reset() {
    this.tick = 0; this.clock = -60; this.over = null;
    this.hero = { x: TORCH_X - 0.4, y: GROUND - HERO.h, vx: 0, vy: 0, ground: true, coyote: 0, face: 1, hearts: HERO.hearts, hurt: 0, anim: 0 };
    this.foes = []; this.shots = []; this.bubbles = []; this.fx = [];
    this.spawned = 0; this.killed = { shot: 0, bubble: 0, hero: 0 }; this.escapes = 0;
    const members = this.hooks.guest ? [...PARTY, GUEST] : PARTY;
    this.party = members.map((p) => ({ ...p, x: p.post, y: p.row - 1, face: 1, cool: 20, anim: 0, frozen: 0 }));
    this.py = null; this.pyOutAt = 0;
    this.balloons = []; this.balloonClock = FIRST_BALLOON;  // from the moment the Py sits on its perch (here: the night's start)
    this.rng = 1 + Math.floor(Math.random() * 1e6);
    this.queue = this.buildQueue();
  }

  /** Every wave from both sides as trains (BattleLadder.waves): 30/30/40%, half each side, flyers spread through. */
  buildQueue() {
    const q = [];
    const period = NIGHT.train * NIGHT.carGap + NIGHT.trainRest;
    let t = 0;
    NIGHT.shares.forEach((share, w) => {
      const n = Math.round(NIGHT.bodies * share);
      let waveEnd = t;
      for (const side of [0, 1]) {
        const count = side === 0 ? Math.ceil(n / 2) : Math.floor(n / 2);
        const flyers = Math.round(count * NIGHT.flyerShare);
        const every = flyers ? Math.floor(count / flyers) : Infinity;
        let at = t + (side === 1 ? Math.round(period / 2) : 0);
        for (let i = 0; i < count; i++) {
          const kind = (i % every === every - 1) ? "bat" : "zombie";
          q.push({ at, side, kind, wave: w });
          at += NIGHT.carGap;
          if ((i + 1) % NIGHT.train === 0) at += NIGHT.trainRest - NIGHT.carGap;
        }
        waveEnd = Math.max(waveEnd, at);
      }
      t = waveEnd + NIGHT.waveGap;
    });
    return q.sort((a, b) => a.at - b.at);
  }

  stop() { this.stopped = true; cancelAnimationFrame(this.raf); window.removeEventListener("keydown", this.kd); window.removeEventListener("keyup", this.ku); }

  // The app's keys on Mac (engine GameInput.swift): ←→ / A D (the last pressed wins), Space ↑ W jump, Esc closes; a tap is the hand.
  bindKeys() {
    const dirs = { ArrowLeft: "L", KeyA: "L", ArrowRight: "R", KeyD: "R" };
    const jumps = new Set(["Space", "ArrowUp", "KeyW"]);
    this.held = [];
    const apply = () => { const h = this.held[this.held.length - 1]; this.keys.left = h === "L"; this.keys.right = h === "R"; };
    this.kd = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === "Escape") { e.preventDefault(); this.hooks.onClose?.(); return; }
      const d = dirs[e.code];
      if (d) { this.held = this.held.filter((x) => x !== d).concat(d); apply(); e.preventDefault(); return; }
      if (jumps.has(e.code)) { this.keys.jump = true; e.preventDefault(); }
    };
    this.ku = (e) => {
      const d = dirs[e.code];
      if (d) { this.held = this.held.filter((x) => x !== d); apply(); e.preventDefault(); return; }
      if (jumps.has(e.code)) { this.keys.jump = false; e.preventDefault(); }
    };
    window.addEventListener("keydown", this.kd);
    window.addEventListener("keyup", this.ku);
    this.canvas.addEventListener("pointerdown", (e) => this.tap(e));
  }
  press(k, on) { this.keys[k] = on; }

  /** The hand: a tap within 2.2 tiles of the downed Py seals it (GC siegeCaptureTap). */
  tap(e) {
    if (!this.py || !this.py.down || this.over) return;
    const r = this.canvas.getBoundingClientRect(), s = r.width / W;
    const x = (e.clientX - r.left) / s, y = (e.clientY - r.top) / s + this.camTop;
    if (Math.hypot(x - (this.py.x + 0.5), y - (this.py.y + 0.5)) < 2.2) this.seal();
  }

  // ---------------------------------------------------------------------------------- the step

  step() {
    this.tick++;
    for (const f of this.fx) f.t--;
    this.fx = this.fx.filter((f) => f.t > 0);
    if (this.over) { if (this.over.win) this.popSwarm(); return; }
    this.clock++;
    this.spawn();
    this.stepHero();
    for (const f of this.foes) this.stepFoe(f);
    if (this.py) this.stepPy();
    this.stepBalloons();
    this.stepParty();
    this.stepShots();
    this.contacts();
    this.foes = this.foes.filter((f) => f.alive);
    this.checkTorch();
  }

  spawn() {
    while (this.queue.length && this.queue[0].at <= this.clock && this.foes.length < NIGHT.maxOnScreen) {
      const s = this.queue.shift();
      const x = s.side === 0 ? TOWER_X + 2 : TOWER_X + 20 - 3;
      const bat = s.kind === "bat";
      this.foes.push({ kind: s.kind, side: s.side, x, y: bat ? FLOOR_ROWS[0] - 2.4 : FLOOR_ROWS[0] - 1, vx: 0, vy: 0,
        alive: true, wp: 0, anim: (this.spawned * 7) % 16, trapped: 0 });
      this.spawned++;
    }
    // The Py comes out once this share of the night has spawned (GC pyArrivalFraction, pressure beat 0.65).
    // No "last minute" fallback on the web — founder 2026-10-06: the same as the app, no extra rule.
    if (!this.py && this.spawned >= NIGHT.bodies * NIGHT.pyAt) this.bringPyOut();
  }

  bringPyOut() {
    this.py = { x: PERCH_X, y: PERCH_Y, vx: 0, vy: 0, side: 0, armor: NIGHT.armor, down: 0, anim: 0, hitCool: 0 };
    this.pyOutAt = this.clock;
    this.hooks.onPyOut?.();
  }

  stepHero() {
    const h = this.hero, k = this.keys;
    const dir = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    h.vx = dir * HERO.move;
    if (dir) { h.face = dir; h.anim++; }
    if (h.hurt > 0) h.hurt--;
    if (h.ground) h.coyote = HERO.coyote; else if (h.coyote > 0) h.coyote--;
    if (k.jump && h.coyote > 0 && !h.jumpHeld) { h.vy = -HERO.jump; h.ground = false; h.coyote = 0; }
    h.jumpHeld = k.jump;
    h.vy = Math.min(HERO.maxFall, h.vy + HERO.gravity);
    h.x = Math.max(0, Math.min(W - HERO.w, h.x + h.vx));
    const y0 = h.y + HERO.h, oldTop = h.y;
    h.y += h.vy;
    if (h.vy > 0) {
      const top = landing(h.x, HERO.w, y0, h.y + HERO.h);
      if (top !== null) { h.y = top - HERO.h; h.vy = 0; h.ground = true; } else h.ground = false;
    } else {
      h.ground = false;
      // Head-butting a Bump Plank from below knocks off a walker standing on that tile (GC 4386-4422).
      for (const row of [...FLOOR_ROWS, STEP_ROW]) {
        if (oldTop >= row + 1 - 0.001 && h.y < row + 1) {
          const col = Math.floor(h.x + HERO.w / 2);
          if (solidAt(col, row)) {
            this.fx.push({ kind: "bump", x: col, y: row, t: 8 });
            for (const f of this.foes) if (f.alive && f.kind === "zombie" && Math.abs(f.y + 1 - row) < 0.2 && Math.abs(f.x + 0.5 - (col + 0.5)) < 0.9) this.kill(f, "hero");
          }
        }
      }
    }
  }

  /** Walkers follow the tower route by floor; the two lanes never mix. Flyers zigzag the same route at head height. */
  stepFoe(f) {
    if (f.trapped) { if (--f.trapped === 0) this.kill(f, "bubble"); return; }
    f.anim++;
    const inward = f.side === 0 ? 1 : -1;
    if (f.kind === "bat") {
      const [tx, ty] = this.flyerTarget(f);
      const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy);
      if (d < 0.2) { f.wp++; return; }
      const sp = f.wp >= 10 ? FOE_SPEED * 0.7 : FOE_SPEED;   // dives at the torch slowly
      f.x += (dx / d) * sp; f.y += (dy / d) * sp; f.face = dx >= 0 ? 1 : -1;
      return;
    }
    const feet = f.y + 1;
    const fi = floorIndex(Math.round(feet));
    const onGround = Math.abs(feet - GROUND) < 0.01;
    let dir;
    if (onGround) dir = Math.sign(TORCH_X + 0.5 - (f.x + 0.5)) || inward;
    else if (fi >= 0 && Math.abs(feet - FLOOR_ROWS[fi]) < 0.01) dir = INWARD[fi] ? inward : -inward;
    else dir = 0;
    // A walker waits when a same-lane mate is less than a tile ahead (GC 3562-3566).
    const blocked = dir && this.foes.some((o) => o !== f && o.alive && o.kind === "zombie" && o.side === f.side && Math.abs(o.y - f.y) < 0.3 && (o.x - f.x) * dir > 0 && Math.abs(o.x - f.x) < 1);
    f.vx = blocked ? 0 : dir * FOE_SPEED;
    if (dir) f.face = dir;
    f.x = Math.max(0, Math.min(W - 1, f.x + f.vx));
    f.vy = Math.min(0.45, f.vy + HERO.gravity);
    const y0 = f.y + 1;
    f.y += f.vy;
    const top = landing(f.x + 0.1, 0.8, y0, f.y + 1);
    if (top !== null && f.vy >= 0) {
      if (top === GROUND && !f.escaped) { f.escaped = true; this.escapes++; }   // "leaks": bodies the hero must take on the ground
      f.y = top - 1; f.vy = 0;
    }
  }

  flyerTarget(f) {
    const L = f.side === 0;
    const m = (x) => (L ? TOWER_X + x : TOWER_X + 19 - x);
    const hover = (row) => row - 2.4;
    const path = [
      [m(5.5), hover(FLOOR_ROWS[0])], [m(5.5), hover(FLOOR_ROWS[1])], [m(9.5), hover(FLOOR_ROWS[1])], [m(9.5), hover(FLOOR_ROWS[2])],
      [m(1), hover(FLOOR_ROWS[2])], [m(1), hover(FLOOR_ROWS[3])], [m(9.5), hover(FLOOR_ROWS[3])], [m(9.5), hover(FLOOR_ROWS[4])],
      [m(1), hover(FLOOR_ROWS[4])], [m(1), GROUND - 2.4], [TORCH_X, GROUND - 1],
    ];
    return path[Math.min(f.wp, path.length - 1)];
  }

  stepPy() {
    const p = this.py;
    p.anim++;
    if (p.hitCool > 0) p.hitCool--;
    if (p.down > 0) {
      if (--p.down === 0) { p.armor = 1; this.say("say_up"); }   // missed the window: not a loss
      return;
    }
    const rush = this.clock - this.pyOutAt > PY_OUT_LIMIT;
    const feet = p.y + 1, fi = floorIndex(Math.round(feet));
    const onFloor = fi >= 0 && Math.abs(feet - FLOOR_ROWS[fi]) < 0.01, onGround = Math.abs(feet - GROUND) < 0.01;
    // Down the floors like the swarm's left lane, then on the ground to the hero (GC 3483-3495) — or the torch once it rushes.
    let dir = 0;
    if (onGround) dir = Math.sign((rush ? TORCH_X : this.hero.x) - p.x) || 1;
    else if (onFloor) dir = INWARD[fi] ? 1 : -1;
    p.vx = dir * FOE_SPEED * (rush ? 1.6 : 1);
    p.face = dir || p.face;
    p.x = Math.max(0, Math.min(W - 1, p.x + p.vx));
    p.vy = Math.min(0.45, p.vy + HERO.gravity);
    const y0 = p.y + 1; p.y += p.vy;
    const top = landing(p.x + 0.1, 0.8, y0, p.y + 1);
    if (top !== null && p.vy >= 0) { p.y = top - 1; p.vy = 0; }
  }

  random() { this.rng = (this.rng * 16807) % 2147483647; return this.rng / 2147483647; }

  /** The Py on its roof perch throws a balloon at a party member every ~10 s until it comes out. */
  stepBalloons() {
    if (!this.py && this.clock > 0 && --this.balloonClock <= 0) {
      this.balloonClock = BALLOON_EVERY;
      const fx = PERCH_X, fy = PERCH_Y;
      // The nearest free member within 18 tiles of the Py (GC 3893-3912).
      const m = this.party.filter((p) => !p.frozen && Math.hypot(p.x - fx, p.y - fy) < 18).sort((a, b) => Math.hypot(a.x - fx, a.y - fy) - Math.hypot(b.x - fx, b.y - fy))[0];
      if (!m) return;
      this.balloons.push({ x: fx, y: fy, tx: m.x, ty: m.y - 0.6, m, t: 0, stuck: 0 });
    }
    const h = this.hero;
    for (const b of this.balloons) {
      if (!b.stuck) {
        const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy);
        if (d < 0.2) { b.stuck = BALLOON_FREEZE; b.m.frozen = BALLOON_FREEZE; }
        else { b.x += (dx / d) * 0.18; b.y += (dy / d) * 0.18; }
      } else {
        b.x = b.m.x; b.y = b.m.y - 0.6;
        if (--b.stuck <= 0) b.done = true;
        if (Math.abs(h.x + 0.4 - (b.x + 0.5)) < 0.9 && Math.abs(h.y + 0.5 - (b.y + 0.5)) < 1.1) { b.done = true; b.m.frozen = 0; this.burst(b.x + 0.5, b.y + 0.5, "#ff7ab6"); }
      }
    }
    this.balloons = this.balloons.filter((b) => !b.done);
  }

  stepParty() {
    for (const m of this.party) {
      m.anim++;
      if (m.frozen > 0) { m.frozen--; continue; }
      const onFloor = this.foes.filter((f) => f.alive && !f.trapped);
      // Each holds its post (±postLeash): drift toward the nearest body on its row, never past the leash or off the planks.
      const near = onFloor.filter((f) => Math.abs(f.y + 1 - m.row) < 1.2).sort((a, b) => Math.abs(a.x - m.x) - Math.abs(b.x - m.x))[0];
      if (near) {
        const d = near.x - m.x; m.face = Math.sign(d) || m.face;
        if (Math.abs(d) > 1) { const nx = m.x + Math.sign(d) * 0.06; if (Math.abs(nx - m.post) <= POST_LEASH && solidAt(Math.floor(nx + 0.5), m.row)) m.x = nx; }
      }
      if (--m.cool > 0) continue;
      if (m.role === "shooter") {
        // The laser reaches 5.5 tiles but stays near its own floor (flyers dip into it) — bodies that drop to the ground are the hero's.
        const cand = onFloor.filter((f) => Math.hypot(f.x - m.x, f.y - m.y) < m.range && Math.abs(f.y - m.y) <= 2.5);
        const target = cand.find((f) => f.kind === "bat") || cand.sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y))[0];   // flyers first
        if (!target) continue;
        const dx = target.x - m.x, dy = target.y - m.y, d = Math.hypot(dx, dy);
        this.shots.push({ x: m.x + 0.5, y: m.y + 0.45, vx: (dx / d) * 0.45, vy: (dy / d) * 0.45, life: Math.ceil(m.range / 0.45) + 2 });
        m.face = Math.sign(dx) || m.face; m.cool = m.cooldown;
      } else {
        // Bubbles fly level along the member's own row ±1 (GC 4439-4461).
        const target = [...onFloor, ...(this.py && !this.py.down ? [this.py] : [])]
          .filter((f) => Math.abs(f.y - m.y) <= 1.05 && Math.abs(f.x - m.x) < m.range).sort((a, b) => Math.abs(a.x - m.x) - Math.abs(b.x - m.x))[0];
        if (!target) continue;
        const dir = Math.sign(target.x - m.x) || m.face;
        this.bubbles.push({ x: m.x + 0.5, y: m.y + 0.4, vx: dir * 0.22, life: Math.ceil(m.range / 0.22) });
        m.face = dir; m.cool = m.cooldown;
      }
    }
  }

  stepShots() {
    for (const s of this.shots) {
      s.x += s.vx; s.y += s.vy; s.life--;
      const hit = this.foes.find((f) => f.alive && !f.trapped && Math.abs(f.x + 0.5 - s.x) < 0.5 && Math.abs(f.y + 0.5 - s.y) < 0.5);
      if (hit) { this.kill(hit, "shot"); s.life = 0; }
      else if (this.py && Math.abs(this.py.x + 0.5 - s.x) < 0.5 && Math.abs(this.py.y + 0.5 - s.y) < 0.5) { s.life = 0; this.fx.push({ kind: "ping", x: s.x, y: s.y, t: 6 }); }   // party shots bounce off the shell
    }
    this.shots = this.shots.filter((s) => s.life > 0);
    for (const b of this.bubbles) {
      b.x += b.vx; b.life--;
      const hit = this.foes.find((f) => f.alive && !f.trapped && Math.abs(f.x + 0.5 - b.x) < 0.55 && Math.abs(f.y + 0.5 - b.y) < 0.6);
      if (hit) { hit.trapped = 12; b.life = 0; continue; }                 // trapped bodies melt almost at once in torch night
      const p = this.py;
      if (p && !p.down && Math.abs(p.x + 0.5 - b.x) < 0.55 && Math.abs(p.y + 0.5 - b.y) < 0.6) { this.hitPy(); b.life = 0; }   // bubbles crack the shell too
    }
    this.bubbles = this.bubbles.filter((b) => b.life > 0);
  }

  contacts() {
    const h = this.hero;
    const hit = (o) => h.x < o.x + 0.9 && h.x + HERO.w > o.x + 0.1 && h.y < o.y + 1 && h.y + HERO.h > o.y;
    for (const f of this.foes) {
      if (!f.alive || f.trapped || !hit(f)) continue;
      const feet = h.y + HERO.h;
      if (h.vy > 0 && feet - f.y < 0.55) { this.kill(f, "hero"); h.vy = -HERO.stomp - 0.25; continue; }          // stomp kills anything
      if (f.kind === "bat" && h.vy < 0 && h.y > f.y + 0.4) { this.kill(f, "hero"); continue; }                   // head-butt a flyer from below
      if (h.hurt > 0) continue;
      f.alive = false; this.burst(f.x + 0.5, f.y + 0.5, "#de5c33");                                             // the body that touched you is gone
      this.hurtHero(f.x);
    }
    const p = this.py;
    if (p && hit(p)) {
      if (p.down) { this.seal(); return; }                                                                       // touch the downed Py to seal it
      const feet = h.y + HERO.h;
      if (h.vy > 0 && feet - p.y < 0.55) { h.vy = -HERO.stomp - 0.25; this.hitPy(); }
      else if (h.hurt === 0) this.hurtHero(p.x);
    }
  }

  hurtHero(fromX) {
    const h = this.hero;
    h.hearts--; h.hurt = HERO.invuln; h.vy = -0.35; h.x += (h.x < fromX ? -0.8 : 0.8);
    this.fx.push({ kind: "flash", t: 10 });
    if (h.hearts <= 0) this.lose("hearts");
  }

  hitPy() {
    const p = this.py;
    if (!p || p.hitCool > 0 || p.down) return;
    p.hitCool = 12;
    if (p.armor > 0) {
      p.armor--;
      this.burst(p.x + 0.5, p.y + 0.5, p.armor === 0 ? "#ffffff" : "#b07cff");
      if (p.armor === 0) { this.fx.push({ kind: "flash", t: 8, color: "#ffffff" }); this.say("say_broke"); }
      return;
    }
    p.down = SEAL_WINDOW; p.vx = 0;
    this.say("say_touch");
  }

  seal() {
    if (this.over) return;
    this.over = { win: true, at: this.tick };
    this.burst(this.py.x + 0.5, this.py.y + 0.5, "#f7c230");
    this.hooks.onEnd?.({ win: true, stats: this.stats() });
  }

  popSwarm() {
    if (this.tick % 3) return;
    const f = this.foes.find((f) => f.alive);
    if (f) { f.alive = false; this.burst(f.x + 0.5, f.y + 0.5, ["#f7c230", "#3882d9", "#de5c33", "#559e3d"][this.tick % 4]); }
  }

  checkTorch() {
    const bx = TORCH_X + 0.5, by = GROUND - 0.5;
    for (const e of [...this.foes, ...(this.py && !this.py.down ? [this.py] : [])]) {
      if (e.alive === false || e.trapped) continue;
      if (Math.abs(e.x + 0.5 - bx) < 0.8 && Math.abs(e.y + 0.5 - by) < 1.3) { this.lose("torch"); return; }
    }
  }

  lose(cause) {
    if (this.over) return;
    this.over = { win: false, cause, at: this.tick };
    this.fx.push({ kind: "flash", t: 20, color: "#de5c33" });
    this.hooks.onEnd?.({ win: false, cause, stats: this.stats() });
  }

  kill(f, by) { if (!f.alive) return; f.alive = false; this.killed[by]++; this.burst(f.x + 0.5, f.y + 0.5, by === "hero" ? "#f7c230" : "#ffffff"); }
  burst(x, y, color) { this.fx.push({ kind: "burst", x, y, color, t: 12 }); }
  say(text) { this.hooks.onSay?.(text); }

  stats() {
    return { seconds: Math.round(Math.max(0, this.clock) / TPS), spawned: this.spawned, escapes: this.escapes, ...this.killed, hearts: this.hero.hearts };
  }

  /** What the HUD shows — every condition on screen. */
  status() {
    const left = NIGHT.bodies - this.spawned + this.foes.filter((f) => f.alive).length;
    return { hearts: this.hero.hearts, left,
      pyDown: this.py && this.py.down ? Math.ceil(this.py.down / TPS) : null, pyShell: this.py && !this.py.down ? this.py.armor : null,
      pyCountdown: this.py ? null : Math.max(0, Math.ceil(NIGHT.bodies * NIGHT.pyAt) - this.spawned) };
  }

  // ---------------------------------------------------------------------------------- drawing

  draw() {
    const c = this.canvas, ctx = this.ctx, dpr = window.devicePixelRatio || 1;
    this.camTop = TOP - 3;
    const rows = H - this.camTop;
    const s = (c.clientWidth || 360) / W * dpr, T = s * 8;
    const ch = Math.round(rows * T);
    if (c.width !== Math.round(W * T) || c.height !== ch) { c.width = Math.round(W * T); c.height = ch; }
    ctx.imageSmoothingEnabled = false;
    const g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, "#0e1230"); g.addColorStop(1, "#2a2050");
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, ch);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    for (let i = 0; i < 26; i++) ctx.fillRect(((i * 97) % W) * T + (i % 3) * T / 3, ((i * 53) % 7) * T / 1.3, Math.max(1, T / 8), Math.max(1, T / 8));
    const Y = (y) => (y - this.camTop) * T;
    const px = s;                                    // art pixel → screen
    for (let r = this.camTop; r < H; r++) for (let col = 0; col < W; col++) {
      if (r === GROUND) drawFrame(ctx, this.art.grass, col * T, Y(r), px);
      else if (r > GROUND) drawFrame(ctx, this.art.dirt, col * T, Y(r), px);
      else if (solidAt(col, r)) drawFrame(ctx, r === FLOOR_ROWS[0] ? this.art.roof : this.art.plank, col * T, Y(r), px);
    }
    // torch
    const glow = ctx.createRadialGradient((TORCH_X + 0.5) * T, Y(GROUND - 0.7), 0, (TORCH_X + 0.5) * T, Y(GROUND - 0.7), 3.5 * T);
    glow.addColorStop(0, "rgba(255,170,60,0.45)"); glow.addColorStop(1, "rgba(255,170,60,0)");
    ctx.fillStyle = glow; ctx.fillRect((TORCH_X - 4) * T, Y(GROUND - 5), 9 * T, 5 * T);
    drawFrame(ctx, this.art.torch, TORCH_X * T, Y(GROUND - 1), px);

    if (!this.py && this.clock > -60) {   // the Py on its roof perch, throwing balloons
      drawFrame(ctx, this.art.py[Math.floor(this.tick / 12) % 2], PERCH_X * T, Y(PERCH_Y), px);
    }
    for (const b of this.balloons) {
      ctx.fillStyle = "#ff7ab6"; ctx.beginPath(); ctx.arc((b.x + 0.5) * T, Y(b.y + 0.4), 0.38 * T, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = Math.max(1, s / 2); ctx.beginPath(); ctx.moveTo((b.x + 0.5) * T, Y(b.y + 0.8)); ctx.lineTo((b.x + 0.5) * T, Y(b.y + 1.1)); ctx.stroke();
    }
    for (const m of this.party) drawFrame(ctx, this.art[m.role][Math.floor(m.anim / 10) % 2 ? 1 : 0], m.x * T, Y(m.y), px, m.face < 0);
    for (const f of this.foes) {
      if (!f.alive) continue;
      const a = this.art[f.kind];
      drawFrame(ctx, a[f.trapped ? 2 : Math.floor(f.anim / 8) % 2 ? 1 : 0], f.x * T, Y(f.y), px, f.face < 0);
      if (f.trapped) { ctx.strokeStyle = "rgba(170,220,255,0.9)"; ctx.lineWidth = Math.max(1, s); ctx.beginPath(); ctx.arc((f.x + 0.5) * T, Y(f.y + 0.5), 0.7 * T, 0, 7); ctx.stroke(); }
    }
    if (this.py) {
      const p = this.py;
      const pulse = 0.35 + 0.25 * Math.sin(this.tick / 5);
      const rg = ctx.createRadialGradient((p.x + 0.5) * T, Y(p.y + 0.5), 0, (p.x + 0.5) * T, Y(p.y + 0.5), 1.6 * T);
      rg.addColorStop(0, `rgba(255,40,40,${pulse})`); rg.addColorStop(1, "rgba(255,40,40,0)");
      ctx.fillStyle = rg; ctx.fillRect((p.x - 1.5) * T, Y(p.y - 1.5), 4 * T, 4 * T);
      drawFrame(ctx, this.art.py[p.down ? 2 : Math.floor(p.anim / 8) % 2], p.x * T, Y(p.y), px, p.face < 0);
      if (!p.down) {   // the shell ring: purple, red, white by what is left; gold blink when broken
        const left = p.armor / NIGHT.armor;
        ctx.strokeStyle = p.armor === 0 ? (this.tick % 10 < 5 ? "#f7c230" : "#ffffff") : left > 0.66 ? "#9b6bff" : left > 0.33 ? "#ff4d4d" : "#ffffff";
        ctx.lineWidth = Math.max(2, s * 1.2); ctx.beginPath(); ctx.arc((p.x + 0.5) * T, Y(p.y + 0.5), 0.85 * T, 0, 7); ctx.stroke();
      } else {
        ctx.strokeStyle = this.tick % 8 < 4 ? "#f7c230" : "#ffffff"; ctx.lineWidth = Math.max(2, s * 1.5);
        ctx.beginPath(); ctx.arc((p.x + 0.5) * T, Y(p.y + 0.5), 2.2 * T, 0, 7); ctx.stroke();
      }
    }
    const h = this.hero;
    if (!(h.hurt > 0 && Math.floor(h.hurt / 3) % 2))
      drawFrame(ctx, this.art.hero[this.over && !this.over.win ? 2 : !h.ground ? 1 : h.vx && Math.floor(h.anim / 6) % 2 ? 1 : 0], h.x * T - 0.1 * T, Y(h.y + HERO.h - 1), px, h.face < 0);
    ctx.fillStyle = "#ff6a6a";
    for (const sh of this.shots) ctx.fillRect(sh.x * T - s, Y(sh.y) - s / 2, 3 * s, Math.max(1, s));
    ctx.strokeStyle = "rgba(190,230,255,0.95)"; ctx.lineWidth = Math.max(1, s / 1.5);
    for (const b of this.bubbles) { ctx.beginPath(); ctx.arc(b.x * T, Y(b.y), 0.32 * T, 0, 7); ctx.stroke(); }
    for (const f of this.fx) {
      if (f.kind === "burst") { ctx.fillStyle = f.color; const r = (12 - f.t) * 0.08 * T; for (let i = 0; i < 6; i++) ctx.fillRect(f.x * T + Math.cos(i) * r, Y(f.y) + Math.sin(i) * r, 1.5 * s, 1.5 * s); }
      else if (f.kind === "flash") { ctx.fillStyle = (f.color || "#ffffff") + "33"; ctx.fillRect(0, 0, c.width, ch); }
      else if (f.kind === "bump") { ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(f.x * T, Y(f.y) - f.t * s * 0.3, T, T / 4); }
    }
  }
}

// The replica's numbers, read by the conformance check (tools/night-conform) and compared with the engine's (night-tape spec).
export const SPEC = { TPS, TOWER_X, W, TOP, PLAN, FLOOR_ROWS, GROUND, STEPS, STEP_ROW, TORCH_X, INWARD, NIGHT, HERO, FOE_SPEED, SEAL_WINDOW,
  PY_OUT_LIMIT, BALLOON_EVERY, BALLOON_FREEZE, PERCH_X, PERCH_Y, FIRST_BALLOON, POST_LEASH, PARTY, GUEST };
