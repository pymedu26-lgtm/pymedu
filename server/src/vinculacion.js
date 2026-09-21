import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from './db.js';
import { requireAuth } from './auth.js';
import {
  solicitarVinculacion,
  cancelarSolicitud,
  canjearCodigo,
  puedeGestionarInstitucion,
} from './vinculacionServicio.js';

const router = Router();

router.use(requireAuth);

function responderError(res, err) {
  const codigo = err?.codigo || err?.message;
  console.error('[vinculacion]', codigo, err?.stack || '');
  return res.status(400).json({ error: String(codigo || 'error_interno') });
}

// Estado de vinculacion del usuario autenticado  (equivale a mi_vinculacion)
router.get('/mi', async (req, res) => {
  try {
    const fila = await db.prepare(`
      SELECT
        p.institucion_id,
        i.nombre AS institucion_nombre, i.rubro AS institucion_rubro, i.region AS institucion_region,
        i.comuna AS institucion_comuna, i.direccion AS institucion_direccion, i.logo_url AS institucion_logo_url,
        p.reporta_a AS jefe_id, j.nombre_completo AS jefe_nombre,
        s.id AS solicitud_id, s.estado AS solicitud_estado, s.institucion_id AS solicitud_institucion_id,
        si.nombre AS solicitud_institucion_nombre, s.created_at AS solicitud_created_at, s.respondida_at AS solicitud_respondida_at
      FROM perfiles p
      LEFT JOIN instituciones i ON i.id = p.institucion_id
      LEFT JOIN perfiles j ON j.id = p.reporta_a
      LEFT JOIN LATERAL (
        SELECT * FROM solicitudes_vinculacion sv
        WHERE sv.usuario_id = p.id
        ORDER BY sv.created_at DESC
        LIMIT 1
      ) s ON true
      LEFT JOIN instituciones si ON si.id = s.institucion_id
      WHERE p.id = ?
    `).get(req.perfil.id);
    res.json({ data: fila ?? null });
  } catch (err) {
    responderError(res, err);
  }
});

// Usuario solicita vincularse a una institucion
router.post('/solicitar', async (req, res) => {
  try {
    const { institucion_id } = req.body ?? {};
    if (!institucion_id) return res.status(400).json({ error: 'institucion_requerida' });
    if (req.perfil.institucion_id) return res.status(400).json({ error: 'ya_vinculado' });
    await solicitarVinculacion(req.perfil.id, institucion_id);
    res.json({ ok: true });
  } catch (err) {
    responderError(res, err);
  }
});

