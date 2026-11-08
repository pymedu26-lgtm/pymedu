// Fuente ÚNICA de alertas (corrección #16): Panel general y Centro de alertas leen de aquí,
// así ambos muestran las mismas alertas y el mismo conteo de críticas.
import type { Producto, Promocion, Movimiento, Envase } from '../context/ERPContext';
import { stockDisponible, usaEnvases, resumenStock, formatCantidad } from './inventarioFraccionado';
import type { DocumentoTributario, PagoPOS } from './documentCompliance';
import type { Saldos } from './saldos';
import { formatCLP, formatFecha, hoyISO, diasEntre } from '../../lib/fechas';

export type TipoAlerta = 'critica' | 'tributaria' | 'advertencia' | 'info' | 'exito';
export type OrigenAlerta = 'sistema' | 'sii';

export interface Alerta {
  id: string;
  tipo: TipoAlerta;
  origen: OrigenAlerta;
  titulo: string;
  detalle: string;
  accion_label?: string;
  accion_url?: string;
  icono: string;
}

export type EstadoStock = 'ok' | 'bajo' | 'sin_stock' | 'no_aplica';

/**
 * Estado de stock con números reales (corrección #10): la carga masiva podía guardar
 * stock y mínimo como texto, y "7190" <= "9" es verdadero al comparar cadenas.
 * Sin mínimo definido (0) un producto con stock nunca es "bajo".
 */
export function estadoStock(p: Producto, stock: number = p.stock): EstadoStock {
  if (p.tipo !== 'producto' || p.estado !== 'activo') return 'no_aplica';
  const actual = Number(stock) || 0;
  const minimo = Number(p.stockMinimo) || 0;
  if (actual <= 0) return 'sin_stock';
  if (minimo > 0 && actual <= minimo) return 'bajo';
  return 'ok';
}

const PESO: Record<TipoAlerta, number> = { critica: 0, tributaria: 1, advertencia: 2, info: 3, exito: 4 };

/** Vencimiento del F29: día 12 del mes siguiente (20 con facturación electrónica). Validar con el contador. */
export function vencimientoF29(periodo: string, facturaElectronica = true): string {
  const [y, m] = periodo.split('-').map(Number);
  const siguiente = new Date(y, m, facturaElectronica ? 20 : 12);
  return `${siguiente.getFullYear()}-${String(siguiente.getMonth() + 1).padStart(2, '0')}-${String(siguiente.getDate()).padStart(2, '0')}`;
}

