import './style.css';
import { COUNTRIES, countryName, flagUrl } from './flags';
import { D2R, boxH, hit, isRound, toLocal } from './geom';
import { BACKDROPS, MARBLES, PALETTE, SKINS, SLOT_BALLS, SLOT_RADIUS, mkShape, uid, type Entrant, type Kind, type Project, type Role, type Shape, type Stage } from './model';
import { Race } from './race';
import { drawHud, drawScene, drawSlotHud, handles, preload, type Cam } from './render';
import { ALPHABET, SlotGame, parseLabels } from './slots';
import { DT, initPhysics } from './sim';
import { thumb } from './sprites';
import { SLOT_LEVELS, TEMPLATES } from './templates';

const LS = 'marble-chaos:v1';
const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const flagEntrant = (code: string): Entrant => ({ id: 'f-' + code, name: countryName(code), type: 'flag', code });

function defaultProject(): Project {
  const codes = 'us gb fr de it es br ar mx ca jp kr cn in au za ng eg tr sa se no nl be pt gr pl ua ch ie nz cl'.split(' ');
  return {
    name: 'My Marble Race',
    stages: ['Plinko', 'Funnel', 'Zigzag', 'Survival'].map((k) => TEMPLATES[k]()),
    entrants: codes.map(flagEntrant),
    perEntrant: 1,
    radius: 14,
    marbleBounce: 0.4,
    loop: true,
    seed: 1,
  };
}

function load(): Project | null {
  try {
    const p = JSON.parse(localStorage.getItem(LS) ?? 'null');
    return p?.stages?.length ? p : null;
  } catch {
    return null;
  }
}

// ---------- state ----------
let project = load() ?? defaultProject();
let stageIdx = 0;
let selId: string | null = null;
let tool: 'select' | 'poly' = 'select';
let polyRole: Role = 'solid';
let poly: number[] = [];
let mouse: [number, number] = [0, 0];
let tab: 'props' | 'marbles' | 'standings' = 'props';
let race: Race | SlotGame | null = null;
let paused = false;
let speed = 1;
const cam: Cam = { x: 640, y: 360, z: 0.5 };

// Small screens swap the side panels for a single sheet; touch gets larger grab handles.
const compact = matchMedia('(max-width: 900px), (max-height: 500px)');
const coarse = matchMedia('(pointer: coarse)');
const sheet = (s: '' | 'left' | 'right') => (document.body.dataset.sheet = s);

const stage = (): Stage => project.stages[stageIdx];
const sel = (): Shape | null => stage().shapes.find((s) => s.id === selId) ?? null;

// ---------- undo ----------
const undo: string[] = [], redo: string[] = [];
let last = JSON.stringify(project);

function commit() {
  const s = JSON.stringify(project);
  if (s === last) return;
  undo.push(last);
  if (undo.length > 100) undo.shift();
  redo.length = 0;
  last = s;
  try {
    localStorage.setItem(LS, s);
  } catch {
    /* storage full (large logos): keep working in memory */
  }
}

function restore(s: string) {
  project = JSON.parse(s);
  last = s;
  stageIdx = Math.min(stageIdx, project.stages.length - 1);
  selId = null;
  renderAll();
}

function step(from: string[], to: string[]) {
  const s = from.pop();
  if (!s) return;
  to.push(last);
  restore(s);
  localStorage.setItem(LS, s);
}

// ---------- panels ----------
const num = (t: string, k: string, label: string, v: number, stepV = 1, cls = '') =>
  `<label class="${cls}">${label}<input type="number" data-t="${t}" data-k="${k}" value="${+(+v).toFixed(3)}" step="${stepV}"></label>`;
const check = (t: string, k: string, label: string, v: boolean) =>
  `<label class="check wide"><input type="checkbox" data-t="${t}" data-k="${k}" ${v ? 'checked' : ''}>${label}</label>`;

const pickList = (t: string, k: string, label: string, opts: [string, string][], v: string) =>
  `<label class="wide">${label}<select data-t="${t}" data-k="${k}">${opts.map(([val, name]) => `<option value="${val}" ${val === v ? 'selected' : ''}>${name}</option>`).join('')}</select></label>`;

function renderLeft() {
  renderFab();
  const st = project.stages
    .map(
      (s, i) => `<div class="stage ${i === stageIdx ? 'cur' : ''}" data-act="stage" data-i="${i}">
        <span>${i + 1}. ${esc(s.name)}</span>
        <button data-act="st-up" data-i="${i}" title="Move up">↑</button><button data-act="st-dup" data-i="${i}" title="Duplicate">⎘</button><button data-act="st-del" data-i="${i}" title="Delete">✕</button>
      </div>`,
    )
    .join('');
  const add = (label: string, preset: string) =>
    `<button data-act="add" data-preset="${preset}" class="${tool === 'poly' && preset === 'polygon' ? 'sel' : ''}">${label}</button>`;
  $('#left').innerHTML = `
    <h4>Stages</h4>${st}
    <div class="row"><select id="tpl">${Object.keys(TEMPLATES).map((k) => `<option>${k}</option>`).join('')}</select><button data-act="st-add">+ Add</button></div>
    <h4>Obstacles</h4>
    <div class="pal">${add('▬ Wall', 'wall')}${add('● Peg', 'peg')}${add('▲ Wedge', 'wedge')}${add('✚ Spinner', 'spinner')}${add('◠ Arc', 'arc')}${add('⬠ Polygon', 'polygon')}${add('★ Star', 'star')}${add('〰 Zigzag', 'zigzag')}</div>
    <h4>Lively bits</h4>
    <div class="pal">${add('◉ Bumper', 'bumper')}${add('▬ Trampoline', 'trampoline')}${add('⚖ Seesaw', 'seesaw')}${add('✣ Pinwheel', 'pinwheel')}${add('⇄ Slider', 'slider')}${add('◎ Pulser', 'pulser')}${add('➠ Conveyor', 'conveyor')}${add('⇪ Bucket lift', 'lift')}</div>
    <h4>Zones</h4>
    <div class="pal">${add('Finish', 'finish')}${add('Eliminate', 'kill')}${add('Spawn area', 'spawn')}${add('＋ Grow', 'grow')}${add('－ Shrink', 'shrink')}${add('⇧ Fan', 'fan')}${add('◍ Portals', 'portal')}</div>
    <p class="hint">${
      tool === 'poly'
        ? 'Click to place points. Enter or double-click to close the polygon, Esc to cancel.'
        : 'Drag shapes to move, corners to resize, the round handle to rotate. Drag empty space to pan, scroll to zoom. Hold Alt to disable snapping.<br><br>Del removes, Ctrl+D duplicates, arrows nudge.'
    }</p>`;
}

