// Pruebas de Al día (check-in diario por preguntas).
// Correr con: npm test
const { test, expect } = require('@playwright/test');

const KEY = 'aldia:v1';
// Lunes 19 de octubre de 2026, 15:00 en Santiago (antes de la hora en que el check-in se abre solo).
const LUNES = new Date('2026-10-19T15:00:00-03:00');

/** Abre la app en una fecha fija, con datos dados (o vacía) una sola vez por prueba. */
async function abrir(page, { ahora = LUNES, datos = null, crudo = null } = {}) {
  await page.clock.setFixedTime(ahora);
  await page.addInitScript(([key, d, c]) => {
    if (sessionStorage.getItem('__prueba')) return;
    sessionStorage.setItem('__prueba', '1');
    localStorage.clear();
    if (d) localStorage.setItem(key, JSON.stringify(d));
    if (c) localStorage.setItem(key, c);
  }, [KEY, datos, crudo]);
  await page.goto('/');
}

const estado = (page) => page.evaluate(() => JSON.parse(JSON.stringify(S)));
const responder = (page, valor) => page.click(`[data-action="ck-responder"][data-valor="${valor}"]`);

test('la pregunta de entrenamiento sigue la rutina de cada día', async ({ page }) => {
  await abrir(page);
  await page.click('#btn-checkin');
  await expect(page.locator('#ck-pregunta')).toHaveText('¿Entrenaste pecho, tríceps y hombro hoy?');
  await page.click('[data-action="ck-cerrar"]');

  // Martes: descanso.
  await page.click('[data-action="dia-sig"]');
  await expect(page.locator('#dia-semana')).toHaveText('Mañana, martes');
  const preguntas = await page.evaluate(() => actividadesDe('2026-10-20').map((a) => pregunta(a, '2026-10-20')));
  expect(preguntas[0]).toBe('Tocaba descanso: ¿descansaste el martes 20?');
  // Viernes: cardio. Domingo: descanso y planificación.
  const viernes = await page.evaluate(() => actividadesDe('2026-10-23').map((a) => a.id));
  expect(viernes).toEqual(['entreno', 'plan', 'agua', 'dormir']);
  const domingo = await page.evaluate(() => detalle(actividadesDe('2026-10-25')[0], '2026-10-25').detalle);
  expect(domingo).toBe('Descanso y planificación');
});

test('check-in completo: resultado, nota, tachado y sigue ahí al recargar', async ({ page }) => {
  await abrir(page);
  await page.click('#btn-checkin');
  await expect(page.locator('#ck-cuenta')).toHaveText('1 de 4');
  await responder(page, 'si');
  await responder(page, 'si');
  await responder(page, 'no');
  await page.click('[data-action="ck-atras"]');
  await expect(page.locator('#ck-pregunta')).toHaveText('¿Te hidrataste bien durante el día?');
  await expect(page.locator('.ck-no')).toHaveClass(/is-previa/);
  await responder(page, 'no');
  await responder(page, 'si');
  await page.fill('#ck-nota', 'Me faltó agua en la tarde.');
  await page.click('[data-action="ck-nota"]');
  await expect(page.locator('.ck-total strong')).toHaveText('3 de 4');
  await expect(page.locator('.ck-cats li')).toHaveCount(3);
  await page.click('.ck-respuestas [data-action="ck-cerrar"]');

  await expect(page.locator('#checkin')).toBeHidden();
  await expect(page.locator('.item.is-si')).toHaveCount(3);
  await expect(page.locator('.item.is-no')).toHaveCount(1);
  await expect(page.locator('#dia-resumen')).toHaveText('3 de 4 hechas.');
  await expect(page.locator('.nota-texto')).toHaveText('Me faltó agua en la tarde.');
  await expect(page.locator('#btn-checkin')).toHaveText('Responder de nuevo');

  await page.reload();
  await expect(page.locator('.item.is-si')).toHaveCount(3);
  await expect(page.locator('.nota-texto')).toHaveText('Me faltó agua en la tarde.');
});

test('el check-in a medias sigue desde la primera sin responder; Escape lo cierra', async ({ page }) => {
  await abrir(page);
  await page.click('#btn-checkin');
  await responder(page, 'si');
  await page.keyboard.press('Escape');
  await expect(page.locator('#checkin')).toBeHidden();
  await expect(page.locator('#btn-checkin')).toHaveText('Seguir el check-in');
  await expect(page.locator('#btn-checkin')).toBeFocused();
  await page.click('#btn-checkin');
  await expect(page.locator('#ck-cuenta')).toHaveText('2 de 4');
  // Atajos de teclado: S y N.
  await page.keyboard.press('n');
  await expect(page.locator('#ck-cuenta')).toHaveText('3 de 4');
  expect((await estado(page)).entries['2026-10-19'].respuestas).toEqual({ entreno: true, plan: false });
});

