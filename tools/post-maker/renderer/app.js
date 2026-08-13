'use strict';

/* ============================================================================
   Jadauco Post Maker — renderer
   Everything happens on a <canvas>: no native modules, no network, no upload.
   Colours and type come from brand-kit/brand.css and must not drift from it.
   ========================================================================= */

const FORMATS = {
  square:   { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
  story:    { w: 1080, h: 1920 },
};

const GROUNDS = {
  cream: { bg: '#FFFDF8', fg: '#211A12', mut: '#5A4E40', accent: '#8A6A2C', rule: '#E4DCCB' },
  sand:  { bg: '#F5F1E9', fg: '#211A12', mut: '#5A4E40', accent: '#8A6A2C', rule: '#E4DCCB' },
  ink:   { bg: '#211A12', fg: '#F0E6D2', mut: 'rgba(240,230,210,.66)',
           accent: '#C6A45C', rule: 'rgba(240,230,210,.26)' },
};

const GOLD = '#C6A45C';
const WORK_MAX = 1600;           // cap the keying work size

const state = {
  photos: [],                    // { name, img, keyed }
  active: -1,
  format: 'square',
  layout: 'ring',
  ground: 'cream',
  cut: 16,
  feather: 52,
  keyOn: true,
};

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');

/* ---------------------------------------------------------------- keying */

/**
 * Knock the dark background out of a photo shot on black.
 * Uses the MAX channel rather than luminance: a dark-but-saturated pixel (a
 * ruby, a garnet) has a high max and stays opaque, where luminance would fade
 * it into the background.
 */
function keyOut(img, cut, feather) {
  const scale = Math.min(1, WORK_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, w, h);

  const data = cx.getImageData(0, 0, w, h);
  const d = data.data;
  const lo = cut;
  const hi = Math.max(cut + 1, feather);

  const alpha = new Float32Array(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const m = Math.max(d[i], d[i + 1], d[i + 2]);
    alpha[p] = Math.min(1, Math.max(0, (m - lo) / (hi - lo)));
  }

  // 3x3 mean on alpha only — softens the cut edge so it doesn't look stamped
  const blur = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= w) continue;
          sum += alpha[yy * w + xx]; n++;
        }
      }
      blur[y * w + x] = sum / n;
    }
  }

  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = blur[y * w + x];
      d[(y * w + x) * 4 + 3] = Math.round(a * 255);
      if (a > 0.15) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  cx.putImageData(data, 0, 0);

  if (maxX < 0) return c;                       // nothing survived; hand back as-is

  const pad = Math.round(Math.max(w, h) * 0.02);
  const bx = Math.max(0, minX - pad), by = Math.max(0, minY - pad);
  const bw = Math.min(w, maxX + pad) - bx, bh = Math.min(h, maxY + pad) - by;

  const out = document.createElement('canvas');
  out.width = bw; out.height = bh;
  out.getContext('2d').drawImage(c, bx, by, bw, bh, 0, 0, bw, bh);
  return out;
}

function plain(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

function reKey(photo) {
  photo.keyed = state.keyOn
    ? keyOut(photo.img, state.cut, state.feather)
    : plain(photo.img);
}

/* ------------------------------------------------------------- text bits */

// Manual letter-spacing: deterministic across engines, unlike ctx.letterSpacing
function tracked(text, cx, y, track, align = 'center') {
  const chars = [...text];
  const total = chars.reduce((a, ch) => a + ctx.measureText(ch).width + track, 0) - track;
  let x = align === 'center' ? cx - total / 2 : cx;
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const ch of chars) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + track;
  }
  ctx.textAlign = prev;
  return total;
}

function fitText(text, px, family, maxW, weight = 400) {
  let size = px;
  do {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxW) break;
    size -= 2;
  } while (size > 14);
  return size;
}

const money = (v) => '₹' + String(v).replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/* ------------------------------------------------------------ mark + ring */

function diamond(cx, cy, side, fill) {
  const h = (side / 2) * Math.SQRT2;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(cx, cy - h); ctx.lineTo(cx + h, cy);
  ctx.lineTo(cx, cy + h); ctx.lineTo(cx - h, cy);
  ctx.closePath(); ctx.fill();
}

// Ratios taken from brand-kit/logo/jadauco-mark.svg so the device stays on-brand
function ring(cx, cy, r, stroke, rule, bg) {
  ctx.lineWidth = stroke;
  ctx.strokeStyle = rule;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  const stone = stroke * 2.33;
  diamond(cx, cy - r, stone + stroke * 0.78, bg);   // notch takes the ground colour
  diamond(cx, cy - r, stone, GOLD);
}

