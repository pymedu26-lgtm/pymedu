import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import db from './db.js';
import authRouter, { requireAuth, sanitizarPerfil } from './auth.js';
import webpayRouter from './webpay.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  const envPath = path.resolve(__dirname, '../..', '.env');
  const contenido = readFileSync(envPath, 'utf8');
  for (const linea of contenido.split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#') || limpia.startsWith('VITE_')) continue;
    const igual = limpia.indexOf('=');
    if (igual === -1) continue;
    const clave = limpia.slice(0, igual).trim();
    const valor = limpia.slice(igual + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[clave]) process.env[clave] = valor;
  }
} catch (error) {
  console.warn('[index] No se pudo cargar .env raiz:', error.message);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));

app.use('/api/auth', authRouter);
app.use('/api/pagos', webpayRouter);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, servicio: 'PymEdu API', entorno: process.env.RAILWAY_ENV || 'local', ts: Date.now() });
});

app.get('/api/instituciones', async (req, res) => {
  try {
    const filas = await db.prepare('SELECT id, nombre, activa FROM instituciones ORDER BY nombre').all();
    res.json({ data: filas });
  } catch (error) {
    console.error('[index] Error listando instituciones:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/perfiles/stats', requireAuth, async (req, res) => {
  try {
    const total = await db.prepare('SELECT COUNT(*)::int AS n FROM perfiles WHERE activo = 1').get();
    const coordinadores = await db.prepare("SELECT COUNT(*)::int AS n FROM perfiles WHERE rol = 'coordinador' AND activo = 1").get();
    const mentores = await db.prepare("SELECT COUNT(*)::int AS n FROM perfiles WHERE rol = 'mentor' AND activo = 1").get();
    const emprendedores = await db.prepare("SELECT COUNT(*)::int AS n FROM perfiles WHERE rol IN ('emprendedor','dueno') AND activo = 1").get();
    res.json({
      total: total.n,
      coordinadores: coordinadores.n,
      mentores: mentores.n,
      emprendedores: emprendedores.n,
    });
  } catch (error) {
    console.error('[index] Error en stats:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/perfiles/stats/institucion/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const total = await db.prepare('SELECT COUNT(*)::int AS n FROM perfiles WHERE institucion_id = ? AND activo = 1').get(id);
    const coordinadores = await db.prepare("SELECT COUNT(*)::int AS n FROM perfiles WHERE institucion_id = ? AND rol = 'coordinador' AND activo = 1").get(id);
    const mentores = await db.prepare("SELECT COUNT(*)::int AS n FROM perfiles WHERE institucion_id = ? AND rol = 'mentor' AND activo = 1").get(id);
    const emprendedores = await db.prepare("SELECT COUNT(*)::int AS n FROM perfiles WHERE institucion_id = ? AND rol IN ('emprendedor','dueno') AND activo = 1").get(id);
    res.json({
      total: total.n,
      coordinadores: coordinadores.n,
      mentores: mentores.n,
      emprendedores: emprendedores.n,
    });
  } catch (error) {
    console.error('[index] Error en stats institucion:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/perfiles', requireAuth, async (req, res) => {
  try {
    const { rol, institucion_id, busqueda, page = '1', pageSize = '20' } = req.query;
    const limite = parseInt(pageSize, 10) || 20;
    const offset = ((parseInt(page, 10) || 1) - 1) * limite;
    const condiciones = [];
    const parametros = [];
    if (rol) { condiciones.push('rol = ?'); parametros.push(rol); }
    if (institucion_id) { condiciones.push('institucion_id = ?'); parametros.push(institucion_id); }
    if (busqueda) { condiciones.push('(nombre_completo LIKE ? OR email LIKE ?)'); parametros.push(`%${busqueda}%`, `%${busqueda}%`); }
    const where = condiciones.length ? ` WHERE ${condiciones.join(' AND ')}` : '';
    const totalRow = await db.prepare(`SELECT COUNT(*)::int AS n FROM perfiles${where}`).get(...parametros);
    const filas = await db.prepare(`SELECT * FROM perfiles${where} ORDER BY nombre_completo LIMIT ? OFFSET ?`).all(...parametros, limite, offset);
    res.json({ data: filas, total: totalRow.n, hasMore: offset + filas.length < totalRow.n });
  } catch (error) {
    console.error('[index] Error listando perfiles:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/pagos/estadisticas', requireAuth, async (req, res) => {
  try {
    const total = await db.prepare("SELECT COUNT(*)::int AS n FROM pagos WHERE estado IN ('aprobado','pagada','iniciado')").get();
    const aprobados = await db.prepare("SELECT COUNT(*)::int AS n FROM pagos WHERE estado IN ('aprobado','pagada')").get();
    const ingresos = await db.prepare("SELECT COALESCE(SUM(monto), 0)::int AS s FROM pagos WHERE estado IN ('aprobado','pagada')").get();
    res.json({ total: total.n, aprobados: aprobados.n, ingresos: ingresos.s });
  } catch (error) {
    console.error('[index] Error en estadisticas pagos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/perfiles', requireAuth, async (req, res) => {
  try {
    const { email, password, nombre_completo, rol = 'emprendedor', institucion_id = null } = req.body;
    if (!email || !password || !nombre_completo) {
      return res.status(400).json({ error: 'Email, password y nombre son requeridos' });
    }
    const existente = await db.prepare('SELECT id FROM perfiles WHERE email = ?').get(email);
    if (existente) {
      return res.status(409).json({ error: 'El email ya esta registrado' });
    }
    const id = randomUUID();
    const password_hash = bcrypt.hashSync(password, 10);
    await db.prepare(`
      INSERT INTO perfiles (id, email, password_hash, nombre_completo, rol, institucion_id, activo, membresia_nivel)
      VALUES (?, ?, ?, ?, ?, ?, 1, 'free')
    `).run(id, email, password_hash, nombre_completo, rol, institucion_id);
    const perfil = await db.prepare('SELECT * FROM perfiles WHERE id = ?').get(id);
    res.status(201).json({ perfil });
  } catch (error) {
    console.error('[index] Error creando perfil:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/perfiles/institucion/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { rol, busqueda } = req.query;
    const condiciones = ['institucion_id = ?'];
    const parametros = [id];
    if (rol && rol !== 'todos') { condiciones.push('rol = ?'); parametros.push(rol); }
    if (busqueda) { condiciones.push('(nombre_completo LIKE ? OR email LIKE ?)'); parametros.push(`%${busqueda}%`, `%${busqueda}%`); }
    const filas = await db.prepare(
      `SELECT id, email, nombre_completo, rol, activo, membresia_nivel, created_at
       FROM perfiles WHERE ${condiciones.join(' AND ')} ORDER BY nombre_completo`
    ).all(...parametros);
    res.json({ data: filas });
  } catch (error) {
    console.error('[index] Error listando perfiles de institucion:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

const PORT = parseInt(process.env.PORT || '4000', 10);

const distPath = path.join(__dirname, '..', '..', 'dist');
if (existsSync(path.join(distPath, 'index.html'))) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, async () => {
  console.log(`[index] PymEdu API escuchando en http://localhost:${PORT}`);
  try {
    await db.initDB();
    await db.seedDB().catch(() => {});
  } catch (error) {
    console.error('[index] Error inicializando base de datos:', error);
  }
});

export default app;