test('en "Mi día" tocar una actividad cambia Sí ↔ No', async ({ page }) => {
  await abrir(page);
  const item = page.locator('.item[data-id="plan"]');
  await item.click();
  await expect(item).toHaveClass(/is-si/);
  await expect(page.locator('#dia-resumen')).toHaveText('1 de 4 hechas, faltan 3 por responder.');
  await page.locator('.item[data-id="plan"]').click();
  await expect(page.locator('.item[data-id="plan"]')).toHaveClass(/is-no/);
  await page.locator('.item[data-id="plan"]').click();
  await expect(page.locator('.item[data-id="plan"]')).toHaveClass(/is-si/);
});

test('los días futuros se ven pero no se responden', async ({ page }) => {
  await abrir(page);
  await page.click('[data-action="dia-sig"]');
  await expect(page.locator('#btn-checkin')).toBeHidden();
  await expect(page.locator('.item').first()).toBeDisabled();
  await expect(page.locator('#dia-resumen')).toContainText('todavía no llega');
  await page.click('#btn-dia-hoy');
  await expect(page.locator('#dia-semana')).toHaveText('Hoy, lunes');
});

test('tabla semanal: ✓, ✕, totales, filtro y tocar un día abre "Mi día"', async ({ page }) => {
  const datos = await (async () => {
    await abrir(page);
    return estado(page);
  })();
  datos.entries = {
    '2026-10-13': { respuestas: { 'descanso-activo': true, plan: true, agua: false, dormir: true }, nota: '' },
    '2026-10-19': { respuestas: { entreno: true, plan: true, agua: false, dormir: true }, nota: '' },
  };
  await page.evaluate(([k, d]) => { localStorage.setItem(k, JSON.stringify(d)); }, [KEY, datos]);
  await page.goto('/#semana');
  await page.reload();

  await expect(page.locator('#sem-titulo')).toHaveText('Esta semana');
  await expect(page.locator('#sem-rango')).toHaveText('19 al 25 de octubre');
  const fila = (nombre) => page.locator('.tabla tbody tr', { has: page.locator(`th:text-is("${nombre}")`) });
  await expect(fila('Comer según mi plan').locator('td').nth(0).locator('.c-si')).toHaveCount(1);
  await expect(fila('Hidratación').locator('td').nth(0).locator('.c-no')).toHaveCount(1);
  await expect(fila('Hidratación').locator('td').nth(1).locator('.c-futuro')).toHaveCount(1);
  // El entrenamiento no aplica el martes: celda vacía.
  await expect(fila('Entrenamiento del día').locator('td').nth(1)).toBeEmpty();
  await expect(page.locator('.tabla tfoot td').nth(0)).toHaveText('3/4');

  await page.click('[data-action="filtro"][data-cat="alimentacion"]');
  await expect(page.locator('.tabla tbody th[scope="row"]')).toHaveText(['Comer según mi plan', 'Hidratación']);
  await expect(page.locator('.tabla tfoot td').nth(0)).toHaveText('1/2');
  await page.click('[data-action="filtro"][data-cat=""]');

  // Semana anterior y vuelta.
  await page.click('[data-action="sem-prev"]');
  await expect(page.locator('#sem-rango')).toHaveText('12 al 18 de octubre');
  await expect(page.locator('.tabla tfoot td').nth(1)).toHaveText('3/4');
  await expect(page.locator('.tabla tfoot td').nth(0)).toHaveText('0/4');

  // Tocar el miércoles 14 abre "Mi día" para completarlo.
  await page.click('[data-action="ir-dia"][data-fecha="2026-10-14"]');
  await expect(page.locator('#view-dia')).toBeVisible();
  await expect(page.locator('#dia-titulo')).toHaveText('14 de octubre');
  await expect(page.locator('#dia-semana')).toHaveText('Hace 5 días, miércoles');
  await page.click('#btn-checkin');
  await expect(page.locator('#ck-pregunta')).toHaveText('¿Entrenaste espalda, bíceps y hombro el miércoles 14?');
  await responder(page, 'si');
  await page.keyboard.press('Escape');

  // Al volver, la tabla sigue en la semana que estaba mirando.
  await page.click('a[data-tab="semana"]');
  await expect(page.locator('#sem-rango')).toHaveText('12 al 18 de octubre');
  await expect(page.locator('.tabla tbody tr').nth(1).locator('td').nth(2).locator('.c-si')).toHaveCount(1);
  await page.click('[data-action="sem-hoy"]');
  await expect(page.locator('#sem-rango')).toHaveText('19 al 25 de octubre');
});

