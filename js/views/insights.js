import { getState, update } from '../store.js';
import * as D from '../dates.js';
import * as L from '../logic.js';
import { esc } from '../ui.js';
import { areaChart } from '../charts.js';

export const title = 'аналитика';

let days = 30, filter = 'all', board = 'daily', jOffset = 0, saveTimer;
const MEDALS = ['🥇', '🥈', '🥉'];

function series(s) {
  const t = D.today(), ks = D.range(D.addDays(t, -(days - 1)), t);
  const h = L.active(s).find(x => x.id === filter);
  return ks.map(k => ({
    label: D.fmtShort(k),
    // для одной ежедневной привычки берём скользящие 7 дней, иначе график — сплошные 0 и 100
    v: !h ? L.dayRate(s, k)
      : h.rhythm === 'daily' ? (k < h.created ? null : L.rate(s, h, D.addDays(k, -6), k))
      : (k < h.created ? null : L.progressAsOf(s, h, k)),
  }));
}

function heatmap(s, t) {
  const start = D.addDays(D.weekStart(t), -7 * 25);
  const cells = D.range(start, D.addDays(D.weekStart(t), 6)).map(k => {
    if (k > t) return '<i class="hm-cell future"></i>';
    const r = L.dayRate(s, k);
    const lvl = r == null ? 0 : r === 0 ? 1 : r < .34 ? 2 : r < .67 ? 3 : r < 1 ? 4 : 5;
    return `<i class="hm-cell l${lvl}" title="${D.fmtShort(k)}: ${L.pct(r)}"></i>`;
  }).join('');
  return `<div class="heatmap-wrap" data-scroll-id="heat"><div class="heatmap">${cells}</div></div>
    <div class="hm-legend muted sm">меньше ${[1, 2, 3, 4, 5].map(l => `<i class="hm-cell l${l}"></i>`).join('')} больше</div>`;
}

