// Organización "negocio" de cada PYME + roles de ejemplo editables por su administrador.
// El esquema cuentas.organizacion ya contempla el tipo 'negocio': aquí se crea de forma
// idempotente (id determinista) y se copian las plantillas del equipo como roles locales.
import db from '../db.js';

export const ROLES_TITULAR = ['emprendedor', 'dueño', 'dueno'];

export const idOrganizacionNegocio = (perfilId) => `negocio-${perfilId}`;

/**
 * Roles de ejemplo del equipo PYME. Se copian de la plantilla global equivalente
 * (mismo código para conservar perfiles.rol) pero quedan dentro de la organización
 * del negocio, por lo que el administrador puede editar sus permisos.
 */
export const ROLES_EQUIPO_EJEMPLO = [
  {
    codigo: 'vendedor',
    nombre: 'Vendedor',
    descripcion: 'Rol comercial del negocio: registra ventas, atiende clientes y gestiona su perfil. Editable por el administrador.',
  },
  {
    codigo: 'gestor',
    nombre: 'Bodeguero',
    descripcion: 'Operaciones del negocio: inventario, caja, promociones, clientes, proveedores y reportes. Editable por el administrador.',
  },
  {
    codigo: 'contador_externo',
    nombre: 'Contador',
    descripcion: 'Revisa caja, reportes, contabilidad, clientes, proveedores e inventario. Editable por el administrador.',
  },
  {
    codigo: 'empleado',
    nombre: 'Asistente',
    descripcion: 'Miembro del equipo: acceso a su perfil, sus remuneraciones y la Academia. Editable por el administrador.',
  },
];

/**
 * Miembros creados antes de existir los roles locales: tienen asignada la plantilla
 * global. Al primer acceso del titular los pasamos al rol local equivalente (mismo
 * código) sin tocar a quienes ya tienen un rol local o un rol distinto.
 */
async function migrarMiembrosARolesLocales(perfil, orgId) {
  const miembros = await db.prepare('SELECT id, rol FROM perfiles WHERE reporta_a = ?').all(perfil.id);
  for (const miembro of miembros) {
    const local = await db.prepare(
      'SELECT id FROM cuentas.rol WHERE organizacion_id = ? AND codigo = ? AND activo'
    ).get(orgId, miembro.rol);
    if (!local) continue;
    const yaLocal = await db.prepare(
      'SELECT 1 FROM cuentas.asignacion_rol WHERE usuario_id = ? AND organizacion_id = ?'
    ).get(miembro.id, orgId);
    if (yaLocal) continue;
    await db.prepare(`
      UPDATE cuentas.asignacion_rol SET rol_id = ?, organizacion_id = ?
      WHERE usuario_id = ? AND rol_id IN (
        SELECT id FROM cuentas.rol WHERE organizacion_id IS NULL AND codigo = ?
      )
    `).run(local.id, orgId, miembro.id, miembro.rol);
  }
}

/**
 * Garantiza que el negocio tenga su organización y sus roles de ejemplo.
 * Idempotente: no recrea roles existentes ni pisa permisos ya editados.
 */
export async function asegurarNegocioPyme(perfil) {
  if (!perfil?.id) return null;
  const orgId = idOrganizacionNegocio(perfil.id);

  const existente = await db.prepare('SELECT id, nombre, tipo FROM cuentas.organizacion WHERE id = ?').get(orgId);
  if (!existente) {
    const nombre = String(perfil.negocio_nombre ?? '').trim() || String(perfil.nombre_completo ?? '').trim() || 'Mi negocio';
    await db.prepare(`
      INSERT INTO cuentas.organizacion (id, tipo, nombre, rut, estado)
      VALUES (?, 'negocio', ?, ?, 'activa')
      ON CONFLICT (id) DO NOTHING
    `).run(orgId, nombre, perfil.negocio_rut ?? null);
  }

  for (const rol of ROLES_EQUIPO_EJEMPLO) {
    const ya = await db.prepare('SELECT id FROM cuentas.rol WHERE organizacion_id = ? AND codigo = ?').get(orgId, rol.codigo);
    if (ya) continue;
    const nuevo = await db.prepare(`
      INSERT INTO cuentas.rol (codigo, nombre, descripcion, ambito, organizacion_id, es_sistema, es_plantilla, creado_por)
      VALUES (?, ?, ?, 'negocio', ?, false, false, ?)
      RETURNING id
    `).get(rol.codigo, rol.nombre, rol.descripcion, orgId, perfil.id);
    await db.prepare(`
      INSERT INTO cuentas.rol_permiso (rol_id, permiso_codigo)
      SELECT ?, rp.permiso_codigo
      FROM cuentas.rol_permiso rp
      JOIN cuentas.rol r ON r.id = rp.rol_id
      WHERE r.organizacion_id IS NULL AND r.codigo = ?
      ON CONFLICT DO NOTHING
    `).run(nuevo.id, rol.codigo);
  }

  await migrarMiembrosARolesLocales(perfil, orgId);

  return db.prepare('SELECT id, nombre, tipo FROM cuentas.organizacion WHERE id = ?').get(orgId);
}
