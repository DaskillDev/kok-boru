import { defineConfig } from 'vite';

export default defineConfig({
  // host: true — игра доступна с телефона в той же Wi-Fi сети (адрес печатается при запуске)
  server: { port: 5173, host: true },
});
