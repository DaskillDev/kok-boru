import { settings, setSetting, getSetting, onSettings, COAT_SHOP, levelOf } from './settings.js';
import { CREDITS, GAME_AUTHOR, GAME_YEAR } from '../data/credits.js';
import { t, setLang, applyI18n, LANGS } from './i18n.js';
import { ENCYCLOPEDIA } from './i18n_extra.js';
import { COUNTRIES, flagCanvas, countryName } from '../data/countries.js';
import { BREEDS } from '../data/horses.js';

// Меню игры: главное, быстрый матч, онлайн (заглушка), настройки, пауза, результат, справка.
// Вся разметка строится здесь; оформление — в style.css.

const QUICK_ROWS = [
  { key: 'quick.opponent', label: 'opponent', icon: '⚑', options: 'countries' },
  { key: 'quick.time', label: 'time', icon: '◷', options: [[180, 'per1'], [360, 'per2'], [900, 'per5'], [2700, 'per15']] },
  { key: 'quick.draw', label: 'onDraw', icon: '=', options: [['golden', 'drawGolden'], ['draw', 'drawDraw']] },
  {
    key: 'quick.size',
    label: 'size',
    icon: '♞',
    options: [[1, 'size1'], [2, 'size2'], [3, 'size3'], [4, 'size4'], [5, 'size5'], [6, 'size6'], [8, 'size8'], [10, 'size10']],
  },
  {
    key: 'quick.difficulty',
    label: 'difficulty',
    icon: '⚙',
    options: [['easy', 'easy'], ['medium', 'medium'], ['hard', 'hard'], ['expert', 'expert']],
  },
  {
    key: 'quick.weather',
    label: 'weather',
    icon: '☼',
    options: [['random', 'random'], ['clear', 'clear'], ['overcast', 'overcast'], ['evening', 'evening'], ['fog', 'fog']],
  },
  { key: 'quick.map', label: 'map', icon: '▦', options: [['random', 'random'], ['sand', 'sand'], ['jailoo', 'jailoo'], ['autumn', 'autumn']] },
  { key: 'quick.math', label: 'mathDuels', icon: '∑', options: [[true, 'mathOn'], [false, 'mathOff']] },
  { key: 'quick.mathLevel', label: 'mathLevel', icon: '±', options: [['easy', 'mathEasy'], ['medium', 'mathMedium'], ['hard', 'mathHard']] },
  { key: 'quick.mathTime', label: 'mathTime', icon: '⧗', options: [[5, 'sec5'], [7, 'sec7'], [10, 'sec10']] },
];

