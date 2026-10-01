import * as D from './dates.js';
import { MAX_TOKENS, uid } from './store.js';

export const RHYTHM_LABEL = { daily: 'ежедневные', weekly: 'еженедельные', monthly: 'ежемесячные' };
export const UNIT = { daily: 'д', weekly: 'нед', monthly: 'мес' };
export const KINDS = { check: 'отметка', count: 'число', timer: 'таймер', quit: 'бросить' };
export const TIMES = { any: 'в любое время', morning: 'утро', day: 'день', evening: 'вечер' };

// виды привычек:
//   check — сделал/не сделал, в checks лежит 1
//   count — число за день (стаканы, страницы), в checks лежит число, выполнено при >= amount
//   timer — минуты за день, как count, но с секундомером
//   quit  — «бросить»: день чистый по умолчанию, в checks отмечаются срывы 'X'
// в любом виде 'F' = день заморожен

export const active = s => s.habits.filter(h => !h.archived);
export const kind = h => h.kind || 'check';
export const amount = h => Math.max(1, Number(h.amount) || 1);
export const target = h => (h.rhythm === 'daily' ? 1 : Math.max(1, h.target || 1));
export const isQuit = h => kind(h) === 'quit';
export const isMeasured = h => kind(h) === 'count' || kind(h) === 'timer';
export const unitOf = h => (kind(h) === 'timer' ? 'мин' : h.unit || '');

// у ежедневных можно выбрать дни недели (0 = пн). пустой список — все дни
export const scheduled = (h, k) => h.rhythm !== 'daily' || !h.days?.length || h.days.includes(D.weekday(k));

export const cell = (s, h, k) => s.checks[h.id]?.[k];
export const note = (s, h, k) => s.notes?.[h.id]?.[k] || '';
export const isFrozen = (s, h, k) => cell(s, h, k) === 'F';
export const isRelapse = (s, h, k) => cell(s, h, k) === 'X';
export const valueOf = (s, h, k) => { const v = cell(s, h, k); return typeof v === 'number' ? v : 0; };

export function isDone(s, h, k) {
  const v = cell(s, h, k);
  switch (kind(h)) {
    case 'quit': return k >= h.created && k <= D.today() && v !== 'X';
    case 'count': case 'timer': return typeof v === 'number' && v >= amount(h);
    default: return v === 1;
  }
}

// что-то отмечено вручную в этот день (для quit — только срыв)
export const touched = (s, h, k) => (isQuit(h) ? isRelapse(s, h, k) : cell(s, h, k) != null);

// ---------- периоды ----------
// период: для ежедневных — запланированный день, для weekly — неделя с понедельника, для monthly — месяц.
// идентифицируем период его первым днём
export function periodStart(h, k) {
  if (h.rhythm === 'weekly') return D.weekStart(k);
  if (h.rhythm === 'monthly') return D.monthStart(k);
  return k;
}
export function periodEnd(h, k) {
  if (h.rhythm === 'weekly') return D.addDays(D.weekStart(k), 6);
  if (h.rhythm === 'monthly') return D.monthEnd(k);
  return k;
}
function stepSched(h, k, dir) {
  for (let i = 0; i < 7; i++) { k = D.addDays(k, dir); if (scheduled(h, k)) return k; }
  return k;
}
const nextPeriod = (h, k) => (h.rhythm === 'daily' ? stepSched(h, k, 1) : D.addDays(periodEnd(h, k), 1));
const prevPeriod = (h, k) => (h.rhythm === 'daily' ? stepSched(h, k, -1) : D.addDays(periodStart(h, k), -1));
const firstPeriodFrom = (h, k) => (h.rhythm === 'daily' ? (scheduled(h, k) ? k : stepSched(h, k, 1)) : periodStart(h, k));
const isCurrent = (h, k) => periodStart(h, k) === periodStart(h, D.today());

function countIn(s, h, from, to) {
  let n = 0;
  for (let k = from; k <= to; k = D.addDays(k, 1)) if (isDone(s, h, k)) n++;
  return n;
}
function frozenIn(s, h, from, to) {
  const c = s.checks[h.id];
  if (!c) return false;
  for (let k = from; k <= to; k = D.addDays(k, 1)) if (c[k] === 'F') return true;
  return false;
}

export const periodCount = (s, h, k) => countIn(s, h, periodStart(h, k), periodEnd(h, k));
export const periodDone = (s, h, k) => (h.rhythm === 'daily' ? isDone(s, h, k) : periodCount(s, h, k) >= target(h));
const periodFrozen = (s, h, k) => (h.rhythm === 'daily' ? isFrozen(s, h, k) : frozenIn(s, h, periodStart(h, k), periodEnd(h, k)));
// «засчитан» = выполнен или заморожен (заморозка держит цепочку, но не увеличивает стрик)
export const periodMet = (s, h, k) => periodDone(s, h, k) || periodFrozen(s, h, k);

