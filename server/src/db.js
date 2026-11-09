import pg from 'pg';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { readFileSync, readdirSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pool;

/**
 * Modo de base de datos:
 *  - 'postgres': hay DATABASE_URL (Railway u otro Postgres). Comportamiento de siempre.
 *  - 'local'   : sin DATABASE_URL, o DB_MODE=local. Usa PGlite (Postgres embebido en
 *                Node, mismo dialecto SQL) guardado en server/.data/pglite. No requiere
 *                instalar nada ni conexión a Railway. Se evalúa al primer uso porque
 *                index.js carga el .env después de importar este módulo.
 */
export const modoBD = () => (process.env.DB_MODE === 'local' || !process.env.DATABASE_URL ? 'local' : 'postgres');

/** Envoltura de PGlite con la misma interfaz que pg.Pool#query ({ rows, rowCount }). */
function crearBaseLocal() {
  const dir = process.env.PGLITE_DIR || path.resolve(__dirname, '../.data/pglite');
  mkdirSync(dir, { recursive: true });
  const lista = import('@electric-sql/pglite').then(async ({ PGlite }) => {
    const instancia = new PGlite(dir);
    await instancia.waitReady;
    console.log(`[db] Modo LOCAL (PGlite) en ${dir}`);
    return instancia;
  });
  return {
    async query(sql, params = []) {
      const local = await lista;
      // Sin parámetros puede venir un script con varias sentencias (DDL): exec lo admite.
      if (params.length === 0) {
        const resultados = await local.exec(sql);
        const ultimo = resultados.at(-1) ?? { rows: [], affectedRows: 0 };
        return { rows: ultimo.rows, rowCount: ultimo.affectedRows ?? ultimo.rows.length };
      }
      const r = await local.query(sql, params);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
  };
}

export function conectar() {
  if (!pool) {
    pool = modoBD() === 'local'
      ? crearBaseLocal()
      : new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });
  }
  return pool;
}

/** Ejecuta en orden los scripts de server/sql (01_cuentas, 02_erp_inventario, 03_mentorias, 04_academia). */
export async function ejecutarScriptsSQL() {
  const carpeta = path.resolve(__dirname, '../sql');
  const archivos = readdirSync(carpeta).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  for (const archivo of archivos) {
    await conectar().query(readFileSync(path.join(carpeta, archivo), 'utf8'));
  }
  return archivos;
}

// Traduce SQL con comodines de SQLite (?) y datetime('now') al dialecto de Postgres ($1..$n y now()).
// Devuelve un objeto con los mismos métodos de mejor-sqlite3 pero ASÍNCRONOS (promesas).
export function preparar(sql) {
  let n = 0;
  const pgSql = sql
    .replace(/datetime\('now'\)/gi, "to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')")
    .replace(/\?/g, () => `$${++n}`);

  return {
    async all(...params) {
      const { rows } = await conectar().query(pgSql, params);
      return rows;
    },
    async get(...params) {
      const { rows } = await conectar().query(pgSql, params);
      return rows[0];
    },
    async run(...params) {
      const result = await conectar().query(pgSql, params);
      return { changes: result.rowCount ?? 0 };
    },
  };
}

