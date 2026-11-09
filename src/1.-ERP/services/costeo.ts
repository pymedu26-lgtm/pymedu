// Inventario con fraccionamiento y método de costeo (documento de arquitectura, sección Inventario).
// Funciones puras: el contexto ERP las usa al vender, comprar y registrar mermas.
// Tablas destino cuando el ERP pase a endpoints por recurso: erp.lote, erp.envase,
// erp.presentacion_venta (server/sql/02_erp_inventario.sql).
import type { Producto, Presentacion, Lote, MetodoCosteo } from '../context/ERPContext';

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

// Envases, porciones y ventas fraccionadas: services/inventarioFraccionado.ts

/** Presentación por defecto cuando el producto no define ninguna (se vende por unidad base). */
export const presentacionBase = (p: Producto): Presentacion => ({
  id: 'base', nombre: p.unidadBase && p.unidadBase !== 'unidad' ? `Por ${p.unidadBase}` : 'Unidad', factor: 1, precio: p.precio, activa: true, origen: 'granel',
});

export const presentacionesActivas = (p?: Producto) => (p?.presentaciones ?? []).filter(x => x.activa);
