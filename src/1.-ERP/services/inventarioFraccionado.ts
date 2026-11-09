// ═══════════════════════════════════════════════════════════════════════
// Inventario fraccionado: frascos/sacos con saldo propio y productos a granel.
//
// Funciones PURAS: reciben el inventario y devuelven { envases, movimientos, error? } sin
// tocar estado. ERPContext solo aplica el resultado cuando no hay error.
//
// Regla de venta (definitiva):
// - Stock total = contenido de las abiertas + cerradas × contenido (a granel: los lotes).
//   `producto.stock` es solo una caché.
// - Si el stock total alcanza, la venta SIEMPRE se hace: usa una abierta que alcance sola
//   (política); si ninguna alcanza abre la siguiente cerrada (apertura ligada a la venta); si
//   ya no quedan cerradas combina las abiertas («3 ml de F3 + 2 ml de F5»).
// - Si no alcanza, se bloquea con `stock_insuficiente` y el máximo que sí se puede vender.
// - La subcategoría «completa» solo sale de las cerradas. Los envases nunca se borran.
// - Anular devuelve lo consumido al MISMO envase y lotes; si la venta abrió el envase y vuelve
//   a quedar lleno, vuelve a «cerrado» y la apertura queda revertida.
//
// Tablas destino (cuando el inventario pase a la API): erp.envase, erp.lote,
// erp.movimiento_inventario, erp.linea_venta (server/sql/02_erp_inventario.sql).
// ═══════════════════════════════════════════════════════════════════════
import type {
  Producto, Presentacion, Lote, Envase, MovimientoInventario, MetodoCosteo,
  VentaProducto, UnidadBase, ConsumoEnvase, ConsumoLote, NombreEnvase,
} from '../context/ERPContext';
import { consumirLotes, presentacionesActivas } from './costeo';

export type Politica = 'menos_contenido' | 'mas_antiguo';
/** Unidades que escribe el usuario; se guardan convertidas a la unidad base. */
export type UnidadEntrada = 'unidad' | 'ml' | 'l' | 'g' | 'kg' | 't';
export type MovimientoBorrador = Omit<MovimientoInventario, 'id'>;

export type CodigoError =
  | 'stock_insuficiente' | 'sin_cerrados' | 'motivo_requerido'
  | 'cantidad_invalida' | 'envase_no_encontrado' | 'envase_no_disponible';

export interface ErrorInventario {
  codigo: CodigoError;
  mensaje: string;
  productoId?: string;
  /** Línea de la venta que falló. */
  linea?: number;
  /** Cuánto de esa línea SÍ se puede vender (en la unidad de la línea): «Vender el máximo (2 decants)». */
  maximo?: number;
}

export interface ResultadoEnvases {
  envases: Envase[];
  movimientos: MovimientoBorrador[];
  consumos: ConsumoEnvase[];
  /** Envases que esta operación abrió automáticamente (ya en estado «abierto»). */
  aperturas?: Envase[];
  error?: ErrorInventario;
}

/** Evento para el Centro de alertas (se guarda en la colección `notificaciones`). */
export interface EventoInventario {
  tipo: 'apertura_automatica' | 'venta_bloqueada' | 'remanente_sin_uso' | 'merma_registrada' | 'revision_unidades' | 'conversion_realizada';
  /** Clave estable para no repetir el mismo aviso (ej. apertura:{envaseId}). */
  clave: string;
  productoId: string;
  titulo: string;
  detalle: string;
}

export interface OpcionesEnvase {
  politica?: Politica;
  permitirMezclar?: boolean;
  ahora?: string;
  nuevoId?: () => string;
}

const EPS = 0.0005;
export const r3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;
const idNuevo = (op?: OpcionesEnvase) => op?.nuevoId?.() ?? crypto.randomUUID();
const error = (codigo: CodigoError, mensaje: string, extra: Partial<ErrorInventario> = {}): ErrorInventario => ({ codigo, mensaje, ...extra });

// ── Unidades ──────────────────────────────────────────────────────────────

/** Volumen → ml, peso → kg (costos legibles en CLP por ml o por kg). */
const CONVERSION: Record<UnidadEntrada, { base: UnidadBase; factor: number }> = {
  unidad: { base: 'unidad', factor: 1 },
  ml: { base: 'ml', factor: 1 },
  l: { base: 'ml', factor: 1000 },
  g: { base: 'kg', factor: 0.001 },
  kg: { base: 'kg', factor: 1 },
  t: { base: 'kg', factor: 1000 },
};
export const ETIQUETA_UNIDAD: Record<UnidadEntrada, string> = { unidad: 'unidades', ml: 'ml', l: 'L', g: 'g', kg: 'kg', t: 'toneladas' };
export const unidadBaseDe = (u: UnidadEntrada): UnidadBase => CONVERSION[u].base;
export const aBase = (cantidad: number, u: UnidadEntrada) => r3((Number(cantidad) || 0) * CONVERSION[u].factor);
export const desdeBase = (cantidadBase: number, u: UnidadEntrada) => r3((Number(cantidadBase) || 0) / CONVERSION[u].factor);

const numero = (n: number, decimales = 3) => n.toLocaleString('es-CL', { maximumFractionDigits: decimales });

/** «1.970 ml», «2.000 kg», «500 g», «12 unidades». */
export function formatCantidad(cantidad: number, unidad: UnidadBase | undefined = 'unidad'): string {
  const n = r3(cantidad);
  if (unidad === 'kg') return n !== 0 && Math.abs(n) < 1 ? `${numero(n * 1000, 0)} g` : `${numero(n)} kg`;
  if (unidad === 'unidad' || !unidad) return `${numero(n)} ${n === 1 ? 'unidad' : 'unidades'}`;
  if (unidad === 'l') return `${numero(n)} L`;
  return `${numero(n)} ${unidad}`;
}

const SINGULAR: Record<NombreEnvase, string> = { frasco: 'frasco', botella: 'botella', saco: 'saco', caja: 'caja', bidon: 'bidón' };
const PLURAL: Record<NombreEnvase, string> = { frasco: 'frascos', botella: 'botellas', saco: 'sacos', caja: 'cajas', bidon: 'bidones' };
const FEMENINO = new Set<NombreEnvase>(['botella', 'caja']);
export const nombreEnvase = (p: Pick<Producto, 'nombreEnvase'>, plural = false) => {
  const n = p.nombreEnvase ?? 'frasco';
  return plural ? PLURAL[n] : SINGULAR[n];
};
/** «botella» → «la botella»; «frasco» → «el frasco». */
export const conArticulo = (p: Pick<Producto, 'nombreEnvase'>) => `${FEMENINO.has(p.nombreEnvase ?? 'frasco') ? 'la' : 'el'} ${nombreEnvase(p)}`;
/** Concordancia: «cerrada(s)/cerrado(s)», «abierta/abierto». */
export const adjetivo = (p: Pick<Producto, 'nombreEnvase'>, raiz: 'cerrad' | 'abiert', n: number) =>
  `${raiz}${FEMENINO.has(p.nombreEnvase ?? 'frasco') ? 'a' : 'o'}${n === 1 ? '' : 's'}`;
/** «3 botellas», «1 saco». */
export const contarEnvases = (p: Pick<Producto, 'nombreEnvase'>, n: number) => `${numero(n)} ${nombreEnvase(p, n !== 1)}`;

// ── Envases ───────────────────────────────────────────────────────────────

export const usaEnvases = (p?: Producto) => !!p && !!p.controlEnvases && (Number(p.capacidadEnvase) || 0) > 0;
export const envaseVigente = (e: Envase) => e.estado === 'cerrado' || e.estado === 'abierto';
export const envasesDe = (envases: Envase[], productoId: string) => envases.filter(e => e.productoId === productoId);
const numCodigo = (e: Envase) => Number(e.codigo.replace(/\D/g, '')) || 0;
const porCodigo = (a: Envase, b: Envase) => numCodigo(a) - numCodigo(b);

