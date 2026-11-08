import { stockDisponible } from '../../1.-ERP/services/inventarioFraccionado';
import { Fragment, useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { useERP, type Gasto, type Venta } from '../../1.-ERP/context/ERPContext';
import { useAuth } from '../../context/AuthContext';
import SelectorDesplegable, { type OpcionDesplegable } from '../../components/SelectorDesplegable';
import SelectorFecha from '../../1.-ERP/components/SelectorFecha';
import { DOCUMENT_LABELS, normalizeDocumentType } from '../../1.-ERP/services/documentCompliance';
import { formatCLP, formatFecha, hoyISO, isoLocal, nombrePeriodo, nombrePeriodoCorto, periodoActual, rangoUltimosMeses } from '../../lib/fechas';
import { agruparSerie, nombreRango, rangoAnterior, totalesPor, NOMBRE_GRANULARIDAD, type RangoFechas } from '../../lib/series';
import { cn } from '../../lib/utils';
import GraficoSerie from '../../components/graficos/GraficoSerie';
import GraficoDona from '../../components/graficos/GraficoDona';
import GraficoBarras from '../../components/graficos/GraficoBarras';
import { METODO_PAGO, TarjetaGrafico } from '../../components/graficos/comunes';
import { usePaletaGraficos } from '../../components/graficos/paleta';

type Modo = 'mes' | 'trimestre' | 'anio' | 'rango';
const MODOS: Array<{ valor: Modo; etiqueta: string }> = [
  { valor: 'mes', etiqueta: 'Mes' },
  { valor: 'trimestre', etiqueta: 'Trimestre' },
  { valor: 'anio', etiqueta: 'Año' },
  { valor: 'rango', etiqueta: 'Rango' },
];

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
const mesCorto = (periodo: string) => nombrePeriodoCorto(periodo).split(' ')[0];
const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString('es-CL')} ${n === 1 ? uno : varios}`;
const fmtPct = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`);
const claveTrimestre = (periodo: string) => `${periodo.slice(0, 4)}-T${Math.floor((Number(periodo.slice(5, 7)) - 1) / 3) + 1}`;

function rangoDeMes(periodo: string): RangoFechas {
  const [y, m] = periodo.split('-').map(Number);
  return { inicio: isoLocal(new Date(y, m - 1, 1)), fin: isoLocal(new Date(y, m, 0)) };
}

function rangoDeTrimestre(clave: string): RangoFechas {
  const [y, t] = clave.split('-T').map(Number);
  return { inicio: isoLocal(new Date(y, (t - 1) * 3, 1)), fin: isoLocal(new Date(y, t * 3, 0)) };
}

const nombreTrimestre = (clave: string) => {
  const { inicio, fin } = rangoDeTrimestre(clave);
  return `T${clave.slice(-1)} ${clave.slice(0, 4)} · ${mesCorto(inicio.slice(0, 7))} a ${mesCorto(fin.slice(0, 7))}`;
};

/** Totales de un periodo en una sola pasada (10k+ registros sin O(n²)). */
function resumir(ventas: Venta[], gastos: Gasto[]) {
  let ingresos = 0, netos = 0, costo = 0, egresos = 0;
  for (const v of ventas) {
    ingresos += v.monto || 0;
    netos += v.subtotal || (v.monto || 0) - (v.iva || 0);
    for (const p of v.productos ?? []) costo += (p.costoUnitario || 0) * (p.cantidad || 0);
  }
  for (const g of gastos) egresos += g.monto || 0;
  return {
    ingresos, egresos, neto: ingresos - egresos, margen: netos - costo,
    margenPct: netos > 0 ? ((netos - costo) / netos) * 100 : null,
    ticket: ventas.length ? ingresos / ventas.length : null,
    nVentas: ventas.length, nGastos: gastos.length,
  };
}

/** Variación contra el periodo anterior: % (o puntos porcentuales para márgenes). */
function variacion(actual: number | null, anterior: number | null, puntos = false): { delta: number | null; texto: string } {
  if (actual == null || anterior == null) return { delta: null, texto: 'sin comparación' };
  if (!puntos && !anterior) return { delta: null, texto: actual ? 'sin datos previos' : 'sin cambio' };
  const delta = puntos ? actual - anterior : ((actual - anterior) / Math.abs(anterior)) * 100;
  const n = Math.abs(delta).toLocaleString('es-CL', { maximumFractionDigits: 1 });
  return { delta, texto: `${delta > 0 ? '+' : delta < 0 ? '-' : ''}${n}${puntos ? ' pp' : '%'}` };
}

function Variacion({ v, invertir }: { v: { delta: number | null; texto: string }; invertir?: boolean }) {
  if (v.delta == null || Math.abs(v.delta) < 0.05) return <span className="text-on-surface-variant">{v.delta == null ? v.texto : '= sin cambio'}</span>;
  const sube = v.delta > 0;
  return (
    <span className={cn('font-bold', sube !== Boolean(invertir) ? 'text-success' : 'text-error')}>
      {sube ? '▲' : '▼'} {v.texto.replace(/^[+-]/, '')}
    </span>
  );
}

function Kpi({ titulo, icono, valor, pie, detalle, negativo }: {
  titulo: string; icono: string; valor: string; pie?: ReactNode; detalle?: string; negativo?: boolean;
}) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-4 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant truncate">{titulo}</p>
        <span className="material-symbols-outlined text-base text-outline">{icono}</span>
      </div>
      <p className={cn('text-xl font-black mt-1 tabular-nums truncate', negativo ? 'text-error' : 'text-on-surface')} title={valor}>{valor}</p>
      {pie && <p className="text-[11px] mt-1 truncate">{pie}</p>}
      {detalle && <p className="text-[11px] text-on-surface-variant mt-0.5 truncate" title={detalle}>{detalle}</p>}
    </div>
  );
}

