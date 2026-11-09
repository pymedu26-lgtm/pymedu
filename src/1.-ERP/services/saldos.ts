// Fuente ÚNICA de saldos por cobrar / por pagar (corrección #4).
// Panel, Clientes, Proveedores, Cuentas por cobrar/pagar, Alertas y Reportes deben
// leer de aquí (vía useERP().saldos / getSaldoPendienteVenta) para mostrar las mismas cifras.
import type { Venta, Gasto, Abono } from '../context/ERPContext';
import { diasEntre, hoyISO } from '../../lib/fechas';

export interface DocumentoPendiente {
  id: string;
  tipo: 'cobrar' | 'pagar';
  /** Número visible (folio / documento), nunca el UUID interno (corrección #14). */
  numero: string;
  fecha: string;
  contraparte: string;
  monto: number;
  saldo: number;
  fechaVencimiento?: string;
  /** > 0 cuando la deuda está vencida (corrección #15). */
  diasAtraso: number;
}

export interface ResumenSaldos {
  porCobrar: number;
  porPagar: number;
  /** Documentos con saldo (se habla de «ventas sin cobrar», no de clientes). */
  ventasPorCobrar: number;
  comprasPorPagar: number;
  clientesConDeuda: number;
  proveedoresConDeuda: number;
  vencidoCobrar: number;
  vencidoPagar: number;
  ventasVencidas: number;
  comprasVencidas: number;
}

export interface Saldos {
  resumen: ResumenSaldos;
  porVenta: Map<string, number>;
  porGasto: Map<string, number>;
  pendientesCobrar: DocumentoPendiente[];
  pendientesPagar: DocumentoPendiente[];
}

/** Saldo base de una venta antes de abonos. */
export const baseVenta = (v: Venta) =>
  v.saldo_base ?? v.saldo_pendiente ?? (v.estado === 'Pendiente' ? v.monto : 0);

export const baseGasto = (g: Gasto) =>
  g.saldo_base ?? g.saldo_pendiente ?? (g.estado === 'Por Pagar' ? g.monto : 0);

/** Número legible de un documento: folio si existe, si no un correlativo corto. */
export function numeroDocumento(id: string, folio?: string | number | null): string {
  if (folio !== undefined && folio !== null && String(folio).trim()) return `N.º ${folio}`;
  return `#${id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()}`;
}

export function calcularSaldos(
  ventas: Venta[],
  gastos: Gasto[],
  abonos: Abono[],
  folios: Map<string, string | number> = new Map(),
  hoy: string = hoyISO(),
): Saldos {
  // Una sola pasada por los abonos: O(n) en lugar de filtrar por cada documento.
  const cobrado = new Map<string, number>();
  const pagado = new Map<string, number>();
  for (const a of abonos) {
    const destino = a.tipo === 'cobro' ? cobrado : pagado;
    destino.set(a.referencia_id, (destino.get(a.referencia_id) ?? 0) + (a.monto_abono ?? a.monto ?? 0));
  }

  const porVenta = new Map<string, number>();
  const pendientesCobrar: DocumentoPendiente[] = [];
  const clientes = new Set<string>();
  let porCobrar = 0;
  let vencidoCobrar = 0;
  let ventasVencidas = 0;

  for (const v of ventas) {
    const saldo = Math.max(0, Math.round(baseVenta(v) - (cobrado.get(v.id) ?? 0)));
    porVenta.set(v.id, saldo);
    if (saldo <= 0) continue;
    porCobrar += saldo;
    clientes.add((v.cliente_id || v.cliente || '').toLowerCase());
    const atraso = v.fecha_vencimiento ? Math.max(0, diasEntre(v.fecha_vencimiento, hoy)) : 0;
    if (atraso > 0) { vencidoCobrar += saldo; ventasVencidas++; }
    pendientesCobrar.push({
      id: v.id, tipo: 'cobrar', numero: numeroDocumento(v.id, v.documento_id ? folios.get(v.documento_id) : undefined),
      fecha: v.fecha, contraparte: v.cliente || 'Cliente general', monto: v.monto, saldo,
      fechaVencimiento: v.fecha_vencimiento, diasAtraso: atraso,
    });
  }

  const porGasto = new Map<string, number>();
  const pendientesPagar: DocumentoPendiente[] = [];
  const proveedores = new Set<string>();
  let porPagar = 0;
  let vencidoPagar = 0;
  let comprasVencidas = 0;

  for (const g of gastos) {
    const saldo = Math.max(0, Math.round(baseGasto(g) - (pagado.get(g.id) ?? 0)));
    porGasto.set(g.id, saldo);
    if (saldo <= 0) continue;
    porPagar += saldo;
    proveedores.add((g.proveedor_id || g.proveedor || '').toLowerCase());
    const atraso = g.fecha_vencimiento ? Math.max(0, diasEntre(g.fecha_vencimiento, hoy)) : 0;
    if (atraso > 0) { vencidoPagar += saldo; comprasVencidas++; }
    pendientesPagar.push({
      id: g.id, tipo: 'pagar', numero: numeroDocumento(g.id, g.documento_id ? folios.get(g.documento_id) : undefined),
      fecha: g.fecha, contraparte: g.proveedor || 'Proveedor', monto: g.monto, saldo,
      fechaVencimiento: g.fecha_vencimiento, diasAtraso: atraso,
    });
  }

  // Más atrasados primero; luego por fecha.
  const orden = (a: DocumentoPendiente, b: DocumentoPendiente) => b.diasAtraso - a.diasAtraso || a.fecha.localeCompare(b.fecha);
  pendientesCobrar.sort(orden);
  pendientesPagar.sort(orden);

  return {
    resumen: {
      porCobrar, porPagar,
      ventasPorCobrar: pendientesCobrar.length,
      comprasPorPagar: pendientesPagar.length,
      clientesConDeuda: clientes.size,
      proveedoresConDeuda: proveedores.size,
      vencidoCobrar, vencidoPagar, ventasVencidas, comprasVencidas,
    },
    porVenta, porGasto, pendientesCobrar, pendientesPagar,
  };
}
