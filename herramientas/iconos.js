// Genera los PNG de Al día a partir de icons/icon.svg (solo desarrollo).
// Uso: node herramientas/iconos.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const DIR = path.join(__dirname, '..', 'icons');
const VERDE = '#1E8A57';

const svg = fs.readFileSync(path.join(DIR, 'icon.svg'), 'utf8');
// Sin esquinas redondeadas: Android (maskable) e iPhone recortan solos.
const cuadrado = svg.replace(' rx="112"', '');
// Maskable: el dibujo debe caber en el 80 % central.
const maskable = cuadrado.replace('<path', '<g transform="translate(256 256) scale(0.82) translate(-256 -256)"><path').replace('/>\n</svg>', '/></g>\n</svg>');
// Atajos del ícono (Android los muestra en un círculo): check y "+".
const atajo = (trazo) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="${VERDE}"/>
  <path d="${trazo}" fill="none" stroke="#FFFFFF" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const hacer = async (contenido, tam, nombre) => {
    await page.setViewportSize({ width: tam, height: tam });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${tam}px;height:${tam}px}</style>${contenido}`);
    await page.screenshot({ path: path.join(DIR, nombre), omitBackground: true });
  };
  await hacer(svg, 192, 'icon-192.png');
  await hacer(svg, 512, 'icon-512.png');
  await hacer(maskable, 512, 'icon-maskable-512.png');
  await hacer(cuadrado, 180, 'apple-touch-icon.png');
  await hacer(atajo('M30 50 L43 62 L67 36'), 96, 'atajo-checkin-96.png');
  await hacer(atajo('M48 30 V66 M30 48 H66'), 96, 'atajo-tarea-96.png');
  await browser.close();
})();
