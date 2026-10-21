/* Al día: check-in diario por preguntas.
   Todo vive en este navegador (localStorage); no hay servidor ni cuentas. */
'use strict';

const KEY = 'aldia:v1';
const TZ = 'America/Santiago';
const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const DIAS_CORTOS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
const SIN_CATEGORIA = { id: '', nombre: 'Sin categoría', color: '#8A9490', orden: 999 };

const $ = (sel) => document.querySelector(sel);
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* ---------- Fechas: siempre 'AAAA-MM-DD' en hora de Santiago ---------- */

const fmtISO = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hoyISO = () => fmtISO.format(new Date());
function aFecha(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
const aISO = (f) => f.toISOString().slice(0, 10);
function sumarDias(iso, n) { const f = aFecha(iso); f.setUTCDate(f.getUTCDate() + n); return aISO(f); }
const diaSemana = (iso) => (aFecha(iso).getUTCDay() + 6) % 7; // 0 = lunes
const lunesDe = (iso) => sumarDias(iso, -diaSemana(iso));
const diasEntre = (a, b) => Math.round((aFecha(b) - aFecha(a)) / 864e5);

function fechaLarga(iso) {
  const f = aFecha(iso);
  const anio = f.getUTCFullYear() !== aFecha(hoyISO()).getUTCFullYear() ? ` de ${f.getUTCFullYear()}` : '';
  return `${cap(DIAS[diaSemana(iso)])} ${f.getUTCDate()} de ${MESES[f.getUTCMonth()]}${anio}`;
}

function relativo(iso) {
  const n = diasEntre(hoyISO(), iso);
  if (n === 0) return 'Hoy';
  if (n === -1) return 'Ayer';
  if (n === 1) return 'Mañana';
  return n < 0 ? `Hace ${-n} días` : `En ${n} días`;
}

/** Cómo nombrar el día dentro de una pregunta: "hoy", "ayer" o "el lunes 20". */
function cuandoEnPregunta(iso) {
  const n = diasEntre(hoyISO(), iso);
  if (n === 0) return 'hoy';
  if (n === -1) return 'ayer';
  return `el ${DIAS[diaSemana(iso)]} ${aFecha(iso).getUTCDate()}`;
}

/* ---------- Datos ---------- */

function actividad(campos) {
  return { pregunta: '', tipo: 'daily', dias: [], fecha: null, hora: '', activa: true, pausas: [], borrada: null, ...campos };
}

function datosIniciales() {
  return {
    version: 1,
    inicio: hoyISO(),
    categories: [
      { id: 'entrenamiento', nombre: 'Entrenamiento', color: '#3B6FD6', orden: 0 },
      { id: 'alimentacion', nombre: 'Alimentación', color: '#D08A1E', orden: 1 },
      { id: 'bienestar', nombre: 'Bienestar', color: '#8A5CC7', orden: 2 },
    ],
    activities: [
      actividad({
        id: 'entreno', nombre: 'Entrenamiento del día', categoryId: 'entrenamiento', orden: 0,
        tipo: 'weekdays', dias: [0, 2, 3, 4],
        // La rutina cambia según el día: el detalle y la pregunta salen de aquí.
        porDia: {
          0: { detalle: 'Pecho, tríceps y hombro', pregunta: '¿Entrenaste pecho, tríceps y hombro hoy?' },
          2: { detalle: 'Espalda, bíceps y hombro', pregunta: '¿Entrenaste espalda, bíceps y hombro hoy?' },
          3: { detalle: 'Piernas y abdominales', pregunta: '¿Entrenaste piernas y abdominales hoy?' },
          4: { detalle: 'Cardio (caminata larga o trote)', pregunta: '¿Hiciste cardio hoy (caminata larga o trote)?' },
        },
      }),
      actividad({
        id: 'descanso-activo', nombre: 'Descanso activo', categoryId: 'entrenamiento', orden: 1,
        tipo: 'weekdays', dias: [1, 5, 6], pregunta: 'Tocaba descanso: ¿descansaste hoy?',
        porDia: { 6: { detalle: 'Descanso y planificación', pregunta: 'Tocaba descanso: ¿descansaste hoy?' } },
      }),
      actividad({ id: 'plan', nombre: 'Comer según mi plan', categoryId: 'alimentacion', orden: 0, pregunta: '¿Comiste según tu plan hoy?' }),
      actividad({ id: 'agua', nombre: 'Hidratación', categoryId: 'alimentacion', orden: 1, pregunta: '¿Te hidrataste bien durante el día?' }),
      actividad({ id: 'dormir', nombre: 'Descanso', categoryId: 'bienestar', orden: 0, pregunta: '¿Dormiste y descansaste bien?' }),
    ],
    entries: {},
  };
}

function normalizar(d) {
  const base = datosIniciales();
  if (!d || typeof d !== 'object') return base;
  return {
    version: 1,
    inicio: d.inicio || base.inicio,
    categories: Array.isArray(d.categories) ? d.categories : base.categories,
    activities: Array.isArray(d.activities) ? d.activities.map(actividad) : base.activities,
    entries: d.entries && typeof d.entries === 'object' ? d.entries : {},
    ultimoRespaldo: d.ultimoRespaldo || null,
  };
}

function cargar() {
  let crudo = null;
  try { crudo = localStorage.getItem(KEY); } catch { return datosIniciales(); }
  if (!crudo) return datosIniciales();
  try {
    return normalizar(JSON.parse(crudo));
  } catch {
    // Nunca pisar datos que no se pudieron leer: se guardan aparte.
    try { localStorage.setItem(`${KEY}:ilegible:${hoyISO()}`, crudo); } catch { /* sin espacio */ }
    return datosIniciales();
  }
}

let S = cargar();

function guardar() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch {
    toast('No se pudo guardar. Revisa si el navegador tiene espacio.');
  }
}

/* ---------- Actividades y respuestas ---------- */

const categoria = (id) => S.categories.find((c) => c.id === id) || SIN_CATEGORIA;
const estaPausada = (a, fecha) => (a.pausas || []).some((p) => fecha >= p.desde && (!p.hasta || fecha < p.hasta));

function aplica(a, fecha) {
  if (a.borrada && fecha >= a.borrada) return false;
  if (estaPausada(a, fecha)) return false;
  if (a.tipo === 'weekdays') return a.dias.includes(diaSemana(fecha));
  if (a.tipo === 'once') return a.fecha === fecha;
  return true;
}

const respuestas = (fecha) => (S.entries[fecha] && S.entries[fecha].respuestas) || {};
function respuesta(fecha, id) {
  const r = respuestas(fecha)[id];
  return typeof r === 'boolean' ? r : null;
}

function ordenar(lista) {
  return [...lista].sort((a, b) => categoria(a.categoryId).orden - categoria(b.categoryId).orden
    || categoria(a.categoryId).nombre.localeCompare(categoria(b.categoryId).nombre)
    || a.orden - b.orden);
}

/** Lo que toca ese día, más lo que ya respondí ese día aunque después la haya cambiado o borrado. */
function actividadesDe(fecha) {
  const r = respuestas(fecha);
  return ordenar(S.activities.filter((a) => aplica(a, fecha) || a.id in r));
}

const detalle = (a, fecha) => (a.porDia && a.porDia[diaSemana(fecha)]) || null;

function pregunta(a, fecha) {
  const base = (detalle(a, fecha) && detalle(a, fecha).pregunta) || a.pregunta
    || `¿Hiciste ${a.nombre.charAt(0).toLowerCase()}${a.nombre.slice(1)} hoy?`;
  return base.replace(/\bhoy\b/, cuandoEnPregunta(fecha));
}

function responder(fecha, id, valor) {
  if (fecha > hoyISO()) return;
  const e = S.entries[fecha] || (S.entries[fecha] = { respuestas: {}, nota: '' });
  e.respuestas[id] = valor;
  guardar();
}

function guardarNota(fecha, texto) {
  const limpio = texto.trim();
  const e = S.entries[fecha];
  if (!e && !limpio) return;
  (e || (S.entries[fecha] = { respuestas: {}, nota: '' })).nota = limpio;
  guardar();
}

/** Agrupa por categoría, respetando el orden. */
function agrupar(lista) {
  const grupos = [];
  for (const a of lista) {
    const cat = categoria(a.categoryId);
    let g = grupos[grupos.length - 1];
    if (!g || g.cat !== cat) grupos.push(g = { cat, items: [] });
    g.items.push(a);
  }
  return grupos;
}