function propsHtml() {
  const s = sel();
  if (!s) {
    const st = stage();
    return `<h4>Stage</h4><div class="grid">
      <label class="wide">Name<input data-t="stage" data-k="name" value="${esc(st.name)}"></label>
      ${num('stage', 'w', 'Width', st.w, 10)}${num('stage', 'h', 'Height', st.h, 10)}
      ${num('stage', 'gravity', 'Gravity', st.gravity, 0.1)}
      <label>Background<input type="color" data-t="stage" data-k="bg" value="${st.bg}"></label>
      ${pickList('stage', 'bgTex', 'Backdrop', BACKDROPS, st.bgTex ?? '')}
      ${pickList('stage', 'skin', 'Obstacle material', SKINS.filter(([k]) => k !== 'finish' && k !== 'lava'), st.skin || 'steel')}
      ${check('stage', 'walls', 'Side walls', st.walls)}
    </div>
    <h4>Stage rules</h4><div class="grid">
      ${num('stage', 'elim', st.elimPct ? 'Eliminate (%)' : 'Eliminate (marbles)', st.elim)}
      ${num('stage', 'timeLimit', 'Time limit (s)', st.timeLimit)}
      ${check('stage', 'elimPct', 'As a percentage of marbles left', st.elimPct)}
    </div>
    <p class="hint">Marbles are safe when they reach a <b style="color:#1fe01f">finish</b> zone. A stage ends once enough are safe (the stragglers are eliminated), or once enough have hit an <b style="color:#e01212">eliminate</b> zone or fallen off the stage. Set eliminate to 1 for a "last one out" race.</p>`;
  }
  const round = isRound(s), zone = s.role !== 'solid', solid = !zone;
  const title: Record<Kind, string> = { rect: 'Box', circle: 'Circle', tri: 'Wedge', cross: 'Spinner', arc: 'Arc', poly: 'Polygon', zig: 'Zigzag', star: 'Star', lift: 'Bucket lift' };
  const roles: [Role, string][] = [['solid', 'Solid obstacle'], ['finish', 'Finish zone (safe)'], ['kill', 'Eliminate zone'], ['spawn', 'Spawn area'], ['grow', 'Grow zone (bigger marbles)'], ['shrink', 'Shrink zone (smaller marbles)'], ['fan', 'Fan (blows along its arrows)'], ['portal', 'Portal (pairs up in order)']];
  return `<h4>${title[s.kind]}</h4><div class="grid">
    ${pickList('shape', 'role', 'Acts as', roles, s.role)}
    ${num('shape', 'x', 'X', s.x)}${num('shape', 'y', 'Y', s.y)}
    ${num('shape', 'w', round ? 'Diameter' : 'Width', s.w)}${round ? '' : num('shape', 'h', 'Height', s.h)}
    ${num('shape', 'rot', 'Rotation°', s.rot)}
    ${zone ? '' : num('shape', 'bounce', 'Bounciness', s.bounce, 0.1)}
    ${s.role === 'fan' ? num('shape', 'power', 'Fan power', s.power ?? 40, 5) : ''}
    ${solid && s.kind === 'rect' ? num('shape', 'belt', 'Conveyor speed (0 = off)', s.belt ?? 0, 10) : ''}
    ${s.kind === 'lift' ? num('shape', 'belt', 'Lift speed', s.belt ?? 120, 10) + num('shape', 'skew', 'Tips out (-1 left, 1 right)', s.skew, 1) : ''}
    ${s.kind === 'cross' || s.kind === 'arc' || s.kind === 'zig' ? num('shape', 't', 'Thickness', s.t) : ''}
    ${s.kind === 'cross' || s.kind === 'zig' || s.kind === 'star' || s.kind === 'lift' ? num('shape', 'arms', s.kind === 'cross' ? 'Arms' : s.kind === 'star' ? 'Points' : s.kind === 'lift' ? 'Shelves' : 'Strokes', s.arms) : ''}
    ${s.kind === 'arc' ? num('shape', 'sweep', 'Sweep°', s.sweep, 5) : ''}
    ${s.kind === 'tri' ? num('shape', 'skew', 'Apex (-1..1)', s.skew, 0.25) : ''}
    ${s.role === 'spawn' ? '' : pickList('shape', 'skin', 'Material', [['', 'Automatic'], ...SKINS], s.skin ?? '')}
    <label>Flat colour<span class="row" style="margin:0"><input type="color" data-t="shape" data-k="color" value="${s.color || '#6e6e6e'}"><button data-act="nocolor">Auto</button></span></label>
  </div>
  ${
    s.role === 'spawn'
      ? ''
      : `<h4>Motion</h4><div class="grid">
    ${num('shape', 'spin', 'Spin °/s', s.spin, 10)}${num('shape', 'mt', 'Slide every (s)', s.mt ?? 3, 0.5)}
    ${num('shape', 'mx', 'Slide ↔ distance', s.mx ?? 0, 10)}${num('shape', 'my', 'Slide ↕ distance', s.my ?? 0, 10)}
    ${solid && (s.kind === 'circle' || s.kind === 'rect') ? num('shape', 'pulse', 'Pulse size (0–0.9)', s.pulse ?? 0, 0.1) + num('shape', 'pulseT', 'Pulse every (s)', s.pulseT ?? 2, 0.5) : ''}
    ${solid ? check('shape', 'free', 'Pinned, swings freely (seesaw / pinwheel)', !!s.free) : ''}
  </div>`
  }
  <div class="row"><button data-act="dup">Duplicate</button><button data-act="front">To front</button><button data-act="back">To back</button><button data-act="del">Delete</button></div>`;
}

