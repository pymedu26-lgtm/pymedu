// Roles dinámicos — API /api/roles/* (núcleo PymEdu Cuentas)
// Tablas: cuentas.permiso, cuentas.rol, cuentas.rol_permiso, cuentas.asignacion_rol, cuentas.auditoria_roles
// Regla central: nadie puede dar un permiso que no tiene; un subrol solo puede QUITAR permisos del padre.
import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { MODULOS, PERMISOS } from './permisos.js';
import { permisosDe, requierePermiso, organizacionActiva, auditarRol } from './servicio.js';
import { asegurarNegocioPyme, ROLES_TITULAR } from './negocio.js';

const router = Router();
router.use(requireAuth);

/**
 * Organización sobre la que se gestionan roles. Para el titular de una PYME es la
 * organización de su negocio (roles de ejemplo editables); para el resto, la de
 * siempre (institución, proveedor o plataforma).
 */
async function organizacionDeRoles(perfil) {
  if (ROLES_TITULAR.includes(perfil.rol)) return asegurarNegocioPyme(perfil);
  return organizacionActiva(perfil);
}

const APP_DE = Object.fromEntries(PERMISOS.map((p) => [p.codigo, p.app]));
/** Módulos que el plan del negocio no incluye (los permisos aparecen bloqueados al crear roles). */
const BLOQUEO_PLAN = { free: ['rrhh'], pro: ['rrhh'], premium: [] };

const manejar = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (error) {
    if (!error.status) console.error('[roles]', req.method, req.path, error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'error_interno', detalle: error.detalle });
  }
};
const falla = (status, message, detalle) => Object.assign(new Error(message), { status, detalle });

async function permisosDeRol(id) {
  return (await db.prepare('SELECT permiso_codigo FROM cuentas.rol_permiso WHERE rol_id = ?').all(id)).map((f) => f.permiso_codigo);
}

/** Permisos que este usuario puede otorgar en un ámbito dado. */
async function otorgables(req, ambito) {
  const propios = await permisosDe(req.perfil, req);
  const bloqueados = new Set(req.perfil.rol === 'superadmin' ? [] : BLOQUEO_PLAN[req.perfil.membresia_nivel] ?? []);
  return new Set([...propios].filter((c) => {
    const app = APP_DE[c];
    if (bloqueados.has(c.split('.')[0])) return false;
    if (ambito === 'proveedor') return app === 'mentorias' || c === 'roles.gestionar';
    if (ambito === 'negocio') return app === 'erp' || c === 'roles.gestionar';
    return true;
  }));
}

async function validarPermisos(req, ambito, permisos, padreId) {
  const desconocidos = permisos.filter((c) => !APP_DE[c]);
  if (desconocidos.length) throw falla(400, 'permisos_desconocidos', desconocidos);
  const permitidos = await otorgables(req, ambito);
  const ajenos = permisos.filter((c) => !permitidos.has(c));
  if (ajenos.length) throw falla(403, 'no_puedes_otorgar', ajenos);
  if (padreId) {
    const delPadre = new Set(await permisosDeRol(padreId));
    const extra = permisos.filter((c) => !delPadre.has(c));
    if (extra.length) throw falla(400, 'subrol_no_puede_agregar', extra);
  }
}

/** ¿Puede editar este rol? Superadmin: cualquiera salvo los de sistema; resto: solo los de su organización. */
async function rolEditable(req, id) {
  const rol = await db.prepare('SELECT * FROM cuentas.rol WHERE id = ?').get(id);
  if (!rol) throw falla(404, 'rol_no_encontrado');
  if (rol.es_sistema) throw falla(403, 'rol_de_sistema');
  if (req.perfil.rol !== 'superadmin') {
    const org = await organizacionDeRoles(req.perfil);
    if (!rol.organizacion_id || rol.organizacion_id !== org?.id) throw falla(403, 'sin_permiso');
  }
  return rol;
}

async function guardarPermisos(rolId, permisos) {
  await db.prepare('DELETE FROM cuentas.rol_permiso WHERE rol_id = ?').run(rolId);
  for (const c of new Set(permisos)) {
    await db.prepare('INSERT INTO cuentas.rol_permiso (rol_id, permiso_codigo) VALUES (?, ?)').run(rolId, c);
  }
  // Los subroles nunca pueden quedar con más que su padre.
  await db.prepare(`DELETE FROM cuentas.rol_permiso WHERE rol_id IN (SELECT id FROM cuentas.rol WHERE rol_padre_id = ?)
    AND permiso_codigo NOT IN (SELECT permiso_codigo FROM cuentas.rol_permiso WHERE rol_id = ?)`).run(rolId, rolId);
}

// Catálogo fijo + permisos propios (para pintar la matriz con casillas bloqueadas).
router.get('/permisos', manejar(async (req, res) => {
  const propios = await permisosDe(req.perfil, req);
  res.json({ data: PERMISOS, modulos: MODULOS, mios: [...propios] });
}));

