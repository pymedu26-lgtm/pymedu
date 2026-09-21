import { Router } from 'express';
import db from './db.js';
import { requireAuth } from './auth.js';

const router = Router();

router.use(requireAuth);

// Activa (o degrada) la membresia del propio usuario autenticado.
// Equivale a la funcion activar_membresia() que en Supabase era SECURITY DEFINER.
router.post('/activar', async (req, res) => {
  try {
    const { nivel, expira } = req.body ?? {};
    if (!['free', 'pro', 'premium'].includes(nivel)) {
      return res.status(400).json({ error: 'nivel_invalido' });
    }
    await db.prepare('UPDATE perfiles SET membresia_nivel = ?, membresia_expira = ? WHERE id = ?')
      .run(nivel, expira || null, req.perfil.id);
    res.json({ ok: true });
  } catch (error) {
    console.error('[membresia] Error activando membresia:', error);
    res.status(500).json({ error: 'error_interno' });
  }
});

export default router;