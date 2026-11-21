// Настройки игрока: хранятся в localStorage, изменения рассылаются подписчикам.

const KEY = 'ulak-tartysh-settings-v1';

const DEFAULTS = {
  v: 3,
  lang: 'ru',
  nickname: '',
  // управление
  move: 'joystick', // joystick | fixed | touch
  btnSize: 'm', // s | m | l
  leftHanded: false,
  autoSwitch: false,
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
  quick: { time: 180, difficulty: 'easy', size: 4, weather: 'random', map: 'random' },
  // локальная статистика (до появления онлайна и аккаунтов)
  stats: { matches: 0, wins: 0, draws: 0, goals: 0 },
  // прогресс: опыт, монеты, купленные масти
  profile: { xp: 0, coins: 0, coat: 'bay', owned: ['bay'] },
};

// Масти в конюшне: цена в монетах и цвет образца
export const COAT_SHOP = [
  { id: 'bay', price: 0, css: '#7a4a2c' },
  { id: 'chestnut', price: 100, css: '#b06a3a' },
  { id: 'grey', price: 150, css: '#c9ced6' },
  { id: 'dun', price: 200, css: '#b9a37a' },
  { id: 'palomino', price: 300, css: '#e0b874' },
  { id: 'black', price: 400, css: '#2b2b30' },
];

export const levelOf = (xp) => 1 + Math.floor(xp / 250);

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    // v2: автосмена всадника теперь выключена, пока игрок сам её не включит
    if (!raw.v || raw.v < 2) {
      raw.autoSwitch = false;
      raw.v = 2;
    }
    // v3: регламент по правилам федерации — три периода, 4 на 4
    if (raw.v < 3) {
      raw.quick = { ...(raw.quick || {}), time: 180, size: 4 };
      raw.v = 3;
    }
    return {
      ...DEFAULTS,
      ...raw,
      quick: { ...DEFAULTS.quick, ...(raw.quick || {}) },
      stats: { ...DEFAULTS.stats, ...(raw.stats || {}) },
      profile: { ...DEFAULTS.profile, ...(raw.profile || {}) },
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
