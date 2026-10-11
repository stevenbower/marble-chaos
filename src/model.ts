export type Kind = 'rect' | 'circle' | 'tri' | 'cross' | 'arc' | 'poly' | 'zig' | 'star' | 'lift';
/**
 * grow/shrink resize marbles passing through, fan pushes them along its arrow, portals come in pairs, boost flings
 * marbles along its arrow, slow is mud that drags on them.
 */
export type Role = 'solid' | 'finish' | 'kill' | 'spawn' | 'grow' | 'shrink' | 'fan' | 'portal' | 'boost' | 'slow';
/** How an eliminate zone finishes a marble off: burnt, drowned, dissolved, swallowed by a black hole, or zapped. */
export type Fate = 'lava' | 'water' | 'acid' | 'void' | 'zap';
export const FATES: [Fate, string][] = [['lava', 'Lava (burns up)'], ['water', 'Water (splash)'], ['acid', 'Acid (dissolves)'], ['void', 'Black hole (pulls marbles in)'], ['zap', 'Electric (zapped)']];

export interface Shape {
  id: string;
  kind: Kind;
  role: Role;
  x: number;
  y: number;
  w: number; // width, or diameter for circle/cross/arc
  h: number;
  rot: number; // degrees
  spin: number; // degrees per second, rotates about its center
  bounce: number;
  color: string; // '' = use the material; otherwise a flat colour
  skin?: string; // material key, '' = automatic
  t: number; // thickness (cross arms, arc)
  arms: number; // cross
  sweep: number; // arc, degrees
  skew: number; // tri apex offset, -1..1
  pts?: number[]; // poly, normalized to -0.5..0.5 of w/h
  mx?: number; // slides back and forth this far either side of its position...
  my?: number;
  mt?: number; // ...once every this many seconds
  pulse?: number; // circles and boxes: swells and shrinks by this fraction of its size...
  pulseT?: number; // ...once every this many seconds
  free?: boolean; // pinned at its centre but free to swing (seesaw, pinwheel)
  power?: number; // fan strength, boost launch speed, how hard mud drags or a black hole pulls
  fate?: Fate; // eliminate zones: what happens to the marble
  swing?: number; // rocks this many degrees either side of its rotation...
  swingT?: number; // ...once every this many seconds
  gate?: number; // blinks: solid (or deadly) for part of every this many seconds...
  duty?: number; // ...this fraction of the time (default half)
  belt?: number; // boxes: conveyor speed along the box, units/s (negative runs the other way); lifts: shelf speed
}

export interface Stage {
  id: string;
  name: string;
  w: number;
  h: number;
  walls: boolean;
  gravity: number;
  bg: string;
  bgTex?: string; // backdrop texture key, '' = plain colour
  skin?: string; // default material for obstacles
  elim: number; // marbles knocked out this stage
  elimPct: boolean; // elim is a percentage of marbles still in
  timeLimit: number; // seconds, 0 = none
  shapes: Shape[];
}

export interface Entrant {
  id: string;
  name: string;
  type: 'flag' | 'color' | 'image' | 'marble';
  code?: string;
  tex?: string; // marble texture key
  color?: string;
  img?: string; // data URL
}

export interface Project {
  name: string;
  stages: Stage[];
  entrants: Entrant[];
  perEntrant: number;
  radius: number;
  marbleBounce: number;
  loop: boolean; // cycle through the stages until one entrant is left
  mode?: 'race' | 'slots'; // slots: letters compete for marbles, the lowest-scoring letter goes out each round
  slotLabels?: string; // one slot per character, or comma-separated names
  slotBalls?: number; // marbles dropped per round in slots mode
  slotRadius?: number; // marble radius in slots mode, where a crowd of small marbles reads better
  seed: number;
  seedFixed?: boolean; // use `seed` so runs repeat exactly; otherwise every level draws a fresh seed from the clock
}

/** Marble race defaults: about 1500 small marbles between the stock entrants. */
export const RACE_PER_ENTRANT = 47, RACE_RADIUS = 8;

/** Letter slots defaults: a big crowd of small marbles. */
export const SLOT_BALLS = 2000, SLOT_RADIUS = 7;

export const uid = () => Math.random().toString(36).slice(2, 10);

export function mkShape(kind: Kind, role: Role, x: number, y: number, w: number, h: number, extra: Partial<Shape> = {}): Shape {
  return { id: uid(), kind, role, x, y, w, h, rot: 0, spin: 0, bounce: 0.3, color: '', t: 20, arms: 4, sweep: 270, skew: 0, ...extra };
}

export function mkStage(name: string, shapes: Shape[] = [], extra: Partial<Stage> = {}): Stage {
  return { id: uid(), name, w: 1280, h: 720, walls: true, gravity: 1, bg: '#000000', bgTex: 'grid', skin: 'steel', elim: 25, elimPct: true, timeLimit: 60, shapes, ...extra };
}

