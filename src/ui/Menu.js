import { settings, setSetting, getSetting, onSettings, COAT_SHOP, levelOf } from './settings.js';
import { t, setLang, applyI18n } from './i18n.js';

// Меню игры: главное, быстрый матч, онлайн (заглушка), настройки, пауза, результат, справка.
// Вся разметка строится здесь; оформление — в style.css.

const QUICK_ROWS = [
  { key: 'quick.time', label: 'time', icon: '◷', options: [[180, 'per1'], [360, 'per2'], [900, 'per5'], [2700, 'per15']] },
  { key: 'quick.difficulty', label: 'difficulty', icon: '⚙', options: [['easy', 'easy'], ['medium', 'medium'], ['hard', 'hard']] },
  { key: 'quick.size', label: 'size', icon: '⚑', options: [[1, 'size1'], [2, 'size2'], [3, 'size3'], [4, 'size4']] },
  {
    key: 'quick.weather',
    label: 'weather',
    icon: '☼',
    options: [['random', 'random'], ['clear', 'clear'], ['overcast', 'overcast'], ['evening', 'evening'], ['fog', 'fog']],
  },
  { key: 'quick.map', label: 'map', icon: '▦', options: [['random', 'random'], ['jailoo', 'jailoo'], ['autumn', 'autumn']] },
];

const SETTINGS_TABS = {
  controls: [
    { type: 'seg', key: 'move', label: 'move', options: [['joystick', 'joystick'], ['fixed', 'fixed'], ['touch', 'touch']] },
    { type: 'seg', key: 'btnSize', label: 'btnSize', options: [['s', 'small'], ['m', 'mid'], ['l', 'large']] },
    { type: 'toggle', key: 'leftHanded', label: 'leftHanded' },
    { type: 'toggle', key: 'autoSwitch', label: 'autoSwitch' },
    { type: 'help' },
  ],
  sound: [
    { type: 'range', key: 'volume', label: 'volume' },
    { type: 'range', key: 'music', label: 'music' },
    { type: 'range', key: 'sfx', label: 'sfx' },
    { type: 'toggle', key: 'vibration', label: 'vibration' },
  ],
  screen: [
    { type: 'seg', key: 'quality', label: 'quality', options: [['auto', 'auto'], ['low', 'low'], ['medium', 'medium'], ['high', 'high']] },
    { type: 'seg', key: 'camera', label: 'camera', options: [['chase', 'camChase'], ['tv', 'camTv'], ['top', 'camTop'], ['first', 'camFirst']] },
    { type: 'seg', key: 'names', label: 'names', options: [['all', 'namesAll'], ['humans', 'namesHumans'], ['none', 'namesNone']] },
  ],
  account: [{ type: 'account' }],
};

