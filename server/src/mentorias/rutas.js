// PymEdu Mentorías — API /api/mentorias/*
// Contrato de respuesta: src/4.-MENTORIAS/tipos.ts · Tablas: server/sql/03_mentorias.sql
// Habla con el núcleo solo vía ../cuentas/servicio.js y con el ERP vía ../erp.js#indicadoresNegocio.
import { Router } from 'express';
import { randomBytes } from 'crypto';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { permisosDe, requierePermiso, comunidadesDe, organizacionActiva, miembrosDe, contactoDe, organizacionesPorTipo } from '../cuentas/servicio.js';
import { indicadoresNegocio } from '../erp.js';
import { ProveedorVideo, ProveedorArchivos, ProveedorCorreo, ProveedorCalendario, fechaChile } from './adaptadores.js';

const router = Router();
const POR_PAGINA = 12;
const NIVEL_SEGMENTO = { A: 'escala', B: 'crecimiento', C: 'semilla' };
const ETIQUETA_NIVEL = { semilla: 'Semilla', crecimiento: 'Crecimiento', escala: 'Escala' };
const ETIQUETA_RECURSO = { video: 'Video', audio: 'Audio', pdf: 'Guía PDF' };

const todos = (sql, ...p) => db.prepare(sql).all(...p);
const uno = (sql, ...p) => db.prepare(sql).get(...p);
const ejecutar = (sql, ...p) => db.prepare(sql).run(...p);
/** Lista JS → literal de arreglo Postgres para `= ANY(?::text[])`. */
const arreglo = (lista) => `{${lista.map((x) => `"${String(x).replace(/["\\]/g, '')}"`).join(',')}}`;

const manejar = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (error) {
    console.error('[mentorias]', req.method, req.path, error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'error_interno' });
  }
};
const falla = (status, message) => Object.assign(new Error(message), { status });

// ── Visibilidad (comunidades cerradas: se verifica en CADA solicitud) ──────────
async function contexto(req) {
  if (req._ctx) return req._ctx;
  const comunidades = await comunidadesDe(req.perfil);
  const permisos = await permisosDe(req.perfil, req);
  req._ctx = { comunidades, ids: comunidades.map((c) => c.id), permisos, superadmin: req.perfil.rol === 'superadmin' };
  return req._ctx;
}

/** Condición SQL de «puede ver este curso publicado». Usa los parámetros (usuario, comunidades). */
const SQL_VISIBLE = `c.estado = 'publicado' AND (
  c.visibilidad = 'publico'
  OR (c.visibilidad = 'comunidad' AND c.comunidad_id = ANY(?::text[]))
  OR (c.visibilidad = 'privado' AND EXISTS (SELECT 1 FROM mentorias.inscripcion ip WHERE ip.curso_id = c.id AND ip.usuario_id = ?))
)`;

const SQL_RESUMEN = `
  SELECT c.*, cat.nombre AS categoria_nombre, i.id AS insc_id, i.estado AS insc_estado, i.grupo_id AS insc_grupo,
    i.ultima_posicion_seg,
    (SELECT count(*)::int FROM mentorias.leccion l WHERE l.curso_id = c.id) AS total_lecciones,
    (SELECT count(*)::int FROM mentorias.progreso_leccion pl WHERE pl.inscripcion_id = i.id AND pl.completado) AS lecciones_ok,
    (SELECT min(s.inicio) FROM mentorias.sesion s JOIN mentorias.grupo g ON g.id = s.grupo_id
      WHERE g.curso_id = c.id AND s.inicio > now() AND g.estado <> 'cancelado') AS proxima_inicio,
    EXISTS (SELECT 1 FROM mentorias.sesion s JOIN mentorias.grupo g ON g.id = s.grupo_id
      WHERE g.curso_id = c.id AND now() BETWEEN s.inicio AND s.fin) AS en_vivo
  FROM mentorias.curso c
  LEFT JOIN mentorias.categoria cat ON cat.slug = c.categoria_slug
  LEFT JOIN mentorias.inscripcion i ON i.curso_id = c.id AND i.usuario_id = ?`;

function aResumen(f, comunidades) {
  const comunidad = comunidades.find((x) => x.id === f.comunidad_id);
  const origen = f.visibilidad === 'comunidad'
    ? { tipo: 'comunidad', etiqueta: `Tu comunidad: ${comunidad?.nombre ?? f.organizacion_nombre}` }
    : f.organizacion_tipo === 'proveedor'
      ? { tipo: 'proveedor', etiqueta: f.organizacion_nombre }
      : { tipo: 'publico', etiqueta: 'Público' };
  const inscrito = !!f.insc_id && !['abandonada', 'reembolsada'].includes(f.insc_estado);
  return {
    id: f.id,
    titulo: f.titulo,
    descripcion_corta: f.descripcion.length > 140 ? `${f.descripcion.slice(0, 137).trimEnd()}…` : f.descripcion,
    formato: f.formato,
    visibilidad: f.visibilidad,
    origen,
    categoria: { slug: f.categoria_slug ?? 'general', nombre: f.categoria_nombre ?? 'General' },
    nivel_madurez: f.nivel_madurez,
    dificultad: f.dificultad,
    precio: f.precio,
    duracion_min: f.duracion_min,
    miniatura_url: f.miniatura_url,
    mentor: f.mentor_nombre ? { id: f.mentor_id, nombre: f.mentor_nombre, avatar_url: null } : null,
    tipo_recurso_principal: f.tipo_recurso_principal,
    estado_vivo: f.en_vivo ? { tipo: 'en_vivo' } : f.proxima_inicio ? { tipo: 'proxima', inicio: f.proxima_inicio } : { tipo: 'grabado' },
    inscrito,
    progreso_pct: inscrito && f.total_lecciones > 0 ? Math.round((f.lecciones_ok / f.total_lecciones) * 100) : 0,
  };
}

/** Curso visible o 404 (un enlace copiado no sirve a quien no es miembro). */
async function cursoVisible(req, id, { gestion = false } = {}) {
  const { ids } = await contexto(req);
  let fila = await uno(`${SQL_RESUMEN} WHERE c.id = ? AND ${SQL_VISIBLE}`, req.perfil.id, id, arreglo(ids), req.perfil.id);
  // Autores (su organización) y revisores (su cola) pueden abrir borradores o cursos en revisión.
  if (!fila && gestion) {
    const org = await organizacionActiva(req.perfil);
    const { sql, params } = await filtroRevision(req);
    fila = await uno(`${SQL_RESUMEN} WHERE c.id = ? AND (c.organizacion_id = ? OR c.creado_por = ? OR (c.estado = 'en_revision'${sql}))`,
      req.perfil.id, id, org?.id ?? '', req.perfil.id, ...params);
  }
  if (!fila) throw falla(404, 'curso_no_disponible');
  return fila;
}

async function recalcularProgreso(inscripcionId, cursoId) {
  const f = await uno(`
    SELECT (SELECT count(*)::int FROM mentorias.leccion WHERE curso_id = ?) AS total,
           (SELECT count(*)::int FROM mentorias.progreso_leccion WHERE inscripcion_id = ? AND completado) AS ok`, cursoId, inscripcionId);
  const pct = f.total > 0 ? Math.round((f.ok / f.total) * 100) : 0;
  if (pct === 100) {
    await ejecutar("UPDATE mentorias.inscripcion SET estado = 'completada', completado_en = now() WHERE id = ? AND estado = 'activa'", inscripcionId);
    await ejecutar(`INSERT INTO mentorias.certificado (inscripcion_id, codigo_verificacion) VALUES (?, ?) ON CONFLICT (inscripcion_id) DO NOTHING`,
      inscripcionId, `PYM-${randomBytes(4).toString('hex').toUpperCase()}`);
  }
  return pct;
}

// ═════════════════════════════ Rutas públicas internas ═════════════════════════

// Descarga con enlace firmado (sin token: la firma expira en 10 minutos).
router.get('/recursos/:id/descargar', manejar(async (req, res) => {
  const { u, exp, firma } = req.query;
  if (!ProveedorArchivos.verificar(req.params.id, u, exp, firma)) throw falla(403, 'enlace_expirado');
  const r = await uno('SELECT nombre, url_almacenamiento FROM mentorias.recurso WHERE id = ?', req.params.id);
  if (!r) throw falla(404, 'recurso_no_encontrado');
  if (r.url_almacenamiento.startsWith('demo://')) {
    res.setHeader('Content-Disposition', `attachment; filename="${r.nombre.replace(/[^\w.\- ]/g, '')}.txt"`);
    return res.type('text/plain').send(`${r.nombre}\n\nMaterial de demostración de PymEdu Mentorías (modo local).`);
  }
  return res.redirect(r.url_almacenamiento);
}));

// Eventos del núcleo y del ERP (webhook interno entre servicios).
router.post('/eventos', manejar(async (req, res) => {
  if (req.get('x-pymedu-evento') !== (process.env.EVENTOS_SECRET || 'eventos-dev')) throw falla(401, 'firma_invalida');
  const { tipo, payload = {} } = req.body ?? {};
  await ejecutar('INSERT INTO mentorias.evento_recibido (tipo, payload, procesado) VALUES (?, ?::jsonb, true)', tipo, JSON.stringify(payload));
  if (tipo === 'pago.confirmado' && payload.pago_id) {
    await ejecutar("UPDATE mentorias.inscripcion SET estado = 'activa' WHERE pago_id = ? AND estado = 'pendiente_pago'", payload.pago_id);
  }
  res.json({ ok: true });
}));

