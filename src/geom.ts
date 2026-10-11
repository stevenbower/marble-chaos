import type { Shape } from './model';

export const D2R = Math.PI / 180;
export const isRound = (s: Shape) => s.kind === 'circle' || s.kind === 'cross' || s.kind === 'arc' || s.kind === 'star';
/** Height of the shape's local bounding box. */
export const boxH = (s: Shape) => (isRound(s) ? s.w : s.h);

export function toLocal(s: Shape, px: number, py: number, ang: number): [number, number] {
  const dx = px - s.x, dy = py - s.y, c = Math.cos(-ang), n = Math.sin(-ang);
  return [dx * c - dy * n, dx * n + dy * c];
}

export function toWorld(s: Shape, lx: number, ly: number, ang: number): [number, number] {
  const c = Math.cos(ang), n = Math.sin(ang);
  return [s.x + lx * c - ly * n, s.y + lx * n + ly * c];
}

export const triPts = (s: Shape) => [(s.skew * s.w) / 2, -s.h / 2, s.w / 2, s.h / 2, -s.w / 2, s.h / 2];
export const polyPts = (s: Shape) => (s.pts ?? []).map((v, i) => v * (i % 2 ? s.h : s.w));
/** Centre line of a zigzag wall: `arms` strokes across its width, peaks kept inside its height. */
export function zigPts(s: Shape) {
  const n = Math.max(2, Math.round(s.arms)), amp = Math.max(0, s.h / 2 - s.t / 2), p: number[] = [];
  for (let i = 0; i <= n; i++) p.push(-s.w / 2 + (i * s.w) / n, i % 2 ? amp : -amp);
  return p;
}
export function starPts(s: Shape) {
  const n = Math.max(3, Math.round(s.arms)), p: number[] = [];
  for (let i = 0; i < 2 * n; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n, r = (s.w / 2) * (i % 2 ? 0.45 : 1);
    p.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return p;
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function inPoly(p: number[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Point-in-shape test; `ang` is the shape's current rotation in radians, `pad` grows the shape. */
export function hit(s: Shape, px: number, py: number, ang: number, pad = 0): boolean {
  const [lx, ly] = toLocal(s, px, py, ang);
  if (s.role === 'spawn' || s.kind === 'rect') return Math.abs(lx) <= s.w / 2 + pad && Math.abs(ly) <= boxH(s) / 2 + pad;
  switch (s.kind) {
    case 'circle':
      return lx * lx + ly * ly <= (s.w / 2 + pad) ** 2;
    case 'tri':
      return inPoly(triPts(s), lx, ly);
    case 'poly':
      return inPoly(polyPts(s), lx, ly);
    case 'star':
      return inPoly(starPts(s), lx, ly);
    case 'zig': {
      const p = zigPts(s);
      for (let i = 0; i + 3 < p.length; i += 2) if (segDist(lx, ly, p[i], p[i + 1], p[i + 2], p[i + 3]) <= s.t / 2 + pad) return true;
      return false;
    }
    case 'cross': {
      if (lx * lx + ly * ly <= (s.t * 0.8 + pad) ** 2) return true;
      for (let i = 0; i < s.arms; i++) {
        const a = (-i * 2 * Math.PI) / s.arms, c = Math.cos(a), n = Math.sin(a);
        const ax = lx * c - ly * n, ay = lx * n + ly * c;
        if (ax >= 0 && ax <= s.w / 2 + pad && Math.abs(ay) <= s.t / 2 + pad) return true;
      }
      return false;
    }
    case 'arc': {
      const r = Math.hypot(lx, ly);
      return r <= s.w / 2 + pad && r >= s.w / 2 - s.t - pad && Math.abs(Math.atan2(ly, lx)) <= (s.sweep * D2R) / 2;
    }
  }
  return false;
}

/** Ear-clipping triangulation of a simple polygon given as a flat [x,y,...] list. */
export function triangulate(p: number[]): number[][] {
  const n = p.length / 2;
  const idx = [...Array(n).keys()];
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1];
  }
  if (area < 0) idx.reverse();
  const cross = (a: number, b: number, c: number) =>
    (p[2 * b] - p[2 * a]) * (p[2 * c + 1] - p[2 * a + 1]) - (p[2 * b + 1] - p[2 * a + 1]) * (p[2 * c] - p[2 * a]);
  const tri = (a: number, b: number, c: number) => [p[2 * a], p[2 * a + 1], p[2 * b], p[2 * b + 1], p[2 * c], p[2 * c + 1]];
  const out: number[][] = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 5000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
      if (cross(a, b, c) <= 0) continue;
      if (idx.some((k) => k !== a && k !== b && k !== c && cross(a, b, k) >= 0 && cross(b, c, k) >= 0 && cross(c, a, k) >= 0)) continue;
      out.push(tri(a, b, c));
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) out.push(tri(idx[0], idx[1], idx[2]));
  return out;
}