const db = {
  prepare: preparar,

  async initDB() {
    await conectar().query(`
      CREATE TABLE IF NOT EXISTS instituciones (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        rut TEXT UNIQUE,
        rubro TEXT,
        region TEXT,
        comuna TEXT,
        direccion TEXT,
        logo_url TEXT,
        activa INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
        updated_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
      );

      CREATE TABLE IF NOT EXISTS perfiles (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        nombre_completo TEXT NOT NULL,
        rol TEXT NOT NULL CHECK (rol IN (
          'superadmin', 'admin_institucional', 'coordinador',
          'mentor', 'emprendedor', 'dueño', 'dueno', 'vendedor',
          'gestor', 'encargado_rrhh', 'empleado', 'contador_externo', 'demo',
          'admin_proveedor', 'instructor', 'curador'
        )),
        institucion_id TEXT REFERENCES instituciones(id) ON DELETE SET NULL,
        reporta_a TEXT REFERENCES perfiles(id) ON DELETE SET NULL,
        puede_ver_remuneraciones INTEGER DEFAULT 0,
        puede_ver_caja INTEGER DEFAULT 0,
        puede_ver_reportes INTEGER DEFAULT 0,
        puede_crear_ventas INTEGER DEFAULT 0,
        puede_crear_gastos INTEGER DEFAULT 0,
        notif_email INTEGER DEFAULT 1,
        notif_push INTEGER DEFAULT 0,
        push_token TEXT,
        activo INTEGER DEFAULT 1,
        acceso_revocado_at TEXT,
        negocio_nombre TEXT,
        negocio_rut TEXT,
        negocio_rubro TEXT,
        negocio_giro TEXT,
        negocio_actividad TEXT,
        negocio_region TEXT,
        negocio_comuna TEXT,
        negocio_direccion TEXT,
        membresia_nivel TEXT DEFAULT 'free' CHECK (membresia_nivel IN ('free', 'pro', 'premium')),
        membresia_expira TEXT,
        segmento_negocio TEXT DEFAULT 'C' CHECK (segmento_negocio IN ('A', 'B', 'C')),
        logo_url TEXT,
        avatar_url TEXT,
        created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
        updated_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
      );

      CREATE TABLE IF NOT EXISTS programas (
        id TEXT PRIMARY KEY,
        institucion_id TEXT NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        activo INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
        updated_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
      );

      CREATE TABLE IF NOT EXISTS usuario_programas (
        usuario_id TEXT NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
        programa_id TEXT NOT NULL REFERENCES programas(id) ON DELETE CASCADE,
        rol_en_programa TEXT DEFAULT 'emprendedor',
        fecha_asignacion TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
        PRIMARY KEY (usuario_id, programa_id)
      );

      CREATE INDEX IF NOT EXISTS idx_perfiles_institucion ON perfiles(institucion_id);
      CREATE INDEX IF NOT EXISTS idx_perfiles_rol ON perfiles(rol);
      CREATE INDEX IF NOT EXISTS idx_perfiles_reporta ON perfiles(reporta_a);
      CREATE INDEX IF NOT EXISTS idx_perfiles_email ON perfiles(email);

      CREATE TABLE IF NOT EXISTS pagos (
        id TEXT PRIMARY KEY,
        usuario_id TEXT,
        email TEXT,
        plan TEXT NOT NULL,
        monto INTEGER NOT NULL,
        buy_order TEXT UNIQUE NOT NULL,
        session_id TEXT,
        token_ws TEXT,
        estado TEXT DEFAULT 'iniciado',
        codigo_autorizacion TEXT,
        tarjeta TEXT,
        respuesta_tbk TEXT,
        created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
        updated_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
      );

      CREATE INDEX IF NOT EXISTS idx_pagos_usuario ON pagos(usuario_id);

      CREATE TABLE IF NOT EXISTS solicitudes_vinculacion (
        id TEXT PRIMARY KEY,
        usuario_id TEXT NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
        institucion_id TEXT NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
        estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada', 'cancelada')),
        mensaje TEXT,
        respondida_por TEXT REFERENCES perfiles(id) ON DELETE SET NULL,
        respondida_at TEXT,
        created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
        updated_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
        UNIQUE (usuario_id, institucion_id)
      );
      CREATE INDEX IF NOT EXISTS idx_solicitudes_institucion ON solicitudes_vinculacion(institucion_id);
      CREATE INDEX IF NOT EXISTS idx_solicitudes_usuario ON solicitudes_vinculacion(usuario_id);
      CREATE INDEX IF NOT EXISTS idx_solicitudes_estado ON solicitudes_vinculacion(estado);

      CREATE TABLE IF NOT EXISTS codigos_invitacion (
        id TEXT PRIMARY KEY,
        institucion_id TEXT NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
        codigo TEXT NOT NULL UNIQUE,
        rol TEXT NOT NULL DEFAULT 'emprendedor' CHECK (rol IN ('emprendedor', 'dueño', 'dueno', 'mentor', 'coordinador', 'vendedor', 'gestor', 'encargado_rrhh', 'empleado', 'contador_externo')),
        reporta_a TEXT REFERENCES perfiles(id) ON DELETE SET NULL,
        usos_max INTEGER NOT NULL DEFAULT 1 CHECK (usos_max >= 1),
        usos_actuales INTEGER NOT NULL DEFAULT 0 CHECK (usos_actuales >= 0),
        activo INTEGER NOT NULL DEFAULT 1,
        expira_at TEXT,
        creado_por TEXT REFERENCES perfiles(id) ON DELETE SET NULL,
        created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
      );
      CREATE INDEX IF NOT EXISTS idx_codigos_invitacion_institucion ON codigos_invitacion(institucion_id);
      CREATE INDEX IF NOT EXISTS idx_codigos_invitacion_activo ON codigos_invitacion(activo);

      CREATE TABLE IF NOT EXISTS erp_datos (
        usuario_id TEXT NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
        coleccion TEXT NOT NULL,
        id TEXT NOT NULL,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
        CONSTRAINT erp_datos_pk PRIMARY KEY (usuario_id, coleccion, id)
      );
      CREATE INDEX IF NOT EXISTS idx_erp_datos_usuario ON erp_datos(usuario_id);

      -- Reparación idempotente del CHECK de rol en DBs existentes
      -- (acepta tanto 'dueño' como 'dueno' para no romper datos migrados).
      ALTER TABLE perfiles DROP CONSTRAINT IF EXISTS perfiles_rol_check;
      ALTER TABLE perfiles ADD CONSTRAINT perfiles_rol_check CHECK (rol IN (
        'superadmin', 'admin_institucional', 'coordinador',
        'mentor', 'emprendedor', 'dueño', 'dueno', 'vendedor',
        'gestor', 'encargado_rrhh', 'empleado', 'contador_externo', 'demo',
        'admin_proveedor', 'instructor', 'curador'
      ));

      -- Reparación idempotente del CHECK de rol en codigos_invitacion
      -- (los roles PYME son definibles por el administrador de la PYME).
      ALTER TABLE codigos_invitacion DROP CONSTRAINT IF EXISTS codigos_invitacion_rol_check;
      ALTER TABLE codigos_invitacion ADD CONSTRAINT codigos_invitacion_rol_check CHECK (rol IN (
        'emprendedor', 'dueño', 'dueno', 'mentor', 'coordinador',
        'vendedor', 'gestor', 'encargado_rrhh', 'empleado', 'contador_externo'
      ));
    `);
  },

  async seedDB() {
    const c = await preparar('SELECT COUNT(*) as c FROM perfiles').get();
    if (c.c > 0) return;

    // NOTA: los perfiles ya NO se siembran. La base de datos debe contener solo
    // usuarios creados manualmente (superadmin infinitum), no cuentas seed.

    const instituciones = [
      ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Instituto San Jose', '76.123.456-7', 'Educacion', 'Metropolitana', 'Santiago'],
      ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'Incubadora Innova', '76.234.567-8', 'Tecnologia', 'Metropolitana', 'Providencia'],
      ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 'Universidad Catolica', '76.345.678-9', 'Educacion', 'Metropolitana', 'Nunoa'],
    ];
    for (const [id, nombre, rut, rubro, region, comuna] of instituciones) {
      await preparar(
        'INSERT INTO instituciones (id, nombre, rut, rubro, region, comuna) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING'
      ).run(id, nombre, rut, rubro, region, comuna);
    }
  },

  async seedDemo() {
    const pw = bcrypt.hashSync('Demo#2026', 10);
    const clave = await preparar('SELECT id FROM instituciones WHERE nombre = ?').get('Instituto San Jose');
    const inst = clave ? clave.id : null;
    const demo = [
      ['supadmin@pymedu.com', pw, 'Super Admin', 'superadmin', null, 'premium', 'A'],
      ['admin@colegiosanjose.cl', pw, 'Admin Institucional San Jose', 'admin_institucional', inst, 'premium', 'A'],
      ['coord@colegiosanjose.cl', pw, 'Coordinador San Jose', 'coordinador', inst, 'premium', 'A'],
      ['mentor@colegiosanjose.cl', pw, 'Mentor San Jose', 'mentor', inst, 'pro', 'A'],
      // Plan Pro: la cuenta demo muestra Caja, Cobrar/Pagar y Reportes (Básico no los incluye).
      ['emprendedor@pymedu.com', pw, 'Emprendedor Demo', 'emprendedor', null, 'pro', 'B'],
      ['demo@pymedu.com', pw, 'Cuenta Demo', 'demo', null, 'premium', 'A'],
      // Roles nuevos de Mentorías (documento de arquitectura)
      ['proveedor@pymedu.com', pw, 'Consultora Crece (Proveedor)', 'admin_proveedor', null, 'pro', 'A'],
      ['curador@pymedu.com', pw, 'Comité de Contenido', 'curador', null, 'pro', 'A'],
    ];
    for (const [email, hash, nombre, rol, institucion_id, membresia, segmento] of demo) {
      await preparar(`
        INSERT INTO perfiles
          (id, email, password_hash, nombre_completo, rol, institucion_id, activo, membresia_nivel, segmento_negocio)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT (email) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          nombre_completo = EXCLUDED.nombre_completo,
          rol = EXCLUDED.rol,
          institucion_id = EXCLUDED.institucion_id,
          membresia_nivel = EXCLUDED.membresia_nivel
      `).run(randomUUID(), email, hash, nombre, rol, institucion_id, membresia, segmento);
    }
  },
};

