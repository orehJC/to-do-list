import { getState, update } from '../store.js';
import * as D from '../dates.js';
import * as L from '../logic.js';
import { esc, icon, ring, toast } from '../ui.js';
import { dayModal } from '../habit-modals.js';

export const title = 'сегодня';

// таймер живёт только на этом устройстве (не синкается), чтобы не дёргать облако каждую секунду
const TKEY = 'progress-timer';
const getTimer = () => { try { return JSON.parse(localStorage.getItem(TKEY)); } catch { return null; } };
const setTimer = v => { try { v ? localStorage.setItem(TKEY, JSON.stringify(v)) : localStorage.removeItem(TKEY); } catch { /* нет хранилища */ } };
const mmss = ms => { const sec = Math.floor(ms / 1000); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
let tick = null;

function stopTimer() {
  const tm = getTimer();
  if (!tm) return;
  setTimer(null);
  const min = Math.round((Date.now() - tm.start) / 6000) / 10; // с точностью до 0.1 минуты
  if (min < 0.1) return;
  let award = null;
  update(s => {
    const h = s.habits.find(x => x.id === tm.id);
    if (!h) return false;
    award = L.setValue(s, h, tm.day, L.valueOf(s, h, tm.day) + min);
  });
  toast(`+${min} мин`);
  if (award) toast('7 дней подряд! +1 заморозка 🧊');
}

function mainButton(s, h, t) {
  const done = L.isDone(s, h, t), frozen = L.isFrozen(s, h, t), kd = L.kind(h);
  if (kd === 'quit') {
    const x = L.isRelapse(s, h, t);
    return `<button class="check ${x ? 'relapse' : ''}" data-act="toggle" data-id="${h.id}" aria-label="${x ? 'отменить срыв' : 'отметить срыв'}" title="${x ? 'отменить срыв' : 'был срыв'}">${x ? icon.x : icon.check}</button>`;
  }
  if (kd === 'timer') {
    const run = getTimer()?.id === h.id;
    return `<button class="check timer ${run ? 'running' : ''} ${done ? 'filled' : ''}" data-act="timer" data-id="${h.id}" aria-label="${run ? 'стоп' : 'старт'}">${run ? icon.pause : icon.play}</button>`;
  }
  if (kd === 'count') {
    return `<button class="check ${done ? 'filled' : ''}" data-act="plus" data-id="${h.id}" aria-label="плюс один">${done ? icon.check : icon.plus}</button>`;
  }
  return `<button class="check ${done ? 'filled' : ''} ${frozen ? 'frozen' : ''}" data-act="toggle" data-id="${h.id}" aria-label="отметить">${frozen ? icon.cube : icon.check}</button>`;
}

function meta(s, h, t) {
  const kd = L.kind(h);
  const parts = [];
  if (kd === 'count' || kd === 'timer') {
    const v = L.valueOf(s, h, t), a = L.amount(h);
    parts.push(`<span class="amount">${v}/${a} ${esc(L.unitOf(h))}</span>`);
    if (kd === 'timer') {
      const tm = getTimer();
      if (tm?.id === h.id) parts.push(`<span class="timer-live" data-start="${tm.start}">${mmss(Date.now() - tm.start)}</span>`);
    }
    parts.push(`<span class="mini-bar"><i style="width:${Math.min(100, v / a * 100)}%"></i></span>`);
  }
  if (kd === 'quit') parts.push(`<span class="meta-txt">${L.isRelapse(s, h, t) ? 'сорвался сегодня' : 'держусь'}</span>`);
  if (h.rhythm !== 'daily') parts.push(`<span class="meta-txt">${L.periodCount(s, h, t)}/${L.target(h)} ${h.rhythm === 'weekly' ? 'за неделю' : 'за месяц'}</span>`);
  const n = L.note(s, h, t);
  if (n) parts.push(`<span class="meta-txt note-line">✎ ${esc(n)}</span>`);
  return parts.length ? `<div class="sub">${parts.join('')}</div>` : '';
}

function item(s, h, t) {
  const done = L.isDone(s, h, t), frozen = L.isFrozen(s, h, t), kd = L.kind(h);
  const n = L.streak(s, h, t);
  const canFreeze = !done && !frozen && kd !== 'quit' && s.freeze.tokens > 0;
  return `<div class="today-item ${done ? 'done' : ''} ${frozen ? 'frozen' : ''} ${L.isRelapse(s, h, t) ? 'relapsed' : ''} kind-${kd}">
    ${mainButton(s, h, t)}
    <div class="body">
      <div class="title-row"><i class="dot" style="--c:${h.color}"></i><span class="name">${esc(h.name)}</span></div>
      ${meta(s, h, t)}
    </div>
    ${kd === 'count' && L.valueOf(s, h, t) > 0 ? `<button class="mini-btn" data-act="minus" data-id="${h.id}" aria-label="минус один">−</button>` : ''}
    ${canFreeze ? `<button class="freeze-btn" data-act="freeze" data-id="${h.id}" title="заморозить сегодня (потратить токен)">${icon.cube}</button>` : ''}
    ${frozen ? `<button class="freeze-btn on" data-act="unfreeze" data-id="${h.id}" title="разморозить (вернуть токен)">отменить</button>` : ''}
    <button class="mini-btn" data-act="note" data-id="${h.id}" title="заметка и детали" aria-label="заметка">✎</button>
    <span class="streak ${n ? '' : 'zero'}">🔥 ${n}</span>
  </div>`;
}

export function render(root) {
  const s = getState(), t = D.today();
  const list = L.active(s).filter(h => L.dueOn(s, h, t));
  const done = list.filter(h => L.isDone(s, h, t) || L.isFrozen(s, h, t)).length;
  const p = list.length ? done / list.length : 0;
  const tk = s.freeze.tokens;

  const groups = Object.keys(L.TIMES).map(time => ({ time, items: list.filter(h => (h.time || 'any') === time) })).filter(g => g.items.length);
  const order = ['morning', 'day', 'evening', 'any'];
  groups.sort((a, b) => order.indexOf(a.time) - order.indexOf(b.time));
  const showHeads = groups.length > 1 || (groups[0] && groups[0].time !== 'any');

  root.innerHTML = `
    <section class="today-hero">
      ${ring(p, { size: 230, stroke: 16, label: Math.round(p * 100) + '%', sub: 'сегодня' })}
      <div class="today-date">${D.fmtLong(t)}</div>
      <div class="muted">${done} / ${list.length} ${D.plural(list.length, 'привычка выполнена', 'привычки выполнено', 'привычек выполнено')}</div>
      <div class="token-pill">${icon.cube} ${tk} ${D.plural(tk, 'заморозка доступна', 'заморозки доступно', 'заморозок доступно')}</div>
    </section>
    ${list.length
      ? groups.map(g => `${showHeads ? `<h2 class="section-title">${L.TIMES[g.time]}</h2>` : ''}
          <div class="today-list">${g.items.map(h => item(s, h, t)).join('')}</div>`).join('')
      : `<div class="empty panel">
          <p>${L.active(s).length ? 'на сегодня всё закрыто 🎉' : 'пока нет ни одной привычки'}</p>
          ${L.active(s).length ? '' : '<a class="btn primary" href="#habits">добавить первую</a>'}
        </div>`}`;

  root.onclick = e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act, h = getState().habits.find(x => x.id === b.dataset.id);
    if (!h) return;
    if (a === 'note') return dayModal(h, t);
    if (a === 'timer') {
      if (getTimer()?.id === h.id) return stopTimer();
      stopTimer();
      setTimer({ id: h.id, start: Date.now(), day: t });
      return render(root), after(root);
    }
    let award = null;
    update(s => {
      const x = s.habits.find(y => y.id === h.id);
      if (a === 'toggle') award = L.toggle(s, x, t);
      else if (a === 'plus') award = L.setValue(s, x, t, L.valueOf(s, x, t) + 1);
      else if (a === 'minus') award = L.setValue(s, x, t, L.valueOf(s, x, t) - 1);
      else if (a === 'freeze') return L.freezeDay(s, x, t);
      else if (a === 'unfreeze') return L.unfreezeDay(s, x, t);
    });
    if (award) toast('7 дней подряд! +1 заморозка 🧊');
  };
}

// секундомер обновляем точечно, без полной перерисовки
export function after(root) {
  clearInterval(tick);
  if (!root.querySelector('.timer-live')) return;
  tick = setInterval(() => {
    const el = document.querySelector('.timer-live');
    if (!el) return clearInterval(tick);
    el.textContent = mmss(Date.now() - Number(el.dataset.start));
  }, 1000);
}