function marblesHtml() {
  const p = project;
  const slots = p.mode === 'slots';
  const game = `<h4>Game</h4><div class="grid">
      ${pickList('project', 'mode', 'Who competes', [['race', 'Marbles: last one standing'], ['slots', 'Letter slots: fewest marbles is out']], p.mode ?? 'race')}
      ${
        slots
          ? `<label class="wide">Slots (letters, or names split by commas)<input data-t="project" data-k="slotLabels" value="${esc(p.slotLabels ?? ALPHABET)}"></label>
             ${num('project', 'slotBalls', 'Marbles per round', p.slotBalls ?? SLOT_BALLS, 100)}${num('project', 'slotRadius', 'Marble radius', p.slotRadius ?? SLOT_RADIUS)}
             <button data-act="slot-levels" class="wide">Load all the themed levels</button>`
          : ''
      }
    </div>
    ${slots ? `<p class="hint">Every stage gets a strip of slots along the floor. Each round the slot that catches the fewest marbles is eliminated, until one is left. The entrants below only set what the marbles look like.</p>` : ''}`;
  return `${game}<h4>Marbles</h4><div class="grid">
      ${slots ? '' : num('project', 'perEntrant', 'Per entrant', p.perEntrant) + num('project', 'radius', 'Radius', p.radius)}
      ${num('project', 'marbleBounce', 'Bounciness', p.marbleBounce, 0.1)}${p.seedFixed ? num('project', 'seed', 'Seed', p.seed) : ''}
      ${check('project', 'seedFixed', 'Fixed seed (every run plays out the same)', !!p.seedFixed)}
      ${slots ? '' : check('project', 'loop', 'Repeat stages until one is left', p.loop)}
    </div>
    <h4>Entrants (${p.entrants.length})</h4>
    <div class="row"><button data-act="countries">Countries…</button><button data-act="marbles">+ Marbles</button><button data-act="logos">+ Logos</button></div>
    <div class="row"><button data-act="colors">+ Colors</button><input type="color" id="cc" value="#ff5500"><button data-act="color1">+ This color</button></div>
    <div class="row"><input type="number" id="rn" value="50" min="2" max="${COUNTRIES.length}" style="width:64px"><button data-act="random">Random countries</button><button data-act="clear">Clear</button></div>
    ${p.entrants
      .map((e, i) => `<div class="ent">${thumb(e)}<input data-t="ent" data-i="${i}" data-k="name" value="${esc(e.name)}"><button data-act="ent-del" data-i="${i}">✕</button></div>`)
      .join('')}`;
}

function standingsHtml() {
  if (!race) return `<p class="hint">Run a tournament to see live standings here.</p>`;
  if (race instanceof SlotGame) {
    const s = race;
    const row = (label: string, right: string | number, gone = false) =>
      `<div class="ent ${gone ? 'gone' : ''}"><span class="th slot">${esc(label.slice(0, 2))}</span><span class="n">${esc(label)}</span><span class="pl">${right}</span></div>`;
    const out = [...s.gone].reverse().map((l, i) => row(l, s.labels.length + 1 + i + '.', true)).join('');
    if (s.phase === 'done' && !s.single) return `<h4>Final standings</h4>${row(s.winner, '1.')}${out}`;
    const live = s.labels.map((l, i) => ({ l, c: s.counts[i] ?? 0 })).sort((a, b) => b.c - a.c);
    return `<h4>Round ${s.round} · ${esc(s.stage.name)}</h4>
      <p class="hint" style="margin:0 0 8px">${s.sim.live} falling · ${s.lost} lost</p>
      ${live.map((x) => row(x.l, x.c)).join('')}${out}`;
  }
  const r = race, ent = project.entrants;
  const row = (e: number, right: string, gone = false) =>
    `<div class="ent ${gone ? 'gone' : ''}">${thumb(ent[e])}<span class="n">${esc(ent[e].name)}</span><span class="pl">${right}</span></div>`;
  if (r.phase === 'done') return `<h4>Final standings</h4>` + r.results.map((x) => row(x.e, x.place + '.', x.place > 1)).join('');
  const inRace = r.counts.map((c, e) => ({ c, e })).filter((x) => x.c > 0).sort((a, b) => b.c - a.c);
  return `<h4>Round ${r.round} · ${esc(r.stage.name)}</h4>
    <p class="hint" style="margin:0 0 8px">${r.sim.live} racing · ${r.safes} safe · ${r.outs}/${r.quota} eliminated</p>
    ${inRace.map((x) => row(x.e, project.perEntrant > 1 ? '×' + x.c : '')).join('')}
    ${[...r.placed].reverse().map((x) => row(x.e, x.place + '.', true)).join('')}`;
}

