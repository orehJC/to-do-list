import { getState, update, COLORS, uid } from '../store.js';
import * as D from '../dates.js';
import * as L from '../logic.js';
import { esc, icon, openModal, confirmClick, toast } from '../ui.js';
import { sparkline } from '../charts.js';

export const title = 'Привычки';

const COL = 36;
const TABS = { daily: 'ежедневные', weekly: 'на неделю', monthly: 'на месяц' };
let offset = 0, tab = 'daily', scrolledFor = null;

function monthOf(offset) {
  const b = D.parse(D.today());
  return D.key(new Date(b.getFullYear(), b.getMonth() + offset, 1));
}

function cellHtml(s, h, k, t) {
  const c = L.cell(s, h, k);
  const cls = ['c'];
  if (k > t) return `<td><span class="c future"></span></td>`;
  if (k < h.created) cls.push('pre');
  if (c === 1) cls.push('done');
  else if (c === 'F') cls.push('frozen');
  else if (h.rhythm !== 'daily' && L.periodMet(s, h, k)) cls.push('met');
  if (k === t) cls.push('today');
  return `<td><button class="${cls.join(' ')}" data-act="cell" data-id="${h.id}" data-k="${k}" aria-label="${k}">${c === 1 ? icon.check : c === 'F' ? icon.cube : ''}</button></td>`;
}

export function render(root) {
  const s = getState(), t = D.today();
  const first = monthOf(offset), last = D.monthEnd(first), days = D.range(first, last);
  const habits = s.habits.filter(h => h.rhythm === tab);
  const due = s.habits.filter(h => L.dueOn(s, h, t));
  const doneToday = due.filter(h => L.cell(s, h, t)).length;

  const trend = days.map(k => {
    if (k > t) return null;
    const hs = habits.filter(h => k >= h.created);
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
          ${days.map(k => `<th class="${k === t ? 'is-today' : ''} ${D.weekday(k) === 0 ? 'wk' : ''}"><span>${+k.slice(8)}</span><small>${D.WD_SHORT[D.weekday(k)]}</small></th>`).join('')}
          <th class="sticky-r eyebrow">статы</th>
        </tr>
      </thead>
      <tbody>${habits.map(h => `<tr>
        <th class="sticky-l hname" data-act="edit" data-id="${h.id}" title="редактировать">
          <i class="dot" style="--c:${h.color}"></i><span>${esc(h.name)}${h.rhythm !== 'daily' ? `<small>${L.target(h)}× ${h.rhythm === 'weekly' ? 'в неделю' : 'в месяц'}</small>` : ''}</span>
        </th>
        ${days.map(k => cellHtml(s, h, k, t)).join('')}
        <td class="sticky-r stats">
          <b>${L.pct(L.rate(s, h, first, rateTo))}</b>
          <span title="текущий стрик">🔥${L.streak(s, h)}</span>
          <span title="лучший стрик">⭐${L.bestStreak(s, h)}</span>
        </td>
      </tr>`).join('')}</tbody>
    </table></div>
  </section>`;

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
        `<button class="${tab === r ? 'on' : ''}" data-act="tab" data-tab="${r}">${l}<small>${s.habits.filter(h => h.rhythm === r).length}</small></button>`).join('')}</div>
      <button class="btn primary" data-act="new">${icon.plus} новая привычка</button>
    </div>
    ${habits.length ? grid : `<div class="empty panel"><p>тут пока пусто</p><button class="btn primary" data-act="new">${icon.plus} добавить ${TABS[tab]}</button></div>`}`;

  root.onclick = e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'prev') { offset--; render(root); }
    else if (a === 'next') { offset++; render(root); }
    else if (a === 'now') { offset = 0; scrolledFor = null; render(root); after(root); }
    else if (a === 'tab') { tab = b.dataset.tab; render(root); }
    else if (a === 'new') habitModal();
    else if (a === 'edit') habitModal(getState().habits.find(h => h.id === b.dataset.id));
    else if (a === 'cell') {
      let award = null;
      update(s => {
        const h = s.habits.find(x => x.id === b.dataset.id), k = b.dataset.k;
        if (!h) return false;
        if (k < h.created) h.created = k; // отметка задним числом сдвигает дату старта
        if (L.isFrozen(s, h, k)) return L.unfreezeDay(s, h, k);
        award = L.toggle(s, h, k);
      });
      if (award) toast('7 дней подряд! +1 заморозка 🧊');
    }
  };
}