function conteo(fecha, lista = actividadesDe(fecha)) {
  let si = 0; let respondidas = 0;
  for (const a of lista) {
    const r = respuesta(fecha, a.id);
    if (r !== null) respondidas++;
    if (r === true) si++;
  }
  return { si, respondidas, total: lista.length };
}

/* ---------- Estado de la interfaz ---------- */

let diaActual = hoyISO();
let semanaActual = lunesDe(diaActual);
let filtroCat = '';
let editandoNota = false;
let animar = null; // id de la actividad recién tachada

/* ---------- Mi día ---------- */

const ICONO_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICONO_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';

function renderDia() {
  const fecha = diaActual;
  const hoy = hoyISO();
  const futuro = fecha > hoy;
  const lista = actividadesDe(fecha);
  const { si, respondidas, total } = conteo(fecha, lista);

  const f = aFecha(fecha);
  const anio = f.getUTCFullYear() !== aFecha(hoy).getUTCFullYear() ? ` de ${f.getUTCFullYear()}` : '';
  $('#dia-semana').textContent = `${relativo(fecha)}, ${DIAS[diaSemana(fecha)]}`;
  $('#dia-titulo').textContent = `${f.getUTCDate()} de ${MESES[f.getUTCMonth()]}${anio}`;
  $('#btn-dia-hoy').hidden = fecha === hoy;

  $('#dia-tira').innerHTML = lista.map((a) => {
    const r = respuesta(fecha, a.id);
    return `<i class="${r === true ? 'si' : r === false ? 'no' : ''}" style="--cat:${categoria(a.categoryId).color}"></i>`;
  }).join('');

  let resumen;
  if (!total) resumen = 'No hay actividades para este día.';
  else if (futuro) resumen = `Este día todavía no llega. Hay ${total} ${total === 1 ? 'actividad planificada' : 'actividades planificadas'}.`;
  else if (!respondidas) resumen = `${total} ${total === 1 ? 'actividad' : 'actividades'} por responder.`;
  else {
    const faltan = total - respondidas;
    resumen = `${si} de ${total} hechas${faltan ? `, ${faltan === 1 ? 'falta 1' : `faltan ${faltan}`} por responder` : ''}.`;
  }
  $('#dia-resumen').textContent = resumen;

  const btn = $('#btn-checkin');
  btn.hidden = futuro || !total;
  btn.textContent = !respondidas ? 'Hacer el check-in' : respondidas < total ? 'Seguir el check-in' : 'Responder de nuevo';
  btn.classList.toggle('is-secundario', respondidas === total);

  $('#dia-lista').innerHTML = agrupar(lista).map((g) => `
    <section class="grupo" style="--cat:${g.cat.color}">
      <h2 class="grupo-titulo">${esc(g.cat.nombre)}</h2>
      <ul class="items">${g.items.map((a) => itemDia(a, fecha, futuro)).join('')}</ul>
    </section>`).join('')
    || '<p class="vacio">Agrega lo que quieras revisar cada día en <a href="#actividades">Mis actividades</a>.</p>';
  animar = null;

  renderNota(fecha, futuro);
}

function itemDia(a, fecha, futuro) {
  const r = respuesta(fecha, a.id);
  const det = detalle(a, fecha);
  const nombre = det && det.detalle ? det.detalle : a.nombre;
  const sub = [a.hora, det && det.detalle ? a.nombre : ''].filter(Boolean).join(', ');
  const estado = r === true ? 'hecha' : r === false ? 'no hecha' : 'sin responder';
  const clase = r === true ? 'is-si' : r === false ? 'is-no' : '';
  return `<li>
    <button class="item ${clase} ${animar === a.id ? 'anima' : ''}" type="button" data-action="toggle" data-id="${a.id}"
      ${futuro ? 'disabled' : ''} aria-label="${esc(nombre)}: ${estado}">
      <span class="caja">${r === true ? ICONO_CHECK : r === false ? ICONO_X : ''}</span>
      <span class="item-txt">
        <span class="item-nombre"><span class="tachable">${esc(nombre)}</span></span>
        ${sub ? `<span class="item-sub">${esc(sub)}</span>` : ''}
      </span>
      ${r === false ? '<span class="item-no">No</span>' : ''}
    </button>
  </li>`;
}

function renderNota(fecha, futuro) {
  const nota = (S.entries[fecha] && S.entries[fecha].nota) || '';
  const caja = $('#dia-nota');
  if (editandoNota) {
    caja.innerHTML = `
      <label class="nota-label" for="nota-input">Nota del día</label>
      <textarea id="nota-input" rows="3" maxlength="500" placeholder="Cómo te fue, qué cambiarías…">${esc(nota)}</textarea>
      <div class="fila-botones">
        <button class="btn" type="button" data-action="nota-cancelar">Cancelar</button>
        <button class="btn btn-primario" type="button" data-action="nota-guardar">Guardar nota</button>
      </div>`;
    const t = $('#nota-input');
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
  } else if (nota) {
    caja.innerHTML = `
      <h2 class="nota-label">Nota del día</h2>
      <p class="nota-texto">${esc(nota)}</p>
      <button class="link" type="button" data-action="nota-editar">Editar nota</button>`;
  } else {
    caja.innerHTML = futuro ? '' : '<button class="link" type="button" data-action="nota-editar">Agregar una nota del día</button>';
  }
}

function toggle(id) {
  const fecha = diaActual;
  const antes = respuesta(fecha, id);
  const ahora = antes !== true;
  responder(fecha, id, ahora);
  if (ahora) animar = id;
  if (navigator.vibrate) try { navigator.vibrate(8); } catch { /* sin vibración */ }
  renderDia();
  // El foco vuelve a la misma actividad para seguir con el teclado.
  const b = document.querySelector(`.item[data-id="${CSS.escape(id)}"]`);
  if (b && document.activeElement === document.body) b.focus({ preventScroll: true });
}

/* ---------- Check-in ---------- */

/* ---------- Capas (check-in, hoja de edición, confirmación) ---------- */

const capas = []; // la última es la de arriba: { el, opener, cerrar }
const capaArriba = () => capas[capas.length - 1];

function abrirCapa(el, cerrar) {
  capas.push({ el, opener: document.activeElement, cerrar });
  el.hidden = false;
  document.body.classList.add('bloqueado');
}

/** Cierra la capa y devuelve el foco a lo que la abrió (si todavía está en pantalla). */
function cerrarCapa(el) {
  const i = capas.findIndex((c) => c.el === el);
  if (i < 0) return false;
  const [capa] = capas.splice(i, 1);
  el.hidden = true;
  if (!capas.length) document.body.classList.remove('bloqueado');
  const o = capa.opener;
  if (o && o !== document.body && document.contains(o) && o.offsetParent !== null) {
    o.focus({ preventScroll: true });
    return true;
  }
  return false;
}

/* ---------- Check-in ---------- */

let ck = null; // { fecha, ids, i, fase }

function abrirCheckin(fecha, { desdeInicio = false } = {}) {
  const ids = actividadesDe(fecha).map((a) => a.id);
  if (!ids.length || fecha > hoyISO()) return;
  const pendiente = ids.findIndex((id) => respuesta(fecha, id) === null);
  ck = { fecha, ids, i: desdeInicio || pendiente < 0 ? 0 : pendiente, fase: 'preguntas' };
  abrirCapa($('#checkin'), cerrarCheckin);
  renderCheckin();
}

function cerrarCheckin() {
  if (!ck) return;
  ck = null;
  renderDia();
  if (!cerrarCapa($('#checkin'))) $('#btn-checkin').focus({ preventScroll: true });
}

