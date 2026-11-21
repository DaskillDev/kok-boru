// HUD на обычном DOM: счёт, таймер, выносливость, сила броска, баннеры.

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = $('hud');
    this.score = [$('score0'), $('score1')];
    this.timer = $('timer');
    this.stamina = $('stamina-fill');
    this.chargeWrap = $('charge-wrap');
    this.charge = $('charge-fill');
    this.banner = $('banner');
    this.possession = $('possession');
    this.muteBtn = $('btn-mute');
    this._bannerTimer = 0;
    this._last = {};
  }

  show(v) {
    this.el.classList.toggle('hidden', !v);
  }

  setScore(s) {
    this.score[0].textContent = s[0];
    this.score[1].textContent = s[1];
  }

  setTime(sec, label = '') {
    const t = Math.max(0, Math.ceil(sec));
    if (t === this._last.t && label === this._last.label) return;
    this._last.t = t;
    this._last.label = label;
    this.timer.innerHTML = `<small>${label}</small>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    this.timer.classList.toggle('low', t <= 20);
  }

  setStamina(v, exhausted) {
    this.stamina.style.width = `${(v * 100).toFixed(1)}%`;
    this.stamina.classList.toggle('tired', exhausted);
  }

  setCharge(v) {
    const on = v >= 0;
    this.chargeWrap.classList.toggle('hidden', !on);
    if (on) this.charge.style.width = `${(v * 100).toFixed(0)}%`;
  }

  setPossession(text) {
    if (text === this._last.p) return;
    this._last.p = text;
    this.possession.textContent = text;
  }

  setMuted(m) {
    this.muteBtn.classList.toggle('off', m);
  }

  // duration = 0 → держится, пока не заменят
  showBanner(html, duration = 0, color = '') {
    this.banner.innerHTML = html;
    this.banner.style.color = color;
    this._bannerTimer = duration;
  }

  update(dt) {
    if (this._bannerTimer > 0) {
      this._bannerTimer -= dt;
      if (this._bannerTimer <= 0) this.banner.innerHTML = '';
    }
  }
}
