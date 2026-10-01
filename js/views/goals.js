import { getState, update, uid, AREAS } from '../store.js';
import * as D from '../dates.js';
import { esc, icon, ring, openModal, confirmClick } from '../ui.js';
import * as L from '../logic.js';

export const title = 'цели';

let areaFilter = null, showDone = false;

export const progressOf = g => g.done ? 1 : g.milestones?.length
  ? g.milestones.filter(m => m.done).length / g.milestones.length
  : (g.progress || 0) / 100;

const areaOf = id => AREAS.find(a => a.id === id) || AREAS[0];

function status(g, t) {
  if (g.done) return '<span class="tag done">достигнута</span>';
  if (g.deadline && g.deadline < t) return '<span class="tag late">просрочена</span>';
  return '<span class="tag">в процессе</span>';
}

const habitsOf = (s, g) => L.active(s).filter(h => h.goalId === g.id);

function linked(s, g, t) {
  const hs = habitsOf(s, g);
  if (!hs.length) return '';
  return `<div class="linked">${hs.map(h => `<span class="chip"><i class="dot" style="--c:${h.color}"></i>${esc(h.name)} <b>🔥${L.streak(s, h)}</b> <span class="muted">${L.pct(L.rate(s, h, D.addDays(t, -29)))}</span></span>`).join('')}</div>`;
}

function card(s, g, t) {
  const a = areaOf(g.area), p = progressOf(g);
  const left = g.deadline ? D.daysBetween(t, g.deadline) : null;
  const when = left == null ? 'без дедлайна'
    : left >= 0 ? `${left} ${D.plural(left, 'день', 'дня', 'дней')} осталось` : `${-left} ${D.plural(-left, 'день', 'дня', 'дней')} назад`;
  return `<article class="panel goal ${g.done ? 'is-done' : ''}" data-act="edit" data-id="${g.id}">
    <div class="row between"><h3>${esc(g.title)}</h3>
      <button class="pin ${g.pinned ? 'on' : ''}" data-act="pin" data-id="${g.id}" title="${g.pinned ? 'открепить' : 'в приоритеты'}">${icon.pin}</button></div>
    ${status(g, t)}
    <div class="goal-meta"><span class="eyebrow">${a.name}</span><span class="muted sm">${g.done ? '' : when}</span></div>
    <div class="progress-line big"><i style="width:${p * 100}%"></i></div>
    <div class="muted sm">${Math.round(p * 100)}%${g.milestones?.length ? ` · ${g.milestones.filter(m => m.done).length}/${g.milestones.length} этапов` : ''}</div>
    ${linked(s, g, t)}
  </article>`;
}

export function render(root) {
  const s = getState(), t = D.today(), goals = s.goals;
  const achieved = goals.filter(g => g.done).length;
  const areasUsed = new Set(goals.map(g => g.area)).size;
  const pinned = goals.filter(g => g.pinned && !g.done);
  const list = goals.filter(g => (!areaFilter || g.area === areaFilter) && (showDone || !g.done));

  root.innerHTML = `
    <section class="panel goals-head">
      ${ring(goals.length ? achieved / goals.length : 0, { size: 104, stroke: 9, label: `${achieved}/${goals.length}` })}
      <div><div class="eyebrow">целей достигнуто</div><div class="strong">${areasUsed} из ${AREAS.length} сфер жизни в работе</div></div>
      <span class="grow"></span>
      <button class="btn primary" data-act="new">${icon.plus} новая цель</button>
    </section>
    <h2 class="section-title">сферы жизни</h2>
    <div class="areas">${AREAS.map(a => {
      const gs = goals.filter(g => g.area === a.id);
      return `<button class="panel area ${areaFilter === a.id ? 'on' : ''}" data-act="area" data-area="${a.id}">
        <b>${a.name}</b><span class="muted sm">${gs.length} ${D.plural(gs.length, 'цель', 'цели', 'целей')} · ${gs.filter(g => g.done).length} достигнуто</span></button>`;
    }).join('')}</div>
    ${pinned.length ? `<h2 class="section-title">главные приоритеты</h2><div class="goal-list">${pinned.map(g => card(s, g, t)).join('')}</div>` : ''}
    <div class="row between wrap gap section-title">
      <h2>${areaFilter ? areaOf(areaFilter).name : 'все цели'}</h2>
      <div class="row gap">
        ${areaFilter ? '<button class="btn ghost sm" data-act="area" data-area="">все сферы</button>' : ''}
        <button class="btn ghost sm" data-act="showdone">${showDone ? 'скрыть достигнутые' : 'показать достигнутые'}</button>
      </div>
    </div>
    ${list.length ? `<div class="goal-list">${list.map(g => card(s, g, t)).join('')}</div>`
      : `<div class="empty panel"><p>${goals.length ? 'здесь целей нет' : 'поставь первую цель — что хочешь сделать за ближайшие месяцы?'}</p></div>`}`;

  root.onclick = e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'pin') { e.stopPropagation(); update(s => { const g = s.goals.find(x => x.id === b.dataset.id); g.pinned = !g.pinned; }); }
    else if (a === 'area') { areaFilter = b.dataset.area && areaFilter !== b.dataset.area ? b.dataset.area : null; render(root); }
    else if (a === 'showdone') { showDone = !showDone; render(root); }
    else if (a === 'new') goalModal();
    else if (a === 'edit') goalModal(getState().goals.find(g => g.id === b.dataset.id));
  };
}

