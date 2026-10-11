import RAPIER from '@dimforge/rapier2d-compat';
import { D2R, LIFT_TILT, boxH, hit, liftShelfW, liftShelfX, liftShelves, liftSide, liftWalls, polyPts, starPts, toWorld, triPts, triangulate, zigPts } from './geom';
import type { Fate, Shape, Stage } from './model';

export const SCALE = 50; // stage units per physics metre
export const DT = 1 / 120;
const GRAVITY = 12;
/** Slots mode: height of the scoring strip along the stage floor, and of the dividers at its top. */
export const SLOT_H = 90, SLOT_MOUTH = 34;

let ready: Promise<void> | null = null;
export const initPhysics = () => (ready ??= RAPIER.init());

export const LIVE = 0, SAFE = 1, OUT = 2;
/** A short visual effect (a marble burning up), timed against the game clock. */
export interface Fx {
  x: number;
  y: number;
  e: number;
  at: number;
  k?: Fate | 'late'; // what did for it (lava when not given); 'late' crossed the line after the safe spots had gone
  tx?: number; // black holes: where it is dragged to
  ty?: number;
}

export interface Marble {
  e: number; // entrant index
  body: RAPIER.RigidBody | null;
  col: RAPIER.Collider;
  x: number;
  y: number;
  a: number;
  r: number; // current radius; grow and shrink zones change it
  zid: string | null; // the grow/shrink/portal zone it is inside, so each visit only counts once
  state: number;
}

/** Where a shape is right now: position, rotation (radians) and size factor. */
export interface Pose {
  x: number;
  y: number;
  a: number;
  f: number;
  off?: boolean; // a gate that is open just now: not solid, not deadly
}

const canPulse = (s: Shape) => !!s.pulse && (s.kind === 'circle' || s.kind === 'rect');
export const isAnimated = (s: Shape) => !!(s.spin || s.mx || s.my || s.swing || s.gate || canPulse(s));
/** Is a blinking gate open (out of play) `t` seconds in? It starts shut. */
export const gateOff = (s: Shape, t: number) => !!s.gate && (t / Math.max(0.2, s.gate)) % 1 >= Math.max(0.05, Math.min(0.95, s.duty ?? 0.5));

/** A shape's pose `t` seconds into a run, from its spin, slide and pulse settings. */
export function poseAt(s: Shape, t: number): Pose {
  const wave = (period: number | undefined, fallback: number) => Math.sin((2 * Math.PI * t) / Math.max(0.2, period || fallback));
  const m = s.mx || s.my ? wave(s.mt, 3) : 0;
  return {
    x: s.x + (s.mx || 0) * m,
    y: s.y + (s.my || 0) * m,
    a: (s.rot + s.spin * t + (s.swing ? s.swing * wave(s.swingT, 2) : 0)) * D2R,
    f: canPulse(s) ? 1 + Math.min(0.9, Math.abs(s.pulse!)) * wave(s.pulseT, 2) : 1,
    off: gateOff(s, t),
  };
}

function colliders(s: Shape): RAPIER.ColliderDesc[] {
  const k = 1 / SCALE;
  const hull = (pts: number[]) => RAPIER.ColliderDesc.convexHull(new Float32Array(pts.map((v) => v * k)));
  switch (s.kind) {
    case 'rect':
      return [RAPIER.ColliderDesc.cuboid((s.w / 2) * k, (s.h / 2) * k)];
    case 'circle':
      return [RAPIER.ColliderDesc.ball((s.w / 2) * k)];
    case 'tri':
      return [hull(triPts(s))].filter((c) => c !== null);
    case 'poly':
      return triangulate(polyPts(s)).map(hull).filter((c) => c !== null);
    case 'star':
      return triangulate(starPts(s)).map(hull).filter((c) => c !== null);
    case 'lift':
      return liftWalls(s).map(([x, y, w, h]) => RAPIER.ColliderDesc.cuboid((w / 2) * k, (h / 2) * k).setTranslation(x * k, y * k));
    case 'zig': {
      const p = zigPts(s), out = [];
      for (let i = 0; i + 3 < p.length; i += 2) {
        const dx = p[i + 2] - p[i], dy = p[i + 3] - p[i + 1];
        out.push(
          RAPIER.ColliderDesc.cuboid((Math.hypot(dx, dy) / 2) * k, (s.t / 2) * k)
            .setTranslation(((p[i] + p[i + 2]) / 2) * k, ((p[i + 1] + p[i + 3]) / 2) * k)
            .setRotation(Math.atan2(dy, dx)),
        );
        out.push(RAPIER.ColliderDesc.ball((s.t / 2) * k).setTranslation(p[i] * k, p[i + 1] * k)); // rounded corners
      }
      out.push(RAPIER.ColliderDesc.ball((s.t / 2) * k).setTranslation(p[p.length - 2] * k, p[p.length - 1] * k));
      return out;
    }
    case 'cross': {
      const out = [RAPIER.ColliderDesc.ball(s.t * 0.8 * k)];
      for (let i = 0; i < s.arms; i++) {
        const a = (i * 2 * Math.PI) / s.arms, d = s.w / 4;
        out.push(RAPIER.ColliderDesc.cuboid(d * k, (s.t / 2) * k).setTranslation(Math.cos(a) * d * k, Math.sin(a) * d * k).setRotation(a));
      }
      return out;
    }
    case 'arc': {
      const sweep = s.sweep * D2R, n = Math.max(2, Math.ceil(s.sweep / 6)), da = sweep / n;
      const rm = s.w / 2 - s.t / 2, len = (s.w / 2) * Math.tan(da / 2) + 0.5;
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = -sweep / 2 + (i + 0.5) * da;
        out.push(RAPIER.ColliderDesc.cuboid(len * k, (s.t / 2) * k).setTranslation(Math.cos(a) * rm * k, Math.sin(a) * rm * k).setRotation(a + Math.PI / 2));
      }
      return out;
    }
  }
}

