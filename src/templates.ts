import { mkShape, mkStage, type Shape, type Stage } from './model';

const W = 1280, H = 720;
const floor = (role: 'finish' | 'kill', x0 = 0, x1 = W) => mkShape('rect', role, (x0 + x1) / 2, H - 14, x1 - x0, 28);

type SlotOpts = { spawn?: number[]; h?: number; timeLimit?: number; gravity?: number };
const slotStage = (name: string, scene: string, skin: string, shapes: Shape[], o: SlotOpts = {}) => {
  const [sx, sy, sw, sh] = o.spawn ?? [W / 2, 80, 1200, 120], h = o.h ?? H;
  return mkStage(
    name,
    [
      mkShape('rect', 'spawn', sx, sy, sw, sh),
      ...shapes,
      // kickers at the foot of each wall, so marbles sliding down the sides don't all land in the two end slots
      mkShape('tri', 'solid', 12, h - 135, 24, 70, { skew: -1 }),
      mkShape('tri', 'solid', W - 12, h - 135, 24, 70, { skew: 1 }),
    ],
    { h, timeLimit: o.timeLimit ?? 45, gravity: o.gravity ?? 1, bgTex: scene, skin },
  );
};

/** A row of pegs from `x0` to `x1`. */
const pegs = (y: number, x0: number, x1: number, step: number, d = 26, extra: Partial<Shape> = {}) => {
  const out: Shape[] = [];
  for (let x = x0; x <= x1; x += step) out.push(mkShape('circle', 'solid', x, y, d, d, { bounce: 0.6, ...extra }));
  return out;
};

/**
 * A line of short plates with gaps between them. Marbles travelling along it drop through a few at a time, all
 * the way down its length: that is how a single stream gets shared across the slots. The gaps are wider than two
 * marbles, so a pair cannot wedge in one. `belt` (a speed, or a start and end speed) makes the plates carry marbles along.
 */
function sieve(x0: number, y0: number, x1: number, y1: number, seg: number, gap: number, belt: number[] = [], extra: Partial<Shape> = {}): Shape[] {
  const len = Math.hypot(x1 - x0, y1 - y0), rot = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI, out: Shape[] = [];
  const [b0, b1 = b0] = belt; // a belt that slows along its length drops more of its load further on
  for (let d = seg / 2; d + seg / 2 <= len; d += seg + gap)
    out.push(mkShape('rect', 'solid', x0 + ((x1 - x0) * d) / len, y0 + ((y1 - y0) * d) / len, seg, 14, { rot, ...(b0 ? { belt: Math.round(b0 + ((b1 - b0) * d) / len) } : {}), ...extra }));
  return out;
}

const FAN = 34;
/**
 * A whirlwind (a fan whose direction keeps turning) throws each marble of a stream a different distance to the left
 * or right. Nothing here is narrow, so a queue of marbles cannot jam it. `y0` is where the stream arrives.
 */
const whirlwind = (y0: number): Shape[] => [mkShape('circle', 'fan', 640, y0 + 150, 300, 300, { spin: 140, power: FAN })];

/**
 * A tall stage whose machinery ends by dropping one stream at `y0`, where `end` shares it out among the slots; the
 * strip sits `depth` below that. With `chute` a ramp brings the stream in from the right wall to the middle and a
 * backstop keeps it from overshooting.
 */
const pathStage = (name: string, scene: string, skin: string, y0: number, spawn: number[], shapes: Shape[], end: Shape[], depth: number, chute = false) =>
  slotStage(
    name, scene, skin,
    [...shapes, ...(chute ? [mkShape('rect', 'solid', 1010, y0 - 95, 600, 20, { rot: -8 }), mkShape('rect', 'solid', 560, y0 - 50, 12, 120)] : []), ...end],
    { spawn, h: y0 + depth, timeLimit: 150 },
  );

export const PATH_LEVELS = ['Cookie Conveyor', 'Gold Mine Lift', 'Canyon Rapids', 'Ice Cream Climb', 'Watermill Wheel'];

