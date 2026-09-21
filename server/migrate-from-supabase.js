// Migracion unica: Supabase (public + auth.users) -> Railway PostgreSQL.
//
// Uso:
//   node server/migrate-from-supabase.js
//
// Variables (ver .env.example):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (origen, requeridas)
//   SUPABASE_DB_URL                          (opcional: copiar hashes de passwords)
//   DATABASE_URL                             (destino Railway PG)
//
// Idempotente: usa ON CONFLICT DO UPDATE, puede re-ejecutarse.

import pg from 'pg';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import db from './db.js';

const { Pool } = pg;

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL || '';

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Ejemplo: node server/migrate-from-supabase.js con esas variables en el entorno o .env');
  process.exit(1);
}

const LIMITE_PAGINACION = 1000;
const MAX_FILAS = 200000;

async function listar(tabla) {
  const filas = [];
  let offset = 0;
  while (offset < MAX_FILAS) {
    const url = `${SUPABASE_URL}/rest/v1/${tabla}?select=*&limit=${LIMITE_PAGINACION}&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const cuerpo = await res.text().catch(() => '');
      console.warn(`[migracion] No se pudo leer ${tabla} (HTTP ${res.status}): ${cuerpo.slice(0, 200)}`);
      return { ok: false, filas: [] };
    }
    const lote = await res.json();
    if (!Array.isArray(lote)) {
      console.warn(`[migracion] Respuesta inesperada en ${tabla}.`);
      return { ok: false, filas: [] };
    }
    filas.push(...lote);
    if (lote.length < LIMITE_PAGINACION) break;
    offset += LIMITE_PAGINACION;
  }
  console.log(`[migracion] ${tabla}: ${filas.length} filas en Supabase`);
  return { ok: true, filas };
}

const u = (s) => s ?? null;

async function cargarHashes() {
  const hashes = {};
  if (!SUPABASE_DB_URL) {
    console.warn('[migracion] SUPABASE_DB_URL no definida: NO se copian los passwords de auth.users.');
    console.warn('[migracion] Esos usuarios quedaran sin password hasheado; usa POST /api/admin/crear-usuario para restablecer.');
    return hashes;
  }
  const pool = new Pool({ connectionString: SUPABASE_DB_URL, max: 3, ssl: { rejectUnauthorized: false } });
  try {
    const { rows } = await pool.query('SELECT email, encrypted_password FROM auth.users');
    for (const r of rows) hashes[String(r.email).toLowerCase()] = r.encrypted_password;
    console.log(`[migracion] ${rows.length} hashes de password copiados desde auth.users`);
  } catch (err) {
    console.warn('[migracion] No se pudieron leer auth.users:', err.message);
  } finally {
    await pool.end();
  }
  return hashes;
}

function hashCurly(valor) {
  const limpio = String(valor ?? '').trim();
  const desenvuelto = limpio.startsWith('{') ? limpio.replace(/^\{[^}]*\}/, '') : limpio;
  if (desenvuelto.startsWith('$2')) return desenvuelto;
  // Sin hash valido (no llego auth.users): hash de un password aleatorio;
  // el login fallara pero no rompe el endpoint. Restablecer con /api/admin/crear-usuario.
  return bcrypt.hashSync('pendiente-' + crypto.randomBytes(8).toString('hex'), 8);
}

async function migrar() {
  console.log('[migracion] Inicializando schema en Railway (idempotente)...');
  await db.initDB();

  const hashes = await cargarHashes();
  let insertados = 0;

  // ── instituciones ─────────────────────────────
  {
    const { ok, filas } = await listar('instituciones');
    if (ok) {
      for (const f of filas) {
        const res = await db.prepare(`
          INSERT INTO instituciones (id, nombre, rut, rubro, region, comuna, direccion, logo_url, activa)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (id) DO UPDATE SET
            nombre = EXCLUDED.nombre, rut = EXCLUDED.rut, rubro = EXCLUDED.rubro,
            region = EXCLUDED.region, comuna = EXCLUDED.comuna, activa = EXCLUDED.activa
        `).run(u(f.id), u(f.nombre), u(f.rut), u(f.rubro), u(f.region), u(f.comuna), u(f.direccion), u(f.logo_url), u(f.activa));
        insertados += res.changes;
      }
    }
  }

  // ── perfiles (con passwords si estan disponibles) ─
  {
    const { ok, filas } = await listar('perfiles');
    if (ok) {
      for (const f of filas) {
        const email = String(u(f.email) || '').toLowerCase();
        const hash = hashes[email] ?? hashCurly(u(f.password_hash));
        const rol = u(f.rol) === 'dueno' ? 'dueño' : u(f.rol) || 'emprendedor';
        const res = await db.prepare(`
          INSERT INTO perfiles (
            id, email, password_hash, nombre_completo, rol, institucion_id, reporta_a,
            puede_ver_remuneraciones, puede_ver_caja, puede_ver_reportes,
            puede_crear_ventas, puede_crear_gastos,
            notif_email, notif_push, push_token,
            activo, acceso_revocado_at,
            negocio_nombre, negocio_rut, negocio_rubro, negocio_giro, negocio_actividad,
            negocio_region, negocio_comuna, negocio_direccion,
            membresia_nivel, membresia_expira, segmento_negocio, logo_url, avatar_url
          )
          VALUES (
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?
          )
          ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email, password_hash = EXCLUDED.password_hash,
            nombre_completo = EXCLUDED.nombre_completo, rol = EXCLUDED.rol,
            institucion_id = EXCLUDED.institucion_id, reporta_a = EXCLUDED.reporta_a,
            activo = EXCLUDED.activo, membresia_nivel = EXCLUDED.membresia_nivel,
            membresia_expira = EXCLUDED.membresia_expira
        `).run(
          u(f.id), email, hash, u(f.nombre_completo), rol, u(f.institucion_id), u(f.reporta_a),
          u(f.puede_ver_remuneraciones) ?? 0, u(f.puede_ver_caja) ?? 0, u(f.puede_ver_reportes) ?? 0,
          u(f.puede_crear_ventas) ?? 0, u(f.puede_crear_gastos) ?? 0,
          u(f.notif_email) ?? 1, u(f.notif_push) ?? 0, u(f.push_token),
          u(f.activo) ?? 1, u(f.acceso_revocado_at),
          u(f.negocio_nombre), u(f.negocio_rut), u(f.negocio_rubro), u(f.negocio_giro), u(f.negocio_actividad),
          u(f.negocio_region), u(f.negocio_comuna), u(f.negocio_direccion),
          u(f.membresia_nivel) ?? 'free', u(f.membresia_expira), u(f.segmento_negocio) ?? 'C', u(f.logo_url), u(f.avatar_url)
        );
        insertados += res.changes;
      }
    }
  }

  // ── solicitudes_vinculacion ───────────────────
  {
    const { ok, filas } = await listar('solicitudes_vinculacion');
    if (ok) {
      for (const f of filas) {
        await db.prepare(`
          INSERT INTO solicitudes_vinculacion (id, usuario_id, institucion_id, estado, mensaje, respondida_por, respondida_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (id) DO NOTHING
        `).run(u(f.id), u(f.usuario_id), u(f.institucion_id), u(f.estado) ?? 'pendiente', u(f.mensaje), u(f.respondida_por), u(f.respondida_at));
      }
    }
  }

  // ── codigos_invitacion ────────────────────────
  {
    const { ok, filas } = await listar('codigos_invitacion');
    if (ok) {
      for (const f of filas) {
        await db.prepare(`
          INSERT INTO codigos_invitacion (id, institucion_id, codigo, rol, reporta_a, usos_max, usos_actuales, activo, expira_at, creado_por)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (id) DO NOTHING
        `).run(u(f.id), u(f.institucion_id), u(f.codigo), u(f.rol), u(f.reporta_a), u(f.usos_max) ?? 1, u(f.usos_actuales) ?? 0, u(f.activo) ?? 1, u(f.expira_at), u(f.creado_por));
      }
    }
  }

  // ── erp_datos ─────────────────────────────────
  {
    const { ok, filas } = await listar('erp_datos');
    if (ok) {
      for (const f of filas) {
        const data = typeof f.data === 'string' ? JSON.parse(f.data) : (f.data ?? {});
        await db.prepare(`
          INSERT INTO erp_datos (usuario_id, coleccion, id, data)
          VALUES (?, ?, ?, ?::jsonb)
          ON CONFLICT (usuario_id, coleccion, id) DO UPDATE SET data = EXCLUDED.data
        `).run(u(f.usuario_id), u(f.coleccion), u(f.id), JSON.stringify(data));
      }
    }
  }

  console.log(`[migracion] Listo. Filas tocadas: ${insertados}.`);
}

migrar().catch((err) => {
  console.error('[migracion] Error:', err);
  process.exit(1);
});