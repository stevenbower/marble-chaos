import type { Project } from './model';
import { SLOT_BALLS, SLOT_RADIUS, levelRng } from './model';
import { DT, OUT, SAFE, Sim, type Fx } from './sim';

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Slot names: one per character, or comma-separated when there is a comma. */
export function parseLabels(s: string | undefined): string[] {
  const src = s?.trim() || ALPHABET;
  const parts = src.includes(',') ? src.split(',') : [...src];
  return [...new Set(parts.map((x) => x.trim()).filter(Boolean))].slice(0, 40);
}

/**
 * Letters compete instead of marbles: every round the marbles pour into a strip of labelled slots along the floor,
 * and the slot that caught the fewest is eliminated. The rest spread out and go again until one is left.
 */
export class SlotGame {
  labels: string[];
  counts: number[] = [];
  gone: string[] = []; // eliminated, earliest first
  loser = -1; // index into labels, set once a round is judged
  winner = '';
  lost = 0; // marbles that never reached a slot this round
  fx: Fx[] = [];
  sim!: Sim;
  stageIdx = 0;
  round = 0;
  phase: 'run' | 'pause' | 'done' = 'run';
  clock = 0;
  dirty = true;
  private pauseLeft = 0;
  private lastScore = 0; // sim time a marble last scored or was lost
  private rng: () => number;

  constructor(public p: Project, start: number, public single: boolean) {
    this.labels = parseLabels(p.slotLabels);
    this.rng = levelRng(p, 0);
    this.begin(start);
  }

  get stage() {
    return this.p.stages[this.stageIdx];
  }

  private begin(i: number) {
    this.stageIdx = i;
    this.round++;
    this.rng = levelRng(this.p, this.round);
    this.counts = this.labels.map(() => 0);
    this.loser = -1;
    this.lost = 0;
    this.lastScore = 0;
    const n = Math.max(1, Math.min(5000, Math.round(this.p.slotBalls ?? SLOT_BALLS)));
    const balls = Array.from({ length: n }, (_, k) => k % this.p.entrants.length);
    this.sim = new Sim(this.stage, Math.max(3, Math.min(60, this.p.slotRadius ?? SLOT_RADIUS)), this.p.marbleBounce, balls, this.rng, this.labels.length);
    this.phase = 'run';
    this.dirty = true;
  }

  /** One fixed physics step. */
  tick() {
    if (this.phase === 'done') return;
    this.clock += DT;
    if (this.fx.length && this.clock - this.fx[0].at > 1) this.fx.shift();
    if (this.phase === 'pause') {
      this.sim.step(() => {});
      if ((this.pauseLeft -= DT) <= 0) this.next();
      return;
    }
    this.sim.step((m, role, zone, slot) => {
      if (role === 'slot') {
        this.counts[slot!]++;
        this.sim.settle(m, SAFE);
      } else {
        if (zone) this.fx.push({ x: m.x, y: m.y, e: m.e, at: this.clock });
        this.sim.settle(m, OUT);
        this.lost++;
      }
      this.lastScore = this.sim.time;
      this.dirty = true;
    });
    // A few marbles always end up perched on something; once the flow has dried up, call the round. Levels with
    // long routes take a while to deliver the first marble, so nothing counts as dried up before then.
    const scored = this.lost + this.counts.reduce((a, b) => a + b, 0) > 0;
    const stalled = scored ? this.sim.time - this.lastScore > 8 : this.sim.time > 45;
    if (this.sim.live === 0 || stalled || this.sim.time >= (this.stage.timeLimit || 60)) this.judge();
  }

  private judge() {
    const min = Math.min(...this.counts);
    const tied = this.counts.flatMap((c, i) => (c === min ? [i] : []));
    this.loser = tied[Math.floor(this.rng() * tied.length)]; // ties are settled by a random draw
    this.phase = 'pause';
    this.pauseLeft = 3;
    this.dirty = true;
  }

  private next() {
    this.dirty = true;
    if (this.single) {
      this.winner = this.labels[this.counts.indexOf(Math.max(...this.counts))];
      this.phase = 'done';
      return;
    }
    this.gone.push(this.labels[this.loser]);
    this.labels = this.labels.filter((_, i) => i !== this.loser);
    if (this.labels.length <= 1) {
      this.winner = this.labels[0];
      this.phase = 'done';
      return;
    }
    this.begin((this.stageIdx + 1) % this.p.stages.length);
  }
}
