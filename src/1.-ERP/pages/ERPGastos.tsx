import { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import { useERP, Gasto, MetodoPago } from '../context/ERPContext';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import TarjetasResumen from '../components/TarjetasResumen';
import SelectorFecha from '../components/SelectorFecha';
import SelectorDesplegable, { OPCIONES_PERIODO, etiquetaRangoPeriodo } from '../../components/SelectorDesplegable';
import { cn, formatFecha } from '@/lib/utils';

const ModalCargaMasivaGastos = lazy(() => import('../components/ModalCargaMasivaGastos'));

const CATEGORIAS_GASTO = ['Insumos/Mercaderia','Servicios Basicos','Arriendo','Sueldos','Publicidad','Tecnologia','Transporte','Capacitacion','Mantencion','IVA/Impuestos','Otros'];
const METODOS: { value: MetodoPago; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'cheque', label: 'Cheque' },
];

export default function ERPGastos() {
  const { gastos, ventas, addGasto, updateGasto, deleteGasto, getSaldoPendienteGasto } = useERP();
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('Todas');
  const [showModal, setShowModal] = useState(false);
  const [showCargaMasiva, setShowCargaMasiva] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nuevoGasto, setNuevoGasto] = useState<Partial<Gasto>>({
    fecha: new Date().toISOString().split('T')[0],
    estado: 'Pagado', monto: 0, proveedor: '',
    categoria: 'Insumos/Mercaderia', esFactura: false,
    metodo_pago: 'efectivo', recurrente: false,
  });

  const handleImportMasivo = (nuevosGastos: Partial<Gasto>[]) => {
    nuevosGastos.forEach(g => {
      addGasto(g as Omit<Gasto, 'id'>);
    });
  };

  const [periodoSeleccionado, setPeriodoSeleccionado] = useState('este_mes');
  const [filtrosPeriodo, setFiltrosPeriodo] = useState({
    fechaInicio: '',
    fechaFin: ''
  });

  /** Rango de mes natural, en ISO 'YYYY-MM-DD', para reutilizar fuera del efecto. */
  const rangoMes = (offset: number) => {
    const hoy = new Date();
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth() + offset, 1).toISOString().split('T')[0];
    const fin = new Date(hoy.getFullYear(), hoy.getMonth() + offset + 1, 0).toISOString().split('T')[0];
    return { inicio, fin };
  };

  useEffect(() => {
    if (periodoSeleccionado === 'personalizado') return;

    const { inicio, fin } = periodoSeleccionado === 'mes_anterior' ? rangoMes(-1) : rangoMes(0);
    setFiltrosPeriodo({ fechaInicio: inicio, fechaFin: fin });
  }, [periodoSeleccionado]);

  /** Rango real de datos disponibles: acota hasta donde el usuario puede navegar. */
  const rangoDisponible = useMemo(() => {
    const fechas = gastos.map(g => g.fecha).filter(Boolean).sort();
    if (fechas.length === 0) return null;
    return { min: fechas[0], max: fechas[fechas.length - 1] };
  }, [gastos]);

  /** El rango manual parte con el mes actual; las fechas quedan editables. */
  const elegirPeriodo = (valor: string) => {
    setPeriodoSeleccionado(valor);
    if (valor === 'personalizado') {
      const { inicio, fin } = rangoMes(0);
      setFiltrosPeriodo({ fechaInicio: inicio, fechaFin: fin });
    }
  };

  const etiquetaRango = etiquetaRangoPeriodo(
    periodoSeleccionado === 'personalizado',
    filtrosPeriodo.fechaInicio,
    filtrosPeriodo.fechaFin,
    rangoDisponible
  );

  const fmt = (n: number) => `$${Math.abs(n).toLocaleString('es-CL')}`;

  const gastosFiltrados = useMemo(() =>
    gastos.filter(g => {
      const matchBusqueda = g.proveedor.toLowerCase().includes(busqueda.toLowerCase()) || g.categoria.toLowerCase().includes(busqueda.toLowerCase());
      const matchCat = categoria === 'Todas' || g.categoria === categoria;
      const matchFechaInicio = !filtrosPeriodo.fechaInicio || g.fecha >= filtrosPeriodo.fechaInicio;
      const matchFechaFin = !filtrosPeriodo.fechaFin || g.fecha <= filtrosPeriodo.fechaFin;
      return matchBusqueda && matchCat && matchFechaInicio && matchFechaFin;
    }), [gastos, busqueda, categoria, filtrosPeriodo]);

  const totalGastos = gastosFiltrados.reduce((a, g) => a + g.monto, 0);
  const totalFacturas = gastosFiltrados.filter(g => g.esFactura).reduce((a, g) => a + g.iva, 0);

  const ventaObjetivo = totalGastos * 1.35;
  const totalVentasPeriodo = useMemo(() => {
    return ventas
      .filter(v => {
        const matchFechaInicio = !filtrosPeriodo.fechaInicio || v.fecha >= filtrosPeriodo.fechaInicio;
        const matchFechaFin = !filtrosPeriodo.fechaFin || v.fecha <= filtrosPeriodo.fechaFin;
        return matchFechaInicio && matchFechaFin;
      })
      .reduce((a, v) => a + v.monto, 0);
  }, [ventas, filtrosPeriodo]);

  const porcentajeMeta = ventaObjetivo > 0 ? Math.round((totalVentasPeriodo / ventaObjetivo) * 100) : 0;
  const enNumerosVerdes = totalVentasPeriodo >= ventaObjetivo;

  const porCategoria = useMemo(() => {
    const mapa: Record<string, number> = {};
    gastos.forEach(g => { mapa[g.categoria] = (mapa[g.categoria] || 0) + g.monto; });
    return Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  }, [gastos]);

  /** Base 100 del grafico: la suma de todas las categorias, no solo la mas alta. */
  const totalPorCategoria = useMemo(
    () => porCategoria.reduce((acc, [, monto]) => acc + monto, 0),
    [porCategoria]
  );

  const handleGuardar = () => {
    if (!nuevoGasto.monto || !nuevoGasto.fecha || !nuevoGasto.categoria) return;
    const esFactura = nuevoGasto.esFactura || false;
    const subtotal  = esFactura ? Math.round(Number(nuevoGasto.monto) / 1.19) : Number(nuevoGasto.monto);
    const iva       = esFactura ? Number(nuevoGasto.monto) - subtotal : 0;
    const saldoPendiente = nuevoGasto.estado === 'Por Pagar' ? Number(nuevoGasto.monto) : 0;

    const datos = {
      fecha: nuevoGasto.fecha,
      proveedor: nuevoGasto.proveedor || 'Gasto General',
      categoria: nuevoGasto.categoria,
      monto: Number(nuevoGasto.monto),
      subtotal, iva, esFactura,
      estado: nuevoGasto.estado as 'Pagado' | 'Por Pagar',
      metodo_pago: nuevoGasto.metodo_pago,
      fecha_vencimiento: nuevoGasto.estado === 'Por Pagar' ? nuevoGasto.fecha_vencimiento : undefined,
      recurrente: nuevoGasto.recurrente, dia_recurrente: nuevoGasto.recurrente ? 1 : undefined,
      notas: nuevoGasto.notas,
      saldo_base: saldoPendiente > 0 ? saldoPendiente : undefined,
      saldo_pendiente: saldoPendiente > 0 ? saldoPendiente : undefined,
    };

    if (editingId) {
      updateGasto(editingId, datos);
    } else {
      addGasto(datos);
    }
    setShowModal(false);
    setEditingId(null);
    setNuevoGasto({ fecha: new Date().toISOString().split('T')[0], estado: 'Pagado', monto: 0, proveedor: '', categoria: 'Insumos/Mercaderia', esFactura: false, metodo_pago: 'efectivo', recurrente: false });
  };

  const abrirEdicion = (g: Gasto) => {
    setEditingId(g.id);
    setNuevoGasto({
      fecha: g.fecha,
      estado: (g.estado === 'Por Pagar' ? 'Por Pagar' : 'Pagado'),
      monto: g.monto,
      proveedor: g.proveedor,
      categoria: g.categoria,
      esFactura: g.esFactura,
      metodo_pago: g.metodo_pago,
      recurrente: g.recurrente,
      notas: g.notas,
      fecha_vencimiento: g.fecha_vencimiento,
    });
    setShowModal(true);
  };

  const cerrarModal = () => {
    setShowModal(false);
    setEditingId(null);
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-extrabold text-on-surface flex items-center gap-3">
            <span className="material-symbols-outlined text-error text-4xl">receipt_long</span>
            Gastos y Compras
          </h2>
          <p className="text-on-surface-variant mt-1 text-sm">Registra todos los egresos y controla tu credito fiscal IVA.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowCargaMasiva(true)}
            className="flex items-center gap-2 px-5 py-3 bg-surface-container-lowest text-primary border border-primary/30 rounded-2xl font-bold text-sm shadow-sm hover:bg-primary/5 transition-colors">
            <span className="material-symbols-outlined text-lg">cloud_upload</span>
            Carga Masiva
          </button>
          <button onClick={() => { setEditingId(null); setShowModal(true); }}
            className="flex items-center gap-2 px-5 py-3 bg-error text-inverse-on-surface rounded-2xl font-bold text-sm shadow-lg shadow-error/20 hover:scale-105 transition-transform">
            <span className="material-symbols-outlined text-lg">add_circle</span>
            Registrar Gasto
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center gap-4 flex-wrap">
          <SelectorDesplegable
            icono="calendar_month"
            valor={periodoSeleccionado}
            onChange={elegirPeriodo}
            opciones={OPCIONES_PERIODO}
            hint={etiquetaRango}
          />
          {periodoSeleccionado === 'personalizado' && (
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">Desde</label>
                <SelectorFecha
                  value={filtrosPeriodo.fechaInicio}
                  onChange={fecha => setFiltrosPeriodo(p => ({ ...p, fechaInicio: fecha }))}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">Hasta</label>
                <SelectorFecha
                  value={filtrosPeriodo.fechaFin}
                  onChange={fecha => setFiltrosPeriodo(p => ({ ...p, fechaFin: fecha }))}
                />
              </div>
            </div>
          )}
        </div>

        <TarjetasResumen
          totalVentas={totalVentasPeriodo}
          totalGastos={totalGastos}
          meta={ventaObjetivo}
          porcentajeMeta={porcentajeMeta}
          enNumerosVerdes={enNumerosVerdes}
          etiquetaPeriodo={etiquetaRango}
        />
      </div>

      {porCategoria.length > 0 && (
        <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm p-5 mb-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="font-bold text-on-surface text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-primary">bar_chart</span>
              Categorías de Gasto
            </h3>
            <span className="text-xs text-on-surface-variant font-bold">
              Total {fmt(totalPorCategoria)} · 100%
            </span>
          </div>
          <div className="space-y-2.5">
            {porCategoria.map(([cat, monto]) => {
              const pct = totalPorCategoria > 0 ? (monto / totalPorCategoria) * 100 : 0;
              return (
                <div key={cat} className="flex items-center gap-3">
                  <span className="text-xs text-on-surface-variant font-bold w-36 truncate" title={cat}>{cat}</span>
                  <div className="flex-1 h-2.5 bg-surface-container-high rounded-full overflow-hidden">
                    <div className="h-full bg-error/60 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-extrabold text-on-surface w-14 text-right tabular-nums">
                    {pct.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%
                  </span>
                  <span className="text-xs text-on-surface-variant w-24 text-right tabular-nums">{fmt(monto)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">search</span>
          <input type="text" placeholder="Buscar por proveedor o categoria..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-primary outline-none bg-surface-container-lowest text-on-surface" />
        </div>
        <select value={categoria} onChange={e => setCategoria(e.target.value)}
          className="px-4 py-2.5 border-2 border-outline-variant/50 rounded-xl text-sm font-bold text-on-surface outline-none focus:border-primary bg-surface-container-lowest">
          <option value="Todas">Todas las categorías</option>
          {CATEGORIAS_GASTO.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant/20">
              <tr>
                {['Fecha', 'Proveedor / Concepto', 'Categoria', 'Monto', 'Saldo', 'Metodo', 'Estado', 'Acciones'].map(h => (
                  <th key={h} className="p-4 text-xs font-bold text-outline uppercase tracking-wider text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {gastosFiltrados.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-on-surface-variant">No se encontraron gastos.</td></tr>
              )}
              {gastosFiltrados.map(g => {
                const saldo = getSaldoPendienteGasto(g.id);
                return (
                  <tr key={g.id} className={cn('hover:bg-surface-container-low/50 transition-colors', saldo > 0 ? 'bg-secondary/5' : '')}>
                    <td className="p-4 text-on-surface-variant whitespace-nowrap">{formatFecha(g.fecha)}</td>
                    <td className="p-4">
                      <p className="font-bold text-on-surface">{g.proveedor}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {g.esFactura && <span className="text-[10px] bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded-full">Factura</span>}
                        {g.recurrente && <span className="text-[10px] bg-tertiary/10 text-tertiary font-bold px-1.5 py-0.5 rounded-full">Recurrente</span>}
                      </div>
                    </td>
                    <td className="p-4"><span className="text-xs bg-surface-container-high text-on-surface-variant font-bold px-2 py-1 rounded-full whitespace-nowrap">{g.categoria}</span></td>
                    <td className="p-4 font-bold text-on-surface">{fmt(g.monto)}</td>
                    <td className="p-4 font-bold">
                      {saldo > 0 ? <span className="text-secondary">{fmt(saldo)}</span> : <span className="text-success">$0</span>}
                    </td>
                    <td className="p-4 text-on-surface-variant text-xs capitalize">{g.metodo_pago || '---'}</td>
                    <td className="p-4">
                      <span className={cn('px-2.5 py-1 rounded-full text-xs font-bold',
                        g.estado === 'Pagado' ? 'bg-success-container text-on-success-container' : 'bg-secondary/20 text-secondary')}>
                        {g.estado}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1">
                        <button onClick={() => abrirEdicion(g)}
                          className="p-1.5 text-on-surface-variant hover:text-primary transition-colors rounded-full hover:bg-primary/10">
                          <span className="material-symbols-outlined text-base">edit</span>
                        </button>
                        <button onClick={() => { setItemToDelete(g.id); setDeleteModalOpen(true); }}
                          className="p-1.5 text-on-surface-variant hover:text-error transition-colors rounded-full hover:bg-error/10">
                          <span className="material-symbols-outlined text-base">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-surface-container-low border-t-2 border-outline-variant/30">
              <tr>
                <td colSpan={3} className="p-4 font-extrabold text-on-surface">TOTAL</td>
                <td className="p-4 font-extrabold text-error">{fmt(gastosFiltrados.reduce((a, g) => a + g.monto, 0))}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-scrim/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-outline-variant/20 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-error">{editingId ? 'Editar Gasto' : 'Registrar Gasto'}</h3>
              <button onClick={cerrarModal} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Proveedor / Concepto</label>
                <input type="text" value={nuevoGasto.proveedor} onChange={e => setNuevoGasto({ ...nuevoGasto, proveedor: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-error outline-none bg-surface-container-lowest text-on-surface" placeholder="Ej: CGE, Arriendo local" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Monto Total</label>
                  <input type="number" value={nuevoGasto.monto || ''} onChange={e => setNuevoGasto({ ...nuevoGasto, monto: Number(e.target.value) })}
                    className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl font-bold focus:border-error outline-none bg-surface-container-lowest text-on-surface" placeholder="$0" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Fecha</label>
                  <SelectorFecha value={nuevoGasto.fecha} onChange={fecha => setNuevoGasto({ ...nuevoGasto, fecha: fecha })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Categoria</label>
                  <select value={nuevoGasto.categoria} onChange={e => setNuevoGasto({ ...nuevoGasto, categoria: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-error outline-none bg-surface-container-lowest text-on-surface">
                    {CATEGORIAS_GASTO.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Método de Pago</label>
                  <select value={nuevoGasto.metodo_pago} onChange={e => setNuevoGasto({ ...nuevoGasto, metodo_pago: e.target.value as MetodoPago })}
                    className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-error outline-none bg-surface-container-lowest text-on-surface">
                    {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Estado de Pago</label>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setNuevoGasto({ ...nuevoGasto, estado: 'Pagado' })}
                    className={cn('py-3 rounded-xl border-2 font-bold text-sm transition-all',
                      nuevoGasto.estado === 'Pagado' ? 'border-success/50 bg-success-container text-on-success-container' : 'border-outline-variant/50 text-on-surface-variant hover:border-outline')}>
                    Pagado
                  </button>
                  <button onClick={() => setNuevoGasto({ ...nuevoGasto, estado: 'Por Pagar' })}
                    className={cn('py-3 rounded-xl border-2 font-bold text-sm transition-all',
                      nuevoGasto.estado === 'Por Pagar' ? 'border-secondary bg-secondary/10 text-secondary' : 'border-outline-variant/50 text-on-surface-variant hover:border-outline')}>
                    Por Pagar
                  </button>
                </div>
              </div>

              {nuevoGasto.estado === 'Por Pagar' && (
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Fecha de Vencimiento</label>
                  <SelectorFecha
                    value={nuevoGasto.fecha_vencimiento || ''}
                    onChange={fecha => setNuevoGasto({ ...nuevoGasto, fecha_vencimiento: fecha })}
                  />
                </div>
              )}

              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border-2 border-outline-variant/20 hover:border-primary/30 transition-colors">
                  <input type="checkbox" checked={nuevoGasto.esFactura} onChange={e => setNuevoGasto({ ...nuevoGasto, esFactura: e.target.checked })} className="w-5 h-5 rounded" />
                  <div>
                    <p className="font-bold text-on-surface text-sm">Es una Factura (Credito Fiscal IVA)</p>
                    <p className="text-xs text-on-surface-variant">El IVA de facturas se resta del IVA a pagar en el F29</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border-2 border-outline-variant/20 hover:border-tertiary/30 transition-colors">
                  <input type="checkbox" checked={nuevoGasto.recurrente} onChange={e => setNuevoGasto({ ...nuevoGasto, recurrente: e.target.checked })} className="w-5 h-5 rounded" />
                  <div>
                    <p className="font-bold text-on-surface text-sm">Gasto Recurrente (mensual)</p>
                    <p className="text-xs text-on-surface-variant">Arriendo, luz, internet u otros gastos fijos mensuales</p>
                  </div>
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Notas (opcional)</label>
                <input type="text" value={nuevoGasto.notas || ''} onChange={e => setNuevoGasto({ ...nuevoGasto, notas: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-primary outline-none bg-surface-container-lowest text-on-surface" placeholder="Observaciones..." />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3 shrink-0">
              <button onClick={cerrarModal} className="flex-1 py-3 rounded-2xl border-2 border-outline-variant/50 font-bold text-on-surface-variant">Cancelar</button>
              <button onClick={handleGuardar} className="flex-1 py-3 rounded-2xl bg-error text-inverse-on-surface font-bold shadow-lg shadow-error/20 hover:scale-105 transition-transform">{editingId ? 'Guardar Cambios' : 'Guardar Gasto'}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteModal isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setItemToDelete(null); }}
        onConfirm={() => { if (itemToDelete) deleteGasto(itemToDelete); }}
        title="Eliminar Gasto" />

      {showCargaMasiva && (
        <Suspense fallback={null}>
          <ModalCargaMasivaGastos
            isOpen
            onClose={() => setShowCargaMasiva(false)}
            onImport={handleImportMasivo}
            gastosExistentes={gastos}
          />
        </Suspense>
      )}
    </div>
  );
}
