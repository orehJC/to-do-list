import { update, subscribe } from './store.js';
import { processFreezes } from './logic.js';
import * as D from './dates.js';
import * as sync from './sync.js';
import { icon, toast } from './ui.js';
import * as today from './views/today.js';
import * as habits from './views/habits.js';
import * as tasks from './views/tasks.js';
import * as goals from './views/goals.js';
import * as insights from './views/insights.js';
import * as settings from './views/settings.js';

const routes = { today, habits, tasks, goals, insights, settings };
const NAV = [['today', 'home'], ['habits', 'grid'], ['tasks', 'tasks'], ['goals', 'target'], ['insights', 'bars']];
const view = document.getElementById('view');
let current = null, day = D.today();

document.getElementById('nav').innerHTML = NAV.map(([r, i]) =>
  `<a href="#${r}" data-route="${r}">${icon[i]}<span>${routes[r].title}</span></a>`).join('');
document.getElementById('gear').innerHTML = icon.gear;

const routeName = () => {
  const r = location.hash.slice(1);
  return r in routes ? r : 'today';
};

function render() {
  const name = routeName(), mod = routes[name];
  const switched = current !== name;
  // запоминаем прокрутку горизонтальных блоков, чтобы перерисовка не сбрасывала её
  const scroll = {};
  if (!switched) view.querySelectorAll('[data-scroll-id]').forEach(el => { scroll[el.dataset.scrollId] = el.scrollLeft; });
  view.onclick = view.onchange = view.oninput = view.onkeydown = view.onsubmit = null;
  current = name;
  document.title = `${mod.title} · Прогресс`;
  document.getElementById('pageTitle').textContent = mod.title;
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.route === name));
  mod.render(view);
  view.querySelectorAll('[data-scroll-id]').forEach(el => { if (el.dataset.scrollId in scroll) el.scrollLeft = scroll[el.dataset.scrollId]; });
  mod.after?.(view);
  if (switched) window.scrollTo(0, 0);
}

subscribe((_s, meta) => { if (meta?.render !== false) render(); });
window.addEventListener('hashchange', render);

let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 200); });

const dot = document.getElementById('syncDot');
sync.onStatus(st => {
  dot.className = 'sync-dot ' + st;
  dot.title = st;
  if (current === 'settings') render();
});

function runFreezes() {
  let used = 0;
  update(s => { const r = processFreezes(s); used = r || 0; return r !== false; });
  if (used) toast(`потрачено заморозок: ${used} — стрики спасены 🧊`);
}

// сначала тянем облако, потом считаем заморозки — иначе можно перетереть свежие отметки с телефона
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  await sync.pull();
  if (D.today() !== day) { day = D.today(); runFreezes(); render(); }
});

render();
sync.init().finally(runFreezes);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