/** The stages loaded when letter slots is switched on. */
export const SLOT_LEVELS = [
  'Candy Drop', 'Bubble Reef', 'Asteroid Belt', 'Jungle Tumble', 'Snowball Slide', 'Volcano Run', 'Pirate Plunder', 'Robot Works',
  'Barnyard Bounce', 'Castle Stars', 'Spooky Swirl', 'Pyramid Tumble', 'Big Top Bumpers', 'Bug Garden', 'Cloud Hop', 'Toy Box',
  ...PATH_LEVELS,
];

export const TEMPLATES: Record<string, () => Stage> = {
  Blank: () => mkStage('Stage', [mkShape('rect', 'spawn', W / 2, 90, 1000, 120), floor('finish')]),

  Plinko: () => {
    const shapes = [mkShape('rect', 'spawn', W / 2, 90, 1160, 120)];
    for (let row = 0; row < 7; row++)
      for (let x = row % 2 ? 106 : 60; x <= W - 50; x += 92) shapes.push(mkShape('circle', 'solid', x, 230 + row * 62, 26, 26, { bounce: 0.5 }));
    shapes.push(floor('finish'));
    return mkStage('Plinko', shapes);
  },

  Funnel: () =>
    mkStage('Funnel', [
      mkShape('rect', 'spawn', W / 2, 80, 900, 110),
      mkShape('rect', 'solid', 290, 330, 640, 24, { rot: 22 }),
      mkShape('rect', 'solid', 990, 330, 640, 24, { rot: -22 }),
      mkShape('cross', 'solid', W / 2, 540, 200, 200, { t: 18, spin: 140 }),
      mkShape('tri', 'solid', 300, 640, 260, 110),
      mkShape('tri', 'solid', 980, 640, 260, 110),
      floor('kill', 0, 460),
      floor('finish', 460, 820),
      floor('kill', 820, W),
    ]),

  Zigzag: () =>
    mkStage('Zigzag', [
      mkShape('rect', 'spawn', 300, 70, 520, 90),
      mkShape('rect', 'solid', 520, 190, 1040, 22, { rot: 8 }),
      mkShape('rect', 'solid', 760, 380, 1040, 22, { rot: -8 }),
      mkShape('rect', 'solid', 520, 570, 1040, 22, { rot: 8 }),
      mkShape('cross', 'solid', 1160, 610, 120, 120, { t: 14, spin: -200 }),
      floor('finish'),
    ]),

  'Slot Plinko': () => {
    const shapes = [mkShape('rect', 'spawn', W / 2, 80, 1200, 120)];
    for (let row = 0; row < 7; row++)
      for (let x = row % 2 ? 100 : 54; x <= W - 40; x += 92) shapes.push(mkShape('circle', 'solid', x, 200 + row * 58, 24, 24, { bounce: 0.6 }));
    return mkStage('Slot Plinko', shapes, { timeLimit: 45 });
  },

  'Slot Spinners': () => {
    const shapes = [mkShape('rect', 'spawn', W / 2, 70, 1200, 100)];
    for (let i = 0; i < 5; i++) shapes.push(mkShape('cross', 'solid', 160 + i * 240, 290, 190, 190, { t: 14, spin: i % 2 ? -130 : 130 }));
    for (let row = 0; row < 2; row++)
      for (let x = row ? 150 : 80; x <= W - 70; x += 140) shapes.push(mkShape('circle', 'solid', x, 470 + row * 80, 28, 28, { bounce: 0.6 }));
    return mkStage('Slot Spinners', shapes, { timeLimit: 45 });
  },

  'Slot Lava': () => {
    const shapes = [mkShape('rect', 'spawn', W / 2, 80, 1200, 120)];
    for (let row = 0; row < 5; row++)
      for (let x = row % 2 ? 130 : 60, i = 0; x <= W - 40; x += 140, i++) {
        // every so often a peg is a pool of lava instead
        const lava = row > 0 && (row * 4 + i) % 9 === 2;
        shapes.push(mkShape('circle', lava ? 'kill' : 'solid', x, 210 + row * 80, lava ? 44 : 30, 30, { bounce: 0.6 }));
      }
    return mkStage('Slot Lava', shapes, { timeLimit: 45 });
  },

  // ----- levels for letter slots: everything stays above the strip, and each is built around its own mechanism -----
  // pegs
  'Candy Drop': () => {
    const s: Shape[] = [];
    for (let x = 80; x <= 1200; x += 160) s.push(mkShape('circle', 'solid', x, 220, 44, 44, { bounce: 0.8 }));
    [240, 640, 1040].forEach((x, i) => s.push(mkShape('cross', 'solid', x, 350, 170, 170, { t: 16, arms: 2, spin: i % 2 ? -100 : 100 })));
    for (const x of [60, 440, 840, 1220]) s.push(mkShape('circle', 'solid', x, 350, 36, 36, { bounce: 0.8 }));
    s.push(...pegs(470, 100, 1180, 120, 30, { bounce: 0.7 }), ...pegs(560, 160, 1120, 120, 26, { bounce: 0.7 }));
    return slotStage('Candy Drop', 'scene-candy', 'candy', s);
  },

  // turning bowls that fill up, then pour out when their mouth comes round
  'Bubble Reef': () => {
    const s: Shape[] = [];
    [230, 640, 1050].forEach((x, i) => s.push(mkShape('arc', 'solid', x, 335, 290, 290, { t: 14, sweep: 290, spin: i % 2 ? -50 : 50 })));
    [435, 845].forEach((x, i) => s.push(mkShape('cross', 'solid', x, 520, 120, 120, { t: 12, arms: 5, spin: i ? -90 : 90 }))); // starfish
    for (const x of [40, 1240]) s.push(mkShape('circle', 'solid', x, 500, 40, 40, { bounce: 1 }));
    s.push(...pegs(575, 110, 1180, 106, 26, { bounce: 1 }));
    return slotStage('Bubble Reef', 'scene-ocean', 'coral', s, { timeLimit: 60 });
  },

  // low gravity, and rocks that drift about
  'Asteroid Belt': () => {
    const s: Shape[] = [];
    [330, 950].forEach((x, i) => {
      s.push(mkShape('circle', 'solid', x, 330, 120, 120, { bounce: 0.9 })); // planet
      s.push(mkShape('arc', 'solid', x, 330, 250, 250, { t: 12, sweep: 70, spin: i ? -60 : 60, skin: 'gold' })); // its moon's orbit
    });
    const rocks = [[90, 230, 44, 50, 0], [640, 240, 70, 150, 0], [1190, 230, 44, -50, 0], [640, 420, 54, -170, 0], [120, 440, 60, 0, 50], [1160, 440, 60, 0, -50],
      [330, 520, 40, 110, 0], [950, 520, 40, -110, 0], [520, 565, 34, 0, 0], [760, 565, 34, 0, 0], [200, 575, 30, 60, 0], [1080, 575, 30, -60, 0]];
    rocks.forEach(([x, y, d, mx, my], i) => s.push(mkShape('circle', 'solid', x, y, d, d, { bounce: 0.9, mx, my, mt: 5 + (i % 4) })));
    return slotStage('Asteroid Belt', 'scene-space', 'moon', s, { gravity: 0.25, timeLimit: 90 });
  },

  // a trellis of slats over logs that swing when hit
  'Jungle Tumble': () => {
    const s: Shape[] = [];
    for (let x = 110; x <= 1170; x += 212) s.push(mkShape('rect', 'solid', x, 220, 120, 18, { rot: 24 }));
    for (let x = 216; x <= 1070; x += 212) s.push(mkShape('rect', 'solid', x, 315, 120, 18, { rot: -24 }));
    for (let x = 110, i = 0; x <= 1170; x += 212, i++) s.push(mkShape('rect', 'solid', x, 410, 120, 18, { rot: i % 2 ? -24 : 24 }));
    for (let x = 100; x <= 1180; x += 180) s.push(mkShape('rect', 'solid', x, 515, 130, 16, { free: true, skin: 'wood' }));
    for (let x = 190; x <= 1090; x += 180) s.push(mkShape('circle', 'solid', x, 580, 26, 26, { bounce: 0.8, skin: 'wood' })); // coconuts
    return slotStage('Jungle Tumble', 'scene-jungle', 'bamboo', s);
  },

  // one long ski slope full of holes
  'Snowball Slide': () => {
    const s: Shape[] = [...sieve(20, 235, 640, 317, 62, 32), ...sieve(650, 318, 1262, 400, 54, 42)];
    [200, 520].forEach((x, i) => s.push(mkShape('cross', 'solid', x, 440 + i * 30, 130, 130, { t: 10, arms: 6, spin: i ? -60 : 60 }))); // snowflakes
    s.push(...pegs(520, 760, 1200, 110, 34, { bounce: 0.9, color: '#f4fbff' }), ...pegs(585, 90, 1200, 100, 28, { bounce: 0.9, color: '#f4fbff' }));
    return slotStage('Snowball Slide', 'scene-snow', 'ice', s, { spawn: [210, 80, 380, 120], timeLimit: 90 });
  },

  // stone rafts sliding to and fro over drifting pools of lava
  'Volcano Run': () => {
    const s: Shape[] = [], EGG = '#f6ecd0';
    [160, 480, 800, 1120].forEach((x, i) => s.push(mkShape('rect', 'solid', x, 235, 170, 20, { mx: 110, mt: 4 + (i % 2) })));
    [320, 640, 960].forEach((x, i) => s.push(mkShape('rect', 'solid', x, 350, 170, 20, { mx: -120, mt: 5.5 - (i % 2) })));
    [160, 480, 800, 1120].forEach((x, i) => s.push(mkShape('rect', 'solid', x, 465, 170, 20, { mx: 110, mt: 3.5 + (i % 2) * 1.5 })));
    s.push(mkShape('circle', 'kill', 400, 295, 44, 44, { mx: 300, mt: 9 }), mkShape('circle', 'kill', 880, 410, 44, 44, { mx: -300, mt: 11 }));
    s.push(...pegs(570, 100, 1180, 120, 28, { color: EGG })); // dinosaur eggs
    return slotStage('Volcano Run', 'scene-dino', 'stone', s);
  },

  // seesaws everywhere, each tipping onto the ones below
  'Pirate Plunder': () => {
    const s: Shape[] = [];
    for (let x = 128; x < W; x += 256) s.push(mkShape('rect', 'solid', x, 240, 150, 16, { free: true }));
    for (let x = 256; x < W; x += 256) s.push(mkShape('rect', 'solid', x, 350, 170, 16, { free: true }));
    for (let x = 100; x < W; x += 180) s.push(mkShape('rect', 'solid', x, 465, 120, 14, { free: true }));
    s.push(...pegs(580, 90, 1190, 110, 28, { bounce: 0.7, color: '#8d8f9c' })); // cannonballs
    return slotStage('Pirate Plunder', 'scene-pirate', 'wood', s);
  },

  // tiers of conveyors running opposite ways, the last a pair of sorting racks
  'Robot Works': () => {
    const s: Shape[] = [];
    for (const x of [150, 470, 790, 1110]) s.push(mkShape('rect', 'solid', x, 240, 230, 18, { belt: 160 }));
    for (const x of [310, 630, 950]) s.push(mkShape('rect', 'solid', x, 345, 230, 18, { belt: -160 }));
    [80, 1200].forEach((x, i) => s.push(mkShape('cross', 'solid', x, 345, 110, 110, { t: 14, arms: 8, spin: i ? -80 : 80 }))); // gears
    s.push(...sieve(30, 455, 622, 455, 46, 32, [150, 60]), ...sieve(1250, 455, 658, 455, 46, 32, [150, 60]));
    [250, 640, 1030].forEach((x, i) => s.push(mkShape('circle', 'solid', x, 555, 40, 40, { pulse: 0.4, pulseT: 1.6 + i * 0.5, skin: 'neon' })));
    return slotStage('Robot Works', 'scene-robot', 'steel', s, { timeLimit: 60 });
  },

  // three windmills
  'Barnyard Bounce': () => {
    const s: Shape[] = [], HAY = '#e8c84a';
    s.push(mkShape('cross', 'solid', 640, 345, 360, 360, { t: 16, arms: 4, spin: 45 }));
    s.push(mkShape('cross', 'solid', 215, 320, 290, 290, { t: 14, arms: 4, spin: -60 }), mkShape('cross', 'solid', 1065, 320, 290, 290, { t: 14, arms: 4, spin: 60 }));
    s.push(...pegs(535, 60, 1230, 130, 30, { bounce: 0.8, color: HAY }), ...pegs(590, 125, 1200, 130, 30, { bounce: 0.8, color: HAY })); // hay bales
    return slotStage('Barnyard Bounce', 'scene-farm', 'wood', s);
  },

  // the towers of a castle: eight shafts, a spinning star in each
  'Castle Stars': () => {
    const s: Shape[] = [];
    for (let x = 160; x <= 1120; x += 160) {
      s.push(mkShape('rect', 'solid', x, 335, 14, 270), mkShape('tri', 'solid', x, 185, 44, 34)); // wall and its battlement
    }
    for (let i = 0; i < 8; i++) s.push(mkShape('star', 'solid', 80 + i * 160, i % 2 ? 390 : 280, 74, 74, { arms: 5, spin: i % 2 ? -110 : 110, bounce: 0.8 }));
    for (const x of [400, 880]) s.push(mkShape('circle', 'grow', x, 260, 90, 90));
    for (let x = 160, i = 0; x <= 1120; x += 160, i++) s.push(mkShape('star', 'solid', x, 525, 56, 56, { arms: 4, spin: i % 2 ? -120 : 120, bounce: 0.8 }));
    s.push(...pegs(585, 80, 1200, 80, 22, { bounce: 0.7 }));
    return slotStage('Castle Stars', 'scene-castle', 'gold', s);
  },

  // everything funnels into two ghost doors; their far ends wander across the whole stage
  'Spooky Swirl': () => {
    const s: Shape[] = [], PUMPKIN = '#ff8a1f';
    s.push(mkShape('rect', 'solid', 132, 250, 270, 18, { rot: 22 }), mkShape('rect', 'solid', 508, 250, 270, 18, { rot: -22 }));
    s.push(mkShape('rect', 'solid', 772, 250, 270, 18, { rot: 22 }), mkShape('rect', 'solid', 1148, 250, 270, 18, { rot: -22 }));
    s.push(mkShape('tri', 'solid', 640, 185, 60, 50));
    // (no exit ever sits above an entrance, or marbles would loop for ever)
    s.push(mkShape('circle', 'portal', 320, 350, 110, 110), mkShape('circle', 'portal', 640, 440, 70, 70, { mx: 540, mt: 6 }));
    s.push(mkShape('circle', 'portal', 960, 350, 110, 110), mkShape('circle', 'portal', 640, 480, 70, 70, { mx: -540, mt: 8.5 }));
    s.push(...pegs(545, 150, 1150, 200, 40, { bounce: 0.8, color: PUMPKIN }), ...pegs(590, 110, 1180, 118, 26, { bounce: 0.7 }));
    return slotStage('Spooky Swirl', 'scene-spooky', 'stone', s, { timeLimit: 60 });
  },

  // a great pyramid sheds marbles down its sides onto sand belts that carry them back underneath it
  'Pyramid Tumble': () => {
    const s: Shape[] = [mkShape('tri', 'solid', 640, 340, 640, 290)];
    s.push(...sieve(30, 535, 622, 535, 64, 32, [220, 130]), ...sieve(1250, 535, 658, 535, 64, 32, [220, 130]));
    s.push(...pegs(592, 58, 1230, 78, 20));
    [150, 1130].forEach((x, i) => s.push(mkShape('tri', 'solid', x, 400, 110, 70, { mx: 70, mt: 3 + i }))); // wandering dunes
    return slotStage('Pyramid Tumble', 'scene-desert', 'sand', s, { timeLimit: 60 });
  },

  // bumpers
  'Big Top Bumpers': () => {
    const s: Shape[] = [];
    const bumper = (x: number, y: number) => s.push(mkShape('circle', 'solid', x, y, 58, 58, { bounce: 1.4, skin: 'bumper' }));
    for (const x of [160, 400, 640, 880, 1120]) bumper(x, 235);
    for (const x of [280, 520, 760, 1000]) bumper(x, 355);
    for (const x of [160, 400, 640, 880, 1120]) bumper(x, 475);
    for (const x of [70, 1210]) s.push(mkShape('star', 'solid', x, 355, 70, 70, { arms: 5, spin: x < 640 ? 90 : -90 }));
    s.push(...pegs(575, 105, 1180, 107, 24, { bounce: 0.7 }));
    return slotStage('Big Top Bumpers', 'scene-circus', 'rainbow', s);
  },

  // bands of wind, one blowing each way
  'Bug Garden': () => {
    const s: Shape[] = [], PETAL = '#ff7eb6';
    s.push(mkShape('rect', 'fan', 640, 235, 110, 1160, { rot: 90, power: 24 })); // a breeze to the right...
    s.push(mkShape('rect', 'fan', 640, 430, 110, 1160, { rot: 270, power: 24 })); // ...and one back to the left
    [140, 390, 640, 890, 1140].forEach((x, i) => s.push(mkShape('star', 'solid', x, 335, 76, 76, { arms: 6, spin: i % 2 ? -40 : 40, color: PETAL }))); // flowers
    [265, 515, 765, 1015].forEach((x, i) => s.push(mkShape('star', 'solid', x, 525, 70, 70, { arms: 6, spin: i % 2 ? 40 : -40, color: PETAL })));
    s.push(...pegs(590, 80, 1200, 125, 30, { bounce: 0.9, skin: 'candy' })); // toadstool caps
    return slotStage('Bug Garden', 'scene-garden', 'bamboo', s);
  },

  // puffing clouds, updraughts and a shrinking mist
  'Cloud Hop': () => {
    const s: Shape[] = [];
    for (let x = 140, i = 0; x <= 1140; x += 200, i++) s.push(mkShape('circle', 'solid', x, 245, 70, 70, { bounce: 0.9, pulse: 0.4, pulseT: i % 2 ? 2.6 : 2 })); // puffing clouds
    for (const x of [340, 940]) s.push(mkShape('rect', 'fan', x, 440, 120, 170, { power: 30 })); // updraughts
    s.push(mkShape('circle', 'shrink', 640, 400, 110, 110));
    for (const x of [140, 1140]) s.push(mkShape('arc', 'solid', x, 470, 170, 170, { t: 16, sweep: 180, rot: 270, skin: 'rainbow' }));
    s.push(...pegs(575, 90, 1190, 110, 28, { bounce: 0.8 }));
    return slotStage('Cloud Hop', 'scene-sky', 'cloud', s);
  },

  // a jumble of everything
  'Toy Box': () => {
    const s: Shape[] = [], BLOCKS = ['#ff4d4d', '#3da5ff', '#ffd23f', '#47d16c', '#b36bff'];
    for (const x of [220, 640, 1060]) s.push(mkShape('circle', 'solid', x, 220, 56, 56, { bounce: 1.4, skin: 'bumper' }));
    s.push(mkShape('circle', 'grow', 430, 235, 90, 90), mkShape('circle', 'shrink', 850, 235, 90, 90));
    [120, 380, 640, 900, 1160].forEach((x, i) => s.push(mkShape('rect', 'solid', x, 350, 64, 64, { rot: 45, pulse: 0.25, pulseT: 1.8 + i * 0.3, color: BLOCKS[i] }))); // breathing blocks
    [260, 1020].forEach((x, i) => s.push(mkShape('rect', 'solid', x, 465, 140, 16, { rot: i ? -14 : 14, mx: 110, mt: 3.5, color: BLOCKS[i + 1] })));
    s.push(mkShape('cross', 'solid', 640, 470, 170, 170, { t: 14, arms: 3, free: true }));
    for (let x = 100, i = 0; x <= 1180; x += 120, i++) s.push(mkShape('circle', 'solid', x, 570, 28, 28, { bounce: 0.8, color: BLOCKS[i % 5] }));
    return slotStage('Toy Box', 'scene-toys', 'rainbow', s);
  },

  // ----- path levels: a route of channels, belts and lifts brings one stream down, and each shares it out its own way -----
  // three belts, then a cooling rack: a belt full of holes
  'Cookie Conveyor': () =>
    pathStage('Cookie Conveyor', 'scene-cookie', 'wood', 600, [300, 70, 480, 100], [
      mkShape('rect', 'solid', 450, 230, 900, 22, { belt: 170 }),
      mkShape('rect', 'solid', 830, 350, 900, 22, { belt: -170 }),
      mkShape('rect', 'solid', 570, 470, 1140, 22, { belt: 170 }),
    ], [...sieve(1262, 610, 20, 610, 64, 32, [270, 130]), ...pegs(700, 60, 1230, 78, 20), ...pegs(760, 99, 1200, 78, 20)], 310),

  // a bucket lift, then a turning girder
  'Gold Mine Lift': () =>
    pathStage('Gold Mine Lift', 'scene-mine', 'stone', 770, [250, 70, 440, 100], [
      mkShape('rect', 'solid', 280, 541, 570, 20, { rot: 10 }), // hopper floor, piling marbles against the open side of the lift
      mkShape('lift', 'solid', 640, 380, 150, 440, { arms: 4, belt: 150, skew: 1 }),
      mkShape('rect', 'solid', 955, 285, 500, 20, { rot: 8 }),
    ], [
      mkShape('rect', 'solid', 640, 1130, 600, 22, { spin: 28, skin: 'gold' }), // a girder turning end over end tips its load off at a different spot each time
      ...pegs(1490, 50, 1240, 118), ...pegs(1560, 109, 1200, 118),
    ], 880, true),

  // switchback rapids ending in a whirlpool
  'Canyon Rapids': () =>
    pathStage('Canyon Rapids', 'scene-canyon', 'sand', 860, [250, 70, 440, 100], [
      mkShape('rect', 'solid', 500, 230, 1000, 20, { rot: 6 }),
      mkShape('rect', 'solid', 780, 420, 1000, 20, { rot: -6 }),
      mkShape('rect', 'solid', 500, 610, 1000, 20, { rot: 6 }),
      // boulders that swell and squeeze the channel
      mkShape('circle', 'solid', 560, 138, 50, 50, { pulse: 0.35, pulseT: 2.4 }),
      mkShape('circle', 'solid', 720, 338, 50, 50, { pulse: 0.35, pulseT: 3 }),
      mkShape('circle', 'solid', 560, 518, 50, 50, { pulse: 0.35, pulseT: 2 }),
    ], [...whirlwind(860), ...pegs(1330, 50, 1240, 118), ...pegs(1400, 109, 1200, 118)], 730, true),

  // an uphill belt, then a pitched roof of wafers with gaps between
  'Ice Cream Climb': () =>
    pathStage('Ice Cream Climb', 'scene-icecream', 'candy', 700, [250, 70, 440, 100], [
      mkShape('rect', 'solid', 310, 460, 690, 22, { rot: -25.8, belt: 190 }), // uphill belt
      mkShape('rect', 'solid', 920, 420, 560, 20, { rot: 9 }),
    ], [...sieve(625, 760, 20, 890, 60, 32), mkShape('rect', 'solid', 722, 786, 200, 14, { rot: 15.3 }), ...sieve(830, 815, 1260, 930, 60, 32), ...pegs(1000, 60, 1230, 78, 22, { bounce: 0.9 })], 460, true),

  // the wheel meters marbles onto two belts that carry them apart
  'Watermill Wheel': () =>
    pathStage('Watermill Wheel', 'scene-mill', 'wood', 640, [640, 80, 900, 110], [
      mkShape('rect', 'solid', 290, 230, 600, 20, { rot: 11.5 }),
      mkShape('rect', 'solid', 990, 230, 600, 20, { rot: -11.5 }),
      mkShape('cross', 'solid', 640, 450, 300, 300, { t: 12, arms: 8, spin: 70 }),
      mkShape('arc', 'solid', 640, 450, 334, 334, { t: 12, sweep: 136, rot: 180 }),
      mkShape('arc', 'solid', 640, 450, 334, 334, { t: 12, sweep: 136, rot: 0 }),
    ], [
      mkShape('rect', 'solid', 500, 665, 240, 16, { rot: 20 }), mkShape('rect', 'solid', 780, 665, 240, 16, { rot: -20 }), // back to the middle
      mkShape('tri', 'solid', 640, 760, 70, 46),
      ...sieve(640, 790, 20, 790, 64, 32, [130, 240]), ...sieve(640, 790, 1260, 790, 64, 32, [170, 290]),
      ...pegs(880, 60, 1230, 78, 20),
    ], 420),

  Survival: () =>
    mkStage("Don't Fall Out", [
      mkShape('rect', 'spawn', W / 2, 300, 300, 160),
      mkShape('arc', 'solid', W / 2, 330, 580, 580, { t: 18, sweep: 325, rot: 90, spin: 40 }),
      mkShape('cross', 'solid', W / 2, 330, 180, 180, { t: 14, arms: 3, spin: -110 }),
      floor('kill'),
    ]),
};
