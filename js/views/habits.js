import { getState, update } from '../store.js';
import * as D from '../dates.js';
import * as L from '../logic.js';
import { esc, icon, toast, confirmClick } from '../ui.js';
import { sparkline } from '../charts.js';
import { habitModal, dayModal } from '../habit-modals.js';

export const title = 'привычки';

const COL = 36;
const TABS = { daily: 'ежедневные', weekly: 'на неделю', monthly: 'на месяц' };
let offset = 0, tab = 'daily', scrolledFor = null, showArchive = false;

function monthOf(offset) {
  const b = D.parse(D.today());
  return D.key(new Date(b.getFullYear(), b.getMonth() + offset, 1));
}

function cellHtml(s, h, k, t) {
  if (k > t) return `<td><span class="c future"></span></td>`;
  const v = L.cell(s, h, k), kd = L.kind(h), done = L.isDone(s, h, k);
  const cls = ['c'];
  let inner = '';
  if (k < h.created) cls.push('pre');
  if (!L.scheduled(h, k)) cls.push('off');
  if (v === 'F') { cls.push('frozen'); inner = icon.cube; }
  else if (kd === 'quit') {
    if (v === 'X') { cls.push('relapse'); inner = icon.x; }
    else if (k >= h.created) { cls.push('done', 'soft'); inner = icon.check; }
  }
  else if (done) { cls.push('done'); inner = icon.check; }
  else if (typeof v === 'number') { cls.push('partial'); inner = `<b>${v}</b>`; }
  else if (h.rhythm !== 'daily' && L.periodMet(s, h, k)) cls.push('met');
  if (k === t) cls.push('today');
  const n = L.note(s, h, k);
  if (n) cls.push('has-note');
  return `<td><button class="${cls.join(' ')}" data-act="cell" data-id="${h.id}" data-k="${k}" aria-label="${k}"${n ? ` title="${esc(n)}"` : ''}>${inner}</button></td>`;
}

const kindLabel = h => {
  const kd = L.kind(h);
  const bits = [];
  if (kd === 'count') bits.push(`${L.amount(h)} ${h.unit || ''}`.trim());
  if (kd === 'timer') bits.push(`${L.amount(h)} мин`);
  if (kd === 'quit') bits.push('бросаю');
  if (h.rhythm !== 'daily') bits.push(`${L.target(h)}× ${h.rhythm === 'weekly' ? 'в неделю' : 'в месяц'}`);
  else if (h.days?.length) bits.push(h.days.map(i => D.WD_SHORT[i]).join(' '));
  return bits.length ? `<small>${esc(bits.join(' · '))}</small>` : '';
};