const HELP_KEYS = ['helpMove', 'helpSprint', 'helpAction', 'helpPass', 'helpFeint', 'helpSwitch', 'helpCam'];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class Menu {
  // handlers: { onPlay(cfg), onResume(), onRestart(), onExit(), onInteract() }
  constructor(handlers) {
    this.h = handlers;
    this.el = document.getElementById('menu');
    this.inMatch = false; // настройки открыты из паузы
    this.tab = 'controls';
    this.ready = false;
    this._build();
    this.show('main');
    onSettings(() => this._sync());
  }

  _build() {
    const row = (r) => `
      <label class="row">
        <span class="row-label"><i>${r.icon}</i><span data-i18n="${r.label}"></span></span>
        <select data-key="${r.key}">
          ${r.options.map(([v, k]) => `<option value="${v}" data-i18n="${k}"></option>`).join('')}
        </select>
      </label>`;

    this.el.innerHTML = `
      <section class="screen" data-screen="main">
        <header class="topbar">
          <button class="chip profile" data-go="settings:account">
            <i>☺</i><span><b id="profile-name"></b><small data-i18n="guestHint"></small></span>
          </button>
          <span class="spacer"></span>
          <div class="lang"><button data-lang="ru">RU</button><button data-lang="kg">KG</button></div>
          <button class="icon-btn" data-go="settings" aria-label="settings">⚙</button>
        </header>
        <div class="hero">
          <h1 data-i18n="title"></h1>
          <div class="ornament"></div>
          <p data-i18n="tagline"></p>
        </div>
        <div class="tiles">
          <button class="tile tile-quick" data-go="quick" id="tile-quick" disabled>
            <i>♞</i><b data-i18n="quick"></b><small id="quick-sub" data-i18n="loading"></small><span class="arrow">›</span>
          </button>
          <button class="tile tile-stable" data-go="stable">
            <i>✦</i><b data-i18n="stable"></b><small data-i18n="stableSub"></small><span class="arrow">›</span>
          </button>
          <button class="tile tile-online" data-go="online">
            <i>◍</i><b data-i18n="online"></b><small data-i18n="onlineSub"></small><span class="arrow">›</span>
          </button>
        </div>
      </section>

      <section class="screen panel" data-screen="quick">
        <header><button class="back" data-go="main">‹</button><h2 data-i18n="quick"></h2></header>
        <div class="panel-body">${QUICK_ROWS.map(row).join('')}</div>
        <button class="primary" id="play-btn" data-i18n="play"></button>
      </section>

      <section class="screen panel" data-screen="stable">
        <header><button class="back" data-go="main">‹</button><h2 data-i18n="stable"></h2><span class="spacer"></span><b class="wallet" id="wallet"></b></header>
        <div class="panel-body">
          <div class="coats" id="coats"></div>
          <p class="note" data-i18n="stableNote"></p>
        </div>
      </section>

      <section class="screen panel" data-screen="online">
        <header><button class="back" data-go="main">‹</button><h2 data-i18n="online"></h2></header>
        <div class="panel-body">
          <p class="note" data-i18n="onlineNote"></p>
          <h3 data-i18n="myStats"></h3>
          <table class="stats"><thead><tr>
            <th data-i18n="stMatches"></th><th data-i18n="stWins"></th><th data-i18n="stDraws"></th><th data-i18n="stGoals"></th>
          </tr></thead><tbody><tr id="stats-row"></tr></tbody></table>
        </div>
        <button class="primary" data-go="quick" data-i18n="quick"></button>
      </section>

      <section class="screen panel wide" data-screen="settings">
        <header><button class="back" id="settings-back">‹</button><h2 data-i18n="settings"></h2></header>
        <div class="settings">
          <nav>
            ${Object.keys(SETTINGS_TABS)
              .map((k) => `<button data-tab="${k}" data-i18n="tab${k[0].toUpperCase()}${k.slice(1)}"></button>`)
              .join('')}
          </nav>
          <div class="settings-body" id="settings-body"></div>
        </div>
      </section>

      <section class="screen panel" data-screen="pause">
        <header><h2 data-i18n="pause"></h2></header>
        <div class="panel-body stack">
          <button class="primary" id="resume-btn" data-i18n="resume"></button>
          <button class="secondary" id="restart-btn" data-i18n="restart"></button>
          <button class="secondary" data-go="settings" data-i18n="settings"></button>
          <button class="secondary" id="exit-btn" data-i18n="toMenu"></button>
        </div>
      </section>

      <section class="screen panel" data-screen="result">
        <header><h2 id="result-title"></h2></header>
        <div class="panel-body stack">
          <div class="result-score" id="result-score"></div>
          <div class="result-reward" id="result-reward"></div>
          <button class="primary" id="again-btn" data-i18n="again"></button>
          <button class="secondary" id="result-exit-btn" data-i18n="toMenu"></button>
        </div>
      </section>

      <section class="screen panel" data-screen="help">
        <header><button class="back" id="help-back">‹</button><h2 data-i18n="help"></h2></header>
        <div class="panel-body"><ul class="help">${HELP_KEYS.map((k) => `<li data-i18n="${k}"></li>`).join('')}</ul></div>
      </section>`;

    this.el.addEventListener('click', (e) => {
      this.h.onInteract?.();
      const go = e.target.closest('[data-go]');
      if (go) {
        const [screen, tab] = go.dataset.go.split(':');
        if (tab) this.tab = tab;
        this.show(screen);
        return;
      }
      const lang = e.target.closest('[data-lang]');
      if (lang) {
        setLang(lang.dataset.lang);
        this._sync();
        return;
      }
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        this.tab = tab.dataset.tab;
        this._renderSettings();
        return;
      }
      const seg = e.target.closest('[data-seg]');
      if (seg) {
        const v = seg.dataset.value;
        setSetting(seg.dataset.seg, isNaN(v) ? v : Number(v));
        return;
      }
      const coat = e.target.closest('[data-coat]');
      if (coat) {
        const item = COAT_SHOP.find((c) => c.id === coat.dataset.coat);
        const p = settings.profile;
        if (p.owned.includes(item.id)) setSetting('profile', { ...p, coat: item.id });
        else if (p.coins >= item.price)
          setSetting('profile', { ...p, coins: p.coins - item.price, owned: [...p.owned, item.id], coat: item.id });
        return;
      }
      const tog = e.target.closest('[data-toggle]');
      if (tog) setSetting(tog.dataset.toggle, !getSetting(tog.dataset.toggle));
    });
    this.el.addEventListener('change', (e) => {
      const sel = e.target.closest('select[data-key]');
      if (sel) setSetting(sel.dataset.key, isNaN(sel.value) ? sel.value : Number(sel.value));
    });
    this.el.addEventListener('input', (e) => {
      const r = e.target.closest('input[data-range]');
      if (r) setSetting(r.dataset.range, Number(r.value));
      const n = e.target.closest('#nickname');
      if (n) setSetting('nickname', n.value.trim().slice(0, 16));
    });

    const $ = (id) => this.el.querySelector(`#${id}`);
    $('play-btn').addEventListener('click', () => this.h.onPlay?.({ ...settings.quick }));
    $('resume-btn').addEventListener('click', () => this.h.onResume?.());
    $('restart-btn').addEventListener('click', () => this.h.onRestart?.());
    $('exit-btn').addEventListener('click', () => this.h.onExit?.());
    $('again-btn').addEventListener('click', () => this.h.onRestart?.());
    $('result-exit-btn').addEventListener('click', () => this.h.onExit?.());
    $('settings-back').addEventListener('click', () => this.show(this.inMatch ? 'pause' : 'main'));
    $('help-back').addEventListener('click', () => this.h.onResume?.());

    this._renderSettings();
    this._sync();
  }

  _renderSettings() {
    const body = this.el.querySelector('#settings-body');
    for (const b of this.el.querySelectorAll('[data-tab]')) b.classList.toggle('active', b.dataset.tab === this.tab);
    body.innerHTML = SETTINGS_TABS[this.tab]
      .map((c) => {
        if (c.type === 'seg')
          return `<div class="field"><h4 data-i18n="${c.label}"></h4><div class="seg">${c.options
            .map(([v, k]) => `<button data-seg="${c.key}" data-value="${v}" data-i18n="${k}"></button>`)
            .join('')}</div></div>`;
        if (c.type === 'toggle')
          return `<div class="field inline"><h4 data-i18n="${c.label}"></h4><button class="toggle" data-toggle="${c.key}"><i></i></button></div>`;
        if (c.type === 'range')
          return `<div class="field inline"><h4 data-i18n="${c.label}"></h4><input type="range" min="0" max="1" step="0.05" data-range="${c.key}"></div>`;
        if (c.type === 'help')
          return `<div class="field"><h4 data-i18n="help"></h4><ul class="help">${HELP_KEYS.map((k) => `<li data-i18n="${k}"></li>`).join('')}</ul></div>`;
        return `<div class="field account">
            <div class="avatar">☺</div>
            <div><h4 data-i18n="nickname"></h4>
            <input id="nickname" type="text" maxlength="16" data-i18n-ph="nicknamePh" value="${esc(settings.nickname)}"></div>
          </div>
          <p class="note" data-i18n="accountNote"></p>`;
      })
      .join('');
    this._sync();
  }

  // Приводит все элементы управления в соответствие с настройками
  _sync() {
    applyI18n(this.el);
    for (const sel of this.el.querySelectorAll('select[data-key]')) sel.value = String(getSetting(sel.dataset.key));
    for (const b of this.el.querySelectorAll('[data-seg]'))
      b.classList.toggle('active', String(getSetting(b.dataset.seg)) === b.dataset.value);
    for (const b of this.el.querySelectorAll('[data-toggle]')) b.classList.toggle('on', !!getSetting(b.dataset.toggle));
    for (const r of this.el.querySelectorAll('input[data-range]')) r.value = getSetting(r.dataset.range);
    for (const b of this.el.querySelectorAll('[data-lang]')) b.classList.toggle('active', b.dataset.lang === settings.lang);
    const pr = settings.profile;
    this.el.querySelector('#profile-name').textContent =
      `${settings.nickname || t('guest')} · ${t('level')} ${levelOf(pr.xp)} · ${pr.coins} ◉`;
    this.el.querySelector('#wallet').textContent = `${pr.coins} ◉`;
    this.el.querySelector('#coats').innerHTML = COAT_SHOP.map((c) => {
      const owned = pr.owned.includes(c.id);
      const sel = pr.coat === c.id;
      const label = sel ? t('selected') : owned ? t('choose') : `${t('buy')} · ${c.price} ◉`;
      const locked = !owned && pr.coins < c.price;
      return `<button class="coat${sel ? ' active' : ''}" data-coat="${c.id}" ${locked ? 'disabled' : ''}>
        <i style="background:${c.css}"></i><b>${t(`coat_${c.id}`)}</b><small>${label}</small></button>`;
    }).join('');
    const st = settings.stats;
    this.el.querySelector('#stats-row').innerHTML = `<td>${st.matches}</td><td>${st.wins}</td><td>${st.draws}</td><td>${st.goals}</td>`;
    const sub = this.el.querySelector('#quick-sub');
    sub.dataset.i18n = this.ready ? 'quickSub' : this.failed ? 'loadError' : 'loading';
    sub.textContent = t(sub.dataset.i18n);
  }

  setReady(ok = true) {
    this.ready = ok;
    this.failed = !ok;
    this.el.querySelector('#tile-quick').disabled = !ok;
    this._sync();
  }

  show(screen) {
    this.screen = screen;
    this.el.classList.remove('hidden');
    this.el.classList.toggle('dim', screen !== 'main');
    for (const s of this.el.querySelectorAll('.screen')) s.classList.toggle('active', s.dataset.screen === screen);
    if (screen === 'settings') this._renderSettings();
    this._sync();
  }

  hide() {
    this.screen = null;
    this.el.classList.add('hidden');
  }

  get visible() {
    return !this.el.classList.contains('hidden');
  }

  showResult(titleKey, scoreHtml, rewardText = '') {
    this.el.querySelector('#result-title').textContent = t(titleKey);
    this.el.querySelector('#result-score').innerHTML = scoreHtml;
    this.el.querySelector('#result-reward').textContent = rewardText;
    this.show('result');
  }
}
