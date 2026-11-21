// Клавиатура → команды управления. Используем e.code, чтобы работало в любой раскладке.

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'Space',
]);


export class Input {
  constructor() {
    this.keys = new Set();
    this.onPause = null;
    window.addEventListener('keydown', (e) => {
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

  // Заполняет объект controls всадника.
  // screenRelative — для ТВ-камеры: WASD задают направление на экране (как в футбольных играх),
  // а конь сам доворачивает на этот курс. Иначе — «от коня»: A/D поворачивают, W/S газ/тормоз.
  apply(controls, rider, screenRelative = false) {
    const fwd = this.has('KeyW', 'ArrowUp') ? 1 : 0;
    const back = this.has('KeyS', 'ArrowDown') ? 1 : 0;
    const left = this.has('KeyA', 'ArrowLeft') ? 1 : 0;
    const right = this.has('KeyD', 'ArrowRight') ? 1 : 0;
    controls.sprint = this.has('ShiftLeft', 'ShiftRight');
    controls.action = this.has('Space');
    if (!screenRelative) {
      controls.throttle = fwd - back;
      controls.steer = left - right;
      return;
    }
    // камера стоит на стороне +Z и смотрит на −Z: вправо на экране = +X, вверх = −Z
    const dx = right - left;
    const dz = back - fwd;
    if (!dx && !dz) {
      controls.throttle = 0;
      controls.steer = 0;
      return;
    }
    const want = Math.atan2(dx, dz);
    const err = Math.atan2(Math.sin(want - rider.heading), Math.cos(want - rider.heading));
    controls.steer = Math.max(-1, Math.min(1, err * 3));
    controls.throttle = Math.abs(err) > 1.6 ? 0.35 : Math.abs(err) > 0.9 ? 0.7 : 1;
  }
}
