import { D2R, LIFT_TILT, boxH, liftShelfW, liftShelfX, liftShelves, liftSide, liftWalls, polyPts, starPts, toWorld, triPts, zigPts } from './geom';
import type { Project, Shape, Stage } from './model';
import type { Race } from './race';
import { LIVE, SLOT_H, SLOT_MOUTH, VOID_REACH, type Fx, type Marble, type Pose, type Sim } from './sim';
import type { SlotGame } from './slots';
import { drawFace, drawGloss, drawMarble, drawTiny, loadImage, sceneUrl, spritesReady, texUrl } from './sprites';

export interface Cam {
  x: number;
  y: number;
  z: number;
}

export const roleColor = (s: Shape) =>
  s.color || (s.role === 'finish' ? '#1fe01f' : s.role === 'kill' ? '#e01212' : s.role === 'spawn' ? '#4aa3ff' : '#6e6e6e');


/** The material a shape is drawn with, or 'flat' for a plain colour. */
export function skinOf(s: Shape, stage: Stage) {
  if (s.color) return 'flat';
  return s.skin || (s.role === 'finish' ? 'finish' : s.role === 'kill' ? (s.fate === 'water' || s.fate === 'acid' ? s.fate : 'lava') : stage.skin || 'steel');
}

const TINY = 11; // on-screen marble radius, in CSS pixels, below which spin isn't drawn
const TILE = 256; // stage units one texture tile covers
const patterns = new Map<string, CanvasPattern | null>();
function pattern(g: CanvasRenderingContext2D, key: string): CanvasPattern | null {
  const made = patterns.get(key);
  if (made) return made;
  const { img } = loadImage(texUrl(key));
  if (!img.complete || !img.naturalWidth) return null;
  const p = g.createPattern(img, 'repeat');
  p?.setTransform(new DOMMatrix().scale(TILE / img.naturalWidth));
  patterns.set(key, p);
  return p;
}

let tiled: { key: string; c: HTMLCanvasElement } | null = null;
/**
 * Lay a tiled material across the stage. Filling the screen with a scaled pattern every frame is slow on big
 * displays, so the result is kept as a picture at screen resolution and only redone when the view changes.
 */
function drawTiled(g: CanvasRenderingContext2D, stage: Stage, paint: CanvasPattern) {
  const t = g.getTransform(), k = Math.hypot(t.a, t.b), w = Math.ceil(stage.w * k), h = Math.ceil(stage.h * k);
  if (w > 4096 || h > 4096) {
    g.fillStyle = paint; // zoomed far in: too big to keep
    g.fillRect(0, 0, stage.w, stage.h);
    return;
  }
  const key = `${stage.bgTex}|${w}|${h}`;
  if (tiled?.key !== key) {
    const c = tiled?.c ?? document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d')!;
    x.scale(w / stage.w, h / stage.h);
    x.fillStyle = paint;
    x.fillRect(0, 0, stage.w, stage.h);
    tiled = { key, c };
  }
  g.drawImage(tiled.c, 0, 0, stage.w, stage.h);
}

/** Paint a full-stage illustration, cropped to cover the stage. */
function drawSceneBackdrop(g: CanvasRenderingContext2D, key: string, stage: Stage) {
  const { img } = loadImage(sceneUrl(key));
  if (!img.complete || !img.naturalWidth) return;
  const k = Math.max(stage.w / img.naturalWidth, stage.h / img.naturalHeight), sw = stage.w / k, sh = stage.h / k;
  g.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, stage.w, stage.h);
}

/**
 * Fetch and decode everything these stages draw (backdrops, materials, marble faces), so a run never opens on a
 * bare stage with the artwork popping in a moment later.
 */
export function preload(stages: Stage[], project: Project): Promise<unknown> {
  const urls = new Set<string>();
  for (const st of stages) {
    if (st.bgTex) urls.add(st.bgTex.startsWith('scene-') ? sceneUrl(st.bgTex) : texUrl(st.bgTex));
    for (const s of st.shapes) {
      const skin = s.role === 'solid' || s.role === 'finish' || s.role === 'kill' ? skinOf(s, st) : 'flat';
      if (skin !== 'flat' && skin !== 'bumper') urls.add(texUrl(skin));
    }
  }
  return Promise.all([...[...urls].map((u) => loadImage(u).ready), spritesReady(project.entrants)]);
}