test('una actividad borrada sigue en el historial de días anteriores', async ({ page }) => {
  await abrir(page);
  await page.evaluate(() => {
    S.entries['2026-10-15'] = { respuestas: { agua: true }, nota: '' };
    S.activities.find((a) => a.id === 'agua').borrada = '2026-10-17';
    guardar();
  });
  const ids = await page.evaluate(() => [actividadesDe('2026-10-15').map((a) => a.id), actividadesDe('2026-10-19').map((a) => a.id)]);
  expect(ids[0]).toContain('agua');
  expect(ids[1]).not.toContain('agua');
});

test('a medianoche de Santiago "hoy" pasa al día siguiente', async ({ page }) => {
  await abrir(page, { ahora: new Date('2026-10-19T23:59:50-03:00') });
  await page.keyboard.press('Escape'); // de noche se abre el check-in solo
  await expect(page.locator('#dia-semana')).toHaveText('Hoy, lunes');
  await page.clock.setFixedTime(new Date('2026-10-20T00:00:30-03:00'));
  await page.evaluate(() => revisarCambioDeDia());
  await expect(page.locator('#dia-semana')).toHaveText('Hoy, martes');
});

/* ---------- Fase 2: actividades personalizadas ---------- */

const ids = (page, fecha) => page.evaluate((f) => actividadesDe(f).map((a) => a.nombre), fecha);

async function guardarHoja(page) {
  await page.click('#hoja-form [type="submit"]');
  await expect(page.locator('#hoja')).toBeHidden();
}

test('crear una categoría con su color', async ({ page }) => {
  await abrir(page);
  await page.click('a[data-tab="actividades"]');
  await page.click('[data-action="nueva-cat"]');
  await expect(page.locator('#hoja-form [name="nombre"]')).toBeFocused();
  await page.click('#hoja-form [type="submit"]');
  await expect(page.locator('#form-error')).toHaveText('Escribe un nombre.');
  await page.fill('#hoja-form [name="nombre"]', 'Estudios');
  await page.check('#hoja-form [name="color"][value="#D2577A"]');
  await guardarHoja(page);
  await expect(page.locator('#toast')).toHaveText('Categoría creada.');
  await expect(page.locator('#act-lista .grupo-titulo')).toHaveText(['Entrenamiento', 'Alimentación', 'Bienestar', 'Estudios']);
  const cat = (await estado(page)).categories.find((c) => c.nombre === 'Estudios');
  expect(cat.color).toBe('#D2577A');
});