/** Floating canvas buttons standing in for keyboard shortcuts and double-click. */
function renderFab() {
  $('#fab').innerHTML = race
    ? document.body.classList.contains('full')
      ? `<button data-act="pause">Pause</button><button data-act="full">Exit full screen</button><button data-act="stop">Stop</button>`
      : ''
    : tool === 'poly'
      ? `<button data-act="poly-done" class="primary">Close shape</button><button data-act="poly-cancel">Cancel</button>`
      : sel()
        ? `<button data-act="props" class="mob">Edit</button><button data-act="dup" class="mob">Duplicate</button><button data-act="del" class="mob">Delete</button>`
        : '';
}

function renderRight() {
  renderFab();
  const t = (id: typeof tab, label: string) => `<button data-act="tab" data-tab="${id}" class="${tab === id ? 'cur' : ''}">${label}</button>`;
  $('#right').innerHTML =
    `<div class="tabs">${t('props', sel() ? 'Shape' : 'Stage')}${t('marbles', 'Marbles')}${t('standings', 'Standings')}</div>` +
    (tab === 'props' ? propsHtml() : tab === 'marbles' ? marblesHtml() : standingsHtml());
}

function renderAll() {
  ($('#pname') as HTMLInputElement).value = project.name;
  $<HTMLSelectElement>('#mode').value = project.mode ?? 'race';
  renderLeft();
  renderRight();
}

// ---------- editing ----------
const snap = (v: number, e?: { altKey: boolean }) => (e?.altKey ? v : Math.round(v / 10) * 10);

function select(id: string | null) {
  if (selId === id) return;
  selId = id;
  if (id) tab = 'props';
  renderRight();
}

type Preset = [kind: Kind, role: Role, w: number, h: number, extra?: Partial<Shape>];
const PRESETS: Record<string, Preset> = {
  wall: ['rect', 'solid', 240, 24],
  peg: ['circle', 'solid', 40, 40],
  wedge: ['tri', 'solid', 160, 100],
  spinner: ['cross', 'solid', 180, 180, { spin: 120 }],
  arc: ['arc', 'solid', 300, 300, { sweep: 180, rot: 90 }],
  star: ['star', 'solid', 90, 90, { arms: 5, bounce: 0.8 }],
  zigzag: ['zig', 'solid', 320, 70, { arms: 6, t: 14 }],
  bumper: ['circle', 'solid', 60, 60, { bounce: 1.7, skin: 'bumper' }],
  trampoline: ['rect', 'solid', 170, 16, { bounce: 1.6, skin: 'bumper' }],
  seesaw: ['rect', 'solid', 260, 16, { free: true }],
  pinwheel: ['cross', 'solid', 190, 190, { free: true, t: 14, arms: 3 }],
  slider: ['rect', 'solid', 180, 20, { mx: 160, mt: 3 }],
  pulser: ['circle', 'solid', 60, 60, { pulse: 0.5, pulseT: 2 }],
  conveyor: ['rect', 'solid', 320, 22, { belt: 150 }],
  lift: ['lift', 'solid', 150, 420, { arms: 4, belt: 140, skew: 1 }],
  finish: ['rect', 'finish', 240, 24],
  kill: ['rect', 'kill', 240, 24],
  spawn: ['rect', 'spawn', 400, 100],
  grow: ['circle', 'grow', 90, 90],
  shrink: ['circle', 'shrink', 90, 90],
  fan: ['rect', 'fan', 120, 220, { power: 40 }],
  portal: ['circle', 'portal', 70, 70],
};

function addShape(preset: string) {
  const [kind, role, w, h, extra] = PRESETS[preset];
  const x = snap(Math.max(60, Math.min(stage().w - 60, cam.x))), y = snap(Math.max(40, Math.min(stage().h - 40, cam.y)));
  const s = mkShape(kind, role, x, y, w, h, extra);
  stage().shapes.push(s);
  if (preset === 'portal') stage().shapes.push(mkShape(kind, role, x + 160, y + 120, w, h, extra)); // they only work in pairs
  commit();
  select(s.id);
}

