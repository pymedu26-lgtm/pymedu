// ═══════════════════════════════════════════════════════════════════════
// Centro de alertas — fuente ÚNICA (Panel general, campana y Centro de alertas leen de aquí).
//
// Dos clases de alertas:
// - Condiciones vigentes (calculadas): stock bajo, sin stock, quiebre anticipado, lotes por
//   vencer o sin rotar, cobros y pagos, F29, documentos SII, POS sin venta… Se resuelven
//   solas cuando la condición desaparece y vuelven como nuevas si reaparece.
// - Eventos (persistidos, últimos 90 días): botella abierta automáticamente, venta bloqueada
//   por falta de stock, remanente sin uso, merma, revisión y conversión de unidades.
// El estado (nueva | vista | pospuesta hasta | descartada) se guarda en la colección
// `notificaciones` de erp_datos (antes vivía en useState y se perdía al recargar).
// Funciones puras: ERPContext guarda las filas y la UI solo pinta.
// ═══════════════════════════════════════════════════════════════════════
import type { Producto, Promocion, Movimiento, Envase, Lote, MovimientoInventario } from '../context/ERPContext';
import {
  stockDisponible, usaEnvases, formatCantidad, estadoStockProducto, cerradosDe, textoMinimo, envasesDe, adjetivo, contarEnvases,
  diasRestantes, unidadMinimoDe, type EstadoStock, type EventoInventario,
} from './inventarioFraccionado';
import type { DocumentoTributario, PagoPOS } from './documentCompliance';
import type { Saldos } from './saldos';
import { formatCLP, formatFecha, hoyISO, diasEntre } from '../../lib/fechas';

export type TipoAlerta = 'critica' | 'tributaria' | 'advertencia' | 'info' | 'exito';
export type OrigenAlerta = 'sistema' | 'sii';
export type CategoriaAlerta = 'inventario' | 'cobros' | 'pagos' | 'tributario' | 'caja' | 'ventas' | 'sistema';
export type EstadoAlerta = 'nueva' | 'vista' | 'pospuesta' | 'descartada';
export type SeccionAlerta = 'accion' | 'vencimiento' | 'aviso' | 'actividad';
export type { EstadoStock };

export const CATEGORIAS: { valor: CategoriaAlerta; etiqueta: string; icono: string }[] = [
  { valor: 'inventario', etiqueta: 'Inventario', icono: 'inventory_2' },
  { valor: 'ventas', etiqueta: 'Ventas', icono: 'point_of_sale' },
  { valor: 'cobros', etiqueta: 'Cobros', icono: 'request_quote' },
  { valor: 'pagos', etiqueta: 'Pagos', icono: 'payments' },
  { valor: 'tributario', etiqueta: 'Tributario', icono: 'account_balance' },
  { valor: 'caja', etiqueta: 'Caja', icono: 'account_balance_wallet' },
  { valor: 'sistema', etiqueta: 'Sistema', icono: 'tune' },
];

export interface AccionAlerta { etiqueta: string; url: string }
export interface EntidadAlerta { tipo: 'producto' | 'venta' | 'gasto' | 'documento' | 'lote' | 'promocion'; id: string }

export interface Alerta {
  /** = clave (estable: «stock-bajo:{productoId}»). */
  id: string;
  clave: string;
  tipo: TipoAlerta;
  categoria: CategoriaAlerta;
  origen: OrigenAlerta;
  naturaleza: 'condicion' | 'evento';
  seccion: SeccionAlerta;
  titulo: string;
  detalle: string;
  icono: string;
  creadaEn: string;
  venceEn?: string;
  entidad?: EntidadAlerta;
  /** La primera es la principal (deep link a la entidad). */
  acciones: AccionAlerta[];
  /** Agrupada: «5 productos con stock bajo». */
  grupo?: Alerta[];
  estado: EstadoAlerta;
  pospuestaHasta?: string;
  resueltaEn?: string;
  /** Veces que ocurrió el evento hoy (venta bloqueada repetida). */
  veces?: number;
  /** Compatibilidad con pantallas antiguas (= acciones[0]). */
  accion_label?: string;
  accion_url?: string;
}

/** Fila persistida en la colección `notificaciones`. */
export interface Notificacion {
  id: string;
  clase: 'evento' | 'estado';
  clave: string;
  estado: EstadoAlerta;
  creadaEn: string;
  actualizadaEn: string;
  pospuestaHasta?: string;
  /** Condición que desapareció (se muestra en «Resueltas»). */
  resueltaEn?: string;
  titulo?: string;
  detalle?: string;
  categoria?: CategoriaAlerta;
  tipoAlerta?: TipoAlerta;
  evento?: string;
  productoId?: string;
  veces?: number;
}

