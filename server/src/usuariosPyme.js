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

const router = Router();
router.use(requireAuth);

/** Roles de equipo que el titular puede crear (guía VAR1/VAR2/VAR3). */
const ROLES_EQUIPO = ['vendedor', 'gestor', 'empleado'];
/** Titular del negocio: emprendedor individual o dueño de PYME ('dueno' tolerado por migraciones). */
const ROLES_TITULAR = ['emprendedor', 'dueño', 'dueno'];

/** Flags del plan por defecto según el rol del nuevo miembro (espejo de permisosApp en src/lib/roles.ts). */
const FLAGS_POR_ROL = {
  vendedor: { puede_ver_remuneraciones: 0, puede_ver_caja: 1, puede_ver_reportes: 0, puede_crear_ventas: 1, puede_crear_gastos: 0 },
  gestor: { puede_ver_remuneraciones: 0, puede_ver_caja: 1, puede_ver_reportes: 1, puede_crear_ventas: 1, puede_crear_gastos: 1 },
  empleado: { puede_ver_remuneraciones: 1, puede_ver_caja: 0, puede_ver_reportes: 0, puede_crear_ventas: 0, puede_crear_gastos: 0 },
};

function soloTitular(req, res, next) {
  if (!ROLES_TITULAR.includes(req.perfil.rol)) {
    return res.status(403).json({ error: 'Solo el titular del negocio (emprendedor o dueño de PYME) puede gestionar el equipo.' });
  }
  return next();
}

/** Email del nuevo miembro: su correo personal (con ese entra a PymEdu). */
function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? '').trim().toLowerCase());
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
      SELECT id, email, nombre_completo, rol, activo, membresia_nivel, created_at
      FROM perfiles WHERE reporta_a = ? ORDER BY created_at
    `).all(req.perfil.id);
    res.json({ data: filas });
  } catch (error) {
    console.error('[pyme] Error listando equipo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/pyme', soloTitular, async (req, res) => {
  try {
    const { nombre, apellido, rol, email } = req.body ?? {};
    const nombreLimpio = String(nombre ?? '').trim();
    const apellidoLimpio = String(apellido ?? '').trim();
    const emailLimpio = String(email ?? '').trim().toLowerCase();

    if (!nombreLimpio || !apellidoLimpio) {
      return res.status(400).json({ error: 'Nombre y apellido son obligatorios.' });
    }
    if (!emailValido(emailLimpio)) {
      return res.status(400).json({ error: 'Ingresa un correo personal válido para el nuevo miembro.' });
    }
    const ocupado = await db.prepare('SELECT id FROM perfiles WHERE email = ?').get(emailLimpio);
    if (ocupado) {
      return res.status(409).json({ error: 'Ese correo ya tiene una cuenta en PymEdu.' });
    }
    if (!ROLES_EQUIPO.includes(rol)) {
      return res.status(400).json({ error: `Rol de equipo inválido: ${rol}. Puede crear vendedor, gestor (bodeguero) o empleado (asistente).` });
    }
    // El negocio debe estar configurado (mismo requisito que el tab Equipo del ERP).
    if (!req.perfil.negocio_nombre || !req.perfil.negocio_rut || !req.perfil.negocio_rubro) {
      return res.status(400).json({ error: 'Completa primero los datos del negocio (nombre, RUT y rubro) en Mi Negocio.' });
    }
    // La contraseña siempre se genera automáticamente: se muestra una sola vez
    // en pantalla (con el correo y la página de acceso) para copiarla y entregarla.
    const contrasena = generarPasswordTemporal();

    const id = randomUUID();
    const flags = FLAGS_POR_ROL[rol];

    await db.prepare(`
      INSERT INTO perfiles
        (id, email, password_hash, nombre_completo, rol, reporta_a, activo,
         membresia_nivel, segmento_negocio,
         puede_ver_remuneraciones, puede_ver_caja, puede_ver_reportes,
         puede_crear_ventas, puede_crear_gastos)
      VALUES (?, ?, ?, ?, ?, ?, 1, 'free', 'C', ?, ?, ?, ?, ?)
    `).run(
      id, emailLimpio, bcrypt.hashSync(contrasena, 10), `${nombreLimpio} ${apellidoLimpio}`,
      rol, req.perfil.id,
      flags.puede_ver_remuneraciones, flags.puede_ver_caja, flags.puede_ver_reportes,
      flags.puede_crear_ventas, flags.puede_crear_gastos
    );

    // Rol dinámico del nuevo miembro: plantilla de sistema equivalente a su rol
    // (mismo patrón que la siembra del núcleo en server/src/seeds/nucleo.js).
    await db.prepare(`
      INSERT INTO cuentas.asignacion_rol (usuario_id, rol_id, organizacion_id, otorgado_por)
      SELECT ?, r.id, NULL, ?
      FROM cuentas.rol r WHERE r.organizacion_id IS NULL AND r.codigo = ?
      ON CONFLICT DO NOTHING
    `).run(id, req.perfil.id, rol);

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
