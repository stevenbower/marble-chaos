import type { Project } from './model';
import { mulberry32 } from './model';
import { DT, LIVE, OUT, SAFE, Sim, type Fx, type Marble } from './sim';

export interface Placing {
  e: number;
  place: number;
}

/** Runs a tournament: stage after stage, knocking marbles out until one entrant is left. */
export class Race {
  counts: number[]; // marbles still in, per entrant
  placed: Placing[] = []; // eliminated entrants, earliest first
  feed: (Placing & { at: number })[] = [];
  results: Placing[] = [];
  fx: Fx[] = [];
  sim!: Sim;
  stageIdx = 0;
  round = 0;
  phase: 'run' | 'pause' | 'done' = 'run';
  clock = 0;
  quota = 0;
  outs = 0;
  safes = 0;
  total = 0;
  dirty = true;
  private pauseLeft = 0;
  private safeOrder: number[] = [];
  private rng: () => number;

  constructor(public p: Project, start: number, public single: boolean) {
    this.counts = p.entrants.map(() => Math.max(1, Math.round(p.perEntrant)));
    this.rng = mulberry32(p.seed);
    this.begin(start);
  }

  get stage() {
    return this.p.stages[this.stageIdx];
  }
  entrantsIn() {
    return this.counts.filter((c) => c > 0).length;
  }

  private begin(i: number) {
    this.stageIdx = i;
    this.round++;
    const ents: number[] = [];
    this.counts.forEach((c, e) => {
      for (let k = 0; k < c; k++) ents.push(e);
    });
    const st = this.stage;
    this.total = ents.length;
    const q = st.elimPct ? Math.max(st.elim > 0 ? 1 : 0, Math.round((this.total * st.elim) / 100)) : Math.round(st.elim);
    this.quota = Math.max(0, Math.min(q, this.total - 1));
    this.outs = this.safes = 0;
    this.safeOrder = [];
    this.sim = new Sim(st, this.p.radius, this.p.marbleBounce, ents, this.rng);
    this.phase = 'run';
    this.dirty = true;
  }

  /** One fixed physics step. */
  tick() {
    if (this.phase === 'done') return;
    this.clock += DT;
    if (this.fx.length && this.clock - this.fx[0].at > 1) this.fx.shift();
    if (this.phase === 'run') {
      // Once the safe spots are full, crossing the line no longer saves you.
      this.sim.step((m, role, zone) => (role === 'finish' && this.safes < this.total - this.quota ? this.safe(m) : this.out(m, !!zone)));
      this.check();
    } else {
      this.sim.step(() => {});
      if ((this.pauseLeft -= DT) <= 0) this.next();
    }
  }

  private safe(m: Marble, take = true) {
    this.sim.settle(m, SAFE, take);
    this.safes++;
    this.safeOrder.push(m.e);
    this.dirty = true;
  }

  /** `burn`: it went into an eliminate zone, so it goes up in flames. */
  private out(m: Marble, burn = false) {
    if (this.total - this.outs <= 1) return this.safe(m); // someone has to win
    if (burn) this.fx.push({ x: m.x, y: m.y, e: m.e, at: this.clock });
    this.sim.settle(m, OUT);
    this.outs++;
    if (--this.counts[m.e] === 0) {
      const pl = { e: m.e, place: this.entrantsIn() + 1 };
      this.placed.push(pl);
      this.feed.push({ ...pl, at: this.clock });
    }
    this.dirty = true;
  }

  /** Live marbles, the one furthest from finishing first. */
  private stragglers() {
    const fin = this.sim.zones.filter((z) => z.role === 'finish');
    const d = (m: Marble) => (fin.length ? Math.min(...fin.map((z) => Math.hypot(z.x - m.x, z.y - m.y))) : -m.y);
    return this.sim.marbles.filter((m) => m.state === LIVE).sort((a, b) => d(b) - d(a));
  }

  private check() {
    const { sim, quota } = this;
    const limit = this.stage.timeLimit;
    if (sim.live > 0) {
      if (quota > 0 && this.outs >= quota) {
        for (const m of this.stragglers()) this.safe(m, false);
      } else if (this.safes >= this.total - quota) {
        for (const m of this.stragglers()) this.out(m);
      } else if (limit > 0 && sim.time >= limit) {
        const need = quota - this.outs;
        this.stragglers().forEach((m, i) => (i < need ? this.out(m) : this.safe(m, false)));
      } else return;
    }
    this.phase = 'pause';
    this.pauseLeft = 2.5;
  }

  private next() {
    if (this.single || this.entrantsIn() <= 1) return this.finish();
    let n = this.stageIdx + 1;
    if (n >= this.p.stages.length) {
      if (!this.p.loop) return this.finish();
      n = 0;
    }
    this.begin(n);
  }

  private finish() {
    const rank = (e: number) => {
      const i = this.safeOrder.indexOf(e);
      return i < 0 ? Infinity : i;
    };
    const left = this.counts
      .map((c, e) => ({ c, e }))
      .filter((x) => x.c > 0)
      .sort((a, b) => b.c - a.c || rank(a.e) - rank(b.e));
    this.results = [...left.map((x, i) => ({ e: x.e, place: i + 1 })), ...[...this.placed].reverse()];
    this.phase = 'done';
    this.dirty = true;
  }
}