export interface ConfigAlertas {
  categorias?: Partial<Record<CategoriaAlerta, boolean>>;
  /** Días de anticipación. */
  diasF29?: number;
  diasCobros?: number;
  diasPagos?: number;
  /** Avisar cuando el stock alcance para menos de N días. */
  diasQuiebre?: number;
  /** Perecibles: días sin ventas para «sin rotar» y días antes del vencimiento de un lote. */
  diasSinRotar?: number;
  diasLoteVence?: number;
  mostrarPositivas?: boolean;
}

export const CONFIG_ALERTAS_DEFECTO: Required<Omit<ConfigAlertas, 'categorias'>> = {
  diasF29: 10, diasCobros: 3, diasPagos: 3, diasQuiebre: 7, diasSinRotar: 30, diasLoteVence: 7, mostrarPositivas: true,
};
const cfg = (c?: ConfigAlertas) => ({ ...CONFIG_ALERTAS_DEFECTO, ...(c ?? {}), categorias: c?.categorias ?? {} });

/**
 * Estado de stock con números reales (la carga masiva podía guardar texto). Con `envases`, el
 * mínimo se compara contra las botellas/sacos CERRADOS (ver estadoStockProducto).
 */
export function estadoStock(p: Producto, stock: number = p.stock, envases?: Envase[]): EstadoStock {
  return estadoStockProducto(p, envases, envases && usaEnvases(p) ? undefined : stock);
}

const PESO: Record<TipoAlerta, number> = { critica: 0, tributaria: 1, advertencia: 2, info: 3, exito: 4 };

/** Vencimiento del F29: día 12 del mes siguiente (20 con facturación electrónica). Validar con el contador. */
export function vencimientoF29(periodo: string, facturaElectronica = true): string {
  const [y, m] = periodo.split('-').map(Number);
  const siguiente = new Date(y, m, facturaElectronica ? 20 : 12);
  return `${siguiente.getFullYear()}-${String(siguiente.getMonth() + 1).padStart(2, '0')}-${String(siguiente.getDate()).padStart(2, '0')}`;
}

const urlProducto = (id: string, accion?: string) => `/erp/inventario?producto=${encodeURIComponent(id)}${accion ? `&accion=${accion}` : ''}`;
const enDias = (n: number) => (n === 0 ? 'hoy' : n === 1 ? 'mañana' : n < 0 ? `hace ${-n} día${n === -1 ? '' : 's'}` : `en ${n} días`);

/** «Lattafa Asad: quedan 2 botellas cerradas (mínimo 3) + 1 abierta con 40 ml». */
export function textoStockBajo(p: Producto, envases: Envase[]): string {
  if (usaEnvases(p)) {
    const cerrados = cerradosDe(p, envases);
    const abiertos = envasesDe(envases, p.id).filter(e => e.estado === 'abierto');
    const enAbiertos = abiertos.reduce((a, e) => a + e.restante, 0);
    const extra = abiertos.length ? ` + ${abiertos.length} ${adjetivo(p, 'abiert', abiertos.length)} con ${formatCantidad(enAbiertos, p.unidadBase)}` : '';
    return `${p.nombre}: quedan ${contarEnvases(p, cerrados)} ${adjetivo(p, 'cerrad', cerrados)} (mínimo ${(p.stockMinimoUnidad ?? 0).toLocaleString('es-CL')})${extra}`;
  }
  const stock = stockDisponible(p, envases);
  const u = unidadMinimoDe(p);
  const texto = u === 't' ? `${(stock / 1000).toLocaleString('es-CL', { maximumFractionDigits: 3 })} t` : formatCantidad(stock, p.unidadBase);
  return `${p.nombre}: quedan ${texto} (mínimo ${textoMinimo(p)})`;
}

export interface DatosAlertas {
  inventario: Producto[];
  envases?: Envase[];
  lotes?: Lote[];
  movimientosInventario?: MovimientoInventario[];
  saldos: Saldos;
  documentosTributarios: DocumentoTributario[];
  pagosPOS: PagoPOS[];
  promociones: Promocion[];
  movimientos: Movimiento[];
  hoy?: string;
  config?: ConfigAlertas;
}

