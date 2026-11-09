-- ════════════════════════════════════════════════════════════════════════
-- BASE: cuentas  (núcleo "PymEdu Cuentas" — cuentas.pymedu.cl)
-- Identidad, organizaciones, comunidades, consentimientos y ROLES DINÁMICOS.
-- En el MVP vive como schema `cuentas` dentro de la misma base; en Railway se
-- puede ejecutar tal cual en una base propia (CREATE SCHEMA incluido).
-- Reglas: ids TEXT (UUID generados por el núcleo), sin claves foráneas hacia
-- tablas de otras apps, organizacion_id en cada registro.
-- Usado por: server/src/cuentas/servicio.js · server/src/cuentas/rutas.js
-- Idempotente: se puede correr varias veces.
-- ════════════════════════════════════════════════════════════════════════
CREATE SCHEMA IF NOT EXISTS cuentas;

-- Organización: plataforma, institución, comunidad, negocio (PYME) o proveedor de contenido.
-- Migración: cada fila de public.instituciones se copia aquí con el mismo id (tipo = 'institucion').
CREATE TABLE IF NOT EXISTS cuentas.organizacion (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('plataforma', 'institucion', 'comunidad', 'negocio', 'proveedor')),
  nombre TEXT NOT NULL,
  rut TEXT,
  logo_url TEXT,
  color_marca TEXT,
  organizacion_padre_id TEXT REFERENCES cuentas.organizacion(id) ON DELETE SET NULL,
  -- Proveedor de contenido: área de experiencia y datos bancarios para liquidaciones.
  area_experiencia TEXT,
  datos_pago JSONB,
  -- Qué datos pide la institución para aprobar el ingreso (ej. ["comuna", "rut"]).
  requisitos_ingreso JSONB DEFAULT '[]'::jsonb,
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('pendiente', 'activa', 'suspendida')),
  verificado_por TEXT,
  verificado_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_organizacion_tipo ON cuentas.organizacion(tipo);

-- Pertenencia validada a una comunidad cerrada (solicitada → aprobada → retirada | rechazada).
CREATE TABLE IF NOT EXISTS cuentas.membresia_comunidad (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  usuario_id TEXT NOT NULL,
  comunidad_id TEXT NOT NULL REFERENCES cuentas.organizacion(id) ON DELETE CASCADE,
  estado TEXT NOT NULL DEFAULT 'solicitada' CHECK (estado IN ('solicitada', 'aprobada', 'retirada', 'rechazada')),
  datos_validacion JSONB DEFAULT '{}'::jsonb,
  aprobado_por TEXT,
  codigo_invitacion TEXT,
  solicitado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  resuelto_en TIMESTAMPTZ,
  UNIQUE (usuario_id, comunidad_id)
);
CREATE INDEX IF NOT EXISTS idx_membresia_usuario ON cuentas.membresia_comunidad(usuario_id, estado);

-- Autorización del emprendedor para que su mentor vea un resumen del negocio (solo lectura, revocable).
CREATE TABLE IF NOT EXISTS cuentas.consentimiento_datos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  emprendedor_id TEXT NOT NULL,
  mentor_id TEXT NOT NULL,
  alcance TEXT NOT NULL DEFAULT 'resumen_negocio',
  otorgado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  revocado_en TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_consentimiento_mentor ON cuentas.consentimiento_datos(mentor_id) WHERE revocado_en IS NULL;

-- ── Roles dinámicos ─────────────────────────────────────────────────────
-- Catálogo FIJO de permisos (se carga desde server/src/cuentas/permisos.js; no se edita en la UI).
CREATE TABLE IF NOT EXISTS cuentas.permiso (
  codigo TEXT PRIMARY KEY,               -- formato modulo.accion: ventas.leer, mentorias.curso.publicar
  app TEXT NOT NULL,                     -- erp | mentorias | academia | cuentas
  modulo TEXT NOT NULL,
  accion TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  ambitos TEXT[] NOT NULL DEFAULT ARRAY['plataforma','institucion','negocio','proveedor']
);

-- Rol = nombre + ámbito + permisos. organizacion_id NULL = plantilla de plataforma.
-- Subrol: rol_padre_id; solo puede QUITAR permisos del padre (validado en la API).
CREATE TABLE IF NOT EXISTS cuentas.rol (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  codigo TEXT,                           -- código estable de las plantillas de sistema (superadmin, vendedor…)
  nombre TEXT NOT NULL,
  descripcion TEXT,
  ambito TEXT NOT NULL CHECK (ambito IN ('plataforma', 'institucion', 'negocio', 'proveedor')),
  organizacion_id TEXT REFERENCES cuentas.organizacion(id) ON DELETE CASCADE,
  rol_padre_id TEXT REFERENCES cuentas.rol(id) ON DELETE SET NULL,
  es_sistema BOOLEAN NOT NULL DEFAULT false,   -- Super Admin y Demo: no editables ni borrables
  es_plantilla BOOLEAN NOT NULL DEFAULT false, -- copiable por otras organizaciones (VAR1..VAR3)
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_por TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rol_codigo_plataforma ON cuentas.rol(codigo) WHERE organizacion_id IS NULL AND codigo IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rol_organizacion ON cuentas.rol(organizacion_id);

CREATE TABLE IF NOT EXISTS cuentas.rol_permiso (
  rol_id TEXT NOT NULL REFERENCES cuentas.rol(id) ON DELETE CASCADE,
  permiso_codigo TEXT NOT NULL REFERENCES cuentas.permiso(codigo) ON DELETE CASCADE,
  PRIMARY KEY (rol_id, permiso_codigo)
);

-- Una persona puede tener roles distintos en organizaciones distintas.
CREATE TABLE IF NOT EXISTS cuentas.asignacion_rol (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  usuario_id TEXT NOT NULL,
  rol_id TEXT NOT NULL REFERENCES cuentas.rol(id) ON DELETE CASCADE,
  organizacion_id TEXT,                  -- NULL = ámbito plataforma
  otorgado_por TEXT,
  otorgado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, rol_id, organizacion_id)
);
CREATE INDEX IF NOT EXISTS idx_asignacion_usuario ON cuentas.asignacion_rol(usuario_id);

-- Historial de cambios de roles (quién, qué, antes, después).
CREATE TABLE IF NOT EXISTS cuentas.auditoria_roles (
  id BIGSERIAL PRIMARY KEY,
  usuario_id TEXT,
  accion TEXT NOT NULL,                  -- crear | editar | desactivar | asignar | quitar
  rol_id TEXT,
  antes JSONB,
  despues JSONB,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auditoria_roles_rol ON cuentas.auditoria_roles(rol_id);