/** The random source for one level: repeatable when the project pins its seed, otherwise different every time. */
export const levelRng = (p: Project, round: number) => mulberry32(p.seedFixed ? p.seed + round * 7919 : (Date.now() ^ (Math.random() * 2 ** 32)) >>> 0);

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PALETTE: [string, string][] = [
  ['Red', '#e6194b'], ['Orange', '#f58231'], ['Yellow', '#ffe119'], ['Lime', '#bfef45'], ['Cyan', '#42d4f4'],
  ['Azure', '#3399ff'], ['Blue', '#2040e0'], ['Purple', '#911eb4'], ['Magenta', '#f032e6'], ['Maroon', '#800000'],
  ['Brown', '#9a6324'], ['Olive', '#808000'], ['Green', '#3cb44b'], ['Teal', '#469990'], ['Navy', '#000075'],
  ['Indigo', '#4b0082'], ['Violet', '#b57edc'], ['Salmon', '#fa8072'], ['Tan', '#d2b48c'], ['Cream', '#fffac8'],
  ['Mint', '#aaffc3'], ['Lavender', '#dcbeff'], ['Pink', '#fabed4'], ['White', '#ffffff'], ['Gray', '#a9a9a9'],
  ['Black', '#1a1a1a'], ['Gold', '#ffc400'], ['Crimson', '#b0002a'], ['Sky', '#8fd3ff'], ['Turquoise', '#00c9b1'],
  ['Coral', '#ff6f59'], ['Peach', '#ffcba4'], ['Plum', '#6b2d5c'], ['Chocolate', '#5c3317'], ['Forest', '#14592a'],
  ['Hot Pink', '#ff1493'], ['Chartreuse', '#7fff00'], ['Slate', '#5a6b7b'], ['Sand', '#e2c290'], ['Ruby', '#e0115f'],
];

/** Materials obstacles can be made of; textures live in public/tex. */
export const SKINS: [string, string][] = [
  ['steel', 'Steel'], ['stone', 'Stone'], ['wood', 'Wood'], ['ice', 'Ice'], ['neon', 'Neon circuit'], ['gold', 'Gold'],
  ['bumper', 'Bumper'], ['sand', 'Sandstone'], ['cloud', 'Cloud'], ['rainbow', 'Rainbow'],
  ['candy', 'Candy cane'], ['coral', 'Coral'], ['moon', 'Moon rock'], ['bamboo', 'Bamboo'],
  ['finish', 'Green energy'], ['lava', 'Lava'], ['water', 'Water'], ['acid', 'Acid'], ['flat', 'Flat colour'],
];
/** Keys starting `scene-` are full illustrations in public/bg; the rest are tiles in public/tex. */
export const BACKDROPS: [string, string][] = [
  ['', 'Plain colour'], ['grid', 'Hex floor'], ['space', 'Deep space'],
  ['scene-candy', 'Candy Land'], ['scene-ocean', 'Under the Sea'], ['scene-space', 'Outer Space'],
  ['scene-jungle', 'Jungle'], ['scene-snow', 'Snowy Night'], ['scene-dino', 'Dinosaur Valley'],
  ['scene-pirate', 'Pirate Cove'], ['scene-robot', 'Robot Workshop'], ['scene-farm', 'Farm'], ['scene-castle', 'Fairy Castle'],
  ['scene-spooky', 'Spooky Night'], ['scene-desert', 'Desert'], ['scene-circus', 'Circus'], ['scene-garden', 'Bug Garden'],
  ['scene-sky', 'Cloud Kingdom'], ['scene-toys', 'Playroom'],
  ['scene-cookie', 'Cookie Bakery'], ['scene-mine', 'Gold Mine'], ['scene-canyon', 'Canyon'], ['scene-icecream', 'Ice Cream Parlour'],
  ['scene-mill', 'Watermill'],
  ['scene-lavacave', 'Lava Cavern'], ['scene-sharks', 'Shark Bay'], ['scene-nebula', 'Black Hole'], ['scene-storm', 'Storm Tower'],
  ['scene-glacier', 'Ice Cave'], ['scene-mansion', 'Haunted Hall'], ['scene-arcade', 'Neon Arcade'], ['scene-dungeon', 'Dragon Dungeon'],
  ['scene-swamp', 'Swamp'], ['scene-launchpad', 'Launch Pad'], ['scene-hive', 'Beehive'], ['scene-factory', 'Toy Factory'],
  ['scene-lab', 'Mad Lab'], ['scene-temple', 'Jungle Temple'], ['scene-airship', 'Sky Pirates'],
];

/** Ready-made marble designs; textures live in public/marbles. */
export const MARBLES: [string, string][] = [
  ['catseye', "Cat's Eye"], ['galaxy', 'Galaxy'], ['lava', 'Lava'], ['emerald', 'Emerald'], ['tiger', "Tiger's Eye"],
  ['ocean', 'Ocean'], ['rainbow', 'Rainbow'], ['frost', 'Frost'], ['obsidian', 'Obsidian'], ['peppermint', 'Peppermint'],
  ['toxic', 'Toxic'], ['sunset', 'Sunset'], ['opal', 'Opal'], ['amethyst', 'Amethyst'], ['plasma', 'Plasma'],
  ['watermelon', 'Watermelon'], ['bumblebee', 'Bumblebee'], ['chrome', 'Chrome'],
];