function renderCheckin() {
  const { fecha, ids, i, fase } = ck;
  const n = ids.length;
  const cuerpo = $('#ck-cuerpo');
  const hechas = fase === 'preguntas' ? i : n;
  $('#ck-fill').style.width = `${(hechas / n) * 100}%`;
  $('#ck-cuenta').textContent = fase === 'preguntas' ? `${i + 1} de ${n}` : '';

  if (fase === 'preguntas') {
    const a = S.activities.find((x) => x.id === ids[i]);
    const cat = categoria(a.categoryId);
    const det = detalle(a, fecha);
    const previa = respuesta(fecha, a.id);
    cuerpo.innerHTML = `
      <div class="ck-pregunta-zona" style="--cat:${cat.color}">
        <p class="ck-cat">${esc(cat.nombre)}${det && det.detalle ? `<span>${esc(det.detalle)}</span>` : ''}</p>
        <h2 class="ck-pregunta" id="ck-pregunta">${esc(pregunta(a, fecha))}</h2>
        ${fecha !== hoyISO() ? `<p class="ck-fecha">${esc(fechaLarga(fecha))}</p>` : ''}
      </div>
      <div class="ck-respuestas">
        <button class="ck-btn ck-no ${previa === false ? 'is-previa' : ''}" type="button" data-action="ck-responder" data-valor="no">
          ${ICONO_X}No</button>
        <button class="ck-btn ck-si ${previa === true ? 'is-previa' : ''}" type="button" data-action="ck-responder" data-valor="si">
          ${ICONO_CHECK}Sí</button>
      </div>
      <button class="link ck-atras" type="button" data-action="ck-atras" ${i === 0 ? 'hidden' : ''}>Volver a la anterior</button>`;
    cuerpo.querySelector(previa === false ? '.ck-no' : '.ck-si').focus({ preventScroll: true });
  } else if (fase === 'nota') {
    const nota = (S.entries[fecha] && S.entries[fecha].nota) || '';
    cuerpo.innerHTML = `
      <div class="ck-pregunta-zona">
        <h2 class="ck-pregunta" id="ck-pregunta">¿Algo que quieras anotar del día?</h2>
        <p class="ck-ayuda">Opcional. Lo verás debajo de tus actividades.</p>
        <textarea id="ck-nota" rows="4" maxlength="500" placeholder="Cómo te fue, qué cambiarías…">${esc(nota)}</textarea>
      </div>
      <div class="ck-respuestas">
        <button class="btn" type="button" data-action="ck-omitir">Omitir</button>
        <button class="btn btn-primario" type="button" data-action="ck-nota">Guardar nota</button>
      </div>`;
    $('#ck-nota').focus({ preventScroll: true });
  } else {
    const lista = ids.map((id) => S.activities.find((x) => x.id === id));
    const { si } = conteo(fecha, lista);
    const p = si / n;
    const mensaje = p === 1 ? 'Día completo. Así se hace.'
      : p >= 0.7 ? 'Buen día. Lo que faltó, mañana.'
        : p >= 0.4 ? 'Medio a medio. Mañana se ajusta.'
          : 'Día difícil. Lo importante es seguir registrando.';
    cuerpo.innerHTML = `
      <div class="ck-pregunta-zona ck-resultado">
        <h2 class="ck-total" id="ck-pregunta"><strong>${si} de ${n}</strong> actividades</h2>
        <p class="ck-mensaje">${mensaje}</p>
        <ul class="ck-cats">${agrupar(lista).map((g) => {
          const c = conteo(fecha, g.items);
          return `<li style="--cat:${g.cat.color}">
            <span class="ck-cats-nombre">${esc(g.cat.nombre)}</span>
            <span class="ck-cats-num">${c.si}/${c.total}</span>
            <span class="ck-cats-barra"><i style="width:${(c.si / c.total) * 100}%"></i></span>
          </li>`;
        }).join('')}</ul>
      </div>
      <div class="ck-respuestas">
        <button class="btn" type="button" data-action="ck-repetir">Responder de nuevo</button>
        <button class="btn btn-primario" type="button" data-action="ck-cerrar">Ver mi día</button>
      </div>`;
    cuerpo.querySelector('.btn-primario').focus({ preventScroll: true });
  }
}

function ckResponder(valor) {
  responder(ck.fecha, ck.ids[ck.i], valor);
  ck.i++;
  if (ck.i >= ck.ids.length) ck.fase = 'nota';
  renderCheckin();
}

/* ---------- Semana ---------- */