// El usuario cancela su propia solicitud pendiente
router.post('/solicitudes/:id/cancelar', async (req, res) => {
  try {
    await cancelarSolicitud(req.perfil.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    responderError(res, err);
  }
});

// Aprobar / rechazar una solicitud (superadmin o admin_institucional de esa institucion)
router.post('/solicitudes/:id/aprobar', async (req, res) => {
  try {
    const { aprobada } = req.body ?? {};
    if (typeof aprobada !== 'boolean') return res.status(400).json({ error: 'aprobada_requerida' });

    const actor = req.perfil;
    if (!['superadmin', 'admin_institucional'].includes(actor.rol)) throw Object.assign(new Error('sin_permiso'), { codigo: 'sin_permiso' });

    const sol = await db.prepare('SELECT * FROM solicitudes_vinculacion WHERE id = ?').get(req.params.id);
    if (!sol) throw Object.assign(new Error('solicitud_no_encontrada'), { codigo: 'solicitud_no_encontrada' });
    if (actor.rol === 'admin_institucional' && actor.institucion_id !== sol.institucion_id) {
      throw Object.assign(new Error('sin_permiso'), { codigo: 'sin_permiso' });
    }

    if (aprobada) {
      await db.prepare('UPDATE perfiles SET institucion_id = ?, reporta_a = ? WHERE id = ?')
        .run(sol.institucion_id, actor.rol === 'admin_institucional' ? actor.id : null, sol.usuario_id);
      await db.prepare('UPDATE solicitudes_vinculacion SET estado = ?, respondida_por = ?, respondida_at = ? WHERE id = ?')
        .run('aprobada', actor.id, new Date().toISOString(), sol.id);
    } else {
      await db.prepare('UPDATE solicitudes_vinculacion SET estado = ?, respondida_por = ?, respondida_at = ? WHERE id = ?')
        .run('rechazada', actor.id, new Date().toISOString(), sol.id);
    }
    res.json({ ok: true });
  } catch (err) {
    responderError(res, err);
  }
});

// Generar codigo de invitacion
router.post('/codigos', async (req, res) => {
  try {
    const { institucion_id, rol = 'emprendedor', usos_max = 1 } = req.body ?? {};
    if (!institucion_id) return res.status(400).json({ error: 'institucion_requerida' });
    if (!puedeGestionarInstitucion(req.perfil, institucion_id)) {
      return res.status(403).json({ error: 'sin_permiso' });
    }
    const codigo = Math.random().toString(36).slice(2, 7) + Math.random().toString(36).slice(2, 7);
    const c = codigo.toUpperCase().padEnd(8, 'X').slice(0, 8);
    await db.prepare(`
      INSERT INTO codigos_invitacion (id, institucion_id, codigo, rol, usos_max, creado_por)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), institucion_id, c, rol, Math.max(1, usos_max), req.perfil.id);
    res.json({ data: c });
  } catch (err) {
    responderError(res, err);
  }
});

// Desactivar codigo de invitacion
router.post('/codigos/:id/desactivar', async (req, res) => {
  try {
    const codigo = await db.prepare('SELECT * FROM codigos_invitacion WHERE id = ?').get(req.params.id);
    if (!codigo) return res.status(404).json({ error: 'codigo_no_encontrado' });
    if (!puedeGestionarInstitucion(req.perfil, codigo.institucion_id)) {
      return res.status(403).json({ error: 'sin_permiso' });
    }
    await db.prepare('UPDATE codigos_invitacion SET activo = 0 WHERE id = ?').run(codigo.id);
    res.json({ ok: true });
  } catch (err) {
    responderError(res, err);
  }
});

// Canjear codigo de invitacion (cuenta ya creada)
router.post('/redimir', async (req, res) => {
  try {
    const { codigo } = req.body ?? {};
    await canjearCodigo(req.perfil.id, codigo);
    res.json({ ok: true });
  } catch (err) {
    responderError(res, err);
  }
});

// ---- Lecturas para el panel del Admin Institucional ----

function escaparBusqueda(term) {
  return `%${term.replace(/[%_]/g, (m) => `\\${m}`)}%`;
}

router.get('/instituciones/:id/usuarios', async (req, res) => {
  try {
    const { id } = req.params;
    if (!puedeGestionarInstitucion(req.perfil, id)) return res.status(403).json({ error: 'sin_permiso' });

    const { rol, busqueda } = req.query;
    const condiciones = ['institucion_id = ?', "rol <> 'superadmin'"];
    const parametros = [id];
    if (rol && rol !== 'todos') { condiciones.push('rol = ?'); parametros.push(rol); }
    if (busqueda) {
      condiciones.push("(nombre_completo ILIKE ? ESCAPE '\\' OR email ILIKE ? ESCAPE '\\')");
      const term = escaparBusqueda(String(busqueda));
      parametros.push(term, term);
    }
    const filas = await db.prepare(
      `SELECT id, email, nombre_completo, rol, activo, membresia_nivel, created_at
       FROM perfiles WHERE ${condiciones.join(' AND ')} ORDER BY nombre_completo`
    ).all(...parametros);
    res.json({ data: filas });
  } catch (err) {
    responderError(res, err);
  }
});

router.get('/instituciones/:id/solicitudes', async (req, res) => {
  try {
    const { id } = req.params;
    if (!puedeGestionarInstitucion(req.perfil, id)) return res.status(403).json({ error: 'sin_permiso' });

    const filas = await db.prepare(`
      SELECT s.id, s.usuario_id, s.institucion_id, s.estado, s.mensaje, s.created_at,
        p.nombre_completo AS perfil_nombre, p.email AS perfil_email,
        i.nombre AS institucion_nombre
      FROM solicitudes_vinculacion s
      LEFT JOIN perfiles p ON p.id = s.usuario_id
      LEFT JOIN instituciones i ON i.id = s.institucion_id
      WHERE s.institucion_id = ? AND s.estado = 'pendiente'
      ORDER BY s.created_at DESC
    `).all(id);
    res.json({ data: filas });
  } catch (err) {
    responderError(res, err);
  }
});

router.get('/instituciones/:id/codigos', async (req, res) => {
  try {
    const { id } = req.params;
    if (!puedeGestionarInstitucion(req.perfil, id)) return res.status(403).json({ error: 'sin_permiso' });

    const filas = await db.prepare(`
      SELECT * FROM codigos_invitacion WHERE institucion_id = ? ORDER BY created_at DESC
    `).all(id);
    res.json({ data: filas });
  } catch (err) {
    responderError(res, err);
  }
});

export default router;