const SQL_CERTIFICADO = `
  SELECT ce.codigo_verificacion AS codigo, ce.emitido_en, COALESCE(i.usuario_nombre, 'Participante') AS participante,
    c.id AS curso_id, c.titulo AS curso, c.organizacion_nombre AS organizacion
  FROM mentorias.certificado ce JOIN mentorias.inscripcion i ON i.id = ce.inscripcion_id JOIN mentorias.curso c ON c.id = i.curso_id`;

// Verificación pública de certificados (sin sesión): solo nombre, curso, organización y fecha.
router.get('/certificados/:codigo', manejar(async (req, res) => {
  const codigo = String(req.params.codigo).trim().toUpperCase();
  const f = /^[A-Z0-9-]{4,40}$/.test(codigo) ? await uno(`${SQL_CERTIFICADO} WHERE ce.codigo_verificacion = ?`, codigo) : null;
  if (!f) throw falla(404, 'certificado_no_encontrado');
  res.json({ data: { participante: f.participante, curso: f.curso, organizacion: f.organizacion, emitido_en: f.emitido_en } });
}));

router.use(requireAuth);

// ═════════════════════════════ Emprendedor ═════════════════════════════════════

router.get('/categorias', manejar(async (req, res) => {
  res.json({ data: await todos('SELECT slug, nombre FROM mentorias.categoria WHERE activa ORDER BY orden, nombre') });
}));

