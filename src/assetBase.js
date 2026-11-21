// Откуда брать модели, текстуры и звуки.
// На сайте index.html задаёт window.__ASSET_BASE__ — адрес быстрой сети доставки (см. scripts/cdn-index.mjs);
// при разработке и если его нет — файлы лежат рядом с игрой.
export const ASSET_BASE = (typeof window !== 'undefined' && window.__ASSET_BASE__) || import.meta.env.BASE_URL;

// true, если файлы идут со стороннего адреса (тогда при сбое можно перезапуститься с локальными)
export const USING_CDN = /^https?:/.test(ASSET_BASE);