// Inicializa schema + datos base + (opcional) cuentas demo.
// Se llama UNA sola vez desde index.js (importar db.js no debe disparar DDL:
// dos inits concurrentes provocaban deadlock 40P01 en Railway).
export async function inicializar() {
  await db.initDB();
  const scripts = await ejecutarScriptsSQL();
  console.log(`[db] Esquemas aplicados: ${scripts.join(', ')}`);
  await db.seedDB().catch((err) => console.error('[db] Error en seedDB (no crítico):', err.message));
  // Núcleo (permisos, roles plantilla, organizaciones): necesario en todos los entornos.
  const { sembrarNucleo } = await import('./seeds/nucleo.js');
  await sembrarNucleo().catch((err) => console.error('[db] Error sembrando núcleo (no crítico):', err.message));
  // En modo local los datos demo vienen activados salvo SEED_DEMO=0.
  const sembrarDemo = process.env.SEED_DEMO === '1' || (modoBD() === 'local' && process.env.SEED_DEMO !== '0');
  if (sembrarDemo) {
    await db.seedDemo().catch((err) => console.error('[db] Error en seedDemo (no crítico):', err.message));
    const { sembrarDemoLocal } = await import('./seeds/demo.js');
    await sembrarDemoLocal().catch((err) => console.error('[db] Error en datos demo (no crítico):', err.message));
    const { sembrarNucleo: reasignar } = await import('./seeds/nucleo.js');
    await reasignar().catch(() => {}); // asigna roles a las cuentas demo recién creadas
  }
  console.log(`[db] Base de datos inicializada (modo ${modoBD()})`);
}

export default db;