router.get('/catalogo', manejar(async (req, res) => {
  const { comunidades, ids } = await contexto(req);
  const { categoria, nivel, formato, q } = req.query;
  const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
  const visibles = [arreglo(ids), req.perfil.id];

  const filtros = [];
  const params = [];
  if (categoria) { filtros.push('c.categoria_slug = ?'); params.push(String(categoria)); }
  if (nivel) { filtros.push('c.nivel_madurez = ?'); params.push(String(nivel)); }
  if (formato) { filtros.push('c.tipo_recurso_principal = ?'); params.push(String(formato)); }
  if (q) { filtros.push('(c.titulo ILIKE ? OR c.descripcion ILIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const extra = filtros.length ? ` AND ${filtros.join(' AND ')}` : '';

  const [filas, total, facetas] = await Promise.all([
    todos(`${SQL_RESUMEN} WHERE ${SQL_VISIBLE}${extra}
      ORDER BY (c.visibilidad = 'comunidad') DESC, c.destacado DESC, c.publicado_en DESC NULLS LAST
      LIMIT ${POR_PAGINA} OFFSET ${(pagina - 1) * POR_PAGINA}`, req.perfil.id, ...visibles, ...params),
    uno(`SELECT count(*)::int AS n FROM mentorias.curso c WHERE ${SQL_VISIBLE}${extra}`, ...visibles, ...params),
    // Facetas sobre todo lo visible (sin los filtros) para mostrar contadores estables.
    todos(`SELECT 'categoria' AS k, c.categoria_slug AS v, max(cat.nombre) AS nombre, count(*)::int AS n
             FROM mentorias.curso c LEFT JOIN mentorias.categoria cat ON cat.slug = c.categoria_slug WHERE ${SQL_VISIBLE} GROUP BY c.categoria_slug
           UNION ALL SELECT 'nivel', c.nivel_madurez, NULL, count(*)::int FROM mentorias.curso c WHERE ${SQL_VISIBLE} GROUP BY c.nivel_madurez
           UNION ALL SELECT 'formato', c.tipo_recurso_principal, NULL, count(*)::int FROM mentorias.curso c WHERE ${SQL_VISIBLE} GROUP BY c.tipo_recurso_principal`,
    ...visibles, ...visibles, ...visibles),
  ]);

  const faceta = (k, etiquetas) => facetas.filter((f) => f.k === k && f.v)
    .map((f) => ({ valor: f.v, nombre: f.nombre ?? etiquetas?.[f.v] ?? f.v, total: f.n }));
  res.json({
    data: filas.map((f) => aResumen(f, comunidades)),
    total: total.n,
    pagina,
    facetas: { categorias: faceta('categoria'), niveles: faceta('nivel', ETIQUETA_NIVEL), formatos: faceta('formato', ETIQUETA_RECURSO) },
  });
}));

router.get('/cursos/:id', manejar(async (req, res) => {
  const { comunidades } = await contexto(req);
  const f = await cursoVisible(req, req.params.id, { gestion: true });
  const inscrito = !!f.insc_id && ['activa', 'completada'].includes(f.insc_estado);

  const [lecciones, recursos, grupos, comentarios, promedio, certificado] = await Promise.all([
    todos(`SELECT l.*, m.titulo AS modulo_titulo, m.orden AS modulo_orden, COALESCE(pl.completado, false) AS completado
           FROM mentorias.leccion l JOIN mentorias.modulo m ON m.id = l.modulo_id
           LEFT JOIN mentorias.progreso_leccion pl ON pl.leccion_id = l.id AND pl.inscripcion_id = ?
           WHERE l.curso_id = ? ORDER BY m.orden, l.orden`, f.insc_id ?? '', f.id),
    todos('SELECT id, nombre, tipo, peso_kb FROM mentorias.recurso WHERE curso_id = ? ORDER BY nombre', f.id),
    // DATE como texto: serializado como Date se corría un día al mostrarlo en hora de Chile.
    todos(`SELECT g.*, g.fecha_inicio::text AS f_inicio, g.fecha_fin::text AS f_fin,
             (SELECT count(*)::int FROM mentorias.inscripcion i WHERE i.grupo_id = g.id AND i.estado IN ('activa','pendiente_pago','completada')) AS inscritos,
             s.id AS s_id, s.inicio AS s_inicio, s.fin AS s_fin, s.url_sala AS s_sala, s.url_grabacion AS s_grab
           FROM mentorias.grupo g
           LEFT JOIN LATERAL (SELECT * FROM mentorias.sesion s WHERE s.grupo_id = g.id AND s.fin > now() ORDER BY s.inicio LIMIT 1) s ON true
           WHERE g.curso_id = ? AND g.estado <> 'cancelado' ORDER BY g.fecha_inicio`, f.id),
    todos('SELECT id, usuario_nombre, estrellas, texto, creado_en FROM mentorias.comentario WHERE curso_id = ? AND NOT oculto ORDER BY creado_en DESC LIMIT 20', f.id),
    uno('SELECT count(*)::int AS total, COALESCE(round(avg(estrellas)::numeric, 1), 0)::float8 AS promedio FROM mentorias.comentario WHERE curso_id = ? AND NOT oculto', f.id),
    f.insc_id ? uno(`${SQL_CERTIFICADO} WHERE ce.inscripcion_id = ?`, f.insc_id) : null,
  ]);

  // Candados con explicación (fecha o paso previo).
  const modulos = [];
  let anteriorCompleto = true;
  let paso = 0;
  for (const l of lecciones) {
    paso += 1;
    let modulo = modulos.find((m) => m.id === l.modulo_id);
    if (!modulo) modulos.push(modulo = { id: l.modulo_id, orden: l.modulo_orden, titulo: l.modulo_titulo, lecciones: [] });
    const bloqueo = !inscrito ? { motivo: 'Inscríbete para acceder a esta lección' }
      : l.disponible_desde && new Date(l.disponible_desde) > new Date() ? { motivo: `Se abre el ${fechaChile(l.disponible_desde)}` }
        : l.requiere_anterior && !anteriorCompleto ? { motivo: `Completa el paso ${paso - 1}` } : null;
    modulo.lecciones.push({
      id: l.id, orden: l.orden, titulo: l.titulo, tipo: l.tipo, duracion_min: l.duracion_min,
      url_recurso: bloqueo ? null : l.url_recurso, completado: l.completado, bloqueo,
    });
    anteriorCompleto = l.completado;
  }

  res.json({
    data: {
      ...aResumen(f, comunidades),
      descripcion: f.descripcion,
      objetivos: f.objetivos ?? [],
      // Campos extra para el editor de gestión (no forman parte de la ficha pública).
      estado: f.estado,
      comunidad_id: f.comunidad_id,
      modulos,
      recursos,
      grupos: grupos.map((g) => ({
        id: g.id, nombre: g.nombre, fecha_inicio: g.f_inicio, fecha_fin: g.f_fin, cupos: g.cupos, inscritos: g.inscritos,
        estado: g.estado === 'abierto' && g.inscritos >= g.cupos ? 'lleno' : g.estado,
        mentor: g.mentor_nombre ? { id: g.mentor_id, nombre: g.mentor_nombre } : null,
        proxima_sesion: g.s_id ? { id: g.s_id, inicio: g.s_inicio, fin: g.s_fin, url_sala: inscrito ? g.s_sala : null, url_grabacion: inscrito ? g.s_grab : null } : null,
      })),
      comentarios: { total: promedio.total, promedio: promedio.promedio, items: comentarios },
      inscripcion: f.insc_id ? { id: f.insc_id, estado: f.insc_estado, grupo_id: f.insc_grupo, progreso_pct: aResumen(f, comunidades).progreso_pct } : null,
      ultima_posicion_seg: f.ultima_posicion_seg ?? 0,
      certificado: certificado ?? null,
    },
  });
}));

router.post('/inscripciones', manejar(async (req, res) => {
  const { curso_id, grupo_id } = req.body ?? {};
  if (!curso_id) throw falla(400, 'curso_requerido');
  const curso = await cursoVisible(req, curso_id);
  const { ids } = await contexto(req);

  const existente = await uno("SELECT id, estado FROM mentorias.inscripcion WHERE usuario_id = ? AND curso_id = ? AND estado NOT IN ('abandonada','reembolsada')", req.perfil.id, curso_id);
  if (existente) return res.json({ data: existente });

  const grupo = await uno(`
    SELECT g.id, g.cupos, (SELECT count(*)::int FROM mentorias.inscripcion i WHERE i.grupo_id = g.id AND i.estado IN ('activa','pendiente_pago','completada')) AS ocupados
    FROM mentorias.grupo g WHERE g.curso_id = ? AND g.estado IN ('abierto','lleno','en_curso') AND g.fecha_fin >= CURRENT_DATE ${grupo_id ? 'AND g.id = ?' : ''}
    ORDER BY g.fecha_inicio LIMIT 1`, ...(grupo_id ? [curso_id, grupo_id] : [curso_id]));

  // Cupo institucional comprado para alguna comunidad del usuario → gratis para él.
  const cupo = await uno(`SELECT id FROM mentorias.cupos_institucionales WHERE curso_id = ? AND comunidad_id = ANY(?::text[])
    AND usados < cupos AND (vigencia_hasta IS NULL OR vigencia_hasta >= CURRENT_DATE) LIMIT 1`, curso_id, arreglo(ids));
  const origen = curso.visibilidad === 'comunidad' ? 'institucion_propia' : cupo ? 'cupo_institucional' : curso.precio === 0 ? 'gratuito'
    : curso.visibilidad === 'privado' ? 'enlace_proveedor' : 'catalogo';
  const lleno = grupo && grupo.ocupados >= grupo.cupos;
  const estado = lleno ? 'lista_espera' : (curso.precio > 0 && ['catalogo', 'enlace_proveedor'].includes(origen) ? 'pendiente_pago' : 'activa');

  const nueva = await uno(`
    INSERT INTO mentorias.inscripcion (usuario_id, usuario_nombre, organizacion_id, curso_id, grupo_id, estado, origen)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (usuario_id, curso_id) DO UPDATE SET estado = EXCLUDED.estado, grupo_id = EXCLUDED.grupo_id, origen = EXCLUDED.origen
    RETURNING id, estado`, req.perfil.id, req.perfil.nombre_completo, ids[0] ?? null, curso_id, grupo?.id ?? null, estado, origen);

  let posicion_espera;
  if (lleno) {
    const pos = await uno('SELECT COALESCE(max(posicion), 0)::int + 1 AS p FROM mentorias.lista_espera WHERE grupo_id = ?', grupo.id);
    await ejecutar('INSERT INTO mentorias.lista_espera (grupo_id, usuario_id, posicion) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', grupo.id, req.perfil.id, pos.p);
    posicion_espera = pos.p;
  } else {
    if (cupo) await ejecutar('UPDATE mentorias.cupos_institucionales SET usados = usados + 1 WHERE id = ?', cupo.id);
    if (grupo && grupo.ocupados + 1 >= grupo.cupos) await ejecutar("UPDATE mentorias.grupo SET estado = 'lleno' WHERE id = ? AND estado = 'abierto'", grupo.id);
  }
  res.status(201).json({ data: { ...nueva, posicion_espera } });
}));

router.get('/mi-acompanamiento', manejar(async (req, res) => {
  const { comunidades, ids } = await contexto(req);
  const yo = req.perfil.id;
  const [proxima, ruta, actividad, indicadores] = await Promise.all([
    uno(`SELECT c.id AS curso_id, c.titulo AS curso_titulo, s.inicio, g.mentor_nombre, s.url_sala
         FROM mentorias.inscripcion i JOIN mentorias.curso c ON c.id = i.curso_id
         JOIN mentorias.grupo g ON g.id = i.grupo_id JOIN mentorias.sesion s ON s.grupo_id = g.id
         WHERE i.usuario_id = ? AND i.estado = 'activa' AND s.fin > now() ORDER BY s.inicio LIMIT 1`, yo),
    uno(`SELECT count(*) FILTER (WHERE i.estado = 'completada')::int AS completados, count(*)::int AS totales,
           COALESCE(avg(CASE WHEN t.total > 0 THEN 100.0 * t.ok / t.total ELSE 0 END), 0)::float8 AS pct
         FROM mentorias.inscripcion i
         CROSS JOIN LATERAL (SELECT (SELECT count(*) FROM mentorias.leccion WHERE curso_id = i.curso_id) AS total,
           (SELECT count(*) FROM mentorias.progreso_leccion WHERE inscripcion_id = i.id AND completado) AS ok) t
         WHERE i.usuario_id = ? AND i.estado IN ('activa','completada')`, yo),
    todos(`SELECT * FROM (
           SELECT 'progreso' AS tipo, 'Completaste «' || l.titulo || '»' AS texto, pl.actualizado_en AS fecha
             FROM mentorias.progreso_leccion pl JOIN mentorias.leccion l ON l.id = pl.leccion_id
             JOIN mentorias.inscripcion i ON i.id = pl.inscripcion_id WHERE i.usuario_id = ? AND pl.completado
           UNION ALL SELECT 'inscripcion', 'Te inscribiste en «' || c.titulo || '»', i.creado_en
             FROM mentorias.inscripcion i JOIN mentorias.curso c ON c.id = i.curso_id WHERE i.usuario_id = ?
           UNION ALL SELECT 'certificado', 'Obtuviste el certificado de «' || c.titulo || '»', ce.emitido_en
             FROM mentorias.certificado ce JOIN mentorias.inscripcion i ON i.id = ce.inscripcion_id
             JOIN mentorias.curso c ON c.id = i.curso_id WHERE i.usuario_id = ?
           ) a ORDER BY fecha DESC LIMIT 5`, yo, yo, yo),
    indicadoresNegocio(yo),
  ]);

  // Recomendación según datos del ERP (se calcula en PymEdu; no se comparte con el proveedor).
  let recomendacion = null;
  if (indicadores.conectado) {
    const regla = indicadores.ventasPorCobrar >= 5 ? ['cobranza', `Tienes ${indicadores.ventasPorCobrar} ventas sin cobrar: este contenido te ayuda a recuperar ese dinero.`]
      : indicadores.gastos90 > indicadores.ventas90 ? ['flujo_caja', 'En los últimos 90 días gastaste más de lo que vendiste: ordena tu flujo de caja.']
        : indicadores.productos >= 30 ? ['inventario', `Manejas ${indicadores.productos} productos: optimiza tu inventario y márgenes.`]
          : ['ventas', 'Basado en tu actividad reciente en el ERP, este contenido te ayuda a vender más.'];
    const fila = await uno(`${SQL_RESUMEN} WHERE ${SQL_VISIBLE} AND ? = ANY(c.etiquetas_erp) AND i.id IS NULL ORDER BY c.destacado DESC LIMIT 1`,
      yo, arreglo(ids), yo, regla[0]);
    if (fila) recomendacion = { ...aResumen(fila, comunidades), motivo: regla[1] };
  }

  res.json({
    data: {
      proxima_sesion: proxima ?? null,
      ruta: {
        nivel: NIVEL_SEGMENTO[req.perfil.segmento_negocio] ?? 'semilla',
        progreso_pct: Math.round(ruta.pct),
        cursos_completados: ruta.completados,
        cursos_totales: ruta.totales,
      },
      actividad,
      recomendacion,
      erp_conectado: indicadores.conectado,
    },
  });
}));

router.post('/lecciones/:id/progreso', manejar(async (req, res) => {
  const l = await uno('SELECT id, curso_id FROM mentorias.leccion WHERE id = ?', req.params.id);
  if (!l) throw falla(404, 'leccion_no_encontrada');
  await cursoVisible(req, l.curso_id);
  const insc = await uno("SELECT id FROM mentorias.inscripcion WHERE usuario_id = ? AND curso_id = ? AND estado IN ('activa','completada')", req.perfil.id, l.curso_id);
  if (!insc) throw falla(403, 'no_inscrito');
  const { completado, posicion_seg } = req.body ?? {};
  if (typeof completado === 'boolean') {
    await ejecutar(`INSERT INTO mentorias.progreso_leccion (inscripcion_id, leccion_id, completado) VALUES (?, ?, ?)
      ON CONFLICT (inscripcion_id, leccion_id) DO UPDATE SET completado = EXCLUDED.completado, actualizado_en = now()`, insc.id, l.id, completado);
  }
  if (Number.isFinite(posicion_seg)) await ejecutar('UPDATE mentorias.inscripcion SET ultima_posicion_seg = ? WHERE id = ?', Math.max(0, Math.round(posicion_seg)), insc.id);
  res.json({ data: { progreso_pct: await recalcularProgreso(insc.id, l.curso_id) } });
}));

router.get('/recursos/:id/enlace', manejar(async (req, res) => {
  const r = await uno('SELECT id, curso_id FROM mentorias.recurso WHERE id = ?', req.params.id);
  if (!r) throw falla(404, 'recurso_no_encontrado');
  await cursoVisible(req, r.curso_id);
  const insc = await uno("SELECT 1 FROM mentorias.inscripcion WHERE usuario_id = ? AND curso_id = ? AND estado IN ('activa','completada')", req.perfil.id, r.curso_id);
  if (!insc) throw falla(403, 'solo_inscritos');
  res.json({ data: ProveedorArchivos.firmar(r.id, req.perfil.id) });
}));

router.post('/cursos/:id/comentarios', manejar(async (req, res) => {
  await cursoVisible(req, req.params.id);
  const estrellas = Math.min(5, Math.max(1, parseInt(req.body?.estrellas, 10) || 0));
  const texto = String(req.body?.texto ?? '').trim().slice(0, 1000);
  const insc = await uno("SELECT 1 FROM mentorias.inscripcion WHERE usuario_id = ? AND curso_id = ? AND estado IN ('activa','completada')", req.perfil.id, req.params.id);
  if (!insc) throw falla(403, 'solo_inscritos');
  const c = await uno(`INSERT INTO mentorias.comentario (curso_id, usuario_id, usuario_nombre, estrellas, texto) VALUES (?, ?, ?, ?, ?)
    RETURNING id, usuario_nombre, estrellas, texto, creado_en`, req.params.id, req.perfil.id, req.perfil.nombre_completo, estrellas, texto);
  res.status(201).json({ data: c });
}));

// ═════════════════════════════ Gestión de contenido ════════════════════════════

const SQL_GESTION = `
  SELECT c.id, c.titulo, c.formato, c.visibilidad, c.estado, c.precio, c.motivo_rechazo, c.actualizado_en, c.enviado_revision_en,
    c.organizacion_id, c.organizacion_nombre, c.comunidad_id, c.categoria_slug, cat.nombre AS categoria_nombre,
    (SELECT count(*)::int FROM mentorias.inscripcion i WHERE i.curso_id = c.id AND i.estado IN ('activa','completada')) AS inscritos
  FROM mentorias.curso c LEFT JOIN mentorias.categoria cat ON cat.slug = c.categoria_slug`;

const aGestion = (f) => ({
  id: f.id, titulo: f.titulo, formato: f.formato, visibilidad: f.visibilidad, estado: f.estado,
  categoria: { slug: f.categoria_slug ?? 'general', nombre: f.categoria_nombre ?? 'General' },
  precio: f.precio, inscritos: f.inscritos, actualizado_en: f.actualizado_en, motivo_rechazo: f.motivo_rechazo,
  organizacion: { id: f.organizacion_id, nombre: f.organizacion_nombre },
});

async function cursoPropio(req, id) {
  const org = await organizacionActiva(req.perfil);
  const f = await uno(`${SQL_GESTION} WHERE c.id = ?`, id);
  if (!f) throw falla(404, 'curso_no_encontrado');
  if (req.perfil.rol !== 'superadmin' && f.organizacion_id !== org?.id) throw falla(403, 'sin_permiso');
  return f;
}

/** Comunidades donde el usuario puede publicar contenido cerrado. */
async function comunidadesPublicables(req) {
  if (req.perfil.rol === 'superadmin') return organizacionesPorTipo(['institucion', 'comunidad']);
  const org = await organizacionActiva(req.perfil);
  return org && org.tipo === 'institucion' ? [{ id: org.id, nombre: org.nombre }] : [];
}

function validarEntrada(b, parcial = false) {
  const errores = [];
  const req = (campo) => !parcial || b[campo] !== undefined;
  if (req('titulo') && !String(b.titulo ?? '').trim()) errores.push('titulo');
  if (req('formato') && !['curso', 'mentoria_grupal', 'taller'].includes(b.formato)) errores.push('formato');
  if (req('visibilidad') && !['comunidad', 'publico', 'privado'].includes(b.visibilidad)) errores.push('visibilidad');
  if (req('nivel_madurez') && !['semilla', 'crecimiento', 'escala'].includes(b.nivel_madurez)) errores.push('nivel_madurez');
  if (req('dificultad') && !['basico', 'intermedio', 'avanzado'].includes(b.dificultad)) errores.push('dificultad');
  if (b.precio !== undefined && (!Number.isFinite(Number(b.precio)) || Number(b.precio) < 0)) errores.push('precio');
  if (errores.length) throw falla(400, `campos_invalidos:${errores.join(',')}`);
}

router.get('/gestion/cursos', manejar(async (req, res) => {
  const org = await organizacionActiva(req.perfil);
  const permisos = await permisosDe(req.perfil, req);
  const filas = req.perfil.rol === 'superadmin'
    ? await todos(`${SQL_GESTION} ORDER BY c.actualizado_en DESC`)
    : await todos(`${SQL_GESTION} WHERE c.organizacion_id = ? OR c.creado_por = ? ORDER BY c.actualizado_en DESC`, org?.id ?? '', req.perfil.id);
  res.json({ data: filas.map(aGestion), puede_crear: permisos.has('mentorias.curso.crear'), comunidades: await comunidadesPublicables(req) });
}));

router.post('/cursos', requierePermiso('mentorias.curso.crear'), manejar(async (req, res) => {
  const b = req.body ?? {};
  validarEntrada(b);
  const org = await organizacionActiva(req.perfil);
  if (b.visibilidad === 'comunidad') {
    const permitidas = await comunidadesPublicables(req);
    if (!permitidas.some((c) => c.id === b.comunidad_id)) throw falla(400, 'comunidad_no_permitida');
  }
  const tipoOrg = org?.tipo === 'proveedor' ? 'proveedor' : org?.tipo === 'institucion' ? 'institucion' : 'plataforma';
  const nuevo = await uno(`
    INSERT INTO mentorias.curso (organizacion_id, organizacion_nombre, organizacion_tipo, titulo, descripcion, objetivos, formato, visibilidad,
      comunidad_id, categoria_slug, nivel_madurez, dificultad, precio, duracion_min, miniatura_url, mentor_id, mentor_nombre, creado_por)
    VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  org?.id ?? 'org-pymedu-plataforma', org?.nombre ?? 'PymEdu', tipoOrg, String(b.titulo).trim(), String(b.descripcion ?? ''),
  JSON.stringify(Array.isArray(b.objetivos) ? b.objetivos.slice(0, 10) : []), b.formato, b.visibilidad,
  b.visibilidad === 'comunidad' ? b.comunidad_id : null, b.categoria_slug || null, b.nivel_madurez, b.dificultad,
  Math.round(Number(b.precio) || 0), Math.round(Number(b.duracion_min) || 0),
  b.miniatura_url || ProveedorVideo.miniatura(b.url_video) || null, req.perfil.id, req.perfil.nombre_completo, req.perfil.id);
  res.status(201).json({ data: aGestion(await uno(`${SQL_GESTION} WHERE c.id = ?`, nuevo.id)) });
}));

router.patch('/cursos/:id', requierePermiso('mentorias.curso.crear'), manejar(async (req, res) => {
  const actual = await cursoPropio(req, req.params.id);
  if (!['borrador', 'rechazado'].includes(actual.estado)) throw falla(409, 'solo_borradores_editables');
  const b = req.body ?? {};
  validarEntrada(b, true);
  const campos = ['titulo', 'descripcion', 'formato', 'visibilidad', 'categoria_slug', 'nivel_madurez', 'dificultad', 'precio', 'duracion_min', 'miniatura_url', 'comunidad_id'];
  const sets = [];
  const params = [];
  for (const c of campos) if (b[c] !== undefined) { sets.push(`${c} = ?`); params.push(['precio', 'duracion_min'].includes(c) ? Math.round(Number(b[c]) || 0) : b[c]); }
  if (b.objetivos !== undefined) { sets.push('objetivos = ?::jsonb'); params.push(JSON.stringify(b.objetivos)); }
  if (sets.length) await ejecutar(`UPDATE mentorias.curso SET ${sets.join(', ')}, actualizado_en = now() WHERE id = ?`, ...params, req.params.id);
  res.json({ data: aGestion(await uno(`${SQL_GESTION} WHERE c.id = ?`, req.params.id)) });
}));

// Enviar a revisión: «privado» pasa por revisión básica automática; el resto, a la cola.
router.post('/cursos/:id/revision', requierePermiso('mentorias.curso.publicar'), manejar(async (req, res) => {
  const actual = await cursoPropio(req, req.params.id);
  if (!['borrador', 'rechazado'].includes(actual.estado)) throw falla(409, 'estado_invalido');
  if (!(await uno('SELECT 1 FROM mentorias.leccion WHERE curso_id = ? LIMIT 1', actual.id))) throw falla(409, 'curso_sin_contenido');
  const directo = actual.visibilidad === 'privado';
  await ejecutar(`UPDATE mentorias.curso SET estado = ?, motivo_rechazo = NULL, enviado_revision_en = now(),
    publicado_en = CASE WHEN ? THEN now() ELSE publicado_en END, actualizado_en = now() WHERE id = ?`,
  directo ? 'publicado' : 'en_revision', directo, req.params.id);
  res.json({ data: aGestion(await uno(`${SQL_GESTION} WHERE c.id = ?`, req.params.id)) });
}));

/** Cola visible para quien revisa: comité → públicos; admin institucional → su comunidad; superadmin → todo. */
async function filtroRevision(req) {
  if (req.perfil.rol === 'superadmin') return { sql: '', params: [] };
  const org = await organizacionActiva(req.perfil);
  const esCurador = !!(await uno('SELECT 1 FROM mentorias.curador WHERE usuario_id = ? AND activo', req.perfil.id)) || req.perfil.rol === 'curador';
  const partes = [];
  const params = [];
  if (esCurador) partes.push("c.visibilidad = 'publico'");
  if (org?.tipo === 'institucion' && req.perfil.rol === 'admin_institucional') { partes.push("(c.visibilidad = 'comunidad' AND c.comunidad_id = ?)"); params.push(org.id); }
  return { sql: partes.length ? ` AND (${partes.join(' OR ')})` : ' AND false', params };
}

router.get('/revisiones/pendientes', requierePermiso('mentorias.curso.aprobar'), manejar(async (req, res) => {
  const { sql, params } = await filtroRevision(req);
  const filas = await todos(`${SQL_GESTION} WHERE c.estado = 'en_revision'${sql} ORDER BY c.enviado_revision_en`, ...params);
  res.json({
    data: filas.map((f) => ({ ...aGestion(f), enviado_en: f.enviado_revision_en, aprobador: f.visibilidad === 'comunidad' ? 'institucion' : f.visibilidad === 'privado' ? 'automatica' : 'comite' })),
  });
}));

router.post('/cursos/:id/aprobar', requierePermiso('mentorias.curso.aprobar'), manejar(async (req, res) => {
  const { sql, params } = await filtroRevision(req);
  const curso = await uno(`${SQL_GESTION} WHERE c.id = ? AND c.estado = 'en_revision'${sql}`, req.params.id, ...params);
  if (!curso) throw falla(404, 'curso_no_en_tu_cola');
  const { aprobado, motivo, checklist = {} } = req.body ?? {};
  const completo = ['pertinencia', 'calidad', 'sin_info_enganosa', 'precio_declarado'].every((k) => checklist[k] === true);
  if (aprobado && !completo) throw falla(400, 'checklist_incompleto');
  if (!aprobado && !String(motivo ?? '').trim()) throw falla(400, 'motivo_requerido');
  await ejecutar('INSERT INTO mentorias.revision_curso (curso_id, revisor_id, checklist, resultado, motivo) VALUES (?, ?, ?::jsonb, ?, ?)',
    curso.id, req.perfil.id, JSON.stringify(checklist), aprobado ? 'aprobado' : 'rechazado', motivo ?? null);
  await ejecutar(`UPDATE mentorias.curso SET estado = ?, motivo_rechazo = ?, publicado_en = CASE WHEN ? THEN now() ELSE publicado_en END,
    actualizado_en = now() WHERE id = ?`, aprobado ? 'publicado' : 'rechazado', aprobado ? null : String(motivo).trim(), !!aprobado, curso.id);
  res.json({ data: aGestion(await uno(`${SQL_GESTION} WHERE c.id = ?`, curso.id)) });
}));

// ═════════════════════════════ Paneles y rendición de cuentas ══════════════════

// % de asistencia sobre las asistencias registradas por los mentores (NULL = aún sin registros).
// Se cruza con la inscripción para respetar el filtro de miembros de la institución.
const SQL_ASISTENCIA = `SELECT round(100.0 * avg(CASE WHEN a.asistio THEN 1 ELSE 0 END))::int FROM mentorias.asistencia a
  JOIN mentorias.sesion s ON s.id = a.sesion_id JOIN mentorias.grupo g ON g.id = s.grupo_id
  JOIN mentorias.inscripcion i ON i.usuario_id = a.usuario_id AND i.curso_id = g.curso_id`;

async function panel(filtroCursos, pCursos, filtroInscritos = '', pInscritos = []) {
  const por_curso = await todos(`
    SELECT c.id AS curso_id, c.titulo,
      count(i.id) FILTER (WHERE i.estado IN ('activa','completada'))::int AS inscritos,
      count(i.id) FILTER (WHERE i.estado = 'completada')::int AS completados,
      COALESCE(round(sum(h.min) / 60.0, 1), 0)::float8 AS horas,
      (${SQL_ASISTENCIA} WHERE g.curso_id = c.id ${filtroInscritos}) AS asistencia_pct
    FROM mentorias.curso c
    LEFT JOIN mentorias.inscripcion i ON i.curso_id = c.id ${filtroInscritos}
    LEFT JOIN LATERAL (SELECT COALESCE(sum(l.duracion_min), 0) AS min FROM mentorias.progreso_leccion pl
      JOIN mentorias.leccion l ON l.id = pl.leccion_id WHERE pl.inscripcion_id = i.id AND pl.completado) h ON true
    WHERE ${filtroCursos} GROUP BY c.id, c.titulo ORDER BY inscritos DESC`, ...pInscritos, ...pInscritos, ...pCursos);
  const extra = await uno(`
    SELECT (SELECT count(*)::int FROM mentorias.certificado ce JOIN mentorias.inscripcion i ON i.id = ce.inscripcion_id
             JOIN mentorias.curso c ON c.id = i.curso_id WHERE ${filtroCursos} ${filtroInscritos}) AS certificados,
           (${SQL_ASISTENCIA} JOIN mentorias.curso c ON c.id = g.curso_id WHERE ${filtroCursos} ${filtroInscritos}) AS asistencia_pct,
           (SELECT count(*)::int FROM mentorias.curso c WHERE ${filtroCursos} AND c.estado = 'publicado') AS publicados`,
  ...pCursos, ...pInscritos, ...pCursos, ...pInscritos, ...pCursos);
  const suma = (k) => por_curso.reduce((a, f) => a + f[k], 0);
  return {
    cursos_publicados: extra.publicados, inscritos: suma('inscritos'), completados: suma('completados'),
    certificados: extra.certificados, horas_consumidas: Math.round(suma('horas') * 10) / 10, asistencia_pct: extra.asistencia_pct, por_curso,
  };
}

router.get('/panel/institucion', requierePermiso('mentorias.panel.ver'), manejar(async (req, res) => {
  const org = await organizacionActiva(req.perfil);
  if (req.perfil.rol === 'superadmin') return res.json({ data: await panel('true', []) });
  if (org?.tipo !== 'institucion') throw falla(403, 'solo_instituciones');
  // Uso de la comunidad: cursos propios + cursos del catálogo que tomaron sus miembros.
  res.json({ data: await panel('(c.comunidad_id = ? OR c.organizacion_id = ? OR c.id IN (SELECT curso_id FROM mentorias.inscripcion WHERE organizacion_id = ?))', [org.id, org.id, org.id], 'AND i.organizacion_id = ?', [org.id]) });
}));

router.get('/panel/proveedor', requierePermiso('mentorias.panel.ver'), manejar(async (req, res) => {
  const org = await organizacionActiva(req.perfil);
  if (req.perfil.rol === 'superadmin') return res.json({ data: await panel("c.organizacion_tipo = 'proveedor'", []) });
  if (org?.tipo !== 'proveedor') throw falla(403, 'solo_proveedores');
  res.json({ data: await panel('c.organizacion_id = ?', [org.id]) });
}));

// ═════════════════════════════ Editor: contenido, grupos y sesiones ════════════

const EDITABLE = ['borrador', 'rechazado'];
const OCUPA_CUPO = "i.estado IN ('activa','pendiente_pago','completada')";
const COLS_GRUPO = `g.id, g.curso_id, g.nombre, g.fecha_inicio::text AS fecha_inicio, g.fecha_fin::text AS fecha_fin, g.cupos, g.estado,
  g.mentor_id, g.mentor_nombre, c.titulo AS curso_titulo, c.precio AS curso_precio, c.organizacion_id,
  (SELECT count(*)::int FROM mentorias.inscripcion i WHERE i.grupo_id = g.id AND ${OCUPA_CUPO}) AS inscritos,
  (SELECT count(*)::int FROM mentorias.lista_espera le WHERE le.grupo_id = g.id) AS en_espera`;
const SQL_GRUPO = `SELECT ${COLS_GRUPO} FROM mentorias.grupo g JOIN mentorias.curso c ON c.id = g.curso_id`;

const aGrupo = (g) => ({
  id: g.id, nombre: g.nombre, fecha_inicio: g.fecha_inicio, fecha_fin: g.fecha_fin, cupos: g.cupos, inscritos: g.inscritos, en_espera: g.en_espera,
  estado: g.estado === 'abierto' && g.inscritos >= g.cupos ? 'lleno' : g.estado,
  mentor: g.mentor_nombre ? { id: g.mentor_id, nombre: g.mentor_nombre } : null,
});

/** Esquemas de entrada: 'tipo' ('!' = obligatorio; 'a|b' = una de las opciones). */
const ESQ = {
  modulo: { titulo: 'texto!' },
  leccion: { titulo: 'texto!', tipo: 'video|audio|pdf|cuestionario|tarea!', url_recurso: 'url', duracion_min: 'entero', disponible_desde: 'fechahora', requiere_anterior: 'bool' },
  recurso: { nombre: 'texto!', tipo: 'pdf|xlsx|docx|otro!', peso_kb: 'entero', url: 'url!' },
  grupo: { nombre: 'texto!', mentor_id: 'texto', fecha_inicio: 'fecha!', fecha_fin: 'fecha!', cupos: 'entero!', estado: 'abierto|en_curso|terminado|cancelado' },
  sesion: { inicio: 'fechahora!', fin: 'fechahora!', url_sala: 'url', url_grabacion: 'url' },
};

/** Valida y normaliza el cuerpo según un esquema. `parcial` (PATCH) solo exige los campos presentes. */
function validar(b, esquema, parcial = false) {
  const out = {};
  const errores = [];
  for (const [k, regla] of Object.entries(esquema)) {
    const v = b?.[k];
    const tipo = regla.replace('!', '');
    if (v === undefined && parcial) continue;
    if (v === undefined || v === null || v === '') {
      if (regla.endsWith('!')) errores.push(k);
      else if (v !== undefined) out[k] = tipo === 'entero' ? 0 : tipo === 'bool' ? false : null;
      continue;
    }
    const s = String(v).trim();
    const r = tipo.includes('|') ? (tipo.split('|').includes(s) ? s : undefined)
      : tipo === 'texto' ? s.slice(0, 200) || undefined
        : tipo === 'url' ? (/^https?:\/\/\S+$/i.test(s) ? s.slice(0, 1000) : undefined)
          : tipo === 'entero' ? (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) < 1e7 ? Math.round(Number(v)) : undefined)
            : tipo === 'bool' ? (typeof v === 'boolean' ? v : undefined)
              : tipo === 'fecha' ? (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : undefined)
                : tipo === 'fechahora' ? (Number.isNaN(Date.parse(s)) ? undefined : new Date(s).toISOString())
                  : undefined;
    if (r === undefined) errores.push(k); else out[k] = r;
  }
  if (errores.length) throw falla(400, `campos_invalidos:${errores.join(',')}`);
  return out;
}

// Los nombres de tabla/columna vienen de ESQ (nunca del cliente).
const insertar = (tabla, v) => uno(`INSERT INTO mentorias.${tabla} (${Object.keys(v).join(', ')})
  VALUES (${Object.keys(v).map(() => '?').join(', ')}) RETURNING id`, ...Object.values(v));
async function actualizar(tabla, id, v) {
  const ks = Object.keys(v);
  if (ks.length) await ejecutar(`UPDATE mentorias.${tabla} SET ${ks.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...Object.values(v), id);
}
async function borrar(tabla, id) { await ejecutar(`DELETE FROM mentorias.${tabla} WHERE id = ?`, id); }
const siguiente = async (tabla, campo, id) =>
  (await uno(`SELECT COALESCE(max(orden), 0)::int + 1 AS n FROM mentorias.${tabla} WHERE ${campo} = ?`, id)).n;

/** Orden 1..n sin huecos (la ficha muestra «Módulo 1, 2, 3…»). */
async function renumerar(cursoId) {
  await ejecutar(`UPDATE mentorias.modulo m SET orden = r.n FROM (SELECT id, row_number() OVER (ORDER BY orden) AS n
    FROM mentorias.modulo WHERE curso_id = ?) r WHERE m.id = r.id AND m.orden <> r.n`, cursoId);
  await ejecutar(`UPDATE mentorias.leccion l SET orden = r.n FROM (SELECT id, row_number() OVER (PARTITION BY modulo_id ORDER BY orden) AS n
    FROM mentorias.leccion WHERE curso_id = ?) r WHERE l.id = r.id AND l.orden <> r.n`, cursoId);
}

function validarLeccion(v) {
  if (v.tipo === 'video' && v.url_recurso && !ProveedorVideo.idDesdeUrl(v.url_recurso)) throw falla(400, 'url_video_invalida');
  return v;
}

const ROLES_MENTOR = ['mentor', 'coordinador', 'instructor', 'admin_proveedor'];
/** Candidatos a mentor: perfiles con rol docente de la organización dueña del curso (superadmin: todos).
 *  Se piden al núcleo (cuentas/servicio.js#miembrosDe): Mentorías no lee tablas de Cuentas. */
async function candidatosMentor(req, curso) {
  return miembrosDe(req.perfil.rol === 'superadmin' ? null : curso.organizacion_id, ROLES_MENTOR);
}

async function validarGrupo(req, curso, v, actual = null) {
  const f = { ...actual, ...v };
  if (f.fecha_fin < f.fecha_inicio) throw falla(400, 'fechas_invalidas');
  if (v.cupos !== undefined && v.cupos < Math.max(1, actual?.inscritos ?? 0)) throw falla(400, 'cupos_insuficientes');
  if (v.mentor_id !== undefined) {
    const m = v.mentor_id ? (await candidatosMentor(req, curso)).find((x) => x.id === v.mentor_id) : null;
    if (v.mentor_id && !m) throw falla(400, 'mentor_no_permitido');
    v.mentor_nombre = m?.nombre ?? null;
  }
}

const validarHorario = (f) => { if (new Date(f.fin) <= new Date(f.inicio)) throw falla(400, 'horario_invalido'); };
const escapar = (t) => String(t ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const icsSesion = (s) => ProveedorCalendario.ics({ uid: s.id, titulo: `${s.titulo} · ${s.grupo}`, inicio: s.inicio, fin: s.fin, url: s.url_sala });

/** Correo transaccional (simulado sin RESEND_API_KEY). Nunca hace fallar la operación.
 *  El contacto lo entrega el núcleo (cuentas/servicio.js#contactoDe). */
async function avisar(usuarioId, asunto, cuerpo, adjuntos = []) {
  try {
    const p = await contactoDe(usuarioId);
    if (p?.email) {
      await ProveedorCorreo.enviar({ para: p.email, asunto, adjuntos, html: `<p>Hola ${escapar(p.nombre)}:</p>${cuerpo}<p>Equipo PymEdu Mentorías</p>` });
    }
  } catch (error) {
    console.error('[mentorias] correo no enviado', error);
  }
}

/** Ocupa los cupos libres con la lista de espera (por orden de llegada), avisa por correo y ajusta abierto/lleno. */
async function promoverEspera(grupoId) {
  const g = await uno(`${SQL_GRUPO} WHERE g.id = ?`, grupoId);
  if (!g || ['cancelado', 'terminado'].includes(g.estado)) return;
  const libres = Math.max(0, g.cupos - g.inscritos);
  const turno = libres ? await todos(`SELECT i.id, i.usuario_id, i.origen FROM mentorias.lista_espera le
    JOIN mentorias.inscripcion i ON i.usuario_id = le.usuario_id AND i.grupo_id = le.grupo_id AND i.estado = 'lista_espera'
    WHERE le.grupo_id = ? ORDER BY le.posicion LIMIT ${libres}`, grupoId) : [];
  const sesion = turno.length
    ? await uno('SELECT id, inicio, fin, url_sala FROM mentorias.sesion WHERE grupo_id = ? AND fin > now() ORDER BY inicio LIMIT 1', grupoId) : null;
  for (const p of turno) {
    const pago = g.curso_precio > 0 && ['catalogo', 'enlace_proveedor'].includes(p.origen);
    await ejecutar('UPDATE mentorias.inscripcion SET estado = ? WHERE id = ?', pago ? 'pendiente_pago' : 'activa', p.id);
    await ejecutar('DELETE FROM mentorias.lista_espera WHERE grupo_id = ? AND usuario_id = ?', grupoId, p.usuario_id);
    await avisar(p.usuario_id, `Se liberó un cupo en «${g.curso_titulo}»`,
      `<p>Se liberó un cupo en el grupo <strong>${escapar(g.nombre)}</strong> de «${escapar(g.curso_titulo)}» y ya es tuyo.</p>
      <p>${pago ? 'Completa el pago en PymEdu para activar tu inscripción.' : 'Tu inscripción ya está activa.'}${sesion ? ` La próxima sesión es el ${fechaChile(sesion.inicio)} (hora de Chile).` : ''}</p>`,
      sesion ? [{ filename: 'sesion.ics', content: Buffer.from(icsSesion({ ...sesion, titulo: g.curso_titulo, grupo: g.nombre })).toString('base64') }] : []);
  }
  const ocupados = g.inscritos + turno.length;
  const estado = ocupados >= g.cupos && g.estado === 'abierto' ? 'lleno' : ocupados < g.cupos && g.estado === 'lleno' ? 'abierto' : g.estado;
  if (estado !== g.estado) await ejecutar('UPDATE mentorias.grupo SET estado = ? WHERE id = ?', estado, grupoId);
}

/** Cancelar un grupo: quienes estaban en él conservan el curso (sin grupo); la lista de espera se libera. Avisa a todos. */
async function cancelarGrupo(g) {
  const afectados = await todos("SELECT usuario_id, estado FROM mentorias.inscripcion WHERE grupo_id = ? AND estado IN ('activa','pendiente_pago','lista_espera')", g.id);
  await ejecutar(`UPDATE mentorias.inscripcion SET grupo_id = NULL, estado = CASE WHEN estado = 'lista_espera' THEN 'abandonada' ELSE estado END
    WHERE grupo_id = ? AND estado IN ('activa','pendiente_pago','lista_espera')`, g.id);
  await ejecutar('DELETE FROM mentorias.lista_espera WHERE grupo_id = ?', g.id);
  for (const a of afectados) {
    await avisar(a.usuario_id, `Se canceló el grupo «${g.nombre}»`, `<p>El grupo <strong>${escapar(g.nombre)}</strong> de «${escapar(g.curso_titulo)}» fue cancelado.
      ${a.estado === 'lista_espera' ? 'Saliste de la lista de espera y puedes inscribirte en otro grupo.' : 'Conservas tu acceso al contenido del curso.'}</p>`);
  }
}

/** Todo lo que necesita el editor (incluye URLs y fechas sin candados, a diferencia de la ficha pública). */
async function editor(req, cursoId) {
  const permisos = await permisosDe(req.perfil, req);
  const [c, modulos, lecciones, recursos, grupos, sesiones, comunidades] = await Promise.all([
    uno(`SELECT c.*, cat.nombre AS categoria_nombre,
           (SELECT count(*)::int FROM mentorias.inscripcion i WHERE i.curso_id = c.id AND i.estado IN ('activa','completada')) AS inscritos,
           (SELECT count(*)::int FROM mentorias.inscripcion i WHERE i.curso_id = c.id) AS inscripciones
         FROM mentorias.curso c LEFT JOIN mentorias.categoria cat ON cat.slug = c.categoria_slug WHERE c.id = ?`, cursoId),
    todos('SELECT id, orden, titulo FROM mentorias.modulo WHERE curso_id = ? ORDER BY orden', cursoId),
    todos(`SELECT id, modulo_id, orden, titulo, tipo, url_recurso, duracion_min, disponible_desde, requiere_anterior
           FROM mentorias.leccion WHERE curso_id = ? ORDER BY orden`, cursoId),
    todos('SELECT id, nombre, tipo, peso_kb, url_almacenamiento AS url FROM mentorias.recurso WHERE curso_id = ? ORDER BY nombre', cursoId),
    todos(`${SQL_GRUPO} WHERE g.curso_id = ? ORDER BY g.estado = 'cancelado', g.fecha_inicio`, cursoId),
    todos(`SELECT s.id, s.grupo_id, s.inicio, s.fin, s.url_sala, s.url_grabacion FROM mentorias.sesion s
           JOIN mentorias.grupo g ON g.id = s.grupo_id WHERE g.curso_id = ? ORDER BY s.inicio`, cursoId),
    comunidadesPublicables(req),
  ]);
  const editable = EDITABLE.includes(c.estado) && permisos.has('mentorias.curso.crear');
  return {
    curso: {
      ...aGestion(c), descripcion: c.descripcion, objetivos: c.objetivos ?? [], nivel_madurez: c.nivel_madurez, dificultad: c.dificultad,
      duracion_min: c.duracion_min, miniatura_url: c.miniatura_url, comunidad_id: c.comunidad_id,
    },
    editable,
    puede_publicar: editable && permisos.has('mentorias.curso.publicar'),
    puede_eliminar: editable && c.inscripciones === 0,
    puede_grupos: permisos.has('mentorias.grupo.gestionar') && c.estado !== 'archivado',
    comunidades,
    modulos: modulos.map((m) => ({ ...m, lecciones: lecciones.filter((l) => l.modulo_id === m.id).map(({ modulo_id, ...l }) => l) })),
    recursos,
    grupos: grupos.map((g) => ({ ...aGrupo(g), sesiones: sesiones.filter((s) => s.grupo_id === g.id).map(({ grupo_id, ...s }) => s) })),
  };
}

/** Curso al que pertenece :id según la entidad (el permiso se valida contra el curso, nunca contra el hijo). */
const CURSO_DE = {
  modulo: 'SELECT curso_id FROM mentorias.modulo WHERE id = ?',
  leccion: 'SELECT curso_id FROM mentorias.leccion WHERE id = ?',
  recurso: 'SELECT curso_id FROM mentorias.recurso WHERE id = ?',
  grupo: 'SELECT curso_id FROM mentorias.grupo WHERE id = ?',
  sesion: 'SELECT g.curso_id FROM mentorias.sesion s JOIN mentorias.grupo g ON g.id = s.grupo_id WHERE s.id = ?',
};

/**
 * Mutación del editor. 'contenido' exige mentorias.curso.crear y curso en borrador/rechazado;
 * 'grupos' exige mentorias.grupo.gestionar (vale también con el curso publicado). Ambas: curso de la
 * organización del usuario. Responde con el editor actualizado para no hacer otra solicitud.
 */
function mutacion(tipo, entidad, fn) {
  const contenido = tipo === 'contenido';
  return [requierePermiso(contenido ? 'mentorias.curso.crear' : 'mentorias.grupo.gestionar'), manejar(async (req, res) => {
    const f = CURSO_DE[entidad] ? await uno(CURSO_DE[entidad], req.params.id) : { curso_id: req.params.id };
    if (!f) throw falla(404, `${entidad}_no_encontrado`);
    const curso = await cursoPropio(req, f.curso_id);
    if (contenido && !EDITABLE.includes(curso.estado)) throw falla(409, 'solo_borradores_editables');
    if (curso.estado === 'archivado') throw falla(409, 'curso_archivado');
    const status = (await fn(req, curso)) ?? 200;
    if (contenido) {
      await renumerar(curso.id);
      await ejecutar('UPDATE mentorias.curso SET actualizado_en = now() WHERE id = ?', curso.id);
    }
    res.status(status).json({ data: await editor(req, curso.id) });
  })];
}

router.get('/cursos/:id/editor', requierePermiso('mentorias.curso.crear', 'mentorias.grupo.gestionar'), manejar(async (req, res) => {
  await cursoPropio(req, req.params.id);
  res.json({ data: await editor(req, req.params.id) });
}));

router.delete('/cursos/:id', requierePermiso('mentorias.curso.crear'), manejar(async (req, res) => {
  const c = await cursoPropio(req, req.params.id);
  if (!EDITABLE.includes(c.estado)) throw falla(409, 'solo_borradores_editables');
  if ((await uno('SELECT count(*)::int AS n FROM mentorias.inscripcion WHERE curso_id = ?', c.id)).n) throw falla(409, 'curso_con_inscripciones');
  await borrar('curso', c.id);
  res.json({ data: { id: c.id } });
}));

// ── Módulos, lecciones y recursos (solo borrador o rechazado) ──
router.post('/cursos/:id/modulos', mutacion('contenido', 'curso', async (req, c) => {
  await insertar('modulo', { curso_id: c.id, orden: await siguiente('modulo', 'curso_id', c.id), ...validar(req.body, ESQ.modulo) });
  return 201;
}));
router.patch('/modulos/:id', mutacion('contenido', 'modulo', (req) => actualizar('modulo', req.params.id, validar(req.body, ESQ.modulo, true))));
router.delete('/modulos/:id', mutacion('contenido', 'modulo', (req) => borrar('modulo', req.params.id)));

router.post('/modulos/:id/lecciones', mutacion('contenido', 'modulo', async (req, c) => {
  const v = validarLeccion(validar(req.body, ESQ.leccion));
  await insertar('leccion', { modulo_id: req.params.id, curso_id: c.id, orden: await siguiente('leccion', 'modulo_id', req.params.id), ...v });
  return 201;
}));
router.patch('/lecciones/:id', mutacion('contenido', 'leccion', async (req) => {
  const v = validar(req.body, ESQ.leccion, true);
  validarLeccion({ ...(await uno('SELECT tipo, url_recurso FROM mentorias.leccion WHERE id = ?', req.params.id)), ...v });
  await actualizar('leccion', req.params.id, v);
}));
router.delete('/lecciones/:id', mutacion('contenido', 'leccion', (req) => borrar('leccion', req.params.id)));

// Orden completo en una sola llamada: { modulos: [{ id, lecciones: [id…] }] } (permite mover lecciones entre módulos).
router.put('/cursos/:id/orden', mutacion('contenido', 'curso', async (req, c) => {
  const lista = req.body?.modulos;
  const [mods, lecs] = await Promise.all([
    todos('SELECT id FROM mentorias.modulo WHERE curso_id = ?', c.id), todos('SELECT id FROM mentorias.leccion WHERE curso_id = ?', c.id)]);
  const mismos = (ids, filas) => ids.length === filas.length && new Set(ids).size === ids.length && filas.every((f) => ids.includes(f.id));
  if (!Array.isArray(lista) || !lista.every((m) => Array.isArray(m?.lecciones))
    || !mismos(lista.map((m) => m.id), mods) || !mismos(lista.flatMap((m) => m.lecciones), lecs)) throw falla(400, 'orden_invalido');
  for (const [i, m] of lista.entries()) {
    await ejecutar('UPDATE mentorias.modulo SET orden = ? WHERE id = ?', i + 1, m.id);
    for (const [j, l] of m.lecciones.entries()) await ejecutar('UPDATE mentorias.leccion SET modulo_id = ?, orden = ? WHERE id = ?', m.id, j + 1, l);
  }
}));

const aRecurso = ({ url, ...v }) => (url === undefined ? v : { ...v, url_almacenamiento: url });
router.post('/cursos/:id/recursos', mutacion('contenido', 'curso', async (req, c) => {
  await insertar('recurso', { curso_id: c.id, ...aRecurso(validar(req.body, ESQ.recurso)) });
  return 201;
}));
router.patch('/recursos/:id', mutacion('contenido', 'recurso', (req) => actualizar('recurso', req.params.id, aRecurso(validar(req.body, ESQ.recurso, true)))));
router.delete('/recursos/:id', mutacion('contenido', 'recurso', (req) => borrar('recurso', req.params.id)));

// ── Grupos y sesiones (también con el curso publicado) ──
router.get('/cursos/:id/mentores', requierePermiso('mentorias.grupo.gestionar'), manejar(async (req, res) => {
  res.json({ data: await candidatosMentor(req, await cursoPropio(req, req.params.id)) });
}));

router.post('/cursos/:id/grupos', mutacion('grupos', 'curso', async (req, c) => {
  const { estado, ...v } = validar(req.body, ESQ.grupo); // nace «abierto»
  await validarGrupo(req, c, v);
  await insertar('grupo', { curso_id: c.id, ...v });
  return 201;
}));
router.patch('/grupos/:id', mutacion('grupos', 'grupo', async (req, c) => {
  const actual = await uno(`${SQL_GRUPO} WHERE g.id = ?`, req.params.id);
  const v = validar(req.body, ESQ.grupo, true);
  await validarGrupo(req, c, v, actual);
  await actualizar('grupo', actual.id, v);
  if (v.estado === 'cancelado' && actual.estado !== 'cancelado') await cancelarGrupo(actual);
  else await promoverEspera(actual.id); // más cupos → entra la lista de espera
}));

router.post('/grupos/:id/sesiones', mutacion('grupos', 'grupo', async (req) => {
  const v = validar(req.body, ESQ.sesion);
  validarHorario(v);
  await insertar('sesion', { grupo_id: req.params.id, ...v });
  return 201;
}));
router.patch('/sesiones/:id', mutacion('grupos', 'sesion', async (req) => {
  const v = validar(req.body, ESQ.sesion, true);
  validarHorario({ ...(await uno('SELECT inicio, fin FROM mentorias.sesion WHERE id = ?', req.params.id)), ...v });
  await actualizar('sesion', req.params.id, v);
}));
router.delete('/sesiones/:id', mutacion('grupos', 'sesion', (req) => borrar('sesion', req.params.id)));

// ═════════════════════════════ Mis grupos: sesiones y asistencia ═══════════════

/** Grupo que el usuario opera: es su mentor, o gestiona grupos de la organización dueña del curso. */
async function grupoOperable(req, grupoId) {
  const g = await uno(`${SQL_GRUPO} WHERE g.id = ?`, grupoId);
  if (!g) throw falla(404, 'grupo_no_encontrado');
  if (g.mentor_id === req.perfil.id || req.perfil.rol === 'superadmin') return g;
  const [permisos, org] = await Promise.all([permisosDe(req.perfil, req), organizacionActiva(req.perfil)]);
  if (permisos.has('mentorias.grupo.gestionar') && g.organizacion_id === org?.id) return g;
  throw falla(403, 'sin_permiso');
}

router.get('/mis-grupos', manejar(async (req, res) => {
  const yo = req.perfil.id;
  const [permisos, org] = await Promise.all([permisosDe(req.perfil, req), organizacionActiva(req.perfil)]);
  const [filtro, params] = req.perfil.rol === 'superadmin' ? ['true', []]
    : permisos.has('mentorias.grupo.gestionar') ? ['(g.mentor_id = ? OR c.organizacion_id = ?)', [yo, org?.id ?? '']] : ['g.mentor_id = ?', [yo]];
  const filas = await todos(`
    SELECT ${COLS_GRUPO}, s.id AS s_id, s.inicio AS s_inicio, s.fin AS s_fin, s.url_sala AS s_sala, s.url_grabacion AS s_grab
    FROM mentorias.grupo g JOIN mentorias.curso c ON c.id = g.curso_id
    LEFT JOIN LATERAL (SELECT * FROM mentorias.sesion s WHERE s.grupo_id = g.id AND s.fin > now() ORDER BY s.inicio LIMIT 1) s ON true
    WHERE g.estado <> 'cancelado' AND ${filtro}
    ORDER BY g.estado = 'terminado', s.inicio NULLS LAST, g.fecha_inicio`, ...params);
  res.json({
    data: filas.map((g) => ({
      ...aGrupo(g), curso: { id: g.curso_id, titulo: g.curso_titulo }, soy_mentor: g.mentor_id === yo,
      proxima_sesion: g.s_id ? { id: g.s_id, inicio: g.s_inicio, fin: g.s_fin, url_sala: g.s_sala, url_grabacion: g.s_grab } : null,
    })),
  });
}));

router.get('/grupos/:id', manejar(async (req, res) => {
  const g = await grupoOperable(req, req.params.id);
  const [sesiones, participantes, asistencia, lecciones] = await Promise.all([
    todos('SELECT id, inicio, fin, url_sala, url_grabacion FROM mentorias.sesion WHERE grupo_id = ? ORDER BY inicio', g.id),
    todos(`SELECT i.id AS inscripcion_id, i.usuario_id, COALESCE(i.usuario_nombre, 'Participante') AS nombre, i.estado,
             (SELECT count(*)::int FROM mentorias.progreso_leccion pl WHERE pl.inscripcion_id = i.id AND pl.completado) AS ok
           FROM mentorias.inscripcion i WHERE i.grupo_id = ? AND ${OCUPA_CUPO} ORDER BY nombre`, g.id),
    todos(`SELECT a.sesion_id, a.usuario_id, a.asistio, a.minutos FROM mentorias.asistencia a
           JOIN mentorias.sesion s ON s.id = a.sesion_id WHERE s.grupo_id = ?`, g.id),
    uno('SELECT count(*)::int AS n FROM mentorias.leccion WHERE curso_id = ?', g.curso_id),
  ]);
  res.json({
    data: {
      ...aGrupo(g), curso: { id: g.curso_id, titulo: g.curso_titulo }, soy_mentor: g.mentor_id === req.perfil.id,
      proxima_sesion: sesiones.find((s) => new Date(s.fin) > new Date()) ?? null,
      sesiones,
      asistencia,
      participantes: participantes.map(({ ok, ...p }) => ({
        ...p, progreso_pct: lecciones.n ? Math.round((ok / lecciones.n) * 100) : 0,
        asistencias: asistencia.filter((a) => a.usuario_id === p.usuario_id && a.asistio).length,
      })),
    },
  });
}));

const MARGEN_LISTA_MS = 30 * 60_000; // se puede pasar lista desde 30 minutos antes del inicio
router.put('/sesiones/:id/asistencia', manejar(async (req, res) => {
  const s = await uno('SELECT id, grupo_id, inicio, fin FROM mentorias.sesion WHERE id = ?', req.params.id);
  if (!s) throw falla(404, 'sesion_no_encontrada');
  await grupoOperable(req, s.grupo_id);
  if (new Date(s.inicio).getTime() - MARGEN_LISTA_MS > Date.now()) throw falla(409, 'sesion_no_iniciada');
  const registros = req.body?.registros;
  const inscritos = new Set((await todos(`SELECT i.usuario_id FROM mentorias.inscripcion i WHERE i.grupo_id = ? AND ${OCUPA_CUPO}`, s.grupo_id)).map((f) => f.usuario_id));
  if (!Array.isArray(registros) || !registros.every((r) => inscritos.has(r?.usuario_id) && typeof r.asistio === 'boolean')) throw falla(400, 'registros_invalidos');
  const duracion = Math.round((new Date(s.fin) - new Date(s.inicio)) / 60_000);
  for (const r of registros) {
    const minutos = r.asistio ? Math.min(duracion, Math.max(0, Math.round(Number(r.minutos) || duracion))) : 0;
    await ejecutar(`INSERT INTO mentorias.asistencia (sesion_id, usuario_id, asistio, minutos) VALUES (?, ?, ?, ?)
      ON CONFLICT (sesion_id, usuario_id) DO UPDATE SET asistio = EXCLUDED.asistio, minutos = EXCLUDED.minutos`, s.id, r.usuario_id, r.asistio, minutos);
  }
  res.json({ data: await todos('SELECT sesion_id, usuario_id, asistio, minutos FROM mentorias.asistencia WHERE sesion_id = ?', s.id) });
}));

// .ics de una sesión: para inscritos del grupo y para quienes lo gestionan.
router.get('/sesiones/:id/ics', manejar(async (req, res) => {
  const s = await uno(`SELECT s.id, s.grupo_id, s.inicio, s.fin, s.url_sala, g.nombre AS grupo, c.titulo FROM mentorias.sesion s
    JOIN mentorias.grupo g ON g.id = s.grupo_id JOIN mentorias.curso c ON c.id = g.curso_id WHERE s.id = ?`, req.params.id);
  if (!s) throw falla(404, 'sesion_no_encontrada');
  const inscrito = await uno("SELECT 1 FROM mentorias.inscripcion WHERE grupo_id = ? AND usuario_id = ? AND estado IN ('activa','completada')", s.grupo_id, req.perfil.id);
  if (!inscrito) await grupoOperable(req, s.grupo_id);
  res.setHeader('Content-Disposition', 'attachment; filename="sesion-pymedu.ics"');
  res.type('text/calendar; charset=utf-8').send(icsSesion(s));
}));

// ═════════════════════════════ Inscripción y certificados ══════════════════════

// Cancelar la propia inscripción: libera el cupo y entra el primero de la lista de espera.
router.delete('/inscripciones/:id', manejar(async (req, res) => {
  const i = await uno('SELECT id, usuario_id, grupo_id, estado FROM mentorias.inscripcion WHERE id = ? AND usuario_id = ?', req.params.id, req.perfil.id);
  if (!i) throw falla(404, 'inscripcion_no_encontrada');
  if (!['activa', 'pendiente_pago', 'lista_espera'].includes(i.estado)) throw falla(409, 'inscripcion_no_cancelable');
  await ejecutar("UPDATE mentorias.inscripcion SET estado = 'abandonada' WHERE id = ?", i.id);
  if (i.grupo_id) {
    await ejecutar('DELETE FROM mentorias.lista_espera WHERE grupo_id = ? AND usuario_id = ?', i.grupo_id, i.usuario_id);
    if (i.estado !== 'lista_espera') await promoverEspera(i.grupo_id);
  }
  res.json({ data: { id: i.id, estado: 'abandonada' } });
}));

router.get('/mis-certificados', manejar(async (req, res) => {
  res.json({ data: await todos(`${SQL_CERTIFICADO} WHERE i.usuario_id = ? ORDER BY ce.emitido_en DESC`, req.perfil.id) });
}));

export default router;