// ---------- стрики и статистика ----------
export function streak(s, h, asOf = D.today()) {
  let k = asOf, n = 0;
  if (isQuit(h) && isRelapse(s, h, k)) return 0;
  if (h.rhythm === 'daily' && !scheduled(h, k)) k = stepSched(h, k, -1);
  else if (!periodMet(s, h, k)) k = prevPeriod(h, k); // текущий период ещё идёт — он стрик не рвёт
  const first = firstPeriodFrom(h, h.created);
  while (k >= first && periodMet(s, h, k)) {
    if (periodDone(s, h, k)) n++;
    k = prevPeriod(h, k);
  }
  return n;
}

export function bestStreak(s, h) {
  const t = D.today();
  let k = firstPeriodFrom(h, h.created), run = 0, best = 0;
  while (k <= t) {
    if (periodDone(s, h, k)) best = Math.max(best, ++run);
    else if (!periodMet(s, h, k) && !isCurrent(h, k)) run = 0;
    k = nextPeriod(h, k);
  }
  return best;
}

// доля засчитанных периодов в интервале. замороженные не считаем, незаконченный текущий — только если уже выполнен
export function rate(s, h, from, to = D.today()) {
  const start = from > h.created ? from : h.created;
  if (start > to) return null;
  let k = firstPeriodFrom(h, start), done = 0, total = 0;
  while (k <= to) {
    if (periodDone(s, h, k)) { done++; total++; }
    else if (!periodMet(s, h, k) && !isCurrent(h, k)) total++;
    k = nextPeriod(h, k);
  }
  return total ? done / total : null;
}

// «сила привычки» как в loop habit tracker: экспоненциальное сглаживание,
// один пропуск чуть снижает балл, а не обнуляет его. 0..1
export function strength(s, h) {
  const t = D.today();
  const perDay = h.rhythm === 'daily' ? (h.days?.length || 7) / 7 : h.rhythm === 'weekly' ? target(h) / 7 : target(h) / 30;
  const mDay = Math.pow(0.5, Math.sqrt(Math.min(1, perDay)) / 13);
  const span = h.rhythm === 'daily' ? 7 / (h.days?.length || 7) : h.rhythm === 'weekly' ? 7 : 30;
  const m = Math.pow(mDay, span);
  let k = firstPeriodFrom(h, h.created), score = 0;
  while (k <= t) {
    const cur = isCurrent(h, k);
    if (periodDone(s, h, k)) score = score * m + (1 - m);
    else if (!periodFrozen(s, h, k) && !cur) {
      const v = h.rhythm === 'daily' ? progressAsOf(s, h, k) : Math.min(1, periodCount(s, h, k) / target(h));
      score = score * m + v * (1 - m);
    }
    k = nextPeriod(h, k);
  }
  return score;
}

// прогресс привычки на конкретный день, 0..1 (для недельных/месячных — сколько набрано в периоде к этому дню)
export function progressAsOf(s, h, k) {
  if (h.rhythm === 'daily') {
    if (isDone(s, h, k) || isFrozen(s, h, k)) return 1;
    return isMeasured(h) ? Math.min(1, valueOf(s, h, k) / amount(h)) : 0;
  }
  if (periodFrozen(s, h, k)) return 1;
  return Math.min(1, countIn(s, h, periodStart(h, k), k) / target(h));
}

// процент выполнения ежедневных привычек за день
export function dayRate(s, k) {
  let done = 0, total = 0;
  for (const h of active(s)) {
    if (h.rhythm !== 'daily' || k < h.created || !scheduled(h, k)) continue;
    if (isFrozen(s, h, k)) continue;
    total++;
    if (isDone(s, h, k)) done++;
  }
  return total ? done / total : null;
}