function goalModal(g) {
  const isNew = !g;
  const d = structuredClone(g || { title: '', area: areaFilter || 'health', deadline: '', why: '', milestones: [], progress: 0, pinned: false, done: false });
  const m = openModal(`<h3>${isNew ? 'новая цель' : 'цель'}</h3><form></form>`);
  const form = m.el.querySelector('form');

  // поля читаем в черновик перед каждой перерисовкой формы, чтобы не терять ввод
  const read = () => {
    const f = form.elements;
    if (!f.title) return;
    d.title = f.title.value; d.area = f.area.value; d.deadline = f.deadline.value; d.why = f.why.value;
    d.done = f.done.checked; d.pinned = f.pinned.checked;
    if (f.progress) d.progress = Number(f.progress.value);
    d.milestones.forEach((ms, i) => { ms.text = f[`ms${i}`]?.value ?? ms.text; });
  };
  const draw = (focusNew = false) => {
    form.innerHTML = `
      <label class="field"><span>цель</span><input name="title" required maxlength="80" value="${esc(d.title)}" autocomplete="off" ${isNew ? 'autofocus' : ''}></label>
      <div class="field-row">
        <label class="field"><span>сфера</span><select name="area">${AREAS.map(a => `<option value="${a.id}" ${a.id === d.area ? 'selected' : ''}>${a.name}</option>`).join('')}</select></label>
        <label class="field"><span>дедлайн</span><input type="date" name="deadline" value="${d.deadline || ''}"></label>
      </div>
      <label class="field"><span>зачем мне это</span><textarea name="why" rows="2" maxlength="400">${esc(d.why)}</textarea></label>
      <div class="field"><span>этапы ${d.milestones.length ? '' : '<small class="muted">(или прогресс вручную ниже)</small>'}</span>
        <ul class="ms-list">${d.milestones.map((ms, i) => `<li>
          <button type="button" class="cb ${ms.done ? 'on' : ''}" data-act="mstoggle" data-i="${i}">${icon.check}</button>
          <input name="ms${i}" value="${esc(ms.text)}" maxlength="100" autocomplete="off">
          <button type="button" class="x" data-act="msdel" data-i="${i}" aria-label="удалить этап">${icon.x}</button></li>`).join('')}</ul>
        <button type="button" class="btn ghost sm" data-act="msadd">${icon.plus} этап</button>
      </div>
      ${d.milestones.length ? '' : `<label class="field"><span>прогресс: <b class="pv">${d.progress || 0}%</b></span>
        <input type="range" name="progress" min="0" max="100" step="5" value="${d.progress || 0}"></label>`}
      ${isNew ? '' : `<div class="field"><span>привычки к этой цели</span>
        ${linked(getState(), g, D.today()) || '<small class="muted">пока нет. привязать можно в настройках привычки → «ведёт к цели»</small>'}</div>`}
      <div class="row gap wrap">
        <label class="check-row"><input type="checkbox" name="pinned" ${d.pinned ? 'checked' : ''}> в приоритеты</label>
        <label class="check-row"><input type="checkbox" name="done" ${d.done ? 'checked' : ''}> достигнута 🎉</label>
      </div>
      <div class="modal-actions">
        ${isNew ? '' : '<button type="button" class="btn danger" data-act="del" data-label="удалить">удалить</button>'}
        <span class="grow"></span>
        <button type="button" class="btn ghost" data-act="close">отмена</button>
        <button class="btn primary">сохранить</button>
      </div>`;
    if (focusNew) form.elements[`ms${d.milestones.length - 1}`]?.focus();
    else form.querySelector('[autofocus]')?.focus();
  };
  draw();

  form.oninput = e => { if (e.target.name === 'progress') form.querySelector('.pv').textContent = e.target.value + '%'; };
  form.onkeydown = e => {
    if (e.key === 'Enter' && e.target.name?.startsWith('ms')) { e.preventDefault(); read(); d.milestones.push({ id: uid(), text: '', done: false }); draw(true); }
  };
  form.onclick = e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act, i = Number(b.dataset.i);
    if (a === 'close') return m.close();
    if (a === 'del') {
      if (confirmClick(b)) {
        update(s => {
          s.goals = s.goals.filter(x => x.id !== g.id);
          s.habits.forEach(h => { if (h.goalId === g.id) h.goalId = ''; });
        });
        m.close();
      }
      return;
    }
    read();
    if (a === 'msadd') { d.milestones.push({ id: uid(), text: '', done: false }); draw(true); }
    else if (a === 'mstoggle') { d.milestones[i].done = !d.milestones[i].done; draw(); }
    else if (a === 'msdel') { d.milestones.splice(i, 1); draw(); }
  };
  form.onsubmit = e => {
    e.preventDefault();
    read();
    d.title = d.title.trim();
    if (!d.title) return;
    d.milestones = d.milestones.filter(ms => ms.text.trim());
    update(s => {
      if (isNew) s.goals.push({ ...d, id: uid(), created: D.today() });
      else Object.assign(s.goals.find(x => x.id === g.id), d);
    });
    m.close();
  };
}