function closePoly() {
  if (poly.length >= 6) {
    const xs = poly.filter((_, i) => i % 2 === 0), ys = poly.filter((_, i) => i % 2 === 1);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const w = Math.max(10, x1 - x0), h = Math.max(10, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const s = mkShape('poly', polyRole, cx, cy, w, h, { pts: poly.map((v, i) => (i % 2 ? (v - cy) / h : (v - cx) / w)) });
    stage().shapes.push(s);
    commit();
    selId = s.id;
    tab = 'props';
  }
  poly = [];
  tool = 'select';
  renderAll();
}

function cancelPoly() {
  poly = [];
  tool = 'select';
  select(null);
  renderLeft();
}

function removeSel() {
  const st = stage();
  st.shapes = st.shapes.filter((s) => s.id !== selId);
  selId = null;
  commit();
  renderRight();
}

function duplicateSel() {
  const s = sel();
  if (!s) return;
  const c = { ...structuredClone(s), id: uid(), x: s.x + 30, y: s.y + 30 };
  stage().shapes.push(c);
  commit();
  select(c.id);
}

function reorder(front: boolean) {
  const s = sel(), list = stage().shapes;
  if (!s) return;
  list.splice(list.indexOf(s), 1);
  front ? list.push(s) : list.unshift(s);
  commit();
}

// ---------- entrants ----------
function countryDialog() {
  const have = new Set(project.entrants.filter((e) => e.type === 'flag').map((e) => e.code));
  const dlg = $<HTMLDialogElement>('#dlg');
  dlg.innerHTML = `<h3>Countries</h3>
    <div class="row"><input id="csearch" placeholder="Search…" style="flex:1"><button data-act="c-all">Select shown</button><button data-act="c-none">Clear shown</button></div>
    <div class="cgrid">${COUNTRIES.map(
      (c) => `<label data-n="${esc(c.name.toLowerCase())}"><input type="checkbox" value="${c.code}" ${have.has(c.code) ? 'checked' : ''}><img class="th" loading="lazy" src="${flagUrl(c.code)}">${esc(c.name)}</label>`,
    ).join('')}</div>
    <div class="row end"><button data-act="c-cancel">Cancel</button><button data-act="c-done" class="primary">Done</button></div>`;
  dlg.showModal();
  $<HTMLInputElement>('#csearch').oninput = (e) => {
    const q = (e.target as HTMLInputElement).value.toLowerCase();
    dlg.querySelectorAll<HTMLElement>('.cgrid label').forEach((l) => (l.hidden = !l.dataset.n!.includes(q)));
  };
}

function setCountries(codes: string[]) {
  const keep = new Set(codes);
  const have = new Set<string>();
  project.entrants = project.entrants.filter((e) => e.type !== 'flag' || (keep.has(e.code!) && have.add(e.code!)));
  for (const c of codes) if (!have.has(c)) project.entrants.push(flagEntrant(c));
  commit();
  renderRight();
}

function addColors() {
  const used = new Set(project.entrants.map((e) => e.color));
  const free = PALETTE.filter(([, c]) => !used.has(c)).slice(0, 8);
  if (!free.length) return;
  for (const [name, color] of free) project.entrants.push({ id: uid(), name, type: 'color', color });
  commit();
  renderRight();
}

async function addLogos(files: File[]) {
  for (const f of files) {
    const img = new Image();
    img.src = URL.createObjectURL(f);
    await img.decode().catch(() => {});
    if (!img.naturalWidth) continue;
    // centre-crop to a small square so projects stay small enough to autosave
    const c = document.createElement('canvas'), n = 128, m = Math.min(img.naturalWidth, img.naturalHeight);
    c.width = c.height = n;
    c.getContext('2d')!.drawImage(img, (img.naturalWidth - m) / 2, (img.naturalHeight - m) / 2, m, m, 0, 0, n, n);
    URL.revokeObjectURL(img.src);
    project.entrants.push({ id: uid(), name: f.name.replace(/\.[^.]+$/, ''), type: 'image', img: c.toDataURL('image/png') });
  }
  commit();
  renderRight();
}

function loadSlotLevels(question: string) {
  if (!confirm(question)) return;
  project.stages = SLOT_LEVELS.map((t) => TEMPLATES[t]());
  stageIdx = 0;
  selId = null;
  commit();
  renderAll();
  fit();
}

// ---------- running ----------
async function start(single: boolean) {
  const slots = project.mode === 'slots';
  if (slots ? !project.entrants.length || parseLabels(project.slotLabels).length < 2 : project.entrants.length < 2) {
    tab = 'marbles';
    renderRight();
    return alert(slots ? 'Slots mode needs at least two slots and one kind of marble.' : 'Add at least two entrants first.');
  }
  if (!$('#loading').hidden) return; // already starting
  // Have every backdrop, material and marble face in hand before the first marble drops.
  const single1 = single ? [stage()] : project.stages;
  $('#loading').hidden = false;
  await Promise.all([initPhysics(), Promise.race([preload(single1, project), new Promise((r) => setTimeout(r, 15000))])]);
  $('#loading').hidden = true;
  tool = 'select';
  poly = [];
  race = slots ? new SlotGame(project, single ? stageIdx : 0, single) : new Race(project, single ? stageIdx : 0, single);
  paused = false;
  acc = 0;
  tab = 'standings';
  if (compact.matches) sheet(innerHeight > innerWidth ? 'right' : '');
  renderAll();
}

function stop() {
  setFull(false);
  race = null;
  paused = false;
  tab = 'props';
  renderAll();
}

/** Hide the app chrome so the race fills the window, and use the browser's real full screen where it has one. */
function setFull(on: boolean) {
  if (document.body.classList.contains('full') === on) return;
  document.body.classList.toggle('full', on);
  // iPhone Safari has no element full screen; there the chrome-free layout is all we can do.
  if (on) document.documentElement.requestFullscreen?.().catch(() => {});
  else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  renderFab();
}
document.addEventListener('fullscreenchange', () => document.fullscreenElement || setFull(false)); // left via Esc or a swipe

let recorder: MediaRecorder | null = null;
function toggleRec() {
  const btn = $('#rec');
  if (recorder) {
    recorder.stop();
    return;
  }
  const chunks: Blob[] = [];
  // Safari records MP4 rather than WebM.
  const type = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
  recorder = new MediaRecorder(cv.captureStream(60), { mimeType: type || undefined, videoBitsPerSecond: 12_000_000 });
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.onstop = () => {
    const mime = (recorder?.mimeType || type || 'video/webm').split(';')[0];
    download(new Blob(chunks, { type: mime }), `${project.name}.${mime.endsWith('mp4') ? 'mp4' : 'webm'}`);
    recorder = null;
    btn.classList.remove('on');
    btn.textContent = '● Rec';
  };
  recorder.start();
  btn.classList.add('on');
  btn.textContent = '■ Stop rec';
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- actions ----------
let fileMode: 'import' | 'logos' = 'import';
const file = $<HTMLInputElement>('#file');
function pick(mode: typeof fileMode) {
  fileMode = mode;
  file.accept = mode === 'import' ? '.json,application/json' : 'image/*';
  file.multiple = mode === 'logos';
  file.value = '';
  file.click();
}
file.onchange = async () => {
  const files = [...(file.files ?? [])];
  if (!files.length) return;
  if (fileMode === 'logos') return addLogos(files);
  try {
    const p = JSON.parse(await files[0].text());
    if (!Array.isArray(p.stages) || !p.stages.length || !Array.isArray(p.entrants)) throw new Error('not a Marble Chaos project');
    project = p;
    stageIdx = 0;
    selId = null;
    commit();
    renderAll();
    fit();
  } catch (e) {
    alert('Could not import: ' + (e as Error).message);
  }
};

const actions: Record<string, (el: HTMLElement) => void> = {
  run: () => start(false),
  test: () => start(true),
  pause: () => (paused = !paused),
  stop,
  rec: toggleRec,
  full: async () => {
    if (!race) await start(false);
    if (race) setFull(!document.body.classList.contains('full'));
  },
  undo: () => step(undo, redo),
  redo: () => step(redo, undo),
  fit,
  export: () => download(new Blob([JSON.stringify(project, null, 1)], { type: 'application/json' }), `${project.name}.json`),
  import: () => pick('import'),
  new: () => {
    if (!confirm('Start a new project? The current one can be restored with Undo.')) return;
    project = defaultProject();
    stageIdx = 0;
    selId = null;
    commit();
    renderAll();
    fit();
  },
  tab: (el) => {
    tab = el.dataset.tab as typeof tab;
    renderRight();
  },
  stage: (el) => {
    stageIdx = +el.dataset.i!;
    selId = null;
    poly = [];
    renderAll();
    fit();
  },
  'st-add': () => {
    const tpl = $<HTMLSelectElement>('#tpl').value;
    project.stages.push(TEMPLATES[tpl]());
    if (tpl.startsWith('Slot ')) project.mode = 'slots'; // a slot stage is no use without the strip
    stageIdx = project.stages.length - 1;
    selId = null;
    commit();
    renderAll();
    fit();
  },
  'st-up': (el) => {
    const i = +el.dataset.i!;
    if (!i) return;
    const l = project.stages;
    [l[i - 1], l[i]] = [l[i], l[i - 1]];
    if (stageIdx === i) stageIdx--;
    else if (stageIdx === i - 1) stageIdx++;
    commit();
    renderLeft();
  },
  'st-dup': (el) => {
    const i = +el.dataset.i!, c = structuredClone(project.stages[i]);
    c.id = uid();
    c.name += ' copy';
    c.shapes.forEach((s) => (s.id = uid()));
    project.stages.splice(i + 1, 0, c);
    stageIdx = i + 1;
    selId = null;
    commit();
    renderAll();
  },
  'st-del': (el) => {
    if (project.stages.length < 2) return;
    project.stages.splice(+el.dataset.i!, 1);
    stageIdx = Math.min(stageIdx, project.stages.length - 1);
    selId = null;
    commit();
    renderAll();
  },
  add: (el) => {
    const preset = el.dataset.preset!;
    if (preset === 'polygon') {
      tool = tool === 'poly' ? 'select' : 'poly';
      polyRole = 'solid';
      poly = [];
      select(null);
      if (compact.matches) sheet(''); // get the sheet out of the way of the canvas
      renderLeft();
    } else {
      addShape(preset);
      if (compact.matches) sheet('');
    }
  },
  sheet: (el) => {
    const s = el.dataset.s as 'left' | 'right';
    sheet(document.body.dataset.sheet === s ? '' : s);
  },
  props: () => {
    tab = 'props';
    sheet('right');
    renderRight();
  },
  'poly-done': closePoly,
  'poly-cancel': cancelPoly,
  'slot-levels': () => loadSlotLevels('Replace the current stages with all the themed levels? Undo brings them back.'),
  dup: duplicateSel,
  del: removeSel,
  front: () => reorder(true),
  back: () => reorder(false),
  nocolor: () => {
    const s = sel();
    if (s) s.color = '';
    commit();
    renderRight();
  },
  countries: countryDialog,
  colors: addColors,
  color1: () => {
    const color = $<HTMLInputElement>('#cc').value;
    project.entrants.push({ id: uid(), name: PALETTE.find(([, c]) => c === color)?.[0] ?? color.toUpperCase(), type: 'color', color });
    commit();
    renderRight();
  },
  marbles: () => {
    const used = new Set(project.entrants.map((e) => e.tex));
    for (const [tex, name] of MARBLES.filter(([k]) => !used.has(k)).slice(0, 6)) project.entrants.push({ id: uid(), name, type: 'marble', tex });
    commit();
    renderRight();
  },
  logos: () => pick('logos'),
  random: () => {
    const n = Math.max(2, Math.min(COUNTRIES.length, +$<HTMLInputElement>('#rn').value || 0));
    const pool = COUNTRIES.map((c) => c.code);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setCountries(pool.slice(0, n));
  },
  clear: () => {
    project.entrants = [];
    commit();
    renderRight();
  },
  'ent-del': (el) => {
    project.entrants.splice(+el.dataset.i!, 1);
    commit();
    renderRight();
  },
  'c-all': () => document.querySelectorAll<HTMLInputElement>('.cgrid label:not([hidden]) input').forEach((i) => (i.checked = true)),
  'c-none': () => document.querySelectorAll<HTMLInputElement>('.cgrid label:not([hidden]) input').forEach((i) => (i.checked = false)),
  'c-cancel': () => $<HTMLDialogElement>('#dlg').close(),
  'c-done': () => {
    setCountries([...document.querySelectorAll<HTMLInputElement>('.cgrid input:checked')].map((i) => i.value));
    $<HTMLDialogElement>('#dlg').close();
  },
};

const EDITS = new Set(['slot-levels', 'props', 'poly-done', 'poly-cancel', 'undo', 'redo', 'new', 'import', 'st-add', 'st-up', 'st-dup', 'st-del', 'add', 'dup', 'del', 'front', 'back', 'nocolor', 'countries', 'colors', 'color1', 'marbles', 'logos', 'random', 'clear', 'ent-del']);

document.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!el) return;
  const act = el.dataset.act!;
  if (race && (EDITS.has(act) || act === 'stage')) return; // the project is frozen while a race runs
  actions[act]?.(el);
});

