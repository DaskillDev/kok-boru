import { settings } from '../ui/settings.js';
import { t } from '../ui/i18n.js';
import { toStage, stageRect } from '../ui/viewport.js';

// Сенсорное управление: джойстик (плавающий или фиксированный) либо езда к точке касания,
// плюс кнопки «Рывок», «Отбор/Бросок», «Пас», «Финт», «Смена». Пишет в input.virtual.

export class TouchControls {
  // toWorld(clientX, clientY) → { x, z } на плоскости поля или null
  constructor(input, toWorld) {
    this.input = input;
    this.toWorld = toWorld;
    this.root = document.getElementById('touch');
    this.zone = document.getElementById('stick-zone');
    this.stick = document.getElementById('stick');
    this.knob = this.stick.querySelector('i');
    this.actionBtn = document.getElementById('tb-action');
    this.stickId = null;
    this.targetId = null;
    this.center = { x: 0, y: 0 };
    this._label = '';

    // кнопки действий: какой палец какую кнопку держит
    this.buttons = [['tb-sprint', 'sprint'], ['tb-action', 'action'], ['tb-pass', 'pass'], ['tb-feint', 'feint'], ['tb-switch', 'switch']].map(
      ([id, key]) => ({ el: document.getElementById(id), key }),
    );
    this.held = new Map(); // pointerId → кнопка

    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    if ('ontouchstart' in window) {
      // Сенсорный экран: работаем с «сырыми» касаниями (touch-события) — они одинаково надёжны
      // во всех мобильных браузерах, включая встроенные (Telegram, WhatsApp) и старые Android.
      // Каждое событие заодно сверяем со списком пальцев, которые реально на экране: если отпускание
      // потерялось, «зависшая» кнопка или джойстик сами отпускаются, а не блокируют управление.
      const opt = { passive: false };
      const each = (e, fn) => {
        for (const t of e.changedTouches) fn({ pointerId: t.identifier, clientX: t.clientX, clientY: t.clientY, target: t.target });
      };
      this.root.addEventListener(
        'touchstart',
        (e) => {
          if (e.cancelable) e.preventDefault(); // без прокрутки, масштаба и «призрачных» кликов
          this._sync(e.touches);
          each(e, (p) => this._down(p));
        },
        opt,
      );
      this.root.addEventListener(
        'touchmove',
        (e) => {
          if (e.cancelable) e.preventDefault();
          each(e, (p) => this._move(p));
        },
        opt,
      );
      const end = (e) => {
        each(e, (p) => this._up(p));
        this._sync(e.touches);
      };
      this.root.addEventListener('touchend', end, opt);
      this.root.addEventListener('touchcancel', end, opt);
      // палец мог уйти со слоя управления или касание оборвала система
      window.addEventListener('touchend', (e) => this._sync(e.touches), { passive: true });
      window.addEventListener('touchcancel', (e) => this._sync(e.touches), { passive: true });
    }
    // мышь (и экраны без touch-событий): указатели; отпускание ловим на окне
    const mouseOnly = 'ontouchstart' in window;
    const ok = (e) => !mouseOnly || e.pointerType === 'mouse';
    this.root.addEventListener('pointerdown', (e) => {
      if (!ok(e)) return;
      e.preventDefault();
      this._down(e);
    });
    window.addEventListener('pointermove', (e) => ok(e) && this._move(e));
    window.addEventListener('pointerup', (e) => ok(e) && this._up(e));
    window.addEventListener('pointercancel', (e) => ok(e) && this._up(e));
    // свернули браузер или открылось системное окно — отпускаем всё
    window.addEventListener('blur', () => this.release());
    document.addEventListener('visibilitychange', () => document.hidden && this.release());
    this.applySettings();
  }

  applySettings() {
    const scale = { s: 0.82, m: 1, l: 1.2 }[settings.btnSize] ?? 1;
    document.documentElement.style.setProperty('--btn-scale', scale);
    document.body.classList.toggle('left-handed', settings.leftHanded);
    this.root.classList.toggle('mode-touch', settings.move === 'touch');
    this._resetStick();
  }

  setVisible(v) {
    this.root.classList.toggle('hidden', !v);
    if (!v) this.release();
  }

  // Подпись главной кнопки зависит от ситуации: «Бросок», «Взять» или «Отбор»
  setActionLabel(key) {
    if (key === this._label) return;
    this._label = key;
    this.actionBtn.textContent = t(key);
  }

