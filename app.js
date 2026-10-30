/* Sound Macajalar Bay
   An interactive study: drag a sounding line across an illustrative chart and read the seabed profile.
   The coastline is hand-drawn and the depths come from depthFn() below. Neither is survey data. */
(() => {
  'use strict';

  /* ---------- geometry ---------- */

  const W = 1000, H = 856;                     // chart units
  const LON0 = 124.30, LAT0 = 8.95;            // north-west corner
  const KX = 1548.6, KY = 1557;                // units per degree of longitude / latitude
  const KM_PER_UNIT = 110.6 / KY;
  const NM_PER_UNIT = KM_PER_UNIT / 1.852;
  const M_PER_FM = 1.8288;
  const SVGNS = 'http://www.w3.org/2000/svg';

  const proj = (lo, la) => [(lo - LON0) * KX, (LAT0 - la) * KY];
  const unproj = (x, y) => [LON0 + x / KX, LAT0 - y / KY];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function el(name, attrs, parent) {
    const n = document.createElementNS(SVGNS, name);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- the coast (hand-drawn, approximate) ---------- */

  const COAST_LL = [
    [124.30, 8.47], [124.33, 8.53], [124.38, 8.58], [124.43, 8.615], [124.46, 8.625],
    [124.50, 8.605], [124.535, 8.565], [124.575, 8.52], [124.625, 8.495], [124.66, 8.487],
    [124.70, 8.50], [124.735, 8.525], [124.765, 8.565], [124.76, 8.615], [124.785, 8.665],
    [124.80, 8.735], [124.825, 8.80], [124.85, 8.87], [124.89, 8.93],
  ];

  function roughen(pts, levels, amp, rand) {
    for (let l = 0; l < levels; l++) {
      const out = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
        const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
        const off = (rand() - 0.5) * 2 * len * amp;
        out.push(pts[i], [(x1 + x2) / 2 - (dy / len) * off, (y1 + y2) / 2 + (dx / len) * off]);
      }
      out.push(pts[pts.length - 1]);
      pts = out;
    }
    return pts;
  }

  const coastBase = COAST_LL.map(([lo, la]) => proj(lo, la));
  coastBase[0][0] = 0;
  coastBase.push([W, 0]);
  const coast = roughen(coastBase, 3, 0.15, rng(8487));
  const landPoly = [[0, H], ...coast, [W, H]];

  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function inLand(x, y) {
    let inside = false;
    for (let i = 0, j = landPoly.length - 1; i < landPoly.length; j = i++) {
      const [xi, yi] = landPoly[i], [xj, yj] = landPoly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /* ---------- the depth field (a formula, not a survey) ---------- */

  const BANK = proj(124.60, 8.685);
  const CAN_A = proj(124.666, 8.49), CAN_B = proj(124.69, 8.80);
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  function depthFn(x, y, shoreKm) {
    let d = 790 * Math.pow(1 - Math.exp(-shoreKm / 14), 1.4);
    // one shoal bank, placed by hand
    const bk = Math.hypot(x - BANK[0], y - BANK[1]) * KM_PER_UNIT;
    d *= 1 - 0.5 * Math.exp(-(bk * bk) / (2 * 3.2 * 3.2));
    // one canyon running out from the river mouth, placed by hand
    const ax = CAN_A[0], ay = CAN_A[1], dx = CAN_B[0] - ax, dy = CAN_B[1] - ay;
    const s = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
    const perp = Math.hypot(x - (ax + s * dx), y - (ay + s * dy)) * KM_PER_UNIT;
    d *= 1 + 0.45 * Math.exp(-(perp * perp) / 4) * smooth(0.08, 0.45, s);
    // gentle undulation
    d *= 1 + 0.05 * Math.sin(x * 0.012 + 1.3) * Math.cos(y * 0.015 + 0.4) + 0.03 * Math.sin((x + y) * 0.03);
    return Math.max(d, 0.4);
  }

  const GS = 4;
  const NX = Math.round(W / GS) + 1, NY = Math.ceil(H / GS) + 1;
  const grid = new Float32Array(NX * NY);

  (function buildField() {
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const x = i * GS, y = j * GS;
        let dm = Infinity;
        for (let k = 0; k < coast.length - 1; k++) {
          const d = segDist(x, y, coast[k][0], coast[k][1], coast[k + 1][0], coast[k + 1][1]);
          if (d < dm) dm = d;
        }
        const km = dm * KM_PER_UNIT;
        grid[j * NX + i] = inLand(x, y) ? -Math.max(km, 0.01) : depthFn(x, y, km);
      }
    }
  })();

  /** Charted depth in metres at a chart point; zero or negative on land. */
  function depthAt(x, y) {
    const gx = clamp(x / GS, 0, NX - 1.001), gy = clamp(y / GS, 0, NY - 1.001);
    const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
    const a = grid[j * NX + i], b = grid[j * NX + i + 1], c = grid[(j + 1) * NX + i], d = grid[(j + 1) * NX + i + 1];
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
  }

  /* ---------- state ---------- */

  const BANDS = [
    { lo: 0, hi: 10, color: '#8bc1d8' },
    { lo: 10, hi: 30, color: '#abd4e4' },
    { lo: 30, hi: 100, color: '#c6e2ec' },
    { lo: 100, hi: 300, color: '#dcedf2' },
    { lo: 300, hi: 600, color: '#ecf5f6' },
    { lo: 600, hi: Infinity, color: '#f6faf9' },
  ];

  const PRESETS = {
    out: { A: proj(124.663, 8.492), B: proj(124.636, 8.845) },
    across: { A: proj(124.462, 8.636), B: proj(124.80, 8.748) },
    east: { A: proj(124.718, 8.548), B: proj(124.832, 8.868) },
  };

  const S = {
    A: PRESETS.out.A.slice(),
    B: PRESETS.out.B.slice(),
    cursor: 0.62,
    tide: 1,
    unit: 'm',
  };

  let u = 1;                 // chart units per screen pixel
  let narrow = false;        // phone-width chart: fewer labels, smaller rose
  let sweeping = false;
  let tween = null;
  let prof = null;           // last computed profile
  let profLayout = null;

  const svg = $('chart');
  const gTint = $('gTint'), gContours = $('gContours'), gLand = $('gLand'), gGrat = $('gGrat');
  const gLabels = $('gLabels'), gSoundings = $('gSoundings'), gLine = $('gLine');
  const gRose = $('gRose'), gScale = $('gScale');
  const profile = $('profile');

  /* ---------- formatting ---------- */

  const dispDepth = (m) => (S.unit === 'fm' ? m / M_PER_FM : m);
  const unitName = () => (S.unit === 'fm' ? 'fm' : 'm');
  function fmtDepth(m, withUnit = true) {
    const v = dispDepth(m);
    const s = v < 20 ? v.toFixed(1) : Math.round(v).toLocaleString('en');
    return withUnit ? `${s} ${unitName()}` : s;
  }
  function fmtDM(v, hemi) {
    let d = Math.floor(v), m = (v - d) * 60;
    if (m.toFixed(1) === '60.0') { d += 1; m = 0; }
    return `${d}°${m.toFixed(1)}′${hemi}`;
  }
  const fmtPos = (x, y) => { const [lo, la] = unproj(x, y); return `${fmtDM(la, 'N')} ${fmtDM(lo, 'E')}`; };
  const fmtNm = (nm) => `${nm.toFixed(nm < 10 ? 2 : 1)} nm`;

  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  /* ---------- static chart layers ---------- */

  function hexRgb(h) { return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); }

  function drawTint() {
    const sc = 1.5, cw = Math.round(W * sc), ch = Math.round(H * sc);
    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(cw, ch);
    const cols = BANDS.map((b) => hexRgb(b.color));
    for (let py = 0; py < ch; py++) {
      for (let px = 0; px < cw; px++) {
        const d = depthAt(px / sc, py / sc);
        let b = 0;
        while (b < BANDS.length - 1 && d >= BANDS[b].hi) b++;
        const o = (py * cw + px) * 4, c = cols[b];
        img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    el('image', { href: cv.toDataURL('image/png'), x: 0, y: 0, width: W, height: H, preserveAspectRatio: 'none' }, gTint);
  }

  function contourPath(level) {
    const at = (i, j) => grid[j * NX + i];
    const ex = (v1, v2) => (level - v1) / (v2 - v1);
    let d = '';
    for (let j = 0; j < NY - 1; j++) {
      for (let i = 0; i < NX - 1; i++) {
        const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), e = at(i, j + 1);
        const idx = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (e > level ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const x0 = i * GS, y0 = j * GS;
        const T = [x0 + ex(a, b) * GS, y0];
        const R = [x0 + GS, y0 + ex(b, c) * GS];
        const B = [x0 + ex(e, c) * GS, y0 + GS];
        const L = [x0, y0 + ex(a, e) * GS];
        const seg = (p, q) => { d += `M${p[0].toFixed(1)} ${p[1].toFixed(1)}L${q[0].toFixed(1)} ${q[1].toFixed(1)}`; };
        switch (idx) {
          case 1: case 14: seg(L, B); break;
          case 2: case 13: seg(B, R); break;
          case 3: case 12: seg(L, R); break;
          case 4: case 11: seg(T, R); break;
          case 6: case 9: seg(T, B); break;
          case 7: case 8: seg(L, T); break;
          case 5: if ((a + b + c + e) / 4 > level) { seg(L, T); seg(B, R); } else { seg(T, R); seg(L, B); } break;
          case 10: if ((a + b + c + e) / 4 > level) { seg(T, R); seg(L, B); } else { seg(L, T); seg(B, R); } break;
        }
      }
    }
    return d;
  }

  function drawContours() {
    [10, 30, 100, 300, 600].forEach((lv) => el('path', { class: 'contour', 'data-level': lv, d: contourPath(lv) }, gContours));
  }

  function drawLand() {
    const pts = coast.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`);
    el('polygon', { class: 'land', points: `0,${H} ${pts.join(' ')} ${W},${H}` }, gLand);
    el('polyline', { class: 'coast', points: pts.join(' ') }, gLand);
    // river mouth at Cagayan de Oro
    const [mx, my] = nearestOnCoast(...proj(124.655, 8.487));
    el('path', { class: 'river', d: `M${mx} ${my}C${mx - 8} ${my + 40} ${mx + 14} ${my + 80} ${mx + 4} ${my + 130}` }, gLand);
  }

  function nearestOnCoast(x, y) {
    let best = null, bd = Infinity;
    for (let k = 0; k < coast.length - 1; k++) {
      const [ax, ay] = coast[k], [bx, by] = coast[k + 1];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 ? clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1) : 0;
      const px = ax + t * dx, py = ay + t * dy, d = Math.hypot(x - px, y - py);
      if (d < bd) { bd = d; best = [px, py]; }
    }
    return best;
  }

  /* ---------- dynamic layers (depend on screen scale) ---------- */

  function drawGraticule() {
    gGrat.textContent = '';
    el('rect', { class: 'frame', x: 0, y: 0, width: W, height: H }, gGrat);
    // lines every 10 minutes, ticks every 2 minutes
    for (let k = Math.ceil(LON0 * 30); k <= Math.floor((LON0 + W / KX) * 30); k++) {
      const x = (k / 30 - LON0) * KX, major = k % 5 === 0;
      if (major) el('line', { class: 'grat', x1: x, y1: 0, x2: x, y2: H }, gGrat);
      const tl = (major ? 10 : 5) * u;
      el('line', { class: 'tick', x1: x, y1: 0, x2: x, y2: -tl }, gGrat);
      el('line', { class: 'tick', x1: x, y1: H, x2: x, y2: H + tl }, gGrat);
      if (major) {
        const t1 = el('text', { class: 'tick-label', x, y: -16 * u, 'text-anchor': 'middle' }, gGrat);
        t1.textContent = fmtDM(k / 30, '').replace('.0', '');
        const t2 = el('text', { class: 'tick-label', x, y: H + 25 * u, 'text-anchor': 'middle' }, gGrat);
        t2.textContent = t1.textContent;
      }
    }
    for (let k = Math.ceil((LAT0 - H / KY) * 30); k <= Math.floor(LAT0 * 30); k++) {
      const y = (LAT0 - k / 30) * KY, major = k % 5 === 0;
      if (major) el('line', { class: 'grat', x1: 0, y1: y, x2: W, y2: y }, gGrat);
      const tl = (major ? 10 : 5) * u;
      el('line', { class: 'tick', x1: 0, y1: y, x2: -tl, y2: y }, gGrat);
      el('line', { class: 'tick', x1: W, y1: y, x2: W + tl, y2: y }, gGrat);
      if (major) {
        const txt = fmtDM(k / 30, '').replace('.0', '');
        const t1 = el('text', { class: 'tick-label', x: -14 * u, y, 'text-anchor': 'end', 'dominant-baseline': 'central' }, gGrat);
        t1.textContent = txt;
        const t2 = el('text', { class: 'tick-label', x: W + 14 * u, y, 'text-anchor': 'start', 'dominant-baseline': 'central' }, gGrat);
        t2.textContent = txt;
      }
    }
  }

  const TOWNS = [
    ['Initao', 124.30, 8.50, 'r'], ['Laguindingan', 124.462, 8.626, 'l'], ['Opol', 124.575, 8.52, 'l'],
    ['Cagayan de Oro', 124.66, 8.487, 'l'], ['Tagoloan', 124.735, 8.525, 'r'], ['Jasaan', 124.76, 8.615, 'r'],
    ['Balingasag', 124.80, 8.735, 'r'], ['Salay', 124.85, 8.87, 'r'],
  ];

  function drawLabels() {
    gLabels.textContent = '';
    const txt = (cls, x, y, s, extra) => {
      const t = el('text', Object.assign({ class: cls, x, y }, extra || {}), gLabels);
      t.textContent = s;
      return t;
    };
    txt('water-name halo', ...proj(124.55, 8.66), 'Macajalar Bay');
    txt('water-name halo', ...proj(124.42, 8.83), 'Bohol Sea');
    txt('note-text halo', W * 0.5, 20 * u, 'Camiguin Island lies off the chart to the north');

    const keep = ['Cagayan de Oro', 'Laguindingan', 'Balingasag'];
    TOWNS.forEach(([name, lo, la, side]) => {
      if (narrow && !keep.includes(name)) return;
      const [px, py] = nearestOnCoast(...proj(lo, la));
      el('circle', { class: 'town-dot', cx: px, cy: py, r: 3.2 * u }, gLabels);
      const sd = narrow && name === 'Laguindingan' ? 'r' : side;
      const dx = (sd === 'r' ? 8 : -8) * u;
      const t = txt('town land-halo', px + dx, py + (sd === 'r' ? 14 : 16) * u, name, { 'text-anchor': sd === 'r' ? 'start' : 'end' });
      if (name === 'Initao') t.setAttribute('x', px + 8 * u);
    });
    if (narrow) return;
    const rv = txt('water-name small', ...proj(124.67, 8.445), 'Cagayan de Oro River');
    rv.setAttribute('class', 'water-name small land-halo');
    rv.setAttribute('x', parseFloat(rv.getAttribute('x')) + 12 * u);
    rv.setAttribute('text-anchor', 'start');
    rv.setAttribute('y', parseFloat(rv.getAttribute('y')) + 16 * u);
  }

  let soundingNodes = [];
  function drawSoundings() {
    gSoundings.textContent = '';
    soundingNodes = [];
    const s = (narrow ? 30 : 36) * u, rand = rng(31), pad = 8 * u;
    const blocked = [...gLabels.querySelectorAll('text')].map((t) => {
      const b = t.getBBox();
      return { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 };
    });
    const cols = Math.floor(W / s), rows = Math.floor(H / s);
    const ox = (W - cols * s) / 2, oy = (H - rows * s) / 2;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = ox + (i + 0.5) * s + (rand() - 0.5) * s * 0.5;
        const y = oy + (j + 0.5) * s + (rand() - 0.5) * s * 0.5;
        if (y < 36 * u || x < 12 * u || x > W - 12 * u || y > H - 10 * u) continue;
        const d = depthAt(x, y);
        if (d < 1.5) continue;
        if (blocked.some((b) => x > b.x && x < b.x + b.width && y > b.y && y < b.y + b.height)) continue;
        const t = el('text', { class: 'sounding halo', x: x.toFixed(1), y: y.toFixed(1) }, gSoundings);
        t.textContent = fmtDepth(d, false);
        soundingNodes.push([t, d]);
      }
    }
  }
  function refreshSoundings() { soundingNodes.forEach(([t, d]) => { t.textContent = fmtDepth(d, false); }); }

  function drawRose() {
    gRose.textContent = '';
    const r = narrow ? 22 * u : Math.max(60, 34 * u), cx = W - r - 40 * u, cy = H - r - 56 * u;
    const g = el('g', null, gRose);
    el('circle', { class: 'rose-ring', cx, cy, r: r * 1.0 }, g);
    el('circle', { class: 'rose-ring thin', cx, cy, r: r * 0.8 }, g);
    let d = '';
    for (let a = 0; a < 360; a += 5) {
      const rad = (a - 90) * Math.PI / 180, long = a % 30 === 0, mid = a % 10 === 0;
      const r1 = r * (long ? 0.8 : mid ? 0.88 : 0.92);
      d += `M${cx + Math.cos(rad) * r1} ${cy + Math.sin(rad) * r1}L${cx + Math.cos(rad) * r} ${cy + Math.sin(rad) * r}`;
    }
    el('path', { class: 'rose-tick', d }, g);
    const star = (deg, len) => {
      const pt = (ang, rr) => { const rad = (ang - 90) * Math.PI / 180; return [cx + Math.cos(rad) * rr, cy + Math.sin(rad) * rr]; };
      const tip = pt(deg, len), l = pt(deg - 45, len * 0.24), rt = pt(deg + 45, len * 0.24);
      el('polygon', { class: 'rose-dark', points: [tip, l, [cx, cy]].map((p) => p.join(',')).join(' ') }, g);
      el('polygon', { class: 'rose-light', points: [tip, rt, [cx, cy]].map((p) => p.join(',')).join(' ') }, g);
    };
    [45, 135, 225, 315].forEach((a) => star(a, r * 0.52));
    [0, 90, 180, 270].forEach((a) => star(a, r * 0.76));
    const n = el('text', { class: 'rose-n', x: cx, y: cy - r - 7 * u }, g);
    n.textContent = 'N';
    const t = el('text', { class: 'scale-title', x: cx, y: cy + r + 18 * u, 'text-anchor': 'middle' }, g);
    t.textContent = 'True north';
    t.setAttribute('style', 'text-anchor:middle');
  }

  function drawScale() {
    gScale.textContent = '';
    const x0 = 28 * u + 4, y0 = H - 54 * u, h = 6 * u;
    const nmU = 1 / NM_PER_UNIT, kmU = 1 / KM_PER_UNIT;
    for (let i = 0; i < 5; i++) {
      el('rect', { class: i % 2 ? 'scale-bar-b' : 'scale-bar-a', x: x0 + i * nmU, y: y0, width: nmU, height: h }, gScale);
    }
    [0, 1, 2, 3, 4, 5].forEach((i) => {
      const t = el('text', { class: 'scale-label land-halo', x: x0 + i * nmU, y: y0 - 5 * u }, gScale);
      t.textContent = i;
    });
    const tt = el('text', { class: 'scale-title land-halo', x: x0 + 5 * nmU + 12 * u, y: y0 + h }, gScale);
    tt.textContent = 'nautical miles';
    if (narrow) return;
    const y1 = y0 + h + 12 * u;
    for (let i = 0; i < 4; i++) {
      el('rect', { class: i % 2 ? 'scale-bar-b' : 'scale-bar-a', x: x0 + i * 2.5 * kmU, y: y1, width: 2.5 * kmU, height: h }, gScale);
    }
    [0, 5, 10].forEach((km) => {
      const t = el('text', { class: 'scale-label land-halo', x: x0 + km * kmU, y: y1 + h + 14 * u }, gScale);
      t.textContent = km;
    });
    const tk = el('text', { class: 'scale-title land-halo', x: x0 + 10 * kmU + 12 * u, y: y1 + h }, gScale);
    tk.textContent = 'kilometres';
  }

  /* ---------- sounding line ---------- */

  const casing = el('path', { class: 'track-casing' }, gLine);
  const track = el('path', { class: 'track' }, gLine);
  const ticks = el('path', { class: 'track-ticks' }, gLine);
  const handles = {};
  ['A', 'B'].forEach((k) => {
    const g = el('g', { class: 'handle', tabindex: 0, role: 'group', 'data-end': k }, gLine);
    handles[k] = { g, hit: el('circle', { class: 'hit' }, g), ring: el('circle', { class: 'ring' }, g), disc: el('circle', { class: 'disc' }, g), label: el('text', null, g) };
    handles[k].label.textContent = k;
  });
  const lead = el('g', null, gLine);
  const leadDot = el('circle', { class: 'lead-dot' }, lead);
  const leadLabel = el('text', { class: 'lead-label' }, lead);

  function sizeHandles() {
    ['A', 'B'].forEach((k) => {
      const h = handles[k];
      h.hit.setAttribute('r', 26 * u);
      h.ring.setAttribute('r', 17 * u);
      h.disc.setAttribute('r', 12 * u);
    });
    leadDot.setAttribute('r', 6 * u);
  }

  function drawLine() {
    const [ax, ay] = S.A, [bx, by] = S.B;
    const d = `M${ax} ${ay}L${bx} ${by}`;
    casing.setAttribute('d', d);
    track.setAttribute('d', d);
    const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / (len || 1), uy = (by - ay) / (len || 1);
    let td = '';
    const nmU = 1 / NM_PER_UNIT;
    for (let k = 1; k * nmU < len - 14 * u; k++) {
      const px = ax + ux * k * nmU, py = ay + uy * k * nmU, tl = (k % 5 === 0 ? 8 : 4.5) * u;
      td += `M${px - uy * tl} ${py + ux * tl}L${px + uy * tl} ${py - ux * tl}`;
    }
    ticks.setAttribute('d', td);
    ['A', 'B'].forEach((k) => {
      const [x, y] = S[k], h = handles[k];
      [h.hit, h.ring, h.disc].forEach((c) => { c.setAttribute('cx', x); c.setAttribute('cy', y); });
      h.label.setAttribute('x', x); h.label.setAttribute('y', y);
      h.g.setAttribute('aria-label', `${k === 'A' ? 'Start' : 'End'} of the line, ${k}, at ${fmtPos(x, y)}. Use the arrow keys to move it.`);
    });
    const cx = lerp(ax, bx, S.cursor), cy = lerp(ay, by, S.cursor);
    leadDot.setAttribute('cx', cx); leadDot.setAttribute('cy', cy);
    const dep = depthAt(cx, cy);
    leadLabel.textContent = dep > 0 ? fmtDepth(dep) : 'land';
    const right = cx < W * 0.78;
    leadLabel.setAttribute('x', cx + (right ? 11 : -11) * u);
    leadLabel.setAttribute('y', cy - 11 * u);
    leadLabel.setAttribute('text-anchor', right ? 'start' : 'end');
  }

  /* ---------- profile ---------- */

  const N = 240;

  function sampleLine() {
    const [ax, ay] = S.A, [bx, by] = S.B;
    const lenU = Math.hypot(bx - ax, by - ay);
    const depth = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) depth[i] = depthAt(lerp(ax, bx, i / N), lerp(ay, by, i / N));
    return { depth, lenU, lenNm: lenU * NM_PER_UNIT, lenKm: lenU * KM_PER_UNIT };
  }

  function depthOnLine(p, t) {
    const f = clamp(t, 0, 1) * N, i = Math.min(Math.floor(f), N - 1);
    return lerp(p.depth[i], p.depth[i + 1], f - i);
  }

  function stats(p) {
    let deepI = 0, shallow = Infinity, landN = 0;
    for (let i = 0; i <= N; i++) {
      if (p.depth[i] > p.depth[deepI]) deepI = i;
      if (p.depth[i] <= 0) landN++;
    }
    const win = Math.max(1, Math.min(N, Math.round((0.5 / Math.max(p.lenNm, 0.01)) * N)));
    let best = 0, bi = 0;
    for (let i = 0; i + win <= N; i++) {
      const dd = Math.abs(Math.max(p.depth[i + win], 0) - Math.max(p.depth[i], 0));
      if (dd > best) { best = dd; bi = i; }
    }
    const runKm = (win / N) * p.lenKm;
    return {
      deep: Math.max(p.depth[deepI], 0), deepNm: (deepI / N) * p.lenNm,
      drop: best, dropNm: (win / N) * p.lenNm, slope: Math.atan2(best, runKm * 1000) * 180 / Math.PI,
      landNm: (landN / (N + 1)) * p.lenNm, shallow,
    };
  }

  function renderProfile() {
    const w = Math.max(profile.clientWidth, 200), h = profile.clientHeight || 280;
    profile.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const m = { l: 52, r: 16, t: 34, b: 44 };
    const pw = w - m.l - m.r, ph = h - m.t - m.b;
    profLayout = { w, h, m, pw, ph };
    const k = S.unit === 'fm' ? 1 / M_PER_FM : 1;
    const maxDisp = Math.max(...prof.depth, 5) * k;
    const step = niceStep((maxDisp * 1.04) / 5);
    const top = Math.ceil((maxDisp * 1.04) / step) * step;
    const ys = (dispD) => m.t + (dispD / top) * ph;
    const xs = (i) => m.l + (i / N) * pw;

    let s = '';
    BANDS.forEach((b) => {
      const y1 = b.lo * k, y2 = Math.min(b.hi * k, top);
      if (y1 >= top) return;
      s += `<rect x="${m.l}" y="${ys(y1).toFixed(1)}" width="${pw}" height="${(ys(y2) - ys(y1)).toFixed(1)}" fill="${b.color}"/>`;
    });
    for (let v = 0; v <= top + 1e-9; v += step) {
      const y = ys(v).toFixed(1);
      s += `<line class="pf-grid" x1="${m.l}" x2="${m.l + pw}" y1="${y}" y2="${y}"/>`;
      s += `<text x="${m.l - 8}" y="${y}" text-anchor="end" dominant-baseline="central">${v.toLocaleString('en')}</text>`;
    }
    const xstep = niceStep(prof.lenNm / 6 || 1);
    for (let v = 0; v <= prof.lenNm + 1e-9; v += xstep) {
      const x = (m.l + (prof.lenNm ? v / prof.lenNm : 0) * pw).toFixed(1);
      s += `<line class="pf-grid" x1="${x}" x2="${x}" y1="${m.t + ph}" y2="${m.t + ph + 5}"/>`;
      s += `<text x="${x}" y="${m.t + ph + 19}" text-anchor="middle">${+v.toFixed(2)}</text>`;
    }
    s += `<text class="pf-title" x="${m.l + pw / 2}" y="${h - 6}" text-anchor="middle">Distance from A, nautical miles</text>`;
    s += `<text class="pf-title" x="${m.l - 40}" y="${m.t - 14}">Depth, ${S.unit === 'fm' ? 'fathoms' : 'metres'} below chart datum</text>`;

    let d = `M${xs(0)} ${m.t + ph}`;
    for (let i = 0; i <= N; i++) d += `L${xs(i).toFixed(1)} ${ys(Math.max(prof.depth[i], 0) * k).toFixed(1)}`;
    d += `L${xs(N)} ${m.t + ph}Z`;
    s += `<path class="pf-seabed" d="${d}"/>`;
    let line = '';
    for (let i = 0; i <= N; i++) line += `${i ? 'L' : 'M'}${xs(i).toFixed(1)} ${ys(Math.max(prof.depth[i], 0) * k).toFixed(1)}`;
    s += `<path class="pf-seabed-line" d="${line}"/>`;

    // land runs
    let run = -1;
    for (let i = 0; i <= N + 1; i++) {
      const isLand = i <= N && prof.depth[i] <= 0;
      if (isLand && run < 0) run = i;
      if (!isLand && run >= 0) {
        const x1 = xs(run), x2 = xs(i - 1), wRun = Math.max(x2 - x1, 2);
        s += `<rect class="pf-land" x="${x1.toFixed(1)}" y="${m.t - 20}" width="${wRun.toFixed(1)}" height="${ph + 20}" opacity="0.92"/>`;
        if (wRun > 44) s += `<text class="pf-land-text" x="${((x1 + x2) / 2).toFixed(1)}" y="${m.t + 14}" text-anchor="middle">land</text>`;
        run = -1;
      }
    }
    s += `<line class="pf-axis" x1="${m.l}" x2="${m.l + pw}" y1="${m.t}" y2="${m.t}"/>`;

    // lead
    const lx = m.l + S.cursor * pw, ld = depthOnLine(prof, S.cursor), ly = ys(Math.max(ld, 0) * k);
    s += `<line class="pf-lead" x1="${lx.toFixed(1)}" x2="${lx.toFixed(1)}" y1="${m.t - 6}" y2="${ly.toFixed(1)}"/>`;
    s += `<circle class="pf-lead-dot" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="6"/>`;
    const onRight = S.cursor < 0.8;
    s += `<text class="pf-lead-label" x="${(lx + (onRight ? 10 : -10)).toFixed(1)}" y="${Math.max(ly - 12, m.t + 16).toFixed(1)}" text-anchor="${onRight ? 'start' : 'end'}">${ld > 0 ? fmtDepth(ld) : 'land'}</text>`;
    profile.innerHTML = s;

    const vert = ph / (top / k), horiz = pw / (prof.lenKm * 1000 || 1);
    $('veNote').textContent = `Vertical scale exaggerated about ${Math.max(1, Math.round(vert / horiz))} times, so slopes look steeper than they are.`;
  }

  /* ---------- readouts ---------- */

  function updateReadouts() {
    const st = stats(prof);
    const t = clamp(S.cursor, 0, 1);
    const x = lerp(S.A[0], S.B[0], t), y = lerp(S.A[1], S.B[1], t);
    const dep = depthOnLine(prof, t), distNm = t * prof.lenNm;
    if (dep > 0) {
      $('rDepth').textContent = fmtDepth(dep);
      $('rDepthSub').textContent = `charted. ${fmtDepth(dep + S.tide)} of water at this tide. ${fmtNm(distNm)} from A, ${fmtPos(x, y)}.`;
    } else {
      $('rDepth').textContent = 'Land';
      $('rDepthSub').textContent = `${fmtNm(distNm)} from A, ${fmtPos(x, y)}.`;
    }
    $('rLen').textContent = fmtNm(prof.lenNm);
    $('rLenSub').textContent = `${prof.lenKm.toFixed(1)} km${st.landNm > 0.05 ? `, ${fmtNm(st.landNm)} of it over land` : ''}`;
    $('rDeep').textContent = st.deep > 0 ? fmtDepth(st.deep) : 'None';
    $('rDeepSub').textContent = st.deep > 0 ? `${fmtNm(st.deepNm)} from A` : 'The line is entirely on land';
    $('rSteep').textContent = st.drop >= 1 ? fmtDepth(st.drop) : 'Flat';
    $('rSteepSub').textContent = st.drop >= 1 ? `in ${fmtNm(st.dropNm)}, a slope of about ${st.slope < 10 ? st.slope.toFixed(1) : Math.round(st.slope)}°` : 'Nothing steeper than a metre';
    $('thDepth').textContent = `Depth (${unitName()})`;

    profile.setAttribute('aria-valuenow', Math.round(t * 100));
    profile.setAttribute('aria-valuetext', dep > 0 ? `${fmtNm(distNm)} from A, ${fmtDepth(dep)} deep` : `${fmtNm(distNm)} from A, land`);
  }

  function updateTable() {
    const body = $('lineTable');
    if (!$('tableDetails').open) return;
    let rows = '';
    const nm = prof.lenNm;
    const dists = [];
    for (let v = 0; v < nm; v += 1) dists.push(v);
    dists.push(nm);
    dists.forEach((v) => {
      const t = nm ? v / nm : 0;
      const x = lerp(S.A[0], S.B[0], t), y = lerp(S.A[1], S.B[1], t), d = depthOnLine(prof, t);
      rows += `<tr><td>${v.toFixed(v === nm && v % 1 ? 2 : 0)} nm</td><td>${fmtPos(x, y)}</td><td>${d > 0 ? fmtDepth(d, false) : 'land'}</td></tr>`;
    });
    body.innerHTML = rows;
  }

  function announce() {
    const st = stats(prof);
    $('live').textContent = `Line from A to B, ${fmtNm(prof.lenNm)} long. Deepest water ${st.deep > 0 ? fmtDepth(st.deep) : 'none, all land'}.`;
    updateTable();
  }

  /* ---------- redraw scheduling ---------- */

  let queued = false;
  function update() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      prof = sampleLine();
      drawLine();
      renderProfile();
      updateReadouts();
    });
  }

  /* ---------- layout ---------- */

  const PAD = 40;
  function layout() {
    const width = svg.clientWidth;
    if (!width) return;
    u = W / Math.max(width - PAD * 2, 100);
    narrow = width < 560;
    const pad = PAD * u;
    svg.setAttribute('viewBox', `${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}`);
    svg.style.aspectRatio = `${W + pad * 2} / ${H + pad * 2}`;
    svg.style.setProperty('--u', u.toFixed(4));
    drawGraticule();
    drawLabels();
    drawSoundings();
    drawRose();
    drawScale();
    sizeHandles();
    update();
  }

  /* ---------- interaction: dragging the line ---------- */

  function toChart(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return [clamp(p.x, 0, W), clamp(p.y, 0, H)];
  }

  function stopAuto() { sweeping = false; if (tween) { tween.cancelled = true; tween = null; } }

  ['A', 'B'].forEach((k) => {
    const g = handles[k].g;
    let off = [0, 0];
    g.addEventListener('pointerdown', (e) => {
      stopAuto();
      g.setPointerCapture(e.pointerId);
      g.classList.add('drag');
      const [px, py] = toChart(e);
      off = [S[k][0] - px, S[k][1] - py];
      e.preventDefault();
    });
    g.addEventListener('pointermove', (e) => {
      if (!g.hasPointerCapture(e.pointerId)) return;
      const [px, py] = toChart(e);
      S[k] = [clamp(px + off[0], 0, W), clamp(py + off[1], 0, H)];
      update();
    });
    const end = (e) => {
      if (!g.classList.contains('drag')) return;
      g.classList.remove('drag');
      if (g.hasPointerCapture(e.pointerId)) g.releasePointerCapture(e.pointerId);
      announce();
    };
    g.addEventListener('pointerup', end);
    g.addEventListener('pointercancel', end);
    g.addEventListener('keydown', (e) => {
      const stepU = (e.shiftKey ? 1 : 0.25) / NM_PER_UNIT;
      const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!dir) return;
      e.preventDefault();
      stopAuto();
      S[k] = [clamp(S[k][0] + dir[0] * stepU, 0, W), clamp(S[k][1] + dir[1] * stepU, 0, H)];
      update();
    });
    g.addEventListener('keyup', (e) => { if (e.key.startsWith('Arrow')) announce(); });
  });

  // a tap on open chart moves the nearer end there
  svg.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('.handle')) return;
    const p = toChart(e);
    const da = Math.hypot(p[0] - S.A[0], p[1] - S.A[1]), db = Math.hypot(p[0] - S.B[0], p[1] - S.B[1]);
    stopAuto();
    moveTo(da <= db ? { A: p, B: S.B.slice() } : { A: S.A.slice(), B: p });
  });

  function moveTo(target, then) {
    stopAuto();
    if (reduceMotion.matches) {
      S.A = target.A.slice(); S.B = target.B.slice();
      update(); announce();
      if (then) then();
      return;
    }
    const from = { A: S.A.slice(), B: S.B.slice() };
    const t0 = performance.now(), dur = 650;
    const job = { cancelled: false };
    tween = job;
    const step = (now) => {
      if (job.cancelled) return;
      const t = ease(clamp((now - t0) / dur, 0, 1));
      ['A', 'B'].forEach((k) => { S[k] = [lerp(from[k][0], target[k][0], t), lerp(from[k][1], target[k][1], t)]; });
      update();
      if (t < 1) requestAnimationFrame(step);
      else { tween = null; announce(); if (then) then(); }
    };
    requestAnimationFrame(step);
  }

  document.querySelectorAll('[data-preset]').forEach((b) => {
    b.addEventListener('click', () => {
      const p = PRESETS[b.dataset.preset];
      moveTo({ A: p.A.slice(), B: p.B.slice() });
    });
  });

  /* ---------- interaction: the lead on the profile ---------- */

  function setCursorFromEvent(e) {
    if (!profLayout) return;
    const r = profile.getBoundingClientRect();
    S.cursor = clamp((e.clientX - r.left - profLayout.m.l) / profLayout.pw, 0, 1);
    update();
  }
  let scrubbing = false;
  profile.addEventListener('pointerdown', (e) => {
    stopAuto();
    scrubbing = true;
    profile.setPointerCapture(e.pointerId);
    setCursorFromEvent(e);
  });
  profile.addEventListener('pointermove', (e) => {
    if (scrubbing || e.pointerType === 'mouse') setCursorFromEvent(e);
  });
  const endScrub = (e) => { scrubbing = false; if (profile.hasPointerCapture(e.pointerId)) profile.releasePointerCapture(e.pointerId); };
  profile.addEventListener('pointerup', endScrub);
  profile.addEventListener('pointercancel', endScrub);
  profile.addEventListener('keydown', (e) => {
    const dx = { ArrowLeft: -0.01, ArrowRight: 0.01, PageDown: -0.1, PageUp: 0.1 }[e.key];
    if (dx === undefined && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    stopAuto();
    S.cursor = e.key === 'Home' ? 0 : e.key === 'End' ? 1 : clamp(S.cursor + dx, 0, 1);
    update();
  });

  function sweep() {
    if (reduceMotion.matches) return;
    sweeping = true;
    S.cursor = 0;
    const t0 = performance.now(), dur = 3200;
    const step = (now) => {
      if (!sweeping) return;
      const t = clamp((now - t0) / dur, 0, 1);
      S.cursor = ease(t) * 0.62;
      update();
      if (t < 1) requestAnimationFrame(step); else sweeping = false;
    };
    requestAnimationFrame(step);
  }

  /* ---------- units ---------- */

  function renderTints() {
    const k = S.unit === 'fm' ? 1 / M_PER_FM : 1;
    const label = (b) => {
      const lo = Math.round(b.lo * k), hi = Math.round(b.hi * k);
      return b.hi === Infinity ? `over ${lo}` : `${lo}–${hi}`;
    };
    $('tints').innerHTML = BANDS.map((b) => `<li><span class="sw" style="background:${b.color}"></span>${label(b)} ${unitName()}</li>`).join('');
  }

  function setUnit(unit) {
    S.unit = unit;
    $('unitM').setAttribute('aria-pressed', unit === 'm');
    $('unitFm').setAttribute('aria-pressed', unit === 'fm');
    refreshSoundings();
    renderTints();
    update();
    announce();
  }
  $('unitM').addEventListener('click', () => setUnit('m'));
  $('unitFm').addEventListener('click', () => setUnit('fm'));
  $('tableDetails').addEventListener('toggle', updateTable);

  /* ---------- tide ---------- */

  const tideAt = (t) => 1.05 + 0.62 * Math.cos((2 * Math.PI * (t - 3.2)) / 12.42) + 0.28 * Math.cos((2 * Math.PI * (t - 9.5)) / 24.84);

  function tideRows() {
    const rows = [], e = 1 / 12;
    for (let m = 5; m < 24 * 60 - 5; m += 5) {
      const t = m / 60, a = tideAt(t - e), b = tideAt(t), c = tideAt(t + e);
      if (b > a && b >= c) rows.push({ t, h: b, kind: 'High' });
      else if (b < a && b <= c) rows.push({ t, h: b, kind: 'Low' });
    }
    return rows;
  }
  const hhmm = (t) => `${String(Math.floor(t)).padStart(2, '0')}:${String(Math.round((t % 1) * 60) % 60).padStart(2, '0')}`;

  function renderTideTable() {
    const rows = tideRows();
    $('tideRows').innerHTML = rows.map((r, i) => (
      `<tr data-h="${r.h.toFixed(2)}"><td><button type="button" data-i="${i}">${hhmm(r.t)}</button></td><td>${r.kind}</td><td>${r.h.toFixed(2)} m</td></tr>`
    )).join('');
    $('tideRows').querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => { setTide(rows[+b.dataset.i].h); });
    });
  }

  function drawGauge() {
    const top = 14, bot = 188, max = 2.2, y = (h) => bot - (h / max) * (bot - top);
    let s = `<rect x="30" y="${top}" width="18" height="${bot - top}" fill="#f6f8f4" stroke="#12202b" stroke-width="1.5"/>`;
    s += `<rect x="31" y="${y(S.tide).toFixed(1)}" width="16" height="${(bot - y(S.tide)).toFixed(1)}" fill="#8bc1d8"/>`;
    for (let h = 0; h <= 2.0001; h += 0.25) {
      const yy = y(h).toFixed(1), major = Math.abs(h % 0.5) < 1e-6;
      s += `<line x1="48" x2="${major ? 58 : 54}" y1="${yy}" y2="${yy}" stroke="#12202b" stroke-width="1.2"/>`;
      if (major) s += `<text x="61" y="${yy}" dominant-baseline="central">${h.toFixed(1)}</text>`;
    }
    s += `<polygon points="26,${(y(S.tide) - 7).toFixed(1)} 26,${(y(S.tide) + 7).toFixed(1)} 14,${y(S.tide).toFixed(1)}" fill="#a3125f"/>`;
    $('gauge').innerHTML = s;
    $('gauge').setAttribute('aria-label', `Tide staff: water at ${S.tide.toFixed(2)} metres above chart datum`);
  }

  function setTide(h) {
    S.tide = clamp(Math.round(h * 20) / 20, 0, 2.2);
    $('tideRange').value = S.tide;
    $('tideOut').textContent = `${S.tide.toFixed(2)} m`;
    drawGauge();
    document.querySelectorAll('#tideRows tr').forEach((tr) => {
      tr.classList.toggle('current', Math.abs(parseFloat(tr.dataset.h) - S.tide) < 0.025);
    });
    if (prof) updateReadouts();
  }
  $('tideRange').addEventListener('input', (e) => setTide(parseFloat(e.target.value)));

  /* ---------- start ---------- */

  drawTint();
  drawContours();
  drawLand();
  renderTints();
  renderTideTable();
  setTide(S.tide);
  prof = sampleLine();
  layout();
  announce();

  let rz = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(layout); });
  if (window.ResizeObserver) new ResizeObserver(() => { cancelAnimationFrame(rz); rz = requestAnimationFrame(layout); }).observe(svg);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { update(); });

  // entrances: parts of each section rise once as they scroll in; skipped for reduced motion
  if (!reduceMotion.matches && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.12 });
    document.querySelectorAll('.presets, .chart-wrap, .tints, .read-col .panel, .tide, .notes h2, .notes-cols > div, .foot-name').forEach((n, i) => {
      n.classList.add('reveal');
      n.style.setProperty('--d', `${(i % 3) * 80}ms`);
      io.observe(n);
    });
  }

  if (reduceMotion.matches) S.cursor = 0.62; else setTimeout(sweep, 700);
})();