function bound(el: HTMLInputElement): Record<string, unknown> | null {
  const t = el.dataset.t;
  if (!t || race) return null;
  return (t === 'shape' ? sel() : t === 'stage' ? stage() : t === 'ent' ? project.entrants[+el.dataset.i!] : project) as never;
}
document.addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement, o = bound(el);
  if (!o) return;
  o[el.dataset.k!] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? parseFloat(el.value) || 0 : el.value;
});
document.addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id === 'speed') speed = +el.value;
  if (!bound(el)) return;
  const s = sel();
  if (s) {
    s.w = Math.max(4, s.w);
    s.h = Math.max(4, s.h);
    s.arms = Math.max(1, Math.min(12, Math.round(s.arms)));
    s.sweep = Math.max(5, Math.min(360, s.sweep));
    s.t = Math.max(2, s.t);
  }
  project.radius = Math.max(3, Math.min(60, project.radius));
  project.perEntrant = Math.max(1, Math.min(200, Math.round(project.perEntrant)));
  if (project.slotBalls != null) project.slotBalls = Math.max(1, Math.min(5000, Math.round(project.slotBalls)));
  if (project.slotRadius != null) project.slotRadius = Math.max(3, Math.min(60, project.slotRadius));
  const k = el.dataset.k!;
  if (s && el.dataset.t === 'shape' && k === 'skin') s.color = ''; // a flat colour would hide the material just chosen
  commit();
  // Re-render only where the change alters what is shown, so tabbing between fields keeps focus.
  if (el.dataset.t === 'stage' && k === 'name') renderLeft();
  if (k === 'mode' && project.mode === 'slots') loadSlotLevels('Swap in the themed levels built for the slot strip?\n\nThe stock stages funnel marbles into a few slots. Cancel keeps your stages; Undo brings them back.');
  if (k === 'mode') $<HTMLSelectElement>('#mode').value = project.mode ?? 'race';
  if (k === 'role' || k === 'elimPct' || k === 'skin' || k === 'mode' || k === 'free' || k === 'seedFixed') renderRight();
});

