// Настройки игрока: хранятся в localStorage, изменения рассылаются подписчикам.

const KEY = 'ulak-tartysh-settings-v1';

const DEFAULTS = {
  lang: 'ru',
  nickname: '',
  // управление
  move: 'joystick', // joystick | fixed | touch
  btnSize: 'm', // s | m | l
  leftHanded: false,
  autoSwitch: true,
  // звук
  volume: 0.8,
  music: 0.4,
  sfx: 1,
  vibration: true,
  // экран
  quality: 'auto', // auto | low | medium | high
  camera: 'chase', // chase | tv | top | first
  names: 'all', // all | humans | none
  // быстрый матч
  quick: { time: 180, difficulty: 'easy', size: 2, weather: 'random', map: 'random' },
  // локальная статистика (до появления онлайна и аккаунтов)
  stats: { matches: 0, wins: 0, draws: 0, goals: 0 },
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      ...DEFAULTS,
      ...raw,
      quick: { ...DEFAULTS.quick, ...(raw.quick || {}) },
      stats: { ...DEFAULTS.stats, ...(raw.stats || {}) },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export const settings = load();
const listeners = new Set();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // приватный режим — живём без сохранения
  }
}

// key может быть вложенным: 'quick.time'
export function setSetting(key, value) {
  const parts = key.split('.');
  let o = settings;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  if (o[parts.at(-1)] === value) return;
  o[parts.at(-1)] = value;
  save();
  for (const fn of listeners) fn(key, value);
}

export function getSetting(key) {
  return key.split('.').reduce((o, k) => o[k], settings);
}

export function onSettings(fn) {
  listeners.add(fn);
}

export const isTouchDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;