export function render(root) {
  const s = getState(), t = D.today();
  const from = D.addDays(t, -(days - 1));
  const pts = series(s);
  const overall = L.avg(pts.map(p => p.v));

  const ws = D.weekStart(t);
  const thisWeek = L.avg(D.range(ws, t).map(k => L.dayRate(s, k)));
  const lastWeek = L.avg(D.range(D.addDays(ws, -7), D.addDays(ws, -1)).map(k => L.dayRate(s, k)));
  const diff = thisWeek != null && lastWeek != null ? Math.round((thisWeek - lastWeek) * 100) : null;

  const withStreak = L.active(s).map(h => ({ h, n: L.streak(s, h) })).sort((a, b) => b.n - a.n);
  const top = withStreak[0];
  const rated = L.active(s).map(h => ({ h, r: L.rate(s, h, from) })).filter(x => x.r != null);
  const weakest = [...rated].sort((a, b) => a.r - b.r)[0];
  const lb = rated.filter(x => x.h.rhythm === board).sort((a, b) => b.r - a.r);
  const strong = L.active(s).map(h => ({ h, v: L.strength(s, h) })).sort((a, b) => b.v - a.v);
  const maxStreak = Math.max(1, ...withStreak.map(x => x.n));

  const jm = D.addDays(D.monthStart(t), 0);
  const jDate = D.parse(jm); jDate.setMonth(jDate.getMonth() + jOffset);
  const jKey = D.key(jDate).slice(0, 7);
  const jStart = jKey + '-01', jEnd = D.monthEnd(jStart) < t ? D.monthEnd(jStart) : t;
  const jRate = jStart <= t ? L.avg(D.range(jStart, jEnd).map(k => L.dayRate(s, k))) : null;
  const jBest = L.active(s).map(h => ({ h, r: L.rate(s, h, jStart, jEnd) })).filter(x => x.r != null).sort((a, b) => b.r - a.r)[0];
  const jTasks = D.range(jStart, D.monthEnd(jStart)).flatMap(k => s.tasks[k] || []).filter(x => !x.moved);

  root.innerHTML = `
    <section class="panel big-chart">
      <div class="row between wrap gap">
        <div><div class="eyebrow">общая стабильность${filter === 'all' ? ' · ежедневные привычки' : ''}</div><div class="huge">${L.pct(overall)}</div></div>
        <div class="row gap wrap">
          <select data-set="filter"><option value="all">все привычки</option>${L.active(s).map(h => `<option value="${h.id}" ${filter === h.id ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select>
          <select data-set="days">${[7, 30, 90, 365].map(n => `<option value="${n}" ${days === n ? 'selected' : ''}>${n === 365 ? 'за год' : `последние ${n} дней`}</option>`).join('')}</select>
        </div>
      </div>
      <div class="chart" id="areaChart"></div>
    </section>
    <div class="tiles">
      <div class="panel tile"><div class="eyebrow">эта неделя</div><div class="big">${L.pct(thisWeek)}</div></div>
      <div class="panel tile"><div class="eyebrow">к прошлой неделе</div><div class="big ${diff > 0 ? 'accent' : diff < 0 ? 'red' : ''}">${diff == null ? '—' : (diff > 0 ? '+' : '') + diff + '%'}</div></div>
      <div class="panel tile"><div class="eyebrow">лучший стрик сейчас</div><div class="big">🔥 ${top?.n || 0}</div><div class="muted sm">${top?.n ? esc(top.h.name) : ''}</div></div>
      <div class="panel tile"><div class="eyebrow">требует внимания</div><div class="mid">${weakest ? esc(weakest.h.name) : '—'}</div><div class="muted sm">${weakest ? L.pct(weakest.r) : ''}</div></div>
    </div>
    <div class="two-col">
      <section class="panel">
        <div class="row between"><div class="eyebrow">рейтинг привычек</div>
          <div class="seg xs">${['daily', 'weekly', 'monthly'].map(r => `<button class="${board === r ? 'on' : ''}" data-act="board" data-r="${r}">${r === 'daily' ? 'Д' : r === 'weekly' ? 'Н' : 'М'}</button>`).join('')}</div></div>
        <ol class="rank">${lb.length ? lb.map((x, i) => `<li><span class="medal">${MEDALS[i] || i + 1}</span>
          <div class="grow"><div class="row between"><b>${esc(x.h.name)}</b><span class="accent">${L.pct(x.r)}</span></div>
          <div class="progress-line"><i style="width:${x.r * 100}%"></i></div></div></li>`).join('') : `<li class="muted">нет ${L.RHYTHM_LABEL[board]} привычек</li>`}</ol>
      </section>
      <section class="panel">
        <div class="eyebrow">топ стриков</div>
        <ol class="rank">${withStreak.slice(0, 6).map((x, i) => `<li><span class="medal">${MEDALS[i] || i + 1}</span>
          <div class="grow"><div class="row between"><b>${esc(x.h.name)}</b><span class="accent">${x.n} ${L.UNIT[x.h.rhythm]}</span></div>
          <div class="progress-line"><i style="width:${x.n / maxStreak * 100}%"></i></div></div></li>`).join('') || '<li class="muted">пока пусто</li>'}</ol>
      </section>
    </div>
    <section class="panel">
      <div class="row between wrap gap"><div class="eyebrow">сила привычек</div>
        <span class="muted sm">растёт с каждым выполнением, от одного пропуска почти не падает</span></div>
      <ol class="rank">${strong.length ? strong.map(x => `<li><i class="dot" style="--c:${x.h.color}"></i>
        <div class="grow"><div class="row between"><b>${esc(x.h.name)}</b><span class="accent">${Math.round(x.v * 100)}%</span></div>
        <div class="progress-line"><i style="width:${x.v * 100}%"></i></div></div></li>`).join('') : '<li class="muted">пока пусто</li>'}</ol>
    </section>
    <section class="panel">
      <div class="eyebrow">последние полгода</div>
      ${heatmap(s, t)}
    </section>
    <section class="panel journal">
      <div class="row between wrap gap">
        <div><div class="eyebrow">рефлексия месяца</div><div class="strong">${D.fmtMonth(jStart)}</div></div>
        <div class="row gap">
          <button class="icon-btn round" data-act="jprev" aria-label="прошлый месяц">‹</button>
          <button class="icon-btn round" data-act="jnext" aria-label="следующий месяц" ${jOffset >= 0 ? 'disabled' : ''}>›</button>
        </div>
      </div>
      <div class="j-stats">
        <span>стабильность <b>${L.pct(jRate)}</b></span>
        <span>лучшая привычка <b>${jBest ? esc(jBest.h.name) : '—'}</b></span>
        <span>задач закрыто <b>${jTasks.filter(x => x.done).length}/${jTasks.length}</b></span>
      </div>
      <textarea id="journal" rows="6" placeholder="что получилось в этом месяце? что мешало? что поменяю в следующем?">${esc(s.journal[jKey] || '')}</textarea>
      <div class="muted sm" id="jSaved"></div>
    </section>`;

  root.onchange = e => {
    const k = e.target.dataset.set;
    if (k === 'filter') filter = e.target.value;
    else if (k === 'days') days = Number(e.target.value);
    else return;
    render(root); after(root);
  };
  root.onclick = e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'board') board = b.dataset.r;
    else if (b.dataset.act === 'jprev') jOffset--;
    else if (b.dataset.act === 'jnext') jOffset = Math.min(0, jOffset + 1);
    render(root); after(root);
  };
  // журнал сохраняем без перерисовки, иначе курсор будет прыгать
  root.oninput = e => {
    if (e.target.id !== 'journal') return;
    const val = e.target.value;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      update(s => { if (val.trim()) s.journal[jKey] = val; else delete s.journal[jKey]; }, { render: false });
      const el = document.getElementById('jSaved');
      if (el) el.textContent = 'сохранено';
    }, 600);
  };
}

export function after(root) {
  const el = root.querySelector('#areaChart');
  if (el) areaChart(el, series(getState()), { height: window.innerWidth < 640 ? 220 : 300 });
  const hm = root.querySelector('.heatmap-wrap');
  if (hm && !hm.dataset.done) { hm.dataset.done = 1; hm.scrollLeft = hm.scrollWidth; }
}