/** Lo que realmente hay para vender, en unidad base. */
export function stockDisponible(p: Producto, envases: Envase[]): number {
  if (!usaEnvases(p)) return r3(Number(p.stock) || 0);
  return r3(envasesDe(envases, p.id).filter(envaseVigente).reduce((a, e) => a + e.restante, 0));
}

export interface ResumenStock {
  cerrados: number; abiertos: Envase[]; total: number; texto: string;
  /** Con envases: a cuántos envases completos equivale el total (19,7 botellas). */
  equivalente?: number;
}

/** «19 botellas + 1 abierta (70 ml)» o, sin envases, «2.000 kg». */
export function resumenStock(p: Producto, envases: Envase[]): ResumenStock {
  const total = stockDisponible(p, envases);
  if (!usaEnvases(p)) return { cerrados: 0, abiertos: [], total, texto: formatCantidad(total, p.unidadBase) };
  const propios = envasesDe(envases, p.id);
  const cerrados = propios.filter(e => e.estado === 'cerrado').length;
  const abiertos = propios.filter(e => e.estado === 'abierto').sort(porCodigo);
  const partes = [contarEnvases(p, cerrados)];
  if (abiertos.length > 0) {
    const enAbiertos = r3(abiertos.reduce((a, e) => a + e.restante, 0));
    partes.push(`${abiertos.length} ${adjetivo(p, 'abiert', abiertos.length)} (${formatCantidad(enAbiertos, p.unidadBase)})`);
  }
  const capacidad = Number(p.capacidadEnvase) || 1;
  return { cerrados, abiertos, total, texto: partes.join(' + '), equivalente: Math.floor((total / capacidad) * 10 + 0.0001) / 10 };
}

/** Abiertos ordenados según la política (el primero es el que se usa). */
function ordenarAbiertos(abiertos: Envase[], politica: Politica): Envase[] {
  return [...abiertos].sort((a, b) => politica === 'mas_antiguo'
    ? (a.abiertoEn ?? '').localeCompare(b.abiertoEn ?? '') || porCodigo(a, b)
    : a.restante - b.restante || porCodigo(a, b));
}

/** Envase abierto con contenido suficiente para `cantidad`, según la política. */
export function elegirAbierto(envases: Envase[], productoId: string, cantidad: number, politica: Politica = 'menos_contenido'): Envase | undefined {
  const candidatos = envasesDe(envases, productoId).filter(e => e.estado === 'abierto' && e.restante + EPS >= cantidad);
  return ordenarAbiertos(candidatos, politica)[0];
}

export const siguienteCerrado = (envases: Envase[], productoId: string) =>
  envasesDe(envases, productoId).filter(e => e.estado === 'cerrado').sort(porCodigo)[0];

export type TipoSubcategoria = 'completa' | 'fija' | 'variable';

/** Tipo de la subcategoría de venta: viene guardado o se deduce del dato antiguo ('porcion' = fija). */
export function tipoPresentacion(_p: Producto, pres?: Presentacion): TipoSubcategoria {
  if (pres?.tipo === 'completa' || pres?.tipo === 'variable' || pres?.tipo === 'fija') return pres.tipo;
  if (pres?.origen === 'envase_cerrado' && pres.tipo !== 'porcion') return 'completa';
  return 'fija';
}

/** Origen calculado (nunca lo elige el usuario). */
export const origenDe = (tipo: TipoSubcategoria | 'porcion', conEnvases: boolean): NonNullable<Presentacion['origen']> =>
  !conEnvases ? 'granel' : tipo === 'completa' ? 'envase_cerrado' : 'envase_abierto';

/** Subcategorías activas más chica primero (para «sin stock» y remanentes). */
const factorMinimoVendible = (p: Producto): number | null => {
  const activas = presentacionesActivas(p).filter(x => tipoPresentacion(p, x) === 'fija');
  if (presentacionesActivas(p).some(x => tipoPresentacion(p, x) === 'variable')) return EPS;
  return activas.length ? Math.min(...activas.map(x => r3(x.factor))) : null;
};

/** Crea envases (cerrados y, opcionalmente, abiertos con su remanente) continuando F1, F2… */
export function crearEnvases(
  p: Producto, envases: Envase[],
  d: { cerrados: number; abiertos?: number[]; loteId?: string; ahora?: string },
  op?: OpcionesEnvase,
): Envase[] {
  const capacidad = Number(p.capacidadEnvase) || 0;
  if (!usaEnvases(p)) return [];
  const usados = envasesDe(envases, p.id).map(numCodigo);
  let n = usados.length ? Math.max(...usados) : 0;
  const ahora = d.ahora ?? op?.ahora ?? new Date().toISOString();
  const nuevo = (restante: number, estado: 'cerrado' | 'abierto'): Envase => ({
    id: idNuevo(op), productoId: p.id, loteId: d.loteId, codigo: `F${++n}`, capacidad, restante: r3(restante), estado,
    ...(estado === 'abierto' ? { abiertoEn: ahora } : {}),
  });
  return [
    ...Array.from({ length: Math.max(0, Math.floor(d.cerrados)) }, () => nuevo(capacidad, 'cerrado')),
    ...(d.abiertos ?? []).map(resto => nuevo(resto, 'abierto')),
  ];
}

const salida = (p: Producto, cantidad: number, consumos: ConsumoEnvase[], ahora: string): MovimientoBorrador => ({
  productoId: p.id, tipo: 'salida', cantidad: r3(cantidad), fecha: ahora, motivo: '',
  consumos, ...(consumos.length === 1 ? { envaseId: consumos[0].envaseId } : {}),
});

/** Cerrado → abierto con todo su contenido. No cambia el total disponible. */
export function abrirEnvase(p: Producto, envases: Envase[], envaseId?: string, op: OpcionesEnvase = {}): ResultadoEnvases {
  const ahora = op.ahora ?? new Date().toISOString();
  const sin = (e: ErrorInventario): ResultadoEnvases => ({ envases, movimientos: [], consumos: [], error: e });
  if (!usaEnvases(p)) return sin(error('envase_no_disponible', 'Este producto no se controla por envases.', { productoId: p.id }));
  const objetivo = envaseId ? envases.find(e => e.id === envaseId && e.productoId === p.id) : siguienteCerrado(envases, p.id);
  if (!objetivo) {
    return sin(envaseId
      ? error('envase_no_encontrado', 'No se encontró ese envase.', { productoId: p.id })
      : error('sin_cerrados', `No quedan ${nombreEnvase(p, true)} cerrados para abrir.`, { productoId: p.id }));
  }
  if (objetivo.estado !== 'cerrado') return sin(error('envase_no_disponible', `${objetivo.codigo} ya está ${objetivo.estado}.`, { productoId: p.id }));
  const abierto: Envase = { ...objetivo, estado: 'abierto', abiertoEn: ahora };
  return {
    envases: envases.map(e => (e.id === objetivo.id ? abierto : e)),
    consumos: [],
    movimientos: [{ productoId: p.id, tipo: 'apertura', cantidad: objetivo.restante, fecha: ahora, motivo: `Apertura de ${objetivo.codigo}`, envaseId: objetivo.id }],
  };
}

/**
 * Vende `cantidad` de una subcategoría fija o variable (decants, kilos sueltos). Regla:
 *   1. Cada porción sale de una abierta que alcance sola (según la política).
 *   2. Si ninguna alcanza: con `permitirMezclar` combina abiertas; si no, ABRE la siguiente
 *      cerrada (queda en `aperturas` y en un movimiento «apertura») y descuenta de ella.
 *   3. Sin cerradas, combina las abiertas que queden.
 * Si el stock total no alcanza, no cambia nada y devuelve `stock_insuficiente` con el máximo.
 * El envase que llega a 0 queda «agotado» (se conserva).
 */
