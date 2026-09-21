import { Router } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';
import db from './db.js';
import { requireAuth, sanitizarPerfil } from './auth.js';

const router = Router();

router.use(requireAuth);

const ROLES_CREABLES = [
  'admin_institucional', 'coordinador', 'mentor', 'emprendedor', 'dueño',
  'vendedor', 'gestor', 'encargado_rrhh', 'empleado', 'contador_externo',
];

function flagsPorMembresia(nivel) {
  if (nivel === 'premium') return { puede_ver_remuneraciones: 1, puede_ver_caja: 1, puede_ver_reportes: 1, puede_crear_ventas: 1, puede_crear_gastos: 1 };
  if (nivel === 'pro') return { puede_ver_remuneraciones: 0, puede_ver_caja: 1, puede_ver_reportes: 1, puede_crear_ventas: 1, puede_crear_gastos: 1 };
  return { puede_ver_remuneraciones: 0, puede_ver_caja: 0, puede_ver_reportes: 0, puede_crear_ventas: 1, puede_crear_gastos: 1 };
}

function soloSuperadmin(req, res, next) {
  if (req.perfil.rol !== 'superadmin') {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  return next();
}

// Panel /admin/usuarios: conteo de usuarios por rol
router.get('/perfiles/conteo-por-rol', soloSuperadmin, async (req, res) => {
  try {
    const filas = await db.prepare('SELECT rol, COUNT(*)::int AS n FROM perfiles GROUP BY rol').all();
    const conteo = {};
    for (const f of filas) conteo[f.rol] = f.n;
    res.json({ data: conteo });
  } catch (error) {
    console.error('[admin] Error en conteo por rol:', error);
    res.status(500).json({ error: 'error_interno' });
  }
});

// Superadmin crea un usuario con rol y membresia.
// Equivale a la RPC admin_crear_usuario de Supabase.
router.post('/crear-usuario', soloSuperadmin, async (req, res) => {
  try {
    const {
      email, password, nombre_completo, rol = 'emprendedor',
      institucion_id = null, membresia = 'free', activo = true,
    } = req.body ?? {};

    if (!email || !password || !nombre_completo) {
      return res.status(400).json({ error: 'Email, contraseña y nombre son obligatorios.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }
    if (!ROLES_CREABLES.includes(rol) && rol !== 'superadmin') {
      return res.status(400).json({ error: `El rol no puede ser creado por un superadmin directo: ${rol}` });
    }
    if (!['free', 'pro', 'premium'].includes(membresia)) {
      return res.status(400).json({ error: 'Membresía inválida.' });
    }

    const emailLimpio = String(email).trim().toLowerCase();
    const existente = await db.prepare('SELECT id FROM perfiles WHERE email = ?').get(emailLimpio);
    if (existente) return res.status(409).json({ error: 'El email ya está registrado.' });

    if (institucion_id) {
      const inst = await db.prepare('SELECT id FROM instituciones WHERE id = ?').get(institucion_id);
      if (!inst) return res.status(400).json({ error: 'La institución no existe.' });
    }

    const flags = flagsPorMembresia(membresia);
    const id = randomUUID();
    const passwordHash = bcrypt.hashSync(String(password), 10);

    await db.prepare(`
      INSERT INTO perfiles
        (id, email, password_hash, nombre_completo, rol, institucion_id, activo,
         membresia_nivel, puede_ver_remuneraciones, puede_ver_caja, puede_ver_reportes,
         puede_crear_ventas, puede_crear_gastos, segmento_negocio)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'C')
    `).run(
      id, emailLimpio, passwordHash, nombre_completo, rol, institucion_id,
      activo ? 1 : 0, membresia,
      flags.puede_ver_remuneraciones, flags.puede_ver_caja, flags.puede_ver_reportes,
      flags.puede_crear_ventas, flags.puede_crear_gastos
    );

    const perfil = await db.prepare('SELECT * FROM perfiles WHERE id = ?').get(id);
    res.status(201).json({ perfil: sanitizarPerfil(perfil) });
  } catch (error) {
    console.error('[admin] Error creando usuario:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'El email ya está registrado.' });
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Superadmin elimina un usuario (cascade: errores de ERP, solicitudes,
// usuario_programas; reporta_a/creado_por pasan a NULL).
router.delete('/perfiles/:id', soloSuperadmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.perfil.id) {
      return res.status(400).json({ error: 'No puedes eliminar tu propio usuario.' });
    }
    const existente = await db.prepare('SELECT email FROM perfiles WHERE id = ?').get(id);
    if (!existente) return res.status(404).json({ error: 'El usuario no existe.' });

    await db.prepare('DELETE FROM perfiles WHERE id = ?').run(id);
    res.json({ ok: true, email: existente.email });
  } catch (error) {
    console.error('[admin] Error eliminando usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;