export function avg(values) {
  const v = values.filter(x => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export const pct = x => (x == null ? '—' : Math.round(x * 100) + '%');

// показывать ли привычку в «сегодня»
export function dueOn(s, h, k) {
  if (h.archived || k < h.created) return false;
  if (h.rhythm === 'daily') return scheduled(h, k) || touched(s, h, k);
  if (touched(s, h, k)) return true;
  if (periodFrozen(s, h, k)) return false;
  return periodCount(s, h, k) < target(h);
}

// ---------- изменения ----------
function maybeAward(s, h, k) {
  if (h.rhythm !== 'daily' || isQuit(h) || k !== D.today() || !isDone(s, h, k)) return null;
  const n = streak(s, h, k);
  const key = `${h.id}@${k}`;
  if (n > 0 && n % 7 === 0 && !s.freeze.awards[key] && s.freeze.tokens < MAX_TOKENS) {
    s.freeze.awards[key] = 1;
    s.freeze.tokens++;
    return 'award';
  }
  return null;
}

function refundIfFrozen(s, c, k) {
  if (c[k] === 'F') s.freeze.tokens = Math.min(MAX_TOKENS, s.freeze.tokens + 1);
}

// отметить/снять. для quit — поставить/снять срыв. возвращает 'award', если выдана заморозка
export function toggle(s, h, k) {
  const c = (s.checks[h.id] ||= {});
  if (isQuit(h)) {
    if (c[k] === 'X') delete c[k]; else { refundIfFrozen(s, c, k); c[k] = 'X'; }
    return null;
  }
  if (isMeasured(h)) return setValue(s, h, k, isDone(s, h, k) ? 0 : amount(h));
  if (c[k] === 1) { delete c[k]; return null; }
  refundIfFrozen(s, c, k);
  c[k] = 1;
  return maybeAward(s, h, k);
}

export function setValue(s, h, k, v) {
  const c = (s.checks[h.id] ||= {});
  v = Math.max(0, Math.round(Number(v) * 10) / 10 || 0);
  refundIfFrozen(s, c, k);
  if (v > 0) c[k] = v; else delete c[k];
  return maybeAward(s, h, k);
}

export function setNote(s, h, k, text) {
  const t = String(text || '').trim();
  const n = ((s.notes ||= {})[h.id] ||= {});
  if (t) n[k] = t; else delete n[k];
  if (!Object.keys(n).length) delete s.notes[h.id];
}

export function freezeDay(s, h, k) {
  const c = (s.checks[h.id] ||= {});
  if (isDone(s, h, k) || c[k] === 'F' || isQuit(h) || s.freeze.tokens <= 0) return false;
  c[k] = 'F';
  s.freeze.tokens--;
  return true;
}

export function unfreezeDay(s, h, k) {
  if (s.checks[h.id]?.[k] !== 'F') return false;
  delete s.checks[h.id][k];
  s.freeze.tokens = Math.min(MAX_TOKENS, s.freeze.tokens + 1);
  return true;
}

// автозаморозка: за каждый пропущенный прошедший день ежедневной привычки, у которой
// накануне была живая цепочка, тратим токен. возвращает число потраченных токенов или false
export function processFreezes(s) {
  const y = D.addDays(D.today(), -1);
  const f = s.freeze;
  if (!f.processedTo) { f.processedTo = y; return 0; }
  if (f.processedTo >= y) return false;
  let from = D.addDays(f.processedTo, 1);
  const limit = D.addDays(y, -60);
  if (from < limit) from = limit;
  let used = 0;
  for (let d = from; d <= y; d = D.addDays(d, 1)) {
    if (!f.auto) break;
    for (const h of active(s)) {
      if (h.rhythm !== 'daily' || isQuit(h) || d <= h.created || !scheduled(h, d) || f.tokens <= 0) continue;
      if (isDone(s, h, d) || isFrozen(s, h, d)) continue;
      const prev = stepSched(h, d, -1);
      if (prev < h.created || !(isDone(s, h, prev) || isFrozen(s, h, prev))) continue; // цепочки не было — нечего спасать
      (s.checks[h.id] ||= {})[d] = 'F';
      f.tokens--;
      used++;
    }
  }
  f.processedTo = y;
  return used;
}

// невыполненные задачи прошлых дней переезжают на сегодня. в старом дне остаются помеченными «перенесено»
export function rollTasks(s) {
  const t = D.today(), y = D.addDays(t, -1), r = s.taskRoll;
  if (!r.processedTo) r.processedTo = D.addDays(t, -8);
  if (r.processedTo >= y) return false;
  let from = D.addDays(r.processedTo, 1);
  const limit = D.addDays(t, -30);
  if (from < limit) from = limit;
  let moved = 0;
  if (r.on) {
    for (let d = from; d <= y; d = D.addDays(d, 1)) {
      for (const x of s.tasks[d] || []) {
        if (x.done || x.moved) continue;
        x.moved = true;
        (s.tasks[t] ||= []).push({ id: uid(), text: x.text, done: false, from: x.from || d });
        moved++;
      }
    }
  }
  r.processedTo = y;
  return moved;
}
