-- ════════════════════════════════════════════════════════════════════════
-- BASE: mentorias  (PymEdu Mentorías — mentorias.pymedu.cl)
-- Catálogo, cursos asincrónicos, mentorías grupales, talleres, cohortes,
-- comunidades cerradas, certificados, comisiones y liquidaciones.
-- Regla: NINGUNA clave foránea hacia otras apps. usuario_id / organizacion_id /
-- comunidad_id son ids del núcleo (cuentas). Fechas en UTC (TIMESTAMPTZ),
-- se muestran en hora de Chile.
-- Usado por: server/src/mentorias/rutas.js · contrato src/4.-MENTORIAS/tipos.ts
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════
CREATE SCHEMA IF NOT EXISTS mentorias;

-- Categorías del catálogo (vienen de la base, no fijas en el código).
CREATE TABLE IF NOT EXISTS mentorias.categoria (
  slug TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0,
  activa BOOLEAN NOT NULL DEFAULT true
);

-- Estados: borrador → en_revision → publicado → archivado (o rechazado con motivo).
CREATE TABLE IF NOT EXISTS mentorias.curso (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organizacion_id TEXT NOT NULL,                 -- quien publica: plataforma, institución o proveedor
  organizacion_nombre TEXT NOT NULL,             -- copia para mostrar sin consultar el núcleo
  organizacion_tipo TEXT NOT NULL CHECK (organizacion_tipo IN ('plataforma', 'institucion', 'proveedor')),
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  objetivos JSONB NOT NULL DEFAULT '[]'::jsonb,
  formato TEXT NOT NULL CHECK (formato IN ('curso', 'mentoria_grupal', 'taller')),
  visibilidad TEXT NOT NULL CHECK (visibilidad IN ('comunidad', 'publico', 'privado')),
  comunidad_id TEXT,                             -- obligatorio si visibilidad = 'comunidad'
  codigo_acceso TEXT,                            -- visibilidad 'privado': enlace/código del proveedor
  categoria_slug TEXT REFERENCES mentorias.categoria(slug) ON DELETE SET NULL,
  nivel_madurez TEXT NOT NULL DEFAULT 'semilla' CHECK (nivel_madurez IN ('semilla', 'crecimiento', 'escala')),
  dificultad TEXT NOT NULL DEFAULT 'basico' CHECK (dificultad IN ('basico', 'intermedio', 'avanzado')),
  precio INTEGER NOT NULL DEFAULT 0 CHECK (precio >= 0),
  duracion_min INTEGER NOT NULL DEFAULT 0,
  miniatura_url TEXT,
  tipo_recurso_principal TEXT NOT NULL DEFAULT 'video' CHECK (tipo_recurso_principal IN ('video', 'audio', 'pdf')),
  mentor_id TEXT,
  mentor_nombre TEXT,
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'en_revision', 'publicado', 'archivado', 'rechazado')),
  motivo_rechazo TEXT,
  destacado BOOLEAN NOT NULL DEFAULT false,
  -- Recomendaciones basadas en el ERP (se calculan en PymEdu, no se comparten con el proveedor).
  etiquetas_erp TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  creado_por TEXT,
  enviado_revision_en TIMESTAMPTZ,
  publicado_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT curso_comunidad_requerida CHECK (visibilidad <> 'comunidad' OR comunidad_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_curso_catalogo ON mentorias.curso(estado, visibilidad, categoria_slug);
CREATE INDEX IF NOT EXISTS idx_curso_org ON mentorias.curso(organizacion_id);

CREATE TABLE IF NOT EXISTS mentorias.modulo (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  curso_id TEXT NOT NULL REFERENCES mentorias.curso(id) ON DELETE CASCADE,
  orden INTEGER NOT NULL,
  titulo TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_modulo_curso ON mentorias.modulo(curso_id, orden);

CREATE TABLE IF NOT EXISTS mentorias.leccion (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  modulo_id TEXT NOT NULL REFERENCES mentorias.modulo(id) ON DELETE CASCADE,
  curso_id TEXT NOT NULL REFERENCES mentorias.curso(id) ON DELETE CASCADE,
  orden INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('video', 'audio', 'pdf', 'cuestionario', 'tarea')),
  url_recurso TEXT,                              -- YouTube "no listado" en el MVP (adaptador ProveedorVideo)
  duracion_min INTEGER NOT NULL DEFAULT 0,
  disponible_desde TIMESTAMPTZ,                  -- candado con fecha («Se abre el jueves 14 a las 10:00»)
  requiere_anterior BOOLEAN NOT NULL DEFAULT false -- candado por avance («Completa el paso 1»)
);
CREATE INDEX IF NOT EXISTS idx_leccion_curso ON mentorias.leccion(curso_id);

-- Materiales descargables (PDF, plantillas). Se entregan con enlace firmado de corta duración.
CREATE TABLE IF NOT EXISTS mentorias.recurso (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  curso_id TEXT NOT NULL REFERENCES mentorias.curso(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'pdf' CHECK (tipo IN ('pdf', 'xlsx', 'docx', 'otro')),
  peso_kb INTEGER NOT NULL DEFAULT 0,
  url_almacenamiento TEXT NOT NULL               -- R2 / Drive (adaptador ProveedorArchivos)
);

CREATE TABLE IF NOT EXISTS mentorias.revision_curso (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  curso_id TEXT NOT NULL REFERENCES mentorias.curso(id) ON DELETE CASCADE,
  revisor_id TEXT NOT NULL,
  checklist JSONB NOT NULL DEFAULT '{}'::jsonb,  -- pertinencia, calidad, sin_info_enganosa, precio_declarado
  resultado TEXT NOT NULL CHECK (resultado IN ('aprobado', 'rechazado')),
  motivo TEXT,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comité de contenido (curadores nombrados por el Superadmin).
CREATE TABLE IF NOT EXISTS mentorias.curador (
  usuario_id TEXT PRIMARY KEY,
  nombrado_por TEXT,
  nombrado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  activo BOOLEAN NOT NULL DEFAULT true
);

-- Estados: abierto → lleno → en_curso → terminado (o cancelado).
CREATE TABLE IF NOT EXISTS mentorias.grupo (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  curso_id TEXT NOT NULL REFERENCES mentorias.curso(id) ON DELETE CASCADE,
  mentor_id TEXT,
  mentor_nombre TEXT,
  nombre TEXT NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  cupos INTEGER NOT NULL DEFAULT 30 CHECK (cupos > 0),
  estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'lleno', 'en_curso', 'terminado', 'cancelado'))
);
CREATE INDEX IF NOT EXISTS idx_grupo_curso ON mentorias.grupo(curso_id);

CREATE TABLE IF NOT EXISTS mentorias.sesion (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  grupo_id TEXT NOT NULL REFERENCES mentorias.grupo(id) ON DELETE CASCADE,
  inicio TIMESTAMPTZ NOT NULL,
  fin TIMESTAMPTZ NOT NULL,
  url_sala TEXT,                                 -- Google Meet (adaptador ProveedorCalendario)
  url_grabacion TEXT
);
CREATE INDEX IF NOT EXISTS idx_sesion_grupo ON mentorias.sesion(grupo_id, inicio);

-- Estados: pendiente_pago → activa → completada | lista_espera | abandonada | reembolsada.
-- `origen` decide la comisión (catalogo 15 %, enlace_proveedor 5 %, cupo_institucional 10 %).
CREATE TABLE IF NOT EXISTS mentorias.inscripcion (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  usuario_id TEXT NOT NULL,
  usuario_nombre TEXT,
  organizacion_id TEXT,                          -- comunidad/negocio desde el que se inscribe
  curso_id TEXT NOT NULL REFERENCES mentorias.curso(id) ON DELETE CASCADE,
  grupo_id TEXT REFERENCES mentorias.grupo(id) ON DELETE SET NULL,
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('pendiente_pago', 'activa', 'completada', 'lista_espera', 'abandonada', 'reembolsada')),
  origen TEXT NOT NULL DEFAULT 'catalogo' CHECK (origen IN ('catalogo', 'enlace_proveedor', 'cupo_institucional', 'institucion_propia', 'gratuito')),
  pago_id TEXT,                                  -- public.pagos.buy_order (Webpay) — se activa con evento pago.confirmado
  ultima_posicion_seg INTEGER NOT NULL DEFAULT 0,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  completado_en TIMESTAMPTZ,
  UNIQUE (usuario_id, curso_id)
);
CREATE INDEX IF NOT EXISTS idx_inscripcion_grupo ON mentorias.inscripcion(grupo_id, estado);

