import { randomUUID } from 'crypto';
import db from './db.js';

function errorLegible(mensaje) {
  const e = new Error(mensaje);
  e.codigo = mensaje;
  return e;
}

export async function solicitarVinculacion(usuarioId, institucionId) {
  const inst = await db.prepare('SELECT id FROM instituciones WHERE id = ? AND activa = 1').get(institucionId);
  if (!inst) throw errorLegible('institucion_no_encontrada');
  await db.prepare(`
    INSERT INTO solicitudes_vinculacion (id, usuario_id, institucion_id, estado)
    VALUES (?, ?, ?, 'pendiente')
    ON CONFLICT (usuario_id, institucion_id) DO NOTHING
  `).run(randomUUID(), usuarioId, institucionId);
  return true;
}

export async function cancelarSolicitud(usuarioId, solicitudId) {
  const resultado = await db.prepare(
    'UPDATE solicitudes_vinculacion SET estado = ? WHERE id = ? AND usuario_id = ? AND estado = ?'
  ).run('cancelada', solicitudId, usuarioId, 'pendiente');
  if (resultado.changes === 0) throw errorLegible('solicitud_no_encontrada');
  return true;
}

export async function canjearCodigo(usuarioId, codigo) {
  const limpio = String(codigo || '').trim().toUpperCase();
  if (!limpio) throw errorLegible('codigo_invalido');

  const actual = await db.prepare('SELECT institucion_id FROM perfiles WHERE id = ?').get(usuarioId);
  if (actual?.institucion_id) throw errorLegible('ya_vinculado');

  const inv = await db.prepare(`
    SELECT id, institucion_id, rol, reporta_a, usos_max, usos_actuales, activo, expira_at
    FROM codigos_invitacion WHERE codigo = ?
  `).get(limpio);

  if (!inv || !inv.activo) throw errorLegible('codigo_invalido');
  if (inv.expira_at && inv.expira_at !== 'null' && new Date(inv.expira_at) < new Date()) throw errorLegible('codigo_invalido');
  if (inv.usos_actuales >= inv.usos_max) throw errorLegible('codigo_invalido');

  await db.prepare('UPDATE perfiles SET institucion_id = ?, reporta_a = ?, rol = ? WHERE id = ?')
    .run(inv.institucion_id, inv.reporta_a ?? null, inv.rol, usuarioId);

  await db.prepare(`
    UPDATE codigos_invitacion
    SET usos_actuales = usos_actuales + 1,
        activo = CASE WHEN usos_actuales + 1 < usos_max THEN 1 ELSE 0 END
    WHERE id = ?
  `).run(inv.id);

  return true;
}

export async function registrarVinculacionTrasRegistro({ usuarioId, institucionId, codigo }) {
  let vinculadoPorCodigo = false;
  let solicitudCreada = false;
  const codigoLimpio = String(codigo || '').trim().toUpperCase();
  if (codigoLimpio) {
    try {
      await canjearCodigo(usuarioId, codigoLimpio);
      vinculadoPorCodigo = true;
    } catch {
      // Un codigo invalido jamas bloquea la creacion de la cuenta.
    }
  }
  if (!vinculadoPorCodigo && institucionId) {
    try {
      await solicitarVinculacion(usuarioId, institucionId);
      solicitudCreada = true;
    } catch {
      // La vinculacion es opcional.
    }
  }
  return { vinculadoPorCodigo, solicitudCreada };
}

export function puedeGestionarInstitucion(perfil, institucionId) {
  if (perfil.rol === 'superadmin') return true;
  if (perfil.rol === 'admin_institucional' && perfil.institucion_id === institucionId) return true;
  return false;
}