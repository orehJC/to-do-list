import { getState, update, COLORS, uid } from './store.js';
import * as D from './dates.js';
import * as L from './logic.js';
import { esc, openModal, confirmClick, toast } from './ui.js';

const RHYTHMS = { daily: 'каждый день', weekly: 'N раз в неделю', monthly: 'N раз в месяц' };

const segRadios = (name, options, current) => Object.entries(options).map(([v, l]) =>
  `<label><input type="radio" name="${name}" value="${v}" ${v === current ? 'checked' : ''}><span>${l}</span></label>`).join('');

// создание / редактирование привычки. defaults — начальные значения для новой
export function habitModal(h, defaults = {}) {
  const s = getState(), isNew = !h;
  const d = h ? { ...h } : {
    name: '', color: COLORS[s.habits.length % COLORS.length], kind: 'check', rhythm: 'daily',
    target: 3, amount: 8, unit: '', days: [], time: 'any', goalId: '', ...defaults,
  };
  const goals = s.goals.filter(g => !g.done || g.id === d.goalId);

  const m = openModal(`
    <h3>${isNew ? 'новая привычка' : 'привычка'}</h3>
    <form>
      <label class="field"><span>название</span><input name="name" required maxlength="60" value="${esc(d.name)}" autofocus autocomplete="off"></label>
      <div class="field"><span>цвет</span><div class="swatches">${COLORS.map(c =>
        `<label class="sw"><input type="radio" name="color" value="${c}" ${c === d.color ? 'checked' : ''}><i style="--c:${c}"></i></label>`).join('')}</div></div>
      <div class="field"><span>тип</span><div class="seg sm">${segRadios('kind', L.KINDS, L.kind(d))}</div>
        <small class="muted kind-hint"></small></div>
      <div class="field-row f-amount">
        <label class="field"><span class="amount-label">цель за день</span><input type="number" name="amount" min="1" max="10000" value="${d.amount || 1}"></label>
        <label class="field f-unit"><span>единица</span><input name="unit" maxlength="20" value="${esc(d.unit || '')}" placeholder="стаканов, страниц…" autocomplete="off"></label>
      </div>
      <div class="field f-rhythm"><span>как часто</span><div class="seg sm">${segRadios('rhythm', RHYTHMS, d.rhythm)}</div></div>
      <div class="field f-days"><span>по каким дням <small class="muted">(ничего не выбрано — каждый день)</small></span>
        <div class="day-chips">${D.WD_SHORT.map((w, i) =>
          `<label><input type="checkbox" name="days" value="${i}" ${d.days?.includes(i) ? 'checked' : ''}><span>${w}</span></label>`).join('')}</div></div>
      <label class="field f-target"><span>сколько раз за период</span><input type="number" name="target" min="1" max="31" value="${d.target || 1}"></label>
      <div class="field"><span>когда</span><div class="seg sm">${segRadios('time', L.TIMES, d.time || 'any')}</div></div>
      <label class="field"><span>ведёт к цели</span><select name="goalId">
        <option value="">— ни к какой —</option>
        ${goals.map(g => `<option value="${g.id}" ${g.id === d.goalId ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}
      </select></label>
      ${isNew ? '' : `<div class="field"><span>порядок</span><div class="row gap">
        <button type="button" class="btn ghost sm" data-act="up">↑ выше</button>
        <button type="button" class="btn ghost sm" data-act="down">↓ ниже</button></div></div>`}
      <div class="modal-actions">
        ${isNew ? '' : `<button type="button" class="btn ghost" data-act="archive">${h.archived ? 'вернуть из архива' : 'в архив'}</button>
          <button type="button" class="btn danger" data-act="del" data-label="удалить">удалить</button>`}
        <span class="grow"></span>
        <button type="button" class="btn ghost" data-act="close">отмена</button>
        <button class="btn primary">сохранить</button>
      </div>
    </form>`);

  const form = m.el.querySelector('form'), f = form.elements;
  const HINTS = {
    check: 'просто отмечаешь, что сделал',
    count: 'считаешь количество: стаканы воды, страницы, отжимания',
    timer: 'запускаешь секундомер, минуты идут в зачёт',
    quit: 'день засчитывается сам — отмечаешь только срывы',
  };
  const sync = () => {
    const k = f.kind.value, r = f.rhythm.value;
    form.querySelector('.kind-hint').textContent = HINTS[k];
    form.querySelector('.f-amount').hidden = k !== 'count' && k !== 'timer';
    form.querySelector('.f-unit').hidden = k !== 'count';
    form.querySelector('.amount-label').textContent = k === 'timer' ? 'минут за день' : 'цель за день';
    form.querySelector('.f-rhythm').hidden = k === 'quit';
    form.querySelector('.f-days').hidden = k === 'quit' || r !== 'daily';
    form.querySelector('.f-target').hidden = k === 'quit' || r === 'daily';
  };
  sync();
  form.onchange = sync;

  form.onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(form);
    const k = fd.get('kind');
    const v = {
      name: String(fd.get('name')).trim(),
      color: fd.get('color') || d.color,
      kind: k,
      rhythm: k === 'quit' ? 'daily' : fd.get('rhythm'),
      target: Math.max(1, Math.min(31, Number(fd.get('target')) || 1)),
      amount: Math.max(1, Math.min(10000, Number(fd.get('amount')) || 1)),
      unit: String(fd.get('unit') || '').trim(),
      days: k === 'quit' ? [] : fd.getAll('days').map(Number).sort(),
      time: fd.get('time') || 'any',
      goalId: fd.get('goalId') || '',
    };
    if (v.days.length === 7) v.days = [];
    if (!v.name) return;
    defaults.onSave?.(v);
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
    else if (a === 'archive') {
      update(s => { const x = s.habits.find(y => y.id === h.id); x.archived = !x.archived; });
      toast(h.archived ? 'привычка вернулась' : 'привычка в архиве — история сохранена');
      m.close();
    }
    else if (a === 'del' && confirmClick(b, 'удалить вместе с историей?')) {
      update(s => {
        s.habits = s.habits.filter(x => x.id !== h.id);
        delete s.checks[h.id];
        delete s.notes?.[h.id];
      });
      m.close();
    }
  };
}

// один день одной привычки: значение / срыв / отметка + заметка + заморозка
export function dayModal(h, k) {
  const s = getState();
  const v = L.cell(s, h, k), kd = L.kind(h), frozen = v === 'F';
  const valueField = {
    count: `<label class="field"><span>сколько ${esc(L.unitOf(h))} (цель ${L.amount(h)})</span>
      <input type="number" name="value" min="0" step="any" value="${L.valueOf(s, h, k) || ''}" inputmode="decimal" autofocus></label>`,
    timer: `<label class="field"><span>минут (цель ${L.amount(h)})</span>
      <input type="number" name="value" min="0" step="any" value="${L.valueOf(s, h, k) || ''}" inputmode="decimal" autofocus></label>`,
    check: `<label class="check-row"><input type="checkbox" name="done" ${v === 1 ? 'checked' : ''}> выполнено</label>`,
    quit: `<label class="check-row"><input type="checkbox" name="relapse" ${v === 'X' ? 'checked' : ''}> был срыв</label>`,
  }[kd];

  const m = openModal(`
    <h3>${esc(h.name)}</h3>
    <p class="muted modal-sub">${D.fmtLong(k)}</p>
    <form>
      ${frozen ? '<p class="muted">🧊 день заморожен. если отметишь выполнение, токен вернётся.</p>' : ''}
      ${valueField}
      <label class="field"><span>заметка</span><textarea name="note" rows="3" maxlength="300" placeholder="как прошло, почему пропустил…">${esc(L.note(s, h, k))}</textarea></label>
      <div class="modal-actions">
        ${frozen ? '<button type="button" class="btn ghost" data-act="unfreeze">разморозить</button>'
          : !L.isDone(s, h, k) && !L.isQuit(h) && s.freeze.tokens > 0 && k <= D.today() ? '<button type="button" class="btn ghost" data-act="freeze">🧊 заморозить</button>' : ''}
        <span class="grow"></span>
        <button type="button" class="btn ghost" data-act="close">отмена</button>
        <button class="btn primary">сохранить</button>
      </div>
    </form>`);
  const form = m.el.querySelector('form'), f = form.elements;

  form.onsubmit = e => {
    e.preventDefault();
    let award = null;
    update(s => {
      const x = s.habits.find(y => y.id === h.id);
      if (k < x.created) x.created = k;
      const c = (s.checks[x.id] ||= {});
      if (kd === 'count' || kd === 'timer') {
        const nv = Number(f.value.value) || 0;
        if (nv !== L.valueOf(s, x, k) || (c[k] === 'F' && nv > 0)) award = L.setValue(s, x, k, nv);
      } else if (kd === 'check') {
        if (f.done.checked !== (c[k] === 1)) award = L.toggle(s, x, k);
      } else if (f.relapse.checked !== (c[k] === 'X')) L.toggle(s, x, k);
      L.setNote(s, x, k, f.note.value);
    });
    if (award) toast('7 дней подряд! +1 заморозка 🧊');
    m.close();
  };
  m.el.onclick = e => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'close') m.close();
    else if (a === 'freeze') { update(s => L.freezeDay(s, s.habits.find(y => y.id === h.id), k)); m.close(); }
    else if (a === 'unfreeze') { update(s => L.unfreezeDay(s, s.habits.find(y => y.id === h.id), k)); m.close(); }
  };
}