function rangoSemana(lunes) {
  const domingo = sumarDias(lunes, 6);
  const a = aFecha(lunes); const b = aFecha(domingo);
  if (a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()} al ${b.getUTCDate()} de ${MESES[b.getUTCMonth()]}`;
  return `${a.getUTCDate()} de ${MESES[a.getUTCMonth()]} al ${b.getUTCDate()} de ${MESES[b.getUTCMonth()]}`;
}

function renderSemana() {
  const hoy = hoyISO();
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(semanaActual, i));
  const esEsta = semanaActual === lunesDe(hoy);
  $('#sem-titulo').textContent = esEsta ? 'Esta semana' : 'Semana';
  $('#sem-rango').textContent = rangoSemana(semanaActual);
  $('#btn-sem-hoy').hidden = esEsta;

  // Filas: actividades que tocaron o se respondieron algún día de la semana.
  const enSemana = ordenar(S.activities.filter((a) => dias.some((d) => aplica(a, d) || respuesta(d, a.id) !== null)));
  const cats = agrupar(enSemana).map((g) => g.cat);
  if (filtroCat && !cats.some((c) => c.id === filtroCat)) filtroCat = '';

  $('#sem-filtros').innerHTML = [{ id: '', nombre: 'Todas', color: '' }, ...cats].map((c) => `
    <button class="chip" type="button" data-action="filtro" data-cat="${c.id}" aria-pressed="${filtroCat === c.id}"
      ${c.color ? `style="--cat:${c.color}"` : ''}>${c.color ? '<i></i>' : ''}${esc(c.nombre)}</button>`).join('');

  const visibles = enSemana.filter((a) => !filtroCat || a.categoryId === filtroCat);
  if (!visibles.length) {
    $('#sem-tabla').innerHTML = '<p class="vacio">No hay actividades esta semana.</p>';
    return;
  }

  const celda = (a, d) => {
    const r = respuesta(d, a.id);
    if (r === null && !aplica(a, d)) return `<td data-fecha="${d}"></td>`;
    if (r === true) return `<td data-fecha="${d}"><span class="c c-si" title="Sí">${ICONO_CHECK}</span></td>`;
    if (r === false) return `<td data-fecha="${d}"><span class="c c-no" title="No">${ICONO_X}</span></td>`;
    return `<td data-fecha="${d}"><span class="c ${d > hoy ? 'c-futuro' : 'c-pend'}" title="${d > hoy ? 'Planificada' : 'Sin responder'}"></span></td>`;
  };

  const filas = agrupar(visibles).map((g) => {
    let si = 0; let n = 0;
    for (const a of g.items) for (const d of dias) {
      if (d > hoy) continue;
      if (aplica(a, d) || respuesta(d, a.id) !== null) { n++; if (respuesta(d, a.id) === true) si++; }
    }
    return `<tr class="cat-fila" style="--cat:${g.cat.color}">
        <th colspan="8" scope="colgroup"><span>${esc(g.cat.nombre)}</span>${n ? `<span class="cat-total">${si}/${n}</span>` : ''}</th>
      </tr>${g.items.map((a) => `<tr>
        <th scope="row" style="--cat:${g.cat.color}">${esc(a.nombre)}</th>${dias.map((d) => celda(a, d)).join('')}
      </tr>`).join('')}`;
  }).join('');

  const totales = dias.map((d) => {
    const lista = visibles.filter((a) => aplica(a, d) || respuesta(d, a.id) !== null);
    if (!lista.length) return '<td>–</td>';
    const { si } = conteo(d, lista);
    return `<td class="${d > hoy ? 'es-futuro' : ''}">${si}/${lista.length}</td>`;
  }).join('');

  $('#sem-tabla').innerHTML = `<table class="tabla">
    <thead><tr>
      <th scope="col" class="col-act"><span class="sr">Actividad</span></th>
      ${dias.map((d, i) => `<th scope="col" class="${d === hoy ? 'es-hoy' : ''}">
        <button type="button" data-action="ir-dia" data-fecha="${d}" aria-label="Ver ${DIAS[i]} ${aFecha(d).getUTCDate()}">
          <span>${DIAS_CORTOS[i]}</span><b>${aFecha(d).getUTCDate()}</b></button></th>`).join('')}
    </tr></thead>
    <tbody>${filas}</tbody>
    <tfoot><tr><th scope="row">Total</th>${totales}</tr></tfoot>
  </table>`;
}

/* ---------- Mis actividades ---------- */

const COLORES = [
  ['#3B6FD6', 'Azul'], ['#D08A1E', 'Ámbar'], ['#8A5CC7', 'Violeta'], ['#1F9E8F', 'Turquesa'],
  ['#D2577A', 'Rosado'], ['#6B8A2A', 'Oliva'], ['#2A9CD0', 'Celeste'], ['#66717A', 'Grafito'],
];
const ICONO_ARRIBA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
const ICONO_ABAJO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const ICONO_LAPIZ = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>';

const uid = (prefijo) => `${prefijo}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const minuscula = (t) => t.charAt(0).toLowerCase() + t.slice(1);
const preguntaAuto = (nombre) => `¿Hiciste ${minuscula(nombre.trim() || 'esta actividad')} hoy?`;
const categoriasVivas = () => S.categories.filter((c) => !c.borrada).sort((a, b) => a.orden - b.orden);
const pausadaHoy = (a) => estaPausada(a, hoyISO());
const actividadPorId = (id) => S.activities.find((a) => a.id === id);

/** Lo que se lista en "Mis actividades": sin borrar y, si es de una sola fecha, que no haya pasado. */
function actividadesVivas(catId) {
  const hoy = hoyISO();
  return S.activities
    .filter((a) => a.categoryId === catId && !a.borrada && !(a.tipo === 'once' && a.fecha < hoy))
    .sort((a, b) => a.orden - b.orden);
}

function siguienteOrden(lista) { return lista.reduce((m, x) => Math.max(m, x.orden + 1), 0); }

function colorLibre() {
  const usados = categoriasVivas().map((c) => c.color);
  const libre = COLORES.find(([hex]) => !usados.includes(hex));
  return (libre || COLORES[usados.length % COLORES.length])[0];
}

function resumenCuando(a) {
  if (a.tipo === 'once') return a.fecha ? `Solo el ${minuscula(fechaLarga(a.fecha))}` : 'Una sola fecha';
  if (a.tipo === 'weekdays' && a.dias.length < 7) return [...a.dias].sort((x, y) => x - y).map((d) => DIAS_CORTOS[d]).join(', ');
  return 'Todos los días';
}

let ordenando = false;

function botonesOrden(tipo, id, i, n, nombre) {
  if (!ordenando) return '';
  return `<span class="orden">
    <button class="icon-btn" type="button" data-action="subir-${tipo}" data-id="${id}" aria-label="Subir ${esc(nombre)}" ${i === 0 ? 'disabled' : ''}>${ICONO_ARRIBA}</button>
    <button class="icon-btn" type="button" data-action="bajar-${tipo}" data-id="${id}" aria-label="Bajar ${esc(nombre)}" ${i === n - 1 ? 'disabled' : ''}>${ICONO_ABAJO}</button>
  </span>`;
}

function renderActividades() {
  const btn = $('#btn-ordenar');
  btn.setAttribute('aria-pressed', String(ordenando));
  btn.textContent = ordenando ? 'Listo' : 'Ordenar';
  const cats = categoriasVivas();
  btn.hidden = !cats.length;

  $('#act-lista').innerHTML = cats.map((c, ci) => {
    const acts = actividadesVivas(c.id);
    const filas = acts.map((a, i) => `<li class="act-fila">
        <button class="act-btn" type="button" data-action="editar-act" data-id="${a.id}">
          <span class="item-nombre">${esc(a.nombre)}</span>
          <span class="item-sub">${esc(resumenCuando(a))}${pausadaHoy(a) ? '<span class="pausa">En pausa</span>' : ''}</span>
        </button>
        ${botonesOrden('act', a.id, i, acts.length, a.nombre)}
      </li>`).join('');
    return `<section class="grupo" style="--cat:${c.color}">
      <div class="act-cat-head">
        <h2 class="grupo-titulo">${esc(c.nombre)}</h2>
        ${botonesOrden('cat', c.id, ci, cats.length, c.nombre)}
        <button class="icon-btn" type="button" data-action="editar-cat" data-id="${c.id}" aria-label="Editar categoría ${esc(c.nombre)}">${ICONO_LAPIZ}</button>
      </div>
      ${filas ? `<ul class="items">${filas}</ul>`
        : `<p class="vacio-cat">Sin actividades. <button class="link" type="button" data-action="nueva-act" data-cat="${c.id}">Agregar una</button></p>`}
    </section>`;
  }).join('') || '<p class="vacio">Todavía no tienes categorías. Crea una para empezar.</p>';
}

function mover(tipo, id, dir) {
  const lista = tipo === 'cat' ? categoriasVivas() : actividadesVivas(actividadPorId(id).categoryId);
  const i = lista.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  lista.forEach((x, k) => { x.orden = k; });
  guardar();
  renderActividades();
  // El foco sigue en la flecha que se tocó (o en la otra, si llegó al borde).
  const accion = `${dir < 0 ? 'subir' : 'bajar'}-${tipo}`;
  const otra = `${dir < 0 ? 'bajar' : 'subir'}-${tipo}`;
  const b = document.querySelector(`[data-action="${accion}"][data-id="${CSS.escape(id)}"]`);
  (b && !b.disabled ? b : document.querySelector(`[data-action="${otra}"][data-id="${CSS.escape(id)}"]`)).focus();
}

/* ---------- Hoja: crear y editar ---------- */

let hoja = null; // { tipo: 'act' | 'cat' | 'tarea', id, b: borrador, porDiaAbierto }

const CLAVE_CALENDAR = `${KEY}:calendar`; // si la última tarea se agregó a Google Calendar
function prefiereCalendar() {
  try { return localStorage.getItem(CLAVE_CALENDAR) === '1'; } catch { return false; }
}

function cuandoDe(fecha) {
  const hoy = hoyISO();
  return fecha === hoy ? 'hoy' : fecha === sumarDias(hoy, 1) ? 'manana' : 'otro';
}

function abrirHoja(tipo, id = null, { cat = '' } = {}) {
  if (tipo === 'tarea') {
    const fecha = diaActual >= hoyISO() ? diaActual : hoyISO();
    hoja = { tipo, id: null, b: { nombre: '', fecha, cuando: cuandoDe(fecha), hora: '', calendar: prefiereCalendar() } };
    $('#hoja-titulo').textContent = 'Nueva tarea';
  } else if (tipo === 'act') {
    const a = id && actividadPorId(id);
    const b = a ? JSON.parse(JSON.stringify(a)) : actividad({
      nombre: '', categoryId: cat || categoriasVivas()[0].id, fecha: diaActual >= hoyISO() ? diaActual : hoyISO(),
    });
    b.porDia = b.porDia || {};
    hoja = { tipo, id, b, porDiaAbierto: Object.values(b.porDia).some((x) => x && (x.detalle || x.pregunta)) };
    $('#hoja-titulo').textContent = id ? 'Editar actividad' : 'Nueva actividad';
  } else {
    const c = id && S.categories.find((x) => x.id === id);
    hoja = { tipo, id, b: c ? { ...c } : { nombre: '', color: colorLibre() } };
    $('#hoja-titulo').textContent = id ? 'Editar categoría' : 'Nueva categoría';
  }
  renderHoja();
  $('#velo').hidden = false;
  abrirCapa($('#hoja'), cerrarHoja);
  $('#hoja').scrollTop = 0;
  // Al crear, directo a escribir el nombre; al editar, sin abrir el teclado.
  if (id) $('#hoja-titulo').focus({ preventScroll: true });
  else $('#hoja-form [name="nombre"]').focus({ preventScroll: true });
}

function cerrarHoja() {
  if (!hoja) return;
  hoja = null;
  $('#velo').hidden = true;
  cerrarCapa($('#hoja'));
}

function renderHoja() {
  const form = $('#hoja-form');
  const { b, id } = hoja;
  if (hoja.tipo === 'cat') {
    form.innerHTML = `
      <label class="campo"><span class="campo-label">Nombre</span>
        <input name="nombre" type="text" maxlength="40" value="${esc(b.nombre)}" placeholder="Ej. Estudios" autocapitalize="sentences" enterkeyhint="done"></label>
      <fieldset class="campo"><legend class="campo-label">Color</legend>
        <div class="colores">${COLORES.map(([hex, nombre]) => `<label class="color" style="--cat:${hex}">
          <input type="radio" name="color" value="${hex}" ${b.color === hex ? 'checked' : ''} aria-label="${nombre}"><i aria-hidden="true"></i></label>`).join('')}</div>
      </fieldset>
      <p class="form-error" id="form-error" role="alert"></p>
      <div class="hoja-acciones">
        <button class="btn btn-primario" type="submit">${id ? 'Guardar cambios' : 'Crear categoría'}</button>
        ${id ? '<div class="hoja-secundarias"><button class="btn btn-peligro-borde" type="button" data-action="cat-borrar">Borrar categoría</button></div>' : ''}
      </div>`;
    return;
  }

  if (hoja.tipo === 'tarea') {
    const hoy = hoyISO();
    form.innerHTML = `
      <label class="campo"><span class="campo-label">Tarea</span>
        <input name="nombre" type="text" maxlength="60" value="${esc(b.nombre)}" placeholder="Ej. Llamar al dentista" autocapitalize="sentences" enterkeyhint="done"></label>
      <fieldset class="campo"><legend class="campo-label">Cuándo</legend>
        <div class="segmentos">${[['hoy', 'Hoy'], ['manana', 'Mañana'], ['otro', 'Otro día']].map(([v, t]) => `
          <label class="segmento"><input type="radio" name="cuando" value="${v}" ${b.cuando === v ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>
        ${b.cuando === 'otro' ? `<input class="input-fecha" name="fecha" type="date" min="${hoy}" value="${b.fecha}" aria-label="Fecha">` : ''}
      </fieldset>
      <label class="campo"><span class="campo-label">Hora (opcional)</span>
        <input name="hora" type="time" value="${b.hora}"></label>
      <label class="check"><input type="checkbox" name="calendar" ${b.calendar ? 'checked' : ''}>
        <span>Agregar a Google Calendar para que te avise</span></label>
      <p class="form-error" id="form-error" role="alert"></p>
      <div class="hoja-acciones">
        <button class="btn btn-primario" type="submit">Agregar tarea</button>
      </div>`;
    return;
  }

  const cats = categoriasVivas();
  const diasSel = [...b.dias].sort((x, y) => x - y);
  const original = id && actividadPorId(id);
  form.innerHTML = `
    <label class="campo"><span class="campo-label">Nombre</span>
      <input name="nombre" type="text" maxlength="60" value="${esc(b.nombre)}" placeholder="Ej. Estudiar Big Data" autocapitalize="sentences" enterkeyhint="next"></label>
    <fieldset class="campo"><legend class="campo-label">Categoría</legend>
      <div class="opciones">${cats.map((c) => `<label class="opcion" style="--cat:${c.color}">
        <input type="radio" name="categoryId" value="${c.id}" ${b.categoryId === c.id ? 'checked' : ''}><span><i></i>${esc(c.nombre)}</span></label>`).join('')}</div>
    </fieldset>
    <label class="campo"><span class="campo-label">Pregunta del check-in</span>
      <input name="pregunta" id="campo-pregunta" type="text" maxlength="120" value="${esc(b.pregunta)}" placeholder="${esc(preguntaAuto(b.nombre))}" enterkeyhint="done">
      <small class="campo-ayuda">Si la dejas vacía, se usa la del ejemplo.</small></label>
    <fieldset class="campo"><legend class="campo-label">Cuándo</legend>
      <div class="segmentos">${[['daily', 'Todos los días'], ['weekdays', 'Ciertos días'], ['once', 'Una sola fecha']].map(([v, t]) => `
        <label class="segmento"><input type="radio" name="tipo" value="${v}" ${b.tipo === v ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>
      ${b.tipo === 'weekdays' ? `<div class="dias-sel">${DIAS_CORTOS.map((d, i) => `
        <label class="dia-sel"><input type="checkbox" name="dia" value="${i}" ${b.dias.includes(i) ? 'checked' : ''} aria-label="${cap(DIAS[i])}"><span aria-hidden="true">${d}</span></label>`).join('')}</div>` : ''}
      ${b.tipo === 'once' ? `<input class="input-fecha" name="fecha" type="date" value="${b.fecha || ''}" aria-label="Fecha">` : ''}
    </fieldset>
    <label class="campo"><span class="campo-label">Hora (opcional)</span>
      <input name="hora" type="time" value="${b.hora || ''}"></label>
    ${b.tipo === 'weekdays' && diasSel.length ? `<details class="por-dia" ${hoja.porDiaAbierto ? 'open' : ''}>
      <summary>Cambia según el día</summary>
      <p class="campo-ayuda">Opcional. Por ejemplo, qué toca entrenar cada día.</p>
      ${diasSel.map((d) => {
        const x = b.porDia[d] || {};
        return `<div class="por-dia-fila">
          <span class="por-dia-nombre">${cap(DIAS[d])}</span>
          <input name="det-${d}" type="text" maxlength="60" value="${esc(x.detalle || '')}" placeholder="Qué toca (ej. Pecho y tríceps)" aria-label="Qué toca el ${DIAS[d]}">
          <input name="preg-${d}" type="text" maxlength="120" value="${esc(x.pregunta || '')}" placeholder="Pregunta de ese día (opcional)" aria-label="Pregunta del ${DIAS[d]}">
        </div>`;
      }).join('')}
    </details>` : ''}
    <p class="form-error" id="form-error" role="alert"></p>
    <div class="hoja-acciones">
      <button class="btn btn-primario" type="submit">${id ? 'Guardar cambios' : 'Crear actividad'}</button>
      <button class="btn" type="button" data-action="act-calendar">Agregar a Google Calendar</button>
      ${original ? `<div class="hoja-secundarias">
        <button class="btn" type="button" data-action="act-pausar">${pausadaHoy(original) ? 'Reanudar' : 'Pausar'}</button>
        <button class="btn btn-peligro-borde" type="button" data-action="act-borrar">Borrar</button>
      </div>` : ''}
    </div>`;
  const det = form.querySelector('details');
  if (det) det.addEventListener('toggle', () => { if (hoja) hoja.porDiaAbierto = det.open; });
}

/** Lo que se escribe en la hoja va al borrador; cambiar el tipo o los días redibuja. */
$('#hoja-form').addEventListener('input', (e) => {
  if (!hoja) return;
  const t = e.target;
  const b = hoja.b;
  if (t.name === 'nombre') {
    b.nombre = t.value;
    if (hoja.tipo === 'act') $('#campo-pregunta').placeholder = preguntaAuto(t.value);
  } else if (t.name === 'color') b.color = t.value;
  else if (t.name === 'pregunta') b.pregunta = t.value;
  else if (t.name === 'categoryId') b.categoryId = t.value;
  else if (t.name === 'fecha') b.fecha = t.value;
  else if (t.name === 'hora') b.hora = t.value;
  else if (t.name === 'calendar') {
    b.calendar = t.checked;
    try { localStorage.setItem(CLAVE_CALENDAR, t.checked ? '1' : '0'); } catch { /* sin almacenamiento */ }
  } else if (t.name === 'cuando') {
    const hoy = hoyISO();
    b.cuando = t.value;
    if (t.value === 'hoy') b.fecha = hoy;
    else if (t.value === 'manana') b.fecha = sumarDias(hoy, 1);
    else if (b.fecha <= sumarDias(hoy, 1)) b.fecha = sumarDias(hoy, 2);
    renderHoja();
    $('#hoja-form').querySelector(`[name="cuando"][value="${t.value}"]`).focus();
  } else if (/^(det|preg)-\d$/.test(t.name)) {
    const [k, d] = t.name.split('-');
    (b.porDia[d] || (b.porDia[d] = {}))[k === 'det' ? 'detalle' : 'pregunta'] = t.value;
  } else if (t.name === 'tipo' || t.name === 'dia') {
    if (t.name === 'tipo') b.tipo = t.value;
    else b.dias = [...$('#hoja-form').querySelectorAll('[name="dia"]:checked')].map((x) => Number(x.value));
    renderHoja();
    $('#hoja-form').querySelector(`[name="${t.name}"][value="${t.value}"]`).focus();
  }
});

$('#hoja-form').addEventListener('submit', (e) => {
  e.preventDefault();
  guardarHoja();
});

function guardarHoja() {
  const { b, id, tipo } = hoja;
  const form = $('#hoja-form');
  const error = (msg, sel) => {
    $('#form-error').textContent = msg;
    const campo = sel && form.querySelector(sel);
    if (campo) campo.focus();
  };
  const nombre = b.nombre.trim();
  if (!nombre) return error(tipo === 'tarea' ? 'Escribe la tarea.' : 'Escribe un nombre.', '[name="nombre"]');

  if (tipo === 'tarea') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '') || b.fecha < hoyISO()) return error('Elige hoy o un día que viene.', '[name="fecha"]');
    const a = nuevaTarea(nombre, b.fecha, b.hora);
    // Se abre dentro del mismo toque (si no, el navegador lo bloquea).
    if (b.calendar) abrirCalendar(a);
    cerrarHoja();
    render();
    toast(b.fecha === diaActual ? 'Tarea agregada.' : `Tarea agregada para el ${DIAS[diaSemana(b.fecha)]} ${aFecha(b.fecha).getUTCDate()}.`);
    return;
  }

  if (tipo === 'cat') {
    if (id) Object.assign(S.categories.find((c) => c.id === id), { nombre, color: b.color });
    else S.categories.push({ id: uid('c'), nombre, color: b.color, orden: siguienteOrden(categoriasVivas()) });
    guardar();
    cerrarHoja();
    render();
    toast(id ? 'Cambios guardados.' : 'Categoría creada.');
    return;
  }

  if (b.tipo === 'weekdays' && !b.dias.length) return error('Elige al menos un día.', '[name="dia"]');
  if (b.tipo === 'once' && !/^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '')) return error('Elige la fecha.', '[name="fecha"]');

  const porDia = {};
  if (b.tipo === 'weekdays') {
    for (const d of b.dias) {
      const x = b.porDia[d] || {};
      const det = (x.detalle || '').trim();
      const preg = (x.pregunta || '').trim();
      if (det || preg) porDia[d] = { detalle: det, pregunta: preg };
    }
  }
  const datos = {
    nombre,
    categoryId: b.categoryId,
    pregunta: b.pregunta.trim(),
    tipo: b.tipo,
    dias: b.tipo === 'weekdays' ? [...b.dias].sort((x, y) => x - y) : [],
    fecha: b.tipo === 'once' ? b.fecha : null,
    hora: b.hora || '',
    porDia: Object.keys(porDia).length ? porDia : undefined,
  };

  if (id) {
    const a = actividadPorId(id);
    if (a.categoryId !== datos.categoryId) datos.orden = siguienteOrden(actividadesVivas(datos.categoryId));
    Object.assign(a, datos);
  } else {
    S.activities.push(actividad({ id: uid('a'), orden: siguienteOrden(actividadesVivas(datos.categoryId)), ...datos }));
  }
  guardar();
  cerrarHoja();
  render();
  toast(id ? 'Cambios guardados.' : 'Actividad creada.');
}

function alternarPausa(id) {
  const a = actividadPorId(id);
  const hoy = hoyISO();
  a.pausas = a.pausas || [];
  if (pausadaHoy(a)) {
    const p = a.pausas.find((x) => hoy >= x.desde && (!x.hasta || hoy < x.hasta));
    // Pausar y reanudar el mismo día no deja rastro.
    if (p.desde === hoy) a.pausas.splice(a.pausas.indexOf(p), 1);
    else p.hasta = hoy;
    a.activa = true;
  } else {
    a.pausas.push({ desde: hoy, hasta: null });
    a.activa = false;
  }
  guardar();
  cerrarHoja();
  render();
  toast(a.activa ? 'Actividad reanudada.' : 'Actividad en pausa. Tu historial queda guardado.');
}

/* ---------- Confirmación ---------- */

let alConfirmar = null;

function confirmar({ titulo, texto, boton, accion }) {
  alConfirmar = accion;
  $('#conf-titulo').textContent = titulo;
  $('#conf-texto').textContent = texto;
  $('#conf-si').textContent = boton;
  abrirCapa($('#confirmar'), () => cerrarConfirmar(false));
  $('#confirmar [data-action="conf-no"]').focus();
}

function cerrarConfirmar(si) {
  const accion = alConfirmar;
  alConfirmar = null;
  cerrarCapa($('#confirmar'));
  if (si && accion) accion();
}

function borrarActividad(id) {
  const a = actividadPorId(id);
  confirmar({
    titulo: `¿Borrar «${a.nombre}»?`,
    texto: 'Deja de aparecer desde hoy. Lo que ya respondiste se mantiene en tus días anteriores.',
    boton: 'Sí, borrar',
    accion: () => {
      a.borrada = hoyISO();
      guardar();
      cerrarHoja();
      render();
      toast('Actividad borrada. Tu historial se mantiene.');
    },
  });
}

function borrarCategoria(id) {
  const c = S.categories.find((x) => x.id === id);
  const suyas = S.activities.filter((a) => a.categoryId === id && !a.borrada);
  const n = actividadesVivas(id).length;
  confirmar({
    titulo: `¿Borrar «${c.nombre}»?`,
    texto: `${n === 1 ? 'Su actividad también deja' : n ? `Sus ${n} actividades también dejan` : 'Deja'} de aparecer desde hoy. Tu historial se mantiene.`,
    boton: 'Sí, borrar',
    accion: () => {
      const hoy = hoyISO();
      c.borrada = hoy;
      suyas.forEach((a) => { a.borrada = hoy; });
      if (filtroCat === id) filtroCat = '';
      guardar();
      cerrarHoja();
      render();
      toast('Categoría borrada. Tu historial se mantiene.');
    },
  });
}

/* ---------- Tareas (botón +) y Google Calendar ---------- */

/** Una tarea es una actividad de una sola fecha en la categoría "Tareas" (se crea sola). */
function nuevaTarea(nombre, fecha, hora = '') {
  let cat = categoriasVivas().find((c) => c.nombre.toLowerCase() === 'tareas');
  if (!cat) {
    cat = { id: uid('c'), nombre: 'Tareas', color: colorLibre(), orden: siguienteOrden(categoriasVivas()) };
    S.categories.push(cat);
  }
  const a = actividad({
    id: uid('a'), nombre, categoryId: cat.id, tipo: 'once', fecha, hora, orden: siguienteOrden(actividadesVivas(cat.id)),
  });
  S.activities.push(a);
  guardar();
  return a;
}

const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const sinGuiones = (iso) => iso.replace(/-/g, '');

/** Enlace para crear el evento en Google Calendar (con repetición si la actividad se repite). */
function enlaceCalendar(a) {
  let fecha = a.tipo === 'once' && a.fecha ? a.fecha : hoyISO();
  if (a.tipo === 'weekdays') for (let i = 0; i < 7 && !a.dias.includes(diaSemana(fecha)); i++) fecha = sumarDias(fecha, 1);
  let dates = `${sinGuiones(fecha)}/${sinGuiones(sumarDias(fecha, 1))}`; // sin hora: todo el día
  if (a.hora) {
    const [h, m] = a.hora.split(':').map(Number);
    const fin = h * 60 + m + 30; // dura 30 minutos
    const dosDig = (n) => String(n).padStart(2, '0');
    const fechaFin = fin >= 1440 ? sumarDias(fecha, 1) : fecha;
    dates = `${sinGuiones(fecha)}T${dosDig(h)}${dosDig(m)}00/${sinGuiones(fechaFin)}T${dosDig(Math.floor(fin / 60) % 24)}${dosDig(fin % 60)}00`;
  }
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: a.nombre,
    dates,
    ctz: TZ,
    details: `${pregunta(a, hoyISO())}\n\nAnótalo en Al día: ${location.origin}${location.pathname}`,
  });
  if (a.tipo === 'daily') p.set('recur', 'RRULE:FREQ=DAILY');
  if (a.tipo === 'weekdays') p.set('recur', `RRULE:FREQ=WEEKLY;BYDAY=${a.dias.map((d) => BYDAY[d]).join(',')}`);
  return `https://calendar.google.com/calendar/render?${p}`;
}

