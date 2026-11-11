// Siembra idempotente del núcleo (todos los entornos):
// 1) catálogo de permisos, 2) organización plataforma + instituciones existentes,
// 3) roles plantilla de sistema, 4) asignación de rol a usuarios que aún no tienen.
import db from '../db.js';
import { PERMISOS, ROLES_PLANTILLA } from '../cuentas/permisos.js';

export const ORG_PLATAFORMA = 'org-pymedu-plataforma';

export async function sembrarNucleo() {
  for (const p of PERMISOS) {
    await db.prepare(`
      INSERT INTO cuentas.permiso (codigo, app, modulo, accion, descripcion, ambitos)
      VALUES (?, ?, ?, ?, ?, ?::text[])
      ON CONFLICT (codigo) DO UPDATE SET descripcion = EXCLUDED.descripcion, app = EXCLUDED.app, ambitos = EXCLUDED.ambitos
    `).run(p.codigo, p.app, p.modulo, p.accion, p.descripcion, `{${p.ambitos.join(',')}}`);
  }

  await db.prepare(`
    INSERT INTO cuentas.organizacion (id, tipo, nombre) VALUES (?, 'plataforma', 'PymEdu')
    ON CONFLICT (id) DO NOTHING
  `).run(ORG_PLATAFORMA);

  // Migración: instituciones → organizaciones (mismo id, para no romper perfiles.institucion_id).
  await db.prepare(`
    INSERT INTO cuentas.organizacion (id, tipo, nombre, rut, logo_url, estado)
    SELECT id, 'institucion', nombre, rut, logo_url, CASE WHEN activa = 1 THEN 'activa' ELSE 'suspendida' END
    FROM instituciones
    ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, rut = EXCLUDED.rut, logo_url = EXCLUDED.logo_url
  `).run();

  // Roles plantilla: se crean una vez; sus permisos solo se cargan al crearlos para
  // no pisar los cambios que el Superadmin haga después desde la matriz editable.
  const ids = {};
  for (const r of ROLES_PLANTILLA) {
    const existente = await db.prepare('SELECT id FROM cuentas.rol WHERE organizacion_id IS NULL AND codigo = ?').get(r.codigo);
    if (existente) { ids[r.codigo] = existente.id; continue; }
    const nuevo = await db.prepare(`
      INSERT INTO cuentas.rol (codigo, nombre, descripcion, ambito, es_sistema, es_plantilla)
      VALUES (?, ?, ?, ?, ?, ?) RETURNING id
    `).get(r.codigo, r.nombre, r.descripcion ?? null, r.ambito, r.es_sistema, r.es_plantilla);
    ids[r.codigo] = nuevo.id;
    for (const codigo of r.permisos) {
      await db.prepare('INSERT INTO cuentas.rol_permiso (rol_id, permiso_codigo) VALUES (?, ?) ON CONFLICT DO NOTHING').run(nuevo.id, codigo);
    }
  }
  for (const r of ROLES_PLANTILLA.filter((x) => x.padre)) {
    await db.prepare('UPDATE cuentas.rol SET rol_padre_id = ? WHERE id = ? AND rol_padre_id IS NULL').run(ids[r.padre], ids[r.codigo]);
  }

  // Renombrado (regla PYME): la cuenta promovida se presenta como PYME /
  // Pequeña Empresa, no como "Dueño". Idempotente para bases existentes.
  await db.prepare(
    "UPDATE cuentas.rol SET nombre = 'PYME / Pequeña Empresa' WHERE organizacion_id IS NULL AND codigo = 'dueño' AND nombre = 'Dueño / Admin PYME'"
  ).run();

  // Cada usuario sin asignaciones recibe la plantilla equivalente a su rol actual.
  await db.prepare(`
    INSERT INTO cuentas.asignacion_rol (usuario_id, rol_id, organizacion_id, otorgado_por)
    SELECT p.id, r.id, p.institucion_id, 'migracion'
    FROM perfiles p
    JOIN cuentas.rol r ON r.organizacion_id IS NULL AND r.codigo = (CASE WHEN p.rol = 'dueno' THEN 'dueño' ELSE p.rol END)
    WHERE NOT EXISTS (SELECT 1 FROM cuentas.asignacion_rol a WHERE a.usuario_id = p.id)
    ON CONFLICT DO NOTHING
  `).run();
}
