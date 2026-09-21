import { useState, useMemo, useEffect } from 'react';
import { useERP, Gasto, MetodoPago } from '../context/ERPContext';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import ModalSincronizacionSIICompras from '../components/ModalSincronizacionSIICompras';
import { cn, formatFecha } from '@/lib/utils';

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
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nuevoGasto, setNuevoGasto] = useState<Partial<Gasto>>({
    fecha: new Date().toISOString().split('T')[0],
    estado: 'Pagado', monto: 0, proveedor: '',
    categoria: 'Insumos/Mercaderia', esFactura: false,
    metodo_pago: 'efectivo', recurrente: false,
  });

  const handleImportSII = (nuevosGastos: Partial<Gasto>[]) => {
    nuevosGastos.forEach(g => {
      addGasto(g as any);
    });
  };

  const [periodoSeleccionado, setPeriodoSeleccionado] = useState('este_mes');
  const [filtrosPeriodo, setFiltrosPeriodo] = useState({
    fechaInicio: '',
    fechaFin: ''
  });

  useEffect(() => {
    const hoy = new Date();
    let inicio = '';
    let fin = '';

    switch (periodoSeleccionado) {
      case 'este_mes':
        inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
        fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().split('T')[0];
        break;
      case 'mes_anterior':
        inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1).toISOString().split('T')[0];
        fin = new Date(hoy.getFullYear(), hoy.getMonth(), 0).toISOString().split('T')[0];
        break;
      case 'este_anio':
        inicio = `${hoy.getFullYear()}-01-01`;
        fin = `${hoy.getFullYear()}-12-31`;
        break;
      case 'todos':
        inicio = '';
        fin = '';
        break;
    }

    setFiltrosPeriodo({ fechaInicio: inicio, fechaFin: fin });
  }, [periodoSeleccionado]);

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
    return Object.entries(mapa).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [gastos]);
  const maxCategoria = porCategoria[0]?.[1] || 1;

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
          <button onClick={() => setShowSyncModal(true)}
            className="flex items-center gap-2 px-5 py-3 bg-surface-container-lowest text-error border border-error/30 rounded-2xl font-bold text-sm shadow-sm hover:bg-error/5 transition-colors">
            <span className="material-symbols-outlined text-lg">sync</span>
            Sincronizar SII
          </button>
          <button onClick={() => { setEditingId(null); setShowModal(true); }}
            className="flex items-center gap-2 px-5 py-3 bg-error text-white rounded-2xl font-bold text-sm shadow-lg shadow-error/20 hover:scale-105 transition-transform">
            <span className="material-symbols-outlined text-lg">add_circle</span>
            Registrar Gasto
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 bg-surface-container-lowest px-4 py-2 rounded-xl border border-outline-variant/50 shadow-sm">
            <span className="material-symbols-outlined text-outline text-sm">calendar_month</span>
            <select 
              value={periodoSeleccionado}
              onChange={(e) => setPeriodoSeleccionado(e.target.value)}
              className="text-xs font-bold text-on-surface-variant bg-transparent outline-none cursor-pointer uppercase tracking-wider"
            >
              <option value="este_mes">Este Mes</option>
              <option value="mes_anterior">Mes Anterior</option>
              <option value="este_anio">Este Año</option>
              <option value="todos">Todo el Historial</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-primary/5 p-6 rounded-2xl shadow-sm border border-primary/20">
            <p className="text-primary text-[10px] font-black uppercase tracking-[0.2em] mb-1">Total de Ventas</p>
            <h3 className="text-3xl font-black text-primary">{fmt(totalVentasPeriodo)}</h3>
            <p className="text-[10px] text-primary/60 mt-2 font-bold uppercase">
              {periodoSeleccionado === 'todos' ? 'Acumulado histórico' : 'En el periodo seleccionado'}
            </p>
          </div>
          <div className="bg-error/5 p-6 rounded-2xl shadow-sm border border-error/20">
            <p className="text-error text-[10px] font-black uppercase tracking-[0.2em] mb-1">Total de Gastos (Costos)</p>
            <h3 className="text-3xl font-extrabold text-error">{fmt(totalGastos)}</h3>
            <p className="text-[10px] text-error/60 mt-2 font-bold uppercase tracking-tight">Egresos registrados en el periodo</p>
          </div>
          <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-outline-variant/20">
            <p className="text-on-surface-variant text-[10px] font-black uppercase tracking-[0.2em] mb-1">Meta de Ventas al 35%</p>
            <h3 className={`text-3xl font-extrabold ${enNumerosVerdes ? 'text-emerald-600' : 'text-secondary'}`}>{fmt(Math.round(ventaObjetivo))}</h3>
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-500 ${enNumerosVerdes ? 'bg-emerald-500' : 'bg-secondary'}`} style={{ width: `${Math.min(100, porcentajeMeta)}%` }} />
              </div>
              <span className={`text-[10px] font-black ${enNumerosVerdes ? 'text-emerald-600' : 'text-secondary'}`}>{porcentajeMeta}%</span>
            </div>
          </div>
        </div>
      </div>

      {porCategoria.length > 0 && (
        <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm p-5 mb-5">
          <h3 className="font-bold text-on-surface text-sm mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-primary">bar_chart</span>
            Top Categorías de Gasto
          </h3>
          <div className="space-y-2.5">
            {porCategoria.map(([cat, monto]) => (
              <div key={cat} className="flex items-center gap-3">
                <span className="text-xs text-on-surface-variant font-bold w-36 truncate">{cat}</span>
                <div className="flex-1 h-2.5 bg-surface-container-high rounded-full overflow-hidden">
                  <div className="h-full bg-error/60 rounded-full transition-all duration-500"
                    style={{ width: `${(monto / maxCategoria) * 100}%` }} />
                </div>
                <span className="text-xs font-extrabold text-on-surface-variant w-24 text-right">{fmt(monto)}</span>
              </div>
            ))}
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
                {['ID', 'Fecha', 'Proveedor / Concepto', 'Categoria', 'Monto', 'Saldo', 'Metodo', 'Estado', 'Acciones'].map(h => (
                  <th key={h} className="p-4 text-xs font-bold text-outline uppercase tracking-wider text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {gastosFiltrados.length === 0 && (
                <tr><td colSpan={9} className="p-8 text-center text-on-surface-variant">No se encontraron gastos.</td></tr>
              )}
              {gastosFiltrados.map(g => {
                const saldo = getSaldoPendienteGasto(g.id);
                return (
                  <tr key={g.id} className={cn('hover:bg-surface-container-low/50 transition-colors', saldo > 0 ? 'bg-secondary/5' : '')}>
                    <td className="p-4 font-mono text-xs text-outline">{g.id}</td>
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
                      {saldo > 0 ? <span className="text-secondary">{fmt(saldo)}</span> : <span className="text-emerald-600">$0</span>}
                    </td>
                    <td className="p-4 text-on-surface-variant text-xs capitalize">{g.metodo_pago || '---'}</td>
                    <td className="p-4">
                      <span className={cn('px-2.5 py-1 rounded-full text-xs font-bold',
                        g.estado === 'Pagado' ? 'bg-emerald-100 text-emerald-700' : 'bg-secondary/20 text-secondary')}>
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
                <td colSpan={4} className="p-4 font-extrabold text-on-surface">TOTAL</td>
                <td className="p-4 font-extrabold text-error">{fmt(gastosFiltrados.reduce((a, g) => a + g.monto, 0))}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-scrim/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
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
                  <input type="date" value={nuevoGasto.fecha} onChange={e => setNuevoGasto({ ...nuevoGasto, fecha: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-error outline-none bg-surface-container-lowest text-on-surface" />
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
                      nuevoGasto.estado === 'Pagado' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-outline-variant/50 text-on-surface-variant hover:border-outline')}>
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
                  <input type="date" value={nuevoGasto.fecha_vencimiento || ''} onChange={e => setNuevoGasto({ ...nuevoGasto, fecha_vencimiento: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-secondary/30 rounded-xl text-sm focus:border-secondary outline-none bg-surface-container-lowest text-on-surface" />
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
              <button onClick={handleGuardar} className="flex-1 py-3 rounded-2xl bg-error text-white font-bold shadow-lg shadow-error/20 hover:scale-105 transition-transform">{editingId ? 'Guardar Cambios' : 'Guardar Gasto'}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteModal isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setItemToDelete(null); }}
        onConfirm={() => { if (itemToDelete) deleteGasto(itemToDelete); }}
        title="Eliminar Gasto" />

      <ModalSincronizacionSIICompras 
        isOpen={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        onImport={handleImportSII}
        gastosExistentes={gastos}
      />
    </div>
  );
}
