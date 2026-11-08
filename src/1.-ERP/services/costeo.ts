// Inventario con fraccionamiento y método de costeo (documento de arquitectura, sección Inventario).
// Funciones puras: el contexto ERP las usa al vender, comprar y registrar mermas.
// Tablas destino cuando el ERP pase a endpoints por recurso: erp.lote, erp.envase,
// erp.presentacion_venta (server/sql/02_erp_inventario.sql).
import type { Producto, Presentacion, Lote, Envase, MetodoCosteo } from '../context/ERPContext';

export interface Consumo {
  lotes: Lote[];
  costoTotal: number;
  detalle: { loteId: string; cantidad: number; costoUnitario: number }[];
  /** Cantidad pedida que no tenía lote (stock cargado sin compra registrada). */
  sinLote: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Costo promedio ponderado por unidad base del stock restante. */
export function costoPromedio(lotes: Lote[], productoId: string, respaldo = 0): number {
  let cantidad = 0;
  let valor = 0;
  for (const l of lotes) {
    if (l.productoId !== productoId || l.cantidadRestante <= 0) continue;
    cantidad += l.cantidadRestante;
    valor += l.cantidadRestante * l.costoUnitario;
  }
  return cantidad > 0 ? valor / cantidad : respaldo;
}

/**
 * Consume `cantidadBase` de los lotes del producto. Físicamente sale siempre del lote más
 * antiguo; el COSTO depende del método: FIFO = costo de cada lote usado; promedio = promedio
 * ponderado del stock al momento de vender. `respaldo` es el costo a usar si faltan lotes.
 */
export function consumirLotes(lotes: Lote[], productoId: string, cantidadBase: number, metodo: MetodoCosteo, respaldo = 0): Consumo {
  const promedio = costoPromedio(lotes, productoId, respaldo);
  const propios = lotes.filter(l => l.productoId === productoId && l.cantidadRestante > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const cambios = new Map<string, number>();
  const detalle: Consumo['detalle'] = [];
  let pendiente = cantidadBase;
  let costoTotal = 0;
  for (const l of propios) {
    if (pendiente <= 0) break;
    const toma = Math.min(l.cantidadRestante, pendiente);
    pendiente = r3(pendiente - toma);
    cambios.set(l.id, r3(l.cantidadRestante - toma));
    const costo = metodo === 'fifo' ? l.costoUnitario : promedio;
    detalle.push({ loteId: l.id, cantidad: toma, costoUnitario: costo });
    costoTotal += toma * costo;
  }
  costoTotal += pendiente * (metodo === 'fifo' ? (propios.at(-1)?.costoUnitario ?? respaldo) : promedio);
  return {
    lotes: cambios.size ? lotes.map(l => (cambios.has(l.id) ? { ...l, cantidadRestante: cambios.get(l.id)! } : l)) : lotes,
    costoTotal: Math.round(costoTotal),
    detalle,
    sinLote: pendiente,
  };
}

/** Valor del inventario desde los lotes (corrección #11); sin lotes usa stock × costo. */
export function valorInventario(productos: Producto[], lotes: Lote[]): Map<string, number> {
  const porProducto = new Map<string, number>();
  for (const l of lotes) {
    if (l.cantidadRestante > 0) porProducto.set(l.productoId, (porProducto.get(l.productoId) ?? 0) + l.cantidadRestante * l.costoUnitario);
  }
  for (const p of productos) {
    if (p.tipo !== 'producto') continue;
    if (!porProducto.has(p.id)) porProducto.set(p.id, (Number(p.stock) || 0) * (Number(p.costo) || 0));
  }
  return porProducto;
}

// ── Envases (frascos, sacos) ──────────────────────────────────────────────

export const envasesDe = (envases: Envase[], productoId: string) => envases.filter(e => e.productoId === productoId);

/** Resumen legible: «1 frasco cerrado + 1 abierto con 80 ml». */
export function resumenEnvases(producto: Producto, envases: Envase[]): string | null {
  if (!producto.controlEnvases) return null;
  const propios = envasesDe(envases, producto.id);
  const cerrados = propios.filter(e => e.estado === 'cerrado').length;
  const abierto = propios.find(e => e.estado === 'abierto');
  const u = producto.unidadBase ?? '';
  const partes = [`${cerrados} cerrado${cerrados === 1 ? '' : 's'}`];
  if (abierto) partes.push(`1 abierto con ${abierto.restante.toLocaleString('es-CL')} ${u}`);
  return partes.join(' + ');
}

/** Unidades que se pueden vender ahora de cada presentación. */
export function disponibilidad(producto: Producto, envases: Envase[], pres: Presentacion): { unidades: number; texto: string } {
  const stock = Number(producto.stock) || 0;
  if (!producto.controlEnvases || !pres.origen || pres.origen === 'granel') {
    const unidades = Math.floor(stock / pres.factor);
    return { unidades, texto: `${unidades.toLocaleString('es-CL')} disponibles` };
  }
  const propios = envasesDe(envases, producto.id);
  const cerrados = propios.filter(e => e.estado === 'cerrado');
  if (pres.origen === 'envase_cerrado') {
    const abierto = propios.find(e => e.estado === 'abierto');
    return {
      unidades: cerrados.length,
      texto: cerrados.length > 0 ? `${cerrados.length} disponibles` : abierto ? `Solo queda el abierto con ${abierto.restante} ${producto.unidadBase ?? ''}` : 'Sin stock',
    };
  }
  const abierto = propios.find(e => e.estado === 'abierto');
  const desdeAbierto = Math.floor((abierto?.restante ?? 0) / pres.factor);
  const total = Math.floor((propios.filter(e => e.estado === 'abierto' || e.estado === 'cerrado').reduce((a, e) => a + e.restante, 0)) / pres.factor);
  return { unidades: total, texto: abierto ? `${desdeAbierto} desde el envase abierto (${total} en total)` : `${total} (se abrirá un envase)` };
}

export interface ResultadoEnvases {
  envases: Envase[];
  /** Códigos abiertos en esta operación (movimiento «apertura»). */
  abiertos: string[];
  error?: string;
}

/**
 * Descuenta una venta de los envases. Envase cerrado: sale un frasco completo (nunca del
 * abierto). Envase abierto: descuenta del abierto y, si no alcanza, abre el cerrado más
 * antiguo y completa con él (el decant puede salir de dos envases).
 */
export function consumirEnvases(producto: Producto, envases: Envase[], pres: Presentacion, cantidad: number, ahora = new Date().toISOString()): ResultadoEnvases {
  if (!producto.controlEnvases || !pres.origen || pres.origen === 'granel') return { envases, abiertos: [] };
  const lista = envases.map(e => ({ ...e }));
  const propios = lista.filter(e => e.productoId === producto.id);
  const cerradosOrden = () => propios.filter(e => e.estado === 'cerrado').sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
  const abiertos: string[] = [];

  if (pres.origen === 'envase_cerrado') {
    const cerrados = cerradosOrden();
    if (cerrados.length < cantidad) {
      const abierto = propios.find(e => e.estado === 'abierto');
      return { envases, abiertos, error: abierto ? `Solo queda el envase abierto con ${abierto.restante} ${producto.unidadBase ?? ''}` : 'No quedan envases cerrados' };
    }
    cerrados.slice(0, cantidad).forEach(e => { e.estado = 'vendido'; e.restante = 0; });
    return { envases: lista, abiertos };
  }

  let pendiente = pres.factor * cantidad;
  while (pendiente > 0) {
    let abierto = propios.find(e => e.estado === 'abierto');
    if (!abierto) {
      const siguiente = cerradosOrden()[0];
      if (!siguiente) return { envases, abiertos, error: 'No queda producto suficiente en los envases' };
      siguiente.estado = 'abierto';
      siguiente.abiertoEn = ahora;
      abiertos.push(siguiente.codigo);
      abierto = siguiente;
    }
    const toma = Math.min(abierto.restante, pendiente);
    abierto.restante = r3(abierto.restante - toma);
    pendiente = r3(pendiente - toma);
    if (abierto.restante <= 0) abierto.estado = 'agotado';
  }
  return { envases: lista, abiertos };
}

/** Crea los envases de una compra (F1, F2…) continuando la numeración del producto. */
export function crearEnvases(producto: Producto, envases: Envase[], cantidadBase: number, loteId: string): Envase[] {
  const capacidad = Number(producto.capacidadEnvase) || 0;
  if (!producto.controlEnvases || capacidad <= 0) return [];
  const usados = envasesDe(envases, producto.id).map(e => Number(e.codigo.replace(/\D/g, '')) || 0);
  let n = usados.length ? Math.max(...usados) : 0;
  return Array.from({ length: Math.floor(cantidadBase / capacidad) }, () => ({
    id: crypto.randomUUID(), productoId: producto.id, loteId, codigo: `F${++n}`, capacidad, restante: capacidad, estado: 'cerrado' as const,
  }));
}

/** Presentación por defecto cuando el producto no define ninguna (se vende por unidad base). */
export const presentacionBase = (p: Producto): Presentacion => ({
  id: 'base', nombre: p.unidadBase && p.unidadBase !== 'unidad' ? `Por ${p.unidadBase}` : 'Unidad', factor: 1, precio: p.precio, activa: true, origen: 'granel',
});

export const presentacionesActivas = (p?: Producto) => (p?.presentaciones ?? []).filter(x => x.activa);