/** Lay down the outline of a shape in its own frame; arcs and zigzags are stroked bands rather than filled areas. */
function trace(g: CanvasRenderingContext2D, s: Shape): 'fill' | 'band' {
  const path = (p: number[], close = true) => {
    for (let i = 0; i < p.length; i += 2) i ? g.lineTo(p[i], p[i + 1]) : g.moveTo(p[0], p[1]);
    if (close) g.closePath();
  };
  g.beginPath();
  switch (s.kind) {
    case 'rect':
      g.rect(-s.w / 2, -s.h / 2, s.w, s.h);
      break;
    case 'circle':
      g.arc(0, 0, s.w / 2, 0, Math.PI * 2);
      break;
    case 'tri':
      path(triPts(s));
      break;
    case 'poly':
      path(polyPts(s));
      break;
    case 'star':
      path(starPts(s));
      break;
    case 'lift':
      for (const [x, y, w, h] of liftWalls(s)) g.rect(x - w / 2, y - h / 2, w, h);
      break;
    case 'cross':
      g.arc(0, 0, s.t * 0.8, 0, Math.PI * 2);
      for (let i = 0; i < s.arms; i++) {
        const a = (i * 2 * Math.PI) / s.arms, c = Math.cos(a), n = Math.sin(a), hw = s.w / 2, ht = s.t / 2;
        g.moveTo(n * ht, -c * ht);
        g.lineTo(c * hw + n * ht, n * hw - c * ht);
        g.lineTo(c * hw - n * ht, n * hw + c * ht);
        g.lineTo(-n * ht, c * ht);
        g.closePath();
      }
      break;
    case 'arc':
      g.arc(0, 0, Math.max(1, s.w / 2 - s.t / 2), (-s.sweep * D2R) / 2, (s.sweep * D2R) / 2);
      return 'band';
    case 'zig':
      path(zigPts(s), false);
      return 'band';
  }
  return 'fill';
}

/** Grow, shrink, fan and portal zones: see-through, animated, and never solid. */
function drawSpecial(g: CanvasRenderingContext2D, s: Shape, now: number, pair: number) {
  const R = Math.max(s.w, boxH(s)) / 2;
  if (s.role === 'fan') {
    const h = boxH(s);
    g.fillStyle = 'rgba(120,220,255,.16)';
    trace(g, s);
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(190,240,255,.75)';
    g.lineWidth = 4;
    g.lineCap = g.lineJoin = 'round';
    const c = Math.min(s.w * 0.3, 26), gap = 46;
    for (let y = h / 2 + gap - ((now * 140) % gap); y > -h / 2 - gap; y -= gap) {
      g.beginPath(); // chevrons streaming the way the fan blows
      g.moveTo(-c, y + c * 0.7);
      g.lineTo(0, y);
      g.lineTo(c, y + c * 0.7);
      g.stroke();
    }
    g.restore();
    return;
  }
  if (s.role === 'portal') {
    const hue = (285 + pair * 137) % 360, well = g.createRadialGradient(0, 0, 0, 0, 0, R);
    well.addColorStop(0, '#000');
    well.addColorStop(0.7, `hsl(${hue} 80% 18%)`);
    well.addColorStop(1, `hsl(${hue} 95% 62%)`);
    g.fillStyle = well;
    trace(g, s);
    g.fill();
    g.strokeStyle = `hsl(${hue} 100% 78%)`;
    g.lineWidth = Math.max(2, R * 0.09);
    g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a = now * 4 + (i * Math.PI * 2) / 3;
      g.beginPath(); // the swirl
      g.arc(0, 0, R * (0.3 + i * 0.2), a, a + 1.9);
      g.stroke();
    }
    return;
  }
  if (s.role === 'boost') {
    const h = boxH(s);
    g.fillStyle = 'rgba(255,170,30,.3)';
    trace(g, s);
    g.fill();
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 3;
    g.stroke();
    g.save();
    g.clip();
    g.strokeStyle = '#fff3a0';
    g.lineWidth = 6;
    g.lineCap = g.lineJoin = 'round';
    const c = Math.min(s.w * 0.32, 30), gap = 34;
    for (let y = h / 2 + gap - ((now * 420) % gap); y > -h / 2 - gap; y -= gap) {
      g.beginPath(); // chevrons racing the way it flings
      g.moveTo(-c, y + c * 0.7);
      g.lineTo(0, y);
      g.lineTo(c, y + c * 0.7);
      g.stroke();
    }
    g.restore();
    return;
  }
  if (s.role === 'slow') {
    g.fillStyle = s.color || '#6b4423';
    g.globalAlpha *= 0.62;
    trace(g, s);
    g.fill();
    g.globalAlpha /= 0.62;
    g.strokeStyle = 'rgba(0,0,0,.45)';
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.22)';
    const hw = s.w / 2, hh = boxH(s) / 2;
    for (let i = 0; i < 6; i++) {
      // bubbles that swell and pop in fixed spots
      const u = Math.sin(i * 12.9898 + s.x) * 43758.5453, v = Math.sin(i * 78.233 + s.y) * 43758.5453;
      const t = (now * 0.5 + i * 0.37) % 1, bx = (u - Math.floor(u) - 0.5) * hw * 1.3, by = (v - Math.floor(v) - 0.5) * hh * 1.3;
      g.beginPath();
      g.arc(bx, by, Math.max(2, Math.min(hw, hh) * 0.16 * t), 0, Math.PI * 2);
      g.fill();
    }
    return;
  }
  const grow = s.role === 'grow', col = grow ? '70,235,120' : '190,120,255';
  g.fillStyle = `rgba(${col},.22)`;
  trace(g, s);
  g.fill();
  g.strokeStyle = `rgba(${col},.95)`;
  g.lineWidth = 3;
  g.setLineDash([12, 9]);
  g.lineDashOffset = now * (grow ? -30 : 30);
  g.stroke();
  g.setLineDash([]);
  g.lineWidth = Math.max(4, R * 0.16); // a big plus or minus
  g.lineCap = 'round';
  const k = R * (0.42 + 0.06 * Math.sin(now * 5));
  g.beginPath();
  g.moveTo(-k, 0);
  g.lineTo(k, 0);
  if (grow) {
    g.moveTo(0, -k);
    g.lineTo(0, k);
  }
  g.stroke();
}