/** A black hole's pull reaches this many times its radius. */
export const VOID_REACH = 3;
const RESIZE = 1.5; // how much a grow or shrink zone changes a marble's radius

export class Sim {
  world: RAPIER.World;
  marbles: Marble[] = [];
  time = 0;
  live = 0;
  zones: Shape[];
  /** Live poses of everything that moves; anything not in here sits where the stage put it. */
  private poses = new Map<string, Pose>();
  private movers: { s: Shape; body: RAPIER.RigidBody | null; cols: RAPIER.Collider[] }[] = [];
  private swingers: { s: Shape; body: RAPIER.RigidBody }[] = [];
  private specials: Shape[];
  private belts: Shape[];
  private lifts: { s: Shape; shelves: RAPIER.RigidBody[]; ys: number[] }[] = [];
  private portals: Shape[];
  private voids: Shape[];

  constructor(public stage: Stage, public r: number, bounce: number, entrants: number[], rng: () => number, public slots = 0) {
    const k = 1 / SCALE;
    this.world = new RAPIER.World({ x: 0, y: GRAVITY * stage.gravity });
    this.world.timestep = DT;
    // With a slot strip the slots are the only way to score, so finish zones sit out.
    this.zones = stage.shapes.filter((s) => s.role === 'kill' || (s.role === 'finish' && !slots));
    this.specials = stage.shapes.filter((s) => s.role === 'grow' || s.role === 'shrink' || s.role === 'fan' || s.role === 'portal' || s.role === 'boost' || s.role === 'slow');
    this.voids = stage.shapes.filter((s) => s.role === 'kill' && s.fate === 'void');
    this.portals = stage.shapes.filter((s) => s.role === 'portal');
    this.belts = stage.shapes.filter((s) => s.role === 'solid' && s.kind === 'rect' && !!s.belt);

    for (const s of stage.shapes) {
      if (s.role === 'spawn') continue;
      if (s.role !== 'solid') {
        if (isAnimated(s)) this.movers.push({ s, body: null, cols: [] });
        continue;
      }
      const at = (d: RAPIER.RigidBodyDesc) => this.world.createRigidBody(d.setTranslation(s.x * k, s.y * k).setRotation(s.rot * D2R));
      // Kinematic bodies are position-based so they turn about their own origin; velocity-based ones pivot on the
      // centre of mass, which sends lopsided shapes (arcs, wedges) wandering away from where they are drawn.
      const body = s.free
        ? at(RAPIER.RigidBodyDesc.dynamic().setAngularDamping(0.15))
        : at(isAnimated(s) ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.fixed());
      const cols = colliders(s).map((c) => {
        c.setRestitution(s.bounce).setFriction(0.1).setDensity(3);
        if (s.bounce > 1) c.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max);
        return this.world.createCollider(c, body);
      });
      if (s.kind === 'lift') {
        // the shelves are separate bodies carried up the shaft
        const ys = liftShelves(s, 0), a = s.rot * D2R;
        const shelves = ys.map((y) => {
          const [x, wy] = toWorld(s, liftShelfX(s), y, a);
          const b = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x * k, wy * k).setRotation(a + liftSide(s) * LIFT_TILT));
          this.world.createCollider(RAPIER.ColliderDesc.cuboid((liftShelfW(s) / 2) * k, 4 * k).setFriction(0.3).setRestitution(0), b);
          return b;
        });
        this.lifts.push({ s, shelves, ys });
        continue;
      }
      if (s.free) {
        // pinned through its centre to a fixed point: marbles tip and spin it
        const pin = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(s.x * k, s.y * k));
        this.world.createImpulseJoint(RAPIER.JointData.revolute({ x: 0, y: 0 }, { x: 0, y: 0 }), pin, body, true);
        this.swingers.push({ s, body });
      } else if (isAnimated(s)) this.movers.push({ s, body, cols });
    }
    if (stage.walls) {
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      const tall = 6000 * k, hy = stage.h * k - tall;
      for (const x of [-25, stage.w + 25])
        this.world.createCollider(RAPIER.ColliderDesc.cuboid(25 * k, tall).setTranslation(x * k, hy).setRestitution(0.3).setFriction(0.1), body);
    }

    // Fill spawn areas bottom-up on a grid; overflow stacks above them.
    const step = 2 * r + 2;
    const spawns = stage.shapes.filter((s) => s.role === 'spawn');
    const rects = spawns.length
      ? spawns.map((s) => ({ x0: s.x - s.w / 2, x1: s.x + s.w / 2, y1: s.y + boxH(s) / 2 }))
      : [{ x0: 0, x1: stage.w, y1: step * 3 }];
    const cells: [number, number][] = [];
    for (let row = 0; cells.length < entrants.length && row < 10000; row++) {
      for (const q of rects) {
        const cols = Math.max(1, Math.floor((q.x1 - q.x0) / step));
        const x0 = (q.x0 + q.x1) / 2 - ((cols - 1) * step) / 2;
        for (let c = 0; c < cols; c++) cells.push([x0 + c * step, q.y1 - r - 1 - row * step]);
      }
    }
    const order = [...entrants];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.forEach((e, i) => {
      const [x, y] = cells[i];
      const body = this.world.createRigidBody(
        // Never asleep: a dozing marble isn't woken when a lift shelf or slider it was leaning on moves away,
        // and hangs there in mid-air.
        RAPIER.RigidBodyDesc.dynamic().setTranslation((x + rng() - 0.5) * k, y * k).setLinvel(rng() - 0.5, 0).setCcdEnabled(true).setCanSleep(false),
      );
      const col = this.world.createCollider(RAPIER.ColliderDesc.ball(r * k).setRestitution(bounce).setFriction(0.1), body);
      this.marbles.push({ e, body, col, x, y, a: 0, r, zid: null, state: LIVE });
    });
    this.live = this.marbles.length;
  }

  /** Current shelf heights of a lift, in its own frame. */
  shelves(s: Shape) {
    return this.lifts.find((l) => l.s === s)?.ys ?? liftShelves(s, 0);
  }

  pose(s: Shape): Pose {
    return this.poses.get(s.id) ?? { x: s.x, y: s.y, a: s.rot * D2R, f: 1 };
  }

  /** Is the marble's centre inside this (possibly moving) zone? */
  private inside(z: Shape, m: Marble, pad: number) {
    const p = this.pose(z);
    if (p.off) return false;
    return hit(z, z.x + (m.x - p.x) / p.f, z.y + (m.y - p.y) / p.f, p.a, pad);
  }

  /** Grow, shrink, fan and portal zones act on the marble directly; nothing is reported to the game. */
  private special(m: Marble) {
    let inZone: string | null = null;
    for (const z of this.specials) {
      if (!this.inside(z, m, 0)) continue;
      if (z.role === 'fan') {
        const a = this.pose(z).a, push = (z.power ?? 40) * m.body!.mass() * DT;
        m.body!.applyImpulse({ x: Math.sin(a) * push, y: -Math.cos(a) * push }, true);
        continue;
      }
      if (z.role === 'slow') {
        const v = m.body!.linvel(), keep = 1 - Math.max(0.01, Math.min(0.5, (z.power ?? 40) / 500));
        m.body!.setLinvel({ x: v.x * keep, y: v.y * keep }, true);
        continue;
      }
      if (z.role === 'boost') {
        // a kick along the arrow, topped up for as long as the marble is on the pad
        const a = this.pose(z).a, v = (z.power ?? 700) / SCALE;
        m.body!.setLinvel({ x: Math.sin(a) * v, y: -Math.cos(a) * v }, true);
        continue;
      }
      inZone = z.id;
      if (m.zid === z.id) break; // still on the same visit
      if (z.role === 'portal') {
        const i = this.portals.indexOf(z), twin = this.portals[i ^ 1];
        if (!twin) break;
        const p = this.pose(twin);
        m.body!.setTranslation({ x: p.x / SCALE, y: p.y / SCALE }, true);
        inZone = twin.id; // arriving doesn't send it straight back
      } else {
        m.r = Math.max(this.r * 0.5, Math.min(this.r * 2.25, m.r * (z.role === 'grow' ? RESIZE : 1 / RESIZE)));
        m.col.setRadius(m.r / SCALE);
      }
      break;
    }
    m.zid = inZone;
  }

  /**
   * Advance one fixed step. `onZone` fires for every live marble that touches a zone (passed along), drops into a
   * slot (index passed along), or leaves the stage (a 'kill' with no zone).
   */
  step(onZone: (m: Marble, role: 'finish' | 'kill' | 'slot', zone?: Shape, slot?: number) => void) {
    this.time += DT;
    const k = 1 / SCALE;
    for (const { s, body, cols } of this.movers) {
      const p = poseAt(s, this.time);
      this.poses.set(s.id, p);
      if (!body) continue;
      body.setNextKinematicTranslation({ x: p.x * k, y: p.y * k });
      body.setNextKinematicRotation(p.a);
      if (p.f !== 1 && s.kind === 'circle') cols[0].setRadius((s.w / 2) * p.f * k);
      else if (p.f !== 1) cols[0].setHalfExtents({ x: (s.w / 2) * p.f * k, y: (s.h / 2) * p.f * k });
      if (s.gate && cols[0].isEnabled() === !!p.off) for (const c of cols) c.setEnabled(!p.off);
    }
    for (const lift of this.lifts) {
      const ys = liftShelves(lift.s, this.time), a = lift.s.rot * D2R;
      ys.forEach((y, i) => {
        const [x, wy] = toWorld(lift.s, liftShelfX(lift.s), y, a), to = { x: x * k, y: wy * k };
        // Returning to the bottom is a jump, not a sweep: moved the usual way it would swat everything in the shaft.
        if (y > lift.ys[i]) lift.shelves[i].setTranslation(to, true);
        else lift.shelves[i].setNextKinematicTranslation(to);
      });
      lift.ys = ys;
    }
    this.world.step();
    for (const { s, body } of this.swingers) this.poses.set(s.id, { x: s.x, y: s.y, a: body.rotation(), f: 1 });
    const { w, h } = this.stage;
    for (const m of this.marbles) {
      if (!m.body) continue;
      const p = m.body.translation();
      m.x = p.x * SCALE;
      m.y = p.y * SCALE;
      m.a = m.body.rotation();
      if (m.state !== LIVE) continue;
      // Slots swallow a marble as it crosses their mouth. The dividers are drawn but not solid: solid ones let two
      // marbles wedge side by side in a mouth and block the slot for the rest of the round.
      if (this.slots && m.y > h - SLOT_H + SLOT_MOUTH * 0.4) {
        onZone(m, 'slot', undefined, Math.max(0, Math.min(this.slots - 1, Math.floor((m.x / w) * this.slots))));
        continue;
      }
      if (m.y > h + 3 * m.r || m.x < -100 || m.x > w + 100) {
        onZone(m, 'kill');
        continue;
      }
      for (const b of this.belts) {
        // A marble resting on a conveyor is eased toward the belt's speed along it.
        if (!this.inside(b, m, m.r + 3)) continue;
        const a = this.pose(b).a, tx = Math.cos(a), ty = Math.sin(a), v = m.body.linvel();
        const dv = (b.belt! / SCALE - (v.x * tx + v.y * ty)) * 0.2;
        m.body.setLinvel({ x: v.x + tx * dv, y: v.y + ty * dv }, true);
      }
      for (const z of this.voids) {
        // a black hole drags in whatever strays within three times its size
        const p = this.pose(z), dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy), reach = (z.w / 2) * VOID_REACH;
        if (d >= reach || d < 1) continue;
        const pull = ((z.power ?? 30) * (1 - d / reach) * m.body.mass() * DT) / d;
        m.body.applyImpulse({ x: dx * pull, y: dy * pull }, true);
      }
      const zone = this.zones.find((z) => this.inside(z, m, m.r * 0.5));
      if (zone) onZone(m, zone.role as 'finish' | 'kill', zone);
      else if (this.specials.length) this.special(m);
    }
  }

  /** Settle a marble's fate; `take` also removes it from the world. */
  settle(m: Marble, state: number, take = true) {
    if (m.state === LIVE) this.live--;
    m.state = state;
    if (take && m.body) {
      this.world.removeRigidBody(m.body);
      m.body = null;
    }
  }
}
