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
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        this.onPause?.();
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

  // Заполняет объект controls всадника
  apply(controls) {
    const fwd = this.has('KeyW', 'ArrowUp') ? 1 : 0;
    const back = this.has('KeyS', 'ArrowDown') ? 1 : 0;
    const left = this.has('KeyA', 'ArrowLeft') ? 1 : 0;
    const right = this.has('KeyD', 'ArrowRight') ? 1 : 0;
    controls.throttle = fwd - back;
    controls.steer = left - right;
    controls.sprint = this.has('ShiftLeft', 'ShiftRight');
    controls.action = this.has('Space');
  }
}