router.get('/', manejar(async (req, res) => {
  const org = await organizacionDeRoles(req.perfil);
  // La PYME administra solo los roles de su negocio: las plantillas globales
  // (Emprendedor, PYME, etc.) no aplican a las cuentas locales del equipo.
  const filtro = req.perfil.rol === 'superadmin'
    ? ''
    : org?.tipo === 'negocio'
      ? 'WHERE r.organizacion_id = ?'
      : 'WHERE r.organizacion_id IS NULL OR r.organizacion_id = ?';
  const filas = await db.prepare(`
    SELECT r.*, o.nombre AS organizacion_nombre,
      (SELECT count(*)::int FROM cuentas.asignacion_rol a WHERE a.rol_id = r.id) AS usuarios,
      COALESCE((SELECT array_agg(rp.permiso_codigo ORDER BY rp.permiso_codigo) FROM cuentas.rol_permiso rp WHERE rp.rol_id = r.id), ARRAY[]::text[]) AS permisos
    FROM cuentas.rol r LEFT JOIN cuentas.organizacion o ON o.id = r.organizacion_id
    ${filtro}
    ORDER BY r.organizacion_id NULLS FIRST, r.es_sistema DESC, r.nombre`).all(...(filtro ? [org?.id ?? ''] : []));
  res.json({ data: filas, organizacion: org ?? null });
}));

router.post('/', requierePermiso('roles.gestionar'), manejar(async (req, res) => {
  const { nombre, descripcion = null, ambito, rol_padre_id = null, permisos = [], plantilla = false } = req.body ?? {};
  if (!String(nombre ?? '').trim()) throw falla(400, 'nombre_requerido');
  if (!['plataforma', 'institucion', 'negocio', 'proveedor'].includes(ambito)) throw falla(400, 'ambito_invalido');
  const esSuper = req.perfil.rol === 'superadmin';
  if (ambito === 'plataforma' && !esSuper) throw falla(403, 'solo_superadmin');
  const org = esSuper && plantilla ? null : await organizacionDeRoles(req.perfil);
  // El administrador de una PYME solo crea roles de negocio.
  if (org?.tipo === 'negocio' && ambito !== 'negocio') throw falla(400, 'ambito_invalido');
  await validarPermisos(req, ambito, permisos, rol_padre_id);
  const nuevo = await db.prepare(`
    INSERT INTO cuentas.rol (nombre, descripcion, ambito, organizacion_id, rol_padre_id, es_plantilla, creado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`).get(String(nombre).trim(), descripcion, ambito,
    esSuper && plantilla ? null : org?.id ?? null, rol_padre_id, !!(esSuper && plantilla), req.perfil.id);
  await guardarPermisos(nuevo.id, permisos);
  await auditarRol(req.perfil.id, 'crear', nuevo.id, null, { ...nuevo, permisos });
  res.status(201).json({ data: { ...nuevo, permisos } });
}));

router.put('/:id', requierePermiso('roles.gestionar'), manejar(async (req, res) => {
  const rol = await rolEditable(req, req.params.id);
  const antes = { ...rol, permisos: await permisosDeRol(rol.id) };
  const { nombre, descripcion, permisos, activo } = req.body ?? {};
  if (Array.isArray(permisos)) {
    // Al editar solo se validan los permisos NUEVOS: los que ya tenía el rol
    // (por ejemplo, accesos base copiados de una plantilla) pueden conservarse.
    const actuales = await permisosDeRol(rol.id);
    const agregados = permisos.filter((c) => !actuales.includes(c));
    await validarPermisos(req, rol.ambito, agregados, rol.rol_padre_id);
    await guardarPermisos(rol.id, permisos);
  }
  await db.prepare(`UPDATE cuentas.rol SET nombre = COALESCE(?, nombre), descripcion = COALESCE(?, descripcion),
    activo = COALESCE(?, activo), actualizado_en = now() WHERE id = ?`).run(nombre ?? null, descripcion ?? null, typeof activo === 'boolean' ? activo : null, rol.id);
  const despues = { ...(await db.prepare('SELECT * FROM cuentas.rol WHERE id = ?').get(rol.id)), permisos: await permisosDeRol(rol.id) };
  await auditarRol(req.perfil.id, 'editar', rol.id, antes, despues);
  res.json({ data: despues });
}));

// Desactivar (no se borra: hay asignaciones e historial).
router.delete('/:id', requierePermiso('roles.gestionar'), manejar(async (req, res) => {
  const rol = await rolEditable(req, req.params.id);
  await db.prepare('UPDATE cuentas.rol SET activo = false, actualizado_en = now() WHERE id = ?').run(rol.id);
  await auditarRol(req.perfil.id, 'desactivar', rol.id, { activo: rol.activo }, { activo: false });
  res.json({ ok: true });
}));

router.get('/:id/auditoria', requierePermiso('roles.gestionar'), manejar(async (req, res) => {
  const filas = await db.prepare(`SELECT a.id, a.accion, a.antes, a.despues, a.creado_en, p.nombre_completo AS usuario
    FROM cuentas.auditoria_roles a LEFT JOIN perfiles p ON p.id = a.usuario_id WHERE a.rol_id = ? ORDER BY a.creado_en DESC LIMIT 50`).all(req.params.id);
  res.json({ data: filas });
}));

export default router;
