// Equipo PYME — API /api/usuarios/* (tab "Equipo" del ERP).
// Regla de estructura de roles (PROYECTO/ESTRUCTURA_ROLES.txt): el EMPRENDEDOR
// que crea usuarios dentro de su misma cuenta deja de ser un emprendedor
// individual y pasa a ser PYME / PEQUEÑA EMPRESA (rol 'dueño'), con sub-roles
// VENDEDOR (VAR1), BODEGUERO/VAR2 ('gestor') y ASISTENTE/VAR3 ('empleado').
import { Router } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';
import db from './db.js';
import { requireAuth, sanitizarPerfil } from './auth.js';
import { auditarRol } from './cuentas/servicio.js';
import { asegurarNegocioPyme, ROLES_TITULAR } from './cuentas/negocio.js';

const router = Router();
router.use(requireAuth);

/** Códigos base de los roles de equipo (guía VAR1/VAR2/VAR3 + contador). */
const ROLES_EQUIPO = ['vendedor', 'gestor', 'empleado', 'contador_externo'];

/** Flags del plan por defecto según el rol del nuevo miembro (espejo de permisosApp en src/lib/roles.ts). */
const FLAGS_POR_ROL = {
  vendedor: { puede_ver_remuneraciones: 0, puede_ver_caja: 1, puede_ver_reportes: 0, puede_crear_ventas: 1, puede_crear_gastos: 0 },
  gestor: { puede_ver_remuneraciones: 0, puede_ver_caja: 1, puede_ver_reportes: 1, puede_crear_ventas: 1, puede_crear_gastos: 1 },
  empleado: { puede_ver_remuneraciones: 1, puede_ver_caja: 0, puede_ver_reportes: 0, puede_crear_ventas: 0, puede_crear_gastos: 0 },
  contador_externo: { puede_ver_remuneraciones: 0, puede_ver_caja: 1, puede_ver_reportes: 1, puede_crear_ventas: 0, puede_crear_gastos: 0 },
};

function soloTitular(req, res, next) {
  if (!ROLES_TITULAR.includes(req.perfil.rol)) {
    return res.status(403).json({ error: 'Solo el titular del negocio (emprendedor o dueño de PYME) puede gestionar el equipo.' });
  }
  return next();
}

