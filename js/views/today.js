import { getState, update } from '../store.js';
import * as D from '../dates.js';
import * as L from '../logic.js';
import { esc, icon, ring, toast } from '../ui.js';

export const title = 'Сегодня';

function item(s, h, t) {
  const c = L.cell(s, h, t), done = c === 1, frozen = c === 'F';
  const n = L.streak(s, h, t);
  const meta = h.rhythm === 'daily' ? '' : `<span class="meta">${L.periodCount(s, h, t)}/${L.target(h)} ${h.rhythm === 'weekly' ? 'за неделю' : 'за месяц'}</span>`;
  return `<div class="today-item ${done ? 'done' : ''} ${frozen ? 'frozen' : ''}">
    <button class="check" data-act="toggle" data-id="${h.id}" aria-label="отметить">${frozen ? icon.cube : icon.check}</button>
    <i class="dot" style="--c:${h.color}"></i>
    <span class="name">${esc(h.name)}</span>
    ${meta}
    ${!c && s.freeze.tokens > 0 ? `<button class="freeze-btn" data-act="freeze" data-id="${h.id}" title="заморозить сегодня (потратить токен)">${icon.cube}</button>` : ''}
    ${frozen ? `<button class="freeze-btn on" data-act="unfreeze" data-id="${h.id}" title="разморозить (вернуть токен)">отменить</button>` : ''}
    <span class="streak ${n ? '' : 'zero'}">🔥 ${n}</span>
  </div>`;
}

export function render(root) {
  const s = getState(), t = D.today();
  const list = s.habits.filter(h => L.dueOn(s, h, t));
  const done = list.filter(h => L.cell(s, h, t)).length;
  const p = list.length ? done / list.length : 0;
  const tk = s.freeze.tokens;

  root.innerHTML = `
    <section class="today-hero">
      ${ring(p, { size: 230, stroke: 16, label: Math.round(p * 100) + '%', sub: 'сегодня' })}
      <div class="today-date">${D.fmtLong(t)}</div>
      <div class="muted">${done} / ${list.length} ${D.plural(list.length, 'привычка выполнена', 'привычки выполнено', 'привычек выполнено')}</div>
      <div class="token-pill">${icon.cube} ${tk} ${D.plural(tk, 'заморозка доступна', 'заморозки доступно', 'заморозок доступно')}</div>
    </section>
    ${list.length
      ? `<div class="today-list">${list.map(h => item(s, h, t)).join('')}</div>`
      : `<div class="empty panel">
          <p>${s.habits.length ? 'на сегодня всё закрыто 🎉' : 'пока нет ни одной привычки'}</p>
          ${s.habits.length ? '' : '<a class="btn primary" href="#habits">добавить первую</a>'}
        </div>`}`;

  root.onclick = e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    let award = null;
    update(s => {
      const h = s.habits.find(x => x.id === b.dataset.id);
      if (!h) return false;
      if (b.dataset.act === 'toggle') award = L.toggle(s, h, t);
      else if (b.dataset.act === 'freeze') return L.freezeDay(s, h, t);
      else if (b.dataset.act === 'unfreeze') return L.unfreezeDay(s, h, t);
    });
    if (award) toast('7 дней подряд! +1 заморозка 🧊');
  };
}