const HATS = ['kalpak', 'tebetey', 'helmet'];
const statBar = (key, v) =>
  `<div class="stat"><span data-i18n="st_${key}"></span><i><b style="width:${v}%"></b></i><em>${v}</em></div>`;

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
    { type: 'range', key: 'music', label: 'musicMenu' },
    { type: 'range', key: 'musicMatch', label: 'musicMatch' },
    { type: 'note', label: 'musicCredit' },
    { type: 'range', key: 'sfx', label: 'sfx' },
    { type: 'toggle', key: 'vibration', label: 'vibration' },
  ],
  screen: [
    { type: 'seg', key: 'quality', label: 'quality', options: [['auto', 'auto'], ['low', 'low'], ['medium', 'medium'], ['high', 'high']] },
    {
      type: 'seg',
      key: 'camera',
      label: 'camera',
      options: [['chase', 'camChase'], ['tv', 'camTv'], ['top', 'camTop'], ['first', 'camFirst'], ['free', 'camFree']],
    },
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
          ${
            r.options === 'countries'
              ? COUNTRIES.map((c) => `<option value="${c.code}" data-country="${c.code}"></option>`).join('')
              : r.options.map(([v, k]) => `<option value="${v}" data-i18n="${k}"></option>`).join('')
          }
        </select>
      </label>`;

    this.el.innerHTML = `
      <section class="screen" data-screen="main">
        <header class="topbar">
          <button class="chip profile" data-go="settings:account">
            <i>☺</i><span><b id="profile-name"></b><small data-i18n="guestHint"></small></span>
          </button>
          <span class="spacer"></span>
          <div class="lang">${LANGS.map((l) => `<button data-lang="${l}">${l.toUpperCase()}</button>`).join('')}</div>
          <button class="icon-btn" data-go="credits" aria-label="credits"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.2"/><path d="M12 11v6"/><circle cx="12" cy="7.6" r=".6" fill="currentColor"/></svg></button>
          <button class="icon-btn" id="menu-full" aria-label="fullscreen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg></button>
          <button class="icon-btn" data-go="settings" aria-label="settings"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1"/></svg></button>
        </header>
        <div class="hero">
          <h1 data-i18n="title"></h1>
          <div class="ornament"></div>
          <p data-i18n="tagline"></p>
          <small class="build">v ${__BUILD__}</small>
        </div>
        <div class="tiles">
          <button class="tile tile-quick" data-go="rider" id="tile-quick" disabled>
            <i>♞</i><b data-i18n="quick"></b><small id="quick-sub" data-i18n="loading"></small><span class="arrow">›</span>
          </button>
          <button class="tile tile-stable" data-go="stable">
            <i>✦</i><b data-i18n="stable"></b><small data-i18n="stableSub"></small><span class="arrow">›</span>
          </button>
          <button class="tile tile-enc" data-go="enc">
            <i>❖</i><b data-i18n="encyclopedia"></b><small data-i18n="encSub"></small><span class="arrow">›</span>
          </button>
          <button class="tile tile-online" data-go="online">
            <i>◍</i><b data-i18n="online"></b><small data-i18n="onlineSub"></small><span class="arrow">›</span>
          </button>
        </div>
      </section>

      <section class="screen panel wide" data-screen="rider">
        <header><button class="back" data-go="main">‹</button><h2 data-i18n="riderTitle"></h2></header>
        <div class="panel-body">
          <div class="cards" id="countries"></div>
          <div class="rider-opts">
            <label class="row"><span class="row-label"><i>✎</i><span data-i18n="nickname"></span></span>
              <input id="rider-name" type="text" maxlength="16" data-i18n-ph="nicknamePh"></label>
            <div class="field"><h4 data-i18n="hat"></h4><div class="seg">${HATS.map(
              (h) => `<button data-seg="rider.hat" data-value="${h}" data-i18n="hat_${h}"></button>`,
            ).join('')}</div></div>
          </div>
        </div>
        <button class="primary" data-go="horse" data-i18n="next"></button>
      </section>

      <section class="screen panel wide" data-screen="horse">
        <header><button class="back" data-go="rider">‹</button><h2 data-i18n="horseTitle"></h2></header>
        <div class="panel-body"><div class="cards" id="breeds"></div></div>
        <button class="primary" data-go="quick" data-i18n="next"></button>
      </section>

      <section class="screen panel" data-screen="quick">
        <header><button class="back" data-go="horse">‹</button><h2 data-i18n="matchSettings"></h2></header>
        <div class="panel-body">${QUICK_ROWS.map(row).join('')}<p class="note" data-i18n="mathNote"></p></div>
        <button class="primary" id="play-btn" data-i18n="play"></button>
      </section>

      <section class="screen panel wide" data-screen="enc">
        <header><button class="back" data-go="main">‹</button><h2 data-i18n="encyclopedia"></h2></header>
        <div class="enc">
          <nav id="enc-nav"></nav>
          <article id="enc-article"></article>
        </div>
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
            <th data-i18n="stPasses"></th><th data-i18n="stSteals"></th><th data-i18n="stDuels"></th>
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

      <section class="screen panel wide" data-screen="credits">
        <header><button class="back" data-go="main">‹</button><h2 data-i18n="credits"></h2></header>
        <div class="panel-body credits">
          <div class="credit-author"><small data-i18n="creditsGame"></small><b>${GAME_AUTHOR}</b><span>© ${GAME_YEAR} ${GAME_AUTHOR}</span></div>
          ${['models', 'music', 'textures', 'sounds', 'libs']
            .map(
              (k) => `<h3 data-i18n="credits_${k}"></h3><ul>${CREDITS[k]
                .map(
                  ([title, author, lic, url]) =>
                    `<li><b>${url ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>` : title}</b> — ${author} <em>${lic}</em></li>`,
                )
                .join('')}</ul>${k === 'models' ? '<p class="note" data-i18n="creditsChanges"></p>' : ''}`,
            )
            .join('')}
          <p class="note" data-i18n="creditsProc"></p>
        </div>
      </section>

      <section class="screen panel" data-screen="help">
        <header><button class="back" id="help-back">‹</button><h2 data-i18n="help"></h2></header>
        <div class="panel-body"><ul class="help">${HELP_KEYS.map((k) => `<li data-i18n="${k}"></li>`).join('')}</ul></div>
      </section>`;

    // Сразу после смены экрана нажатия не принимаем: на телефоне то же касание иначе «проваливается»
    // на кнопку, которая появилась под пальцем (экран выбора страны проскакивался, «назад» открывал настройки).
    // Перехват на фазе захвата — срабатывает раньше обработчиков самих кнопок («Играть», «Продолжить»…).
    this.el.addEventListener(
      'click',
      (e) => {
        if (performance.now() - (this._shownAt || 0) < 380) {
          e.stopPropagation();
          e.preventDefault();
        }
      },
      true,
    );
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
        if (seg.dataset.seg.startsWith('rider.')) setSetting('rider', { ...settings.rider, [seg.dataset.seg.slice(6)]: v });
        else setSetting(seg.dataset.seg, isNaN(v) ? v : Number(v));
        return;
      }
      const country = e.target.closest('[data-pick-country]');
      if (country) {
        setSetting('rider', { ...settings.rider, country: country.dataset.pickCountry });
        return;
      }
      const breed = e.target.closest('[data-pick-breed]');
      if (breed) {
        setSetting('rider', { ...settings.rider, breed: breed.dataset.pickBreed });
        return;
      }
      const ency = e.target.closest('[data-enc]');
      if (ency) {
        this.encItem = ency.dataset.enc;
        this._renderEnc();
        return;
      }
      const v3d = e.target.closest('[data-view3d]');
      if (v3d) {
        this.h.onView3D?.(v3d.dataset.view3d);
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
      if (sel) {
        const v = sel.value === 'true' ? true : sel.value === 'false' ? false : isNaN(sel.value) ? sel.value : Number(sel.value);
        setSetting(sel.dataset.key, v);
      }
    });
    this.el.addEventListener('input', (e) => {
      const r = e.target.closest('input[data-range]');
      if (r) setSetting(r.dataset.range, Number(r.value));
      const n = e.target.closest('#nickname, #rider-name');
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

    this.encItem = ENCYCLOPEDIA[0].items[0].id;
    this._renderSettings();
    this._sync();
  }

  _renderEnc() {
    const L = settings.lang;
    const loc = (o) => o[L] ?? o.ru;
    this.el.querySelector('#enc-nav').innerHTML = ENCYCLOPEDIA.map(
      (g) =>
        `<h5>${loc(g.group)}</h5>` +
        g.items.map((i) => `<button data-enc="${i.id}" class="${i.id === this.encItem ? 'active' : ''}">${loc(i.title)}</button>`).join(''),
    ).join('');
    const item = ENCYCLOPEDIA.flatMap((g) => g.items).find((i) => i.id === this.encItem);
    this.el.querySelector('#enc-article').innerHTML = `<h3>${loc(item.title)}</h3><p>${loc(item.text)}</p>
      <button class="secondary" data-view3d="${item.view}" data-i18n="show3d">${t('show3d')}</button>`;
    applyI18n(this.el.querySelector('.enc'));
  }

  _renderCards() {
    const L = settings.lang;
    const r = settings.rider;
    this.el.querySelector('#countries').innerHTML = COUNTRIES.map(
      (c) => `<button class="card${c.code === r.country ? ' active' : ''}" data-pick-country="${c.code}">
        <header><canvas class="flag" data-flag="${c.code}" width="48" height="32"></canvas><b>${c.code}</b><span>${countryName(c, L)}</span></header>
        ${statBar('power', c.stats.power)}${statBar('accuracy', c.stats.accuracy)}${statBar('grip', c.stats.grip)}
      </button>`,
    ).join('');
    this.el.querySelector('#breeds').innerHTML = BREEDS.map(
      (b) => `<button class="card${b.id === r.breed ? ' active' : ''}" data-pick-breed="${b.id}">
        <header><b>${b.name[L] ?? b.name.ru}</b></header>
        ${['speed', 'accel', 'turn', 'stamina', 'weight'].map((k) => statBar(k, b.stats[k])).join('')}
        <small>${b.note[L] ?? b.note.ru}</small>
      </button>`,
    ).join('');
    for (const cv of this.el.querySelectorAll('canvas[data-flag]'))
      cv.getContext('2d').drawImage(flagCanvas(cv.dataset.flag), 0, 0, cv.width, cv.height);
    applyI18n(this.el.querySelector('#countries'));
    applyI18n(this.el.querySelector('#breeds'));
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
        if (c.type === 'note') return `<p class="note" data-i18n="${c.label}"></p>`;
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
    for (const o of this.el.querySelectorAll('option[data-country]'))
      o.textContent = `${o.dataset.country} · ${countryName(COUNTRIES.find((c) => c.code === o.dataset.country), settings.lang)}`;
    for (const sel of this.el.querySelectorAll('select[data-key]')) sel.value = String(getSetting(sel.dataset.key));
    for (const b of this.el.querySelectorAll('[data-seg]'))
      b.classList.toggle('active', String(getSetting(b.dataset.seg)) === b.dataset.value);
    const rn = this.el.querySelector('#rider-name');
    if (document.activeElement !== rn) rn.value = settings.nickname;
    if (this.screen === 'rider' || this.screen === 'horse') this._renderCards();
    if (this.screen === 'enc') this._renderEnc();
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
    this.el.querySelector('#stats-row').innerHTML = [st.matches, st.wins, st.draws, st.goals, st.passes, st.steals, st.duelsWon]
      .map((v) => `<td>${v ?? 0}</td>`)
      .join('');
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
    if (screen !== this.screen) this._shownAt = performance.now();
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
