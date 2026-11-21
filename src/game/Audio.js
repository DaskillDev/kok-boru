import { settings, onSettings } from '../ui/settings.js';

// Звук целиком синтезируется через Web Audio: топот, удары, сигнал гола, гул трибун
// и простая фоновая мелодия в пентатонике. Внешних аудиофайлов нет.

const PENTA = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._hoofT = 0;
    this._hoofN = 0;
    this._musicTimer = null;
    this._step = 0;
    onSettings((key) => {
      if (key === 'volume' || key === 'music' || key === 'sfx') this._applyVolumes();
    });
  }

  // Вызывать по жесту пользователя (клик/касание) — иначе браузер не даст звук
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.sfx = this.ctx.createGain();
    this.music = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.music.connect(this.master);
    this.master.connect(this.ctx.destination);
    // общий буфер шума
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, len);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._applyVolumes();
    this._startMusic();
  }

  _applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.muted ? 0 : settings.volume;
    this.sfx.gain.value = settings.sfx;
    this.music.gain.value = settings.music * 0.5;
  }

  toggleMute() {
    this.muted = !this.muted;
    this._applyVolumes();
    return this.muted;
  }

  _noise(dur, freq, q, gain, type = 'bandpass', when = 0) {
    const c = this.ctx;
    const t0 = c.currentTime + when;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }

  _tone(f0, f1, dur, gain, type = 'sine', when = 0, out = this.sfx) {
    const c = this.ctx;
    const t0 = c.currentTime + when;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  // Топот: трёхтактный ритм галопа, частота растёт со скоростью
  hooves(dt, speed) {
    if (!this.ctx || speed < 1.2) return;
    this._hoofT -= dt;
    if (this._hoofT > 0) return;
    const gallop = speed > 5;
    const beat = this._hoofN++ % (gallop ? 4 : 2);
    const stride = Math.max(0.42, Math.min(1.0, 4.6 / speed));
    this._hoofT = gallop ? (beat === 3 ? stride * 0.46 : stride * 0.18) : stride * 0.5;
    if (gallop && beat === 3) return; // фаза полёта
    this._noise(0.07, 140 + Math.random() * 60, 1.2, 0.25 + Math.min(speed, 16) * 0.012, 'lowpass');
  }

  impact(strength = 5) {
    if (!this.ctx) return;
    const g = Math.min(0.9, 0.25 + strength * 0.04);
    this._tone(95, 38, 0.22, g);
    this._noise(0.16, 420, 0.8, g * 0.6);
    this.vibrate(Math.min(120, 20 + strength * 6));
  }

  pickup() {
    if (!this.ctx) return;
    this._noise(0.12, 700, 1.5, 0.3);
    this._tone(180, 120, 0.1, 0.25);
  }

  throwSound() {
    if (!this.ctx) return;
    this._noise(0.28, 900, 0.7, 0.28, 'highpass');
  }

  beep(high = false) {
    if (!this.ctx) return;
    this._tone(high ? 880 : 520, high ? 880 : 520, high ? 0.45 : 0.16, 0.22, 'triangle');
  }

  goal() {
    if (!this.ctx) return;
    // рог + гул зрителей
    this._tone(196, 196, 0.9, 0.3, 'sawtooth');
    this._tone(294, 294, 0.9, 0.22, 'sawtooth');
    this._noise(2.2, 900, 0.4, 0.35);
    this.vibrate([60, 40, 120]);
  }

  whistle() {
    if (!this.ctx) return;
    this._tone(2100, 1900, 0.6, 0.16, 'square');
  }

  // Постоянный негромкий гул трибун во время матча
  ambience(on) {
    if (!this.ctx) return;
    if (on && !this._amb) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 520;
      f.Q.value = 0.5;
      const g = this.ctx.createGain();
      g.gain.value = 0.045;
      src.connect(f).connect(g).connect(this.sfx);
      src.start();
      this._amb = { src, g };
    } else if (!on && this._amb) {
      this._amb.src.stop();
      this._amb = null;
    }
  }

  vibrate(pattern) {
    if (settings.vibration && navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate(pattern);
  }

  // Фоновая мелодия: щипки в ля-минорной пентатонике (похоже на комуз)
  _startMusic() {
    const bar = [0, 2, 4, 2, 5, 4, 2, 1, 0, 2, 4, 6, 5, 4, 2, 0];
    const tick = () => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const i = this._step++;
      const n = bar[i % bar.length] + (Math.floor(i / bar.length) % 2 ? 1 : 0);
      const f = PENTA[Math.min(n, PENTA.length - 1)];
      if (i % 8 !== 7) this._tone(f, f, 0.5, 0.2, 'triangle', 0, this.music);
      if (i % 4 === 0) this._tone(f / 2, f / 2, 0.9, 0.16, 'sine', 0, this.music);
    };
    this._musicTimer = setInterval(tick, 300);
  }
}
