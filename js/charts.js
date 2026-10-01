// графики рисуем руками в svg — без библиотек
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function smoothPath(pts, top, bottom) {
  if (!pts.length) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, clamp(p1[1] + (p2[1] - p0[1]) / 6, top, bottom)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, clamp(p2[1] - (p3[1] - p1[1]) / 6, top, bottom)];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

// разбить точки на непрерывные куски (null = разрыв)
function segments(values, x, y) {
  const out = [];
  let cur = [];
  values.forEach((v, i) => {
    if (v == null) { if (cur.length) out.push(cur); cur = []; }
    else cur.push([x(i), y(v)]);
  });
  if (cur.length) out.push(cur);
  return out;
}

// спарклайн для сетки привычек: точки строго по колонкам шириной col
export function sparkline(values, col, h = 56) {
  const w = values.length * col, pad = 8;
  const x = i => i * col + col / 2, y = v => pad + (1 - v) * (h - pad * 2);
  const segs = segments(values, x, y);
  const lines = segs.map(s => `<polyline points="${s.map(p => p.join(',')).join(' ')}"/>`).join('');
  const fills = segs.filter(s => s.length > 1).map(s =>
    `<path class="fill" d="M${s[0][0]},${h} L${s.map(p => p.join(',')).join(' L')} L${s.at(-1)[0]},${h}Z"/>`).join('');
  const dots = segs.flat().map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3"/>`).join('');
  return `<svg class="sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${fills}${lines}${dots}</svg>`;
}

// большой график с заливкой и подсказкой при наведении. points: [{label, v (0..1 | null)}]
export function areaChart(el, points, { height = 300, fmt = v => Math.round(v * 100) + '%' } = {}) {
  const w = el.clientWidth || 600, h = height, top = 16, bottom = h - 30;
  const n = points.length;
  const x = i => (n === 1 ? w / 2 : 8 + i * (w - 16) / (n - 1));
  const y = v => top + (1 - v) * (bottom - top);
  const segs = segments(points.map(p => p.v), x, y);
  const paths = segs.map(s => {
    const d = smoothPath(s, top, bottom);
    return `<path class="area" d="${d} L${s.at(-1)[0]},${bottom} L${s[0][0]},${bottom}Z"/><path class="line" d="${d}"/>`;
  }).join('');
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 90))));
  const labels = points.map((p, i) => (i % step === 0 || i === n - 1)
    ? `<text x="${x(i)}" y="${h - 6}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${p.label}</text>` : '').join('');
  el.innerHTML = `<svg width="${w}" height="${h}" class="area-chart">
    <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--accent)" stop-opacity=".45"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
    </linearGradient></defs>
    ${[0, .5, 1].map(v => `<line class="gridline" x1="0" x2="${w}" y1="${y(v)}" y2="${y(v)}"/>`).join('')}
    ${paths}${labels}
    <line class="hover-line" y1="${top}" y2="${bottom}" visibility="hidden"/>
    <circle class="hover-dot" r="6" visibility="hidden"/>
  </svg><div class="chart-tip" hidden></div>`;
  const s = el.querySelector('svg'), tip = el.querySelector('.chart-tip');
  const line = s.querySelector('.hover-line'), dot = s.querySelector('.hover-dot');
  const hide = () => { line.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  s.addEventListener('pointermove', e => {
    const r = s.getBoundingClientRect();
    const i = clamp(Math.round((e.clientX - r.left - 8) / ((w - 16) / Math.max(1, n - 1))), 0, n - 1);
    const p = points[i];
    if (p.v == null) return hide();
    const px = x(i), py = y(p.v);
    line.setAttribute('x1', px); line.setAttribute('x2', px); line.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', px); dot.setAttribute('cy', py); dot.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.innerHTML = `<span>${p.label}</span><b>${fmt(p.v)}</b>`;
    tip.style.left = clamp(px, 40, w - 40) + 'px';
    tip.style.top = Math.max(0, py - 64) + 'px';
  });
  s.addEventListener('pointerleave', hide);
}

// несколько линий (настрой за неделю). series: [{color, values: (number|null)[]}], значения 0..max
export function lineChart(el, series, labels, { height = 200, max = 10 } = {}) {
  const w = el.clientWidth || 500, h = height, top = 12, bottom = h - 28, n = labels.length;
  const x = i => 20 + i * (w - 40) / (n - 1);
  const y = v => top + (1 - v / max) * (bottom - top);
  const lines = series.map(sr => segments(sr.values, x, y).map(seg =>
    seg.length > 1
      ? `<path d="${smoothPath(seg, top, bottom)}" stroke="${sr.color}" class="mline"/>`
      : `<circle cx="${seg[0][0]}" cy="${seg[0][1]}" r="3.5" fill="${sr.color}"/>`).join('')).join('');
  el.innerHTML = `<svg width="${w}" height="${h}" class="line-chart">
    ${[0, max / 2, max].map(v => `<line class="gridline" x1="0" x2="${w}" y1="${y(v)}" y2="${y(v)}"/>`).join('')}
    ${lines}
    ${labels.map((l, i) => `<text x="${x(i)}" y="${h - 6}" text-anchor="middle">${l}</text>`).join('')}
  </svg>`;
}
