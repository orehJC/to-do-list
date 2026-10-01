import { blank, uid, COLORS } from './store.js';
import * as D from './dates.js';

// правдоподобные данные за последние 45 дней — чтобы посмотреть, как всё выглядит
export function seedDemo() {
  const s = blank(), t = D.today(), start = D.addDays(t, -45);
  const defs = [
    ['Подъём в 7:00', 'daily', 1, .8],
    ['Зарядка', 'daily', 1, .75],
    ['Читать 10 страниц', 'daily', 1, .7],
    ['Английский 20 минут', 'daily', 1, .65],
    ['Без телефона до завтрака', 'daily', 1, .6],
    ['Тренировка', 'weekly', 3, .45],
    ['Уборка в комнате', 'weekly', 1, .2],
    ['Подвести итоги месяца', 'monthly', 1, .05],
  ];
  s.habits = defs.map(([name, rhythm, target], i) => ({ id: uid(), name, rhythm, target, color: COLORS[i % COLORS.length], created: start }));
  s.habits.forEach((h, i) => {
    const c = (s.checks[h.id] = {});
    for (const k of D.range(start, D.addDays(t, -1))) if (Math.random() < defs[i][3]) c[k] = 1;
  });
  s.freeze.processedTo = D.addDays(t, -1);

  const pool = ['Сделать домашку', 'Позвонить бабушке', 'Разобрать рабочий стол', 'Пройти урок по python', 'Сходить в магазин', 'Доделать проект', 'Посмотреть лекцию по ML', 'Помыть машину'];
  for (const k of D.range(D.weekStart(t), t)) {
    const n = 2 + Math.floor(Math.random() * 3);
    s.tasks[k] = Array.from({ length: n }, () => ({ id: uid(), text: pool[Math.floor(Math.random() * pool.length)], done: k < t ? Math.random() < .8 : false }));
    const r = () => 3 + Math.floor(Math.random() * 7);
    s.mindset[k] = { energy: r(), focus: r(), motivation: r() };
  }

  s.goals = [
    { id: uid(), title: 'Подтянуться 15 раз', area: 'health', deadline: D.addDays(t, 90), why: '', pinned: true, done: false, progress: 0, created: start,
      milestones: [{ id: uid(), text: '5 раз', done: true }, { id: uid(), text: '10 раз', done: true }, { id: uid(), text: '15 раз', done: false }] },
    { id: uid(), title: 'Пройти курс по машинному обучению', area: 'career', deadline: D.addDays(t, 120), why: 'хочу стать ML-инженером', pinned: true, done: false, progress: 35, created: start, milestones: [] },
    { id: uid(), title: 'Накопить на новые наушники', area: 'money', deadline: D.addDays(t, 60), why: '', pinned: false, done: true, progress: 100, created: start, milestones: [] },
  ];
  return s;
}