export function venderPorcion(p: Producto, envases: Envase[], pres: Presentacion, cantidad: number, op: OpcionesEnvase = {}): ResultadoEnvases {
  const politica = op.politica ?? 'menos_contenido';
  const ahora = op.ahora ?? new Date().toISOString();
  const sin = (e: ErrorInventario): ResultadoEnvases => ({ envases, movimientos: [], consumos: [], error: e });
  const porUnidad = r3(pres.factor);
  if (!(cantidad > 0) || !(porUnidad > 0)) return sin(error('cantidad_invalida', 'La cantidad debe ser mayor que cero.', { productoId: p.id }));
  const total = r3(porUnidad * cantidad);
  const disponible = stockDisponible(p, envases);
  if (total > disponible + EPS) return sin(errorNoAlcanza(p, envases, pres, total));

  const lista = envases.map(e => (e.productoId === p.id ? { ...e } : e));
  const consumos = new Map<string, number>();
  const aperturas: Envase[] = [];
  const movimientos: MovimientoBorrador[] = [];
  const tomar = (e: Envase, c: number) => {
    e.restante = r3(e.restante - c);
    consumos.set(e.id, r3((consumos.get(e.id) ?? 0) + c));
    if (e.restante <= EPS) { e.restante = 0; e.estado = 'agotado'; }
  };
  const abiertosOrdenados = () => ordenarAbiertos(lista.filter(e => e.productoId === p.id && e.estado === 'abierto'), politica);
  /** Combina abiertas (según la política) hasta cubrir `c`; devuelve lo que faltó. */
  const combinar = (c: number) => {
    let pendiente = c;
    for (const e of abiertosOrdenados()) {
      if (pendiente <= EPS) break;
      const t = r3(Math.min(e.restante, pendiente));
      tomar(e, t);
      pendiente = r3(pendiente - t);
    }
    return pendiente;
  };
  const abrirSiguiente = (): Envase | undefined => {
    const e = siguienteCerrado(lista, p.id);
    if (!e) return undefined;
    e.estado = 'abierto';
    e.abiertoEn = ahora;
    aperturas.push(e);
    movimientos.push({ productoId: p.id, tipo: 'apertura', cantidad: e.restante, fecha: ahora, motivo: `Apertura automática de ${e.codigo}`, envaseId: e.id });
    return e;
  };

  const enteras = Math.floor(cantidad + EPS);
  const resto = r3((cantidad - enteras) * porUnidad);
  const porciones = [...Array.from({ length: enteras }, () => porUnidad), ...(resto > EPS ? [resto] : [])];
  for (const c of porciones) {
    const sola = elegirAbierto(lista, p.id, c, politica);
    if (sola) { tomar(sola, c); continue; }
    const enAbiertas = r3(abiertosOrdenados().reduce((a, e) => a + e.restante, 0));
    if (op.permitirMezclar && enAbiertas + EPS >= c) { combinar(c); continue; }
    let pendiente = c;
    // Normalmente basta una; si la porción es más grande que un envase se abren las necesarias.
    while (pendiente > EPS) {
      const nueva = abrirSiguiente();
      if (!nueva) break;
      const t = r3(Math.min(nueva.restante, pendiente));
      tomar(nueva, t);
      pendiente = r3(pendiente - t);
    }
    if (pendiente > EPS) pendiente = combinar(pendiente);
    if (pendiente > EPS) return sin(errorNoAlcanza(p, envases, pres, total)); // no debería pasar: el total ya alcanzaba
  }

  const detalle = [...consumos].map(([envaseId, c]) => ({ envaseId, cantidad: c }));
  return { envases: lista, consumos: detalle, aperturas, movimientos: [...movimientos, salida(p, total, detalle, ahora)] };
}

/** Cuánto se puede vender HOY de una subcategoría (en su propia unidad). */
export function maximoVendible(p: Producto, envases: Envase[], pres?: Presentacion): number {
  const tipo = tipoPresentacion(p, pres);
  if (usaEnvases(p) && tipo === 'completa') return envasesDe(envases, p.id).filter(e => e.estado === 'cerrado').length;
  const factor = r3(pres?.factor ?? 1) || 1;
  const cociente = stockDisponible(p, envases) / factor;
  return tipo === 'variable' ? Math.floor(cociente * 1000 + EPS) / 1000 : Math.floor(cociente + EPS);
}

/** «No alcanza: de Lattafa Asad quedan 12 ml (0 botellas cerradas) y pides 15 ml». */
function errorNoAlcanza(p: Producto, envases: Envase[], pres: Presentacion | undefined, pedido: number): ErrorInventario {
  const disponible = stockDisponible(p, envases);
  const cerrados = usaEnvases(p) ? envasesDe(envases, p.id).filter(e => e.estado === 'cerrado').length : 0;
  const entre = usaEnvases(p) ? ` (${contarEnvases(p, cerrados)} ${adjetivo(p, 'cerrad', cerrados)})` : '';
  return error('stock_insuficiente',
    `No alcanza: de ${p.nombre} quedan ${formatCantidad(disponible, p.unidadBase)}${entre} y pides ${formatCantidad(pedido, p.unidadBase)}.`,
    { productoId: p.id, maximo: maximoVendible(p, envases, pres) });
}

/** Subcategoría «completa»: solo cerradas → «vendido». Nunca usa una abierta. */
export function venderCompleto(p: Producto, envases: Envase[], cantidad: number, op: OpcionesEnvase = {}): ResultadoEnvases {
  const ahora = op.ahora ?? new Date().toISOString();
  const sin = (e: ErrorInventario): ResultadoEnvases => ({ envases, movimientos: [], consumos: [], error: e });
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    return sin(error('cantidad_invalida', `Los ${nombreEnvase(p, true)} completos se venden en cantidades enteras.`, { productoId: p.id }));
  }
  const cerrados = envasesDe(envases, p.id).filter(e => e.estado === 'cerrado').sort(porCodigo);
  if (cerrados.length < cantidad) {
    const hayAbiertos = envasesDe(envases, p.id).some(e => e.estado === 'abierto');
    return sin(error('sin_cerrados',
      `No alcanza: de ${p.nombre} quedan ${contarEnvases(p, cerrados.length)} ${adjetivo(p, 'cerrad', cerrados.length)} y pides ${cantidad}`
      + `${hayAbiertos ? ` (${FEMENINO.has(p.nombreEnvase ?? 'frasco') ? 'las' : 'los'} ${adjetivo(p, 'abiert', 2)} se venden por subcategoría)` : ''}.`,
      { productoId: p.id, maximo: cerrados.length }));
  }
  const elegidos = new Map(cerrados.slice(0, cantidad).map(e => [e.id, e]));
  const consumos: ConsumoEnvase[] = [...elegidos.values()].map(e => ({ envaseId: e.id, cantidad: e.restante, envaseVendidoCompleto: true }));
  const total = consumos.reduce((a, c) => a + c.cantidad, 0);
  return {
    envases: envases.map(e => (elegidos.has(e.id) ? { ...e, estado: 'vendido' as const, restante: 0 } : e)),
    consumos,
    movimientos: [salida(p, total, consumos, ahora)],
  };
}

/**
 * Devuelve lo consumido al MISMO envase: un frasco vendido completo vuelve a «cerrado»;
 * los ml de una porción vuelven a su frasco (si estaba agotado, vuelve a «abierto»).
 */
export function revertirConsumos(envases: Envase[], consumos: ConsumoEnvase[], op: OpcionesEnvase = {}): ResultadoEnvases {
  const ahora = op.ahora ?? new Date().toISOString();
  const cambios = new Map<string, Envase>();
  for (const c of consumos) {
    const actual = cambios.get(c.envaseId) ?? envases.find(e => e.id === c.envaseId);
    if (!actual) return { envases, movimientos: [], consumos: [], error: error('envase_no_encontrado', 'No se encontró el envase original para devolver el producto.') };
    const e = { ...actual };
    if (c.envaseVendidoCompleto) {
      e.estado = 'cerrado';
      e.restante = r3(Math.min(e.capacidad, c.cantidad));
      delete e.abiertoEn;
    } else {
      e.restante = r3(Math.min(e.capacidad, (e.estado === 'vendido' ? 0 : e.restante) + c.cantidad));
      if (e.estado === 'agotado' || e.estado === 'vendido') e.estado = 'abierto';
    }
    cambios.set(e.id, e);
  }
  const porProducto = new Map<string, ConsumoEnvase[]>();
  for (const c of consumos) {
    const pid = cambios.get(c.envaseId)!.productoId;
    porProducto.set(pid, [...(porProducto.get(pid) ?? []), c]);
  }
  return {
    envases: envases.map(e => cambios.get(e.id) ?? e),
    consumos,
    movimientos: [...porProducto].map(([productoId, lista]) => ({
      productoId, tipo: 'devolucion' as const, cantidad: r3(lista.reduce((a, c) => a + c.cantidad, 0)), fecha: ahora, motivo: '', consumos: lista,
    })),
  };
}