export function calcularAlertas(d: {
  inventario: Producto[];
  /** Con envases el stock real es la suma de sus envases (fuente única). */
  envases?: Envase[];
  saldos: Saldos;
  documentosTributarios: DocumentoTributario[];
  pagosPOS: PagoPOS[];
  promociones: Promocion[];
  movimientos: Movimiento[];
  hoy?: string;
}): Alerta[] {
  const hoy = d.hoy ?? hoyISO();
  const mes = hoy.slice(0, 7);
  const items: Alerta[] = [];

  // 1. Stock: un aviso por producto (los sin stock son críticos).
  for (const p of d.inventario) {
    const stock = stockDisponible(p, d.envases ?? []);
    const estado = estadoStock(p, stock);
    if (estado !== 'bajo' && estado !== 'sin_stock') continue;
    items.push({
      id: `stock-${p.id}`, tipo: estado === 'sin_stock' ? 'critica' : 'advertencia', origen: 'sistema',
      icono: estado === 'sin_stock' ? 'inventory' : 'warning',
      titulo: estado === 'sin_stock' ? `Sin stock: «${p.nombre}»` : `Stock bajo: «${p.nombre}»`,
      detalle: estado === 'sin_stock'
        ? 'No puedes venderlo hasta reabastecerte.'
        : `Quedan ${usaEnvases(p) ? resumenStock(p, d.envases ?? []).texto : formatCantidad(stock, p.unidadBase)} (mínimo ${formatCantidad(Number(p.stockMinimo) || 0, p.unidadBase)}).`,
      accion_label: 'Ver inventario', accion_url: '/erp/inventario',
    });
  }

  // 2. Deudas: agrupadas (no una tarjeta por documento) y con días de atraso (corrección #15).
  const { resumen, pendientesCobrar, pendientesPagar } = d.saldos;
  const peorCobro = pendientesCobrar.find(x => x.diasAtraso > 0);
  if (resumen.ventasVencidas > 0 && peorCobro) {
    items.push({
      id: 'cxc-vencidas', tipo: 'critica', origen: 'sistema', icono: 'event_busy',
      titulo: `${resumen.ventasVencidas.toLocaleString('es-CL')} venta(s) vencidas sin cobrar`,
      detalle: `${formatCLP(resumen.vencidoCobrar)} atrasados. La más antigua: ${peorCobro.contraparte} (${peorCobro.numero}), ${peorCobro.diasAtraso} días de atraso.`,
      accion_label: 'Ver por cobrar', accion_url: '/erp/cobrar',
    });
  }
  const alDia = resumen.ventasPorCobrar - resumen.ventasVencidas;
  if (alDia > 0) {
    items.push({
      id: 'cxc-pendiente', tipo: 'advertencia', origen: 'sistema', icono: 'request_quote',
      titulo: `${alDia.toLocaleString('es-CL')} venta(s) sin cobrar al día`,
      detalle: `${formatCLP(resumen.porCobrar - resumen.vencidoCobrar)} por cobrar que aún no vencen.`,
      accion_label: 'Ver por cobrar', accion_url: '/erp/cobrar',
    });
  }
  const peorPago = pendientesPagar.find(x => x.diasAtraso > 0);
  if (resumen.comprasVencidas > 0 && peorPago) {
    items.push({
      id: 'cxp-vencidas', tipo: 'critica', origen: 'sistema', icono: 'payments',
      titulo: `${resumen.comprasVencidas.toLocaleString('es-CL')} pago(s) a proveedores vencidos`,
      detalle: `${formatCLP(resumen.vencidoPagar)} atrasados. El más antiguo: ${peorPago.contraparte} (${peorPago.numero}), venció el ${formatFecha(peorPago.fechaVencimiento)}.`,
      accion_label: 'Ver por pagar', accion_url: '/erp/pagar',
    });
  }
  const pagosAlDia = resumen.comprasPorPagar - resumen.comprasVencidas;
  if (pagosAlDia > 0) {
    items.push({
      id: 'cxp-pendiente', tipo: 'advertencia', origen: 'sistema', icono: 'receipt_long',
      titulo: `${pagosAlDia.toLocaleString('es-CL')} pago(s) pendientes a proveedores`,
      detalle: `Debes ${formatCLP(resumen.porPagar - resumen.vencidoPagar)} que aún no vencen.`,
      accion_label: 'Ver por pagar', accion_url: '/erp/pagar',
    });
  }

  // 3. Documentos tributarios con problemas y documentos pendientes del mes.
  const conProblema = d.documentosTributarios.filter(x => x.estado === 'rechazado_sii' || x.estado === 'observado');
  if (conProblema.length > 0) {
    items.push({
      id: 'docs-sii', tipo: conProblema.some(x => x.estado === 'rechazado_sii') ? 'critica' : 'advertencia', origen: 'sii', icono: 'receipt_long',
      titulo: `${conProblema.length} documento(s) observados o rechazados`,
      detalle: 'Revísalos antes de cerrar tu IVA del mes.', accion_label: 'Preparar F29', accion_url: '/erp/iva-mensual',
    });
  }

  // 4. Pagos POS sin venta asociada.
  const posSinVenta = d.pagosPOS.filter(p => p.estadoConciliacion === 'sin_venta');
  if (posSinVenta.length > 0) {
    items.push({
      id: 'pos-sin-venta', tipo: 'advertencia', origen: 'sistema', icono: 'point_of_sale',
      titulo: `${posSinVenta.length} pago(s) POS sin venta`,
      detalle: 'Concílialos para que caja, ventas e IVA cuadren.', accion_label: 'Ir a Ventas', accion_url: '/erp/ventas',
    });
  }

  // 5. Calendario tributario (F29 del mes anterior) y sueldos.
  const [y, m] = mes.split('-').map(Number);
  const periodoAnterior = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`;
  const venceF29 = vencimientoF29(periodoAnterior);
  const faltan = diasEntre(hoy, venceF29);
  if (faltan >= 0 && faltan <= 10) {
    items.push({
      id: 'f29', tipo: 'tributaria', origen: 'sii', icono: 'account_balance',
      titulo: faltan === 0 ? 'Hoy vence tu F29' : `Tu F29 vence en ${faltan} día(s)`,
      detalle: `Declaración del IVA de ${periodoAnterior}: vence el ${formatFecha(venceF29)} (día 20 con facturación electrónica; 12 si no). Valida con tu contador.`,
      accion_label: 'Ver IVA mensual', accion_url: '/erp/iva-mensual',
    });
  }
  if (Number(hoy.slice(8, 10)) <= 5) {
    items.push({
      id: 'sueldos', tipo: 'tributaria', origen: 'sistema', icono: 'badge',
      titulo: 'Paga sueldos antes del día 5',
      detalle: 'Plazo del Código del Trabajo. Las cotizaciones AFP y salud vencen el día 10 (13 si pagas en línea).',
      accion_label: 'Ver por pagar', accion_url: '/erp/pagar',
    });
  }

  // 6. Promociones por terminar (≤ 3 días).
  for (const p of d.promociones) {
    if (p.estado !== 'activa' || !p.fechaFin || p.fechaFin < hoy) continue;
    const dias = diasEntre(hoy, p.fechaFin);
    if (dias <= 3) {
      items.push({
        id: `promo-${p.id}`, tipo: 'info', origen: 'sistema', icono: 'local_fire_department',
        titulo: `La promoción «${p.nombre}» termina pronto`, detalle: `Quedan ${dias} día(s) (hasta el ${formatFecha(p.fechaFin)}).`,
        accion_label: 'Ver promociones', accion_url: '/erp/promociones',
      });
    }
  }

  // 7. Flujo del mes positivo (mensaje de logro).
  let ingresos = 0;
  let egresos = 0;
  for (const mv of d.movimientos) {
    if ((mv.fecha ?? '').slice(0, 7) !== mes) continue;
    if (mv.tipo === 'Ingreso') ingresos += mv.monto; else egresos += mv.monto;
  }
  if (ingresos > egresos && ingresos > 0) {
    items.push({
      id: 'flujo-positivo', tipo: 'exito', origen: 'sistema', icono: 'trending_up',
      titulo: 'Tu flujo de caja de este mes es positivo',
      detalle: `Ingresaste ${formatCLP(ingresos)} y pagaste ${formatCLP(egresos)}.`, accion_label: 'Ver caja', accion_url: '/erp/caja',
    });
  }

  return items.sort((a, b) => PESO[a.tipo] - PESO[b.tipo]);
}