function abrirCalendar(a) {
  window.open(enlaceCalendar(a), '_blank', 'noopener');
}

/** Desde el editor: usa lo que está escrito, aunque todavía no se guarde. */
function calendarDesdeEditor() {
  const { b } = hoja;
  const error = (msg, sel) => { $('#form-error').textContent = msg; const c = sel && $(`#hoja-form ${sel}`); if (c) c.focus(); };
  if (!b.nombre.trim()) return error('Escribe un nombre.', '[name="nombre"]');
  if (b.tipo === 'weekdays' && !b.dias.length) return error('Elige al menos un día.', '[name="dia"]');
  if (b.tipo === 'once' && !b.fecha) return error('Elige la fecha.', '[name="fecha"]');
  abrirCalendar({ ...b, nombre: b.nombre.trim(), dias: [...b.dias].sort((x, y) => x - y) });
}

/* ---------- Avance: racha y cumplimiento ---------- */

let periodo = 7; // días; 0 = todo

/** El primer día con algo que mirar: el inicio de la app o la respuesta más antigua. */
function primerDia() {
  const fechas = Object.keys(S.entries).sort();
  return fechas.length && fechas[0] < S.inicio ? fechas[0] : S.inicio;
}

/** null si ese día no había nada; si no, si el check-in quedó completo. */
function checkinCompleto(fecha) {
  const { respondidas, total } = conteo(fecha);
  return total ? respondidas === total : null;
}