// при первом открытии месяца прокручиваем сетку к сегодняшнему дню
export function after(root) {
  const sc = root.querySelector('.grid-scroll');
  const key = `${offset}`;
  if (!sc || scrolledFor === key) return;
  scrolledFor = key;
  const th = sc.querySelector('.days-row .is-today');
  if (th) sc.scrollLeft = th.offsetLeft - sc.clientWidth / 2;
}

function habitModal(h) {
  const isNew = !h;
  const d = h || { name: '', color: COLORS[getState().habits.length % COLORS.length], rhythm: tab, target: tab === 'weekly' ? 3 : 1 };
  const m = openModal(`
    <h3>${isNew ? 'новая привычка' : 'привычка'}</h3>
    <form>
      <label class="field"><span>название</span><input name="name" required maxlength="60" value="${esc(d.name)}" autofocus autocomplete="off"></label>
      <div class="field"><span>цвет</span><div class="swatches">${COLORS.map(c =>
        `<label class="sw"><input type="radio" name="color" value="${c}" ${c === d.color ? 'checked' : ''}><i style="--c:${c}"></i></label>`).join('')}</div></div>
      <div class="field"><span>как часто</span><div class="seg sm">${Object.entries({ daily: 'каждый день', weekly: 'N раз в неделю', monthly: 'N раз в месяц' }).map(([r, l]) =>
        `<label><input type="radio" name="rhythm" value="${r}" ${r === d.rhythm ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
      <label class="field target-f"><span>сколько раз за период</span><input type="number" name="target" min="1" max="31" value="${d.target || 1}"></label>
      ${isNew ? '' : `<div class="field"><span>порядок</span><div class="row gap">
        <button type="button" class="btn ghost sm" data-act="up">↑ выше</button>
        <button type="button" class="btn ghost sm" data-act="down">↓ ниже</button></div></div>`}
      <div class="modal-actions">
        ${isNew ? '' : '<button type="button" class="btn danger" data-act="del" data-label="удалить">удалить</button>'}
        <span class="grow"></span>
        <button type="button" class="btn ghost" data-act="close">отмена</button>
        <button class="btn primary">сохранить</button>
      </div>
    </form>`);
  const form = m.el.querySelector('form');
  const syncTarget = () => { form.querySelector('.target-f').hidden = form.elements.rhythm.value === 'daily'; };
  syncTarget();
  form.onchange = syncTarget;
  form.onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(form);
    const v = {
      name: String(fd.get('name')).trim(),
      color: fd.get('color') || d.color,
      rhythm: fd.get('rhythm'),
      target: Math.max(1, Math.min(31, Number(fd.get('target')) || 1)),
    };
    if (!v.name) return;
    tab = v.rhythm;
    update(s => {
      if (isNew) s.habits.push({ id: uid(), created: D.today(), ...v });
      else Object.assign(s.habits.find(x => x.id === h.id), v);
    });
    m.close();
  };
  m.el.onclick = e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'close') m.close();
    else if (a === 'up' || a === 'down') update(s => {
      const i = s.habits.findIndex(x => x.id === h.id), j = i + (a === 'up' ? -1 : 1);
      if (j < 0 || j >= s.habits.length) return false;
      [s.habits[i], s.habits[j]] = [s.habits[j], s.habits[i]];
    });
    else if (a === 'del' && confirmClick(b, 'удалить вместе с историей?')) {
      update(s => { s.habits = s.habits.filter(x => x.id !== h.id); delete s.checks[h.id]; });
      m.close();
    }
  };
}