const nueva = (a: Omit<Alerta, 'id' | 'estado' | 'creadaEn' | 'naturaleza'> & { creadaEn?: string }, hoy: string): Alerta => ({
  ...a, id: a.clave, naturaleza: 'condicion', estado: 'nueva', creadaEn: a.creadaEn ?? hoy,
  accion_label: a.acciones[0]?.etiqueta, accion_url: a.acciones[0]?.url,
});

/** Condiciones vigentes HOY (sin estados ni agrupación). Las categorías apagadas no se filtran aquí. */
export function calcularCondiciones(d: DatosAlertas): Alerta[] {
  const hoy = d.hoy ?? hoyISO();
  const c = cfg(d.config);
  const envases = d.envases ?? [];
  const movInv = d.movimientosInventario ?? [];
  const items: Alerta[] = [];
  const add = (a: Parameters<typeof nueva>[0]) => items.push(nueva(a, hoy));

  // 1. Inventario: sin stock, stock bajo, quiebre anticipado, lotes por vencer y sin rotar.
  for (const p of d.inventario) {
    if (p.tipo !== 'producto' || p.estado !== 'activo') continue;
    const estado = estadoStock(p, stockDisponible(p, envases), envases);
    const entidad: EntidadAlerta = { tipo: 'producto', id: p.id };
    if (estado === 'sin_stock') {
      add({
        clave: `sin-stock:${p.id}`, tipo: 'critica', categoria: 'inventario', origen: 'sistema', seccion: 'accion', icono: 'production_quantity_limits',
        titulo: `Sin stock: ${p.nombre}`, detalle: 'No alcanza ni para la subcategoría más chica. Repón para seguir vendiendo.', entidad,
        acciones: [{ etiqueta: 'Reponer', url: urlProducto(p.id, 'reponer') }, { etiqueta: 'Ver ficha', url: urlProducto(p.id) }],
      });
      continue;
    }
    if (estado === 'bajo') {
      add({
        clave: `stock-bajo:${p.id}`, tipo: 'advertencia', categoria: 'inventario', origen: 'sistema', seccion: 'accion', icono: 'inventory',
        titulo: `Stock bajo: ${p.nombre}`, detalle: `${textoStockBajo(p, envases)}.`, entidad,
        acciones: [{ etiqueta: 'Reponer', url: urlProducto(p.id, 'reponer') }, { etiqueta: 'Ver ficha', url: urlProducto(p.id) }],
      });
    }
    const q = diasRestantes(p, envases, movInv, hoy);
    if (q.dias !== null && q.dias < c.diasQuiebre) {
      const n = (x: number) => x.toLocaleString('es-CL', { maximumFractionDigits: 1 });
      add({
        clave: `quiebre:${p.id}`, tipo: 'advertencia', categoria: 'inventario', origen: 'sistema', seccion: 'aviso', icono: 'trending_down',
        titulo: `${p.nombre} se agota en ~${n(q.dias)} día${q.dias === 1 ? '' : 's'}`,
        detalle: `Quedan ${n(q.stock)} ${q.unidad}; vendes ${n(q.consumoDiario)} ${q.unidad} al día (últimos 30 días).`, entidad,
        acciones: [{ etiqueta: 'Reponer', url: urlProducto(p.id, 'reponer') }],
      });
    }
    const lotesVivos = (d.lotes ?? []).filter(l => l.productoId === p.id && l.cantidadRestante > 0);
    for (const l of lotesVivos) {
      if (!l.vencimiento) continue;
      const dias = diasEntre(hoy, l.vencimiento);
      if (dias > c.diasLoteVence) continue;
      add({
        clave: `lote-vence:${l.id}`, tipo: dias < 0 ? 'critica' : 'advertencia', categoria: 'inventario', origen: 'sistema', seccion: dias < 0 ? 'accion' : 'vencimiento',
        icono: 'event', venceEn: l.vencimiento, entidad: { tipo: 'lote', id: l.id },
        titulo: dias < 0 ? `Venció un lote de ${p.nombre}` : `Lote de ${p.nombre} vence ${enDias(dias)}`,
        detalle: `${formatCantidad(l.cantidadRestante, p.unidadBase)} del lote del ${formatFecha(l.fecha)} (vence el ${formatFecha(l.vencimiento)}).`,
        acciones: [{ etiqueta: 'Registrar merma', url: urlProducto(p.id, 'merma') }, { etiqueta: 'Ver ficha', url: urlProducto(p.id) }],
      });
    }
    if (p.perecible && lotesVivos.length) {
      const masAntiguo = [...lotesVivos].sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
      const ultimaVenta = movInv.filter(m => m.productoId === p.id && m.tipo === 'salida' && !m.revertido).map(m => m.fecha.slice(0, 10)).sort().pop();
      const sinVender = diasEntre(ultimaVenta ?? masAntiguo.fecha, hoy);
      if (diasEntre(masAntiguo.fecha, hoy) >= c.diasSinRotar && sinVender >= c.diasSinRotar) {
        add({
          clave: `sin-rotar:${p.id}`, tipo: 'info', categoria: 'inventario', origen: 'sistema', seccion: 'aviso', icono: 'hourglass_bottom', entidad,
          titulo: `${p.nombre} no rota hace ${sinVender} días`,
          detalle: `Hay ${formatCantidad(stockDisponible(p, envases), p.unidadBase)} y el lote más antiguo es del ${formatFecha(masAntiguo.fecha)}. Considera una promoción.`,
          acciones: [{ etiqueta: 'Ver ficha', url: urlProducto(p.id) }, { etiqueta: 'Crear promoción', url: '/erp/promociones' }],
        });
      }
    }
  }

  // 2. Cobros y pagos: vencidos (uno agrupado, con la más antigua), por vencer (uno por documento).
  const { resumen, pendientesCobrar, pendientesPagar } = d.saldos;
  const peorCobro = pendientesCobrar.filter(x => x.diasAtraso > 0).sort((a, b) => b.diasAtraso - a.diasAtraso)[0];
  if (resumen.ventasVencidas > 0 && peorCobro) {
    add({
      clave: 'cxc-vencidas', tipo: 'critica', categoria: 'cobros', origen: 'sistema', seccion: 'accion', icono: 'event_busy',
      titulo: `${resumen.ventasVencidas.toLocaleString('es-CL')} venta${resumen.ventasVencidas === 1 ? '' : 's'} vencida${resumen.ventasVencidas === 1 ? '' : 's'} sin cobrar`,
      detalle: `${formatCLP(resumen.vencidoCobrar)} atrasados. La más antigua: ${peorCobro.contraparte} (${peorCobro.numero}), ${peorCobro.diasAtraso} días de atraso.`,
      entidad: { tipo: 'venta', id: peorCobro.id },
      acciones: [{ etiqueta: 'Cobrar', url: `/erp/cobrar?venta=${encodeURIComponent(peorCobro.id)}` }, { etiqueta: 'Ver todas', url: '/erp/cobrar' }],
    });
  }
  for (const x of pendientesCobrar) {
    if (!x.fechaVencimiento || x.diasAtraso > 0) continue;
    const dias = diasEntre(hoy, x.fechaVencimiento);
    if (dias < 0 || dias > c.diasCobros) continue;
    add({
      clave: `cxc-vence:${x.id}`, tipo: 'advertencia', categoria: 'cobros', origen: 'sistema', seccion: 'vencimiento', icono: 'request_quote',
      venceEn: x.fechaVencimiento, entidad: { tipo: 'venta', id: x.id },
      titulo: `Cobro a ${x.contraparte} vence ${enDias(dias)}`, detalle: `${x.numero}: saldo ${formatCLP(x.saldo)}.`,
      acciones: [{ etiqueta: 'Cobrar', url: `/erp/cobrar?venta=${encodeURIComponent(x.id)}` }],
    });
  }
  const peorPago = pendientesPagar.filter(x => x.diasAtraso > 0).sort((a, b) => b.diasAtraso - a.diasAtraso)[0];
  if (resumen.comprasVencidas > 0 && peorPago) {
    add({
      clave: 'cxp-vencidas', tipo: 'critica', categoria: 'pagos', origen: 'sistema', seccion: 'accion', icono: 'payments',
      titulo: `${resumen.comprasVencidas.toLocaleString('es-CL')} pago${resumen.comprasVencidas === 1 ? '' : 's'} a proveedores vencido${resumen.comprasVencidas === 1 ? '' : 's'}`,
      detalle: `${formatCLP(resumen.vencidoPagar)} atrasados. El más antiguo: ${peorPago.contraparte} (${peorPago.numero}), venció el ${formatFecha(peorPago.fechaVencimiento)}.`,
      entidad: { tipo: 'gasto', id: peorPago.id },
      acciones: [{ etiqueta: 'Pagar', url: `/erp/pagar?gasto=${encodeURIComponent(peorPago.id)}` }, { etiqueta: 'Ver todos', url: '/erp/pagar' }],
    });
  }
  for (const x of pendientesPagar) {
    if (!x.fechaVencimiento || x.diasAtraso > 0) continue;
    const dias = diasEntre(hoy, x.fechaVencimiento);
    if (dias < 0 || dias > c.diasPagos) continue;
    add({
      clave: `cxp-vence:${x.id}`, tipo: 'advertencia', categoria: 'pagos', origen: 'sistema', seccion: 'vencimiento', icono: 'receipt_long',
      venceEn: x.fechaVencimiento, entidad: { tipo: 'gasto', id: x.id },
      titulo: `Pago a ${x.contraparte} vence ${enDias(dias)}`, detalle: `${x.numero}: saldo ${formatCLP(x.saldo)}.`,
      acciones: [{ etiqueta: 'Pagar', url: `/erp/pagar?gasto=${encodeURIComponent(x.id)}` }],
    });
  }

  // 3. Tributario: documentos con problemas, F29 y sueldos.
  const conProblema = d.documentosTributarios.filter(x => x.estado === 'rechazado_sii' || x.estado === 'observado');
  if (conProblema.length > 0) {
    add({
      clave: 'docs-sii', tipo: conProblema.some(x => x.estado === 'rechazado_sii') ? 'critica' : 'advertencia', categoria: 'tributario', origen: 'sii', seccion: 'accion', icono: 'receipt_long',
      titulo: `${conProblema.length} documento${conProblema.length === 1 ? '' : 's'} observado${conProblema.length === 1 ? '' : 's'} o rechazado${conProblema.length === 1 ? '' : 's'}`,
      detalle: 'Revísalos antes de cerrar tu IVA del mes.', acciones: [{ etiqueta: 'Preparar F29', url: '/erp/iva-mensual' }],
    });
  }
  const [y, m] = hoy.slice(0, 7).split('-').map(Number);
  const periodoAnterior = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`;
  const venceF29 = vencimientoF29(periodoAnterior);
  const faltan = diasEntre(hoy, venceF29);
  if (faltan >= 0 && faltan <= c.diasF29) {
    add({
      clave: `f29:${periodoAnterior}`, tipo: 'tributaria', categoria: 'tributario', origen: 'sii', seccion: 'vencimiento', icono: 'account_balance', venceEn: venceF29,
      titulo: faltan === 0 ? 'Hoy vence tu F29' : `Tu F29 vence ${enDias(faltan)}`,
      detalle: `IVA de ${periodoAnterior}: vence el ${formatFecha(venceF29)} (día 20 con facturación electrónica; 12 si no). Valida con tu contador.`,
      acciones: [{ etiqueta: 'Ver IVA mensual', url: '/erp/iva-mensual' }],
    });
  }
  if (Number(hoy.slice(8, 10)) <= 5) {
    add({
      clave: `sueldos:${hoy.slice(0, 7)}`, tipo: 'tributaria', categoria: 'tributario', origen: 'sistema', seccion: 'vencimiento', icono: 'badge', venceEn: `${hoy.slice(0, 7)}-05`,
      titulo: 'Paga sueldos antes del día 5',
      detalle: 'Plazo del Código del Trabajo. Las cotizaciones AFP y salud vencen el día 10 (13 si pagas en línea).',
      acciones: [{ etiqueta: 'Ver por pagar', url: '/erp/pagar' }],
    });
  }

  // 4. Ventas: pagos POS sin venta y promociones por terminar.
  const posSinVenta = d.pagosPOS.filter(p => p.estadoConciliacion === 'sin_venta');
  if (posSinVenta.length > 0) {
    add({
      clave: 'pos-sin-venta', tipo: 'advertencia', categoria: 'ventas', origen: 'sistema', seccion: 'accion', icono: 'point_of_sale',
      titulo: `${posSinVenta.length} pago${posSinVenta.length === 1 ? '' : 's'} POS sin venta`,
      detalle: 'Concílialos para que caja, ventas e IVA cuadren.', acciones: [{ etiqueta: 'Ir a Ventas', url: '/erp/ventas' }],
    });
  }
  for (const p of d.promociones) {
    if (p.estado !== 'activa' || !p.fechaFin || p.fechaFin < hoy) continue;
    const dias = diasEntre(hoy, p.fechaFin);
    if (dias <= 3) {
      add({
        clave: `promo:${p.id}`, tipo: 'info', categoria: 'ventas', origen: 'sistema', seccion: 'vencimiento', icono: 'local_fire_department', venceEn: p.fechaFin,
        entidad: { tipo: 'promocion', id: p.id },
        titulo: `La promoción «${p.nombre}» termina ${enDias(dias)}`, detalle: `Vigente hasta el ${formatFecha(p.fechaFin)}.`,
        acciones: [{ etiqueta: 'Ver promociones', url: '/erp/promociones' }],
      });
    }
  }

  // 5. Caja: flujo del mes positivo (alerta positiva, se puede ocultar).
  if (c.mostrarPositivas) {
    let ingresos = 0;
    let egresos = 0;
    for (const mv of d.movimientos) {
      if ((mv.fecha ?? '').slice(0, 7) !== hoy.slice(0, 7)) continue;
      if (mv.tipo === 'Ingreso') ingresos += mv.monto; else egresos += mv.monto;
    }
    if (ingresos > egresos && ingresos > 0) {
      add({
        clave: `flujo-positivo:${hoy.slice(0, 7)}`, tipo: 'exito', categoria: 'caja', origen: 'sistema', seccion: 'aviso', icono: 'trending_up',
        titulo: 'Tu flujo de caja de este mes es positivo', detalle: `Ingresaste ${formatCLP(ingresos)} y pagaste ${formatCLP(egresos)}.`,
        acciones: [{ etiqueta: 'Ver caja', url: '/erp/caja' }],
      });
    }
  }
  return items;
}

// ── Eventos y estados persistidos ─────────────────────────────────────────

const DIAS_HISTORIAL = 90;
const EVENTO: Record<EventoInventario['tipo'], { tipo: TipoAlerta; categoria: CategoriaAlerta; icono: string }> = {
  apertura_automatica: { tipo: 'info', categoria: 'inventario', icono: 'water_drop' },
  venta_bloqueada: { tipo: 'advertencia', categoria: 'ventas', icono: 'block' },
  remanente_sin_uso: { tipo: 'info', categoria: 'inventario', icono: 'opacity' },
  merma_registrada: { tipo: 'info', categoria: 'inventario', icono: 'delete_sweep' },
  revision_unidades: { tipo: 'advertencia', categoria: 'inventario', icono: 'rule' },
  conversion_realizada: { tipo: 'exito', categoria: 'inventario', icono: 'published_with_changes' },
};

/**
 * Agrega eventos. Misma clave el mismo día (venta bloqueada repetida) suma «veces» y vuelve a
 * «nueva»; los de clave única (apertura de F4) no se duplican.
 */
export function registrarEventos(filas: Notificacion[], eventos: EventoInventario[], ahora: string, nuevoId: () => string): Notificacion[] {
  if (eventos.length === 0) return filas;
  let lista = filas;
  for (const e of eventos) {
    const meta = EVENTO[e.tipo];
    const previa = lista.find(f => f.clase === 'evento' && f.clave === e.clave);
    if (previa) {
      if (e.tipo !== 'venta_bloqueada') continue;
      lista = lista.map(f => (f === previa ? { ...f, veces: (f.veces ?? 1) + 1, estado: 'nueva', detalle: e.detalle, actualizadaEn: ahora } : f));
      continue;
    }
    lista = [{
      id: nuevoId(), clase: 'evento', clave: e.clave, estado: 'nueva', creadaEn: ahora, actualizadaEn: ahora,
      titulo: e.titulo, detalle: e.detalle, evento: e.tipo, categoria: meta.categoria, tipoAlerta: meta.tipo, productoId: e.productoId,
    }, ...lista];
  }
  return lista;
}

/**
 * Sincroniza las filas de estado con las condiciones vigentes:
 * - condición nueva → fila «nueva» con su fecha de aparición;
 * - condición que desapareció → `resueltaEn` (sale de las activas, queda en «Resueltas»);
 * - condición resuelta que reaparece → vuelve a «nueva».
 * Además poda lo que tenga más de 90 días. Devuelve el MISMO arreglo si no cambió nada.
 */
export function sincronizarCondiciones(condiciones: Alerta[], filas: Notificacion[], ahora: string): Notificacion[] {
  const vigentes = new Map(condiciones.map(c => [c.clave, c]));
  const limite = new Date(new Date(ahora).getTime() - DIAS_HISTORIAL * 86400000).toISOString();
  let cambio = false;
  const vistas = new Set<string>();
  const salida: Notificacion[] = [];
  for (const f of filas) {
    if ((f.clase === 'evento' && f.creadaEn < limite) || (f.resueltaEn && f.resueltaEn < limite)) { cambio = true; continue; }
    if (f.clase !== 'estado') { salida.push(f); continue; }
    vistas.add(f.clave);
    const c = vigentes.get(f.clave);
    if (c && f.resueltaEn) {
      cambio = true;
      salida.push({ id: f.id, clase: 'estado', clave: f.clave, estado: 'nueva', creadaEn: ahora, actualizadaEn: ahora, titulo: c.titulo, categoria: c.categoria, tipoAlerta: c.tipo });
    } else if (!c && !f.resueltaEn) {
      cambio = true;
      salida.push({ ...f, resueltaEn: ahora, actualizadaEn: ahora });
    } else {
      salida.push(f);
    }
  }
  for (const c of condiciones) {
    if (vistas.has(c.clave)) continue;
    cambio = true;
    salida.push({ id: `estado:${c.clave}`, clase: 'estado', clave: c.clave, estado: 'nueva', creadaEn: ahora, actualizadaEn: ahora, titulo: c.titulo, categoria: c.categoria, tipoAlerta: c.tipo });
  }
  return cambio ? salida : filas;
}

/** Marca una o varias alertas (por clave). Pospuesta requiere `hasta` (ISO). */
export function marcarAlertas(filas: Notificacion[], claves: string[], estado: EstadoAlerta, ahora: string, hasta?: string): Notificacion[] {
  const objetivo = new Set(claves);
  const tocadas = new Set<string>();
  const lista = filas.map(f => {
    if (!objetivo.has(f.clave) || f.resueltaEn) return f;
    tocadas.add(f.clave);
    return { ...f, estado, actualizadaEn: ahora, ...(estado === 'pospuesta' ? { pospuestaHasta: hasta } : { pospuestaHasta: undefined }) };
  });
  // Condiciones aún sin fila (recién aparecidas): se crea su fila con el estado elegido.
  const faltan = claves.filter(c => !tocadas.has(c) && !filas.some(f => f.clave === c));
  return [...lista, ...faltan.map(clave => ({
    id: `estado:${clave}`, clase: 'estado' as const, clave, estado, creadaEn: ahora, actualizadaEn: ahora,
    ...(estado === 'pospuesta' ? { pospuestaHasta: hasta } : {}),
  }))];
}

/** Aplica a las condiciones su estado guardado (pospuesta que ya venció vuelve a «nueva»). */
function aplicarEstado(a: Alerta, fila: Notificacion | undefined, ahora: string): Alerta {
  if (!fila || fila.resueltaEn) return a;
  let estado: EstadoAlerta = fila.estado === 'descartada' && a.naturaleza === 'condicion' ? 'vista' : fila.estado;
  if (estado === 'pospuesta' && (!fila.pospuestaHasta || fila.pospuestaHasta <= ahora)) estado = 'nueva';
  return { ...a, estado, creadaEn: fila.creadaEn ?? a.creadaEn, ...(estado === 'pospuesta' ? { pospuestaHasta: fila.pospuestaHasta } : {}) };
}

/** Eventos persistidos → alertas de «Actividad reciente». */
export function alertasDeEventos(filas: Notificacion[], ahora: string): Alerta[] {
  return filas.filter(f => f.clase === 'evento').map(f => {
    const meta = EVENTO[f.evento as EventoInventario['tipo']] ?? { tipo: f.tipoAlerta ?? 'info', categoria: f.categoria ?? 'sistema', icono: 'notifications' };
    const acciones: AccionAlerta[] = f.productoId ? [{ etiqueta: f.evento === 'remanente_sin_uso' ? 'Registrar merma' : 'Ver ficha', url: urlProducto(f.productoId, f.evento === 'remanente_sin_uso' ? 'merma' : undefined) }] : [];
    const base: Alerta = {
      id: f.id, clave: f.clave, tipo: meta.tipo, categoria: meta.categoria, origen: 'sistema', naturaleza: 'evento', seccion: 'actividad',
      titulo: f.titulo ?? '', detalle: f.detalle ?? '', icono: meta.icono, creadaEn: f.actualizadaEn ?? f.creadaEn,
      ...(f.productoId ? { entidad: { tipo: 'producto' as const, id: f.productoId } } : {}),
      acciones, estado: f.estado, veces: f.veces, accion_label: acciones[0]?.etiqueta, accion_url: acciones[0]?.url,
    };
    return aplicarEstado(base, f, ahora);
  });
}

/** Más de un producto con stock bajo → UNA tarjeta «5 productos con stock bajo», expandible. */
export function agruparStockBajo(alertas: Alerta[]): Alerta[] {
  const bajos = alertas.filter(a => a.clave.startsWith('stock-bajo:'));
  if (bajos.length <= 1) return alertas;
  const activos = bajos.filter(a => a.estado !== 'pospuesta');
  const estado: EstadoAlerta = activos.some(a => a.estado === 'nueva') ? 'nueva' : activos.length === 0 ? 'pospuesta' : 'vista';
  const grupo: Alerta = {
    ...bajos[0], id: 'stock-bajo', clave: 'stock-bajo', grupo: bajos, estado, entidad: undefined,
    titulo: `${bajos.length} productos con stock bajo`,
    detalle: bajos.slice(0, 3).map(a => a.entidad ? a.titulo.replace(/^Stock bajo: /, '') : a.titulo).join(', ') + (bajos.length > 3 ? ` y ${bajos.length - 3} más` : ''),
    creadaEn: bajos.map(a => a.creadaEn).sort().pop() ?? bajos[0].creadaEn,
    acciones: [{ etiqueta: 'Ver inventario', url: '/erp/inventario?filtro=bajo' }],
    accion_label: 'Ver inventario', accion_url: '/erp/inventario?filtro=bajo',
  };
  const primera = alertas.indexOf(bajos[0]);
  const resto = alertas.filter(a => !a.clave.startsWith('stock-bajo:'));
  resto.splice(Math.min(primera, resto.length), 0, grupo);
  return resto;
}

/** Condiciones resueltas (para la sección colapsada «Resueltas»), las más recientes primero. */
export function alertasResueltas(filas: Notificacion[]): Alerta[] {
  return filas.filter(f => f.clase === 'estado' && f.resueltaEn).sort((a, b) => (b.resueltaEn ?? '').localeCompare(a.resueltaEn ?? '')).slice(0, 30).map(f => ({
    id: f.id, clave: f.clave, tipo: f.tipoAlerta ?? 'info', categoria: f.categoria ?? 'sistema', origen: 'sistema' as const, naturaleza: 'condicion' as const,
    seccion: 'aviso' as const, titulo: f.titulo ?? f.clave, detalle: 'Se resolvió sola.', icono: 'task_alt', creadaEn: f.creadaEn, resueltaEn: f.resueltaEn,
    acciones: [], estado: 'vista' as const,
  }));
}

/**
 * Lista final para pantallas: condiciones (con su estado guardado y filtradas por la
 * configuración) + eventos, con el stock bajo agrupado. Ordenada por severidad y fecha.
 */
export function construirAlertas(condiciones: Alerta[], filas: Notificacion[], ahora: string, config?: ConfigAlertas): Alerta[] {
  const c = cfg(config);
  const porClave = new Map(filas.filter(f => f.clase === 'estado').map(f => [f.clave, f]));
  const activa = (a: Alerta) => c.categorias[a.categoria] !== false;
  const lista = [
    ...condiciones.filter(activa).map(a => aplicarEstado(a, porClave.get(a.clave), ahora)),
    ...alertasDeEventos(filas, ahora).filter(activa),
  ].sort((a, b) => PESO[a.tipo] - PESO[b.tipo] || b.creadaEn.localeCompare(a.creadaEn));
  return agruparStockBajo(lista);
}

/** Lo que cuenta la campana: alertas NUEVAS críticas, tributarias o de aviso (no info ni positivas). */
export const cuentaCampana = (alertas: Alerta[]) =>
  alertas.filter(a => a.estado === 'nueva' && (a.tipo === 'critica' || a.tipo === 'advertencia' || a.tipo === 'tributaria')).length;

/** Visibles (no pospuestas ni descartadas). */
export const visibles = (alertas: Alerta[]) => alertas.filter(a => a.estado === 'nueva' || a.estado === 'vista');

/**
 * Compatibilidad: condiciones + agrupación, sin estados persistidos (Dashboard antiguo y pruebas).
 */
export function calcularAlertas(d: DatosAlertas): Alerta[] {
  return construirAlertas(calcularCondiciones(d), [], new Date().toISOString(), d.config);
}

/** «hace 5 min», «hace 3 h», «ayer», «12-11-2026». */
export function horaRelativa(iso: string, ahora = new Date()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const min = Math.round((ahora.getTime() - t) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return 'ayer';
  if (d < 7) return `hace ${d} días`;
  return formatFecha(iso.slice(0, 10));
}