/** Merma o ajuste (±) en un envase específico. El motivo es obligatorio. */
export function ajustarEnvase(
  p: Producto, envases: Envase[],
  d: { envaseId: string; cantidad: number; motivo: string; tipo: 'merma' | 'ajuste' },
  op: OpcionesEnvase = {},
): ResultadoEnvases {
  const ahora = op.ahora ?? new Date().toISOString();
  const sin = (e: ErrorInventario): ResultadoEnvases => ({ envases, movimientos: [], consumos: [], error: e });
  if (!d.motivo?.trim()) return sin(error('motivo_requerido', 'Escribe el motivo.', { productoId: p.id }));
  const actual = envases.find(e => e.id === d.envaseId && e.productoId === p.id);
  if (!actual) return sin(error('envase_no_encontrado', 'Elige un envase.', { productoId: p.id }));
  if (!envaseVigente(actual)) return sin(error('envase_no_disponible', `${actual.codigo} ya está ${actual.estado}.`, { productoId: p.id }));
  const delta = d.tipo === 'merma' ? -Math.abs(d.cantidad) : d.cantidad;
  const nuevo = r3(actual.restante + delta);
  if (!delta || nuevo < -EPS || nuevo > actual.capacidad + EPS) {
    return sin(error('cantidad_invalida', `En ${actual.codigo} quedan ${formatCantidad(actual.restante, p.unidadBase)}; la cantidad debe dejarlo entre 0 y ${formatCantidad(actual.capacidad, p.unidadBase)}.`, { productoId: p.id }));
  }
  const e: Envase = { ...actual, restante: Math.max(0, nuevo) };
  if (e.restante <= EPS) { e.restante = 0; e.estado = 'agotado'; }
  else if (actual.estado === 'cerrado' && nuevo < actual.capacidad) { e.estado = 'abierto'; e.abiertoEn = ahora; }
  return {
    envases: envases.map(x => (x.id === e.id ? e : x)),
    consumos: [{ envaseId: e.id, cantidad: Math.abs(delta) }],
    movimientos: [{
      productoId: p.id, tipo: d.tipo, cantidad: d.tipo === 'merma' ? Math.abs(delta) : delta, fecha: ahora,
      motivo: `${d.motivo.trim()} (${actual.codigo})`, envaseId: e.id, consumos: [{ envaseId: e.id, cantidad: Math.abs(delta) }],
    }],
  };
}

/** Reposición: crea envases cerrados nuevos (continúa la numeración). Motivo obligatorio. */
export function reponerEnvases(
  p: Producto, envases: Envase[],
  d: { cantidadEnvases: number; motivo: string; loteId?: string },
  op: OpcionesEnvase = {},
): ResultadoEnvases & { nuevos: Envase[] } {
  const ahora = op.ahora ?? new Date().toISOString();
  const sin = (e: ErrorInventario) => ({ envases, movimientos: [], consumos: [], nuevos: [], error: e });
  if (!d.motivo?.trim()) return sin(error('motivo_requerido', 'Escribe el motivo.', { productoId: p.id }));
  if (!Number.isInteger(d.cantidadEnvases) || d.cantidadEnvases <= 0) {
    return sin(error('cantidad_invalida', `Indica cuántos ${nombreEnvase(p, true)} llegaron (número entero).`, { productoId: p.id }));
  }
  const nuevos = crearEnvases(p, envases, { cerrados: d.cantidadEnvases, loteId: d.loteId, ahora }, op);
  const cantidad = r3(nuevos.reduce((a, e) => a + e.restante, 0));
  return {
    envases: [...envases, ...nuevos], nuevos, consumos: [],
    movimientos: [{ productoId: p.id, tipo: 'ingreso', cantidad, fecha: ahora, motivo: `${d.motivo.trim()} (${nuevos[0].codigo}–${nuevos[nuevos.length - 1].codigo})`, lote: d.loteId }],
  };
}

// ── Ventas (todas las líneas a la vez) ────────────────────────────────────

export interface EstadoInventario {
  productos: Producto[];
  envases: Envase[];
  lotes: Lote[];
  movimientos: MovimientoInventario[];
}

export interface OpcionesVenta extends OpcionesEnvase { metodo?: MetodoCosteo; motivo?: string }

export interface ResultadoVenta {
  estado: EstadoInventario;
  lineas: VentaProducto[];
  /** Movimientos nuevos (ya incluidos en estado.movimientos). */
  movimientos: MovimientoInventario[];
  /** Envases abiertos automáticamente por esta venta (para el aviso «Se abrió la botella F4…»). */
  aperturas: { productoId: string; envaseId: string; codigo: string }[];
  /** Eventos para el Centro de alertas: aperturas, remanentes sin uso o la venta bloqueada. */
  eventos: EventoInventario[];
  /** La venta ya se había descontado (doble clic o reintento): no se hizo nada. */
  duplicada?: boolean;
  error?: ErrorInventario;
}

/** ¿Esta venta ya descontó inventario? (salida vigente con su id). */
export const ventaYaAplicada = (movimientos: MovimientoInventario[], ventaId: string) =>
  movimientos.some(m => m.origenTipo === 'venta' && m.origenId === ventaId && m.tipo === 'salida' && !m.revertido);

const presentacionDe = (p: Producto, id?: string) =>
  id ? presentacionesActivas(p).find(x => x.id === id) ?? p.presentaciones?.find(x => x.id === id) : undefined;

/** Envases abiertos con un remanente que no alcanza para ninguna subcategoría activa. */
export function remanentesSinUso(p: Producto, envases: Envase[]): Envase[] {
  if (!usaEnvases(p)) return [];
  const minimo = factorMinimoVendible(p);
  if (minimo === null || minimo <= EPS) return [];
  return envasesDe(envases, p.id).filter(e => e.estado === 'abierto' && e.restante > EPS && e.restante + EPS < minimo).sort(porCodigo);
}

/**
 * Valida y descuenta TODAS las líneas de una venta. Si una falla no cambia nada y devuelve el
 * error con su número de línea (y un evento «venta bloqueada»). Costo congelado según el método.
 * Las aperturas automáticas quedan ligadas a la venta (origenId) para poder revertirlas.
 * Idempotente: si `ventaId` ya tiene salidas vigentes, devuelve `duplicada` sin descontar.
 */
