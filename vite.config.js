import { defineConfig } from 'vite';

// метка сборки: по ней видно, какая версия игры открыта на телефоне (страница могла взяться из кэша)
const d = new Date();
const two = (n) => String(n).padStart(2, '0');
const BUILD = `${two(d.getDate())}.${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`;

export default defineConfig({
  define: { __BUILD__: JSON.stringify(BUILD) },
  // относительные пути: собранная игра работает и в корне сайта, и в подпапке (GitHub Pages, любой хостинг)
  base: './',
  // host: true — игра доступна с телефона в той же Wi-Fi сети (адрес печатается при запуске)
  server: { port: 5173, host: true },
});
