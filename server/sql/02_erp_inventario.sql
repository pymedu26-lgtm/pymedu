-- ════════════════════════════════════════════════════════════════════════
-- BASE: erp  (PymEdu ERP — erp.pymedu.cl)
-- Inventario con fraccionamiento, lotes, envases y método de costeo.
--
-- ESTADO ACTUAL: el ERP todavía guarda sus datos como documentos JSON en
-- public.erp_datos (una fila por objeto, columna `coleccion`). La lógica de
-- fraccionamiento/costeo ya funciona sobre esas colecciones (ver
-- src/1.-ERP/services/costeo.ts). Estas tablas son el destino relacional
-- cuando el ERP pase a endpoints por recurso (corrección #1). Mapeo:
--   erp_datos.coleccion='inventario'  (campos unidadBase, presentaciones, controlEnvases) → erp.producto + erp.presentacion_venta
--   erp_datos.coleccion='lotes'                         → erp.lote
--   erp_datos.coleccion='envases'                       → erp.envase
--   erp_datos.coleccion='movimientosInventario'         → erp.movimiento_inventario
--   erp_datos.coleccion='config' (metodoCosteo)         → erp.configuracion_negocio
-- Usado por: server/src/erp.js (GET /api/erp/recursos/:coleccion, paginado)
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════
CREATE SCHEMA IF NOT EXISTS erp;

-- Método de costeo elegido una vez por negocio (cambio solo al inicio de un año).
CREATE TABLE IF NOT EXISTS erp.configuracion_negocio (
  organizacion_id TEXT PRIMARY KEY,
  metodo_costeo TEXT NOT NULL DEFAULT 'promedio' CHECK (metodo_costeo IN ('fifo', 'promedio')), -- LIFO no se acepta en Chile
  abrir_envase TEXT NOT NULL DEFAULT 'automatico' CHECK (abrir_envase IN ('automatico', 'confirmar')),
  metodo_vigente_desde DATE NOT NULL DEFAULT date_trunc('year', now())::date,
  ppm_tasa NUMERIC(5,2) NOT NULL DEFAULT 1,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp.producto (
  id TEXT PRIMARY KEY,
  organizacion_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  codigo TEXT,
  categoria TEXT,
  tipo TEXT NOT NULL DEFAULT 'producto' CHECK (tipo IN ('producto', 'servicio')),
  unidad_base TEXT NOT NULL DEFAULT 'unidad' CHECK (unidad_base IN ('unidad', 'ml', 'l', 'g', 'kg')),
  stock_minimo_base NUMERIC(14,3) NOT NULL DEFAULT 0,     -- siempre en unidad base
  control_envases BOOLEAN NOT NULL DEFAULT false,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_producto_org ON erp.producto(organizacion_id);

-- Cómo llega del proveedor: 1 frasco = 100 ml, 1 tonelada = 1.000 kg.
CREATE TABLE IF NOT EXISTS erp.unidad_compra (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organizacion_id TEXT NOT NULL,
  producto_id TEXT NOT NULL REFERENCES erp.producto(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  factor_a_base NUMERIC(14,3) NOT NULL CHECK (factor_a_base > 0)
);

-- Cada forma de venderlo: decant 5 ml (descuenta 5), saco (25 kg), kilo suelto (1 kg).
CREATE TABLE IF NOT EXISTS erp.presentacion_venta (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organizacion_id TEXT NOT NULL,
  producto_id TEXT NOT NULL REFERENCES erp.producto(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  factor_a_base NUMERIC(14,3) NOT NULL CHECK (factor_a_base > 0),
  precio_venta INTEGER NOT NULL DEFAULT 0,               -- pesos, con IVA
  sku TEXT,
  origen TEXT NOT NULL DEFAULT 'granel' CHECK (origen IN ('granel', 'envase_cerrado', 'envase_abierto')),
  activa BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_presentacion_producto ON erp.presentacion_venta(producto_id);

-- Receta opcional: el decant también descuenta 1 atomizador (otro producto).
CREATE TABLE IF NOT EXISTS erp.receta_presentacion (
  presentacion_id TEXT NOT NULL REFERENCES erp.presentacion_venta(id) ON DELETE CASCADE,
  insumo_producto_id TEXT NOT NULL REFERENCES erp.producto(id) ON DELETE CASCADE,
  cantidad_base NUMERIC(14,3) NOT NULL CHECK (cantidad_base > 0),
  PRIMARY KEY (presentacion_id, insumo_producto_id)
);

-- Cada compra crea un lote con su costo (FIFO consume los más antiguos; promedio recalcula).
CREATE TABLE IF NOT EXISTS erp.lote (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organizacion_id TEXT NOT NULL,
  producto_id TEXT NOT NULL REFERENCES erp.producto(id) ON DELETE CASCADE,
  compra_id TEXT,                                        -- gasto/compra que lo originó
  fecha_entrada DATE NOT NULL DEFAULT CURRENT_DATE,
  cantidad_inicial_base NUMERIC(14,3) NOT NULL,
  cantidad_restante_base NUMERIC(14,3) NOT NULL,
  costo_unitario_base NUMERIC(14,4) NOT NULL DEFAULT 0,
  vencimiento DATE                                        -- FEFO solo sugiere despacho; no cambia el costo
);
CREATE INDEX IF NOT EXISTS idx_lote_producto ON erp.lote(producto_id, fecha_entrada);

-- Envases (frascos, sacos) con saldo propio: cerrado → abierto → agotado | vendido.
CREATE TABLE IF NOT EXISTS erp.envase (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organizacion_id TEXT NOT NULL,
  producto_id TEXT NOT NULL REFERENCES erp.producto(id) ON DELETE CASCADE,
  lote_id TEXT REFERENCES erp.lote(id) ON DELETE SET NULL,
  codigo TEXT NOT NULL,                                  -- F1, F2…
  capacidad_base NUMERIC(14,3) NOT NULL,
  restante_base NUMERIC(14,3) NOT NULL,
  estado TEXT NOT NULL DEFAULT 'cerrado' CHECK (estado IN ('cerrado', 'abierto', 'agotado', 'vendido')),
  abierto_en TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_envase_producto ON erp.envase(producto_id, estado);

-- Movimientos SIEMPRE en unidad base + lotes consumidos.
CREATE TABLE IF NOT EXISTS erp.movimiento_inventario (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organizacion_id TEXT NOT NULL,
  producto_id TEXT NOT NULL REFERENCES erp.producto(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('compra', 'venta', 'merma', 'ajuste', 'fraccionamiento', 'apertura', 'devolucion')),
  cantidad_base NUMERIC(14,3) NOT NULL,
  costo_total INTEGER NOT NULL DEFAULT 0,
  lotes_consumidos JSONB DEFAULT '[]'::jsonb,            -- [{lote_id, cantidad_base, costo_unitario_base}]
  envase_id TEXT,
  documento_id TEXT,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  motivo TEXT
);
CREATE INDEX IF NOT EXISTS idx_movinv_producto ON erp.movimiento_inventario(producto_id, fecha);

-- Línea de venta: presentación, cantidad base consumida y costo congelado al vender.
CREATE TABLE IF NOT EXISTS erp.linea_venta (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organizacion_id TEXT NOT NULL,
  venta_id TEXT NOT NULL,
  producto_id TEXT REFERENCES erp.producto(id) ON DELETE SET NULL,
  presentacion_id TEXT REFERENCES erp.presentacion_venta(id) ON DELETE SET NULL,
  cantidad NUMERIC(14,3) NOT NULL,
  cantidad_base_consumida NUMERIC(14,3) NOT NULL DEFAULT 0,
  precio_unitario INTEGER NOT NULL DEFAULT 0,
  costo_venta INTEGER NOT NULL DEFAULT 0                 -- no se recalcula después
);
CREATE INDEX IF NOT EXISTS idx_linea_venta ON erp.linea_venta(venta_id);

-- ── Inventario fraccionado simple (rama feat/inventario-fraccionado-simple) ──
-- Campos nuevos del JSON (src/1.-ERP/services/inventarioFraccionado.ts y registroProducto.ts).
-- Solo referencia para la migración futura: ninguna pantalla lee estas tablas todavía.
ALTER TABLE erp.producto ADD COLUMN IF NOT EXISTS forma_compra TEXT CHECK (forma_compra IN ('unidad','envase','granel'));
ALTER TABLE erp.producto ADD COLUMN IF NOT EXISTS nombre_envase TEXT CHECK (nombre_envase IN ('frasco','botella','saco','caja'));
ALTER TABLE erp.producto ADD COLUMN IF NOT EXISTS requiere_revision_unidades BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE erp.presentacion_venta ADD COLUMN IF NOT EXISTS tipo TEXT CHECK (tipo IN ('completa','porcion'));
ALTER TABLE erp.presentacion_venta ADD COLUMN IF NOT EXISTS costo_insumos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE erp.configuracion_negocio ADD COLUMN IF NOT EXISTS politica_envase_abierto TEXT NOT NULL DEFAULT 'menos_contenido';
ALTER TABLE erp.configuracion_negocio ADD COLUMN IF NOT EXISTS permitir_mezclar_envases BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE erp.movimiento_inventario ADD COLUMN IF NOT EXISTS revertido BOOLEAN NOT NULL DEFAULT false;
-- De qué envase salió cada parte de una salida/devolución (para anular exacto).
CREATE TABLE IF NOT EXISTS erp.consumo_envase (
  movimiento_id TEXT NOT NULL REFERENCES erp.movimiento_inventario(id) ON DELETE CASCADE,
  envase_id TEXT NOT NULL REFERENCES erp.envase(id) ON DELETE RESTRICT,
  cantidad NUMERIC(14,3) NOT NULL,
  envase_vendido_completo BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (movimiento_id, envase_id)
);
