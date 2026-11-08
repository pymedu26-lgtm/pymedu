// API interna del núcleo "PymEdu Cuentas".
// Las demás apps (Mentorías, ERP, Academia) solo llaman a estas funciones y NUNCA leen
// las tablas cuentas.* directamente. Cuando Cuentas salga a un servicio propio, este
// archivo se reemplaza por llamadas HTTP con el mismo contrato y las apps no cambian.
import db from '../db.js';
import { PERMISOS } from './permisos.js';

const TODOS = new Set(PERMISOS.map((p) => p.codigo));

/** Permisos efectivos del usuario (unión de sus roles). Se cachea en el request. */
export async function permisosDe(perfil, req) {
  if (req?._permisos) return req._permisos;
  let permisos;
  if (perfil.rol === 'superadmin') {
    permisos = TODOS;
  } else {
    const filas = await db.prepare(`
      SELECT DISTINCT rp.permiso_codigo AS codigo
      FROM cuentas.asignacion_rol a
      JOIN cuentas.rol r ON r.id = a.rol_id AND r.activo
      JOIN cuentas.rol_permiso rp ON rp.rol_id = r.id
      WHERE a.usuario_id = ?
    `).all(perfil.id);
    // Respaldo mientras se migran asignaciones: la plantilla equivalente a perfiles.rol.
    const lista = filas.length > 0 ? filas : await db.prepare(`
      SELECT rp.permiso_codigo AS codigo FROM cuentas.rol r
      JOIN cuentas.rol_permiso rp ON rp.rol_id = r.id
      WHERE r.organizacion_id IS NULL AND r.codigo = ?
    `).all(perfil.rol);
    permisos = new Set(lista.map((f) => f.codigo));
  }
  if (req) req._permisos = permisos;
  return permisos;
}

export async function tienePermiso(perfil, codigo, req) {
  return (await permisosDe(perfil, req)).has(codigo);
}

/** Middleware: reemplaza los `if (rol === 'X')` por `requierePermiso('modulo.accion')`. */
export const requierePermiso = (...codigos) => async (req, res, next) => {
  try {
    const permisos = await permisosDe(req.perfil, req);
    if (codigos.some((c) => permisos.has(c))) return next();
    return res.status(403).json({ error: 'sin_permiso', requiere: codigos });
  } catch (error) {
    console.error('[cuentas] Error verificando permisos:', error);
    return res.status(500).json({ error: 'error_interno' });
  }
};

/** Comunidades a las que pertenece (institución del perfil + membresías aprobadas). */
export async function comunidadesDe(perfil) {
  const filas = await db.prepare(`
    SELECT o.id, o.nombre FROM cuentas.organizacion o
    WHERE o.id = ? OR o.id IN (
      SELECT comunidad_id FROM cuentas.membresia_comunidad WHERE usuario_id = ? AND estado = 'aprobada'
    )
  `).all(perfil.institucion_id ?? '', perfil.id);
  return filas;
}

/** Organización desde la que actúa (proveedor, institución o la plataforma). */
export async function organizacionActiva(perfil) {
  const asignada = await db.prepare(`
    SELECT o.id, o.nombre, o.tipo FROM cuentas.asignacion_rol a
    JOIN cuentas.organizacion o ON o.id = a.organizacion_id
    WHERE a.usuario_id = ? AND o.tipo IN ('proveedor', 'institucion')
    ORDER BY CASE o.tipo WHEN 'proveedor' THEN 0 ELSE 1 END LIMIT 1
  `).get(perfil.id);
  if (asignada) return asignada;
  if (perfil.institucion_id) {
    const inst = await db.prepare('SELECT id, nombre, tipo FROM cuentas.organizacion WHERE id = ?').get(perfil.institucion_id);
    if (inst) return inst;
  }
  return db.prepare("SELECT id, nombre, tipo FROM cuentas.organizacion WHERE tipo = 'plataforma' LIMIT 1").get();
}

export async function nombreOrganizacion(id) {
  const fila = id ? await db.prepare('SELECT nombre FROM cuentas.organizacion WHERE id = ?').get(id) : null;
  return fila?.nombre ?? null;
}

/** Organizaciones por tipo (ej. instituciones y comunidades para publicar contenido cerrado). */
export async function organizacionesPorTipo(tipos) {
  return db.prepare('SELECT id, nombre FROM cuentas.organizacion WHERE tipo = ANY(?::text[]) ORDER BY nombre').all(`{${tipos.join(',')}}`);
}

/** Miembros activos de una organización con alguno de los roles dados (null = toda la plataforma). */
export async function miembrosDe(organizacionId, roles) {
  const lista = `{${roles.map((r) => `"${r}"`).join(',')}}`;
  if (!organizacionId) {
    return db.prepare('SELECT id, nombre_completo AS nombre, rol FROM perfiles WHERE activo = 1 AND rol = ANY(?::text[]) ORDER BY nombre').all(lista);
  }
  return db.prepare(`SELECT DISTINCT p.id, p.nombre_completo AS nombre, p.rol FROM perfiles p
    LEFT JOIN cuentas.asignacion_rol a ON a.usuario_id = p.id
    WHERE p.activo = 1 AND p.rol = ANY(?::text[]) AND (p.institucion_id = ? OR a.organizacion_id = ?) ORDER BY nombre`)
    .all(lista, organizacionId, organizacionId);
}

/** Datos de contacto mínimos de una persona (para avisos por correo). */
export async function contactoDe(usuarioId) {
  return db.prepare('SELECT email, nombre_completo AS nombre FROM perfiles WHERE id = ? AND activo = 1').get(usuarioId);
}

/** Registro en auditoria_roles (el módulo de Auditoría del Superadmin puede leerlo). */
export async function auditarRol(usuarioId, accion, rolId, antes, despues) {
  await db.prepare(`
    INSERT INTO cuentas.auditoria_roles (usuario_id, accion, rol_id, antes, despues)
    VALUES (?, ?, ?, ?::jsonb, ?::jsonb)
  `).run(usuarioId, accion, rolId, JSON.stringify(antes ?? null), JSON.stringify(despues ?? null));
}
