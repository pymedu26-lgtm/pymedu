-- ════════════════════════════════════════════════════════════════════════
-- BASE: academia  (PymEdu Academia — academia.pymedu.cl)
-- Rutas de aprendizaje libres. HOY el contenido vive como HTML estático en
-- src/2.-ACADEMIA/gratis/*.html y el índice en src/2.-ACADEMIA/manifest.json;
-- estas tablas reciben ese contenido y el progreso cuando Academia salga del ERP
-- (paso 5 del orden de migración). Sin claves foráneas hacia otras apps.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════
CREATE SCHEMA IF NOT EXISTS academia;

CREATE TABLE IF NOT EXISTS academia.ruta (
  id TEXT PRIMARY KEY,                           -- ej. 'financiero', 'legal'
  nombre TEXT NOT NULL,
  descripcion TEXT,
  orden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS academia.modulo (
  id TEXT PRIMARY KEY,                           -- ej. 'fin-1'
  ruta_id TEXT NOT NULL REFERENCES academia.ruta(id) ON DELETE CASCADE,
  orden INTEGER NOT NULL,
  nombre TEXT NOT NULL                           -- nombre real del módulo (corrección #22)
);

CREATE TABLE IF NOT EXISTS academia.leccion (
  id TEXT PRIMARY KEY,                           -- ej. 'Fin-2.1-Flujo-de-Caja'
  modulo_id TEXT NOT NULL REFERENCES academia.modulo(id) ON DELETE CASCADE,
  orden INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  resumen TEXT,                                  -- texto propio por lección (corrección #22)
  ruta_html TEXT,                                -- archivo actual en src/2.-ACADEMIA/gratis/
  duracion_min INTEGER NOT NULL DEFAULT 10,
  nivel_acceso TEXT NOT NULL DEFAULT 'free' CHECK (nivel_acceso IN ('free', 'pro', 'premium'))
);

CREATE TABLE IF NOT EXISTS academia.progreso (
  usuario_id TEXT NOT NULL,
  leccion_id TEXT NOT NULL REFERENCES academia.leccion(id) ON DELETE CASCADE,
  completado BOOLEAN NOT NULL DEFAULT false,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, leccion_id)
);