CREATE TABLE IF NOT EXISTS mentorias.lista_espera (
  grupo_id TEXT NOT NULL REFERENCES mentorias.grupo(id) ON DELETE CASCADE,
  usuario_id TEXT NOT NULL,
  posicion INTEGER NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (grupo_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS mentorias.asistencia (
  sesion_id TEXT NOT NULL REFERENCES mentorias.sesion(id) ON DELETE CASCADE,
  usuario_id TEXT NOT NULL,
  asistio BOOLEAN NOT NULL DEFAULT false,
  minutos INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sesion_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS mentorias.progreso_leccion (
  inscripcion_id TEXT NOT NULL REFERENCES mentorias.inscripcion(id) ON DELETE CASCADE,
  leccion_id TEXT NOT NULL REFERENCES mentorias.leccion(id) ON DELETE CASCADE,
  completado BOOLEAN NOT NULL DEFAULT false,
  nota NUMERIC(4,1),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (inscripcion_id, leccion_id)
);

-- Tareas conectadas: `regla_erp` (ej. 'gastos_semana') se marca hecha cuando llega el evento del ERP.
CREATE TABLE IF NOT EXISTS mentorias.tarea (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  leccion_id TEXT REFERENCES mentorias.leccion(id) ON DELETE CASCADE,
  sesion_id TEXT REFERENCES mentorias.sesion(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  instrucciones TEXT,
  regla_erp TEXT,
  vence_en TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS mentorias.entrega (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tarea_id TEXT NOT NULL REFERENCES mentorias.tarea(id) ON DELETE CASCADE,
  usuario_id TEXT NOT NULL,
  archivo_url TEXT,
  nota NUMERIC(4,1),
  comentario TEXT,
  entregado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tarea_id, usuario_id)
);

-- Se conserva aunque la persona salga de la comunidad.
CREATE TABLE IF NOT EXISTS mentorias.certificado (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  inscripcion_id TEXT NOT NULL UNIQUE REFERENCES mentorias.inscripcion(id) ON DELETE CASCADE,
  codigo_verificacion TEXT NOT NULL UNIQUE,
  emitido_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  url_pdf TEXT
);

-- Moderación: el mentor o el proveedor pueden ocultar comentarios.
CREATE TABLE IF NOT EXISTS mentorias.comentario (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  curso_id TEXT NOT NULL REFERENCES mentorias.curso(id) ON DELETE CASCADE,
  usuario_id TEXT NOT NULL,
  usuario_nombre TEXT NOT NULL,
  estrellas INTEGER NOT NULL CHECK (estrellas BETWEEN 1 AND 5),
  texto TEXT NOT NULL DEFAULT '',
  oculto BOOLEAN NOT NULL DEFAULT false,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comentario_curso ON mentorias.comentario(curso_id, creado_en DESC);

CREATE TABLE IF NOT EXISTS mentorias.cupos_institucionales (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  comunidad_id TEXT NOT NULL,
  curso_id TEXT NOT NULL REFERENCES mentorias.curso(id) ON DELETE CASCADE,
  cupos INTEGER NOT NULL CHECK (cupos > 0),
  usados INTEGER NOT NULL DEFAULT 0,
  vigencia_hasta DATE
);

-- Una venta por inscripción pagada; la liquidación agrupa por proveedor y mes.
CREATE TABLE IF NOT EXISTS mentorias.venta (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  proveedor_id TEXT NOT NULL,
  inscripcion_id TEXT REFERENCES mentorias.inscripcion(id) ON DELETE SET NULL,
  periodo TEXT NOT NULL,                         -- 'YYYY-MM'
  bruto INTEGER NOT NULL,
  costo_webpay INTEGER NOT NULL DEFAULT 0,       -- se descuenta antes de repartir
  comision_pct NUMERIC(5,2) NOT NULL,
  comision INTEGER NOT NULL,
  neto INTEGER NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_venta_proveedor ON mentorias.venta(proveedor_id, periodo);

CREATE TABLE IF NOT EXISTS mentorias.liquidacion (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  proveedor_id TEXT NOT NULL,
  periodo TEXT NOT NULL,
  bruto INTEGER NOT NULL DEFAULT 0,
  costo_webpay INTEGER NOT NULL DEFAULT 0,
  comision INTEGER NOT NULL DEFAULT 0,
  neto INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagada', 'anulada')),
  pagada_en TIMESTAMPTZ,
  UNIQUE (proveedor_id, periodo)
);

-- Bitácora de eventos recibidos del núcleo y del ERP (POST /api/mentorias/eventos).
CREATE TABLE IF NOT EXISTS mentorias.evento_recibido (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT NOT NULL,                            -- pago.confirmado | organizacion.miembro_agregado | venta.registrada
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  procesado BOOLEAN NOT NULL DEFAULT false,
  recibido_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Datos base: categorías del catálogo (editables luego desde la base) ──────
INSERT INTO mentorias.categoria (slug, nombre, orden) VALUES
  ('estrategia-erp', 'Estrategia ERP', 1),
  ('gestion-financiera', 'Gestión financiera', 2),
  ('marketing-digital', 'Marketing digital', 3),
  ('legal-tributario', 'Legal y tributario', 4),
  ('ventas-cobranza', 'Ventas y cobranza', 5),
  ('liderazgo', 'Liderazgo y equipo', 6)
ON CONFLICT (slug) DO NOTHING;

-- «Mis grupos» del mentor y orden de la lista de espera (editor de grupos y asistencia).
CREATE INDEX IF NOT EXISTS idx_grupo_mentor ON mentorias.grupo(mentor_id);
CREATE INDEX IF NOT EXISTS idx_lista_espera_orden ON mentorias.lista_espera(grupo_id, posicion);