/** A black hole: a dark well inside a turning ring of fire, with a faint line where its pull begins. */
function drawVoid(g: CanvasRenderingContext2D, s: Shape, now: number, edit: boolean) {
  const R = Math.max(s.w, boxH(s)) / 2, halo = g.createRadialGradient(0, 0, R * 0.5, 0, 0, R * 1.6);
  halo.addColorStop(0, 'rgba(255,150,40,.55)');
  halo.addColorStop(0.5, 'rgba(160,60,255,.25)');
  halo.addColorStop(1, 'rgba(120,40,255,0)');
  g.fillStyle = halo;
  g.beginPath();
  g.arc(0, 0, R * 1.6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#000';
  trace(g, s);
  g.fill();
  g.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const a = -now * 3 + (i * Math.PI * 2) / 3;
    g.strokeStyle = i ? '#ffb347' : '#fff1c9';
    g.lineWidth = Math.max(2, R * 0.12);
    g.beginPath();
    g.arc(0, 0, R * 1.02, a, a + 1.5);
    g.stroke();
  }
  g.strokeStyle = `rgba(200,150,255,${edit ? 0.5 : 0.16})`;
  g.lineWidth = 2;
  g.setLineDash([6, 10]);
  g.lineDashOffset = now * 20;
  g.beginPath();
  g.arc(0, 0, (s.w / 2) * VOID_REACH, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
}

/** An electric barrier: a dark bar with bolts crackling along it (dead and dim while it is switched off). */
function drawZap(g: CanvasRenderingContext2D, s: Shape, now: number, off: boolean) {
  g.fillStyle = '#17170f';
  trace(g, s);
  g.fill();
  g.strokeStyle = off ? '#777' : '#ffe94a';
  g.lineWidth = 3;
  g.stroke();
  if (off) return;
  const hw = s.w / 2, hh = boxH(s) / 2, long = hw >= hh, L = long ? hw : hh, T = long ? hh : hw, frame = Math.floor(now * 14);
  g.save();
  g.clip();
  g.lineJoin = 'round';
  for (let b = 0; b < 2; b++) {
    g.strokeStyle = b ? '#ffffff' : '#7fd4ff';
    g.lineWidth = b ? 1.5 : 4;
    g.beginPath();
    const n = Math.max(4, Math.round(L / 12));
    for (let i = 0; i <= n; i++) {
      const h = Math.sin((frame + b * 0) * 57.3 + i * 12.9898 + s.x) * 43758.5453, u = (h - Math.floor(h) - 0.5) * 1.7 * T, d = -L + (2 * L * i) / n;
      if (long) i ? g.lineTo(d, u) : g.moveTo(d, u);
      else i ? g.lineTo(u, d) : g.moveTo(u, d);
    }
    g.stroke();
  }
  g.restore();
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(120,200,255,.35)';
  g.lineWidth = 10;
  trace(g, s);
  g.stroke();
  g.globalCompositeOperation = 'source-over';
}

function drawShape(g: CanvasRenderingContext2D, s: Shape, pose: Pose, edit: boolean, stage: Stage, now: number, pair: number, shelves?: number[]) {
  const col = roleColor(s);
  if (edit && (s.mx || s.my)) {
    // where a slider travels
    g.strokeStyle = 'rgba(255,255,255,.35)';
    g.lineWidth = 2;
    g.setLineDash([6, 6]);
    g.beginPath();
    g.moveTo(s.x - (s.mx || 0), s.y - (s.my || 0));
    g.lineTo(s.x + (s.mx || 0), s.y + (s.my || 0));
    g.stroke();
    g.setLineDash([]);
  }
  g.save();
  g.translate(pose.x, pose.y);
  g.rotate(pose.a);
  if (pose.f !== 1) g.scale(pose.f, pose.f);
  if (s.role === 'spawn') {
    if (edit) {
      const h = boxH(s);
      g.strokeStyle = col;
      g.lineWidth = 2;
      g.setLineDash([10, 8]);
      g.strokeRect(-s.w / 2, -h / 2, s.w, h);
      g.fillStyle = col;
      g.font = '600 16px system-ui';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('SPAWN', 0, 0);
    }
    g.restore();
    return;
  }
  if (pose.off) g.globalAlpha = 0.2; // a gate that is open just now
  if (s.role === 'grow' || s.role === 'shrink' || s.role === 'fan' || s.role === 'portal' || s.role === 'boost' || s.role === 'slow') {
    drawSpecial(g, s, now, pair);
    g.restore();
    return;
  }
  if (s.role === 'kill' && (s.fate === 'void' || s.fate === 'zap')) {
    if (s.fate === 'void') drawVoid(g, s, now, edit);
    else drawZap(g, s, now, !!pose.off);
    g.restore();
    return;
  }
  if (s.kind === 'rect' && s.belt && s.role === 'solid') {
    // conveyor: a rubber belt on two rollers, its treads running the way it carries
    const hw = s.w / 2, hh = s.h / 2;
    g.fillStyle = '#23252c';
    g.strokeStyle = 'rgba(0,0,0,.75)';
    g.lineWidth = 4;
    g.beginPath();
    g.roundRect(-hw, -hh, s.w, s.h, hh);
    g.stroke();
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = '#8f96a3';
    g.lineWidth = 3;
    const gap = 26, off = (((now * s.belt) % gap) + gap) % gap, lean = Math.sign(s.belt) * hh * 0.7;
    g.beginPath();
    for (let x = -hw - gap + off; x < hw + gap; x += gap) {
      g.moveTo(x - lean, -hh);
      g.lineTo(x + lean, 0);
      g.lineTo(x - lean, hh);
    }
    g.stroke();
    g.restore();
    g.fillStyle = '#c9ced8';
    for (const x of [-hw + hh, hw - hh]) {
      g.beginPath();
      g.arc(x, 0, hh * 0.45, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    return;
  }
  const skin = skinOf(s, stage);
  let paint: string | CanvasPattern | CanvasGradient | null = skin === 'flat' ? null : skin === 'bumper' ? null : pattern(g, skin);
  if (skin === 'bumper') {
    // pinball bumper: hot rings that throb
    const R = Math.max(s.w, boxH(s)) / 2, gr = g.createRadialGradient(0, 0, 0, 0, 0, R), beat = 0.5 + 0.5 * Math.sin(now * 8);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.3 + 0.08 * beat, '#ffe14a');
    gr.addColorStop(0.68, '#ff4fa3');
    gr.addColorStop(1, '#b0126e');
    paint = gr;
  }
  const textured = paint !== null;
  const glow = s.role === 'finish' ? '#3dff6a' : s.role === 'kill' ? (s.fate === 'water' ? '#4fc3ff' : s.fate === 'acid' ? '#9dff3d' : '#ff4a1c') : skin === 'bumper' ? '#ff7ac2' : '';
  if (trace(g, s) === 'band') {
    g.lineCap = s.kind === 'zig' ? 'round' : 'butt';
    g.lineJoin = 'round';
    if (textured) {
      g.lineWidth = s.t + 5; // dark edge under the band
      g.strokeStyle = 'rgba(0,0,0,.7)';
      g.stroke();
    }
    g.lineWidth = s.t;
    g.strokeStyle = paint ?? col;
    g.stroke();
    g.restore();
    return;
  }
  g.fillStyle = paint ?? col;
  if (textured && glow) {
    // A halo of soft strokes: shadowBlur costs a full-width blur pass per shape per frame, which drags big screens down.
    g.lineJoin = 'round';
    g.strokeStyle = glow;
    for (const [w, a] of [[30, 0.1], [20, 0.14], [11, 0.2]]) {
      g.lineWidth = w;
      g.globalAlpha = a;
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  g.fill();
  if (textured) {
    g.lineJoin = 'round';
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(0,0,0,.7)';
    g.stroke();
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(255,255,255,.4)';
    g.stroke();
  }
  if (s.kind === 'lift') {
    // the shelves, clipped to the shaft so they slip out of sight at the top and under the floor
    g.beginPath();
    g.rect(-s.w / 2, -s.h / 2, s.w, s.h);
    g.clip();
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 8;
    g.lineCap = 'round';
    const hw = liftShelfW(s) / 2, dx = Math.cos(LIFT_TILT) * hw, dy = Math.sin(LIFT_TILT) * hw * liftSide(s);
    g.beginPath();
    for (const y of shelves ?? liftShelves(s, 0)) {
      g.moveTo(liftShelfX(s) - dx, y - dy);
      g.lineTo(liftShelfX(s) + dx, y + dy);
    }
    g.stroke();
  }
  if (s.free) {
    // the pin it swings on
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(0, 0, 4, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** The scoring strip along the floor in slots mode. */
export interface SlotView {
  labels: string[];
  counts: number[];
  loser: number;
}

const HUD = 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif';
const labelHue = (s: string) => ([...s].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) * 47) % 360;

function drawSlots(g: CanvasRenderingContext2D, stage: Stage, v: SlotView, clock: number) {
  const n = v.labels.length, sw = stage.w / n, top = stage.h - SLOT_H;
  const yL = top + SLOT_MOUTH, hL = 32, yC = yL + hL, hC = SLOT_H - SLOT_MOUTH - hL;
  const scored = v.counts.some((c) => c > 0), low = Math.min(...v.labels.map((_, i) => v.counts[i] ?? 0));
  g.fillStyle = '#0b0b10';
  g.fillRect(0, yL, stage.w, SLOT_H - SLOT_MOUTH);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  v.labels.forEach((label, i) => {
    const x = i * sw, c = v.counts[i] ?? 0, out = i === v.loser, trailing = scored && c === low;
    g.fillStyle = out ? (Math.floor(clock * 6) % 2 ? '#ff2a2a' : '#5a0000') : `hsl(${labelHue(label)} 70% 45%)`;
    g.fillRect(x + 1.5, yL, sw - 3, hL - 1);
    g.fillStyle = out || trailing ? '#3a0d0d' : '#17171f';
    g.fillRect(x + 1.5, yC, sw - 3, hC);
    g.fillStyle = '#fff';
    g.font = `${Math.min(hL * 0.8, (sw * 1.5) / label.length)}px ${HUD}`;
    g.fillText(label, x + sw / 2, yL + hL / 2 + 1, sw - 6);
    g.fillStyle = out || trailing ? '#ff8585' : '#e8e8e8';
    g.font = `600 ${Math.min(hC * 0.72, sw * 0.5)}px system-ui, sans-serif`;
    g.fillText(String(c), x + sw / 2, yC + hC / 2 + 1, sw - 6);
  });
  g.fillStyle = '#aab0bb';
  for (let i = 0; i <= n; i++) {
    g.fillRect(i * sw - 2, top, 4, SLOT_MOUTH);
    g.beginPath();
    g.arc(i * sw, top, 3, 0, Math.PI * 2);
    g.fill();
  }
}

/** Marbles burning up: the marble chars and shrinks inside a flare while embers fly off. */
function drawFx(g: CanvasRenderingContext2D, fx: Fx[], clock: number, project: Project, r: number) {
  const crowd = fx.length > 120; // a massacre: skip the sparks
  for (const f of fx) {
    const t = (clock - f.at) / 0.9;
    if (t < 0 || t >= 1) continue;
    const rnd = (i: number) => {
      const h = Math.sin(f.at * 91.7 + f.x * 3.1 + i * 12.9898) * 43758.5453;
      return h - Math.floor(h);
    };
    if (f.k === 'late') {
      // too late: fades to grey and sinks away
      g.globalAlpha = (1 - t) * 0.8;
      drawMarble(g, project.entrants[f.e], f.x, f.y + t * r * 2, r * (1 - t * 0.5));
      g.fillStyle = '#555';
      g.beginPath();
      g.arc(f.x, f.y + t * r * 2, r * (1 - t * 0.5), 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      continue;
    }
    if (f.k === 'void') {
      // spirals down the plughole
      const a = t * 7 + rnd(0) * 6, d = Math.hypot(f.x - f.tx!, f.y - f.ty!) * (1 - t), a0 = Math.atan2(f.y - f.ty!, f.x - f.tx!);
      g.globalAlpha = 1 - t * 0.6;
      drawMarble(g, project.entrants[f.e], f.tx! + Math.cos(a0 + a) * d, f.ty! + Math.sin(a0 + a) * d, Math.max(0.5, r * (1 - t)));
      g.globalAlpha = 1;
      continue;
    }
    if (f.k === 'water' || f.k === 'acid') {
      // sinks, under a spreading ring and a few drops
      const acid = f.k === 'acid', col = acid ? '170,255,80' : '150,220,255';
      g.globalAlpha = 1 - t;
      drawMarble(g, project.entrants[f.e], f.x, f.y + t * r * 1.5, r * (1 - t * 0.6));
      g.strokeStyle = `rgba(${col},${1 - t})`;
      g.lineWidth = Math.max(1, r * 0.3 * (1 - t));
      g.beginPath();
      g.ellipse(f.x, f.y, r * (1 + t * 3), r * (0.4 + t * 1.2), 0, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = `rgb(${col})`;
      for (let i = 0; i < (crowd ? 0 : 7); i++) {
        const u = rnd(i), a = -Math.PI / 2 + (u - 0.5) * 2, d = r * (2 + 4 * u) * t;
        g.beginPath();
        g.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d + r * 5 * t * t, Math.max(0.6, r * 0.25 * (1 - t)), 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      continue;
    }
    if (f.k === 'zap') {
      // a white flash, a few forks of lightning, then a cinder dropping away
      g.globalAlpha = 1 - t;
      drawMarble(g, project.entrants[f.e], f.x, f.y + t * t * r * 4, r * (1 - t * 0.5));
      g.fillStyle = t < 0.25 ? '#ffffff' : '#111';
      g.globalAlpha = t < 0.25 ? 0.9 : Math.min(0.85, t);
      g.beginPath();
      g.arc(f.x, f.y + t * t * r * 4, r * (1 - t * 0.5), 0, Math.PI * 2);
      g.fill();
      if (t < 0.45 && !crowd) {
        g.globalAlpha = 1 - t / 0.45;
        g.strokeStyle = '#bfe9ff';
        g.lineWidth = Math.max(1, r * 0.22);
        g.lineJoin = 'round';
        for (let i = 0; i < 4; i++) {
          const a = rnd(i) * Math.PI * 2;
          g.beginPath();
          g.moveTo(f.x, f.y);
          for (let j = 1; j <= 3; j++) g.lineTo(f.x + Math.cos(a + (rnd(i * 7 + j) - 0.5) * 1.2) * r * j * 1.3, f.y + Math.sin(a + (rnd(i * 5 + j) - 0.5) * 1.2) * r * j * 1.3);
          g.stroke();
        }
      }
      g.globalAlpha = 1;
      continue;
    }
    const rr = r * (1 - t * 0.85);
    g.globalAlpha = 1 - t * 0.5;
    drawMarble(g, project.entrants[f.e], f.x, f.y - t * r, rr);
    g.globalAlpha = Math.min(0.9, t * 1.6);
    g.fillStyle = '#120600';
    g.beginPath();
    g.arc(f.x, f.y - t * r, rr, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = (1 - t) * 0.9;
    const R = r * (2.2 + t * 3), flare = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, R);
    flare.addColorStop(0, '#fff3b0');
    flare.addColorStop(0.3, '#ff9a1f');
    flare.addColorStop(1, 'rgba(255,40,0,0)');
    g.fillStyle = flare;
    g.beginPath();
    g.arc(f.x, f.y, R, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < (crowd ? 0 : 10); i++) {
      // embers on fixed, per-marble pseudo-random paths
      const h = Math.sin(f.at * 91.7 + f.x * 3.1 + i * 12.9898) * 43758.5453, u = h - Math.floor(h);
      const a = -Math.PI / 2 + (u - 0.5) * 2.6, d = r * (1 + 4 * u) * t;
      g.globalAlpha = 1 - t;
      g.fillStyle = i % 3 ? '#ff7a1a' : '#ffe27a';
      g.beginPath();
      g.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d - r * 2.5 * t * t, Math.max(0.6, r * 0.22 * (1 - t)), 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }
}

export function handles(s: Shape, z: number) {
  const a = s.rot * D2R, hw = s.w / 2, hh = boxH(s) / 2;
  return {
    corners: [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => toWorld(s, x, y, a)),
    rot: toWorld(s, 0, -hh - 28 / z, a),
  };
}

export function drawScene(
  g: CanvasRenderingContext2D, cw: number, ch: number, cam: Cam, stage: Stage, project: Project,
  o: { sim?: Sim; sel?: Shape | null; poly?: number[]; mouse?: [number, number]; handleScale?: number; slots?: SlotView; fx?: Fx[]; clock?: number },
) {
  const edit = !o.sim;
  g.fillStyle = '#34343a';
  g.fillRect(0, 0, cw, ch);
  g.save();
  g.translate(cw / 2, ch / 2);
  g.scale(cam.z, cam.z);
  g.translate(-cam.x, -cam.y);
  g.fillStyle = stage.bg;
  g.fillRect(0, 0, stage.w, stage.h);
  const backdrop = stage.bgTex && !stage.bgTex.startsWith('scene-') ? pattern(g, stage.bgTex) : null;
  if (stage.bgTex?.startsWith('scene-')) drawSceneBackdrop(g, stage.bgTex, stage);
  if (backdrop) drawTiled(g, stage, backdrop);
  if (edit) {
    g.strokeStyle = 'rgba(255,255,255,.06)';
    g.lineWidth = 1 / cam.z;
    g.beginPath();
    for (let x = 100; x < stage.w; x += 100) g.moveTo(x, 0), g.lineTo(x, stage.h);
    for (let y = 100; y < stage.h; y += 100) g.moveTo(0, y), g.lineTo(stage.w, y);
    g.stroke();
  }
  const now = performance.now() / 1000, portals = stage.shapes.filter((s) => s.role === 'portal');
  for (const s of stage.shapes) {
    if (o.sim && o.slots && s.role === 'finish') continue; // finish zones sit out when slots do the scoring
    const pose: Pose = o.sim ? o.sim.pose(s) : { x: s.x, y: s.y, a: s.rot * D2R, f: 1 };
    drawShape(g, s, pose, edit, stage, now, s.role === 'portal' ? portals.indexOf(s) >> 1 : 0, s.kind === 'lift' ? o.sim?.shelves(s) : undefined);
  }

  if (o.sim) {
    // Marbles under TINY pixels in radius are too small to show their spin: those go down as one pre-lit
    // picture each. The rest get faces first, then the shine over all of them, so the browser can batch the draws.
    const t = g.getTransform(), px = Math.hypot(t.a, t.b) / (window.devicePixelRatio || 1), big: Marble[] = [];
    for (const m of o.sim.marbles) {
      if (!m.body) continue;
      if (m.r * px > TINY) {
        big.push(m);
        continue;
      }
      g.globalAlpha = m.state === LIVE ? 1 : 0.8;
      drawTiny(g, project.entrants[m.e], m.x, m.y, m.r);
    }
    for (const m of big) {
      g.globalAlpha = m.state === LIVE ? 1 : 0.8;
      drawFace(g, project.entrants[m.e], m.x, m.y, m.r, m.a);
    }
    for (const m of big) {
      g.globalAlpha = m.state === LIVE ? 1 : 0.8;
      drawGloss(g, project.entrants[m.e], m.x, m.y, m.r);
    }
  }
  if (o.sim) g.globalAlpha = 1;
  if (o.slots) drawSlots(g, stage, o.slots, o.clock ?? 0);
  if (o.sim && o.fx) drawFx(g, o.fx, o.clock ?? 0, project, o.sim.r);
  if (edit && !stage.walls) {
    g.strokeStyle = 'rgba(255,255,255,.25)';
    g.setLineDash([6 / cam.z, 6 / cam.z]);
    g.lineWidth = 1 / cam.z;
    g.strokeRect(0, 0, stage.w, stage.h);
    g.setLineDash([]);
  }
  if (o.sel) {
    const hs = o.handleScale ?? 1, s = o.sel, h = handles(s, cam.z / hs), k = hs / cam.z;
    g.strokeStyle = '#ffd23f';
    g.fillStyle = '#ffd23f';
    g.lineWidth = 1.5 * k;
    g.beginPath();
    h.corners.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    const top = [(h.corners[0][0] + h.corners[1][0]) / 2, (h.corners[0][1] + h.corners[1][1]) / 2];
    g.moveTo(top[0], top[1]);
    g.lineTo(h.rot[0], h.rot[1]);
    g.stroke();
    for (const [x, y] of h.corners) g.fillRect(x - 5 * k, y - 5 * k, 10 * k, 10 * k);
    g.beginPath();
    g.arc(h.rot[0], h.rot[1], 6 * k, 0, Math.PI * 2);
    g.fill();
  }
  if (o.poly?.length) {
    const p = o.poly, k = 1 / cam.z;
    g.strokeStyle = '#ffd23f';
    g.fillStyle = '#ffd23f';
    g.lineWidth = 2 * k;
    g.beginPath();
    for (let i = 0; i < p.length; i += 2) i ? g.lineTo(p[i], p[i + 1]) : g.moveTo(p[0], p[1]);
    if (o.mouse) g.lineTo(o.mouse[0], o.mouse[1]);
    g.stroke();
    for (let i = 0; i < p.length; i += 2) g.fillRect(p[i] - 4 * k, p[i + 1] - 4 * k, 8 * k, 8 * k);
  }
  g.restore();
}

export function drawHud(g: CanvasRenderingContext2D, cw: number, ch: number, race: Race, project: Project) {
  const u = Math.max(0.6, Math.min(cw / 1280, ch / 720)); // scale HUD with the canvas
  const text = (s: string, x: number, y: number, px: number, align: CanvasTextAlign = 'left', col = '#fff') => {
    const max = (align === 'center' ? cw : align === 'right' ? x : cw - x) - 12; // squeeze long names rather than clip them on narrow screens
    g.font = `italic ${px * u}px ${HUD}`;
    g.textAlign = align;
    g.textBaseline = 'top';
    g.lineWidth = 4 * u;
    g.strokeStyle = 'rgba(0,0,0,.8)';
    g.strokeText(s, x, y, max);
    g.fillStyle = col;
    g.fillText(s, x, y, max);
  };
  const name = (e: number) => project.entrants[e].name.toUpperCase();
  text(race.stage.name.toUpperCase(), cw - 16 * u, 12 * u, 34, 'right');
  text(`${race.entrantsIn()} LEFT`, 16 * u, 12 * u, 26);
  if (race.phase !== 'done') {
    const spots = race.total - Math.max(race.quota, race.outs) - race.safes;
    text(race.phase === 'pause' ? 'STAGE COMPLETE' : `${race.outs} OUT · ${Math.max(0, spots)} SAFE SPOTS LEFT`, 16 * u, 44 * u, 16, 'left', race.phase === 'pause' ? '#7dff7d' : '#ff7b7b');
    const recent = race.feed.filter((f) => race.clock - f.at < 5).slice(-6);
    recent.forEach((f, i) => {
      const y = (78 + i * 34) * u;
      g.globalAlpha = Math.min(1, (5 - (race.clock - f.at)) / 1.2);
      drawMarble(g, project.entrants[f.e], 30 * u, y + 14 * u, 14 * u);
      text(`${f.place}. ${name(f.e)}`, 52 * u, y + 2 * u, 22, 'left', '#ff9a9a');
      g.globalAlpha = 1;
    });
    return;
  }
  g.fillStyle = 'rgba(0,0,0,.72)';
  g.fillRect(0, 0, cw, ch);
  const top = race.results.slice(0, 3), d = 190 * u;
  if (!top.length) return;
  text(race.single ? 'STAGE RESULT' : 'WINNER', cw / 2, ch / 2 - d * 0.95, 30, 'center', '#ffd23f');
  drawMarble(g, project.entrants[top[0].e], cw / 2, ch / 2 - d * 0.2, d / 2);
  text(name(top[0].e), cw / 2, ch / 2 + d * 0.38, 54, 'center');
  top.slice(1).forEach((t, i) => text(`${t.place}. ${name(t.e)}`, cw / 2, ch / 2 + d * 0.38 + (70 + i * 30) * u, 22, 'center', '#bbb'));
}

export function drawSlotHud(g: CanvasRenderingContext2D, cw: number, ch: number, game: SlotGame) {
  const u = Math.max(0.6, Math.min(cw / 1280, ch / 720));
  const text = (s: string, x: number, y: number, px: number, align: CanvasTextAlign = 'left', col = '#fff') => {
    const max = (align === 'center' ? cw : align === 'right' ? x : cw - x) - 12;
    g.font = `italic ${px * u}px ${HUD}`;
    g.textAlign = align;
    g.textBaseline = 'top';
    g.lineWidth = 4 * u;
    g.strokeStyle = 'rgba(0,0,0,.8)';
    g.strokeText(s, x, y, max);
    g.fillStyle = col;
    g.fillText(s, x, y, max);
  };
  text(game.stage.name.toUpperCase(), cw - 16 * u, 12 * u, 34, 'right');
  text(`${game.labels.length} LEFT`, 16 * u, 12 * u, 26);
  text(`ROUND ${game.round} · ${game.sim.live} FALLING`, 16 * u, 44 * u, 16, 'left', '#bbb');
  if (game.phase === 'pause' && game.loser >= 0) {
    text(game.single ? 'LOWEST' : 'OUT!', cw / 2, ch * 0.3, 30, 'center', '#ff7b7b');
    text(game.labels[game.loser], cw / 2, ch * 0.3 + 36 * u, 120, 'center', '#ff3b3b');
  }
  if (game.phase !== 'done') return;
  g.fillStyle = 'rgba(0,0,0,.72)';
  g.fillRect(0, 0, cw, ch);
  // confetti, falling on fixed per-piece paths
  const now = performance.now() / 1000;
  for (let i = 0; i < 90; i++) {
    const a = Math.sin(i * 12.9898) * 43758.5453, r1 = a - Math.floor(a), b = Math.sin(i * 78.233) * 12543.123, r2 = b - Math.floor(b);
    const y = ((now * (0.12 + r2 * 0.2) + r1) % 1.1) * ch - 20, x = r2 * cw + Math.sin(now * 2 + i) * 14 * u;
    g.save();
    g.translate(x, y);
    g.rotate(now * (2 + r1 * 4) + i);
    g.fillStyle = `hsl(${(i * 47) % 360} 90% 60%)`;
    g.fillRect(-5 * u, -3 * u, 10 * u, 6 * u);
    g.restore();
  }
  text(game.single ? 'TOP SLOT' : 'WINNER!', cw / 2, ch / 2 - 150 * u, 30, 'center', '#ffd23f');
  text(game.winner, cw / 2, ch / 2 - 110 * u, 200, 'center', `hsl(${labelHue(game.winner)} 80% 60%)`);
}
