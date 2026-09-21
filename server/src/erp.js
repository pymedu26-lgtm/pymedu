import { Router } from 'express';
import db from './db.js';
import { requireAuth } from './auth.js';

const router = Router();

router.use(requireAuth);

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
router.post('/upsert', async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const ahora = new Date().toISOString();
    for (const r of rows) {
      if (!r || !r.coleccion || !r.id) continue;
      await db.prepare(`
        INSERT INTO erp_datos (usuario_id, coleccion, id, data, updated_at)
        VALUES (?, ?, ?, ?::jsonb, ?)
        ON CONFLICT (usuario_id, coleccion, id)
        DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
      `).run(req.perfil.id, r.coleccion, r.id, JSON.stringify(r.data ?? {}), ahora);
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