/** Días seguidos con el check-in completo. Hoy sin terminar no corta la racha; los días sin actividades se saltan. */
function rachas() {
  const hoy = hoyISO();
  const inicio = primerDia();
  let mejor = 0; let corriendo = 0;
  for (let d = inicio; d <= hoy; d = sumarDias(d, 1)) {
    const c = checkinCompleto(d);
    if (c === null || (d === hoy && !c)) continue;
    corriendo = c ? corriendo + 1 : 0;
    mejor = Math.max(mejor, corriendo);
  }
  return { actual: corriendo, mejor };
}

function renderAvance() {
  const hoy = hoyISO();
  const { actual, mejor } = rachas();
  const dias = (n) => `${n} ${n === 1 ? 'día' : 'días'}`;
  $('#racha').innerHTML = actual
    ? `Llevas <strong>${dias(actual)} seguidos</strong> con el <span class="nowrap">check-in</span> completo.${mejor > actual ? ` Tu mejor racha: ${dias(mejor)}.` : ''}`
    : `Completa el <span class="nowrap">check-in</span> de hoy para empezar una racha.${mejor ? ` Tu mejor racha: ${dias(mejor)}.` : ''}`;

  // Últimos 14 días: cada cuadro se llena según lo cumplido. Antes de empezar a usar la app quedan en blanco.
  const inicio = primerDia();
  $('#dias14').innerHTML = Array.from({ length: 14 }, (_, i) => sumarDias(hoy, i - 13)).map((d) => {
    const { si, respondidas, total } = conteo(d);
    const antes = d < inicio && !respondidas;
    const estado = !total || antes ? 'sin-actividades' : respondidas < total ? 'incompleto' : '';
    const etiqueta = `${cap(DIAS[diaSemana(d)])} ${aFecha(d).getUTCDate()}: ${antes ? 'antes de empezar'
      : total ? `${si} de ${total}${respondidas < total ? `, ${total - respondidas} sin responder` : ''}` : 'sin actividades'}`;
    return `<button class="d14 ${estado} ${d === hoy ? 'es-hoy' : ''}" type="button" data-action="ir-dia" data-fecha="${d}" aria-label="${etiqueta}" title="${etiqueta}">
      <i style="--p:${total ? si / total : 0}"></i><span>${DIAS_CORTOS[diaSemana(d)].charAt(0)}</span></button>`;
  }).join('');

  document.querySelectorAll('[data-action="periodo"]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.dias) === periodo)));
  const desde = periodo ? sumarDias(hoy, 1 - periodo) : primerDia();
  const porCat = new Map();
  const general = { si: 0, n: 0 };
  for (let d = desde; d <= hoy; d = sumarDias(d, 1)) {
    for (const a of actividadesDe(d)) {
      const r = respuesta(d, a.id);
      if (r === null) continue;
      const cat = categoria(a.categoryId);
      const c = porCat.get(cat) || { si: 0, n: 0 };
      c.n++; general.n++;
      if (r) { c.si++; general.si++; }
      porCat.set(cat, c);
    }
  }
  const fila = (nombre, color, c, clase = '') => `<li class="${clase}" style="--cat:${color}">
      <span class="ck-cats-nombre">${esc(nombre)}</span>
      <span class="ck-cats-num">${Math.round((c.si / c.n) * 100)} %</span>
      <span class="ck-cats-barra"><i style="width:${(c.si / c.n) * 100}%"></i></span>
      <span class="avance-sub">${c.si} de ${c.n} ${c.n === 1 ? 'respuesta' : 'respuestas'}</span>
    </li>`;
  const cats = [...porCat.entries()].sort(([a], [b]) => a.orden - b.orden);
  $('#avance-cats').innerHTML = general.n
    ? fila('En total', 'var(--tinta)', general, 'es-total') + cats.map(([cat, c]) => fila(cat.nombre, cat.color, c)).join('')
    : '<li class="vacio">Todavía no hay respuestas en este período.</li>';

  const hace = S.ultimoRespaldo ? diasEntre(fmtISO.format(new Date(S.ultimoRespaldo)), hoy) : null;
  $('#respaldo-texto').textContent = 'Tus datos viven solo en este navegador. '
    + (hace === null ? 'Todavía no descargas un respaldo.'
      : hace === 0 ? 'Descargaste un respaldo hoy.'
        : `Tu último respaldo fue hace ${dias(hace)}.`);
  renderInstalar();
}

/* ---------- Exportar e importar ---------- */

function celdaCSV(v) {
  let t = String(v == null ? '' : v);
  if (/^[=+\-@]/.test(t)) t = `'${t}`; // que Excel no lo tome como fórmula
  return /[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

function textoCSV() {
  const filas = [['fecha', 'dia', 'categoria', 'actividad', 'detalle', 'respuesta', 'nota_del_dia']];
  for (const f of Object.keys(S.entries).sort()) {
    const e = S.entries[f];
    const r = e.respuestas || {};
    const lista = ordenar(S.activities.filter((a) => typeof r[a.id] === 'boolean'));
    if (!lista.length && e.nota) filas.push([f, DIAS[diaSemana(f)], '', '', '', '', e.nota]);
    for (const a of lista) {
      const det = detalle(a, f);
      filas.push([f, DIAS[diaSemana(f)], categoria(a.categoryId).nombre, a.nombre, (det && det.detalle) || '', r[a.id] ? 'Sí' : 'No', e.nota || '']);
    }
  }
  // BOM para que Excel lea bien los tildes; punto y coma como separador (Excel en español).
  return `﻿${filas.map((fila) => fila.map(celdaCSV).join(';')).join('\r\n')}\r\n`;
}

function descargar(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportarCSV() {
  if (!Object.keys(S.entries).length) { toast('Todavía no hay respuestas para descargar.'); return; }
  descargar(`al-dia-${hoyISO()}.csv`, textoCSV(), 'text/csv;charset=utf-8');
  toast('CSV descargado.');
}

function exportarJSON() {
  S.ultimoRespaldo = new Date().toISOString();
  guardar();
  descargar(`al-dia-respaldo-${hoyISO()}.json`, JSON.stringify({ app: 'al-dia', ...S }, null, 2), 'application/json');
  renderAvance();
  toast('Respaldo descargado.');
}

function importarJSON(texto) {
  let d;
  try { d = JSON.parse(texto); } catch { d = null; }
  if (!d || !Array.isArray(d.categories) || !Array.isArray(d.activities) || typeof d.entries !== 'object') {
    toast('Ese archivo no es un respaldo de Al día.');
    return;
  }
  const dias = Object.keys(d.entries || {}).length;
  confirmar({
    titulo: '¿Restaurar este respaldo?',
    texto: `Trae ${d.activities.filter((a) => !a.borrada).length} actividades y ${dias} ${dias === 1 ? 'día' : 'días'} respondidos. Reemplaza lo que tienes ahora en este navegador.`,
    boton: 'Sí, restaurar',
    accion: () => {
      S = normalizar(d);
      guardar();
      filtroCat = '';
      render();
      toast('Respaldo restaurado.');
    },
  });
}

$('#archivo-respaldo').addEventListener('change', async (e) => {
  const archivo = e.target.files && e.target.files[0];
  e.target.value = '';
  if (archivo) importarJSON(await archivo.text());
});

/* ---------- Instalar y actualizar (PWA) ---------- */

const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let eventoInstalar = null;
let swEsperando = null;
let recargando = false;

function renderInstalar() {
  $('#instalar').hidden = instalada();
  $('#btn-instalar').hidden = !eventoInstalar;
  $('#instalar-pasos').hidden = Boolean(eventoInstalar);
}

async function instalar() {
  if (!eventoInstalar) return;
  eventoInstalar.prompt();
  try { await eventoInstalar.userChoice; } catch { /* cancelado */ }
  eventoInstalar = null;
  renderInstalar();
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  eventoInstalar = e;
  renderInstalar();
});
window.addEventListener('appinstalled', () => { eventoInstalar = null; renderInstalar(); });

function actualizarApp() {
  if (!swEsperando) { location.reload(); return; }
  recargando = true;
  swEsperando.postMessage('actualizar');
  setTimeout(() => location.reload(), 1500); // por si el navegador no avisa
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (recargando) location.reload(); });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).then((reg) => {
      // Solo se avisa si ya había una versión instalada (no en la primera visita).
      const avisar = (w) => {
        if (!w || !navigator.serviceWorker.controller) return;
        swEsperando = w;
        $('#update-bar').hidden = false;
      };
      if (reg.waiting) avisar(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') avisar(w); });
      });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch((err) => console.warn('Service worker no registrado', err));
  });
}