// ---------- canvas ----------
const cv = $<HTMLCanvasElement>('#cv');
const g = cv.getContext('2d')!;
let cw = 0, ch = 0;

function resize() {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  cw = w;
  ch = h;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function fitTo(st: Stage, c: Cam, margin: number) {
  c.z = Math.max(0.05, Math.min((cw - margin) / st.w, (ch - margin) / st.h));
  c.x = st.w / 2;
  c.y = st.h / 2;
}
function fit() {
  resize();
  fitTo(stage(), cam, 80);
}

const world = (sx: number, sy: number): [number, number] => [(sx - cw / 2) / cam.z + cam.x, (sy - ch / 2) / cam.z + cam.y];

type Drag = { mode: 'pan' | 'move' | 'resize' | 'rotate' | 'poly'; sx: number; sy: number; ox: number; oy: number };
let drag: Drag | null = null;

// Two fingers pinch-zoom and pan the editor view.
const touches = new Map<number, [number, number]>();
let pinch: { d: number; mx: number; my: number } | null = null;
function measure() {
  const [a, b] = [...touches.values()];
  return { d: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
}

function endDrag() {
  if (drag && drag.mode !== 'pan' && drag.mode !== 'poly') {
    commit();
    renderRight();
  }
  drag = null;
}

cv.addEventListener('pointerdown', (e) => {
  if (race) return;
  cv.setPointerCapture(e.pointerId);
  touches.set(e.pointerId, [e.offsetX, e.offsetY]);
  if (touches.size === 2) {
    endDrag();
    pinch = measure();
    return;
  }
  if (touches.size > 2) return;
  const touch = e.pointerType === 'touch';
  const [wx, wy] = world(e.offsetX, e.offsetY);
  mouse = [wx, wy];
  const pan = (): Drag => ({ mode: 'pan', sx: e.offsetX, sy: e.offsetY, ox: cam.x, oy: cam.y });
  if (e.button !== 0) return void (drag = pan());
  // Polygon points are placed on release, so a pinch that starts with one finger doesn't drop a stray point.
  if (tool === 'poly') return void (drag = { mode: 'poly', sx: e.offsetX, sy: e.offsetY, ox: 0, oy: 0 });
  const s = sel();
  if (s) {
    const hs = coarse.matches ? 1.6 : 1, reach = (touch ? 24 : 9) / cam.z;
    const h = handles(s, cam.z / hs), near = (p: number[]) => Math.hypot(p[0] - wx, p[1] - wy) < reach;
    if (near(h.rot)) return void (drag = { mode: 'rotate', sx: wx, sy: wy, ox: 0, oy: 0 });
    if (h.corners.some(near)) return void (drag = { mode: 'resize', sx: wx, sy: wy, ox: 0, oy: 0 });
  }
  const top = [...stage().shapes].reverse().find((sh) => hit(sh, wx, wy, sh.rot * D2R, (touch ? 12 : 4) / cam.z));
  if (top) {
    select(top.id);
    drag = { mode: 'move', sx: wx, sy: wy, ox: top.x, oy: top.y };
  } else {
    select(null);
    drag = pan();
  }
});

cv.addEventListener('pointermove', (e) => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, [e.offsetX, e.offsetY]);
  if (pinch && touches.size === 2) {
    const m = measure(), [wx, wy] = world(pinch.mx, pinch.my);
    cam.z = Math.max(0.05, Math.min(8, (cam.z * m.d) / pinch.d));
    cam.x = wx - (m.mx - cw / 2) / cam.z;
    cam.y = wy - (m.my - ch / 2) / cam.z;
    pinch = m;
    return;
  }
  mouse = world(e.offsetX, e.offsetY);
  if (!drag || drag.mode === 'poly') return;
  const [wx, wy] = mouse, s = sel();
  if (drag.mode === 'pan') {
    cam.x = drag.ox - (e.offsetX - drag.sx) / cam.z;
    cam.y = drag.oy - (e.offsetY - drag.sy) / cam.z;
  } else if (!s) {
    return;
  } else if (drag.mode === 'move') {
    s.x = snap(drag.ox + wx - drag.sx, e);
    s.y = snap(drag.oy + wy - drag.sy, e);
  } else if (drag.mode === 'resize') {
    const [lx, ly] = toLocal(s, wx, wy, s.rot * D2R);
    if (isRound(s)) s.w = s.h = Math.max(10, snap(2 * Math.max(Math.abs(lx), Math.abs(ly)), e));
    else {
      s.w = Math.max(10, snap(2 * Math.abs(lx), e));
      s.h = Math.max(10, snap(2 * Math.abs(ly), e));
    }
  } else {
    const a = Math.atan2(wy - s.y, wx - s.x) / D2R + 90;
    s.rot = ((e.altKey ? Math.round(a) : Math.round(a / 5) * 5) + 360) % 360;
  }
});

