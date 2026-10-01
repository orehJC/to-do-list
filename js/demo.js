import { blank, uid, COLORS } from './store.js';
import * as D from './dates.js';

// правдоподобные данные за последние 45 дней — чтобы посмотреть, как всё выглядит
export function seedDemo() {
  const s = blank(), t = D.today(), start = D.addDays(t, -45);
  const defs = [
    { name: 'подъём в 7:00', time: 'morning', p: .8 },
    { name: 'зарядка', time: 'morning', p: .75, goal: 0 },
    { name: 'вода', kind: 'count', amount: 8, unit: 'стаканов', p: .7 },
    { name: 'английский', kind: 'timer', amount: 20, time: 'evening', p: .65, goal: 1 },
    { name: 'без соцсетей до обеда', kind: 'quit', p: .85 },
    { name: 'тренировка', days: [0, 2, 4], time: 'evening', p: .7, goal: 0 },
    { name: 'уборка в комнате', rhythm: 'weekly', target: 1, p: .2 },
    { name: 'подвести итоги месяца', rhythm: 'monthly', target: 1, p: .05 },
  ];
  s.habits = defs.map((d, i) => ({
    id: uid(), name: d.name, kind: d.kind || 'check', amount: d.amount || 1, unit: d.unit || '',
    rhythm: d.rhythm || 'daily', target: d.target || 1, days: d.days || [], time: d.time || 'any',
    color: COLORS[i % COLORS.length], created: start, goalId: '',
  }));
  s.habits.forEach((h, i) => {
    const c = (s.checks[h.id] = {}), d = defs[i];
    for (const k of D.range(start, D.addDays(t, -1))) {
      if (d.days && !d.days.includes(D.weekday(k))) continue;
      const hit = Math.random() < d.p;
      if (h.kind === 'quit') { if (!hit) c[k] = 'X'; }
      else if (h.kind === 'count' || h.kind === 'timer') { const v = hit ? h.amount : Math.floor(Math.random() * h.amount); if (v) c[k] = v; }
      else if (hit) c[k] = 1;
    }
  });
  s.notes[s.habits[5].id] = { [D.addDays(t, -3)]: 'пропустил — болела голова' };
  s.freeze.processedTo = D.addDays(t, -1);

  const pool = ['сделать домашку', 'позвонить бабушке', 'разобрать рабочий стол', 'пройти урок по python', 'сходить в магазин', 'доделать проект', 'посмотреть лекцию по ML', 'помыть машину'];
  for (const k of D.range(D.weekStart(t), t)) {
    const n = 2 + Math.floor(Math.random() * 3);
    s.tasks[k] = Array.from({ length: n }, () => ({ id: uid(), text: pool[Math.floor(Math.random() * pool.length)], done: k < t ? Math.random() < .8 : false }));
    const r = () => 3 + Math.floor(Math.random() * 7);
    s.mindset[k] = { energy: r(), focus: r(), motivation: r() };
  }

  s.goals = [
    { id: uid(), title: 'подтянуться 15 раз', area: 'health', deadline: D.addDays(t, 90), why: '', pinned: true, done: false, progress: 0, created: start,
      milestones: [{ id: uid(), text: '5 раз', done: true }, { id: uid(), text: '10 раз', done: true }, { id: uid(), text: '15 раз', done: false }] },
    { id: uid(), title: 'пройти курс по машинному обучению', area: 'career', deadline: D.addDays(t, 120), why: 'хочу стать ML-инженером', pinned: true, done: false, progress: 35, created: start, milestones: [] },
    { id: uid(), title: 'накопить на новые наушники', area: 'money', deadline: D.addDays(t, 60), why: '', pinned: false, done: true, progress: 100, created: start, milestones: [] },
  ];
  defs.forEach((d, i) => { if (d.goal != null) s.habits[i].goalId = s.goals[d.goal].id; });
  s.taskRoll.processedTo = D.addDays(t, -1);
  return s;
}