export function procesarVenta(estado: EstadoInventario, ventaId: string, lineas: VentaProducto[], op: OpcionesVenta = {}): ResultadoVenta {
  if (ventaYaAplicada(estado.movimientos, ventaId)) return { estado, lineas, movimientos: [], aperturas: [], eventos: [], duplicada: true };
  const ahora = op.ahora ?? new Date().toISOString();
  const metodo = op.metodo ?? 'promedio';
  const porId = new Map(estado.productos.map(p => [p.id, p]));
  let envases = estado.envases;
  let lotes = estado.lotes;
  const stock = new Map<string, number>();
  const acumulado = new Map<string, { cantidad: number; costo: number; consumos: ConsumoEnvase[]; consumosLote: ConsumoLote[] }>();
  const movAperturas: MovimientoBorrador[] = [];
  const abiertos: Envase[] = [];
  const fallo = (e: ErrorInventario, linea: number): ResultadoVenta => ({
    estado, lineas, movimientos: [], aperturas: [], error: { ...e, linea },
    eventos: [{
      tipo: 'venta_bloqueada', clave: `venta-bloqueada:${e.productoId ?? 'x'}:${ahora.slice(0, 10)}`, productoId: e.productoId ?? '',
      titulo: 'Venta no realizada por falta de stock', detalle: e.mensaje,
    }],
  });

  const descontar = (p: Producto, cantidadBase: number, pres: Presentacion | undefined, cantidad: number): ErrorInventario | ConsumoEnvase[] => {
    if (usaEnvases(p)) {
      const r = tipoPresentacion(p, pres) === 'completa'
        ? venderCompleto(p, envases, cantidad, op)
        : venderPorcion(p, envases, pres ?? { id: 'base', nombre: p.nombre, factor: 1, precio: p.precio, activa: true }, cantidad, op);
      if (r.error) return r.error;
      envases = r.envases;
      movAperturas.push(...r.movimientos.filter(m => m.tipo === 'apertura'));
      abiertos.push(...(r.aperturas ?? []));
      return r.consumos;
    }
    const disponible = stock.get(p.id) ?? r3(Number(p.stock) || 0);
    if (cantidadBase > disponible + EPS) {
      const cociente = disponible / (r3(pres?.factor ?? 1) || 1);
      return error('stock_insuficiente', `No alcanza: de ${p.nombre} quedan ${formatCantidad(disponible, p.unidadBase)} y pides ${formatCantidad(cantidadBase, p.unidadBase)}.`, {
        productoId: p.id, maximo: tipoPresentacion(p, pres) === 'variable' ? Math.floor(cociente * 1000 + EPS) / 1000 : Math.floor(cociente + EPS),
      });
    }
    stock.set(p.id, r3(disponible - cantidadBase));
    return [];
  };
  const registrar = (p: Producto, cantidadBase: number, consumos: ConsumoEnvase[]) => {
    const c = consumirLotes(lotes, p.id, cantidadBase, metodo, Number(p.costo) || 0);
    lotes = c.lotes;
    const consumosLote = c.detalle.map(d => ({ loteId: d.loteId, cantidad: d.cantidad }));
    const a = acumulado.get(p.id) ?? { cantidad: 0, costo: 0, consumos: [], consumosLote: [] };
    acumulado.set(p.id, {
      cantidad: r3(a.cantidad + cantidadBase), costo: a.costo + c.costoTotal,
      consumos: [...a.consumos, ...consumos], consumosLote: [...a.consumosLote, ...consumosLote],
    });
    return { costo: c.costoTotal, consumosLote };
  };

  const nuevas: VentaProducto[] = [];
  for (const [i, original] of lineas.entries()) {
    // Una línea editada puede traer el detalle de la venta anterior: se recalcula siempre.
    const { consumosEnvase: _ce, consumosLote: _cl, ...vp } = original;
    const p = porId.get(vp.productoId);
    if (vp.esInventariable === false || !p || p.tipo !== 'producto' || !(vp.cantidad > 0)) { nuevas.push(original); continue; }
    const pres = presentacionDe(p, vp.presentacionId);
    const cantidadBase = r3(vp.cantidad * (pres?.factor ?? 1));
    const consumos = descontar(p, cantidadBase, pres, vp.cantidad);
    if (!Array.isArray(consumos)) return fallo(consumos, i);
    const { costo, consumosLote } = registrar(p, cantidadBase, consumos);
    let costoLinea = costo;
    // Insumos de la receta (atomizador por decant): mismo control de stock.
    for (const insumo of pres?.receta ?? []) {
      const pi = porId.get(insumo.productoId);
      if (!pi || pi.tipo !== 'producto') continue;
      const cant = r3(insumo.cantidad * vp.cantidad);
      const ci = descontar(pi, cant, undefined, cant);
      if (!Array.isArray(ci)) return fallo(ci, i);
      costoLinea += registrar(pi, cant, ci).costo;
    }
    costoLinea += (Number(pres?.costoInsumos) || 0) * vp.cantidad;
    const costoVenta = Math.round(costoLinea);
    nuevas.push({
      ...vp, cantidadBase, costoVenta, costoUnitario: Math.round(costoVenta / vp.cantidad),
      ...(consumos.length ? { consumosEnvase: consumos } : {}), ...(consumosLote.length ? { consumosLote } : {}),
    });
  }

  const ligar = { origenTipo: 'venta' as const, origenId: ventaId };
  const aperturasMov: MovimientoInventario[] = movAperturas.map(m => ({ ...m, ...ligar, id: idNuevo(op), motivo: `${m.motivo} (venta #${ventaId.split('-')[0]})` }));
  const movimientos: MovimientoInventario[] = [...acumulado].map(([productoId, a]) => ({
    id: idNuevo(op), productoId, tipo: 'salida', cantidad: a.cantidad,
    costoUnitario: a.cantidad > 0 ? Math.round(a.costo / a.cantidad) : undefined,
    fecha: ahora, motivo: op.motivo ?? `Venta #${ventaId.split('-')[0]}`, ...ligar,
    ...(a.consumos.length ? { consumos: a.consumos } : {}), ...(a.consumos.length === 1 ? { envaseId: a.consumos[0].envaseId } : {}),
    ...(a.consumosLote.length ? { consumosLote: a.consumosLote } : {}),
  }));
  const productos = estado.productos.map(p => {
    if (!acumulado.has(p.id)) return p;
    return { ...p, stock: usaEnvases(p) ? stockDisponible(p, envases) : stock.get(p.id) ?? p.stock };
  });

  // Eventos: cada apertura automática y los remanentes que quedaron sin uso.
  const eventos: EventoInventario[] = [];
  for (const e of abiertos) {
    const p = porId.get(e.productoId)!;
    const cerrados = envasesDe(envases, p.id).filter(x => x.estado === 'cerrado').length;
    eventos.push({
      tipo: 'apertura_automatica', clave: `apertura:${e.id}`, productoId: p.id,
      titulo: `Se abrió ${conArticulo(p)} ${e.codigo} de ${p.nombre}`,
      detalle: `Quedan ${contarEnvases(p, cerrados)} ${adjetivo(p, 'cerrad', cerrados)}.`,
    });
  }
  const tocados = new Set(movimientos.flatMap(m => (m.consumos ?? []).map(c => c.envaseId)));
  for (const p of productos) {
    for (const e of remanentesSinUso(p, envases).filter(x => tocados.has(x.id))) {
      eventos.push({
        tipo: 'remanente_sin_uso', clave: `remanente:${e.id}`, productoId: p.id,
        titulo: `${e.codigo} de ${p.nombre}: ${formatCantidad(e.restante, p.unidadBase)} sin uso`,
        detalle: 'No alcanza para ninguna subcategoría activa. Puedes registrarlo como merma en la ficha.',
      });
    }
  }
  const nuevosMov = [...aperturasMov, ...movimientos];
  return {
    estado: { productos, envases, lotes, movimientos: [...nuevosMov, ...estado.movimientos] },
    lineas: nuevas, movimientos: nuevosMov,
    aperturas: abiertos.map(e => ({ productoId: e.productoId, envaseId: e.id, codigo: e.codigo })),
    eventos,
  };
}

/** Lotes: devuelve a los mismos lotes lo consumido (sin pasar su cantidad inicial). */
function restaurarLotes(lotes: Lote[], consumos: ConsumoLote[]): Lote[] {
  const suma = new Map<string, number>();
  consumos.forEach(c => suma.set(c.loteId, r3((suma.get(c.loteId) ?? 0) + c.cantidad)));
  return lotes.map(l => (suma.has(l.id) ? { ...l, cantidadRestante: r3(Math.min(l.cantidadInicial, l.cantidadRestante + suma.get(l.id)!)) } : l));
}

/**
 * Respaldo para ventas antiguas SIN detalle por envase: los envases completos vuelven como
 * cerrados nuevos (lógica anterior) y el resto se suma a un abierto con espacio (o a uno nuevo).
 */