const release = (e: PointerEvent) => {
  touches.delete(e.pointerId);
  if (touches.size < 2) pinch = null;
  if (drag?.mode === 'poly' && e.type === 'pointerup' && Math.hypot(e.offsetX - drag.sx, e.offsetY - drag.sy) < 10) {
    const [wx, wy] = world(e.offsetX, e.offsetY), reach = (e.pointerType === 'touch' ? 24 : 12) / cam.z;
    if (poly.length >= 6 && Math.hypot(wx - poly[0], wy - poly[1]) < reach) closePoly();
    else poly.push(snap(wx, e), snap(wy, e));
  }
  endDrag();
};
cv.addEventListener('pointerup', release);
cv.addEventListener('pointercancel', release);
cv.addEventListener('dblclick', () => tool === 'poly' && closePoly());
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    if (race) return;
    const [wx, wy] = world(e.offsetX, e.offsetY);
    cam.z = Math.max(0.05, Math.min(8, cam.z * Math.exp(-e.deltaY * 0.0015)));
    cam.x = wx - (e.offsetX - cw / 2) / cam.z;
    cam.y = wy - (e.offsetY - ch / 2) / cam.z;
  },
  { passive: false },
);

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).closest('input, select, textarea, dialog')) return;
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (race) {
    if (k === ' ') (paused = !paused), e.preventDefault();
    if (k === 'escape') document.body.classList.contains('full') ? setFull(false) : stop();
    if (k === 'f') setFull(!document.body.classList.contains('full'));
    return;
  }
  const s = sel();
  if (mod && k === 'z') return e.preventDefault(), e.shiftKey ? step(redo, undo) : step(undo, redo);
  if (mod && k === 'y') return e.preventDefault(), step(redo, undo);
  if (mod && k === 'd') return e.preventDefault(), duplicateSel();
  if (k === 'enter' && tool === 'poly') return closePoly();
  if (k === 'escape') return cancelPoly();
  if (!s) return;
  if (k === 'delete' || k === 'backspace') return removeSel();
  const d = e.shiftKey ? 10 : 1, move: Record<string, [number, number]> = { arrowleft: [-d, 0], arrowright: [d, 0], arrowup: [0, -d], arrowdown: [0, d] };
  if (move[k]) {
    e.preventDefault();
    s.x += move[k][0];
    s.y += move[k][1];
    commit();
    renderRight();
  }
});

// ---------- main loop ----------
let lastT = performance.now(), acc = 0, lastBoard = 0;
const raceCam: Cam = { x: 0, y: 0, z: 1 };

function frame(now: number) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  resize();
  if (race) {
    if (!paused) {
      acc += dt * speed;
      for (let n = 0; acc >= DT && n < 48; n++, acc -= DT) race.tick();
      if (acc >= DT) acc = 0; // too slow to keep up; drop the backlog
    }
    fitTo(race.stage, raceCam, 0);
    if (race instanceof SlotGame) {
      const slots = race.phase === 'done' && !race.single ? undefined : { labels: race.labels, counts: race.counts, loser: race.loser };
      drawScene(g, cw, ch, raceCam, race.stage, project, { sim: race.sim, fx: race.fx, clock: race.clock, slots });
      drawSlotHud(g, cw, ch, race);
    } else {
      drawScene(g, cw, ch, raceCam, race.stage, project, { sim: race.sim, fx: race.fx, clock: race.clock });
      drawHud(g, cw, ch, race, project);
    }
    if (race.dirty && now - lastBoard > 200) {
      race.dirty = false;
      lastBoard = now;
      if (tab === 'standings') renderRight();
    }
  } else {
    // In slots mode show where the strip will sit, so stages can be designed around it.
    const labels = project.mode === 'slots' ? parseLabels(project.slotLabels) : null;
    const slots = labels ? { labels, counts: labels.map(() => 0), loser: -1 } : undefined;
    drawScene(g, cw, ch, cam, stage(), project, { sel: sel(), poly: tool === 'poly' ? poly : undefined, mouse, handleScale: coarse.matches ? 1.6 : 1, slots });
  }
  requestAnimationFrame(frame);
}

if (!('MediaRecorder' in window) || !cv.captureStream) $('#rec').hidden = true;
compact.addEventListener('change', () => sheet(''));
window.addEventListener('resize', () => race || fit()); // rotation, split view
renderAll();
fit();
requestAnimationFrame(frame);
