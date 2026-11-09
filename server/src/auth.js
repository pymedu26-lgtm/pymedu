import { randomUUID } from 'crypto';
import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from './db.js';
import { registrarVinculacionTrasRegistro } from './vinculacionServicio.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'pymedu-secret-key-change-in-production';
const JWT_EXPIRA = '24h';
const COOKIE_SESION = 'pymedu_session';
const COOKIE_PISTA = 'pymedu_sesion';
const ES_PRODUCCION = process.env.NODE_ENV === 'production';
const COOKIE_CRUZADA = process.env.COOKIE_CROSS_SITE === '1';

/** Opciones de la cookie HttpOnly que guarda el JWT de sesion. */
function opcionesCookie(maxAge = 24 * 60 * 60 * 1000) {
  return {
    httpOnly: true,
    secure: ES_PRODUCCION || COOKIE_CRUZADA,
    sameSite: COOKIE_CRUZADA ? 'none' : 'lax',
    path: '/',
    maxAge,
  };
}

function leerCookies(req) {
  const cabecera = req.headers.cookie;
  if (!cabecera) return {};
  return cabecera.split(';').reduce((acc, parte) => {
    const igual = parte.indexOf('=');
    if (igual === -1) return acc;
    const clave = parte.slice(0, igual).trim();
    const valor = parte.slice(igual + 1).trim();
    if (clave) acc[clave] = decodeURIComponent(valor);
    return acc;
  }, {});
}

/** Guarda la sesion en cookie HttpOnly y deja una pista no sensible para el cliente. */
function emitirSesion(res, perfil) {
  const token = generarToken(perfil);
  res.cookie(COOKIE_SESION, token, opcionesCookie());
  res.cookie(COOKIE_PISTA, '1', { ...opcionesCookie(), httpOnly: false });
  return token;
}

function limpiarSesion(res) {
  res.clearCookie(COOKIE_SESION, { ...opcionesCookie(0), maxAge: undefined });
  res.clearCookie(COOKIE_PISTA, { ...opcionesCookie(0), httpOnly: false, maxAge: undefined });
}

// Limite simple de intentos de ingreso por cuenta + IP (5 intentos / 15 min).
const INTENTOS_MAX = 5;
const VENTANA_INTENTOS_MS = 15 * 60 * 1000;
const intentosFallidos = new Map();

function claveIntento(req, email) {
  return `${String(email || '').toLowerCase()}|${req.ip || ''}`;
}

function bloqueado(clave) {
  const registro = intentosFallidos.get(clave);
  if (!registro) return false;
  if (Date.now() - registro.primero > VENTANA_INTENTOS_MS) {
    intentosFallidos.delete(clave);
    return false;
  }
  return registro.cantidad >= INTENTOS_MAX;
}

function registrarFallo(clave) {
  const registro = intentosFallidos.get(clave);
  if (!registro || Date.now() - registro.primero > VENTANA_INTENTOS_MS) {
    intentosFallidos.set(clave, { primero: Date.now(), cantidad: 1 });
  } else {
    registro.cantidad += 1;
  }
}

function limpiarIntentos(clave) {
  intentosFallidos.delete(clave);
}

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
    negocio_rut: p.negocio_rut,
    negocio_giro: p.negocio_giro,
    negocio_rubro: p.negocio_rubro,
    negocio_region: p.negocio_region,
    negocio_comuna: p.negocio_comuna,
    negocio_direccion: p.negocio_direccion,
    notif_email: !!p.notif_email,
    notif_push: !!p.notif_push,
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

