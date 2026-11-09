import { Router } from 'express';
import db from './db.js';
import { requireAuth } from './auth.js';

const router = Router();

/**
 * API interna del ERP para otras apps (Mentorías): indicadores agregados del negocio.
 * Solo números de resumen; nunca documentos. Si el ERP no tiene datos → conectado: false.
 */
export async function indicadoresNegocio(usuarioId) {
  const hace90 = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const f = await db.prepare(`
    SELECT count(*)::int AS filas,
      count(*) FILTER (WHERE coleccion = 'ventas' AND data->>'estado' = 'Pendiente')::int AS ventas_por_cobrar,
      count(*) FILTER (WHERE coleccion = 'inventario')::int AS productos,
      COALESCE(sum((data->>'monto')::numeric) FILTER (WHERE coleccion = 'ventas' AND data->>'fecha' >= ?), 0)::float8 AS ventas90,
      COALESCE(sum((data->>'monto')::numeric) FILTER (WHERE coleccion = 'gastos' AND data->>'fecha' >= ?), 0)::float8 AS gastos90
    FROM erp_datos WHERE usuario_id = ?
  `).get(hace90, hace90, usuarioId);
  return {
    conectado: (f?.filas ?? 0) > 0,
    ventasPorCobrar: f?.ventas_por_cobrar ?? 0,
    productos: f?.productos ?? 0,
    ventas90: f?.ventas90 ?? 0,
    gastos90: f?.gastos90 ?? 0,
  };
}

router.use(requireAuth);

const COLECCIONES = new Set(['ventas', 'gastos', 'clientes', 'proveedores', 'movimientos', 'inventario', 'movimientosInventario',
  'promociones', 'abonos', 'documentosTributarios', 'integracionEventos', 'pagosPOS', 'lotes', 'envases', 'notificaciones', 'config']);

/**
 * Lectura por recurso, paginada y con búsqueda en el servidor (correcciones #1 y #5).
 * GET /api/erp/recursos/clientes?pagina=1&tamano=50&q=perez&orden=nombre
 * Base para dejar de descargar toda la colección en cada página.
 */
router.get('/recursos/:coleccion', async (req, res) => {
  try {
    const { coleccion } = req.params;
    if (!COLECCIONES.has(coleccion)) return res.status(400).json({ error: 'coleccion_invalida' });
    const tamano = Math.min(200, Math.max(1, parseInt(req.query.tamano, 10) || 50));
    const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
    const orden = /^[a-z_]{1,40}$/i.test(String(req.query.orden ?? '')) ? String(req.query.orden) : 'fecha';
    const params = [req.perfil.id, coleccion];
    let filtro = '';
    if (req.query.q) { filtro = ' AND data::text ILIKE ?'; params.push(`%${String(req.query.q).slice(0, 80)}%`); }
    const total = await db.prepare(`SELECT count(*)::int AS n FROM erp_datos WHERE usuario_id = ? AND coleccion = ?${filtro}`).get(...params);
    const filas = await db.prepare(`SELECT data FROM erp_datos WHERE usuario_id = ? AND coleccion = ?${filtro}
      ORDER BY data->>'${orden}' DESC NULLS LAST, id LIMIT ${tamano} OFFSET ${(pagina - 1) * tamano}`).all(...params);
    res.json({ data: filas.map((f) => f.data), total: total.n, pagina, tamano });
  } catch (error) {
    console.error('[erp] Error listando recurso:', error);
    res.status(500).json({ error: 'error_interno' });
  }
});

// Todas las filas ERP del usuario: [{ coleccion, id, data }]
router.get('/', async (req, res) => {
  try {
    const filas = await db.prepare('SELECT coleccion, id, data FROM erp_datos WHERE usuario_id = ?').all(req.perfil.id);
    res.json({ data: filas });
  } catch (error) {
    console.error('[erp] Error cargando datos:', error);
    res.status(500).json({ error: 'error_interno' });
  }
});

// Upsert por lotes: { rows: [{ coleccion, id, data }] }
// Una sola sentencia por bloque de 500: una venta toca a la vez ventas, inventario, envases,
// lotes y movimientos, y deben quedar guardados todos o ninguno (antes era una fila por
// consulta y un corte a mitad de camino dejaba el stock y los envases descuadrados).
router.post('/upsert', async (req, res) => {
  try {
    const unicas = new Map();
    for (const r of Array.isArray(req.body?.rows) ? req.body.rows : []) {
      if (r && r.coleccion && r.id) unicas.set(`${r.coleccion}\u0000${r.id}`, r); // sin repetidos en la misma sentencia
    }
    const rows = [...unicas.values()];
    const ahora = new Date().toISOString();
    for (let i = 0; i < rows.length; i += 500) {
      const bloque = rows.slice(i, i + 500);
      await db.prepare(`
        INSERT INTO erp_datos (usuario_id, coleccion, id, data, updated_at)
        VALUES ${bloque.map(() => '(?, ?, ?, ?::jsonb, ?)').join(', ')}
        ON CONFLICT (usuario_id, coleccion, id)
        DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
      `).run(...bloque.flatMap((r) => [req.perfil.id, r.coleccion, r.id, JSON.stringify(r.data ?? {}), ahora]));
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('[erp] Error guardando datos:', error);
    res.status(500).json({ error: 'error_interno' });
  }
});

// Borrar por lotes: { coleccion, ids: [] }
router.post('/delete', async (req, res) => {
  try {
    const { coleccion, ids } = req.body ?? {};
    if (!coleccion || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'parametros_invalidos' });
    }
    const huecos = ids.map(() => '?').join(',');
    await db.prepare(`DELETE FROM erp_datos WHERE usuario_id = ? AND coleccion = ? AND id IN (${huecos})`)
      .run(req.perfil.id, coleccion, ...ids);
    res.json({ ok: true });
  } catch (error) {
    console.error('[erp] Error borrando datos:', error);
    res.status(500).json({ error: 'error_interno' });
  }
});

export default router;