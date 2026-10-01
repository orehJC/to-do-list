// всё состояние приложения — один json-объект. лежит в localStorage и целиком синкается в supabase
const KEY = 'progress-state-v1';

export const MAX_TOKENS = 10;

export const AREAS = [
  { id: 'health', name: 'Здоровье и спорт', emoji: '💪' },
  { id: 'career', name: 'Учёба и карьера', emoji: '📈' },
  { id: 'money', name: 'Финансы', emoji: '💰' },
  { id: 'relations', name: 'Друзья и семья', emoji: '🧡' },
  { id: 'love', name: 'Любовь', emoji: '💖' },
  { id: 'mind', name: 'Внутренний мир', emoji: '✨' },
  { id: 'home', name: 'Дом', emoji: '🏡' },
  { id: 'travel', name: 'Путешествия', emoji: '✈️' },
  { id: 'fun', name: 'Хобби', emoji: '🎲' },
  { id: 'community', name: 'Сообщество', emoji: '🌍' },
];

export const COLORS = ['#a78bfa', '#60a5fa', '#f87171', '#4ade80', '#fbbf24', '#f472b6', '#2dd4bf', '#fb923c'];

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function blank() {
  return {
    v: 1,
    updatedAt: 0,
    habits: [],      // {id, name, color, rhythm: 'daily'|'weekly'|'monthly', target, created}
    checks: {},      // {habitId: {'YYYY-MM-DD': 1 | 'F'}}  F = день заморожен
    freeze: { tokens: 3, auto: true, processedTo: null, awards: {} },
    tasks: {},       // {'YYYY-MM-DD': [{id, text, done}]}
    mindset: {},     // {'YYYY-MM-DD': {energy, focus, motivation}} 1..10
    goals: [],       // {id, title, area, deadline, why, milestones: [{id, text, done}], progress, pinned, done, created}
    journal: {},     // {'YYYY-MM': text}
  };
}

function migrate(s) {
  const b = blank();
  const out = { ...b, ...(s || {}) };
  out.freeze = { ...b.freeze, ...(s?.freeze || {}) };
  return out;
}

function load() {
  try { return migrate(JSON.parse(localStorage.getItem(KEY))); }
  catch { return blank(); }
}

let state = load();
const subs = new Set();

export const getState = () => state;
export const subscribe = fn => (subs.add(fn), () => subs.delete(fn));

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { console.error('не удалось сохранить', e); }
}

function emit(meta) { subs.forEach(fn => fn(state, meta)); }

// мутатор может вернуть false — тогда ничего не сохраняем и не перерисовываем
export function update(mutator, { render = true } = {}) {
  if (mutator(state) === false) return;
  state.updatedAt = Date.now();
  save();
  emit({ render });
}

// remote: true — данные пришли из облака, обратно их пушить не надо
export function replaceState(next, { remote = false } = {}) {
  state = migrate(next);
  if (!remote) state.updatedAt = Date.now();
  save();
  emit({ render: true, remote });
}
