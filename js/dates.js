// даты храним строками 'YYYY-MM-DD' в локальном времени — их можно сравнивать как строки
export const pad = n => String(n).padStart(2, '0');
export const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => key(new Date());
export const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return key(d); };
export const weekday = k => (parse(k).getDay() + 6) % 7; // 0 = понедельник
export const weekStart = k => addDays(k, -weekday(k));
export const monthStart = k => k.slice(0, 8) + '01';
export const monthEnd = k => { const d = parse(k); return key(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);

export function range(a, b) {
  const out = [];
  for (let k = a; k <= b; k = addDays(k, 1)) out.push(k);
  return out;
}

export const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const WD_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
export const WD_FULL = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

export const fmtLong = k => { const d = parse(k); return `${WD_FULL[weekday(k)]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`; };
export const fmtShort = k => { const d = parse(k); return `${d.getDate()} ${MONTHS_GEN[d.getMonth()].slice(0, 3)}`; };
export const fmtNum = k => `${k.slice(8)}.${k.slice(5, 7)}.${k.slice(0, 4)}`;
export const fmtMonth = k => { const d = parse(k); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}