export default function ERPReportes() {
  const { ventas, gastos, inventario, abonos, documentosTributarios, saldos, getF29Preparador, movimientosInventario, envases } = useERP();
  const { perfil } = useAuth();
  const paleta = usePaletaGraficos();

  /* ══ Periodo: mes, trimestre, año o rango libre. Lo elegido es exactamente lo consultado ══ */
  const [modo, setModo] = useState<Modo>('mes');
  const [mes, setMes] = useState(periodoActual);
  const [trimestre, setTrimestre] = useState(() => claveTrimestre(periodoActual()));
  const [anio, setAnio] = useState(() => periodoActual().slice(0, 4));
  const [rangoManual, setRangoManual] = useState<RangoFechas>(() => rangoUltimosMeses(3));

  const mesesConDatos: Set<string> = useMemo(() => {
    const set = new Set<string>();
    for (const r of ventas) set.add((r.fecha ?? '').slice(0, 7));
    for (const r of gastos) set.add((r.fecha ?? '').slice(0, 7));
    return new Set([...set].filter(p => /^\d{4}-\d{2}$/.test(p)));
  }, [ventas, gastos]);

  /** Mes actual + últimos 24 + cualquier mes con datos (y siempre el elegido). */
  const { opcionesMes, opcionesTrimestre, opcionesAnio } = useMemo(() => {
    const meses = new Set(mesesConDatos);
    const hoy = new Date();
    for (let i = 0; i <= 24; i++) meses.add(isoLocal(new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)).slice(0, 7));
    meses.add(mes);
    const orden = [...meses].sort().reverse();
    const trimestres = [...new Set([...orden.map(claveTrimestre), trimestre])].sort().reverse();
    const anios = [...new Set([...orden.map(p => p.slice(0, 4)), anio])].sort().reverse();
    const conDatos = (ok: boolean) => (ok ? undefined : 'Sin movimientos');
    return {
      opcionesMes: orden.map<OpcionDesplegable>(p => ({ valor: p, etiqueta: nombrePeriodo(p), descripcion: conDatos(mesesConDatos.has(p)) })),
      opcionesTrimestre: trimestres.map<OpcionDesplegable>(t => ({ valor: t, etiqueta: nombreTrimestre(t) })),
      opcionesAnio: anios.map<OpcionDesplegable>(a => ({ valor: a, etiqueta: a })),
    };
  }, [mesesConDatos, mes, trimestre, anio]);

  const rangoElegido = useMemo<RangoFechas>(() => {
    if (modo === 'mes') return rangoDeMes(mes);
    if (modo === 'trimestre') return rangoDeTrimestre(trimestre);
    if (modo === 'anio') return { inicio: `${anio}-01-01`, fin: `${anio}-12-31` };
    const inicio = rangoManual.inicio || rangoManual.fin || hoyISO();
    const fin = rangoManual.fin || rangoManual.inicio || hoyISO();
    return inicio <= fin ? { inicio, fin } : { inicio: fin, fin: inicio };
  }, [modo, mes, trimestre, anio, rangoManual]);

  // El cálculo pesado sigue al rango diferido: el selector responde al instante.
  const rango = useDeferredValue(rangoElegido);
  const actualizando = rango !== rangoElegido;
  const anterior = useMemo(() => rangoAnterior(rango), [rango]);
  const etiquetaRango = nombreRango(rango);
  const etiquetaAnterior = nombreRango(anterior);
  const enCurso = rango.inicio <= hoyISO() && rango.fin > hoyISO();

  /* ══ Filtrado único: periodo y periodo anterior en la misma pasada ══ */
  const datos = useMemo(() => {
    const ventasP: Venta[] = [], ventasA: Venta[] = [], gastosP: Gasto[] = [], gastosA: Gasto[] = [];
    const ubicar = <T,>(fecha: string | undefined, r: T, p: T[], a: T[]) => {
      const f = (fecha ?? '').slice(0, 10);
      if (f >= rango.inicio && f <= rango.fin) p.push(r);
      else if (f >= anterior.inicio && f <= anterior.fin) a.push(r);
    };
    for (const v of ventas) ubicar(v.fecha, v, ventasP, ventasA);
    for (const g of gastos) ubicar(g.fecha, g, gastosP, gastosA);
    let cobrado = 0, pagado = 0;
    const abonosP = abonos.filter(a => {
      const f = (a.fecha ?? '').slice(0, 10);
      if (f < rango.inicio || f > rango.fin) return false;
      if (a.tipo === 'cobro') cobrado += a.monto_abono ?? a.monto; else pagado += a.monto_abono ?? a.monto;
      return true;
    });
    // Mermas valorizadas al costo de los lotes consumidos: van a gasto, no a costo de venta.
    let mermas = 0, nMermas = 0;
    for (const m of movimientosInventario) {
      if (m.tipo !== 'merma') continue;
      const f = (m.fecha ?? '').slice(0, 10);
      if (f < rango.inicio || f > rango.fin) continue;
      mermas += Math.abs(m.cantidad) * (m.costoUnitario ?? 0);
      nMermas++;
    }
    return { ventasP, ventasA, gastosP, gastosA, abonosP, cobrado, pagado, mermas: Math.round(mermas), nMermas };
  }, [ventas, gastos, abonos, movimientosInventario, rango, anterior]);
  const { ventasP, gastosP, abonosP, cobrado, pagado, mermas, nMermas } = datos;

  const actual = useMemo(() => resumir(datos.ventasP, datos.gastosP), [datos]);
  const previo = useMemo(() => resumir(datos.ventasA, datos.gastosA), [datos]);
  const { resumen } = saldos;

  /* ══ Series: granularidad automática según el largo del rango (nunca > ~35 tramos) ══ */
  const movimientos = useMemo<Array<Venta | Gasto>>(() => [...ventasP, ...gastosP], [ventasP, gastosP]);

  const flujo = useMemo(() => {
    const s = agruparSerie(movimientos, rango, x => x.fecha,
      x => ('productos' in x ? { ingresos: x.monto || 0, egresos: 0 } : { ingresos: 0, egresos: x.monto || 0 }));
    let saldo = 0;
    return {
      ...s,
      puntos: s.puntos.map(p => {
        const neto = p.ingresos - p.egresos;
        saldo += neto;
        return { ...p, neto, saldo };
      }),
    };
  }, [movimientos, rango]);

  const resumenMensual = useMemo(() => {
    const s = agruparSerie(movimientos, rango, x => x.fecha, x => {
      if (!('productos' in x)) return { ingresos: 0, netos: 0, costo: 0, ventas: 0, egresos: x.monto || 0 };
      let costo = 0;
      for (const p of x.productos ?? []) costo += (p.costoUnitario || 0) * (p.cantidad || 0);
      return { ingresos: x.monto || 0, netos: x.subtotal || (x.monto || 0) - (x.iva || 0), costo, ventas: 1, egresos: 0 };
    }, { granularidad: 'mes' });
    return s.puntos.map(p => ({
      periodo: p.clave.slice(0, 7),
      etiqueta: p.etiquetaLarga,
      ingresos: p.ingresos, egresos: p.egresos, neto: p.ingresos - p.egresos, ventas: p.ventas,
      margenPct: p.netos > 0 ? ((p.netos - p.costo) / p.netos) * 100 : null,
    }));
  }, [movimientos, rango]);
  const variosMeses = resumenMensual.length > 1;

  /* ══ Rankings y composición ══ */
  const categoriaProducto = useMemo(() => new Map(inventario.map(p => [p.id, p.categoria])), [inventario]);
  const ventasPorCategoria = useMemo(
    () => totalesPor(ventasP.flatMap(v => v.productos ?? []), p => p.categoria || categoriaProducto.get(p.productoId), p => p.total),
    [ventasP, categoriaProducto]
  );
  const gastosPorCategoria = useMemo(() => totalesPor(gastosP, g => g.categoria, g => g.monto), [gastosP]);
  const metodosPago = useMemo(
    () => totalesPor(ventasP, v => METODO_PAGO[v.metodo_pago ?? 'efectivo'] ?? v.metodo_pago, v => v.monto),
    [ventasP]
  );

  const topProductos = useMemo(() => {
    const mapa = new Map<string, { valor: number; cantidad: number }>();
    for (const v of ventasP) for (const p of v.productos ?? []) {
      const k = p.productoNombre?.trim() || 'Sin nombre';
      const a = mapa.get(k) ?? { valor: 0, cantidad: 0 };
      a.valor += p.total || 0;
      a.cantidad += p.cantidad || 0;
      mapa.set(k, a);
    }
    return Array.from(mapa, ([nombre, a]) => ({ nombre, valor: a.valor, cantidad: a.cantidad, detalle: plural(a.cantidad, 'unidad', 'unidades') }))
      .sort((a, b) => b.valor - a.valor);
  }, [ventasP]);

  const topClientes = useMemo(() => {
    const mapa = new Map<string, { valor: number; n: number }>();
    for (const v of ventasP) {
      const k = v.cliente?.trim() || 'Sin cliente';
      const a = mapa.get(k) ?? { valor: 0, n: 0 };
      a.valor += v.monto || 0;
      a.n += 1;
      mapa.set(k, a);
    }
    return Array.from(mapa, ([nombre, a]) => ({ nombre, valor: a.valor, n: a.n, detalle: plural(a.n, 'venta', 'ventas') }))
      .sort((a, b) => b.valor - a.valor);
  }, [ventasP]);

  /* ══ F29: es mensual, así que un rango de varios meses lleva una fila por mes ══ */
  const f29Meses = useMemo(
    () => resumenMensual.map(m => ({ etiqueta: nombrePeriodo(m.periodo), ...getF29Preparador(m.periodo) })),
    [resumenMensual, getF29Preparador]
  );
  const f29Total = useMemo(() => f29Meses.reduce((t, f) => ({
    ivaDebito: t.ivaDebito + f.ivaDebito, ivaCredito: t.ivaCredito + f.ivaCredito, ivaNotasCredito: t.ivaNotasCredito + f.ivaNotasCredito,
    diferenciaIva: t.diferenciaIva + f.diferenciaIva, ppm: t.ppm + f.ppm, totalEstimado: t.totalEstimado + f.totalEstimado,
    documentosPendientes: t.documentosPendientes + f.documentosPendientes, ventasPOSConciliadas: t.ventasPOSConciliadas + f.ventasPOSConciliadas,
  }), { ivaDebito: 0, ivaCredito: 0, ivaNotasCredito: 0, diferenciaIva: 0, ppm: 0, totalEstimado: 0, documentosPendientes: 0, ventasPOSConciliadas: 0 }), [f29Meses]);
  const alertasF29 = useMemo(
    () => f29Meses.flatMap(f => f.alertas.map(a => (variosMeses ? `${f.etiqueta}: ${a}` : a))),
    [f29Meses, variosMeses]
  );

  /* ══ Detalle: folio legible, nunca el id interno ══ */
  const folioPorDocumento = useMemo(
    () => new Map(documentosTributarios.map(d => [d.id, d.folioTributario || d.folioInterno])),
    [documentosTributarios]
  );
  const folio = (documentoId?: string, nota?: string) =>
    (documentoId && folioPorDocumento.get(documentoId))
    || nota?.match(/Folio masiva:\s*(.+)$/i)?.[1]?.trim()
    || (documentoId && !ES_UUID.test(documentoId) ? documentoId : '');
  const tipoDoc = (v: Venta) => DOCUMENT_LABELS[normalizeDocumentType(v.tipo_documento)] ?? 'Documento';

  const recientes = useMemo(() => ({
    ventas: [...ventasP].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 30),
    gastos: [...gastosP].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 30),
  }), [ventasP, gastosP]);

  // Stock real (con envases = suma de sus envases) × costo por unidad base.
  const valorInventario = useMemo(() => inventario.reduce((a, p) => a + (p.costo || 0) * stockDisponible(p, envases), 0), [inventario, envases]);
  const mayorTramo = useMemo(
    () => flujo.puntos.reduce<(typeof flujo.puntos)[number] | null>((m, p) => (p.ingresos > (m?.ingresos ?? 0) ? p : m), null),
    [flujo]
  );

  /* ══ Indicadores (pantalla y descargas comparten la misma lista) ══ */
  const indicadores = [
    { titulo: 'Ingresos', icono: 'trending_up', tipo: 'clp', a: actual.ingresos, b: previo.ingresos, valor: formatCLP(actual.ingresos), detalle: plural(actual.nVentas, 'venta', 'ventas') },
    { titulo: 'Egresos', icono: 'trending_down', tipo: 'clp', a: actual.egresos, b: previo.egresos, valor: formatCLP(actual.egresos), detalle: plural(actual.nGastos, 'gasto', 'gastos'), invertir: true },
    { titulo: 'Resultado neto', icono: 'account_balance', tipo: 'clp', a: actual.neto, b: previo.neto, valor: formatCLP(actual.neto), detalle: 'Ingresos − egresos', negativo: actual.neto < 0 },
    { titulo: 'Margen bruto', icono: 'percent', tipo: 'pct', a: actual.margenPct, b: previo.margenPct, valor: fmtPct(actual.margenPct), detalle: `${formatCLP(actual.margen)} sobre ventas netas` },
    { titulo: 'Ticket promedio', icono: 'receipt', tipo: 'clp', a: actual.ticket, b: previo.ticket, valor: actual.ticket == null ? '—' : formatCLP(actual.ticket), detalle: 'Ingreso por venta' },
    { titulo: 'N.º de ventas', icono: 'shopping_bag', tipo: 'n', a: actual.nVentas, b: previo.nVentas, valor: actual.nVentas.toLocaleString('es-CL'), detalle: `${previo.nVentas.toLocaleString('es-CL')} en el periodo anterior` },
  ].map(k => ({ ...k, v: variacion(k.a, k.b, k.tipo === 'pct') }));
  /** Valor de un indicador para las descargas, según su tipo. */
  const valorIndicador = (tipo: string, n: number | null) => (tipo === 'pct' ? fmtPct(n) : tipo === 'n' ? (n ?? 0).toLocaleString('es-CL') : n == null ? '—' : formatCLP(n));

  const textoCobrar = `${plural(resumen.ventasPorCobrar, 'venta', 'ventas')} sin cobrar${resumen.vencidoCobrar > 0 ? ` · ${formatCLP(resumen.vencidoCobrar)} vencido` : ''}`;
  const textoPagar = `${plural(resumen.comprasPorPagar, 'compra', 'compras')} sin pagar${resumen.vencidoPagar > 0 ? ` · ${formatCLP(resumen.vencidoPagar)} vencido` : ''}`;

  /* ══ Descargas ══ */
  const claveArchivo = modo === 'mes' ? mes : modo === 'trimestre' ? trimestre : modo === 'anio' ? anio : `${rango.inicio}_${rango.fin}`;

  const descargarExcel = async () => {
    const XLSX = await import('xlsx');
    const $ = (n: number | null) => (n == null ? '—' : { v: Math.round(n), t: 'n', z: '"$"#,##0' });
    const libro = XLSX.utils.book_new();
    const agregar = (nombre: string, filas: unknown[][]) => XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), nombre);

    agregar('Resumen', [
      ['Reporte', perfil?.negocio_nombre || 'Mi negocio'],
      ['Periodo', etiquetaRango, `${formatFecha(rango.inicio)} al ${formatFecha(rango.fin)}`],
      ['Comparado con', etiquetaAnterior, `${formatFecha(anterior.inicio)} al ${formatFecha(anterior.fin)}`],
      [],
      ['Indicador', 'Periodo', 'Periodo anterior', 'Variación'],
      ...indicadores.map(k => [k.titulo, ...[k.a, k.b].map(n => (k.tipo === 'clp' ? $(n) : k.tipo === 'pct' ? fmtPct(n) : n)), k.v.texto]),
      ['Cobrado en el periodo', $(cobrado)],
      ['Pagado en el periodo', $(pagado)],
      ['Mermas de inventario (gasto)', $(mermas)],
      [],
      ['Saldos a hoy (globales)', 'Monto', 'Detalle'],
      ['Por cobrar', $(resumen.porCobrar), textoCobrar],
      ['Por pagar', $(resumen.porPagar), textoPagar],
      ['Valor de inventario (a costo)', $(valorInventario)],
      [],
      ['IVA (F29) del periodo', 'Monto'],
      ['IVA débito', $(f29Total.ivaDebito)],
      ['IVA crédito', $(f29Total.ivaCredito)],
      ['Diferencia IVA a pagar', $(f29Total.diferenciaIva)],
      ['PPM estimado', $(f29Total.ppm)],
      ['Total estimado', $(f29Total.totalEstimado)],
    ]);
    if (variosMeses) {
      agregar('Resumen por mes', [
        ['Mes', 'Ingresos', 'Egresos', 'Neto', 'Margen bruto', 'N.º de ventas'],
        ...resumenMensual.map(m => [m.etiqueta, $(m.ingresos), $(m.egresos), $(m.neto), fmtPct(m.margenPct), m.ventas]),
        ['Total', $(actual.ingresos), $(actual.egresos), $(actual.neto), fmtPct(actual.margenPct), actual.nVentas],
      ]);
    }
    agregar('F29', [
      ['Mes', 'IVA débito', 'IVA crédito', 'Notas de crédito', 'Diferencia IVA', 'PPM', 'Total estimado', 'Documentos pendientes'],
      ...f29Meses.map(f => [f.etiqueta, $(f.ivaDebito), $(f.ivaCredito), $(f.ivaNotasCredito), $(f.diferenciaIva), $(f.ppm), $(f.totalEstimado), f.documentosPendientes]),
      ...(variosMeses ? [['Total', $(f29Total.ivaDebito), $(f29Total.ivaCredito), $(f29Total.ivaNotasCredito), $(f29Total.diferenciaIva), $(f29Total.ppm), $(f29Total.totalEstimado), f29Total.documentosPendientes]] : []),
    ]);
    agregar('Ventas', [
      ['Fecha', 'Folio', 'Documento', 'Cliente', 'Método de pago', 'Neto', 'IVA', 'Total', 'Estado'],
      ...ventasP.map(v => [formatFecha(v.fecha), folio(v.documento_id, v.nota), tipoDoc(v), v.cliente, METODO_PAGO[v.metodo_pago ?? ''] ?? '', $(v.subtotal ?? 0), $(v.iva ?? 0), $(v.monto), v.estado]),
    ]);
    agregar('Gastos', [
      ['Fecha', 'Folio', 'Proveedor', 'Categoría', 'Método de pago', 'Neto', 'IVA', 'Total', 'Estado'],
      ...gastosP.map(g => [formatFecha(g.fecha), folio(g.documento_id), g.proveedor, g.categoria, METODO_PAGO[g.metodo_pago ?? ''] ?? '', $(g.subtotal ?? 0), $(g.iva ?? 0), $(g.monto), g.estado]),
    ]);
    agregar('Cobros y pagos', [
      ['Fecha', 'Tipo', 'Cliente / proveedor', 'Método de pago', 'Monto'],
      ...abonosP.map(a => [formatFecha(a.fecha), a.tipo === 'cobro' ? 'Cobro' : 'Pago', a.cliente_proveedor ?? '', METODO_PAGO[a.metodo_pago] ?? a.metodo_pago, $(a.monto_abono ?? a.monto)]),
    ]);
    XLSX.writeFile(libro, `reporte-${claveArchivo}.xlsx`);
  };

  const descargarPdf = async () => {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const doc = new jsPDF();
    const ancho = doc.internal.pageSize.getWidth();
    const despues = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    const cabecera = { fillColor: [27, 48, 34] as [number, number, number], textColor: 255 };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(27, 48, 34);
    doc.text(perfil?.negocio_nombre || 'Mi negocio', 14, 18);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(`Reporte: ${etiquetaRango} (${formatFecha(rango.inicio)} al ${formatFecha(rango.fin)})`, 14, 25);
    doc.text(`Comparado con: ${etiquetaAnterior} · Generado el ${formatFecha(hoyISO())}`, 14, 30);
    if (perfil?.negocio_rut) doc.text(`RUT: ${perfil.negocio_rut}`, ancho - 14, 25, { align: 'right' });

    autoTable(doc, {
      startY: 36, headStyles: cabecera, styles: { fontSize: 9 },
      head: [['Indicador', 'Periodo', 'Anterior', 'Variación']],
      body: [
        ...indicadores.map(k => [k.titulo, k.valor, valorIndicador(k.tipo, k.b), k.v.texto]),
        ['Cobrado / pagado en el periodo', `${formatCLP(cobrado)} / ${formatCLP(pagado)}`, '', ''],
        ['Mayor venta en', mayorTramo ? `${mayorTramo.etiquetaLarga} (${formatCLP(mayorTramo.ingresos)})` : '—', '', ''],
      ],
    });
    autoTable(doc, {
      startY: despues(), headStyles: cabecera, styles: { fontSize: 9 },
      head: [['Saldos a hoy', 'Monto', 'Detalle']],
      body: [
        ['Por cobrar', formatCLP(resumen.porCobrar), textoCobrar],
        ['Por pagar', formatCLP(resumen.porPagar), textoPagar],
        ['Valor de inventario (a costo)', formatCLP(valorInventario), ''],
      ],
    });
    if (variosMeses) {
      autoTable(doc, {
        startY: despues(), headStyles: cabecera, styles: { fontSize: 8 },
        head: [['Mes', 'Ingresos', 'Egresos', 'Neto', 'Margen', 'Ventas']],
        body: resumenMensual.map(m => [m.etiqueta, formatCLP(m.ingresos), formatCLP(m.egresos), formatCLP(m.neto), fmtPct(m.margenPct), String(m.ventas)]),
        foot: [['Total', formatCLP(actual.ingresos), formatCLP(actual.egresos), formatCLP(actual.neto), fmtPct(actual.margenPct), String(actual.nVentas)]],
        footStyles: { fillColor: [235, 235, 235], textColor: 30 },
      });
    }
    autoTable(doc, {
      startY: despues(), headStyles: cabecera, styles: { fontSize: 9 },
      head: [['Productos más vendidos', 'Unidades', 'Total']],
      body: topProductos.slice(0, 10).map(p => [p.nombre, p.cantidad.toLocaleString('es-CL'), formatCLP(p.valor)]),
    });
    autoTable(doc, {
      startY: despues(), headStyles: cabecera, styles: { fontSize: 9 },
      head: [['Mejores clientes', 'Ventas', 'Total']],
      body: topClientes.slice(0, 10).map(c => [c.nombre, c.n.toLocaleString('es-CL'), formatCLP(c.valor)]),
    });
    autoTable(doc, {
      startY: despues(), headStyles: cabecera, styles: { fontSize: 8 },
      head: [['IVA mensual (F29)', 'IVA débito', 'IVA crédito', 'Diferencia', 'PPM', 'Total estimado']],
      body: f29Meses.map(f => [f.etiqueta, formatCLP(f.ivaDebito), formatCLP(f.ivaCredito), formatCLP(f.diferenciaIva), formatCLP(f.ppm), formatCLP(f.totalEstimado)]),
      foot: variosMeses ? [['Total', formatCLP(f29Total.ivaDebito), formatCLP(f29Total.ivaCredito), formatCLP(f29Total.diferenciaIva), formatCLP(f29Total.ppm), formatCLP(f29Total.totalEstimado)]] : undefined,
      footStyles: { fillColor: [235, 235, 235], textColor: 30 },
    });
    autoTable(doc, {
      startY: despues(), styles: { fontSize: 8, textColor: [90, 90, 90] }, theme: 'plain',
      head: [['Ventas recientes del periodo', 'Folio', 'Cliente', 'Total']],
      body: recientes.ventas.map(v => [formatFecha(v.fecha), folio(v.documento_id, v.nota) || '—', v.cliente, formatCLP(v.monto)]),
    });
    doc.save(`reporte-${claveArchivo}.pdf`);
  };

  /* ══ Pantalla ══ */
  const botonModo = (m: Modo) => cn(
    'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
    modo === m ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-primary flex items-center gap-3">
            <span className="material-symbols-outlined text-4xl">bar_chart</span>
            Reportes y Tributos
          </h2>
          <p className="text-on-surface-variant mt-1 text-sm">Resultados del periodo, comparación, IVA mensual (F29) y descargas.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex p-1 bg-surface-container-high rounded-xl" role="tablist" aria-label="Tipo de periodo">
            {MODOS.map(m => (
              <button key={m.valor} type="button" role="tab" aria-selected={modo === m.valor} onClick={() => setModo(m.valor)} className={botonModo(m.valor)}>
                {m.etiqueta}
              </button>
            ))}
          </div>
          {modo === 'mes' && <SelectorDesplegable className="w-52" icono="calendar_month" valor={mes} opciones={opcionesMes} onChange={setMes} />}
          {modo === 'trimestre' && <SelectorDesplegable className="w-60" icono="date_range" valor={trimestre} opciones={opcionesTrimestre} onChange={setTrimestre} />}
          {modo === 'anio' && <SelectorDesplegable className="w-36" icono="event" valor={anio} opciones={opcionesAnio} onChange={setAnio} />}
          {modo === 'rango' && (
            <>
              <div className="flex flex-col text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                Desde
                <SelectorFecha className="w-40 mt-1" value={rangoManual.inicio} onChange={inicio => setRangoManual(r => ({ ...r, inicio }))} />
              </div>
              <div className="flex flex-col text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                Hasta
                <SelectorFecha className="w-40 mt-1" value={rangoManual.fin} onChange={fin => setRangoManual(r => ({ ...r, fin }))} />
              </div>
            </>
          )}
          <button onClick={descargarPdf} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-outline-variant/50 bg-surface-container-lowest text-on-surface text-sm font-bold hover:border-primary/40 transition-colors">
            <span className="material-symbols-outlined text-lg text-error">picture_as_pdf</span>
            PDF
          </button>
          <button onClick={descargarExcel} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-outline-variant/50 bg-surface-container-lowest text-on-surface text-sm font-bold hover:border-primary/40 transition-colors">
            <span className="material-symbols-outlined text-lg text-success">table_view</span>
            Excel
          </button>
        </div>
      </div>

      <p className="text-xs text-on-surface-variant">
        Mostrando <span className="font-bold text-on-surface">{etiquetaRango}</span>
        {modo !== 'rango' && <> ({formatFecha(rango.inicio)} al {formatFecha(rango.fin)})</>}
        {' · '}comparado con <span className="font-bold text-on-surface">{etiquetaAnterior}</span>
        {enCurso && ' (a la misma altura del periodo)'}
      </p>

      <div className={cn('space-y-6 transition-opacity', actualizando && 'opacity-60')}>
        {/* ── Indicadores con comparación ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {indicadores.map(k => (
            <Fragment key={k.titulo}>
              <Kpi titulo={k.titulo} icono={k.icono} valor={k.valor} negativo={k.negativo}
                pie={<Variacion v={k.v} invertir={k.invertir} />} detalle={k.detalle} />
            </Fragment>
          ))}
        </div>

        {/* ── Caja del periodo y saldos globales a hoy ── */}
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
          <Kpi titulo="Mermas de inventario" icono="delete_sweep" valor={formatCLP(mermas)}
            detalle={nMermas ? plural(nMermas, 'ajuste por merma', 'ajustes por merma') + ' · gasto, no costo de venta' : 'Sin mermas en el periodo'} />
          <Kpi titulo="Cobrado en el periodo" icono="call_received" valor={formatCLP(cobrado)} detalle="Abonos recibidos de clientes" />
          <Kpi titulo="Pagado en el periodo" icono="call_made" valor={formatCLP(pagado)} detalle="Abonos pagados a proveedores" />
          <Kpi titulo="Por cobrar · saldo a hoy" icono="request_quote" valor={formatCLP(resumen.porCobrar)} detalle={textoCobrar}
            pie={resumen.ventasVencidas > 0 ? <span className="font-bold text-error">{plural(resumen.ventasVencidas, 'venta vencida', 'ventas vencidas')}</span> : <span className="text-on-surface-variant">Sin ventas vencidas</span>} />
          <Kpi titulo="Por pagar · saldo a hoy" icono="payments" valor={formatCLP(resumen.porPagar)} detalle={textoPagar}
            pie={resumen.comprasVencidas > 0 ? <span className="font-bold text-error">{plural(resumen.comprasVencidas, 'compra vencida', 'compras vencidas')}</span> : <span className="text-on-surface-variant">Sin compras vencidas</span>} />
        </div>

        {/* ── Flujo del periodo + saldo acumulado ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <TarjetaGrafico
            className="lg:col-span-2" icono="stacked_bar_chart" titulo="Ingresos, egresos y resultado"
            subtitulo={`${NOMBRE_GRANULARIDAD[flujo.granularidad].replace(/^p/, 'P')} · ${etiquetaRango}`}
          >
            <GraficoSerie
              puntos={flujo.puntos} alto={280}
              series={[
                { clave: 'ingresos', nombre: 'Ingresos', color: paleta.ingresos, tipo: 'barra' },
                { clave: 'egresos', nombre: 'Egresos', color: paleta.egresos, tipo: 'barra' },
                { clave: 'neto', nombre: 'Resultado neto', color: paleta.neto, tipo: 'linea' },
              ]}
            />
          </TarjetaGrafico>
          <TarjetaGrafico icono="show_chart" titulo="Saldo acumulado" subtitulo="Ingresos − egresos acumulados en el periodo">
            <GraficoSerie puntos={flujo.puntos} alto={280} series={[{ clave: 'saldo', nombre: 'Saldo acumulado', color: paleta.neto, tipo: 'area' }]} />
          </TarjetaGrafico>
        </div>

        {/* ── Composición ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <TarjetaGrafico icono="donut_large" titulo="Ventas por categoría" subtitulo="Top 6 y el resto en «Otros»">
            <GraficoDona items={ventasPorCategoria} vacio="Sin ventas en el periodo" />
          </TarjetaGrafico>
          <TarjetaGrafico icono="donut_small" titulo="Gastos por categoría" subtitulo="Top 6 y el resto en «Otros»">
            <GraficoDona items={gastosPorCategoria} vacio="Sin gastos en el periodo" />
          </TarjetaGrafico>
          <TarjetaGrafico className="md:col-span-2 xl:col-span-1" icono="credit_card" titulo="Métodos de pago" subtitulo="Ventas del periodo por medio de pago">
            <GraficoBarras items={metodosPago} color={paleta.ingresos} mostrarPct vacio="Sin ventas en el periodo" />
          </TarjetaGrafico>
        </div>

        {/* ── Rankings ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TarjetaGrafico icono="inventory_2" titulo="Productos más vendidos" subtitulo="Por monto vendido">
            <GraficoBarras items={topProductos} max={8} color={paleta.categorias[0]} vacio="Sin ventas en el periodo" />
          </TarjetaGrafico>
          <TarjetaGrafico icono="groups" titulo="Mejores clientes" subtitulo="Por monto comprado">
            <GraficoBarras items={topClientes} max={8} color={paleta.categorias[2]} vacio="Sin ventas en el periodo" />
          </TarjetaGrafico>
        </div>

        {/* ── Resumen por mes (rangos de más de un mes) ── */}
        {variosMeses && (
          <TarjetaGrafico icono="table_chart" titulo="Resumen por mes" subtitulo={etiquetaRango}>
            <div className="overflow-x-auto -mx-5">
              <table className="w-full min-w-[36rem] text-sm">
                <thead className="bg-surface-container-low text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                  <tr>{['Mes', 'Ingresos', 'Egresos', 'Neto', 'Margen', 'Ventas'].map((h, i) => <th key={h} className={cn('px-5 py-2.5', i ? 'text-right' : 'text-left')}>{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10 tabular-nums">
                  {resumenMensual.map(m => (
                    <tr key={m.periodo} className="hover:bg-surface-container-low/50">
                      <td className="px-5 py-2.5 font-semibold text-on-surface">{m.etiqueta}</td>
                      <td className="px-5 py-2.5 text-right text-on-surface">{formatCLP(m.ingresos)}</td>
                      <td className="px-5 py-2.5 text-right text-on-surface">{formatCLP(m.egresos)}</td>
                      <td className={cn('px-5 py-2.5 text-right font-bold', m.neto < 0 ? 'text-error' : 'text-on-surface')}>{formatCLP(m.neto)}</td>
                      <td className="px-5 py-2.5 text-right text-on-surface-variant">{fmtPct(m.margenPct)}</td>
                      <td className="px-5 py-2.5 text-right text-on-surface-variant">{m.ventas.toLocaleString('es-CL')}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-outline-variant/30 font-black tabular-nums">
                  <tr>
                    <td className="px-5 py-2.5 text-on-surface">Total</td>
                    <td className="px-5 py-2.5 text-right text-on-surface">{formatCLP(actual.ingresos)}</td>
                    <td className="px-5 py-2.5 text-right text-on-surface">{formatCLP(actual.egresos)}</td>
                    <td className={cn('px-5 py-2.5 text-right', actual.neto < 0 ? 'text-error' : 'text-on-surface')}>{formatCLP(actual.neto)}</td>
                    <td className="px-5 py-2.5 text-right text-on-surface-variant">{fmtPct(actual.margenPct)}</td>
                    <td className="px-5 py-2.5 text-right text-on-surface-variant">{actual.nVentas.toLocaleString('es-CL')}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </TarjetaGrafico>
        )}

        {/* ── F29: una fila por mes cuando el rango cubre varios ── */}
        <TarjetaGrafico
          icono="account_balance_wallet"
          titulo={variosMeses ? 'Liquidación IVA mensual (F29) por mes' : `Liquidación IVA mensual (F29) — ${f29Meses[0]?.etiqueta ?? etiquetaRango}`}
          subtitulo="Estimación interna del formulario 29. No reemplaza la declaración oficial."
        >
          {variosMeses ? (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full min-w-[44rem] text-sm">
                <thead className="bg-surface-container-low text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                  <tr>{['Mes', 'IVA débito', 'IVA crédito', 'Notas de crédito', 'Diferencia', 'PPM', 'Total estimado', 'Pendientes'].map((h, i) => <th key={h} className={cn('px-4 py-2.5', i ? 'text-right' : 'text-left')}>{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10 tabular-nums">
                  {f29Meses.map(f => (
                    <tr key={f.periodo} className="hover:bg-surface-container-low/50">
                      <td className="px-4 py-2.5 font-semibold text-on-surface">{f.etiqueta}</td>
                      {[f.ivaDebito, f.ivaCredito, f.ivaNotasCredito, f.diferenciaIva, f.ppm, f.totalEstimado].map((n, i) => (
                        <td key={i} className={cn('px-4 py-2.5 text-right', i === 5 ? 'font-bold text-on-surface' : 'text-on-surface-variant')}>{formatCLP(n)}</td>
                      ))}
                      <td className="px-4 py-2.5 text-right text-on-surface-variant">{f.documentosPendientes}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-outline-variant/30 font-black tabular-nums">
                  <tr>
                    <td className="px-4 py-2.5 text-on-surface">Total</td>
                    {[f29Total.ivaDebito, f29Total.ivaCredito, f29Total.ivaNotasCredito, f29Total.diferenciaIva, f29Total.ppm, f29Total.totalEstimado].map((n, i) => (
                      <td key={i} className="px-4 py-2.5 text-right text-on-surface">{formatCLP(n)}</td>
                    ))}
                    <td className="px-4 py-2.5 text-right text-on-surface">{f29Total.documentosPendientes}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              {[
                { label: 'IVA débito', value: f29Total.ivaDebito },
                { label: 'IVA crédito', value: f29Total.ivaCredito },
                { label: 'Notas de crédito', value: f29Total.ivaNotasCredito },
                { label: 'Diferencia a pagar', value: f29Total.diferenciaIva },
                { label: 'PPM estimado', value: f29Total.ppm },
                { label: 'Total estimado', value: f29Total.totalEstimado },
                { label: 'Ventas POS conciliadas', value: f29Total.ventasPOSConciliadas, cantidad: true },
                { label: 'Documentos pendientes', value: f29Total.documentosPendientes, cantidad: true },
              ].map(item => (
                <div key={item.label} className="rounded-xl bg-surface-container-low p-3 min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant truncate">{item.label}</p>
                  <p className="text-lg font-black text-on-surface mt-1 tabular-nums">{item.cantidad ? item.value.toLocaleString('es-CL') : formatCLP(item.value)}</p>
                </div>
              ))}
            </div>
          )}
          {alertasF29.length > 0 && (
            <ul className="mt-4 space-y-2">
              {alertasF29.slice(0, 8).map(a => (
                <li key={a} className="flex items-center gap-2 text-sm text-on-surface bg-secondary/10 rounded-xl px-3 py-2">
                  <span className="material-symbols-outlined text-base text-secondary">warning</span>{a}
                </li>
              ))}
              {alertasF29.length > 8 && <li className="text-xs text-on-surface-variant">y {alertasF29.length - 8} alertas más</li>}
            </ul>
          )}
        </TarjetaGrafico>

        {/* ── Detalle reciente ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[
            { titulo: 'Ventas del periodo', total: ventasP.length, vacio: 'Sin ventas en el periodo', color: 'text-on-surface',
              filas: recientes.ventas.map(v => ({ id: v.id, nombre: v.cliente || 'Sin cliente', sub: [formatFecha(v.fecha), tipoDoc(v), folio(v.documento_id, v.nota)].filter(Boolean).join(' · '), monto: v.monto })) },
            { titulo: 'Gastos del periodo', total: gastosP.length, vacio: 'Sin gastos en el periodo', color: 'text-error',
              filas: recientes.gastos.map(g => ({ id: g.id, nombre: g.proveedor || 'Sin proveedor', sub: [formatFecha(g.fecha), g.categoria, folio(g.documento_id)].filter(Boolean).join(' · '), monto: g.monto })) },
          ].map(bloque => (
            <Fragment key={bloque.titulo}>
            <TarjetaGrafico titulo={bloque.titulo}
              extra={bloque.total > bloque.filas.length ? `Últimas ${bloque.filas.length} de ${bloque.total.toLocaleString('es-CL')}` : plural(bloque.total, 'registro', 'registros')}>
              <div className="-mx-5 -mb-5 divide-y divide-outline-variant/10 max-h-80 overflow-y-auto">
                {bloque.filas.length === 0 && <p className="px-5 py-4 text-sm text-on-surface-variant">{bloque.vacio}</p>}
                {bloque.filas.map(f => (
                  <div key={f.id} className="px-5 py-2.5 flex justify-between items-center gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-on-surface text-sm truncate">{f.nombre}</p>
                      <p className="text-[11px] text-on-surface-variant truncate">{f.sub}</p>
                    </div>
                    <span className={cn('font-extrabold tabular-nums shrink-0', bloque.color)}>{formatCLP(f.monto)}</span>
                  </div>
                ))}
              </div>
            </TarjetaGrafico>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