function devolverSinDetalle(p: Producto, envases: Envase[], cantidad: number, op: OpcionesEnvase): Envase[] {
  const capacidad = Number(p.capacidadEnvase) || 0;
  const completos = Math.floor(r3(cantidad / capacidad) + EPS);
  let resto = r3(cantidad - completos * capacidad);
  let lista = [...envases, ...crearEnvases(p, envases, { cerrados: completos }, op)];
  if (resto > EPS) {
    const destino = ordenarAbiertos(envasesDe(lista, p.id).filter(e => e.estado === 'abierto' && e.restante + resto <= e.capacidad + EPS), 'menos_contenido').pop();
    if (destino) {
      lista = lista.map(e => (e.id === destino.id ? { ...e, restante: r3(e.restante + resto) } : e));
      resto = 0;
    } else {
      lista = [...lista, ...crearEnvases(p, lista, { cerrados: 0, abiertos: [resto] }, op)];
    }
  }
  return lista;
}

/**
 * Anula el descuento de una venta: usa sus salidas vigentes (incluye insumos de receta),
 * devuelve a los mismos envases y lotes, marca las salidas como revertidas (historial) y
 * agrega un movimiento «devolucion» que las compensa.
 */
export function revertirVenta(estado: EstadoInventario, ventaId: string, op: OpcionesVenta = {}): { estado: EstadoInventario; movimientos: MovimientoInventario[]; error?: ErrorInventario } {
  const ahora = op.ahora ?? new Date().toISOString();
  const salidas = estado.movimientos.filter(m => m.origenTipo === 'venta' && m.origenId === ventaId && m.tipo === 'salida' && !m.revertido);
  if (salidas.length === 0) return { estado, movimientos: [] };
  const porId = new Map(estado.productos.map(p => [p.id, p]));
  let envases = estado.envases;
  let lotes = estado.lotes;
  const stock = new Map<string, number>();
  const devoluciones: MovimientoInventario[] = [];
  for (const m of salidas) {
    const p = porId.get(m.productoId);
    if (!p) continue;
    if (usaEnvases(p)) {
      if (m.consumos?.length) {
        const r = revertirConsumos(envases, m.consumos, op);
        if (r.error) return { estado, movimientos: [], error: { ...r.error, productoId: p.id } };
        envases = r.envases;
      } else {
        envases = devolverSinDetalle(p, envases, m.cantidad, op);
      }
    } else {
      stock.set(p.id, r3((stock.get(p.id) ?? (Number(p.stock) || 0)) + m.cantidad));
    }
    lotes = m.consumosLote?.length
      ? restaurarLotes(lotes, m.consumosLote)
      : [...lotes, {
        id: idNuevo(op), productoId: p.id, fecha: ahora.slice(0, 10), cantidadInicial: m.cantidad, cantidadRestante: m.cantidad,
        costoUnitario: m.costoUnitario ?? (Number(p.costo) || 0), compraId: `devolucion-${ventaId}`,
      }];
    devoluciones.push({
      id: idNuevo(op), productoId: p.id, tipo: 'devolucion', cantidad: m.cantidad, costoUnitario: m.costoUnitario, fecha: ahora,
      motivo: op.motivo ?? `Anulación venta #${ventaId.split('-')[0]}`, origenTipo: 'devolucion', origenId: ventaId,
      ...(m.consumos ? { consumos: m.consumos } : {}), ...(m.envaseId ? { envaseId: m.envaseId } : {}),
    });
  }
  // Si la venta abrió un envase y con la devolución vuelve a quedar lleno, vuelve a «cerrado»
  // y su apertura queda revertida (como si nunca se hubiera abierto).
  const aperturas = estado.movimientos.filter(m => m.tipo === 'apertura' && m.origenTipo === 'venta' && m.origenId === ventaId && !m.revertido);
  const revertidas = new Set(salidas.map(m => m.id));
  for (const a of aperturas) {
    const e = envases.find(x => x.id === a.envaseId);
    if (!e || e.estado !== 'abierto' || e.restante + EPS < e.capacidad) continue;
    const { abiertoEn: _a, ...cerrado } = e;
    envases = envases.map(x => (x.id === e.id ? { ...cerrado, estado: 'cerrado' as const, restante: e.capacidad } : x));
    revertidas.add(a.id);
  }
  const tocados = new Set(devoluciones.map(m => m.productoId));
  return {
    estado: {
      productos: estado.productos.map(p => (tocados.has(p.id) ? { ...p, stock: usaEnvases(p) ? stockDisponible(p, envases) : stock.get(p.id) ?? p.stock } : p)),
      envases,
      lotes,
      movimientos: [...devoluciones, ...estado.movimientos.map(m => (revertidas.has(m.id) ? { ...m, revertido: true } : m))],
    },
    movimientos: devoluciones,
  };
}

/**
 * Disponibilidad de una subcategoría para Ventas: «393 disponibles» y, con envases, de dónde
 * saldrá la próxima («desde F20 (70 ml)», «abrirá F1»). Disponibles = stock aprovechable ÷ cantidad.
 */
export function textoDisponibilidad(p: Producto, envases: Envase[], pres: Presentacion, politica: Politica = 'menos_contenido'): { unidades: number; texto: string; detalle?: string } {
  const tipo = tipoPresentacion(p, pres);
  const unidades = maximoVendible(p, envases, pres);
  if (tipo === 'variable') {
    const total = stockDisponible(p, envases);
    return { unidades, texto: total > EPS ? `${formatCantidad(total, p.unidadBase)} disponibles` : 'Sin stock' };
  }
  if (unidades <= 0) {
    return { unidades: 0, texto: usaEnvases(p) && tipo === 'completa' ? `Sin ${nombreEnvase(p, true)} ${adjetivo(p, 'cerrad', 2)}` : 'Sin stock' };
  }
  const texto = `${unidades.toLocaleString('es-CL')} disponible${unidades === 1 ? '' : 's'}`;
  if (!usaEnvases(p) || tipo === 'completa') return { unidades, texto };
  const desde = elegirAbierto(envases, p.id, pres.factor, politica);
  if (desde) return { unidades, texto, detalle: `desde ${desde.codigo} (${formatCantidad(desde.restante, p.unidadBase)})` };
  const cerrado = siguienteCerrado(envases, p.id);
  return { unidades, texto, detalle: cerrado ? `abrirá ${cerrado.codigo}` : `combina ${nombreEnvase(p, true)} ${adjetivo(p, 'abiert', 2)}` };
}

/** «3 ml de F3 + 2 ml de F5» / «F7 completo» para mostrar antes de confirmar. */
export function describirConsumos(p: Producto, envases: Envase[], consumos: ConsumoEnvase[] = []): string {
  const codigo = (id: string) => envases.find(e => e.id === id)?.codigo ?? '?';
  return consumos.map(c => (c.envaseVendidoCompleto ? `${codigo(c.envaseId)} completo` : `${formatCantidad(c.cantidad, p.unidadBase)} de ${codigo(c.envaseId)}`)).join(' + ');
}

// ── Migración de datos antiguos (no destructiva) ─────────────────────────

/**
 * Completa `formaCompra` y el `tipo` de las presentaciones SIN cambiar stock ni borrar campos.
 * Los casos dudosos quedan con `requiereRevisionUnidades` para que el usuario confirme.
 */
export function normalizarProducto(p: Producto, envases: Envase[]): Producto {
  if (p.tipo !== 'producto' || p.formaCompra || p.requiereRevisionUnidades) return p;
  const pres = p.presentaciones ?? [];
  const conTipo = (conEnvases: boolean) => pres.map(x => (x.tipo ? x : { ...x, tipo: conEnvases && x.origen === 'envase_cerrado' ? 'completa' as const : 'fija' as const }));
  const sinUnidad = !p.unidadBase || p.unidadBase === 'unidad';
  if (!p.controlEnvases && sinUnidad) return { ...p, formaCompra: 'unidad', ...(pres.length ? { presentaciones: conTipo(false) } : {}) };
  if (p.controlEnvases) {
    const vigentes = envasesDe(envases, p.id).filter(envaseVigente);
    const capacidad = Number(p.capacidadEnvase) || 0;
    const suma = r3(vigentes.reduce((a, e) => a + e.restante, 0));
    const coherente = vigentes.length > 0 && capacidad > 0
      && Math.abs(suma - (Number(p.stock) || 0)) < 0.001
      && pres.every(x => x.factor <= capacidad + EPS);
    if (coherente) {
      return { ...p, formaCompra: 'envase', nombreEnvase: p.nombreEnvase ?? (p.unidadBase === 'kg' || p.unidadBase === 'g' ? 'saco' : 'frasco'), presentaciones: conTipo(true) };
    }
  }
  return { ...p, requiereRevisionUnidades: true };
}

