// синхронизация через supabase: весь стейт — одна строка в таблице app_state (см. supabase.sql).
// стратегия простая: побеждает более свежий updatedAt. для одного человека этого хватает
import CONFIG from '../config.js';
import { getState, replaceState, subscribe } from './store.js';

const CFG_KEY = 'progress-sync-cfg';
const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';

let client = null, user = null, status = 'off', msg = '', timer = null, running = null, again = false;
const listeners = new Set();

export const onStatus = fn => (listeners.add(fn), () => listeners.delete(fn));
export const getStatus = () => ({ status, msg, user });
function setStatus(st, m = '') { status = st; msg = m; listeners.forEach(fn => fn(st)); }

export function getConfig() {
  let ls = {};
  try { ls = JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch { /* пусто */ }
  return {
    url: CONFIG.SUPABASE_URL || ls.url || '',
    key: CONFIG.SUPABASE_ANON_KEY || ls.key || '',
    fromFile: Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY),
  };
}

export function saveConfig(url, key) {
  localStorage.setItem(CFG_KEY, JSON.stringify({ url: url.trim(), key: key.trim() }));
  client = null; user = null;
  return init();
}

function loadLib() {
  if (window.supabase) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = LIB;
    s.onload = res;
    s.onerror = () => rej(new Error('не загрузилась библиотека supabase (нет сети?)'));
    document.head.append(s);
  });
}

export async function init() {
  const { url, key } = getConfig();
  if (!url || !key) return setStatus('off');
  try {
    await loadLib();
    client = window.supabase.createClient(url, key);
    const { data } = await client.auth.getSession();
    user = data.session?.user || null;
    if (!user) return setStatus('signed-out');
    await pull();
  } catch (e) {
    setStatus(navigator.onLine ? 'error' : 'offline', navigator.onLine ? e.message : '');
  }
}

export async function signIn(email, password) {
  if (!client) await init();
  if (!client) throw new Error('сначала укажи url и ключ supabase');
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'неверный email или пароль' : error.message);
  user = data.user;
  await pull({ preferRemote: true });
}

export async function signOut() {
  await client?.auth.signOut();
  user = null;
  setStatus('signed-out');
}

async function fetchRemote() {
  const { data, error } = await client.from('app_state').select('data').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data?.data || null;
}

async function upload(state) {
  const { error } = await client.from('app_state').upsert({ user_id: user.id, data: state, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// сравнить локальное и облачное, более свежее победит. одновременно идёт только один прогон
export function pull(opts = {}) {
  if (!client || !user) return Promise.resolve();
  if (running) { again = true; return running; }
  running = (async () => {
    if (!navigator.onLine) return setStatus('offline');
    setStatus('syncing');
    try {
      const remote = await fetchRemote();
      const local = getState();
      if (remote && (opts.preferRemote || (remote.updatedAt || 0) > (local.updatedAt || 0))) replaceState(remote, { remote: true });
      else if (!remote || (local.updatedAt || 0) > (remote.updatedAt || 0)) await upload(local);
      setStatus('ok');
    } catch (e) {
      setStatus('error', e.message || String(e));
    }
  })().finally(() => {
    running = null;
    if (again) { again = false; pull(); }
  });
  return running;
}

subscribe((_s, meta) => {
  if (meta?.remote || !client || !user) return;
  clearTimeout(timer);
  timer = setTimeout(pull, 1200);
});
window.addEventListener('online', () => pull());
setInterval(() => { if (document.visibilityState === 'visible') pull(); }, 60_000);
