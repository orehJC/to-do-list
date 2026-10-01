import { getState, update, replaceState, blank, MAX_TOKENS } from '../store.js';
import * as D from '../dates.js';
import * as sync from '../sync.js';
import { esc, toast, confirmClick } from '../ui.js';
import { seedDemo } from '../demo.js';

export const title = 'Настройки';

const STATUS = {
  off: 'не настроена — данные только на этом устройстве',
  'signed-out': 'supabase подключён, нужно войти',
  syncing: 'синхронизация…',
  ok: 'всё синхронизировано ✓',
  offline: 'нет сети — синхронизирую, когда появится',
  error: 'ошибка',
};

export function render(root) {
  const s = getState(), st = sync.getStatus(), cfg = sync.getConfig();

  root.innerHTML = `
    <div class="settings">
      <section class="panel">
        <h2>синхронизация</h2>
        <p class="status-line"><i class="sync-dot ${st.status}"></i> ${STATUS[st.status] || st.status}${st.msg ? `: <span class="red">${esc(st.msg)}</span>` : ''}</p>
        ${st.user ? `
          <p class="muted">аккаунт: <b>${esc(st.user.email)}</b></p>
          <div class="row gap wrap"><button class="btn primary" data-act="syncnow">синхронизировать сейчас</button>
          <button class="btn ghost" data-act="logout">выйти</button></div>` : ''}
        ${!st.user && cfg.url && cfg.key ? `
          <form class="stack" data-form="login">
            <label class="field"><span>email</span><input type="email" name="email" required autocomplete="username"></label>
            <label class="field"><span>пароль</span><input type="password" name="password" required autocomplete="current-password"></label>
            <button class="btn primary">войти</button>
            <p class="muted sm">при первом входе на устройстве данные берутся из облака (локальные заменяются).</p>
          </form>` : ''}
        ${cfg.fromFile ? '<p class="muted sm">адрес и ключ supabase заданы в config.js</p>' : `
          <details ${cfg.url ? '' : 'open'}><summary>подключение supabase</summary>
            <form class="stack" data-form="cfg">
              <label class="field"><span>project url</span><input name="url" value="${esc(cfg.url)}" placeholder="https://xxxx.supabase.co" autocomplete="off"></label>
              <label class="field"><span>anon public key</span><input name="key" value="${esc(cfg.key)}" placeholder="eyJ…" autocomplete="off"></label>
              <button class="btn ghost">сохранить</button>
              <p class="muted sm">как настроить — в README.md, раздел «синхронизация».</p>
            </form>
          </details>`}
      </section>

      <section class="panel">
        <h2>заморозки стрика 🧊</h2>
        <p class="muted">заморозка спасает стрик, если пропустил день. +1 токен за каждые 7 дней подряд (максимум ${MAX_TOKENS}).</p>
        <div class="row gap wrap">
          <button class="icon-btn round" data-act="tok" data-d="-1">−</button>
          <b class="big">${s.freeze.tokens}</b>
          <button class="icon-btn round" data-act="tok" data-d="1">+</button>
        </div>
        <label class="check-row"><input type="checkbox" data-act="auto" ${s.freeze.auto ? 'checked' : ''}> тратить автоматически на пропущенные дни</label>
      </section>

      <section class="panel">
        <h2>данные</h2>
        <div class="row gap wrap">
          <button class="btn ghost" data-act="export">скачать бэкап (.json)</button>
          <label class="btn ghost">загрузить бэкап<input type="file" accept="application/json,.json" hidden data-act="import"></label>
        </div>
        <div class="row gap wrap">
          <button class="btn ghost" data-act="demo" data-label="заполнить демо-данными">заполнить демо-данными</button>
          <button class="btn danger" data-act="reset" data-label="стереть всё">стереть всё</button>
        </div>
        <p class="muted sm">демо-данные и «стереть всё» заменяют текущие данные (и в облаке тоже, если синхра включена).</p>
      </section>

      <section class="panel">
        <h2>установить как приложение</h2>
        <p class="muted"><b>android / chrome:</b> меню ⋮ → «добавить на главный экран».<br>
        <b>iphone / safari:</b> кнопка «поделиться» → «на экран домой».<br>
        <b>компьютер:</b> значок установки справа в адресной строке.</p>
      </section>
    </div>`;

  root.onclick = async e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'tok') update(s => { s.freeze.tokens = Math.max(0, Math.min(MAX_TOKENS, s.freeze.tokens + Number(b.dataset.d))); });
    else if (a === 'auto') update(s => { s.freeze.auto = b.checked; });
    else if (a === 'syncnow') sync.pull();
    else if (a === 'logout') sync.signOut();
    else if (a === 'export') {
      const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `progress-backup-${D.today()}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }
    else if (a === 'demo' && confirmClick(b, 'заменить текущие данные?')) { replaceState(seedDemo()); toast('демо-данные загружены'); }
    else if (a === 'reset' && confirmClick(b, 'точно стереть всё?')) { replaceState(blank()); toast('всё стёрто'); }
  };
  root.onchange = async e => {
    if (e.target.dataset.act !== 'import' || !e.target.files[0]) return;
    try {
      const data = JSON.parse(await e.target.files[0].text());
      if (!Array.isArray(data.habits)) throw new Error('это не бэкап этого приложения');
      replaceState(data);
      toast('бэкап загружен');
    } catch (err) { toast('не вышло: ' + err.message); }
  };
  root.onsubmit = async e => {
    e.preventDefault();
    const f = e.target, kind = f.dataset.form;
    try {
      if (kind === 'cfg') { await sync.saveConfig(f.url.value, f.key.value); toast('сохранено'); }
      if (kind === 'login') { await sync.signIn(f.email.value.trim(), f.password.value); toast('вошёл ✓'); }
    } catch (err) { toast('ошибка: ' + err.message); }
    render(root);
  };
}