// Middleware async: valida el JWT firmado por /login contra la tabla perfiles.
// Acepta la cookie HttpOnly (preferida) y, por compatibilidad, el header Bearer.
async function requireAuth(req, res, next) {
  const cookies = leerCookies(req);
  const header = req.headers.authorization;
  const token = cookies[COOKIE_SESION] || (header && header.startsWith('Bearer ') ? header.slice(7) : null);
  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }

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
      return res.status(401).json({ error: 'Token invalido o expirado' });
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

    const clave = claveIntento(req, email);
    if (bloqueado(clave)) {
      return res.status(429).json({ error: 'Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.' });
    }

    const perfil = await db.prepare('SELECT * FROM perfiles WHERE email = ? AND activo = 1').get(email);
    if (!perfil) {
      registrarFallo(clave);
      return res.status(401).json({ error: 'Credenciales invalidas' });
    }
    if (perfil.acceso_revocado_at) {
      return res.status(403).json({ error: 'Acceso revocado' });
    }
    if (!bcrypt.compareSync(password, perfil.password_hash)) {
      registrarFallo(clave);
      return res.status(401).json({ error: 'Credenciales invalidas' });
    }

    limpiarIntentos(clave);
    emitirSesion(res, perfil);
    res.json({ perfil: sanitizarPerfil(perfil) });
  } catch (error) {
    console.error('[auth] Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Devuelve la sesion actual sin generar errores cuando no hay sesion.
router.get('/session', async (req, res) => {
  const cookies = leerCookies(req);
  if (!cookies[COOKIE_SESION]) {
    return res.json({ perfil: null });
  }
  try {
    const decoded = jwt.verify(cookies[COOKIE_SESION], JWT_SECRET);
    const perfil = await db.prepare('SELECT * FROM perfiles WHERE id = ? AND activo = 1').get(decoded.id);
    if (!perfil || perfil.acceso_revocado_at) {
      limpiarSesion(res);
      return res.json({ perfil: null });
    }
    return res.json({ perfil: sanitizarPerfil(perfil) });
  } catch {
    limpiarSesion(res);
    return res.json({ perfil: null });
  }
});

router.post('/logout', (req, res) => {
  limpiarSesion(res);
  res.json({ ok: true });
});

router.post('/register', async (req, res) => {
  try {
    const { email, password, full_name, institucion_id = null, codigo_invitacion = null } = req.body;
    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'Email, contrasena y nombre son requeridos' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
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
    emitirSesion(res, perfil);

    res.status(201).json({ perfil: sanitizarPerfil(perfil) });
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

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email requerido' });
    }

    const perfil = await db.prepare('SELECT * FROM perfiles WHERE email = ? AND activo = 1').get(email);
    if (!perfil) {
      return res.json({ ok: true });
    }

    const token = jwt.sign({ id: perfil.id, email: perfil.email, tipo: 'reset' }, JWT_SECRET, { expiresIn: '1h' });
    const resetUrl = process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/reset-password?token=${token}` : `/reset-password?token=${token}`;

    console.log('[auth] Password reset solicitado para:', perfil.email, 'URL:', resetUrl);
    res.json({ ok: true, resetUrl });
  } catch (error) {
    console.error('[auth] Error en forgot-password:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token y contraseña requeridos' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(400).json({ error: 'Token inválido o expirado' });
    }

    if (decoded.tipo !== 'reset') {
      return res.status(400).json({ error: 'Token inválido' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    await db.prepare('UPDATE perfiles SET password_hash = ? WHERE id = ?').run(passwordHash, decoded.id);
    res.json({ ok: true });
  } catch (error) {
    console.error('[auth] Error en reset-password:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Actualiza datos propios del perfil (negocio, cuenta, notificaciones y/o contrasena).
const CAMPOS_EDITABLES = new Map([
  ['nombre_completo', 'string'],
  ['negocio_nombre', 'string'],
  ['negocio_rut', 'string'],
  ['negocio_giro', 'string'],
  ['negocio_rubro', 'string'],
  ['negocio_region', 'string'],
  ['negocio_comuna', 'string'],
  ['negocio_direccion', 'string'],
  ['logo_url', 'string'],
]);

router.put('/mi', requireAuth, async (req, res) => {
  try {
    const body = req.body ?? {};
    const asignaciones = [];
    const parametros = [];

    for (const [campo, tipo] of CAMPOS_EDITABLES) {
      if (body[campo] === undefined) continue;
      const valor = tipo === 'bool' ? (body[campo] ? 1 : 0) : String(body[campo]).slice(0, 2000);
      asignaciones.push(`${campo} = ?`);
      parametros.push(valor);
    }

    if (body.segmento_negocio !== undefined) {
      if (!['A', 'B', 'C'].includes(body.segmento_negocio)) {
        return res.status(400).json({ error: 'segmento_invalido' });
      }
      asignaciones.push('segmento_negocio = ?');
      parametros.push(body.segmento_negocio);
    }

    for (const campo of ['notif_email', 'notif_push']) {
      if (body[campo] === undefined) continue;
      asignaciones.push(`${campo} = ?`);
      parametros.push(body[campo] ? 1 : 0);
    }

    // Cambio de contrasena opcional
    if (body.nueva_contrasena !== undefined || body.confirmar_contrasena !== undefined) {
      const nueva = body.nueva_contrasena ?? '';
      const confirmar = body.confirmar_contrasena ?? '';
      if (nueva.length < 8) return res.status(400).json({ error: 'La contrasena debe tener al menos 8 caracteres' });
      if (nueva !== confirmar) return res.status(400).json({ error: 'Las contrasenas no coinciden' });
      asignaciones.push('password_hash = ?');
      parametros.push(bcrypt.hashSync(nueva, 10));
    }

    if (asignaciones.length === 0) {
      return res.status(400).json({ error: 'sin_campos_para_actualizar' });
    }

    asignaciones.push('updated_at = to_char(now() AT TIME ZONE \'UTC\', \'YYYY-MM-DD HH24:MI:SS\')');

    await db.prepare(`UPDATE perfiles SET ${asignaciones.join(', ')} WHERE id = ?`).run(...parametros, req.perfil.id);

    const perfil = await db.prepare('SELECT * FROM perfiles WHERE id = ?').get(req.perfil.id);
    res.json({ perfil: sanitizarPerfil(perfil) });
  } catch (error) {
    console.error('[auth] Error actualizando perfil:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
export { requireAuth, sanitizarPerfil };