test('actividad diaria, de ciertos días y de una sola fecha aparecen solo cuando corresponde', async ({ page }) => {
  await abrir(page);
  await page.click('a[data-tab="actividades"]');

  // Diaria, con pregunta automática.
  await page.click('[data-action="nueva-act"]');
  await page.fill('#hoja-form [name="nombre"]', 'Leer 20 minutos');
  await expect(page.locator('#campo-pregunta')).toHaveAttribute('placeholder', '¿Hiciste leer 20 minutos hoy?');
  await page.check('#hoja-form [name="categoryId"][value="bienestar"]');
  await guardarHoja(page);

  // Ciertos días, con detalle distinto el lunes.
  await page.click('[data-action="nueva-act"]');
  await page.fill('#hoja-form [name="nombre"]', 'Estudiar Big Data');
  await page.check('#hoja-form [name="tipo"][value="weekdays"]');
  await page.click('#hoja-form [type="submit"]');
  await expect(page.locator('#form-error')).toHaveText('Elige al menos un día.');
  await page.check('#hoja-form [name="dia"][value="0"]');
  await page.check('#hoja-form [name="dia"][value="2"]');
  await page.click('.por-dia summary');
  await page.fill('#hoja-form [name="det-0"]', 'Unidad 3: Spark');
  await guardarHoja(page);

  // Una sola fecha: el jueves.
  await page.click('[data-action="nueva-act"]');
  await page.fill('#hoja-form [name="nombre"]', 'Entregar informe');
  await page.check('#hoja-form [name="tipo"][value="once"]');
  await page.fill('#hoja-form [name="fecha"]', '2026-10-22');
  await page.fill('#campo-pregunta', '¿Entregaste el informe hoy?');
  await guardarHoja(page);

  await expect(page.locator('#act-lista .act-btn', { hasText: 'Estudiar Big Data' })).toContainText('Lu, Mi');
  await expect(page.locator('#act-lista .act-btn', { hasText: 'Entregar informe' })).toContainText('Solo el jueves 22 de octubre');

  expect(await ids(page, '2026-10-19')).toEqual(expect.arrayContaining(['Leer 20 minutos', 'Estudiar Big Data']));
  expect(await ids(page, '2026-10-19')).not.toContain('Entregar informe');
  expect(await ids(page, '2026-10-20')).not.toContain('Estudiar Big Data');
  expect(await ids(page, '2026-10-22')).toEqual(expect.arrayContaining(['Leer 20 minutos', 'Entregar informe']));
  expect(await ids(page, '2026-10-23')).not.toContain('Entregar informe');

  // En "Mi día" y en el check-in funcionan igual que las precargadas.
  await page.click('a[data-tab="dia"]');
  await expect(page.locator('.item', { hasText: 'Unidad 3: Spark' })).toContainText('Estudiar Big Data');
  await page.click('#btn-checkin');
  const preguntas = [];
  for (let i = 0; i < 6; i++) {
    preguntas.push(await page.locator('#ck-pregunta').textContent());
    await responder(page, 'si');
  }
  expect(preguntas).toContain('¿Hiciste estudiar Big Data hoy?');
  expect(preguntas).toContain('¿Hiciste leer 20 minutos hoy?');
  await page.click('[data-action="ck-omitir"]');
  await expect(page.locator('.ck-total strong')).toHaveText('6 de 6');

  // La tarea del jueves aparece en la tabla solo ese día.
  await page.click('.ck-respuestas [data-action="ck-cerrar"]');
  await page.click('a[data-tab="semana"]');
  const fila = page.locator('.tabla tbody tr', { has: page.locator('th:text-is("Entregar informe")') });
  await expect(fila.locator('.c')).toHaveCount(1);
  await expect(fila.locator('td').nth(3).locator('.c-futuro')).toHaveCount(1);
});

/** Google Calendar se abre en otra pestaña: se intercepta para no salir a internet. */
async function esperarCalendar(page, accion) {
  await page.context().route('https://calendar.google.com/**', (r) => r.fulfill({ body: 'ok' }));
  const [pestana] = await Promise.all([page.context().waitForEvent('page'), accion()]);
  const url = new URL(pestana.url());
  await pestana.close();
  return Object.fromEntries(url.searchParams);
}

test('botón "+ Tarea": anotar con Enter, para mañana y con hora', async ({ page }) => {
  await abrir(page);
  await page.click('#btn-tarea');
  await expect(page.locator('#hoja-titulo')).toHaveText('Nueva tarea');
  await expect(page.locator('#hoja-form [name="nombre"]')).toBeFocused();
  await page.fill('#hoja-form [name="nombre"]', 'Comprar proteína');
  await page.press('#hoja-form [name="nombre"]', 'Enter');
  await expect(page.locator('#hoja')).toBeHidden();
  await expect(page.locator('#toast')).toHaveText('Tarea agregada.');
  await expect(page.locator('#dia-lista .grupo', { hasText: 'Tareas' }).locator('.item')).toHaveText(/Comprar proteína/);
  await page.locator('.item', { hasText: 'Comprar proteína' }).click();
  await expect(page.locator('.item', { hasText: 'Comprar proteína' })).toHaveClass(/is-si/);

  // Para mañana a las 18:30: no aparece hoy, sí mañana con su hora.
  await page.click('#btn-tarea');
  await page.fill('#hoja-form [name="nombre"]', 'Pagar la luz');
  await page.check('#hoja-form [name="cuando"][value="manana"]');
  await page.fill('#hoja-form [name="hora"]', '18:30');
  await page.click('#hoja-form [type="submit"]');
  await expect(page.locator('#toast')).toHaveText('Tarea agregada para el martes 20.');
  await expect(page.locator('.item', { hasText: 'Pagar la luz' })).toHaveCount(0);
  await page.click('[data-action="dia-sig"]');
  await expect(page.locator('.item', { hasText: 'Pagar la luz' }).locator('.item-sub')).toHaveText('18:30');
  await expect(page.locator('.item', { hasText: 'Comprar proteína' })).toHaveCount(0);

  // Otro día: la fecha no puede ser pasada.
  await page.click('#btn-tarea');
  await page.fill('#hoja-form [name="nombre"]', 'Algo');
  await page.check('#hoja-form [name="cuando"][value="otro"]');
  await expect(page.locator('#hoja-form [name="fecha"]')).toHaveValue('2026-10-21');
  await page.fill('#hoja-form [name="fecha"]', '2026-10-01');
  await page.click('#hoja-form [type="submit"]');
  await expect(page.locator('#form-error')).toHaveText('Elige hoy o un día que viene.');
  await page.keyboard.press('Escape');

  // Desde un día pasado, el botón propone hoy. Y solo se ve en "Mi día".
  await page.click('[data-action="dia-prev"]');
  await page.click('[data-action="dia-prev"]');
  await page.click('#btn-tarea');
  await expect(page.locator('#hoja-form [name="cuando"][value="hoy"]')).toBeChecked();
  await page.keyboard.press('Escape');
  await page.click('a[data-tab="semana"]');
  await expect(page.locator('#btn-tarea')).toBeHidden();
});

