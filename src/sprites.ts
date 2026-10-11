import { flagUrl } from './flags';
import type { Entrant } from './model';

const SIZE = 128;
const BASE = import.meta.env.BASE_URL;
const cache = new Map<string, HTMLCanvasElement>();

export const marbleUrl = (key: string) => `${BASE}marbles/${key}.png`;
export const texUrl = (key: string) => `${BASE}tex/${key}.jpg`;
export const sceneUrl = (key: string) => `${BASE}bg/${key.replace('scene-', '')}.jpg`;

const images = new Map<string, { img: HTMLImageElement; ready: Promise<void> }>();
/** One shared, cached load per URL. `ready` settles once the image is decoded (or has failed: never rejects). */
export function loadImage(url: string) {
  let entry = images.get(url);
  if (!entry) {
    const img = new Image();
    const ready = new Promise<void>((done) => {
      img.onload = img.onerror = () => done();
    }).then(() => img.decode().catch(() => {}));
    img.src = url;
    images.set(url, (entry = { img, ready }));
  }
  return entry;
}

const spriteReady = new Map<string, Promise<void>>();
/** Settles once every marble face for these entrants is painted. */
export const spritesReady = (entrants: Entrant[]) => Promise.all(entrants.map((e) => (sprite(e), spriteReady.get(e.id))));

function disc(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function paint(c: HTMLCanvasElement, e: Entrant, img?: HTMLImageElement) {
  const g = c.getContext('2d')!, r = SIZE / 2;
  litCache.delete(e.id);
  g.clearRect(0, 0, SIZE, SIZE);
  g.save();
  g.beginPath();
  g.arc(r, r, r - 1, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = e.color || '#888';
  g.fillRect(0, 0, SIZE, SIZE);
  if (img) g.drawImage(img, 0, 0, SIZE, SIZE);
  else if (e.type === 'color') {
    // a faint stripe so a plain colour still visibly rolls
    g.strokeStyle = 'rgba(255,255,255,.2)';
    g.lineWidth = r * 0.16;
    g.beginPath();
    g.arc(r, r * 2.1, r * 1.5, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}

/** Round marble face for an entrant, without lighting; image-backed ones fill in once loaded. */
export function sprite(e: Entrant): HTMLCanvasElement {
  let c = cache.get(e.id);
  if (c) return c;
  c = disc(SIZE);
  cache.set(e.id, c);
  paint(c, e);
  const src = e.type === 'flag' ? flagUrl(e.code!) : e.type === 'image' ? e.img : e.type === 'marble' ? marbleUrl(e.tex!) : undefined;
  if (src) {
    const img = new Image(), canvas = c;
    spriteReady.set(
      e.id,
      new Promise<void>((done) => {
        img.onload = () => (paint(canvas, e, img), done());
        img.onerror = () => done();
      }),
    );
    if (e.type === 'flag') {
      // The flag SVGs only carry a viewBox; some browsers won't draw those to a canvas without an explicit size.
      fetch(src)
        .then((r) => r.text())
        .then((svg) => (img.src = URL.createObjectURL(new Blob([svg.replace('<svg ', `<svg width="${SIZE}" height="${SIZE}" `)], { type: 'image/svg+xml' }))))
        .catch(() => (img.src = src));
    } else img.src = src;
  }
  return c;
}

let glossCanvas: HTMLCanvasElement | null = null;
/** Glassy lighting laid over every marble; it stays put while the face underneath spins. */
function gloss() {
  if (glossCanvas) return glossCanvas;
  const c = (glossCanvas = disc(SIZE)), g = c.getContext('2d')!, r = SIZE / 2;
  g.beginPath();
  g.arc(r, r, r - 1, 0, Math.PI * 2);
  g.clip();
  const shade = g.createRadialGradient(r * 0.8, r * 0.7, r * 0.3, r, r, r);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(0.75, 'rgba(0,0,0,.12)');
  shade.addColorStop(1, 'rgba(0,0,0,.6)');
  g.fillStyle = shade;
  g.fillRect(0, 0, SIZE, SIZE);
  const hi = g.createRadialGradient(r * 0.62, r * 0.5, 0, r * 0.62, r * 0.5, r * 0.6);
  hi.addColorStop(0, 'rgba(255,255,255,.75)');
  hi.addColorStop(0.35, 'rgba(255,255,255,.22)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hi;
  g.fillRect(0, 0, SIZE, SIZE);
  const rim = g.createRadialGradient(r, r * 1.5, r * 0.2, r, r * 1.5, r * 0.75);
  rim.addColorStop(0, 'rgba(255,255,255,.16)');
  rim.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rim;
  g.fillRect(0, 0, SIZE, SIZE);
  return c;
}

const LIT = 40;
const litCache = new Map<string, HTMLCanvasElement>();
/** Face and shine baked into one small picture, for marbles too small on screen to show their spin. */
function lit(e: Entrant) {
  let c = litCache.get(e.id);
  if (!c) {
    const face = sprite(e); // may repaint, so fetch it before caching
    litCache.set(e.id, (c = disc(LIT)));
    const g = c.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(face, 0, 0, LIT, LIT);
    if (e.type !== 'marble') g.drawImage(gloss(), 0, 0, LIT, LIT);
  }
  return c;
}

/** A whole marble in a single draw call: what keeps a crowd of thousands cheap. */
export function drawTiny(g: CanvasRenderingContext2D, e: Entrant, x: number, y: number, r: number) {
  g.drawImage(lit(e), x - r, y - r, 2 * r, 2 * r);
}

export function drawFace(g: CanvasRenderingContext2D, e: Entrant, x: number, y: number, r: number, angle = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.drawImage(sprite(e), -r, -r, 2 * r, 2 * r);
  g.restore();
}

export function drawGloss(g: CanvasRenderingContext2D, e: Entrant, x: number, y: number, r: number) {
  if (e.type !== 'marble') g.drawImage(gloss(), x - r, y - r, 2 * r, 2 * r); // the designed marbles carry their own shine
}

export function drawMarble(g: CanvasRenderingContext2D, e: Entrant, x: number, y: number, r: number, angle = 0) {
  drawFace(g, e, x, y, r, angle);
  drawGloss(g, e, x, y, r);
}

export const thumb = (e: Entrant) =>
  e.type === 'flag'
    ? `<img class="th" src="${flagUrl(e.code!)}">`
    : e.type === 'image'
      ? `<img class="th" src="${e.img}">`
      : e.type === 'marble'
        ? `<img class="th" src="${marbleUrl(e.tex!)}">`
        : `<span class="th" style="background:${e.color}"></span>`;
