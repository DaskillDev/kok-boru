import { settings, onSettings } from '../ui/settings.js';

// Звук игры.
// Записи (CC0 / public domain, см. CREDITS.md): рысь коня, ржание, ликование и гул трибун,
// недовольный гул, «у-у-у» разочарования, аплодисменты, свисток судьи, свист броска.
// Музыка: запись игры на комузе (CC BY 3.0, Nurlan Shantayev), играет по кругу в меню и в матче.
// Синтез (Web Audio): выкрики всадников (формантный синтез голоса), удары, подбор улака,
// отсчёт; синтезированная мелодия — только если запись не загрузилась. Звуки на поле позиционируются: громкость и панорама — от камеры.

const PENTA = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];

const SAMPLES = {
  trot: 'Trot.ogg',
  neigh: 'neigh.ogg',
  cheers: 'cheers_1.ogg',
  hurray: 'hurray.ogg',
  applause: 'applause.ogg',
  boo: 'boo.wav',
  ooh: 'oooooooooo.ogg',
  crowd: 'crowd_shouting_0.ogg',
  whistle: 'whistle.wav',
  whoosh: 'whoosh2_0.wav',
  komuz: '../music/komuz.wav',
};

// Форманты гласных (Гц) для синтеза выкриков
const VOWELS = {
  a: [780, 1180, 2600],
  o: [520, 880, 2450],
  e: [560, 1750, 2500],
  i: [320, 2150, 2950],
  u: [360, 780, 2300],
};
// Выкрики: «Айт!», «Хоп!», «Кет!», «Чуу!», «Ой-ой!» — последовательность [гласная, доля длительности]
const SHOUTS = [
  { c: 'h', v: [['a', 0.55], ['i', 0.45]] },
  { c: 'h', v: [['o', 1]] },
  { c: 'k', v: [['e', 1]] },
  { c: 'ch', v: [['u', 1]] },
  { c: '', v: [['o', 0.4], ['i', 0.2], ['o', 0.4]] },
  { c: 'h', v: [['e', 0.5], ['i', 0.5]] },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.buf = {};
    this._musicTimer = null;
    this._step = 0;
    this._hoof = new Map(); // всадник → { src, gain, pan, lp }
    this._listener = { x: 0, z: 0, rx: 1, rz: 0 };
    this._neighT = 0;
    this._crowdLevel = 0.12;
    this.musicMode = 'menu'; // menu | match — у каждого своя громкость
    onSettings((key) => {
      if (key === 'volume' || key === 'music' || key === 'musicMatch' || key === 'sfx') this._applyVolumes();
    });
  }

  // Вызывать по жесту пользователя (клик/касание) — иначе браузер не даст звук
  unlock() {
    if (this.ctx) {
      // На телефоне система глушит звук при сворачивании браузера, звонке, уведомлении
      // (состояние 'suspended' или, на iPhone, 'interrupted') — возобновляем при любом касании.
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // iPhone: звук игры идёт как «воспроизведение» — не глушится переключателем беззвучного режима
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch {
      // старые версии iOS этого не умеют
    }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.sfx = this.ctx.createGain();
    this.music = this.ctx.createGain();
    this.crowdBus = this.ctx.createGain();
    // мягкий компрессор, чтобы гол и топот не перегружали выход
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.sfx.connect(comp);
    this.crowdBus.connect(comp);
    this.music.connect(this.master);
    comp.connect(this.master);
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, len);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._applyVolumes();
    this.loaded = this._load().then(() => this._startMusic());
  }

  // Браузер свернули: сами ставим звук на паузу. Иначе iPhone после возврата иногда оставляет
  // звук «включённым», но немым — а после явной паузы он честно возобновляется при касании.
  sleep() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }

  async _load() {
    const base = `${import.meta.env.BASE_URL}sounds/`;
    await Promise.all(
      Object.entries(SAMPLES).map(async ([key, file]) => {
        try {
          const res = await fetch(base + file);
          this.buf[key] = await this.ctx.decodeAudioData(await res.arrayBuffer());
        } catch (e) {
          console.warn(`Звук ${file} не загрузился, используется синтез`, e);
        }
      }),
    );
    if (this._ambWanted) this.ambience(true);
  }

  _applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.muted ? 0 : settings.volume;
    this.sfx.gain.value = settings.sfx;
    this.crowdBus.gain.value = settings.sfx;
    const mv = this.musicMode === 'match' ? settings.musicMatch : settings.music;
    this.music.gain.setTargetAtTime(mv * 0.9, this.ctx.currentTime, 0.4);
  }

  // Громкость музыки зависит от того, где игрок: в меню или в матче
  setMusicMode(mode) {
    this.musicMode = mode;
    this._applyVolumes();
  }

  toggleMute() {
    this.muted = !this.muted;
    this._applyVolumes();
    return this.muted;
  }

  // ---------- пространство ----------

  // Камера — «уши»: положение и правое направление на плоскости поля
  setListener(camera) {
    const e = camera.matrixWorld.elements;
    this._listener.x = e[12];
    this._listener.z = e[14];
    const l = Math.hypot(e[0], e[2]) || 1;
    this._listener.rx = e[0] / l;
    this._listener.rz = e[2] / l;
  }

  // Громкость и панорама источника в точке (x, z)
  _spatial(x, z, range = 80) {
    const L = this._listener;
    const dx = x - L.x;
    const dz = z - L.z;
    const d = Math.hypot(dx, dz);
    const g = Math.pow(clamp(1 - d / range, 0, 1), 1.6);
    const pan = d < 0.5 ? 0 : clamp((dx * L.rx + dz * L.rz) / d, -1, 1) * 0.85;
    return { g, pan };
  }

  // ---------- примитивы ----------

  _out(gain, pan = 0, bus = this.sfx) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(bus);
    } else g.connect(bus);
    return g;
  }

  _sample(name, { gain = 1, rate = 1, pan = 0, bus = this.sfx, offset = 0, dur } = {}) {
    const b = this.buf[name];
    if (!this.ctx || !b || gain < 0.01) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = rate;
    src.connect(this._out(gain, pan, bus));
    src.start(0, offset, dur);
    return src;
  }

  _noise(dur, freq, q, gain, type = 'bandpass', when = 0, pan = 0) {
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
    g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this._out(1, pan));
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
    g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  // ---------- кони ----------

  // Топот каждого коня: петля записи рыси; темп и громкость — от скорости, положение — от камеры
  updateRiders(riders) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const trot = this.buf.trot;
    if (!trot) return;
    const now = this.ctx.currentTime;
    for (const r of riders) {
      let h = this._hoof.get(r);
      if (!h) {
        const src = this.ctx.createBufferSource();
        src.buffer = trot;
        src.loop = true;
        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        // у дальних коней приглушаем верхние частоты
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 4000;
        const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
        src.connect(lp).connect(gain);
        if (pan) gain.connect(pan).connect(this.sfx);
        else gain.connect(this.sfx);
        src.start(0, Math.random() * trot.duration);
        h = { src, gain, pan, lp };
        this._hoof.set(r, h);
      }
      const sp = Math.hypot(r.vel.x, r.vel.z);
      const { g, pan } = this._spatial(r.pos.x, r.pos.z, 70);
      const mine = r.isHuman;
      const level = sp < 1 || !r.group.visible ? 0 : clamp(0.25 + sp / 16, 0, 1) * (mine ? 0.85 : g * 0.7);
      h.gain.gain.setTargetAtTime(level, now, 0.08);
      h.src.playbackRate.setTargetAtTime(clamp(0.75 + sp / 15, 0.75, 2.1), now, 0.15);
      h.lp.frequency.setTargetAtTime(mine ? 6000 : 1200 + g * 4800, now, 0.2);
      if (h.pan) h.pan.pan.setTargetAtTime(mine ? 0 : pan, now, 0.1);
    }
  }

  silenceRiders() {
    if (!this.ctx) return;
    for (const h of this._hoof.values()) h.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }

  neigh(x, z, force = false) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (!force && now < this._neighT) return;
    this._neighT = now + 2.5;
    const { g, pan } = this._spatial(x, z, 90);
    this._sample('neigh', { gain: 0.9 * g, pan, rate: 0.9 + Math.random() * 0.25 });
  }

  // ---------- всадники: выкрики ----------

  // Формантный синтез короткого мужского выкрика («Айт!», «Хоп!», «Кет!»)
  shout(x, z, intensity = 1) {
    if (!this.ctx) return;
    const { g, pan } = this._spatial(x, z, 75);
    if (g < 0.03) return;
    const c = this.ctx;
    const t0 = c.currentTime + 0.01;
    const s = SHOUTS[Math.floor(Math.random() * SHOUTS.length)];
    const dur = 0.28 + Math.random() * 0.22;
    const f0 = 135 + Math.random() * 55;
    const out = this._out(0.5 * g * intensity, pan);

    // голосовой источник: пила с вибрато и падением высоты к концу
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0 * 1.15, t0);
    osc.frequency.linearRampToValueAtTime(f0 * 1.3, t0 + dur * 0.25);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.8, t0 + dur);
    const vib = c.createOscillator();
    vib.frequency.value = 6 + Math.random() * 2;
    const vibG = c.createGain();
    vibG.gain.value = f0 * 0.03;
    vib.connect(vibG).connect(osc.frequency);
    // хрипотца крика — лёгкое насыщение
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) curve[i] = Math.tanh(((i / 255) * 2 - 1) * 2.2);
    shaper.curve = curve;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(1, t0 + 0.03);
    env.gain.setValueAtTime(1, t0 + dur * 0.7);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(shaper).connect(env);

    // три форманты с переходами между гласными
    const amps = [1, 0.55, 0.22];
    for (let k = 0; k < 3; k++) {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 7;
      let t = t0;
      for (const [v, share] of s.v) {
        bp.frequency.setTargetAtTime(VOWELS[v][k], t, 0.02);
        t += dur * share;
      }
      const a = c.createGain();
      a.gain.value = amps[k];
      env.connect(bp).connect(a).connect(out);
    }
    // согласная в начале и придыхание
    if (s.c) {
      const freq = s.c === 'k' ? 2200 : s.c === 'ch' ? 3800 : 1400;
      this._noise(0.07, freq, 1.2, 0.35 * g * intensity, 'bandpass', 0, pan);
    }
    this._noise(dur, 1800, 0.6, 0.06 * g * intensity, 'bandpass', 0.02, pan);
    osc.start(t0);
    vib.start(t0);
    osc.stop(t0 + dur + 0.05);
    vib.stop(t0 + dur + 0.05);
  }

  // ---------- игровые события ----------

  impact(strength, x, z) {
    if (!this.ctx) return;
    const { g, pan } = this._spatial(x, z, 70);
    const k = Math.min(0.9, 0.25 + strength * 0.05) * g;
    if (k < 0.02) return;
    // глухой удар корпусов + треск сбруи
    this._tone(85, 40, 0.24, k);
    this._noise(0.14, 380, 0.9, k * 0.7, 'bandpass', 0, pan);
    this._noise(0.08, 2600, 2, k * 0.25, 'bandpass', 0.02, pan);
    if (strength > 6 && Math.random() < 0.6) this.neigh(x, z);
    if (strength > 4) this.shout(x, z, 0.8);
    if (g > 0.6) this.vibrate(Math.min(120, 20 + strength * 6));
  }

  pickup(x, z) {
    if (!this.ctx) return;
    const { g, pan } = this._spatial(x, z, 60);
    // шлепок туши и шорох шкуры
    this._tone(140, 70, 0.12, 0.35 * g);
    this._noise(0.16, 900, 0.8, 0.3 * g, 'bandpass', 0, pan);
  }

  throwSound(x, z, power = 0.5) {
    if (!this.ctx) return;
    const { g, pan } = this._spatial(x, z, 70);
    if (this.buf.whoosh) this._sample('whoosh', { gain: (0.45 + power * 0.5) * g, rate: 1.25 - power * 0.45, pan, dur: 0.9 });
    else this._noise(0.3, 900, 0.7, 0.3 * g, 'highpass', 0, pan);
    this.shout(x, z, 0.9 + power * 0.3);
  }

  beep(high = false) {
    if (!this.ctx) return;
    this._tone(high ? 880 : 520, high ? 880 : 520, high ? 0.45 : 0.16, 0.22, 'triangle');
  }

  whistle(long = false) {
    if (!this.ctx) return;
    if (this.buf.whistle) this._sample('whistle', { gain: 0.55, dur: long ? undefined : 0.9 });
    else this._tone(2100, 1900, 0.6, 0.16, 'square');
  }

  // Гол: свои — ликование и аплодисменты, чужие — разочарованный гул
  goal(ours) {
    if (!this.ctx) return;
    this._tone(196, 196, 0.9, 0.22, 'sawtooth');
    if (ours) {
      this._sample('cheers', { gain: 0.9, bus: this.crowdBus });
      this._sample('hurray', { gain: 0.6, bus: this.crowdBus });
      setTimeout(() => this._sample('applause', { gain: 0.6, bus: this.crowdBus }), 600);
      this.vibrate([60, 40, 120]);
    } else {
      this._sample('ooh', { gain: 0.8, bus: this.crowdBus });
      setTimeout(() => this._sample('applause', { gain: 0.25, bus: this.crowdBus }), 900);
    }
    this._crowdLevel = 0.6;
  }

  // Улак упал рядом с казаном — трибуны ахают
  nearMiss() {
    this._sample('ooh', { gain: 0.55, bus: this.crowdBus, rate: 1.08 });
  }

  // Нарушение: свисток и недовольство трибун
  foul(byPlayerTeam) {
    this.whistle();
    this._sample('boo', { gain: byPlayerTeam ? 0.35 : 0.55, bus: this.crowdBus, offset: 0.3, dur: 2.4 });
  }

  // Отбор улака — трибуны оживляются
  steal(ours) {
    if (ours) this._sample('cheers', { gain: 0.35, bus: this.crowdBus, offset: 0.2, dur: 1.6 });
    this._crowdLevel = Math.max(this._crowdLevel, 0.4);
  }

  // ---------- трибуны ----------

  // Гул трибун во время матча: петля записи толпы
  ambience(on) {
    this._ambWanted = on;
    if (!this.ctx) return;
    if (on && !this._amb && this.buf.crowd) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buf.crowd;
      src.loop = true;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      src.connect(g).connect(this.crowdBus);
      src.start(0, Math.random() * this.buf.crowd.duration);
      this._amb = { src, g };
    } else if (!on && this._amb) {
      this._amb.src.stop();
      this._amb = null;
    }
  }

  // Напряжение трибун: громче, когда улак у казана (excitement 0..1)
  updateCrowd(excitement, dt) {
    if (!this._amb) return;
    const target = 0.12 + excitement * 0.38;
    this._crowdLevel += (target - this._crowdLevel) * (1 - Math.exp(-dt * (target > this._crowdLevel ? 2 : 0.6)));
    this._amb.g.gain.setTargetAtTime(this._crowdLevel, this.ctx.currentTime, 0.1);
  }

  vibrate(pattern) {
    if (settings.vibration && navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate(pattern);
  }

  // Фоновая музыка: запись комуза по кругу; если её нет — синтезированная мелодия
  _startMusic() {
    if (this.buf.komuz) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buf.komuz;
      src.loop = true;
      src.connect(this.music);
      src.start();
      this._musicSrc = src;
      return;
    }
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