function wordmark(cx, y, size, fg, accent) {
  ctx.fillStyle = fg;
  ctx.font = `400 ${size}px Alegreya, Georgia, serif`;
  ctx.textBaseline = 'alphabetic';
  tracked('JADAUCO', cx, y, size * 0.13);
  ctx.fillStyle = accent;
  ctx.font = `400 ${size * 0.30}px "IBM Plex Mono", monospace`;
  tracked('IMITATION JEWELLERY', cx, y + size * 0.62, size * 0.30 * 0.30);
}

function drawPiece(pc, boxX, boxY, boxW, boxH) {
  const s = Math.min(boxW / pc.width, boxH / pc.height);
  const w = pc.width * s, h = pc.height * s;
  ctx.drawImage(pc, boxX + (boxW - w) / 2, boxY + (boxH - h) / 2, w, h);
}

/* ------------------------------------------------------------------ draw */

function draw() {
  const { w, h } = FORMATS[state.format];
  const g = GROUNDS[state.ground];
  canvas.width = w; canvas.height = h;
  $('cap').textContent = `${w} × ${h}`;

  ctx.fillStyle = g.bg;
  ctx.fillRect(0, 0, w, h);

  const M = Math.round(w * 0.085);
  const cx = w / 2;
  const photo = state.photos[state.active];

  // --- header
  wordmark(cx, M + w * 0.045, w * 0.052, g.fg, g.accent);

  // --- footer block, measured from the bottom up
  const title = ($('title').value || '').trim();
  const spec  = ($('spec').value || '').trim();
  const sku   = ($('sku').value || '').trim().toUpperCase();
  const price = ($('price').value || '').replace(/\D/g, '');
  const mrp   = ($('mrp').value || '').replace(/\D/g, '');

  let y = h - M;

  if (sku) {
    ctx.fillStyle = g.mut;
    ctx.font = `400 ${w * 0.024}px "IBM Plex Mono", monospace`;
    tracked(sku, cx, y, w * 0.024 * 0.16);
    y -= w * 0.055;
  }

  if (price) {
    const ps = w * 0.058;
    ctx.font = `400 ${ps}px "IBM Plex Mono", monospace`;
    const pw = ctx.measureText(money(price)).width;
    let mw = 0;
    if (mrp) {
      ctx.font = `400 ${ps * 0.6}px "IBM Plex Mono", monospace`;
      mw = ctx.measureText(money(mrp)).width + ps * 0.4;
    }
    let px = cx - (pw + mw) / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = g.accent;
    ctx.font = `400 ${ps}px "IBM Plex Mono", monospace`;
    ctx.fillText(money(price), px, y);
    if (mrp) {
      const mx = px + pw + ps * 0.4;
      ctx.fillStyle = g.mut;
      ctx.font = `400 ${ps * 0.6}px "IBM Plex Mono", monospace`;
      const t = money(mrp);
      ctx.fillText(t, mx, y);
      const tw = ctx.measureText(t).width;
      ctx.strokeStyle = g.mut;
      ctx.lineWidth = Math.max(1, w * 0.002);
      ctx.beginPath();
      ctx.moveTo(mx, y - ps * 0.19);
      ctx.lineTo(mx + tw, y - ps * 0.19);
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    y -= w * 0.062;
  }

  if (spec) {
    ctx.fillStyle = g.mut;
    const ss = fitText(spec.toUpperCase(), w * 0.023, '"IBM Plex Mono", monospace', w - M * 2);
    tracked(spec.toUpperCase(), cx, y, ss * 0.14);
    y -= w * 0.05;
  }

  if (title) {
    ctx.fillStyle = g.fg;
    const ts = fitText(title, w * 0.072, 'Alegreya, Georgia, serif', w - M * 2);
    ctx.font = `400 ${ts}px Alegreya, Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillText(title, cx, y);
    y -= ts * 0.62;
  }

  // --- the piece, in whatever room is left between header and footer
  const top = M + w * 0.13;
  const bottom = y - w * 0.03;
  const zoneH = Math.max(w * 0.2, bottom - top);
  const zoneY = top;

  if (!photo) {
    ctx.fillStyle = g.mut;
    ctx.font = `400 ${w * 0.026}px "IBM Plex Mono", monospace`;
    tracked('ADD A PHOTO', cx, zoneY + zoneH / 2, w * 0.026 * 0.3);
    return;
  }

  if (state.layout === 'ring') {
    const r = Math.min(zoneH, w - M * 2) * 0.44;
    const rcy = zoneY + zoneH / 2;
    ring(cx, rcy, r, Math.max(4, w * 0.0085), g.rule, g.bg);
    const inner = r * 1.36;                    // fits inside the ring with air
    drawPiece(photo.keyed, cx - inner / 2, rcy - inner / 2, inner, inner);
  } else {
    drawPiece(photo.keyed, M, zoneY, w - M * 2, zoneH);
  }
}

/* ------------------------------------------------------------- interface */

function loadFiles(files) {
  const list = [...files].filter((f) => f.type.startsWith('image/'));
  if (!list.length) return;
  let pending = list.length;
  list.forEach((file) => {
    const img = new Image();
    img.onload = () => {
      const photo = { name: file.name, img, keyed: null };
      reKey(photo);
      state.photos.push(photo);
      if (state.active < 0) state.active = 0;
      if (--pending === 0) { renderQueue(); draw(); }
    };
    img.onerror = () => {
      status(`Could not read ${file.name}`);
      if (--pending === 0) { renderQueue(); draw(); }
    };
    img.src = URL.createObjectURL(file);
  });
}

function renderQueue() {
  const q = $('queue'), t = $('thumbs');
  q.hidden = state.photos.length === 0;
  $('queueCount').textContent = state.photos.length ? `(${state.photos.length})` : '';
  $('saveAll').hidden = state.photos.length < 2;
  t.textContent = '';
  state.photos.forEach((p, i) => {
    const im = document.createElement('img');
    im.src = p.img.src;
    im.alt = p.name;
    im.title = p.name;
    if (i === state.active) im.className = 'on';
    im.addEventListener('click', () => { state.active = i; renderQueue(); draw(); });
    t.appendChild(im);
  });
}

function status(msg) { $('status').textContent = msg; }

function seg(id, key, after) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    [...e.currentTarget.children].forEach((c) => c.classList.toggle('on', c === b));
    state[key] = b.dataset.v;
    if (after) after();
    draw();
  });
}

seg('format', 'format');
seg('layout', 'layout');
seg('ground', 'ground');

['title', 'sku', 'price', 'mrp', 'spec'].forEach((id) =>
  $(id).addEventListener('input', draw));

function reKeyAll() {
  state.photos.forEach(reKey);
}

$('cut').addEventListener('input', (e) => {
  state.cut = +e.target.value; $('cutOut').textContent = state.cut;
  reKeyAll(); draw();
});
$('feather').addEventListener('input', (e) => {
  state.feather = +e.target.value; $('featherOut').textContent = state.feather;
  reKeyAll(); draw();
});
$('keyOn').addEventListener('change', (e) => {
  state.keyOn = e.target.checked; reKeyAll(); draw();
});

const drop = $('drop');
drop.addEventListener('click', () => $('file').click());
drop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); }
});
$('file').addEventListener('change', (e) => loadFiles(e.target.files));
['dragenter', 'dragover'].forEach((t) =>
  drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) =>
  drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => loadFiles(e.dataTransfer.files));
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

function fileName() {
  const sku = ($('sku').value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  return `${sku || 'jadauco'}-${state.format}.png`;
}

$('save').addEventListener('click', async () => {
  if (!state.photos.length) { status('Add a photo first.'); return; }
  const url = canvas.toDataURL('image/png');
  if (window.jadauco) {
    const r = await window.jadauco.saveImage(url, fileName());
    status(r.saved ? `Saved to ${r.filePath}` : 'Not saved.');
  } else {
    const a = document.createElement('a');
    a.href = url; a.download = fileName(); a.click();
    status('Downloaded.');
  }
});

$('saveAll').addEventListener('click', async () => {
  if (!window.jadauco) { status('Save all needs the desktop app.'); return; }
  const folder = await window.jadauco.chooseFolder();
  if (!folder) return;
  const keep = state.active;
  for (let i = 0; i < state.photos.length; i++) {
    state.active = i; draw();
    const base = state.photos[i].name.replace(/\.[^.]+$/, '');
    await window.jadauco.writeInto(folder, `${base}-${state.format}.png`,
      canvas.toDataURL('image/png'));
    status(`Saved ${i + 1} of ${state.photos.length}…`);
  }
  state.active = keep; draw();
  status(`Saved ${state.photos.length} images to ${folder}`);
});

// Wait for the brand faces before the first paint, or the canvas measures
// fallback metrics and every label lands in the wrong place.
(async () => {
  try {
    await Promise.all([
      document.fonts.load('400 60px Alegreya'),
      document.fonts.load('400 20px "IBM Plex Mono"'),
      document.fonts.load('400 20px Karla'),
    ]);
    await document.fonts.ready;
  } catch { /* fall back to the stack in styles.css */ }
  draw();
})();