  release() {
    const v = this.input.virtual;
    v.x = v.y = 0;
    v.sprint = v.action = v.pass = v.feint = false;
    v.target = null;
    this.stickId = this.targetId = null;
    this.held.clear();
    for (const b of this.buttons) b.el.classList.remove('down');
    this._resetStick();
  }

  // Сверка с пальцами, которые сейчас на экране: всё, чего там нет, считается отпущенным
  _sync(touches) {
    const live = new Set();
    for (const t of touches) live.add(t.identifier);
    for (const id of [...this.held.keys()]) if (!live.has(id)) this._up({ pointerId: id });
    if (this.stickId !== null && !live.has(this.stickId)) this._up({ pointerId: this.stickId });
    if (this.targetId !== null && !live.has(this.targetId)) this._up({ pointerId: this.targetId });
  }

  // Кнопка под пальцем. Засчитываем и касание рядом с кнопкой: палец шире мыши и часто промахивается
  _buttonAt(e) {
    const direct = e.target.closest?.('#touch-buttons button');
    if (direct) return this.buttons.find((b) => b.el === direct) ?? null;
    let best = null;
    let bestD = 18;
    for (const b of this.buttons) {
      const r = b.el.getBoundingClientRect();
      const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) - r.width / 2;
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  _setButton(b) {
    const on = [...this.held.values()].includes(b);
    this.input.virtual[b.key] = on;
    b.el.classList.toggle('down', on);
  }

  _resetStick() {
    this.stick.style.left = '';
    this.stick.style.top = '';
    this.stick.style.right = '';
    this.stick.style.bottom = '';
    this.stick.classList.remove('active');
    this.knob.style.transform = '';
  }

  _down(e) {
    if (this.root.classList.contains('hidden')) return;
    const btn = this._buttonAt(e);
    if (btn) {
      this.held.set(e.pointerId, btn);
      this._setButton(btn);
      // «Смена» срабатывает один раз по нажатию: управление переходит к товарищу, который ближе к улаку
      if (btn.key === 'switch') this.input.onSwitch?.();
      return;
    }
    const p = toStage(e.clientX, e.clientY);
    if (settings.move === 'touch') {
      this.targetId = e.pointerId;
      this.input.virtual.target = this.toWorld(p.x, p.y);
      return;
    }
    if (this.stickId !== null) return;
    const zr = stageRect(this.zone);
    if (p.x < zr.left || p.x > zr.right || p.y < zr.top) return;
    this.stickId = e.pointerId;
    const sr = stageRect(this.stick);
    if (settings.move === 'joystick') {
      // плавающий джойстик: центр встаёт под палец
      this.stick.style.right = 'auto';
      this.stick.style.bottom = 'auto';
      this.stick.style.left = `${p.x - zr.left - sr.width / 2}px`;
      this.stick.style.top = `${p.y - zr.top - sr.height / 2}px`;
      this.center = { x: p.x, y: p.y };
    } else {
      this.center = { x: sr.left + sr.width / 2, y: sr.top + sr.height / 2 };
    }
    this.radius = sr.width / 2;
    this.stick.classList.add('active');
    this._move(e);
  }

  _move(e) {
    const v = this.input.virtual;
    const p = toStage(e.clientX, e.clientY);
    if (e.pointerId === this.targetId) {
      v.target = this.toWorld(p.x, p.y) ?? v.target;
      return;
    }
    if (e.pointerId !== this.stickId) return;
    let dx = (p.x - this.center.x) / this.radius;
    let dy = (p.y - this.center.y) / this.radius;
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    v.x = Math.abs(dx) < 0.12 ? 0 : dx;
    v.y = Math.abs(dy) < 0.12 ? 0 : dy;
    this.knob.style.transform = `translate(${dx * this.radius * 0.55}px, ${dy * this.radius * 0.55}px)`;
  }

  _up(e) {
    const v = this.input.virtual;
    const btn = this.held.get(e.pointerId);
    if (btn) {
      this.held.delete(e.pointerId);
      this._setButton(btn);
      return;
    }
    if (e.pointerId === this.targetId) {
      this.targetId = null;
      v.target = null;
    }
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      v.x = v.y = 0;
      this._resetStick();
    }
  }
}