export type DecisionUnidades =
  /** El número ya estaba en la unidad base (o es a granel): solo se confirma. */
  | { tipo: 'mantener' }
  /** El stock correcto es lo que suman los envases registrados. */
  | { tipo: 'usar_envases' }
  /** El número eran envases: «20 frascos de 100 ml». */
  | { tipo: 'envases'; contenido: number; unidad: UnidadEntrada; nombreEnvase: NombreEnvase; costoEnvase: number };

export interface ResultadoConversion {
  producto: Producto;
  envases: Envase[];
  lotes: Lote[];
  movimientos: MovimientoBorrador[];
  error?: ErrorInventario;
}

/** Convierte un producto marcado para revisión. Solo se llama cuando el usuario confirma. */
export function convertirUnidades(p: Producto, envases: Envase[], lotes: Lote[], d: DecisionUnidades, op: OpcionesEnvase = {}): ResultadoConversion {
  const ahora = op.ahora ?? new Date().toISOString();
  const sin = (e: ErrorInventario): ResultadoConversion => ({ producto: p, envases, lotes, movimientos: [], error: e });
  const stockActual = r3(Number(p.stock) || 0);
  const pres = p.presentaciones ?? [];
  const ajuste = (nuevo: number): MovimientoBorrador[] => (Math.abs(nuevo - stockActual) > EPS
    ? [{ productoId: p.id, tipo: 'ajuste', cantidad: r3(nuevo - stockActual), fecha: ahora, motivo: 'Conversión de unidades' }]
    : []);

  if (d.tipo === 'mantener') {
    if (p.controlEnvases) return sin(error('cantidad_invalida', 'Este producto usa envases: elige «usar lo que suman los envases» o indica el contenido de cada uno.', { productoId: p.id }));
    const forma = !p.unidadBase || p.unidadBase === 'unidad' ? 'unidad' : 'granel';
    return {
      producto: normalizarMinimo({ ...p, formaCompra: forma, requiereRevisionUnidades: false, presentaciones: pres.map(x => ({ ...x, tipo: tipoPresentacion(p, x), origen: 'granel' })) }),
      envases, lotes, movimientos: [],
    };
  }

  if (d.tipo === 'usar_envases') {
    if (!usaEnvases(p)) return sin(error('envase_no_disponible', 'Este producto no tiene envases registrados.', { productoId: p.id }));
    const suma = stockDisponible(p, envases);
    return {
      producto: normalizarMinimo({
        ...p, stock: suma, formaCompra: 'envase', requiereRevisionUnidades: false,
        presentaciones: pres.map(x => ({ ...x, tipo: tipoPresentacion(p, x) })),
      }),
      envases, lotes, movimientos: ajuste(suma),
    };
  }

  // «Son N envases de X»: el número guardado era la cantidad de envases.
  const capacidad = aBase(d.contenido, d.unidad);
  if (!(capacidad > 0)) return sin(error('cantidad_invalida', 'Indica el contenido de cada envase.', { productoId: p.id }));
  if (!Number.isInteger(stockActual) || stockActual <= 0) return sin(error('cantidad_invalida', 'El stock no es un número entero de envases.', { productoId: p.id }));
  const unidadBase = unidadBaseDe(d.unidad);
  // Presentaciones: si estaban en «unidades» eran envases (factor × contenido); si estaban en
  // una medida (L, g) se pasan a la nueva base; si ya coincidía la base quedan igual.
  const escala = !p.unidadBase || p.unidadBase === 'unidad' ? capacidad
    : p.unidadBase === unidadBase ? 1
      : (p.unidadBase === 'l' && unidadBase === 'ml') ? 1000
        : (p.unidadBase === 'g' && unidadBase === 'kg') ? 0.001 : 1;
  const base: Producto = {
    ...p, unidadBase, controlEnvases: true, capacidadEnvase: capacidad, formaCompra: 'envase', nombreEnvase: d.nombreEnvase,
    requiereRevisionUnidades: false, costo: r3(d.costoEnvase / capacidad), stockMinimo: r3((Number(p.stockMinimo) || 0) * capacidad),
    // El mínimo antiguo estaba en «unidades» = envases: queda en envases cerrados.
    stockMinimoUnidad: Number(p.stockMinimo) || 0, unidadMinimo: 'envase',
  };
  base.presentaciones = pres.map(x => {
    const factor = r3(x.factor * escala);
    const tipo = factor >= capacidad - EPS ? 'completa' as const : 'fija' as const;
    return { ...x, factor, tipo, origen: origenDe(tipo, true) };
  });
  // Lotes y envases anteriores quedan como historial (en 0); se crean los correctos.
  const loteId = idNuevo(op);
  const lotesNuevos: Lote[] = [
    ...lotes.map(l => (l.productoId === p.id && l.cantidadRestante > 0 ? { ...l, cantidadRestante: 0 } : l)),
    { id: loteId, productoId: p.id, fecha: ahora.slice(0, 10), cantidadInicial: r3(stockActual * capacidad), cantidadRestante: r3(stockActual * capacidad), costoUnitario: base.costo },
  ];
  const anteriores = envases.map(e => (e.productoId === p.id && envaseVigente(e) ? { ...e, estado: 'agotado' as const, restante: 0 } : e));
  const nuevos = crearEnvases(base, anteriores, { cerrados: stockActual, loteId, ahora }, op);
  const total = r3(stockActual * capacidad);
  return {
    producto: { ...base, stock: total },
    envases: [...anteriores, ...nuevos],
    lotes: lotesNuevos,
    movimientos: ajuste(total),
  };
}

// ── Stock mínimo en la unidad de compra, merma a granel y quiebre ─────────

export type EstadoStock = 'ok' | 'bajo' | 'sin_stock' | 'no_aplica';
type UnidadMinimo = NonNullable<Producto['unidadMinimo']>;

/** Unidad del mínimo: envases cerrados (con envases), unidades o kg / t / L a granel. Nunca ml ni g. */
export function unidadMinimoDe(p: Producto): UnidadMinimo {
  if (usaEnvases(p)) return 'envase';
  if (!p.unidadBase || p.unidadBase === 'unidad') return 'unidad';
  if (p.unidadMinimo === 't' || p.unidadMinimo === 'kg' || p.unidadMinimo === 'l') return p.unidadMinimo;
  return p.unidadBase === 'ml' || p.unidadBase === 'l' ? 'l' : 'kg';
}

/** Mínimo convertido a la unidad base (para comparar con el stock o estimar quiebres). */
export function minimoBase(p: Producto): number {
  if (p.stockMinimoUnidad === undefined) return r3(Number(p.stockMinimo) || 0);
  const m = Number(p.stockMinimoUnidad) || 0;
  const u = unidadMinimoDe(p);
  if (u === 'envase') return r3(m * (Number(p.capacidadEnvase) || 0));
  if (u === 'unidad') return m;
  if (p.unidadBase === 'l') return m; // dato antiguo guardado en litros
  if (p.unidadBase === 'g') return u === 'kg' ? r3(m * 1000) : u === 't' ? r3(m * 1e6) : m;
  return aBase(m, u);
}

/** «3 botellas», «0,5 t», «5 unidades». */
export function textoMinimo(p: Producto): string {
  if (p.stockMinimoUnidad === undefined) return formatCantidad(Number(p.stockMinimo) || 0, p.unidadBase);
  const m = Number(p.stockMinimoUnidad) || 0;
  const u = unidadMinimoDe(p);
  if (u === 'envase') return contarEnvases(p, m);
  if (u === 'unidad') return formatCantidad(m, 'unidad');
  return `${numero(m)} ${u === 't' ? 't' : u === 'l' ? 'L' : 'kg'}`;
}

