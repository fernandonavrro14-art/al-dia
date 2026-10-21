# Al día

Tu check-in diario. Al final del día la app te pregunta, una por una, si hiciste cada actividad (entrenamiento, alimentación, descanso y lo que agregues), y durante el día anotas tus tareas.

- HTML, CSS y JavaScript sin frameworks ni build.
- Los datos viven solo en el navegador del teléfono (`localStorage`, clave `aldia:v1`). Nada se sube a ningún lado.
- Funciona sin internet una vez instalada.

Dirección: **https://fernandonavrro14-art.github.io/al-dia/**

## Uso diario

- **Mi día:** las actividades de hoy por categoría. Tocar una cambia Sí ↔ No; las hechas se ven tachadas. Flechas para ir a otros días (los futuros se ven, pero no se responden).
- **+ Tarea:** el botón verde anota una tarea para hoy, mañana u otro día, con hora opcional. Escribe y aprieta Enter. Si marcas **Agregar a Google Calendar**, se abre Calendar con el evento listo para guardar y te avisa a esa hora.
- **Check-in:** una pregunta a la vez con Sí / No, nota opcional y resultado por categoría. Desde las 19:00, si falta responder, la app lo abre sola. En el computador responde con las teclas S y N.
- **Semana:** tabla con ✓, ✕, punto gris (sin responder) y totales. Tocar un día lo abre en Mi día.
- **Actividades:** crear, editar, pausar, borrar y ordenar actividades y categorías. Pueden ser diarias, de ciertos días (con detalle distinto por día, como la rutina de entrenamiento) o de una sola fecha, y tener hora. **Agregar a Google Calendar** crea el evento con su repetición. Pausar y borrar rigen desde hoy: el historial no se pierde.
- **Avance:** racha de días con el check-in completo, últimos 14 días, % de cumplimiento por categoría, descarga en CSV y respaldo JSON (descargar y restaurar).

## Instalar en el celular

- **Android (Chrome):** abre la dirección, menú ⋮ → **Instalar app**. Si mantienes apretado el ícono aparecen **Hacer el check-in** y **Agregar tarea**.
- **iPhone (Safari):** botón Compartir → **Agregar a inicio**.

## Archivos

| Archivo | Para qué |
|---|---|
| `index.html`, `styles.css`, `app.js` | La app |
| `sw.js` | Service worker: offline y aviso de versión nueva. Solo toca cachés `aldia-*` (comparte el sitio github.io con Mis Lucas) |
| `manifest.json` + `icons/` | Instalación, ícono y atajos |
| `herramientas/iconos.js` | Genera los PNG desde `icons/icon.svg` (`node herramientas/iconos.js`) |
| `tests/`, `playwright.config.js`, `package.json` | Pruebas automáticas (solo desarrollo) |

## Probar en el computador

```bash
python -m http.server 5176
```

Abre http://localhost:5176.

## Pruebas automáticas

Necesitas [Node.js](https://nodejs.org). La primera vez: `npm install` y `npm run test:instalar`. Después: `npm test`.

## Publicar una versión nueva

1. Sube `VERSION` en `sw.js` (y suma a `SHELL` cualquier archivo nuevo).
2. `git push` a `main`. GitHub Pages publica en 1 a 2 minutos.
3. En el teléfono aparece **"Hay una versión nueva de Al día"**: toca **Actualizar**.
