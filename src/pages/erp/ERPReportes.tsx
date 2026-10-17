import { useMemo, useState } from 'react';
import { useERP } from '../../1.-ERP/context/ERPContext';
import { useAuth } from '../../context/AuthContext';
import { useColoresTema } from '../../lib/useColoresTema';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import * as XLSX from 'xlsx';

const PALETA_CATEGORIAS = ['#6750A4', '#006A6A', '#B3261E', '#7D5260', '#38693C', '#8B5000', '#00639A', '#9C4173'];

export default function ERPReportes() {
  const { ventas, gastos, inventario, abonos, getF29Preparador, getSaldoPendienteVenta, getSaldoPendienteGasto } = useERP();
  const { perfil } = useAuth();
  const c = useColoresTema();
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7));

  const fmt = (n: number) => `$${Math.abs(n).toLocaleString('es-CL')}`;

  const datosEmisorPdf = {
    nombre: perfil?.negocio_nombre,
    rut: perfil?.negocio_rut,
  };

  const ventasPeriodo = useMemo(() => ventas.filter(v => v.fecha.slice(0, 7) === periodo), [ventas, periodo]);
  const gastosPeriodo = useMemo(() => gastos.filter(g => g.fecha.slice(0, 7) === periodo), [gastos, periodo]);
  const abonosPeriodo = useMemo(() => abonos.filter(a => (a.fecha ?? '').slice(0, 7) === periodo), [abonos, periodo]);

  const ingresos = ventasPeriodo.reduce((a, v) => a + v.monto, 0);
  const egresos = gastosPeriodo.reduce((a, g) => a + g.monto, 0);
  const neto = ingresos - egresos;
  const netosVentas = ventasPeriodo.reduce((a, v) => a + (v.subtotal ?? v.monto), 0);
  const costoVendido = ventasPeriodo.reduce((a, v) => a + v.productos.reduce((s, p) => s + (p.costoUnitario ?? 0) * (p.cantidad ?? 0), 0), 0);
  const margenBruto = netosVentas - costoVendido;
  const margenPct = netosVentas > 0 ? Math.round((margenBruto / netosVentas) * 100) : 0;
  const valorInventario = inventario.reduce((a, p) => a + p.costo * p.stock, 0);
  const cobradoMes = abonosPeriodo.filter(a => a.tipo === 'cobro').reduce((a, x) => a + (x.monto_abono ?? x.monto), 0);
  const pagadoMes = abonosPeriodo.filter(a => a.tipo === 'pago').reduce((a, x) => a + (x.monto_abono ?? x.monto), 0);
  const porCobrar = ventasPeriodo.reduce((a, v) => a + getSaldoPendienteVenta(v.id), 0);
  const porPagar = gastosPeriodo.reduce((a, g) => a + getSaldoPendienteGasto(g.id), 0);

  const f29 = getF29Preparador(periodo);

  const periodosDisponibles = Array.from(new Set([...ventas, ...gastos].map(r => r.fecha.slice(0, 7))))
    .sort().reverse().slice(0, 24);

  const etiquetaPeriodo = useMemo(() => {
    const [anio, mes] = periodo.split('-');
    const nombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${nombres[Number(mes) - 1]} ${anio}`;
  }, [periodo]);

  /* ── Movimiento por día ── */
  const datosPorDia = useMemo(() => {
    const [anio, mes] = periodo.split('-').map(Number);
    const dias = new Date(anio, mes, 0).getDate();
    const ingresosPorDia = new Array(dias + 1).fill(0);
    const egresosPorDia = new Array(dias + 1).fill(0);
    ventasPeriodo.forEach(v => { const d = Number(v.fecha.slice(8, 10)); if (d >= 1 && d <= dias) ingresosPorDia[d] += v.monto; });
    gastosPeriodo.forEach(g => { const d = Number(g.fecha.slice(8, 10)); if (d >= 1 && d <= dias) egresosPorDia[d] += g.monto; });
    return Array.from({ length: dias }, (_, i) => ({
      dia: String(i + 1).padStart(2, '0'),
      ingresos: ingresosPorDia[i + 1],
      egresos: egresosPorDia[i + 1],
    }));
  }, [ventasPeriodo, gastosPeriodo, periodo]);

  /* ── Serie acumulada (efectivo proyectado) ── */
  const datosAcumulados = useMemo(() => {
    let saldo = 0;
    return datosPorDia.map(d => { saldo += d.ingresos - d.egresos; return { dia: d.dia, saldo }; });
  }, [datosPorDia]);

  /* ── Categorías ── */
  const ventasPorCategoria = useMemo(() => {
    const map = new Map<string, number>();
    ventasPeriodo.forEach(v => v.productos.forEach(p => {
      const cat = p.categoria || 'Sin categoría';
      map.set(cat, (map.get(cat) ?? 0) + (p.total ?? 0));
    }));
    return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [ventasPeriodo]);

  const gastosPorCategoria = useMemo(() => {
    const map = new Map<string, number>();
    gastosPeriodo.forEach(g => map.set(g.categoria || 'Sin categoría', (map.get(g.categoria || 'Sin categoría') ?? 0) + g.monto));
    return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [gastosPeriodo]);

  /* ── Métodos de pago ── */
  const metodosPago = useMemo(() => {
    const etiquetas: Record<string, string> = { efectivo: 'Efectivo', transferencia: 'Transferencia', debito: 'Débito', credito: 'Crédito', cheque: 'Cheque' };
    const map = new Map<string, number>();
    ventasPeriodo.forEach(v => {
      const m = v.metodo_pago ?? 'efectivo';
      map.set(m, (map.get(m) ?? 0) + v.monto);
    });
    return Array.from(map, ([key, value]) => ({ name: etiquetas[key] ?? key, value })).sort((a, b) => b.value - a.value);
  }, [ventasPeriodo]);

  /* ── Top productos y clientes ── */
  const topProductos = useMemo(() => {
    const map = new Map<string, { cantidad: number; total: number }>();
    ventasPeriodo.forEach(v => v.productos.forEach(p => {
      const prev = map.get(p.productoNombre) ?? { cantidad: 0, total: 0 };
      map.set(p.productoNombre, { cantidad: prev.cantidad + (p.cantidad ?? 0), total: prev.total + (p.total ?? 0) });
    }));
    return Array.from(map, ([name, d]) => ({ name, ...d })).sort((a, b) => b.total - a.total).slice(0, 6);
  }, [ventasPeriodo]);

  const topClientes = useMemo(() => {
    const map = new Map<string, { total: number; documentos: number }>();
    ventasPeriodo.forEach(v => {
      const nombre = v.cliente || 'Sin cliente';
      const prev = map.get(nombre) ?? { total: 0, documentos: 0 };
      map.set(nombre, { total: prev.total + v.monto, documentos: prev.documentos + 1 });
    });
    return Array.from(map, ([name, d]) => ({ name, ...d })).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [ventasPeriodo]);

  const mejorDia = useMemo(() => datosPorDia.reduce((mejor, d) => (d.ingresos > mejor.ingresos ? d : mejor), { dia: '01', ingresos: 0, egresos: 0 }), [datosPorDia]);

  /* ════════ Descargas ════════ */

  const descargarExcel = () => {
    const resumen = [
      ['Resumen del periodo', etiquetaPeriodo],
      [],
      ['Indicador', 'Valor'],
      ['Ingresos', ingresos],
      ['Egresos', egresos],
      ['Neto', neto],
      ['Margen bruto', margenBruto],
      ['Margen %', `${margenPct}%`],
      ['Cobrado en el mes', cobradoMes],
      ['Pagado en el mes', pagadoMes],
      ['Por cobrar (saldo)', porCobrar],
      ['Por pagar (saldo)', porPagar],
      ['Valor de inventario', valorInventario],
      [],
      ['IVA débito', f29.ivaDebito],
      ['IVA crédito', f29.ivaCredito],
      ['Diferencia IVA a pagar', f29.diferenciaIva],
      ['PPM estimado', f29.ppm],
      ['Total estimado', f29.totalEstimado],
    ];
    const hojaVentas = [
      ['ID', 'Fecha', 'Cliente', 'Documento', 'Método pago', 'Neto', 'IVA', 'Total', 'Estado'],
      ...ventasPeriodo.map(v => [v.id, v.fecha, v.cliente, v.tipo_documento ?? '', v.metodo_pago ?? '', v.subtotal ?? 0, v.iva ?? 0, v.monto, v.estado]),
    ];
    const hojaGastos = [
      ['ID', 'Fecha', 'Proveedor', 'Categoría', 'Método pago', 'Neto', 'IVA', 'Total', 'Estado'],
      ...gastosPeriodo.map(g => [g.id, g.fecha, g.proveedor, g.categoria, g.metodo_pago ?? '', g.subtotal ?? 0, g.iva ?? 0, g.monto, g.estado]),
    ];
    const hojaAbonos = [
      ['Fecha', 'Tipo', 'Cliente/Proveedor', 'Método pago', 'Monto'],
      ...abonosPeriodo.map(a => [a.fecha, a.tipo === 'cobro' ? 'Cobro' : 'Pago', a.cliente_proveedor ?? '', a.metodo_pago, a.monto_abono ?? a.monto]),
    ];

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(resumen), 'Resumen');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(hojaVentas), 'Ventas');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(hojaGastos), 'Gastos');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(hojaAbonos), 'Cobros y pagos');
    const datos = XLSX.write(libro, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    const blob = new Blob([datos], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-${periodo}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const descargarPdf = async () => {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const doc = new jsPDF();
    const ancho = doc.internal.pageSize.getWidth();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(103, 80, 164);
    doc.text(datosEmisorPdf.nombre || 'Mi negocio', 14, 18);
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.text(`Resumen mensual — ${etiquetaPeriodo}`, 14, 26);
    if (datosEmisorPdf.rut) doc.text(`RUT: ${datosEmisorPdf.rut}`, ancho - 14, 26, { align: 'right' });

    autoTable(doc, {
      startY: 34,
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 2 },
      body: [
        ['Ingresos', fmt(ingresos), 'Egresos', fmt(egresos)],
        ['Neto', fmt(neto), 'Margen bruto', `${fmt(margenBruto)} (${margenPct}%)`],
        ['Cobrado en el mes', fmt(cobradoMes), 'Pagado en el mes', fmt(pagadoMes)],
        ['Por cobrar', fmt(porCobrar), 'Por pagar', fmt(porPagar)],
        ['Mejor día', `${mejorDia.dia} (${fmt(mejorDia.ingresos)})`, 'Valor inventario', fmt(valorInventario)],
      ],
    });

    autoTable(doc, {
      startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6,
      head: [['Producto más vendido', 'Unidades', 'Total']],
      body: topProductos.map(p => [p.name, String(p.cantidad), fmt(p.total)]),
      headStyles: { fillColor: [103, 80, 164] },
      styles: { fontSize: 9 },
    });

    autoTable(doc, {
      startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6,
      head: [['Top cliente', 'Documentos', 'Total']],
      body: topClientes.map(t => [t.name, String(t.documentos), fmt(t.total)]),
      headStyles: { fillColor: [0, 106, 106] },
      styles: { fontSize: 9 },
    });

    autoTable(doc, {
      startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6,
      head: [['IVA mensual (F29)', 'Valor']],
      body: [
        ['IVA débito', fmt(f29.ivaDebito)],
        ['IVA crédito', fmt(f29.ivaCredito)],
        ['Diferencia a pagar', fmt(f29.diferenciaIva)],
        ['PPM estimado', fmt(f29.ppm)],
        ['Total estimado', fmt(f29.totalEstimado)],
      ],
      headStyles: { fillColor: [56, 105, 60] },
      styles: { fontSize: 9 },
    });

    autoTable(doc, {
      startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6,
      head: [['Ventas del periodo']],
      body: ventasPeriodo.slice(0, 30).map(v => [`${v.fecha} · ${v.cliente} · ${fmt(v.monto)}`]),
      styles: { fontSize: 8, textColor: [90, 90, 90] },
      theme: 'plain',
    });

    doc.save(`reporte-${periodo}.pdf`);
  };

  const kpis = [
    { label: 'Ingresos del periodo', value: fmt(ingresos), sub: `${ventasPeriodo.length} ventas`, color: 'text-primary', bg: 'bg-primary/5', border: 'border-primary/20' },
    { label: 'Egresos del periodo', value: fmt(egresos), sub: `${gastosPeriodo.length} gastos`, color: 'text-error', bg: 'bg-error/5', border: 'border-error/20' },
    { label: 'Neto del periodo', value: fmt(neto), sub: neto >= 0 ? 'Resultado positivo' : 'Resultado negativo', color: neto >= 0 ? 'text-success' : 'text-error', bg: neto >= 0 ? 'bg-success/5' : 'bg-error/5', border: neto >= 0 ? 'border-success/20' : 'border-error/20' },
    { label: 'Margen bruto', value: fmt(margenBruto), sub: `${margenPct}% · costo ${fmt(costoVendido)}`, color: 'text-info', bg: 'bg-info/5', border: 'border-info/20' },
    { label: 'Cobrado / Pagado', value: `${fmt(cobradoMes)} / ${fmt(pagadoMes)}`, sub: 'Del mes en curso', color: 'text-secondary', bg: 'bg-secondary/5', border: 'border-secondary/20' },
    { label: 'Por cobrar / Por pagar', value: `${fmt(porCobrar)} / ${fmt(porPagar)}`, sub: 'Saldos pendientes', color: 'text-warning', bg: 'bg-warning/5', border: 'border-warning/20' },
  ];

  const tooltipStyle = { borderRadius: '12px', border: `1px solid ${c.outlineVariant}`, background: c.surfaceLowest, color: c.onSurface, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' };

  return (
    <div className="p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-primary flex items-center gap-3">
            <span className="material-symbols-outlined text-4xl">bar_chart</span>
            Reportes y Tributos
          </h2>
          <p className="text-on-surface-variant mt-1 text-sm">Movimientos del mes, IVA mensual (F29), márgenes y descargas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select value={periodo} onChange={e => setPeriodo(e.target.value)}
            className="px-4 py-2.5 border-2 border-outline-variant/50 rounded-xl text-sm font-bold text-on-surface outline-none focus:border-primary bg-surface-container-lowest">
            {periodosDisponibles.length === 0 && <option value={periodo}>{periodo}</option>}
            {periodosDisponibles.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button onClick={descargarPdf}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-error text-inverse-on-surface text-sm font-bold hover:bg-error/80 transition-colors">
            <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
            PDF
          </button>
          <button onClick={descargarExcel}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-success text-inverse-on-surface text-sm font-bold hover:bg-success/80 transition-colors">
            <span className="material-symbols-outlined text-lg">table_view</span>
            Excel
          </button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map(k => (
          <div key={k.label} className={`${k.bg} p-5 rounded-2xl border ${k.border}`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{k.label}</p>
            <p className={`text-xl font-black ${k.color} mt-1`}>{k.value}</p>
            <p className="text-[10px] font-bold text-on-surface-variant mt-1">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Movimiento por día + acumulado ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant/20 shadow-sm">
          <h3 className="text-sm font-bold text-on-surface uppercase tracking-widest mb-4">Movimiento por día — {etiquetaPeriodo}</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datosPorDia} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={c.outlineVariant} />
                <XAxis dataKey="dia" axisLine={false} tickLine={false} tick={{ fill: c.onSurfaceVariant, fontSize: 10 }} interval={Math.floor(datosPorDia.length / 15)} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: c.onSurfaceVariant, fontSize: 10 }} tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} />
                <RechartsTooltip contentStyle={tooltipStyle} formatter={(value: number) => fmt(value)} />
                <Legend wrapperStyle={{ fontSize: 11, color: c.onSurfaceVariant }} />
                <Bar dataKey="ingresos" name="Ingresos" fill={c.primary} radius={[4, 4, 0, 0]} />
                <Bar dataKey="egresos" name="Egresos" fill={c.error} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant/20 shadow-sm">
          <h3 className="text-sm font-bold text-on-surface uppercase tracking-widest mb-4">Saldo acumulado</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={datosAcumulados}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={c.outlineVariant} />
                <XAxis dataKey="dia" axisLine={false} tickLine={false} tick={{ fill: c.onSurfaceVariant, fontSize: 10 }} interval={Math.floor(datosAcumulados.length / 6)} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: c.onSurfaceVariant, fontSize: 10 }} tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} />
                <RechartsTooltip contentStyle={tooltipStyle} formatter={(value: number) => [fmt(value), 'Saldo']} />
                <Line type="monotone" dataKey="saldo" stroke={c.success} strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Categorías y métodos de pago ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant/20 shadow-sm">
          <h3 className="text-sm font-bold text-on-surface uppercase tracking-widest mb-4">Ventas por categoría</h3>
          <div className="h-64">
            {ventasPorCategoria.length === 0 ? (
              <p className="h-full flex items-center justify-center text-sm text-on-surface-variant">Sin ventas en {etiquetaPeriodo}.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={ventasPorCategoria} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={5} dataKey="value">
                    {ventasPorCategoria.map((_, i) => <Cell key={i} fill={PALETA_CATEGORIAS[i % PALETA_CATEGORIAS.length]} />)}
                  </Pie>
                  <RechartsTooltip contentStyle={tooltipStyle} formatter={(value: number) => fmt(value)} />
                  <Legend wrapperStyle={{ fontSize: 10, color: c.onSurfaceVariant }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant/20 shadow-sm">
          <h3 className="text-sm font-bold text-on-surface uppercase tracking-widest mb-4">Gastos por categoría</h3>
          <div className="h-64">
            {gastosPorCategoria.length === 0 ? (
              <p className="h-full flex items-center justify-center text-sm text-on-surface-variant">Sin gastos en {etiquetaPeriodo}.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={gastosPorCategoria} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={5} dataKey="value">
                    {gastosPorCategoria.map((_, i) => <Cell key={i} fill={PALETA_CATEGORIAS[i % PALETA_CATEGORIAS.length]} />)}
                  </Pie>
                  <RechartsTooltip contentStyle={tooltipStyle} formatter={(value: number) => fmt(value)} />
                  <Legend wrapperStyle={{ fontSize: 10, color: c.onSurfaceVariant }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant/20 shadow-sm">
          <h3 className="text-sm font-bold text-on-surface uppercase tracking-widest mb-4">Métodos de pago</h3>
          <div className="h-64">
            {metodosPago.length === 0 ? (
              <p className="h-full flex items-center justify-center text-sm text-on-surface-variant">Sin ventas en {etiquetaPeriodo}.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metodosPago} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={c.outlineVariant} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: c.onSurfaceVariant, fontSize: 10 }} tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" width={90} axisLine={false} tickLine={false} tick={{ fill: c.onSurfaceVariant, fontSize: 11 }} />
                  <RechartsTooltip contentStyle={tooltipStyle} formatter={(value: number) => fmt(value)} />
                  <Bar dataKey="value" fill={c.info} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ── Top productos y clientes ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant/20 shadow-sm">
          <h3 className="text-sm font-bold text-on-surface uppercase tracking-widest mb-4">Productos más vendidos</h3>
          <div className="h-64">
            {topProductos.length === 0 ? (
              <p className="h-full flex items-center justify-center text-sm text-on-surface-variant">Sin ventas en {etiquetaPeriodo}.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProductos} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={c.outlineVariant} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: c.onSurfaceVariant, fontSize: 10 }} tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" width={130} axisLine={false} tickLine={false} tick={{ fill: c.onSurfaceVariant, fontSize: 10 }} />
                  <RechartsTooltip contentStyle={tooltipStyle} formatter={(value: number) => fmt(value)} />
                  <Bar dataKey="total" fill={c.primary} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-outline-variant/20">
            <h3 className="text-sm font-bold text-on-surface uppercase tracking-widest">Top clientes del periodo</h3>
          </div>
          {topClientes.length === 0 ? (
            <p className="p-6 text-sm text-on-surface-variant">Sin ventas en {etiquetaPeriodo}.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-container-low">
                <tr>
                  {['Cliente', 'Documentos', 'Total'].map(h => (
                    <th key={h} className="p-4 text-left text-xs font-bold text-outline uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {topClientes.map((t, i) => (
                  <tr key={t.name} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="p-4 font-bold text-on-surface">
                      <span className="inline-flex items-center justify-center w-6 h-6 mr-2 rounded-full bg-primary/10 text-primary text-xs font-black">{i + 1}</span>
                      {t.name}
                    </td>
                    <td className="p-4 text-on-surface-variant">{t.documentos}</td>
                    <td className="p-4 font-extrabold text-primary">{fmt(t.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── F29 ── */}
      <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-outline-variant/20 flex items-center gap-3">
          <span className="material-symbols-outlined text-primary">account_balance_wallet</span>
          <div>
            <h3 className="font-bold text-on-surface">Liquidación IVA Mensual (F29) — {periodo}</h3>
            <p className="text-xs text-on-surface-variant">Estimación interna del formulario 29. No reemplaza la declaración oficial.</p>
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {[
              { label: 'IVA débito', value: f29.ivaDebito },
              { label: 'IVA crédito', value: f29.ivaCredito },
              { label: 'Notas de crédito', value: f29.ivaNotasCredito },
              { label: 'Diferencia a pagar', value: f29.diferenciaIva },
              { label: 'PPM estimado', value: f29.ppm },
              { label: 'Total estimado', value: f29.totalEstimado },
              { label: 'Ventas POS conciliadas', value: f29.ventasPOSConciliadas, count: true },
              { label: 'Documentos pendientes', value: f29.documentosPendientes, count: true },
            ].map(item => (
              <div key={item.label} className="rounded-2xl bg-surface-container-low p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{item.label}</p>
                <p className="text-xl font-black text-on-surface mt-1">{item.count ? item.value : fmt(item.value)}</p>
              </div>
            ))}
          </div>
          {f29.alertas.length > 0 && (
            <div className="mt-4 space-y-2">
              {f29.alertas.map(a => (
                <p key={a} className="flex items-center gap-2 text-sm text-secondary bg-secondary/10 rounded-xl px-3 py-2">
                  <span className="material-symbols-outlined text-base">warning</span>{a}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Detalle ventas y gastos ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-outline-variant/20 font-bold text-on-surface">Ventas del periodo</div>
          <div className="divide-y divide-outline-variant/10 max-h-80 overflow-y-auto">
            {ventasPeriodo.length === 0 && <p className="p-5 text-sm text-on-surface-variant">Sin ventas en {etiquetaPeriodo}.</p>}
            {ventasPeriodo.slice(0, 30).map(v => (
              <div key={v.id} className="px-5 py-3 flex justify-between items-center">
                <div>
                  <p className="font-bold text-on-surface text-sm">{v.cliente}</p>
                  <p className="text-[10px] text-on-surface-variant">{v.fecha} · {v.tipo_documento ?? 'Documento'}</p>
                </div>
                <span className="font-extrabold text-primary">{fmt(v.monto)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-outline-variant/20 font-bold text-on-surface">Gastos del periodo</div>
          <div className="divide-y divide-outline-variant/10 max-h-80 overflow-y-auto">
            {gastosPeriodo.length === 0 && <p className="p-5 text-sm text-on-surface-variant">Sin gastos en {etiquetaPeriodo}.</p>}
            {gastosPeriodo.slice(0, 30).map(g => (
              <div key={g.id} className="px-5 py-3 flex justify-between items-center">
                <div>
                  <p className="font-bold text-on-surface text-sm">{g.proveedor}</p>
                  <p className="text-[10px] text-on-surface-variant">{g.fecha} · {g.categoria}</p>
                </div>
                <span className="font-extrabold text-error">{fmt(g.monto)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
