import { settings } from '../ui/settings.js';
import { t } from '../ui/i18n.js';

// Сенсорное управление: джойстик (плавающий или фиксированный) либо езда к точке касания,
// плюс кнопки «Рывок», «Отбор/Бросок», «Пас», «Финт». Пишет в input.virtual.

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

    const v = input.virtual;
    for (const [id, key] of [['tb-sprint', 'sprint'], ['tb-action', 'action'], ['tb-pass', 'pass'], ['tb-feint', 'feint']]) {
      const b = document.getElementById(id);
      const set = (on) => (e) => {
        e.preventDefault();
        e.stopPropagation();
        v[key] = on;
        b.classList.toggle('down', on);
        if (on) b.setPointerCapture?.(e.pointerId);
      };
      b.addEventListener('pointerdown', set(true));
      b.addEventListener('pointerup', set(false));
      b.addEventListener('pointercancel', set(false));
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    this.root.addEventListener('pointerdown', (e) => this._down(e));
    this.root.addEventListener('pointermove', (e) => this._move(e));
    this.root.addEventListener('pointerup', (e) => this._up(e));
    this.root.addEventListener('pointercancel', (e) => this._up(e));
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
    this._resetStick();
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
    if (e.target.closest('#touch-buttons')) return;
    if (settings.move === 'touch') {
      this.targetId = e.pointerId;
      this.input.virtual.target = this.toWorld(e.clientX, e.clientY);
      return;
    }
    if (this.stickId !== null) return;
    const zr = this.zone.getBoundingClientRect();
    if (e.clientX < zr.left || e.clientX > zr.right || e.clientY < zr.top) return;
    this.stickId = e.pointerId;
    const sr = this.stick.getBoundingClientRect();
    if (settings.move === 'joystick') {
      // плавающий джойстик: центр встаёт под палец
      this.stick.style.right = 'auto';
      this.stick.style.bottom = 'auto';
      this.stick.style.left = `${e.clientX - zr.left - sr.width / 2}px`;
      this.stick.style.top = `${e.clientY - zr.top - sr.height / 2}px`;
      this.center = { x: e.clientX, y: e.clientY };
    } else {
      this.center = { x: sr.left + sr.width / 2, y: sr.top + sr.height / 2 };
    }
    this.radius = sr.width / 2;
    this.stick.classList.add('active');
    this._move(e);
  }

  _move(e) {
    const v = this.input.virtual;
    if (e.pointerId === this.targetId) {
      v.target = this.toWorld(e.clientX, e.clientY) ?? v.target;
      return;
    }
    if (e.pointerId !== this.stickId) return;
    let dx = (e.clientX - this.center.x) / this.radius;
    let dy = (e.clientY - this.center.y) / this.radius;
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