// Pedir al navegador que no borre los datos locales.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ---------- Navegación ---------- */

const VISTAS = ['dia', 'semana', 'actividades', 'avance'];
function vistaActual() {
  const v = location.hash.slice(1);
  return VISTAS.includes(v) ? v : 'dia';
}

function render() {
  const vista = vistaActual();
  for (const v of VISTAS) $(`#view-${v}`).hidden = vista !== v;
  $('#btn-tarea').hidden = vista !== 'dia';
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (a.dataset.tab === vista) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  if (vista === 'dia') renderDia();
  else if (vista === 'semana') renderSemana();
  else if (vista === 'actividades') renderActividades();
  else renderAvance();
}

function irADia(fecha) {
  diaActual = fecha;
  editandoNota = false;
  if (location.hash === '#dia') render(); else location.hash = '#dia';
  window.scrollTo(0, 0);
}

let toastTimer = null;
function toast(texto) {
  const t = $('#toast');
  t.textContent = texto;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
}

/* ---------- Eventos ---------- */

const acciones = {
  'dia-prev': () => { diaActual = sumarDias(diaActual, -1); editandoNota = false; renderDia(); },
  'dia-sig': () => { diaActual = sumarDias(diaActual, 1); editandoNota = false; renderDia(); },
  'dia-hoy': () => { diaActual = hoyISO(); editandoNota = false; renderDia(); },
  toggle: (el) => toggle(el.dataset.id),
  checkin: () => {
    const { respondidas, total } = conteo(diaActual);
    abrirCheckin(diaActual, { desdeInicio: respondidas === total });
  },
  'nota-editar': () => { editandoNota = true; renderNota(diaActual, false); },
  'nota-cancelar': () => { editandoNota = false; renderNota(diaActual, false); },
  'nota-guardar': () => { guardarNota(diaActual, $('#nota-input').value); editandoNota = false; renderNota(diaActual, false); },
  'ck-responder': (el) => ckResponder(el.dataset.valor === 'si'),
  'ck-atras': () => { if (ck.i > 0) { ck.i--; renderCheckin(); } },
  'ck-nota': () => { guardarNota(ck.fecha, $('#ck-nota').value); ck.fase = 'resultado'; renderCheckin(); },
  'ck-omitir': () => { ck.fase = 'resultado'; renderCheckin(); },
  'ck-repetir': () => { ck.i = 0; ck.fase = 'preguntas'; renderCheckin(); },
  'ck-cerrar': () => cerrarCheckin(),
  'sem-prev': () => { semanaActual = sumarDias(semanaActual, -7); renderSemana(); },
  'sem-sig': () => { semanaActual = sumarDias(semanaActual, 7); renderSemana(); },
  'sem-hoy': () => { semanaActual = lunesDe(hoyISO()); renderSemana(); },
  filtro: (el) => { filtroCat = el.dataset.cat; renderSemana(); },
  'ir-dia': (el) => irADia(el.dataset.fecha),
  'nueva-act': (el) => {
    if (!categoriasVivas().length) { toast('Primero crea una categoría.'); abrirHoja('cat'); return; }
    abrirHoja('act', null, { cat: el.dataset.cat });
  },
  'nueva-cat': () => abrirHoja('cat'),
  'editar-act': (el) => abrirHoja('act', el.dataset.id),
  'editar-cat': (el) => abrirHoja('cat', el.dataset.id),
  'hoja-cerrar': () => cerrarHoja(),
  'act-pausar': () => alternarPausa(hoja.id),
  'act-borrar': () => borrarActividad(hoja.id),
  'cat-borrar': () => borrarCategoria(hoja.id),
  'conf-no': () => cerrarConfirmar(false),
  'conf-si': () => cerrarConfirmar(true),
  ordenar: () => { ordenando = !ordenando; renderActividades(); },
  'subir-act': (el) => mover('act', el.dataset.id, -1),
  'bajar-act': (el) => mover('act', el.dataset.id, 1),
  'subir-cat': (el) => mover('cat', el.dataset.id, -1),
  'bajar-cat': (el) => mover('cat', el.dataset.id, 1),
  periodo: (el) => { periodo = Number(el.dataset.dias); renderAvance(); },
  'exportar-csv': () => exportarCSV(),
  'exportar-json': () => exportarJSON(),
  'importar-json': () => $('#archivo-respaldo').click(),
  instalar: () => instalar(),
  'nueva-tarea': () => abrirHoja('tarea'),
  'act-calendar': () => calendarDesdeEditor(),
  actualizar: () => actualizarApp(),
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && acciones[el.dataset.action]) { acciones[el.dataset.action](el); return; }
  // Tocar una celda de la tabla también abre ese día.
  const td = e.target.closest('.tabla td[data-fecha]');
  if (td) irADia(td.dataset.fecha);
});

