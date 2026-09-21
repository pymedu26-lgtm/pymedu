import { randomUUID } from 'crypto';
import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from './db.js';
import { registrarVinculacionTrasRegistro } from './vinculacionServicio.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'pymedu-secret-key-change-in-production';
const JWT_EXPIRA = '24h';

function sanitizarPerfil(p) {
  return {
    id: p.id,
    email: p.email,
    nombre_completo: p.nombre_completo,
    rol: p.rol,
    institucion_id: p.institucion_id,
    reporta_a: p.reporta_a,
    puede_ver_remuneraciones: !!p.puede_ver_remuneraciones,
    puede_ver_caja: !!p.puede_ver_caja,
    puede_ver_reportes: !!p.puede_ver_reportes,
    puede_crear_ventas: !!p.puede_crear_ventas,
    puede_crear_gastos: !!p.puede_crear_gastos,
    membresia_nivel: p.membresia_nivel,
    membresia_expira: p.membresia_expira,
    segmento_negocio: p.segmento_negocio,
    negocio_nombre: p.negocio_nombre,
    logo_url: p.logo_url,
    avatar_url: p.avatar_url,
    activo: !!p.activo,
    acceso_revocado_at: p.acceso_revocado_at,
  };
}

function generarToken(perfil) {
  return jwt.sign(
    { id: perfil.id, email: perfil.email, rol: perfil.rol },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRA }
  );
}

// El frontend se autentica con Supabase Auth; ademas aceptamos access tokens de
// Supabase validandolos contra /auth/v1/user.
async function verificarSupabase(token) {
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  if (!supabaseUrl) {
    console.error('[auth] SUPABASE_URL no configurada.');
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY || '',
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const cuerpo = await res.text().catch(() => '');
      console.error(`[auth] Supabase /auth/v1/user HTTP ${res.status}: ${cuerpo.slice(0, 300)}`);
      return null;
    }
    const user = await res.json();
    return user && user.id ? user : null;
  } catch (error) {
    console.error('[auth] Error llamando Supabase /auth/v1/user:', error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Middleware async: valida JWT local; si falla, valida contra Supabase.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  const token = header.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const perfil = await db.prepare('SELECT * FROM perfiles WHERE id = ? AND activo = 1').get(decoded.id);
    if (!perfil) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    if (perfil.acceso_revocado_at) {
      return res.status(403).json({ error: 'Acceso revocado' });
    }
    req.perfil = perfil;
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      const usuarioSupabase = await verificarSupabase(token);
      if (!usuarioSupabase || !usuarioSupabase.id) {
        console.error('[auth] Token rechazado por Supabase. Prefijo:', token.slice(0, 24), '...');
        return res.status(401).json({ error: 'Token invalido o expirado' });
      }
      const perfil = await db.prepare('SELECT * FROM perfiles WHERE email = ? AND activo = 1').get(usuarioSupabase.email || '');
      req.perfil = {
        id: perfil ? perfil.id : usuarioSupabase.id,
        email: perfil ? perfil.email : (usuarioSupabase.email || ''),
        nombre_completo: perfil ? perfil.nombre_completo : '',
        rol: perfil ? perfil.rol : 'emprendedor',
      };
      return next();
    }
    console.error('[auth] Error verificando token:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contrasena requeridos' });
    }

    const perfil = await db.prepare('SELECT * FROM perfiles WHERE email = ? AND activo = 1').get(email);
    if (!perfil) {
      return res.status(401).json({ error: 'Credenciales invalidas' });
    }
    if (perfil.acceso_revocado_at) {
      return res.status(403).json({ error: 'Acceso revocado' });
    }
    if (!bcrypt.compareSync(password, perfil.password_hash)) {
      return res.status(401).json({ error: 'Credenciales invalidas' });
    }

    const token = generarToken(perfil);
    res.json({ token, perfil: sanitizarPerfil(perfil) });
  } catch (error) {
    console.error('[auth] Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { email, password, full_name, institucion_id = null, codigo_invitacion = null } = req.body;
    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'Email, contrasena y nombre son requeridos' });
    }

    const existente = await db.prepare('SELECT id FROM perfiles WHERE email = ?').get(email);
    if (existente) {
      return res.status(409).json({ error: 'El email ya esta registrado' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const id = randomUUID();

    await db.prepare(`
      INSERT INTO perfiles (id, email, password_hash, nombre_completo, rol, activo, membresia_nivel, segmento_negocio)
      VALUES (?, ?, ?, ?, 'emprendedor', 1, 'free', 'C')
    `).run(id, email, passwordHash, full_name);

    // Vinculacion opcional: codigo de invitacion (inmediata) o institucion (solicitud pendiente)
    await registrarVinculacionTrasRegistro({
      usuarioId: id,
      institucionId: institucion_id,
      codigo: codigo_invitacion,
    });

    const perfil = await db.prepare('SELECT * FROM perfiles WHERE id = ?').get(id);
    const token = generarToken(perfil);

    res.status(201).json({ token, perfil: sanitizarPerfil(perfil) });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'El email ya esta registrado' });
    }
    console.error('[auth] Error en register:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ perfil: sanitizarPerfil(req.perfil) });
});

export default router;
export { requireAuth, sanitizarPerfil };
