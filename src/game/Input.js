// Ввод игрока: клавиатура + виртуальные органы управления (сенсорный экран).
// Используем e.code, чтобы клавиши работали в любой раскладке.

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'Space', 'KeyE', 'KeyF',
]);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Input {
  constructor() {
    this.keys = new Set();
    // заполняется TouchControls: x вправо, y вниз (−1..1); target — точка на поле в режиме «Касание»
    this.virtual = { x: 0, y: 0, sprint: false, action: false, pass: false, feint: false, target: null };
    this.onPause = null;
    this.onCamera = null;
    this.onGraphics = null;
    this.onSwitch = null;
    this.onAuto = null;
    // режим «Авто»: пока игрок сам не рулит, конь скачет к точке autoTarget (её каждый кадр задаёт main.js — улак)
    this.auto = false;
    this.autoTarget = null;
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (GAME_KEYS.has(e.code)) {
        this.keys.add(e.code);
        e.preventDefault();
      } else if (e.repeat) {
        // игнорируем автоповтор
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        this.onPause?.();
      } else if (e.code === 'KeyC') {
        this.onCamera?.();
      } else if (e.code === 'KeyG') {
        this.onGraphics?.();
      } else if (e.code === 'KeyQ' || e.code === 'Tab') {
        e.preventDefault();
        this.onSwitch?.();
      } else if (e.code === 'KeyR') {
        this.onAuto?.();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  has(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  get actionHeld() {
    return this.has('Space') || this.virtual.action;
  }

  // Заполняет объект controls всадника.
  // screenRelative — для камер «ТВ» и «Сверху»: направление задаётся по экрану,
  // конь сам доворачивает на этот курс. Иначе — «от коня»: влево/вправо поворачивают.
  apply(controls, rider, screenRelative = false) {
    const v = this.virtual;
    const fwd = this.has('KeyW', 'ArrowUp') ? 1 : 0;
    const back = this.has('KeyS', 'ArrowDown') ? 1 : 0;
    const left = this.has('KeyA', 'ArrowLeft') ? 1 : 0;
    const right = this.has('KeyD', 'ArrowRight') ? 1 : 0;
    controls.sprint = this.has('ShiftLeft', 'ShiftRight') || v.sprint;
    controls.action = this.has('Space') || v.action;
    controls.pass = this.has('KeyE') || v.pass;
    controls.feint = this.has('KeyF') || v.feint;

    // режим «Касание»: едем к точке на поле
    if (v.target) {
      const dx = v.target.x - rider.pos.x;
      const dz = v.target.z - rider.pos.z;
      const d = Math.hypot(dx, dz);
      this._steerTo(controls, rider, Math.atan2(dx, dz), clamp(d / 5, 0, 1));
      if (d < 1.2) controls.throttle = 0;
      return;
    }

    // режим «Авто»: игрок не трогает управление — конь сам скачет за улаком
    if (this.auto && this.autoTarget && !fwd && !back && !left && !right && Math.hypot(v.x, v.y) < 0.15) {
      const dx = this.autoTarget.x - rider.pos.x;
      const dz = this.autoTarget.z - rider.pos.z;
      const d = Math.hypot(dx, dz);
      this._steerTo(controls, rider, Math.atan2(dx, dz), clamp(d / 3, 0.45, 1));
      if (d < 0.8) controls.throttle = 0;
      return;
    }

    if (!screenRelative) {
      controls.throttle = clamp(fwd - back - v.y * 1.25, -1, 1);
      controls.steer = clamp(left - right - v.x * 1.25, -1, 1);
      return;
    }
    // камера стоит на стороне +Z и смотрит на −Z: вправо на экране = +X, вверх = −Z
    const dx = right - left + v.x;
    const dz = back - fwd + v.y;
    const mag = Math.hypot(dx, dz);
    if (mag < 0.15) {
      controls.throttle = 0;
      controls.steer = 0;
      return;
    }
    this._steerTo(controls, rider, Math.atan2(dx, dz), clamp(mag * 1.2, 0, 1));
  }

  _steerTo(controls, rider, want, power) {
    const err = Math.atan2(Math.sin(want - rider.heading), Math.cos(want - rider.heading));
    controls.steer = clamp(err * 3, -1, 1);
    controls.throttle = (Math.abs(err) > 1.6 ? 0.35 : Math.abs(err) > 0.9 ? 0.7 : 1) * power;
  }
}