const ENFOCABLES = 'button:not([disabled]), input:not([disabled]), textarea, select, summary, [tabindex="-1"]';

document.addEventListener('keydown', (e) => {
  const capa = capaArriba();
  if (!capa) return;
  if (e.key === 'Escape') { e.preventDefault(); capa.cerrar(); return; }
  if (capa.el.id === 'checkin' && ck && ck.fase === 'preguntas' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const k = e.key.toLowerCase();
    if (k === 's') { e.preventDefault(); ckResponder(true); } else if (k === 'n') { e.preventDefault(); ckResponder(false); }
  }
  // El foco no sale de la capa mientras está abierta.
  if (e.key === 'Tab') {
    const foco = [...capa.el.querySelectorAll(ENFOCABLES)].filter((x) => x.offsetParent !== null && x.tabIndex >= 0);
    if (!foco.length) return;
    const i = foco.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); foco[foco.length - 1].focus(); } else if (!e.shiftKey && (i === -1 || i === foco.length - 1)) { e.preventDefault(); foco[0].focus(); }
  }
});

function cerrarCapas() {
  for (let n = capas.length; n > 0 && capas.length; n--) capaArriba().cerrar();
}

window.addEventListener('hashchange', () => { cerrarCapas(); render(); window.scrollTo(0, 0); });

// A medianoche (hora de Santiago) "hoy" pasa al día siguiente.
let ultimoHoy = hoyISO();
function revisarCambioDeDia() {
  const hoy = hoyISO();
  if (hoy === ultimoHoy) return;
  if (diaActual === ultimoHoy) diaActual = hoy;
  if (semanaActual === lunesDe(ultimoHoy)) semanaActual = lunesDe(hoy);
  ultimoHoy = hoy;
  if (!capas.length && !editandoNota) render();
}
setInterval(revisarCambioDeDia, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) revisarCambioDeDia(); });

// Otra pestaña cambió los datos.
window.addEventListener('storage', (e) => { if (e.key === KEY) { S = cargar(); if (!capas.length && !editandoNota) render(); } });

/* ---------- Al abrir: atajos del ícono y check-in de la noche ---------- */

const HORA_CHECKIN = 19; // desde esta hora, si falta responder hoy, la app abre el check-in
const fmtHora = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' });
let checkinAutoEl = null; // una vez por día mientras la app siga abierta

function checkinDeLaNoche() {
  const hoy = hoyISO();
  if (capas.length || vistaActual() !== 'dia' || checkinAutoEl === hoy) return;
  if (Number(fmtHora.format(new Date())) < HORA_CHECKIN) return;
  const { respondidas, total } = conteo(hoy);
  if (!total || respondidas === total) return;
  checkinAutoEl = hoy;
  diaActual = hoy;
  abrirCheckin(hoy);
}

function alAbrir() {
  // Los atajos del ícono abren ./?abrir=checkin o ./?abrir=tarea.
  const abrir = new URLSearchParams(location.search).get('abrir');
  if (abrir || !location.hash) history.replaceState(null, '', `${location.pathname}#dia`);
  render();
  if (abrir === 'tarea') {
    abrirHoja('tarea');
  } else if (abrir === 'checkin') {
    diaActual = hoyISO();
    checkinAutoEl = diaActual;
    renderDia();
    const { respondidas, total } = conteo(diaActual);
    abrirCheckin(diaActual, { desdeInicio: respondidas === total });
  } else {
    checkinDeLaNoche();
  }
}

// Volver a la app (que quedó abierta de antes) en la noche también abre el check-in.
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkinDeLaNoche(); });

alAbrir();
