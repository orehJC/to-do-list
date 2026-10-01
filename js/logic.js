import * as D from './dates.js';
import { MAX_TOKENS } from './store.js';

export const RHYTHM_LABEL = { daily: 'ежедневные', weekly: 'еженедельные', monthly: 'ежемесячные' };
export const UNIT = { daily: 'д', weekly: 'нед', monthly: 'мес' };

export const cell = (s, h, k) => s.checks[h.id]?.[k];
export const isDone = (s, h, k) => cell(s, h, k) === 1;
export const isFrozen = (s, h, k) => cell(s, h, k) === 'F';
export const target = h => (h.rhythm === 'daily' ? 1 : Math.max(1, h.target || 1));

// период: для daily — день, для weekly — неделя с понедельника, для monthly — месяц.
// период идентифицируем его первым днём
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
const nextPeriod = (h, k) => D.addDays(periodEnd(h, k), 1);
const prevPeriod = (h, k) => D.addDays(periodStart(h, k), -1);

function countIn(s, h, from, to, value = 1) {
  const c = s.checks[h.id];
  if (!c) return 0;
  let n = 0;
  for (let k = from; k <= to; k = D.addDays(k, 1)) if (c[k] === value) n++;
  return n;
}

export const periodCount = (s, h, k) => countIn(s, h, periodStart(h, k), periodEnd(h, k));
export const periodDone = (s, h, k) => (h.rhythm === 'daily' ? isDone(s, h, k) : periodCount(s, h, k) >= target(h));
const periodFrozen = (s, h, k) => (h.rhythm === 'daily' ? isFrozen(s, h, k) : countIn(s, h, periodStart(h, k), periodEnd(h, k), 'F') > 0);
// «засчитан» = выполнен или заморожен (заморозка держит цепочку, но не увеличивает стрик)
export const periodMet = (s, h, k) => periodDone(s, h, k) || periodFrozen(s, h, k);

export function streak(s, h, asOf = D.today()) {
  let k = asOf, n = 0;
  if (!periodMet(s, h, k)) k = prevPeriod(h, k); // текущий период ещё идёт — он стрик не рвёт
  const first = periodStart(h, h.created);
  while (k >= first && periodMet(s, h, k)) {
    if (periodDone(s, h, k)) n++;
    k = prevPeriod(h, k);
  }
  return n;
}

export function bestStreak(s, h) {
  const end = periodStart(h, D.today());
  let k = periodStart(h, h.created), run = 0, best = 0;
  while (k <= end) {
    if (periodDone(s, h, k)) best = Math.max(best, ++run);
    else if (!periodMet(s, h, k) && k !== end) run = 0;
    k = nextPeriod(h, k);
  }
  return best;
}

// доля засчитанных периодов в интервале. замороженные не считаем, незаконченный текущий — только если уже выполнен
export function rate(s, h, from, to = D.today()) {
  const start = from > h.created ? from : h.created;
  if (start > to) return null;
  const curr = periodStart(h, D.today());
  let k = periodStart(h, start), done = 0, total = 0;
  while (k <= to) {
    if (periodDone(s, h, k)) { done++; total++; }
    else if (!periodMet(s, h, k) && k !== curr) total++;
    k = nextPeriod(h, k);
  }
  return total ? done / total : null;
}

// прогресс привычки на конкретный день, 0..1 (для недельных/месячных — сколько набрано в периоде к этому дню)
export function progressAsOf(s, h, k) {
  if (h.rhythm === 'daily') return cell(s, h, k) ? 1 : 0;
  if (periodFrozen(s, h, k)) return 1;
  return Math.min(1, countIn(s, h, periodStart(h, k), k) / target(h));
}

// процент выполнения ежедневных привычек за день
export function dayRate(s, k) {
  let done = 0, total = 0;
  for (const h of s.habits) {
    if (h.rhythm !== 'daily' || k < h.created) continue;
    const c = cell(s, h, k);
    if (c === 'F') continue;
    total++;
    if (c === 1) done++;
  }
  return total ? done / total : null;
}

export function avg(values) {
  const v = values.filter(x => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export const pct = x => (x == null ? '—' : Math.round(x * 100) + '%');

// показывать ли привычку в «сегодня»: ежедневные — всегда; недельные/месячные — пока план периода не закрыт
export function dueOn(s, h, k) {
  if (k < h.created) return false;
  if (h.rhythm === 'daily' || cell(s, h, k)) return true;
  if (periodFrozen(s, h, k)) return false;
  return periodCount(s, h, k) < target(h);
}

// отметить/снять отметку. возвращает 'award', если за 7 дней подряд выдана заморозка
export function toggle(s, h, k) {
  const c = (s.checks[h.id] ||= {});
  if (c[k] === 1) { delete c[k]; return null; }
  if (c[k] === 'F') s.freeze.tokens = Math.min(MAX_TOKENS, s.freeze.tokens + 1);
  c[k] = 1;
  if (h.rhythm === 'daily' && k === D.today()) {
    const n = streak(s, h, k);
    const awardKey = `${h.id}@${k}`;
    if (n > 0 && n % 7 === 0 && !s.freeze.awards[awardKey] && s.freeze.tokens < MAX_TOKENS) {
      s.freeze.awards[awardKey] = 1;
      s.freeze.tokens++;
      return 'award';
    }
  }
  return null;
}

export function freezeDay(s, h, k) {
  const c = (s.checks[h.id] ||= {});
  if (c[k] || s.freeze.tokens <= 0) return false;
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
    for (const h of s.habits) {
      if (h.rhythm !== 'daily' || d <= h.created || f.tokens <= 0) continue;
      if (cell(s, h, d)) continue;
      if (!cell(s, h, D.addDays(d, -1))) continue; // цепочки не было — нечего спасать
      (s.checks[h.id] ||= {})[d] = 'F';
      f.tokens--;
      used++;
    }
  }
  f.processedTo = y;
  return used;
}
