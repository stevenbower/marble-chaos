import { mkShape, mkStage, type Shape, type Stage } from './model';

const W = 1280, H = 720;
const floor = (role: 'finish' | 'kill', x0 = 0, x1 = W) => mkShape('rect', role, (x0 + x1) / 2, H - 14, x1 - x0, 28);

const slotStage = (name: string, scene: string, skin: string, shapes: Shape[]) =>
  mkStage(
    name,
    [
      mkShape('rect', 'spawn', W / 2, 80, 1200, 120),
      ...shapes,
      // kickers at the foot of each wall, so marbles sliding down the sides don't all land in the two end slots
      mkShape('tri', 'solid', 12, 585, 24, 70, { skew: -1 }),
      mkShape('tri', 'solid', W - 12, 585, 24, 70, { skew: 1 }),
    ],
    { timeLimit: 45, bgTex: scene, skin },
  );

/**
 * How a path level shares its single stream among the slots: a whirlwind (a fan whose direction keeps turning)
 * throws each marble a different distance to the left or right, then two rows of pegs break up what lands.
 * Nothing here is narrow, so a queue of marbles cannot jam it. `y0` is where the stream arrives.
 */
function spreader(y0: number): Shape[] {
  const s: Shape[] = [mkShape('circle', 'fan', 640, y0 + 150, 300, 300, { spin: 140, power: FAN })];
  for (let x = 50; x <= 1240; x += 118) s.push(mkShape('circle', 'solid', x, y0 + 470, 26, 26, { bounce: 0.6 }));
  for (let x = 109; x <= 1200; x += 118) s.push(mkShape('circle', 'solid', x, y0 + 540, 26, 26, { bounce: 0.6 }));
  return s;
}
const FAN = 34;

/**
 * A tall stage whose machinery ends by dropping one stream down the middle, into the spreader. By default a chute
 * ramp brings it in from the right wall and a backstop keeps it from overshooting; `direct` levels already deliver
 * to the middle themselves.
 */
