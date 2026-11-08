import { useState, useMemo, useEffect, lazy, Suspense, useDeferredValue } from 'react';
import { useERP, Gasto, MetodoPago } from '../context/ERPContext';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import TarjetasResumen from '../components/TarjetasResumen';
import SelectorFecha from '../components/SelectorFecha';
import CampoMoneda from '../../components/CampoMoneda';
import FiltroPeriodo from '../components/FiltroPeriodo';
import SelectorDesplegable, { etiquetaRangoPeriodo, rangoPeriodo } from '../../components/SelectorDesplegable';
import { cn, formatFecha } from '@/lib/utils';
import { formatCLP, rangoMes as rangoMesLocal, rangoUltimosMeses } from '@/lib/fechas';
import { agruparSerie, totalesPor, NOMBRE_GRANULARIDAD } from '@/lib/series';
import GraficoSerie from '../../components/graficos/GraficoSerie';
import GraficoDona from '../../components/graficos/GraficoDona';
import GraficoBarras from '../../components/graficos/GraficoBarras';
import { TarjetaGrafico } from '../../components/graficos/comunes';
import { usePaletaGraficos } from '../../components/graficos/paleta';
import TablaResponsiva, { type ColumnaTabla } from '../../components/TablaResponsiva';
import ModalResponsivo from '../../components/ModalResponsivo';

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
  const paleta = usePaletaGraficos();
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

  /** Rango de mes natural en fechas locales (toISOString() corría el día por UTC). */
  const rangoMes = (offset: number) => rangoMesLocal(offset);

  const rangoUltimos3Meses = () => rangoUltimosMeses(3);

  useEffect(() => {
    const rango = rangoPeriodo(periodoSeleccionado);
    if (rango) setFiltrosPeriodo({ fechaInicio: rango.inicio, fechaFin: rango.fin });
  }, [periodoSeleccionado]);

  useEffect(() => {
    if (periodoSeleccionado === 'personalizado' && !filtrosPeriodo.fechaInicio && !filtrosPeriodo.fechaFin) {
      const { inicio, fin } = rangoUltimos3Meses();
      setFiltrosPeriodo({ fechaInicio: inicio, fechaFin: fin });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Rango real de datos disponibles: acota hasta donde el usuario puede navegar. */
  const rangoDisponible = useMemo(() => {
    const fechas = gastos.map(g => g.fecha).filter(Boolean).sort();
    if (fechas.length === 0) return null;
    return { min: fechas[0], max: fechas[fechas.length - 1] };
  }, [gastos]);

  /** El rango manual parte con últimos 3 meses por defecto. */
  const elegirPeriodo = (valor: string) => {
    setPeriodoSeleccionado(valor);
    if (valor === 'personalizado') {
      const { inicio, fin } = rangoUltimos3Meses();
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

  const busquedaDeferred = useDeferredValue(busqueda);
  const gastosFiltrados = useMemo(() =>
    gastos.filter(g => {
      const matchBusqueda = g.proveedor.toLowerCase().includes(busquedaDeferred.toLowerCase()) || g.categoria.toLowerCase().includes(busquedaDeferred.toLowerCase());
      const matchCat = categoria === 'Todas' || g.categoria === categoria;
      const matchFechaInicio = !filtrosPeriodo.fechaInicio || g.fecha >= filtrosPeriodo.fechaInicio;
      const matchFechaFin = !filtrosPeriodo.fechaFin || g.fecha <= filtrosPeriodo.fechaFin;
      return matchBusqueda && matchCat && matchFechaInicio && matchFechaFin;
    }), [gastos, busquedaDeferred, categoria, filtrosPeriodo]);

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

  /**
   * Gastos dentro del rango elegido (mes actual, mes anterior o rango manual).
   * Es la base del grafico: sigue los filtros de fecha sin arrastrar el buscador
   * ni el desplegable de categoria, que son filtros propios de la tabla.
   */
  const gastosDelPeriodo = useMemo(() =>
    gastos.filter(g => {
      const matchFechaInicio = !filtrosPeriodo.fechaInicio || g.fecha >= filtrosPeriodo.fechaInicio;
      const matchFechaFin = !filtrosPeriodo.fechaFin || g.fecha <= filtrosPeriodo.fechaFin;
      return matchFechaInicio && matchFechaFin;
    }), [gastos, filtrosPeriodo]);

  /* ══ Gráficos ══
   * Tramos continuos sobre TODO el rango elegido (día / semana / mes según su largo):
   * con varios meses ya no se dibuja un punto por fecha con datos. */
  const serieGastos = useMemo(
    () => agruparSerie(gastosDelPeriodo, { inicio: filtrosPeriodo.fechaInicio, fin: filtrosPeriodo.fechaFin }, g => g.fecha, g => ({ monto: g.monto })),
    [gastosDelPeriodo, filtrosPeriodo.fechaInicio, filtrosPeriodo.fechaFin]
  );

  /** Base 100: la suma de todas las categorías del periodo, no solo la más alta. */
  const porCategoria = useMemo(() => totalesPor(gastosDelPeriodo, g => g.categoria, g => g.monto), [gastosDelPeriodo]);
  const totalGastosPeriodo = useMemo(() => porCategoria.reduce((acc, c) => acc + c.valor, 0), [porCategoria]);
  const gastosPorProveedor = useMemo(
    () => totalesPor(gastosDelPeriodo, g => g.proveedor, g => g.monto, 'Sin proveedor'),
    [gastosDelPeriodo]
  );

  /** Pagado vs. por pagar del monto del periodo, con el saldo a hoy (incluye abonos parciales). */
  const estadoPago = useMemo(() => {
    let porPagar = 0;
    let total = 0;
    for (const g of gastosDelPeriodo) {
      total += g.monto;
      porPagar += getSaldoPendienteGasto(g.id);
    }
    return [
      { nombre: 'Pagado', valor: Math.max(0, total - porPagar), color: paleta.ok },
      { nombre: 'Por pagar', valor: porPagar, color: paleta.alerta },
    ];
  }, [gastosDelPeriodo, getSaldoPendienteGasto, paleta]);

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

  const celdaCSV = (valor: unknown) => {
    const s = String(valor ?? '');
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const descargarCSV = (nombreArchivo: string, headers: string[], rows: (string | number)[][]) => {
    const csv = [headers, ...rows].map(e => e.map(celdaCSV).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = nombreArchivo;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportarGastosCSV = () => {
    const headers = ['Fecha', 'Proveedor', 'RUT', 'Categoría', 'Tipo_Documento', 'Folio', 'Subtotal', 'IVA', 'Monto', 'Estado', 'Método_Pago', 'Vencimiento', 'Recurrente', 'Nota'];
    const rows = gastos.map(g => [
      g.fecha,
      g.proveedor,
      g.rut || '',
      g.categoria,
      g.tipo_documento,
      g.folio || '',
      g.subtotal,
      g.iva,
      g.monto,
      g.estado,
      g.metodo_pago,
      g.fecha_vencimiento || '',
      g.recurrente ? 'Sí' : 'No',
      g.nota || '',
    ]);
    descargarCSV(`gastos_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
  };
  const cerrarModal = () => {
    setShowModal(false);
    setEditingId(null);
  };

  const chipEstado = (g: Gasto) => (
    <span className={cn('px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap',
      g.estado === 'Pagado' ? 'bg-success-container text-on-success-container' : 'bg-secondary/20 text-secondary')}>
      {g.estado}
    </span>
  );
  const etiquetasGasto = (g: Gasto) => (g.esFactura || g.recurrente) ? (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {g.esFactura && <span className="text-[10px] bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded-full">Factura</span>}
      {g.recurrente && <span className="text-[10px] bg-tertiary/10 text-tertiary font-bold px-1.5 py-0.5 rounded-full">Recurrente</span>}
    </span>
  ) : null;
  const saldoGasto = (g: Gasto) => {
    const saldo = getSaldoPendienteGasto(g.id);
    return saldo > 0 ? <span className="font-bold text-secondary">{fmt(saldo)}</span> : <span className="font-bold text-success">$0</span>;
  };

  const columnasGastos: ColumnaTabla<Gasto>[] = [
    { clave: 'fecha', titulo: 'Fecha', celda: g => <span className="text-on-surface-variant whitespace-nowrap">{formatFecha(g.fecha)}</span> },
    {
      clave: 'proveedor', titulo: 'Proveedor / Concepto', celda: g => (
        <>
          <p className="font-bold text-on-surface">{g.proveedor}</p>
          {etiquetasGasto(g) && <div className="mt-0.5">{etiquetasGasto(g)}</div>}
        </>
      ),
    },
    { clave: 'categoria', titulo: 'Categoría', celda: g => <span className="text-xs bg-surface-container-high text-on-surface-variant font-bold px-2 py-1 rounded-full whitespace-nowrap">{g.categoria}</span> },
    { clave: 'monto', titulo: 'Monto', celda: g => <span className="font-bold text-on-surface whitespace-nowrap">{fmt(g.monto)}</span> },
    { clave: 'saldo', titulo: 'Saldo', celda: g => <span className="whitespace-nowrap">{saldoGasto(g)}</span> },
    { clave: 'metodo', titulo: 'Método', celda: g => <span className="text-on-surface-variant text-xs capitalize">{g.metodo_pago || '---'}</span> },
    { clave: 'estado', titulo: 'Estado', celda: chipEstado },
  ];

  const botonEncabezado = 'flex min-h-11 grow sm:grow-0 items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-full text-sm font-bold transition-all';
  const claseCampo = 'w-full min-h-11 px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-base sm:text-sm focus:border-error outline-none bg-surface-container-lowest text-on-surface';
  const claseEtiqueta = 'block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5';

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 md:space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-on-surface flex items-center gap-3">
            <span className="material-symbols-outlined text-error text-3xl sm:text-4xl">receipt_long</span>
            Gastos y Compras
          </h2>
          <p className="text-on-surface-variant mt-1 text-sm">Registra todos los egresos y controla tu crédito fiscal IVA.</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <button onClick={() => setShowCargaMasiva(true)}
            className={cn(botonEncabezado, 'bg-surface-container-lowest text-primary border border-primary/30 shadow-sm hover:bg-primary/5')}>
            <span className="material-symbols-outlined text-lg">upload_file</span>
            Carga Masiva
          </button>
          <button onClick={exportarGastosCSV}
            className={cn(botonEncabezado, 'bg-surface-container-lowest text-primary border border-primary/30 shadow-sm hover:bg-primary/5')}>
            <span className="material-symbols-outlined text-lg">download</span>
            Exportar
          </button>
          <button onClick={() => { setEditingId(null); setShowModal(true); }}
            className={cn(botonEncabezado, 'bg-error text-inverse-on-surface shadow-lg shadow-error/20 hover:scale-105 transition-transform')}>
            <span className="material-symbols-outlined text-lg">add</span>
            Registrar Gasto
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <FiltroPeriodo
          periodo={periodoSeleccionado}
          etiqueta={etiquetaRango}
          rango={filtrosPeriodo}
          onPeriodo={elegirPeriodo}
          onRango={rango => setFiltrosPeriodo(prev => ({ ...prev, ...rango }))}
        />

        <TarjetasResumen
          totalVentas={totalVentasPeriodo}
          totalGastos={totalGastos}
          meta={ventaObjetivo}
          porcentajeMeta={porcentajeMeta}
          enNumerosVerdes={enNumerosVerdes}
          etiquetaPeriodo={etiquetaRango}
        />
      </div>

      {/* Gráficos: serie del periodo ancha + estado de pago; categorías (barras con %) + proveedores */}
      {gastosDelPeriodo.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <TarjetaGrafico
            className="lg:col-span-2"
            icono="bar_chart"
            titulo="Gastos por periodo"
            subtitulo={`Monto gastado ${NOMBRE_GRANULARIDAD[serieGastos.granularidad]} · ${etiquetaRango}`}
            extra={`${gastosDelPeriodo.length.toLocaleString('es-CL')} gastos · ${formatCLP(totalGastosPeriodo)}`}
          >
            <GraficoSerie
              puntos={serieGastos.puntos}
              tipo={serieGastos.granularidad === 'dia' ? 'area' : 'barra'}
              series={[{ clave: 'monto', nombre: 'Gastos', color: paleta.egresos }]}
              vacio="Sin gastos en el periodo"
            />
          </TarjetaGrafico>
          <TarjetaGrafico icono="donut_large" titulo="Estado de pago" subtitulo="Monto del periodo según saldo a hoy">
            <GraficoDona items={estadoPago} etiquetaTotal="Gastado" />
          </TarjetaGrafico>
          <TarjetaGrafico
            className="lg:col-span-2"
            icono="category"
            titulo="Categorías de gasto"
            subtitulo={`Participación sobre el total del periodo · ${etiquetaRango}`}
            extra={`Total ${formatCLP(totalGastosPeriodo)} · 100%`}
          >
            <GraficoBarras items={porCategoria} max={8} mostrarPct destacado={categoria !== 'Todas' ? categoria : undefined} />
          </TarjetaGrafico>
          <TarjetaGrafico icono="storefront" titulo="Top proveedores" subtitulo="Mayor monto gastado en el periodo">
            <GraficoBarras items={gastosPorProveedor} max={5} color={paleta.egresos} />
          </TarjetaGrafico>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">search</span>
          <input type="text" enterKeyHint="search" placeholder="Buscar por proveedor o categoría..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
            className="w-full min-h-11 pl-9 pr-4 py-2.5 border-2 border-outline-variant/50 rounded-xl text-base sm:text-sm focus:border-primary outline-none bg-surface-container-lowest text-on-surface" />
        </div>
        <SelectorDesplegable
          valor={categoria}
          onChange={setCategoria}
          opciones={[
            { valor: 'Todas', etiqueta: 'Todas las categorías' },
            ...CATEGORIAS_GASTO.map(c => ({ valor: c, etiqueta: c }))
          ]}
        />
      </div>

      {/* Sin overflow-hidden bajo md: el menú ⋯ de la última tarjeta no debe quedar recortado. */}
      <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm md:overflow-hidden">
        <TablaResponsiva
          filas={gastosFiltrados}
          clave={g => g.id}
          columnas={columnasGastos}
          tituloTarjeta={g => g.proveedor}
          subtituloTarjeta={g => (
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span>{formatFecha(g.fecha)} · {g.categoria}</span>
              {etiquetasGasto(g)}
            </span>
          )}
          insigniaTarjeta={chipEstado}
          datosTarjeta={g => [
            { etiqueta: 'Monto', valor: fmt(g.monto) },
            { etiqueta: 'Saldo', valor: saldoGasto(g) },
            { etiqueta: 'Método', valor: <span className="capitalize">{g.metodo_pago || '---'}</span> },
          ]}
          acciones={g => [
            { etiqueta: 'Editar', icono: 'edit', onClick: () => abrirEdicion(g) },
            { etiqueta: 'Eliminar', icono: 'delete', peligro: true, onClick: () => { setItemToDelete(g.id); setDeleteModalOpen(true); } },
          ]}
          vacio={<p className="p-8 text-center text-on-surface-variant">No se encontraron gastos.</p>}
        />
      </div>

      {showModal && (
        <ModalResponsivo
          titulo={<span className="text-error">{editingId ? 'Editar Gasto' : 'Registrar Gasto'}</span>}
          onCerrar={cerrarModal}
          ancho="sm:max-w-5xl"
          pie={
            <>
              <button type="button" onClick={cerrarModal} className="flex-1 min-h-11 py-3 rounded-2xl border-2 border-outline-variant/50 font-bold text-on-surface-variant">Cancelar</button>
              <button type="button" onClick={handleGuardar} className="flex-1 min-h-11 py-3 rounded-2xl bg-error text-inverse-on-surface font-bold shadow-lg shadow-error/20 hover:scale-105 transition-transform">{editingId ? 'Guardar Cambios' : 'Guardar Gasto'}</button>
            </>
          }
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className={claseEtiqueta}>Proveedor / Concepto</label>
                <input type="text" value={nuevoGasto.proveedor} onChange={e => setNuevoGasto({ ...nuevoGasto, proveedor: e.target.value })}
                  className={claseCampo} placeholder="Ej: CGE, Arriendo local" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={claseEtiqueta}>Monto Total</label>
                  <CampoMoneda valor={nuevoGasto.monto} onChange={monto => setNuevoGasto({ ...nuevoGasto, monto })}
                    className="min-h-11 px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-base sm:text-sm font-bold focus:border-error outline-none bg-surface-container-lowest text-on-surface" />
                </div>
                <div>
                  <label className={claseEtiqueta}>Fecha</label>
                  <SelectorFecha value={nuevoGasto.fecha} onChange={fecha => setNuevoGasto({ ...nuevoGasto, fecha: fecha })} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={claseEtiqueta}>Categoría</label>
                  <SelectorDesplegable
                    className="w-full"
                    valor={nuevoGasto.categoria}
                    onChange={valor => setNuevoGasto({ ...nuevoGasto, categoria: valor })}
                    opciones={CATEGORIAS_GASTO.map(c => ({ valor: c, etiqueta: c }))}
                  />
                </div>
                <div>
                  <label className={claseEtiqueta}>Método de Pago</label>
                  <SelectorDesplegable
                    className="w-full"
                    valor={nuevoGasto.metodo_pago}
                    onChange={valor => setNuevoGasto({ ...nuevoGasto, metodo_pago: valor as MetodoPago })}
                    opciones={METODOS.map(m => ({ valor: m.value, etiqueta: m.label }))}
                  />
                </div>
              </div>

              <div>
                <label className={claseEtiqueta}>Estado de Pago</label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setNuevoGasto({ ...nuevoGasto, estado: 'Pagado' })}
                    className={cn('min-h-11 py-3 rounded-xl border-2 font-bold text-sm transition-all',
                      nuevoGasto.estado === 'Pagado' ? 'border-success/50 bg-success-container text-on-success-container' : 'border-outline-variant/50 text-on-surface-variant hover:border-outline')}>
                    Pagado
                  </button>
                  <button type="button" onClick={() => setNuevoGasto({ ...nuevoGasto, estado: 'Por Pagar' })}
                    className={cn('min-h-11 py-3 rounded-xl border-2 font-bold text-sm transition-all',
                      nuevoGasto.estado === 'Por Pagar' ? 'border-secondary bg-secondary/10 text-secondary' : 'border-outline-variant/50 text-on-surface-variant hover:border-outline')}>
                    Por Pagar
                  </button>
                </div>
              </div>

              {nuevoGasto.estado === 'Por Pagar' && (
                <div>
                  <label className={claseEtiqueta}>Fecha de Vencimiento</label>
                  <SelectorFecha
                    value={nuevoGasto.fecha_vencimiento || ''}
                    onChange={fecha => setNuevoGasto({ ...nuevoGasto, fecha_vencimiento: fecha })}
                  />
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border-2 border-outline-variant/20 hover:border-primary/30 transition-colors">
                  <input type="checkbox" checked={nuevoGasto.esFactura} onChange={e => setNuevoGasto({ ...nuevoGasto, esFactura: e.target.checked })} className="w-5 h-5 shrink-0 rounded" />
                  <div className="min-w-0">
                    <p className="font-bold text-on-surface text-sm">Es una factura (crédito fiscal IVA)</p>
                    <p className="text-xs text-on-surface-variant">El IVA de facturas se resta del IVA a pagar en el F29</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border-2 border-outline-variant/20 hover:border-tertiary/30 transition-colors">
                  <input type="checkbox" checked={nuevoGasto.recurrente} onChange={e => setNuevoGasto({ ...nuevoGasto, recurrente: e.target.checked })} className="w-5 h-5 shrink-0 rounded" />
                  <div className="min-w-0">
                    <p className="font-bold text-on-surface text-sm">Gasto Recurrente (mensual)</p>
                    <p className="text-xs text-on-surface-variant">Arriendo, luz, internet u otros gastos fijos mensuales</p>
                  </div>
                </label>
              </div>

              <div>
                <label className={claseEtiqueta}>Notas (opcional)</label>
                <input type="text" value={nuevoGasto.notas || ''} onChange={e => setNuevoGasto({ ...nuevoGasto, notas: e.target.value })}
                  className={cn(claseCampo, 'focus:border-primary')} placeholder="Observaciones..." />
              </div>
            </div>
          </div>
        </ModalResponsivo>
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