export const cerradosDe = (p: Producto, envases: Envase[]) => envasesDe(envases, p.id).filter(e => e.estado === 'cerrado').length;

/**
 * Estado del stock:
 * - sin_stock: no alcanza ni para la subcategoría activa más chica (la «completa» exige una cerrada).
 * - bajo: con envases compara las CERRADAS contra el mínimo (las abiertas no cuentan); a granel o
 *   por unidad compara el stock con el mínimo convertido.
 * Sin `envases` (datos históricos) compara en unidad base.
 */
export function estadoStockProducto(p: Producto, envases?: Envase[], stock?: number): EstadoStock {
  if (p.tipo !== 'producto' || p.estado !== 'activo') return 'no_aplica';
  const conEnvases = usaEnvases(p) && !!envases;
  const actual = r3(stock ?? (envases ? stockDisponible(p, envases) : Number(p.stock) || 0));
  if (actual <= EPS) return 'sin_stock';
  const cerrados = conEnvases ? cerradosDe(p, envases!) : 0;
  const activas = presentacionesActivas(p);
  if (activas.length) {
    const alcanza = activas.some(x => {
      const t = tipoPresentacion(p, x);
      if (t === 'variable') return true;
      if (t === 'completa' && usaEnvases(p)) return conEnvases ? cerrados > 0 : actual + EPS >= (Number(p.capacidadEnvase) || 0);
      return actual + EPS >= r3(x.factor);
    });
    if (!alcanza) return 'sin_stock';
  } else if ((!p.unidadBase || p.unidadBase === 'unidad') && actual + EPS < 1) {
    return 'sin_stock';
  }
  if (conEnvases && p.stockMinimoUnidad !== undefined) {
    const minimo = Number(p.stockMinimoUnidad) || 0;
    return minimo > 0 && cerrados <= minimo ? 'bajo' : 'ok';
  }
  const minimo = minimoBase(p);
  return minimo > 0 && actual <= minimo + EPS ? 'bajo' : 'ok';
}

/**
 * Migración del mínimo antiguo (unidad base) a la unidad de compra: ml → botellas redondeando
 * hacia arriba, kg → kg, ml a granel → L. Los productos dudosos (por revisar) no se tocan.
 */
export function normalizarMinimo(p: Producto): Producto {
  if (p.tipo !== 'producto' || p.stockMinimoUnidad !== undefined || p.requiereRevisionUnidades) return p;
  const base = Number(p.stockMinimo) || 0;
  if (!(base > 0)) return p;
  if (usaEnvases(p)) {
    const capacidad = Number(p.capacidadEnvase) || 0;
    return capacidad > 0 ? { ...p, stockMinimoUnidad: Math.ceil(base / capacidad - EPS), unidadMinimo: 'envase' } : p;
  }
  if (!p.unidadBase || p.unidadBase === 'unidad') return { ...p, stockMinimoUnidad: base, unidadMinimo: 'unidad' };
  if (p.unidadBase === 'kg') return { ...p, stockMinimoUnidad: base, unidadMinimo: 'kg' };
  if (p.unidadBase === 'ml') return { ...p, stockMinimoUnidad: r3(base / 1000), unidadMinimo: 'l' };
  return p; // 'l' / 'g' antiguos: se resuelven al revisar unidades
}

/** Normalización completa al cargar: forma de compra, tipos ('porcion' → 'fija') y mínimo. */
export function normalizarInventario(p: Producto, envases: Envase[]): Producto {
  let n = normalizarProducto(p, envases);
  if (n.presentaciones?.some(x => x.tipo === 'porcion')) {
    n = { ...n, presentaciones: n.presentaciones.map(x => (x.tipo === 'porcion' ? { ...x, tipo: 'fija' as const } : x)) };
  }
  return normalizarMinimo(n);
}

/**
 * Merma de un producto sin envases (granel o por unidad): por cantidad o por %, sale del lote
 * más antiguo con su costo. Motivo obligatorio. No toca nada si hay error.
 */
export function mermaGranel(
  p: Producto, lotes: Lote[],
  d: { cantidad?: number; porcentaje?: number; motivo: string },
  op: OpcionesVenta = {},
): { producto: Producto; lotes: Lote[]; movimientos: MovimientoBorrador[]; eventos: EventoInventario[]; error?: ErrorInventario } {
  const ahora = op.ahora ?? new Date().toISOString();
  const sin = (e: ErrorInventario) => ({ producto: p, lotes, movimientos: [], eventos: [], error: e });
  if (!d.motivo?.trim()) return sin(error('motivo_requerido', 'Elige o escribe el motivo.', { productoId: p.id }));
  if (usaEnvases(p)) return sin(error('envase_no_disponible', `Indica de qué ${nombreEnvase(p)} sale la merma.`, { productoId: p.id }));
  const stock = r3(Number(p.stock) || 0);
  const cantidad = d.porcentaje !== undefined ? r3(stock * (Number(d.porcentaje) || 0) / 100) : r3(Number(d.cantidad) || 0);
  if (!(cantidad > 0)) return sin(error('cantidad_invalida', 'La merma debe ser mayor que cero.', { productoId: p.id }));
  if (cantidad > stock + EPS) return sin(error('stock_insuficiente', `Solo hay ${formatCantidad(stock, p.unidadBase)} de ${p.nombre}.`, { productoId: p.id }));
  const c = consumirLotes(lotes, p.id, cantidad, op.metodo ?? 'promedio', Number(p.costo) || 0);
  const texto = `${formatCantidad(cantidad, p.unidadBase)}${d.porcentaje !== undefined ? ` (${numero(Number(d.porcentaje), 2)} %)` : ''}`;
  return {
    producto: { ...p, stock: r3(stock - cantidad) },
    lotes: c.lotes,
    movimientos: [{
      productoId: p.id, tipo: 'merma', cantidad, costoUnitario: Math.round(c.costoTotal / cantidad), fecha: ahora,
      motivo: d.motivo.trim(), consumosLote: c.detalle.map(x => ({ loteId: x.loteId, cantidad: x.cantidad })),
    }],
    eventos: [{ tipo: 'merma_registrada', clave: `merma:${p.id}:${ahora}`, productoId: p.id, titulo: `Merma de ${texto} en ${p.nombre}`, detalle: d.motivo.trim() }],
  };
}

export interface Quiebre {
  /** Días que alcanza el stock al ritmo de venta de los últimos `ventana` días (null = sin ventas). */
  dias: number | null;
  /** Stock y venta diaria en la unidad de compra (botellas, sacos, t, kg, unidades). */
  stock: number;
  consumoDiario: number;
  unidad: string;
}

/** Días restantes = stock ÷ promedio diario vendido (últimos 30 días), en la unidad de compra. */
export function diasRestantes(p: Producto, envases: Envase[], movimientos: MovimientoInventario[], hoy: string, ventana = 30): Quiebre {
  const fin = hoy.slice(0, 10);
  const desde = new Date(new Date(`${fin}T00:00:00Z`).getTime() - ventana * 86400000).toISOString().slice(0, 10);
  const vendido = movimientos
    .filter(m => m.productoId === p.id && m.tipo === 'salida' && !m.revertido && (m.fecha ?? '').slice(0, 10) > desde && (m.fecha ?? '').slice(0, 10) <= fin)
    .reduce((a, m) => a + Math.abs(m.cantidad), 0);
  const diarioBase = vendido / ventana;
  const stockBase = stockDisponible(p, envases);
  const u = unidadMinimoDe(p);
  const divisor = u === 'envase' ? Number(p.capacidadEnvase) || 1 : (u === 't' || u === 'l') && p.unidadBase !== 'l' ? 1000 : 1;
  const unidad = u === 'envase' ? nombreEnvase(p, true) : u === 'unidad' ? 'unidades' : u === 't' ? 't' : u === 'l' ? 'L' : 'kg';
  return {
    dias: diarioBase > 0 ? Math.floor((stockBase / diarioBase) * 10) / 10 : null,
    stock: r3(stockBase / divisor),
    consumoDiario: r3(diarioBase / divisor),
    unidad,
  };
}