const pathStage = (name: string, scene: string, skin: string, y0: number, spawn: number[], shapes: Shape[], direct = false) =>
  mkStage(
    name,
    [
      mkShape('rect', 'spawn', spawn[0], spawn[1], spawn[2], spawn[3]),
      ...shapes,
      ...(direct ? [] : [mkShape('rect', 'solid', 1010, y0 - 95, 600, 20, { rot: -8 }), mkShape('rect', 'solid', 560, y0 - 50, 12, 120)]),
      ...spreader(y0),
      mkShape('tri', 'solid', 12, y0 + 595, 24, 70, { skew: -1 }),
      mkShape('tri', 'solid', W - 12, y0 + 595, 24, 70, { skew: 1 }),
    ],
    { h: y0 + 730, timeLimit: 150, bgTex: scene, skin },
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

  // ----- themed levels for letter slots: everything stays above the strip and spreads marbles across the width -----
  'Candy Drop': () => {
    const s: Shape[] = [];
    for (let x = 80; x <= 1200; x += 160) s.push(mkShape('circle', 'solid', x, 220, 44, 44, { bounce: 0.8 }));
    [240, 640, 1040].forEach((x, i) => s.push(mkShape('cross', 'solid', x, 350, 170, 170, { t: 16, arms: 2, spin: i % 2 ? -100 : 100 })));
    for (const x of [60, 440, 840, 1220]) s.push(mkShape('circle', 'solid', x, 350, 36, 36, { bounce: 0.8 }));
    for (let x = 100; x <= 1180; x += 120) s.push(mkShape('circle', 'solid', x, 470, 30, 30, { bounce: 0.7 }));
    for (let x = 160; x <= 1120; x += 120) s.push(mkShape('circle', 'solid', x, 560, 26, 26, { bounce: 0.7 }));
    return slotStage('Candy Drop', 'scene-candy', 'candy', s);
  },

  'Bubble Reef': () => {
    const s: Shape[] = [];
    for (const x of [200, 640, 1080]) s.push(mkShape('arc', 'solid', x, 300, 140, 140, { t: 16, sweep: 180, rot: 270 })); // shell domes
    for (const x of [200, 640, 1080]) s.push(mkShape('circle', 'solid', x, 390, 30, 30, { bounce: 1 }));
    [420, 860].forEach((x, i) => s.push(mkShape('cross', 'solid', x, 310, 150, 150, { t: 14, arms: 5, spin: i ? -70 : 70 }))); // starfish
    for (const x of [120, 380, 640, 900, 1160]) s.push(mkShape('tri', 'solid', x, 470, 90, 70));
    for (const x of [250, 510, 770, 1030]) s.push(mkShape('circle', 'solid', x, 565, 30, 30, { bounce: 1 }));
    return slotStage('Bubble Reef', 'scene-ocean', 'coral', s);
  },

  'Asteroid Belt': () => {
    const s: Shape[] = [];
    for (const [x, d] of [[80, 40], [200, 30], [560, 36], [640, 60], [720, 36], [1080, 30], [1200, 40]]) s.push(mkShape('circle', 'solid', x, 215, d, d, { bounce: 0.7 }));
    [330, 950].forEach((x, i) => {
      s.push(mkShape('circle', 'solid', x, 340, 110, 110, { bounce: 0.6 })); // planet
      s.push(mkShape('arc', 'solid', x, 340, 230, 230, { t: 12, sweep: 80, spin: i ? -90 : 90, skin: 'gold' })); // its moon's orbit
    });
    for (const x of [90, 640, 1190]) s.push(mkShape('circle', 'solid', x, 350, 50, 50, { bounce: 0.7 }));
    for (let x = 100; x <= 1180; x += 135) s.push(mkShape('circle', 'solid', x, 500, 34, 34, { bounce: 0.7 }));
    for (let x = 170; x <= 1110; x += 135) s.push(mkShape('circle', 'solid', x, 578, 28, 28, { bounce: 0.7 }));
    return slotStage('Asteroid Belt', 'scene-space', 'moon', s);
  },

  'Jungle Tumble': () => {
    const s: Shape[] = [];
    for (let x = 110; x <= 1170; x += 212) s.push(mkShape('rect', 'solid', x, 220, 110, 18, { rot: 20 }));
    for (let x = 216; x <= 1070; x += 212) s.push(mkShape('rect', 'solid', x, 320, 110, 18, { rot: -20 }));
    for (let x = 110; x <= 1170; x += 212) s.push(mkShape('rect', 'solid', x, 420, 110, 18, { rot: -20 }));
    for (let x = 90; x <= 1200; x += 100) s.push(mkShape('circle', 'solid', x, 510, 28, 28, { bounce: 0.8, skin: 'wood' })); // coconuts
    for (let x = 140; x <= 1150; x += 100) s.push(mkShape('circle', 'solid', x, 580, 26, 26, { bounce: 0.8, skin: 'wood' }));
    return slotStage('Jungle Tumble', 'scene-jungle', 'bamboo', s);
  },

  'Snowball Slide': () => {
    const s: Shape[] = [];
    for (let x = 80; x <= 1200; x += 140) s.push(mkShape('circle', 'solid', x, 200, 26, 26, { bounce: 0.6 }));
    [220, 640, 1060].forEach((x, i) => s.push(mkShape('cross', 'solid', x, 310, 180, 180, { t: 10, arms: 6, spin: i % 2 ? -60 : 60 }))); // snowflakes
    for (const x of [430, 850]) s.push(mkShape('tri', 'solid', x, 310, 120, 80));
    for (let x = 110; x <= 1170; x += 106) s.push(mkShape('circle', 'solid', x, 455, 40, 40, { bounce: 0.9, color: '#f4fbff' })); // snowballs
    for (let x = 163; x <= 1120; x += 106) s.push(mkShape('circle', 'solid', x, 550, 30, 30, { bounce: 0.9, color: '#f4fbff' }));
    return slotStage('Snowball Slide', 'scene-snow', 'ice', s);
  },

  'Volcano Run': () => {
    const s: Shape[] = [], EGG = '#f6ecd0'; // pegs are dinosaur eggs, pale enough to read on the dusk backdrop
    for (let x = 100; x <= 1180; x += 120) s.push(mkShape('circle', 'solid', x, 210, 30, 30, { bounce: 0.6, color: EGG }));
    s.push(mkShape('tri', 'solid', 640, 385, 180, 120)); // the volcano...
    s.push(mkShape('circle', 'kill', 640, 322, 40, 40)); // ...and its crater
    for (const x of [250, 1030]) s.push(mkShape('circle', 'kill', x, 400, 40, 40));
    for (const x of [80, 200, 320, 440, 840, 960, 1080, 1200]) s.push(mkShape('circle', 'solid', x, 320, 30, 30, { bounce: 0.6, color: EGG }));
    for (const x of [140, 280, 420, 860, 1000, 1140]) s.push(mkShape('circle', 'solid', x, 480, 30, 30, { bounce: 0.6, color: EGG }));
    for (const x of [110, 220, 340, 470, 590, 690, 810, 940, 1060, 1170]) s.push(mkShape('circle', 'solid', x, 570, 26, 26, { bounce: 0.6, color: EGG }));
    return slotStage('Volcano Run', 'scene-dino', 'stone', s);
  },

  'Pirate Plunder': () => {
    const s: Shape[] = [];
    for (let x = 100; x <= 1180; x += 180) s.push(mkShape('circle', 'solid', x, 215, 34, 34, { bounce: 0.7, color: '#2b2b33' })); // cannonballs
    for (const x of [260, 640, 1020]) s.push(mkShape('rect', 'solid', x, 325, 220, 16, { free: true })); // seesaws
    [200, 640, 1080].forEach((x, i) => s.push(mkShape('rect', 'solid', x, 440, 150, 18, { rot: i % 2 ? -14 : 14, mx: 120, mt: 3 + i * 0.5 }))); // drifting planks
    for (let x = 90; x <= 1190; x += 110) s.push(mkShape('circle', 'solid', x, 530, 28, 28, { bounce: 0.7 }));
    for (let x = 145; x <= 1140; x += 110) s.push(mkShape('circle', 'solid', x, 590, 24, 24, { bounce: 0.7 }));
    return slotStage('Pirate Plunder', 'scene-pirate', 'wood', s);
  },

  'Robot Works': () => {
    const s: Shape[] = [];
    [180, 640, 1100].forEach((x, i) => s.push(mkShape('cross', 'solid', x, 265, 150, 150, { t: 16, arms: 8, spin: i % 2 ? -80 : 80 }))); // gears
    [410, 870].forEach((x, i) => s.push(mkShape('circle', 'solid', x, 250, 50, 50, { pulse: 0.5, pulseT: 2 + i * 0.6, skin: 'neon' })));
    [180, 640, 1100].forEach((x, i) => s.push(mkShape('circle', 'solid', x, 420, 46, 46, { pulse: 0.5, pulseT: 1.6 + i * 0.5, skin: 'neon' })));
    [410, 870].forEach((x, i) => s.push(mkShape('zig', 'solid', x, 420, 190, 50, { rot: 90, arms: 5, t: 12, mx: 90, mt: 4 + i, skin: 'neon' }))); // sliding saw-tooth walls
    for (let x = 100; x <= 1180; x += 120) s.push(mkShape('circle', 'solid', x, 565, 28, 28, { bounce: 0.6 }));
    return slotStage('Robot Works', 'scene-robot', 'steel', s);
  },

  'Barnyard Bounce': () => {
    const s: Shape[] = [], HAY = '#e8c84a';
    for (const x of [320, 640, 960]) s.push(mkShape('circle', 'solid', x, 225, 56, 56, { bounce: 1.4, skin: 'bumper' }));
    [160, 480, 800, 1120].forEach((x, i) => s.push(mkShape('rect', 'solid', x, 340, 150, 14, { rot: i % 2 ? -12 : 12, bounce: 1.25, skin: 'bumper' }))); // trampolines
    for (let x = 80; x <= 1200; x += 140) s.push(mkShape('circle', 'solid', x, 455, 36, 36, { bounce: 0.8, color: HAY })); // hay bales
    for (let x = 150; x <= 1130; x += 140) s.push(mkShape('circle', 'solid', x, 545, 30, 30, { bounce: 0.8, color: HAY }));
    return slotStage('Barnyard Bounce', 'scene-farm', 'wood', s);
  },

  'Castle Stars': () => {
    const s: Shape[] = [];
    [200, 640, 1080].forEach((x, i) => s.push(mkShape('star', 'solid', x, 255, 110, 110, { arms: 5, spin: i % 2 ? -70 : 70, bounce: 0.8 })));
    for (const x of [420, 860]) s.push(mkShape('star', 'solid', x, 240, 60, 60, { arms: 5, bounce: 0.8 }));
    for (const x of [420, 860]) s.push(mkShape('circle', 'grow', x, 370, 100, 100));
    for (let x = 110, i = 0; x <= 1170; x += 150, i++) s.push(mkShape('star', 'solid', x, 480, 54, 54, { arms: 4, spin: i % 2 ? -120 : 120, bounce: 0.8 }));
    for (let x = 185; x <= 1100; x += 150) s.push(mkShape('circle', 'solid', x, 570, 26, 26, { bounce: 0.7 }));
    return slotStage('Castle Stars', 'scene-castle', 'gold', s);
  },

  'Spooky Swirl': () => {
    const s: Shape[] = [];
    for (let x = 100; x <= 1180; x += 180) s.push(mkShape('circle', 'solid', x, 215, 44, 44, { bounce: 0.8, color: '#ff8a1f' })); // pumpkins
    // two pairs of portals swap the sides of the stage
    // (no exit sits above another entrance, or marbles would loop for ever)
    s.push(mkShape('circle', 'portal', 190, 320, 80, 80), mkShape('circle', 'portal', 860, 480, 80, 80));
    s.push(mkShape('circle', 'portal', 1090, 320, 80, 80), mkShape('circle', 'portal', 420, 480, 80, 80));
    for (const x of [460, 820]) s.push(mkShape('cross', 'solid', x, 320, 170, 170, { t: 12, arms: 3, free: true })); // pinwheels the marbles turn
    s.push(mkShape('cross', 'solid', 640, 400, 150, 150, { t: 12, arms: 3, free: true }));
    for (let x = 100; x <= 1180; x += 120) s.push(mkShape('circle', 'solid', x, 565, 28, 28, { bounce: 0.7 }));
    return slotStage('Spooky Swirl', 'scene-spooky', 'stone', s);
  },

  'Pyramid Tumble': () => {
    const s: Shape[] = [];
    for (let x = 90; x <= 1190; x += 157) s.push(mkShape('circle', 'solid', x, 210, 28, 28, { bounce: 0.6 }));
    for (const x of [250, 640, 1030]) s.push(mkShape('tri', 'solid', x, 320, 200, 120));
    for (const x of [445, 835]) s.push(mkShape('zig', 'solid', x, 320, 170, 46, { rot: 90, arms: 4, t: 12 })); // carved pillars
    [120, 445, 835, 1160].forEach((x, i) => s.push(mkShape('tri', 'solid', x, 475, 100, 64, { mx: 70, mt: 3 + i * 0.5 }))); // wandering dunes
    for (const x of [250, 640, 1030]) s.push(mkShape('circle', 'solid', x, 450, 30, 30, { bounce: 0.9 }));
    for (let x = 100; x <= 1180; x += 120) s.push(mkShape('circle', 'solid', x, 570, 28, 28, { bounce: 0.6 }));
    return slotStage('Pyramid Tumble', 'scene-desert', 'sand', s);
  },

  'Big Top Bumpers': () => {
    const s: Shape[] = [];
    const bumper = (x: number, y: number) => s.push(mkShape('circle', 'solid', x, y, 58, 58, { bounce: 1.4, skin: 'bumper' }));
    for (const x of [160, 400, 640, 880, 1120]) bumper(x, 235);
    for (const x of [280, 520, 760, 1000]) bumper(x, 355);
    for (const x of [160, 400, 640, 880, 1120]) bumper(x, 475);
    for (const x of [70, 1210]) s.push(mkShape('star', 'solid', x, 355, 70, 70, { arms: 5, spin: x < 640 ? 90 : -90 }));
    for (let x = 105; x <= 1180; x += 107) s.push(mkShape('circle', 'solid', x, 575, 24, 24, { bounce: 0.7 }));
    return slotStage('Big Top Bumpers', 'scene-circus', 'rainbow', s);
  },

  'Bug Garden': () => {
    const s: Shape[] = [], PETAL = '#ff7eb6';
    s.push(mkShape('rect', 'fan', 320, 245, 110, 420, { rot: 90, power: 22 })); // a breeze to the right...
    s.push(mkShape('rect', 'fan', 960, 245, 110, 420, { rot: 270, power: 22 })); // ...and one back to the left
    [140, 390, 640, 890, 1140].forEach((x, i) => s.push(mkShape('star', 'solid', x, 385, 76, 76, { arms: 6, spin: i % 2 ? -40 : 40, color: PETAL }))); // flowers
    for (const x of [265, 515, 765, 1015]) s.push(mkShape('circle', 'solid', x, 485, 34, 34, { bounce: 0.9, skin: 'candy' })); // toadstool caps
    for (let x = 80; x <= 1200; x += 125) s.push(mkShape('circle', 'solid', x, 575, 26, 26, { bounce: 0.7 }));
    return slotStage('Bug Garden', 'scene-garden', 'bamboo', s);
  },

  'Cloud Hop': () => {
    const s: Shape[] = [];
    for (let x = 140, i = 0; x <= 1140; x += 200, i++) s.push(mkShape('circle', 'solid', x, 245, 70, 70, { bounce: 0.9, pulse: 0.4, pulseT: i % 2 ? 2.6 : 2 })); // puffing clouds
    for (const x of [340, 940]) s.push(mkShape('rect', 'fan', x, 440, 120, 170, { power: 30 })); // updraughts
    s.push(mkShape('circle', 'shrink', 640, 400, 110, 110));
    for (const x of [140, 1140]) s.push(mkShape('arc', 'solid', x, 470, 170, 170, { t: 16, sweep: 180, rot: 270, skin: 'rainbow' }));
    for (let x = 90; x <= 1190; x += 110) s.push(mkShape('circle', 'solid', x, 575, 28, 28, { bounce: 0.8 }));
    return slotStage('Cloud Hop', 'scene-sky', 'cloud', s);
  },

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

  // ----- path levels for letter slots: a route of channels, belts and lifts, then a splitter that fans the stream out -----
  'Cookie Conveyor': () =>
    pathStage('Cookie Conveyor', 'scene-cookie', 'wood', 670, [300, 70, 480, 100], [
      mkShape('rect', 'solid', 450, 230, 900, 22, { belt: 170 }),
      mkShape('rect', 'solid', 830, 350, 900, 22, { belt: -170 }),
      mkShape('rect', 'solid', 450, 470, 900, 22, { belt: 170 }),
    ]),

  'Gold Mine Lift': () =>
    pathStage('Gold Mine Lift', 'scene-mine', 'stone', 770, [250, 70, 440, 100], [
      mkShape('rect', 'solid', 280, 541, 570, 20, { rot: 10 }), // hopper floor, piling marbles against the open side of the lift
      mkShape('lift', 'solid', 640, 380, 150, 440, { arms: 4, belt: 150, skew: 1 }),
      mkShape('rect', 'solid', 955, 285, 500, 20, { rot: 8 }),
    ]),

  'Canyon Rapids': () =>
    pathStage('Canyon Rapids', 'scene-canyon', 'sand', 860, [250, 70, 440, 100], [
      mkShape('rect', 'solid', 500, 230, 1000, 20, { rot: 6 }),
      mkShape('rect', 'solid', 780, 420, 1000, 20, { rot: -6 }),
      mkShape('rect', 'solid', 500, 610, 1000, 20, { rot: 6 }),
      // boulders that swell and squeeze the channel
      mkShape('circle', 'solid', 560, 138, 50, 50, { pulse: 0.35, pulseT: 2.4 }),
      mkShape('circle', 'solid', 720, 338, 50, 50, { pulse: 0.35, pulseT: 3 }),
      mkShape('circle', 'solid', 560, 518, 50, 50, { pulse: 0.35, pulseT: 2 }),
    ]),

  'Ice Cream Climb': () =>
    pathStage('Ice Cream Climb', 'scene-icecream', 'candy', 700, [250, 70, 440, 100], [
      mkShape('rect', 'solid', 310, 460, 690, 22, { rot: -25.8, belt: 190 }), // uphill belt
      mkShape('rect', 'solid', 920, 420, 560, 20, { rot: 9 }),
    ]),

  'Watermill Wheel': () =>
    pathStage('Watermill Wheel', 'scene-mill', 'wood', 640, [640, 80, 900, 110], [
      mkShape('rect', 'solid', 290, 230, 600, 20, { rot: 11.5 }),
      mkShape('rect', 'solid', 990, 230, 600, 20, { rot: -11.5 }),
      mkShape('cross', 'solid', 640, 450, 300, 300, { t: 12, arms: 8, spin: 70 }), // the wheel meters marbles through
      mkShape('arc', 'solid', 640, 450, 334, 334, { t: 12, sweep: 136, rot: 180 }),
      mkShape('arc', 'solid', 640, 450, 334, 334, { t: 12, sweep: 136, rot: 0 }),
    ], true),

  Survival: () =>
    mkStage("Don't Fall Out", [
      mkShape('rect', 'spawn', W / 2, 300, 300, 160),
      mkShape('arc', 'solid', W / 2, 330, 580, 580, { t: 18, sweep: 325, rot: 90, spin: 40 }),
      mkShape('cross', 'solid', W / 2, 330, 180, 180, { t: 14, arms: 3, spin: -110 }),
      floor('kill'),
    ]),
};