test('Google Calendar: tarea con hora y actividad que se repite', async ({ page }) => {
  await abrir(page);
  await page.click('#btn-tarea');
  await page.fill('#hoja-form [name="nombre"]', 'Dentista');
  await page.fill('#hoja-form [name="hora"]', '18:30');
  await page.check('#hoja-form [name="calendar"]');
  const tarea = await esperarCalendar(page, () => page.click('#hoja-form [type="submit"]'));
  expect(tarea).toMatchObject({ action: 'TEMPLATE', text: 'Dentista', dates: '20261019T183000/20261019T190000', ctz: 'America/Santiago' });
  expect(tarea.recur).toBeUndefined();
  // La casilla queda marcada para la próxima tarea.
  await page.click('#btn-tarea');
  await expect(page.locator('#hoja-form [name="calendar"]')).toBeChecked();
  await page.keyboard.press('Escape');

  // Entrenamiento a las 19:00 los lunes, miércoles, jueves y viernes.
  await page.click('a[data-tab="actividades"]');
  await page.click('[data-action="editar-act"][data-id="entreno"]');
  await page.fill('#hoja-form [name="hora"]', '19:00');
  const rutina = await esperarCalendar(page, () => page.click('[data-action="act-calendar"]'));
  expect(rutina).toMatchObject({ text: 'Entrenamiento del día', dates: '20261019T190000/20261019T193000', recur: 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,TH,FR' });
  await guardarHoja(page);
  expect((await estado(page)).activities.find((a) => a.id === 'entreno').hora).toBe('19:00');
  // Sin hora queda como evento de todo el día; las diarias se repiten cada día.
  await page.click('[data-action="editar-act"][data-id="agua"]');
  const diaria = await esperarCalendar(page, () => page.click('[data-action="act-calendar"]'));
  expect(diaria).toMatchObject({ dates: '20261019/20261020', recur: 'RRULE:FREQ=DAILY' });
});

test('de noche, si falta responder, la app abre directo el check-in', async ({ page }) => {
  await abrir(page, { ahora: new Date('2026-10-19T21:00:00-03:00') });
  await expect(page.locator('#checkin')).toBeVisible();
  await expect(page.locator('#ck-cuenta')).toHaveText('1 de 4');
  await page.keyboard.press('Escape');
  // Una sola vez: volver a la app no lo abre de nuevo.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#checkin')).toBeHidden();
  // Con todo respondido, no se abre.
  await page.evaluate(() => { for (const a of actividadesDe('2026-10-19')) responder('2026-10-19', a.id, true); });
  await page.reload();
  await expect(page.locator('#checkin')).toBeHidden();
});

test('a las 15:00 no se abre solo', async ({ page }) => {
  await abrir(page);
  await expect(page.locator('#view-dia')).toBeVisible();
  await expect(page.locator('#checkin')).toBeHidden();
});

test('atajos del ícono: ?abrir=tarea y ?abrir=checkin', async ({ page }) => {
  await abrir(page);
  await page.goto('/?abrir=tarea');
  await expect(page.locator('#hoja-titulo')).toHaveText('Nueva tarea');
  await expect(page.locator('#hoja-form [name="nombre"]')).toBeFocused();
  expect(new URL(page.url()).search).toBe('');
  await page.goto('/?abrir=checkin');
  await expect(page.locator('#checkin')).toBeVisible();
  await expect(page.locator('#ck-pregunta')).toHaveText('¿Entrenaste pecho, tríceps y hombro hoy?');
  const manifest = await page.evaluate(async () => (await fetch('manifest.json')).json());
  expect(manifest.shortcuts.map((s) => s.url)).toEqual(['./?abrir=checkin', './?abrir=tarea']);
});

test('editar, pausar y borrar mantiene el historial de días anteriores', async ({ page }) => {
  await abrir(page);
  await page.evaluate(() => {
    S.entries['2026-10-15'] = { respuestas: { plan: true, agua: false, dormir: true }, nota: '' };
    guardar();
  });
  await page.click('a[data-tab="actividades"]');

  // Editar el nombre: el historial lo muestra con el nombre nuevo y la misma respuesta.
  await page.click('[data-action="editar-act"][data-id="plan"]');
  await expect(page.locator('#hoja-titulo')).toHaveText('Editar actividad');
  await page.fill('#hoja-form [name="nombre"]', 'Comer limpio');
  await guardarHoja(page);
  expect(await ids(page, '2026-10-15')).toContain('Comer limpio');
  expect((await estado(page)).entries['2026-10-15'].respuestas.plan).toBe(true);

  // Pausar: deja de aparecer desde hoy, pero no antes.
  await page.click('[data-action="editar-act"][data-id="agua"]');
  await page.click('[data-action="act-pausar"]');
  await expect(page.locator('#act-lista .act-btn', { hasText: 'Hidratación' })).toContainText('En pausa');
  expect(await ids(page, '2026-10-19')).not.toContain('Hidratación');
  expect(await ids(page, '2026-10-15')).toContain('Hidratación');
  await page.click('[data-action="editar-act"][data-id="agua"]');
  await expect(page.locator('[data-action="act-pausar"]')).toHaveText('Reanudar');
  await page.click('[data-action="act-pausar"]');
  expect(await ids(page, '2026-10-19')).toContain('Hidratación');

  // Borrar pide confirmación dentro de la app; Cancelar no borra.
  await page.click('[data-action="editar-act"][data-id="dormir"]');
  await page.click('[data-action="act-borrar"]');
  await expect(page.locator('#conf-titulo')).toHaveText('¿Borrar «Descanso»?');
  await page.click('[data-action="conf-no"]');
  await expect(page.locator('#confirmar')).toBeHidden();
  await expect(page.locator('#hoja')).toBeVisible();
  await page.click('[data-action="act-borrar"]');
  await page.click('[data-action="conf-si"]');
  await expect(page.locator('#hoja')).toBeHidden();
  await expect(page.locator('#act-lista .act-btn', { hasText: /^Descanso$/ })).toHaveCount(0);
  expect(await ids(page, '2026-10-19')).not.toContain('Descanso');
  expect(await ids(page, '2026-10-15')).toContain('Descanso');

  // La semana pasada sigue con sus respuestas.
  await page.click('a[data-tab="semana"]');
  await page.click('[data-action="sem-prev"]');
  const fila = (n) => page.locator('.tabla tbody tr', { has: page.locator(`th:text-is("${n}")`) });
  await expect(fila('Comer limpio').locator('td').nth(3).locator('.c-si')).toHaveCount(1);
  await expect(fila('Descanso').locator('td').nth(3).locator('.c-si')).toHaveCount(1);
});

test('reordenar actividades y categorías', async ({ page }) => {
  await abrir(page);
  await page.click('a[data-tab="actividades"]');
  await page.click('[data-action="ordenar"]');
  await page.click('[data-action="bajar-act"][data-id="plan"]');
  await expect(page.locator('[data-action="subir-act"][data-id="plan"]')).toBeFocused();
  await page.click('[data-action="subir-cat"][data-id="bienestar"]');
  await page.click('[data-action="subir-cat"][data-id="bienestar"]');
  await expect(page.locator('#act-lista .grupo-titulo')).toHaveText(['Bienestar', 'Entrenamiento', 'Alimentación']);
  await page.click('[data-action="ordenar"]');
  await expect(page.locator('.orden')).toHaveCount(0);

  await page.click('a[data-tab="dia"]');
  await expect(page.locator('#dia-lista .grupo-titulo')).toHaveText(['Bienestar', 'Entrenamiento', 'Alimentación']);
  await expect(page.locator('#dia-lista .grupo', { hasText: 'Alimentación' }).locator('.item-nombre')).toHaveText(['Hidratación', 'Comer según mi plan']);
});

test('borrar una categoría saca sus actividades desde hoy, sin perder el historial', async ({ page }) => {
  await abrir(page);
  await page.evaluate(() => {
    S.entries['2026-10-14'] = { respuestas: { plan: true, agua: true }, nota: '' };
    guardar();
  });
  await page.click('a[data-tab="actividades"]');
  await page.click('[data-action="editar-cat"][data-id="alimentacion"]');
  await page.fill('#hoja-form [name="nombre"]', 'Comida');
  await guardarHoja(page);
  await page.click('[data-action="editar-cat"][data-id="alimentacion"]');
  await page.click('[data-action="cat-borrar"]');
  await expect(page.locator('#conf-texto')).toHaveText('Sus 2 actividades también dejan de aparecer desde hoy. Tu historial se mantiene.');
  await page.click('[data-action="conf-si"]');
  await expect(page.locator('#act-lista .grupo-titulo')).toHaveText(['Entrenamiento', 'Bienestar']);

  await page.click('a[data-tab="dia"]');
  await expect(page.locator('#dia-lista .grupo-titulo')).toHaveText(['Entrenamiento', 'Bienestar']);
  await page.click('a[data-tab="semana"]');
  await page.click('[data-action="sem-prev"]');
  await expect(page.locator('.cat-fila', { hasText: 'Comida' })).toHaveCount(1);
  await expect(page.locator('.tabla tfoot td').nth(2)).toHaveText('2/4');
});

test('la hoja se cierra con Escape y devuelve el foco', async ({ page }) => {
  await abrir(page);
  await page.click('a[data-tab="actividades"]');
  await page.click('[data-action="nueva-cat"]');
  await expect(page.locator('#hoja')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#hoja')).toBeHidden();
  await expect(page.locator('[data-action="nueva-cat"]')).toBeFocused();
});

/* ---------- Fase 3: avance, exportar e instalar ---------- */

/** Llena días: completos (todo Sí salvo "agua", que va en No) y el 15 a medias. */
async function historial(page) {
  await page.evaluate(() => {
    for (const d of ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-16', '2026-10-17', '2026-10-18']) {
      const r = {};
      for (const a of actividadesDe(d)) r[a.id] = a.id !== 'agua';
      S.entries[d] = { respuestas: r, nota: d === '2026-10-18' ? 'Domingo; "planificar" listo' : '' };
    }
    S.entries['2026-10-15'] = { respuestas: { plan: true }, nota: '' };
    S.inicio = '2026-10-11';
    guardar();
  });
}

test('avance: racha, últimos 14 días y cumplimiento por categoría', async ({ page }) => {
  await abrir(page);
  await historial(page);
  await page.click('a[data-tab="avance"]');
  // Hoy (lunes 19) todavía sin responder no corta la racha: 16, 17 y 18.
  await expect(page.locator('#racha')).toHaveText('Llevas 3 días seguidos con el check-in completo. Tu mejor racha: 4 días.');
  await expect(page.locator('.d14')).toHaveCount(14);
  await expect(page.locator('.d14.incompleto')).toHaveCount(2); // el 15 y hoy

  const fila = (n) => page.locator('#avance-cats li', { has: page.locator(`.ck-cats-nombre:text-is("${n}")`) });
  await expect(fila('Alimentación').locator('.ck-cats-num')).toHaveText('55 %');
  await expect(fila('Alimentación').locator('.avance-sub')).toHaveText('6 de 11 respuestas');
  await expect(fila('Entrenamiento').locator('.ck-cats-num')).toHaveText('100 %');
  await page.click('[data-action="periodo"][data-dias="0"]');
  await expect(fila('Alimentación').locator('.avance-sub')).toHaveText('8 de 15 respuestas');

  // Completar hoy alarga la racha.
  await page.evaluate(() => { for (const a of actividadesDe('2026-10-19')) responder('2026-10-19', a.id, true); });
  await page.click('[data-action="periodo"][data-dias="7"]');
  await expect(page.locator('#racha')).toHaveText('Llevas 4 días seguidos con el check-in completo.');

  // Tocar un día de la tira abre "Mi día".
  await page.click('.d14[data-fecha="2026-10-15"]');
  await expect(page.locator('#dia-titulo')).toHaveText('15 de octubre');
});

test('descargar CSV con tildes, punto y coma y la nota del día', async ({ page }) => {
  await abrir(page);
  await historial(page);
  await page.click('a[data-tab="avance"]');
  const [descarga] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="exportar-csv"]')]);
  expect(descarga.suggestedFilename()).toBe('al-dia-2026-10-19.csv');
  const texto = require('fs').readFileSync(await descarga.path(), 'utf8');
  const lineas = texto.replace(/^﻿/, '').trim().split('\r\n');
  expect(texto.charCodeAt(0)).toBe(0xFEFF);
  expect(lineas[0]).toBe('fecha;dia;categoria;actividad;detalle;respuesta;nota_del_dia');
  expect(lineas).toContain('2026-10-12;lunes;Entrenamiento;Entrenamiento del día;Pecho, tríceps y hombro;Sí;');
  expect(lineas).toContain('2026-10-12;lunes;Alimentación;Hidratación;;No;');
  expect(lineas).toContain('2026-10-18;domingo;Bienestar;Descanso;;Sí;"Domingo; ""planificar"" listo"');
});

test('el respaldo JSON se descarga y se restaura sin pérdida', async ({ page }) => {
  await abrir(page);
  await historial(page);
  await page.evaluate(() => {
    S.categories.push({ id: 'c-x', nombre: 'Estudios', color: '#D2577A', orden: 3 });
    S.activities.push(actividad({ id: 'a-x', nombre: 'Leer', categoryId: 'c-x', orden: 0, pausas: [{ desde: '2026-10-15', hasta: '2026-10-17' }] }));
    guardar();
  });
  await page.click('a[data-tab="avance"]');
  await expect(page.locator('#respaldo-texto')).toContainText('Todavía no descargas un respaldo.');
  const [descarga] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="exportar-json"]')]);
  await expect(page.locator('#respaldo-texto')).toContainText('Descargaste un respaldo hoy.');
  const archivo = await descarga.path();
  const antes = await estado(page);

  // Borrar todo y restaurar.
  await page.evaluate((k) => { localStorage.removeItem(k); }, KEY);
  await page.reload();
  await page.click('a[data-tab="avance"]');
  await page.setInputFiles('#archivo-respaldo', archivo);
  await expect(page.locator('#conf-texto')).toHaveText('Trae 6 actividades y 8 días respondidos. Reemplaza lo que tienes ahora en este navegador.');
  await page.click('[data-action="conf-si"]');
  await expect(page.locator('#toast')).toHaveText('Respaldo restaurado.');
  expect(await estado(page)).toEqual(antes);

  // Un archivo que no es respaldo no toca nada.
  await page.setInputFiles('#archivo-respaldo', { name: 'otro.json', mimeType: 'application/json', buffer: Buffer.from('{"hola":1}') });
  await expect(page.locator('#toast')).toHaveText('Ese archivo no es un respaldo de Al día.');
  expect(await estado(page)).toEqual(antes);
});

test.describe('sin internet', () => {
  test.use({ serviceWorkers: 'allow' });

  test('funciona offline y no toca la caché de Mis Lucas (comparten el sitio github.io)', async ({ page, context }) => {
    // Cachés que ya estarían en el celular: la de Mis Lucas y una versión vieja de Al día.
    await page.addInitScript(() => {
      if (sessionStorage.getItem('__cache')) return;
      sessionStorage.setItem('__cache', '1');
      caches.open('mislucas-v1.2.1');
      caches.open('aldia-v1.0.0');
    });
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    const sw = await page.evaluate(() => navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL);
    expect(sw).toMatch(/\/sw\.js$/);
    const version = await page.evaluate(async () => (await (await fetch('sw.js')).text()).match(/VERSION = '([^']+)'/)[1]);
    await expect.poll(() => page.evaluate(async () => (await caches.keys()).sort())).toEqual([`aldia-${version}`, 'mislucas-v1.2.1']);
    // El manifest y los íconos se pueden leer.
    const manifest = await page.evaluate(async () => (await fetch('manifest.json')).json());
    expect(manifest.scope).toBe('./');
    for (const i of [...manifest.icons, ...manifest.shortcuts.flatMap((s) => s.icons || [])]) {
      expect((await page.request.get(`/${i.src}`)).ok()).toBe(true);
    }

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#dia-titulo')).not.toBeEmpty();
    await expect(page.locator('.item').first()).toBeVisible();
    await context.setOffline(false);
  });
});

test('si los datos guardados no se pueden leer, se guardan aparte y no se pisan', async ({ page }) => {
  await abrir(page, { crudo: '{esto no es json' });
  await expect(page.locator('.item')).toHaveCount(4);
  const copia = await page.evaluate((k) => localStorage.getItem(`${k}:ilegible:2026-10-19`), KEY);
  expect(copia).toBe('{esto no es json');
});