export function render(root) {
  const s = getState(), t = D.today();
  const first = monthOf(offset), last = D.monthEnd(first), days = D.range(first, last);
  const all = L.active(s), archived = s.habits.filter(h => h.archived);
  const habits = all.filter(h => h.rhythm === tab);
  const due = all.filter(h => L.dueOn(s, h, t));
  const doneToday = due.filter(h => L.isDone(s, h, t) || L.isFrozen(s, h, t)).length;

  const trend = days.map(k => {
    if (k > t) return null;
    const hs = habits.filter(h => k >= h.created && L.scheduled(h, k));
    return hs.length ? L.avg(hs.map(h => L.progressAsOf(s, h, k))) : null;
  });
  const avg = L.avg(trend);
  const rateTo = last < t ? last : t;

  const grid = `<section class="panel grid-panel">
    <div class="grid-scroll" data-scroll-id="hgrid"><table class="hgrid" style="--col:${COL}px">
      <thead>
        <tr class="trend-row">
          <th class="sticky-l"><span class="eyebrow"><i class="dot" style="--c:var(--accent)"></i> тренд</span></th>
          <td colspan="${days.length}">${sparkline(trend, COL)}</td>
          <th class="sticky-r"><div class="eyebrow">среднее</div><div class="avg-pill">${L.pct(avg)}</div></th>
        </tr>
        <tr class="days-row">
          <th class="sticky-l eyebrow">привычка</th>
          ${days.map(k => `<th class="${k === t ? 'is-today' : ''}"><span>${+k.slice(8)}</span><small>${D.WD_SHORT[D.weekday(k)]}</small></th>`).join('')}
          <th class="sticky-r eyebrow">статы</th>
        </tr>
      </thead>
      <tbody>${habits.map(h => `<tr>
        <th class="sticky-l hname" data-act="edit" data-id="${h.id}" title="настроить">
          <i class="dot" style="--c:${h.color}"></i><span>${esc(h.name)}${kindLabel(h)}</span>
        </th>
        ${days.map(k => cellHtml(s, h, k, t)).join('')}
        <td class="sticky-r stats">
          <b>${L.pct(L.rate(s, h, first, rateTo))}</b>
          <span title="текущий стрик">🔥${L.streak(s, h)}</span>
          <span title="лучший стрик">⭐${L.bestStreak(s, h)}</span>
          <span class="str" title="сила привычки">◆${Math.round(L.strength(s, h) * 100)}</span>
        </td>
      </tr>`).join('')}</tbody>
    </table></div>
  </section>
  <p class="muted sm hint">клик по клетке — отметить. долгое нажатие или правый клик — значение, заметка, заморозка.</p>`;

  const archiveBlock = archived.length ? `
    <section class="panel archive">
      <button class="row between archive-head" data-act="archive-toggle">
        <span class="eyebrow">архив · ${archived.length}</span><span class="muted sm">${showArchive ? 'скрыть' : 'показать'}</span>
      </button>
      ${showArchive ? `<ul class="archive-list">${archived.map(h => `<li>
        <i class="dot" style="--c:${h.color}"></i><span class="grow">${esc(h.name)}</span>
        <span class="muted sm">⭐${L.bestStreak(s, h)}</span>
        <button class="btn ghost sm" data-act="restore" data-id="${h.id}">вернуть</button>
        <button class="btn danger sm" data-act="purge" data-id="${h.id}" data-label="удалить">удалить</button>
      </li>`).join('')}</ul>` : ''}
    </section>` : '';

  root.innerHTML = `
    <section class="panel month-bar">
      <div>
        <div class="eyebrow">${D.fmtMonth(first)}</div>
        <div class="strong">${doneToday}/${due.length} привычек сегодня</div>
      </div>
      <div class="row gap">
        ${offset ? '<button class="btn ghost sm" data-act="now">к текущему</button>' : ''}
        <button class="icon-btn round" data-act="prev" aria-label="предыдущий месяц">${icon.left}</button>
        <button class="icon-btn round" data-act="next" aria-label="следующий месяц">${icon.right}</button>
      </div>
      <div class="progress-line"><i style="width:${due.length ? doneToday / due.length * 100 : 0}%"></i></div>
    </section>
    <div class="tabs-row">
      <div class="seg">${Object.entries(TABS).map(([r, l]) =>
        `<button class="${tab === r ? 'on' : ''}" data-act="tab" data-tab="${r}">${l}<small>${all.filter(h => h.rhythm === r).length}</small></button>`).join('')}</div>
      <button class="btn primary" data-act="new">${icon.plus} новая привычка</button>
    </div>
    ${habits.length ? grid : `<div class="empty panel"><p>тут пока пусто</p><button class="btn primary" data-act="new">${icon.plus} добавить ${TABS[tab]}</button></div>`}
    ${archiveBlock}`;

  const openNew = () => habitModal(null, { rhythm: tab, onSave: v => { tab = v.rhythm; } });

  root.onclick = e => {
    if (pressFired) { pressFired = false; return; } // клик после долгого нажатия не считаем
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act, s = getState();
    const h = s.habits.find(x => x.id === b.dataset.id);
    if (a === 'prev') { offset--; render(root); }
    else if (a === 'next') { offset++; render(root); }
    else if (a === 'now') { offset = 0; scrolledFor = null; render(root); after(root); }
    else if (a === 'tab') { tab = b.dataset.tab; render(root); }
    else if (a === 'new') openNew();
    else if (a === 'edit') habitModal(h);
    else if (a === 'archive-toggle') { showArchive = !showArchive; render(root); }
    else if (a === 'restore') { update(s => { s.habits.find(x => x.id === h.id).archived = false; }); toast('привычка вернулась'); }
    else if (a === 'purge' && confirmClick(b, 'удалить навсегда?')) update(s => {
      s.habits = s.habits.filter(x => x.id !== h.id); delete s.checks[h.id]; delete s.notes?.[h.id];
    });
    else if (a === 'cell') {
      const k = b.dataset.k;
      if (L.isMeasured(h)) return dayModal(h, k);
      let award = null;
      update(s => {
        const x = s.habits.find(y => y.id === h.id);
        if (k < x.created) x.created = k; // отметка задним числом сдвигает дату старта
        if (L.isFrozen(s, x, k)) return L.unfreezeDay(s, x, k);
        award = L.toggle(s, x, k);
      });
      if (award) toast('7 дней подряд! +1 заморозка 🧊');
    }
  };
  // долгое нажатие пальцем (свой таймер — safari на iphone не шлёт contextmenu) и правый клик мышью — подробности дня
  const openDay = b => dayModal(getState().habits.find(x => x.id === b.dataset.id), b.dataset.k);
  root.onpointerdown = e => {
    const b = e.target.closest('[data-act="cell"]');
    if (!b || e.pointerType === 'mouse') return;
    touching = true; pressFired = false;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => { pressFired = true; openDay(b); }, 500);
  };
  root.onpointerup = root.onpointercancel = () => { touching = false; clearTimeout(pressTimer); };
  root.oncontextmenu = e => {
    const b = e.target.closest('[data-act="cell"]');
    if (!b) return;
    e.preventDefault();
    if (!touching && !pressFired) openDay(b);
  };
}

let pressTimer = null, pressFired = false, touching = false;

// при первом открытии месяца прокручиваем сетку к сегодняшнему дню
export function after(root) {
  const sc = root.querySelector('.grid-scroll');
  const key = `${offset}`;
  if (!sc || scrolledFor === key) return;
  scrolledFor = key;
  const th = sc.querySelector('.days-row .is-today');
  if (th) sc.scrollLeft = th.offsetLeft - sc.clientWidth / 2;
}
