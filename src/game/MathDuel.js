import { t } from '../ui/i18n.js';

// Математическая дуэль за улак: когда игрок и соперник одновременно схватились за тушу,
// обоим даётся пример. Кто первым ответит верно — забирает улак.

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

export function makeProblem(level) {
  let text;
  let answer;
  const kind = level === 'easy' ? rnd(0, 1) : level === 'medium' ? rnd(0, 3) : rnd(2, 5);
  switch (kind) {
    case 0: {
      const a = rnd(2, 20);
      const b = rnd(2, 20);
      text = `${a} + ${b}`;
      answer = a + b;
      break;
    }
    case 1: {
      const a = rnd(10, 30);
      const b = rnd(1, a - 1);
      text = `${a} − ${b}`;
      answer = a - b;
      break;
    }
    case 2: {
      const a = rnd(2, 10);
      const b = rnd(2, 10);
      text = `${a} × ${b}`;
      answer = a * b;
      break;
    }
    case 3: {
      const b = rnd(2, 10);
      const q = rnd(2, 10);
      text = `${b * q} ÷ ${b}`;
      answer = q;
      break;
    }
    case 4: {
      const a = rnd(2, 9);
      const b = rnd(2, 9);
      const c = rnd(2, 30);
      text = `${a} × ${b} + ${c}`;
      answer = a * b + c;
      break;
    }
    default: {
      const a = rnd(21, 99);
      const b = rnd(11, 59);
      text = `${a} + ${b}`;
      answer = a + b;
    }
  }
  // варианты ответа: верный и три правдоподобных неверных
  const opts = new Set([answer]);
  while (opts.size < 4) {
    const d = rnd(1, Math.max(3, Math.round(answer * 0.2)));
    const v = answer + (Math.random() < 0.5 ? -d : d);
    if (v >= 0) opts.add(v);
  }
  return { text, answer, options: [...opts].sort(() => Math.random() - 0.5) };
}

// Время ответа бота (сек) по уровню сложности ботов
const BOT_TIME = { easy: [5, 9], medium: [3, 7], hard: [2, 5], expert: [1.2, 3] };
const BOT_WRONG = { easy: 0.25, medium: 0.15, hard: 0.08, expert: 0.03 };

export class MathDuel {
  constructor() {
    this.el = document.getElementById('duel');
    this.qEl = this.el.querySelector('.duel-q');
    this.optsEl = this.el.querySelector('.duel-opts');
    this.barEl = this.el.querySelector('.duel-bar i');
    this.titleEl = this.el.querySelector('.duel-title');
    this.active = null;
    this.optsEl.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (b) this.answer(Number(b.dataset.v), b);
    });
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4) this.answer(this.active.problem.options[n - 1], this.optsEl.children[n - 1]);
    });
  }

  // cfg: { level, answerTime, botLevel, rivalName }; onDone(playerWon)
  start(cfg, onDone) {
    const problem = makeProblem(cfg.level);
    const [a, b] = BOT_TIME[cfg.botLevel] ?? BOT_TIME.medium;
    this.active = {
      problem,
      cfg,
      onDone,
      t: 0,
      botT: Math.min(cfg.answerTime - 0.2, a + Math.random() * (b - a)),
      botWrong: Math.random() < (BOT_WRONG[cfg.botLevel] ?? 0.1),
      locked: false,
    };
    this.titleEl.textContent = `${t('mathDuel')} · ${cfg.rivalName}`;
    this.qEl.textContent = `${problem.text} = ?`;
    this.optsEl.innerHTML = problem.options.map((v, i) => `<button data-v="${v}"><small>${i + 1}</small>${v}</button>`).join('');
    this.el.classList.remove('hidden', 'win', 'lose');
  }

  answer(v, btn) {
    const d = this.active;
    if (!d || d.locked) return;
    const ok = v === d.problem.answer;
    btn?.classList.add(ok ? 'ok' : 'bad');
    if (!ok) {
      // неверный ответ — соперник получает улак
      this._finish(false);
      return;
    }
    this._finish(true);
  }

  update(dt) {
    const d = this.active;
    if (!d || d.locked) return;
    d.t += dt;
    this.barEl.style.width = `${Math.max(0, 1 - d.t / d.cfg.answerTime) * 100}%`;
    if (d.t >= d.botT) {
      // бот ответил; если ошибся — улак игроку, иначе боту
      this._finish(d.botWrong);
      return;
    }
    if (d.t >= d.cfg.answerTime) this._finish(false);
  }

  _finish(playerWon) {
    const d = this.active;
    d.locked = true;
    for (const b of this.optsEl.children) if (Number(b.dataset.v) === d.problem.answer) b.classList.add('ok');
    this.el.classList.add(playerWon ? 'win' : 'lose');
    this.qEl.textContent = `${d.problem.text} = ${d.problem.answer}`;
    setTimeout(() => {
      this.el.classList.add('hidden');
      this.active = null;
      d.onDone(playerWon);
    }, 700);
  }

  get busy() {
    return !!this.active;
  }
}