/** Email del miembro: se genera como inicial.apellido@pymedu.cl (con número si ya existe). */
function normalizarTexto(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

async function generarEmailMiembro(nombre, apellido) {
  const inicial = normalizarTexto(nombre).charAt(0) || 'u';
  const ap = normalizarTexto(apellido) || 'equipo';
  const base = `${inicial}.${ap}`;
  let email = `${base}@pymedu.cl`;
  let n = 2;
  while (await db.prepare('SELECT 1 FROM perfiles WHERE email = ?').get(email)) {
    email = `${base}${n}@pymedu.cl`;
    n += 1;
  }
  return email;
}

/** Contraseña temporal entregable al titular cuando no define una para el nuevo miembro. */
function generarPasswordTemporal() {
  return `Pyme-${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

/** Miembro del equipo del titular actual (o null). */
function miembroDelTitular(titularId, id) {
  return db.prepare(
    'SELECT id, email, nombre_completo, rol FROM perfiles WHERE id = ? AND reporta_a = ?'
  ).get(id, titularId);
}

/** Página de acceso: la misma para todos los roles. */
function paginaAcceso() {
  return `${process.env.FRONT_URL || 'https://www.pymedu.cl'}/login`;
}

/** Miembros creados dentro de la cuenta del titular (perfiles.reporta_a). */
router.get('/pyme', soloTitular, async (req, res) => {
  try {
    const filas = await db.prepare(`
      SELECT p.id, p.email, p.nombre_completo, p.rol, p.activo, p.membresia_nivel, p.created_at,
        (SELECT a.rol_id FROM cuentas.asignacion_rol a
          WHERE a.usuario_id = p.id
          ORDER BY (a.organizacion_id IS NOT NULL) DESC, a.otorgado_en LIMIT 1) AS rol_id,
        (SELECT r.nombre FROM cuentas.asignacion_rol a
          JOIN cuentas.rol r ON r.id = a.rol_id
          WHERE a.usuario_id = p.id
          ORDER BY (a.organizacion_id IS NOT NULL) DESC, a.otorgado_en LIMIT 1) AS rol_nombre
      FROM perfiles p WHERE p.reporta_a = ? ORDER BY p.created_at
    `).all(req.perfil.id);
    res.json({ data: filas });
  } catch (error) {
    console.error('[pyme] Error listando equipo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/pyme', soloTitular, async (req, res) => {
  try {
    const { nombre, apellido, rol, rol_id } = req.body ?? {};
    const nombreLimpio = String(nombre ?? '').trim();
    const apellidoLimpio = String(apellido ?? '').trim();

    if (!nombreLimpio || !apellidoLimpio) {
      return res.status(400).json({ error: 'Nombre y apellido son obligatorios.' });
    }
    // El negocio debe estar configurado (mismo requisito que el tab Equipo del ERP).
    if (!req.perfil.negocio_nombre || !req.perfil.negocio_rut || !req.perfil.negocio_rubro) {
      return res.status(400).json({ error: 'Completa primero los datos del negocio (nombre, RUT y rubro) en Mi Negocio.' });
    }

    // Organización del negocio + roles de ejemplo editables (idempotente).
    const org = await asegurarNegocioPyme(req.perfil);

    // Rol local del negocio: por id (roles de ejemplo o creados por el admin) o por código.
    let rolLocal = null;
    if (rol_id) {
      rolLocal = await db.prepare(
        'SELECT id, codigo, nombre FROM cuentas.rol WHERE id = ? AND organizacion_id = ? AND activo'
      ).get(String(rol_id), org.id);
      if (!rolLocal) {
        return res.status(400).json({ error: 'El rol seleccionado no pertenece a tu negocio.' });
      }
    } else {
      if (!ROLES_EQUIPO.includes(rol)) {
        return res.status(400).json({ error: `Rol de equipo inválido: ${rol}. Puede crear vendedor, bodeguero, contador o asistente.` });
      }
      rolLocal = await db.prepare(
        'SELECT id, codigo, nombre FROM cuentas.rol WHERE organizacion_id = ? AND codigo = ? AND activo'
      ).get(org.id, rol);
    }
    // perfiles.rol conserva un código base conocido por el resto de la app.
    const codigoPerfil = ROLES_EQUIPO.includes(rolLocal?.codigo) ? rolLocal.codigo : 'empleado';
    const flags = FLAGS_POR_ROL[codigoPerfil];

    // Correo de acceso generado: inicial.apellido@pymedu.cl (con número si ya existe).
    const emailLimpio = await generarEmailMiembro(nombreLimpio, apellidoLimpio);
    // La contraseña siempre se genera automáticamente: se muestra una sola vez
    // en pantalla (con el correo y la página de acceso) para copiarla y entregarla.
    const contrasena = generarPasswordTemporal();

    const id = randomUUID();

    await db.prepare(`
      INSERT INTO perfiles
        (id, email, password_hash, nombre_completo, rol, reporta_a, activo,
         membresia_nivel, segmento_negocio,
         puede_ver_remuneraciones, puede_ver_caja, puede_ver_reportes,
         puede_crear_ventas, puede_crear_gastos)
      VALUES (?, ?, ?, ?, ?, ?, 1, 'free', 'C', ?, ?, ?, ?, ?)
    `).run(
      id, emailLimpio, bcrypt.hashSync(contrasena, 10), `${nombreLimpio} ${apellidoLimpio}`,
      codigoPerfil, req.perfil.id,
      flags.puede_ver_remuneraciones, flags.puede_ver_caja, flags.puede_ver_reportes,
      flags.puede_crear_ventas, flags.puede_crear_gastos
    );

    // Rol dinámico del nuevo miembro: el rol local del negocio (editable por el
    // administrador). Respaldo: plantilla global equivalente si no existiera.
    if (rolLocal) {
      await db.prepare(`
        INSERT INTO cuentas.asignacion_rol (usuario_id, rol_id, organizacion_id, otorgado_por)
        VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING
      `).run(id, rolLocal.id, org.id, req.perfil.id);
    } else {
      await db.prepare(`
        INSERT INTO cuentas.asignacion_rol (usuario_id, rol_id, organizacion_id, otorgado_por)
        SELECT ?, r.id, NULL, ?
        FROM cuentas.rol r WHERE r.organizacion_id IS NULL AND r.codigo = ?
        ON CONFLICT DO NOTHING
      `).run(id, req.perfil.id, codigoPerfil);
    }

    // ── REGLA DE ESTRUCTURA DE ROLES ──
    // Al crear usuarios dentro de su misma cuenta, el EMPRENDEDOR pasa a ser
    // PYME / PEQUEÑA EMPRESA: perfiles.rol = 'dueño' (y su asignación de plantilla
    // del núcleo lo sigue, para que los permisos dinámicos se actualicen).
    let promocionPyme = false;
    if (req.perfil.rol === 'emprendedor' || req.perfil.rol === 'dueno') {
      await db.prepare(`
        UPDATE perfiles SET rol = 'dueño',
          updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
        WHERE id = ? AND rol IN ('emprendedor', 'dueno')
      `).run(req.perfil.id);
      await db.prepare(`
        UPDATE cuentas.asignacion_rol a
        SET rol_id = r_pyme.id
        FROM cuentas.rol r_pyme
        WHERE r_pyme.organizacion_id IS NULL AND r_pyme.codigo = 'dueño'
          AND a.usuario_id = ?
          AND a.rol_id IN (SELECT id FROM cuentas.rol WHERE organizacion_id IS NULL AND codigo IN ('emprendedor', 'dueno'))
      `).run(req.perfil.id);
      const rolPyme = await db.prepare(
        "SELECT id FROM cuentas.rol WHERE organizacion_id IS NULL AND codigo = 'dueño'"
      ).get();
      if (rolPyme) {
        await auditarRol(req.perfil.id, 'asignar', rolPyme.id, { rol: req.perfil.rol }, { rol: 'dueño' });
      }
      promocionPyme = true;
    }

    const usuario = await db.prepare(
      'SELECT id, email, nombre_completo, rol FROM perfiles WHERE id = ?'
    ).get(id);
    const perfil = await db.prepare('SELECT * FROM perfiles WHERE id = ?').get(req.perfil.id);

    res.status(201).json({
      ok: true,
      usuario,
      rol_id: rolLocal?.id ?? null,
      rol_nombre: rolLocal?.nombre ?? null,
      // Contraseña generada: se muestra una sola vez en pantalla para copiarla.
      password_temporal: contrasena,
      pagina_acceso: paginaAcceso(),
      ...(promocionPyme ? { promocion_pyme: true, perfil: sanitizarPerfil(perfil) } : {}),
    });
  } catch (error) {
    console.error('[pyme] Error creando usuario del equipo:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'El email ya está registrado.' });
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/** Restablece la contraseña de un miembro: genera una nueva y la entrega una sola vez. */
router.post('/pyme/:id/restablecer-password', soloTitular, async (req, res) => {
  try {
    const miembro = await miembroDelTitular(req.perfil.id, req.params.id);
    if (!miembro) {
      return res.status(404).json({ error: 'Usuario no encontrado en tu equipo.' });
    }
    const contrasena = generarPasswordTemporal();
    await db.prepare(`
      UPDATE perfiles SET password_hash = ?, acceso_revocado_at = NULL,
        updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
      WHERE id = ?
    `).run(bcrypt.hashSync(contrasena, 10), miembro.id);

    res.json({
      ok: true,
      usuario: miembro,
      password_temporal: contrasena,
      pagina_acceso: paginaAcceso(),
    });
  } catch (error) {
    console.error('[pyme] Error restableciendo contraseña:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/** Elimina una cuenta local del equipo del titular. */
router.delete('/pyme/:id', soloTitular, async (req, res) => {
  try {
    const miembro = await miembroDelTitular(req.perfil.id, req.params.id);
    if (!miembro) {
      return res.status(404).json({ error: 'Usuario no encontrado en tu equipo.' });
    }
    // asignacion_rol no tiene FK a perfiles: se limpia a mano (el resto cascada).
    await db.prepare('DELETE FROM cuentas.asignacion_rol WHERE usuario_id = ?').run(miembro.id);
    await db.prepare('DELETE FROM perfiles WHERE id = ? AND reporta_a = ?').run(miembro.id, req.perfil.id);

    res.json({ ok: true, usuario: miembro });
  } catch (error) {
    console.error('[pyme] Error eliminando usuario del equipo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
