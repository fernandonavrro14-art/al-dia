// Configuración de las pruebas (solo desarrollo; la app no usa nada de esto).
// Correr con: npm test
const { defineConfig } = require('@playwright/test');

const PUERTO = 5176;

module.exports = defineConfig({
  testDir: './tests',
  timeout: 90000,
  workers: 1, // en computadores lentos, dos navegadores a la vez se pisan
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PUERTO}/`,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    serviceWorkers: 'block', // sin caché entre pruebas
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
  },
  webServer: {
    command: `node tests/servidor.js ${PUERTO}`,
    url: `http://127.0.0.1:${PUERTO}/`,
    reuseExistingServer: false,
    timeout: 180000,
  },
});
