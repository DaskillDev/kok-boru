import { defineConfig } from 'vite';

export default defineConfig({
  // относительные пути: собранная игра работает и в корне сайта, и в подпапке (GitHub Pages, любой хостинг)
  base: './',
  // host: true — игра доступна с телефона в той же Wi-Fi сети (адрес печатается при запуске)
  server: { port: 5173, host: true },
});
