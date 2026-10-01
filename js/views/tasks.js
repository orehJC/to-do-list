import { getState, update, uid } from '../store.js';
import * as D from '../dates.js';
import { esc, icon, ring } from '../ui.js';
import { lineChart } from '../charts.js';

export const title = 'Задачи';

const MIND = [
  { f: 'energy', l: 'энергия', c: '#f87171' },
  { f: 'focus', l: 'фокус', c: '#2dd4bf' },
  { f: 'motivation', l: 'мотивация', c: '#a78bfa' },
];
let offset = 0, focusDay = null, scrolledFor = null;

function weekDays() {
  const ws = D.addDays(D.weekStart(D.today()), offset * 7);
  return D.range(ws, D.addDays(ws, 6));
}

function dayCard(s, st, i, t) {
  const { k, list, done } = st;
  const ms = s.mindset[k] || {};
  const prev = s.tasks[D.addDays(k, -1)] || [];
  return `<article class="panel day ${k === t ? 'is-today' : ''}">
    <header><div class="day-name">${D.WD_FULL[i]}</div><div class="muted sm">${D.fmtNum(k)}</div></header>
    ${ring(st.p, { size: 96, stroke: 9, label: Math.round(st.p * 100) + '%' })}
    <div class="eyebrow center">задачи</div>
    <ul class="task-list">${list.map((x, j) => `<li class="task ${x.done ? 'done' : ''}">
      <button class="cb" data-act="toggle" data-k="${k}" data-j="${j}" aria-label="выполнено">${icon.check}</button>
      <span class="txt">${esc(x.text)}</span>
      <button class="x" data-act="del" data-k="${k}" data-j="${j}" aria-label="удалить">${icon.x}</button>
    </li>`).join('')}</ul>
    <input class="add-task" data-k="${k}" placeholder="+ добавить задачу" maxlength="140" enterkeyhint="done">
    ${!list.length && prev.length ? `<button class="link" data-act="copy" data-k="${k}">скопировать вчерашний список</button>` : ''}
    <div class="mindset">
      <div class="eyebrow">настрой</div>
      ${MIND.map(m => `<label class="ms ${ms[m.f] == null ? 'unset' : ''}" style="--c:${m.c}">
        <span>${m.l}</span>
        <input type="range" min="1" max="10" value="${ms[m.f] ?? 5}" data-k="${k}" data-f="${m.f}">
        <b>${ms[m.f] ?? '–'}</b>
      </label>`).join('')}
      <div class="ms-stat"><span>выполнено</span><b class="accent">${done}</b></div>
      <div class="ms-stat"><span>не выполнено</span><b>${list.length - done}</b></div>
    </div>
  </article>`;
}

export function render(root) {
  const s = getState(), t = D.today(), days = weekDays();
  const stats = days.map(k => {
    const list = s.tasks[k] || [];
    const done = list.filter(x => x.done).length;
    return { k, list, done, p: list.length ? done / list.length : 0 };
  });
  const total = stats.reduce((a, x) => a + x.list.length, 0);
  const done = stats.reduce((a, x) => a + x.done, 0);

  root.innerHTML = `
    <div class="tasks-top">
      <section class="panel week-panel">
        <div class="row between wrap gap">
          <div><div class="eyebrow">неделя</div><div class="pill accent">${D.fmtShort(days[0])} — ${D.fmtShort(days[6])} ${days[6].slice(0, 4)}</div></div>
          <div class="row gap">
            <button class="icon-btn round" data-act="prev" aria-label="прошлая неделя">${icon.left}</button>
            <button class="btn ghost sm" data-act="now">эта неделя</button>
            <button class="icon-btn round" data-act="next" aria-label="следующая неделя">${icon.right}</button>
          </div>
        </div>
        <div class="week-body">
          <div class="bars">${stats.map((st, i) => `<div class="bar-col ${st.k === t ? 'is-today' : ''}">
            <div class="bar"><i style="height:${st.list.length ? Math.max(6, st.p * 100) : 0}%"></i></div><span>${D.WD_SHORT[i]}</span></div>`).join('')}</div>
          <div class="week-ring">${ring(total ? done / total : 0, { size: 150, stroke: 12, label: (total ? Math.round(done / total * 100) : 0) + '%' })}
            <div class="muted sm">${done} / ${total} выполнено</div></div>
        </div>
      </section>
      <section class="panel mindset-panel">
        <div class="row between wrap gap"><div class="panel-title">трекер настроя</div>
          <div class="legend">${MIND.map(m => `<span><i style="--c:${m.c}"></i>${m.l}</span>`).join('')}</div></div>
        <div class="chart" id="mindChart"></div>
      </section>
    </div>
    <div class="days-scroll" data-scroll-id="days"><div class="days">${stats.map((st, i) => dayCard(s, st, i, t)).join('')}</div></div>`;

  root.onclick = e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const { act, k } = b.dataset, j = Number(b.dataset.j);
    if (act === 'prev') { offset--; render(root); after(root); }
    else if (act === 'next') { offset++; render(root); after(root); }
    else if (act === 'now') { offset = 0; render(root); after(root); }
    else if (act === 'toggle') update(s => { s.tasks[k][j].done = !s.tasks[k][j].done; });
    else if (act === 'del') update(s => { s.tasks[k].splice(j, 1); if (!s.tasks[k].length) delete s.tasks[k]; });
    else if (act === 'copy') update(s => { s.tasks[k] = (s.tasks[D.addDays(k, -1)] || []).map(x => ({ id: uid(), text: x.text, done: false })); });
  };
  root.onkeydown = e => {
    if (e.key !== 'Enter' || !e.target.matches('.add-task')) return;
    const text = e.target.value.trim(), k = e.target.dataset.k;
    if (!text) return;
    focusDay = k;
    update(s => { (s.tasks[k] ||= []).push({ id: uid(), text, done: false }); });
  };
  root.oninput = e => {
    if (e.target.type === 'range') {
      e.target.nextElementSibling.textContent = e.target.value;
      e.target.parentElement.classList.remove('unset');
    }
  };
  root.onchange = e => {
    if (e.target.type !== 'range') return;
    const { k, f } = e.target.dataset;
    update(s => { (s.mindset[k] ||= {})[f] = Number(e.target.value); });
  };
}

export function after(root) {
  const s = getState(), days = weekDays();
  const el = root.querySelector('#mindChart');
  if (el) lineChart(el, MIND.map(m => ({ color: m.c, values: days.map(k => s.mindset[k]?.[m.f] ?? null) })), D.WD_SHORT);
  if (focusDay) {
    root.querySelector(`.add-task[data-k="${focusDay}"]`)?.focus();
    focusDay = null;
  } else if (scrolledFor !== offset) {
    // на телефоне сразу показываем сегодняшнюю карточку
    scrolledFor = offset;
    const sc = root.querySelector('.days-scroll'), card = root.querySelector('.day.is-today');
    if (sc && card && sc.scrollWidth > sc.clientWidth) sc.scrollLeft = card.offsetLeft - 16;
  }
}
