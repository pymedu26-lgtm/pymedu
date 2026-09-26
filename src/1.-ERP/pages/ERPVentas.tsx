import { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import { useERP, Venta, VentaProducto, Producto } from '../context/ERPContext';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { useAuth } from '../../context/AuthContext';
import { DOCUMENT_LABELS, STATUS_LABELS, normalizeDocumentType } from '../services/documentCompliance';
import { cn } from '@/lib/utils';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend, LineChart, Line 
} from 'recharts';

/** El lector de Excel pesa ~400 KB: se descarga solo al abrir la carga masiva, no con la pagina. */
const ModalCargaMasivaVentas = lazy(() => import('../components/ModalCargaMasivaVentas'));

export default function ERPVentas() {
  const { user: userAuth } = useAuth();
  const {
    ventas, gastos, clientes, inventario, promociones, documentosTributarios, pagosPOS, configuracionCumplimiento, addVenta, updateVenta, deleteVenta, previewVentaImpacto
  } = useERP();
  const [showModal, setShowModal] = useState(false);
  const [showCargaMasiva, setShowCargaMasiva] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [montoPagado, setMontoPagado] = useState('');
  const [avisoStock, setAvisoStock] = useState('');
  const [activeTab, setActiveTab] = useState<'lista' | 'analisis'>('lista');

  /** Propina 10% opcional: campo separado (Caja), no infla IVA ni documento tributario. */
  const [aplicarPropina, setAplicarPropina] = useState(false);
  /** Venta seleccionada en la tabla → abre Nota de Venta formato Chile (imprimir/PDF). */
  const [ventaNota, setVentaNota] = useState<Venta | null>(null);

  const [filtros, setFiltros] = useState({
    fechaInicio: '',
    fechaFin: '',
    estado: 'Todos',
    cliente: '',
    montoMin: '',
    montoMax: ''
  });

  const handleImportMasivo = (nuevasVentas: Omit<Venta, 'id'>[]) => {
    nuevasVentas.forEach(v => addVenta(v));
  };

  const [nuevaVenta, setNuevaVenta] = useState<Partial<Venta>>({
    fecha: new Date().toISOString().split('T')[0],
    estado: 'Pagado',
    cliente: '',
    productos: [],
    tipo_documento: 'boleta_electronica',
    metodo_pago: 'efectivo',
    modo_integracion: configuracionCumplimiento.modoIntegracion,
  });

  const [productoActual, setProductoActual] = useState({
    esInventario: true,
    productoId: '',
    nombre: '',
    categoria: '',
    cantidad: 1,
    precio: 0,
    descuentoTipo: 'ninguno' as 'porcentaje' | 'monto' | 'ninguno',
    descuentoValor: 0,
    descuentoMotivo: ''
  });

  const productoSeleccionado = inventario.find(p => p.id === productoActual.productoId);
  const tipoDocumentoNormalizado = normalizeDocumentType(nuevaVenta.tipo_documento);
  const documentosDelMes = documentosTributarios.filter(d => d.periodoTributario === (nuevaVenta.fecha ?? '').slice(0, 7));
  const documentosPendientes = documentosTributarios.filter(d => ['borrador', 'pendiente_emision', 'observado', 'rechazado_sii'].includes(d.estado)).length;
  const pagosSinVenta = pagosPOS.filter(p => p.estadoConciliacion === 'sin_venta').length;
  
  const promocionActiva = useMemo(() => {
    if (!productoSeleccionado || !nuevaVenta.fecha) return null;
    return promociones.find(p => 
      p.estado === 'activa' && 
      p.fechaInicio <= nuevaVenta.fecha! && 
      p.fechaFin >= nuevaVenta.fecha! &&
      (!p.productoId || p.productoId === productoSeleccionado.id)
    );
  }, [productoSeleccionado, nuevaVenta.fecha, promociones]);

  useEffect(() => {
    if (promocionActiva && productoActual.descuentoTipo === 'ninguno' && !productoActual.descuentoMotivo) {
      setProductoActual(prev => ({
        ...prev,
        descuentoTipo: promocionActiva.tipo,
        descuentoValor: promocionActiva.valor,
        descuentoMotivo: promocionActiva.nombre
      }));
    }
  }, [promocionActiva, productoActual.descuentoTipo, productoActual.descuentoMotivo]);

  const cantidadEnVenta = (productoId: string) =>
    (nuevaVenta.productos || [])
      .filter(p => p.productoId === productoId)
      .reduce((acc, p) => acc + (p.cantidad || 0), 0);

const ventaEditada = editingId ? ventas.find(v => v.id === editingId) : undefined;

// Stock originalmente consumido por la venta que se esta editando: al guardar se
// restaura y se vuelve a descontar, por lo que queda disponible como "buffer".
const stockYaReservado = useMemo(() => {
  const mapa: Record<string, number> = {};
  (ventaEditada?.productos ?? []).forEach(pp => {
    mapa[pp.productoId] = (mapa[pp.productoId] || 0) + (pp.cantidad || 0);
  });
  return mapa;
}, [ventaEditada?.id, ventaEditada?.productos]);

// Para el producto seleccionado, el stock disponible considera tambien lo que la
// venta en edicion ya tenia reservado (se restaura al guardar).
const stockDisponible = productoSeleccionado
  ? productoSeleccionado.stock + (editingId ? stockYaReservado[productoActual.productoId] || 0 : 0)
  : 0;

const stockInsuficiente = productoSeleccionado
  ? productoSeleccionado.tipo === 'producto'
      && (cantidadEnVenta(productoActual.productoId) + (productoActual.cantidad || 0)) > stockDisponible
  : false;

  /** Calcula neto e IVA (impuestos Chile, 19%) de un ítem según si el precio incluye IVA. */
  const calcularTotalesItem = (
    precioBase: number,
    cantidad: number,
    descuentoTipo: 'porcentaje' | 'monto' | 'ninguno',
    descuentoValor: number,
    incluyeIva: boolean
  ) => {
    const bruto = precioBase * cantidad;
    let descuento = 0;
    if (descuentoTipo === 'porcentaje') descuento = bruto * (descuentoValor / 100);
    else if (descuentoTipo === 'monto') descuento = descuentoValor;
    const base = Math.max(0, bruto - descuento);
    let subtotal = base, iva = 0, total = base;
    if (incluyeIva) {
      subtotal = Math.round(base / 1.19);
      iva = base - subtotal;
      total = base;
    } else {
      subtotal = base;
      iva = Math.round(base * 0.19);
      total = base + iva;
    }
    return { subtotal, iva, total };
  };

  /** Construye el ítem de venta desde la ficha: producto del inventario (autocompletado) o
   *  texto libre (`TEXTO-LIBRE-*`, no toca stock). El precio/categoría escritos se usan tal cual. */
  const construirItemVenta = (): VentaProducto | null => {
    const nombre = productoActual.nombre.trim();
    const precio = Number(productoActual.precio) || 0;
    const cantidad = Number(productoActual.cantidad) || 1;
    if (!nombre || precio <= 0) return null;

    const esInventario = productoActual.esInventario && !!productoSeleccionado;
    const incluyeIva = esInventario ? !!productoSeleccionado?.incluyeIva : true;
    const aplicaDescuento = esInventario && productoActual.descuentoTipo !== 'ninguno';
    const totales = calcularTotalesItem(
      precio,
      cantidad,
      aplicaDescuento ? productoActual.descuentoTipo : 'ninguno',
      aplicaDescuento ? productoActual.descuentoValor : 0,
      incluyeIva
    );

    return {
      productoId: esInventario ? productoSeleccionado!.id : `TEXTO-LIBRE-${crypto.randomUUID().slice(0, 8)}`,
      productoNombre: nombre,
      esInventariable: esInventario,
      cantidad,
      precioBase: precio,
      costoUnitario: esInventario ? (productoSeleccionado?.costo ?? 0) : 0,
      descuentoTipo: 'ninguno',
      descuentoValor: 0,
      subtotal: totales.subtotal,
      iva: totales.iva,
      total: totales.total,
    };
  };

  const handleAgregarProducto = () => {
    const item = construirItemVenta();
    if (!item) return;

    setNuevaVenta(prev => {
      const prods = prev.productos || [];
      const idx = prods.findIndex(p =>
        (p.esInventariable ?? false) === (item.esInventariable ?? false) &&
        p.productoId === item.productoId
      );
      if (idx >= 0) {
        const actual = prods[idx];
        const cantidadTotal = actual.cantidad + item.cantidad;
        const incluyeIva = item.total === item.precioBase * item.cantidad;
        const totales = calcularTotalesItem(item.precioBase, cantidadTotal, 'ninguno', 0, incluyeIva);
        const newProds = prods.slice();
        newProds[idx] = { ...actual, cantidad: cantidadTotal, subtotal: totales.subtotal, iva: totales.iva, total: totales.total };
        return { ...prev, productos: newProds };
      }
      return { ...prev, productos: [...prods, item] };
    });

    setProductoActual({
      esInventario: true,
      productoId: '',
      nombre: '',
      categoria: '',
      cantidad: 1,
      precio: 0,
      descuentoTipo: 'ninguno',
      descuentoValor: 0,
      descuentoMotivo: ''
    });
  };

  const handleRemoveProducto = (index: number) => {
    setNuevaVenta(prev => {
      const newProductos = [...(prev.productos || [])];
      newProductos.splice(index, 1);
      return { ...prev, productos: newProductos };
    });
  };

  /** Totales de la ficha actual (antes de agregar): para mostrar neto/IVA/total del ítem. */
  const fichaIncluyeIva = productoActual.esInventario
    ? (productoSeleccionado?.incluyeIva ?? true)
    : true;
  const fichaTotales = calcularTotalesItem(
    Number(productoActual.precio) || 0,
    Number(productoActual.cantidad) || 0,
    productoActual.esInventario && productoActual.descuentoTipo !== 'ninguno' ? productoActual.descuentoTipo : 'ninguno',
    productoActual.esInventario && productoActual.descuentoTipo !== 'ninguno' ? productoActual.descuentoValor : 0,
    fichaIncluyeIva
  );
  const fichaValida = productoActual.nombre.trim().length > 0
    && Number(productoActual.precio) > 0
    && Number(productoActual.cantidad) >= 1
    && !stockInsuficiente;

  const totalesVenta = useMemo(() => {
    const prods = nuevaVenta.productos || [];
    const subtotal = prods.reduce((acc, p) => acc + p.subtotal, 0);
    const iva = prods.reduce((acc, p) => acc + p.iva, 0);
    const total = prods.reduce((acc, p) => acc + p.total, 0);
    const costoTotal = prods.reduce((acc, p) => acc + (p.costoUnitario * p.cantidad), 0);
    const margenEstimado = subtotal > 0 ? ((subtotal - costoTotal) / subtotal) * 100 : 0;
    
    return { subtotal, iva, total, margenEstimado };
  }, [nuevaVenta.productos]);

  const propinaCalculada = aplicarPropina && totalesVenta.subtotal > 0
    ? Math.round(totalesVenta.subtotal * 0.10)
    : 0;

  const impactoVenta = useMemo(() => previewVentaImpacto({
    fecha: nuevaVenta.fecha || new Date().toISOString().split('T')[0],
    cliente: nuevaVenta.cliente || 'Cliente General',
    productos: nuevaVenta.productos || [],
    subtotal: totalesVenta.subtotal,
    iva: totalesVenta.iva,
    monto: totalesVenta.total,
    estado: nuevaVenta.estado as Venta['estado'],
    tipo_documento: tipoDocumentoNormalizado,
    metodo_pago: nuevaVenta.metodo_pago,
    modo_integracion: nuevaVenta.modo_integracion,
    saldo_pendiente: Math.max(0, totalesVenta.total - Number(montoPagado || (nuevaVenta.estado === 'Pagado' ? totalesVenta.total : 0))),
  }, Number(montoPagado || (nuevaVenta.estado === 'Pagado' ? totalesVenta.total : 0))), [previewVentaImpacto, nuevaVenta, totalesVenta, tipoDocumentoNormalizado, montoPagado]);

  useEffect(() => {
    if (showModal && nuevaVenta.estado === 'Pagado' && totalesVenta.total > 0) {
      setMontoPagado(String(totalesVenta.total));
    }
  }, [showModal, nuevaVenta.estado, totalesVenta.total]);

  const [periodoSeleccionado, setPeriodoSeleccionado] = useState('este_mes');

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

    if (periodoSeleccionado !== 'personalizado') {
      setFiltros(prev => ({ ...prev, fechaInicio: inicio, fechaFin: fin }));
    }
  }, [periodoSeleccionado]);

  const ventasFiltradas = useMemo(() => {
    return ventas.filter(v => {
      const matchFechaInicio = !filtros.fechaInicio || v.fecha >= filtros.fechaInicio;
      const matchFechaFin = !filtros.fechaFin || v.fecha <= filtros.fechaFin;
      const matchEstado = filtros.estado === 'Todos' || v.estado === filtros.estado;
      const matchCliente = !filtros.cliente || v.cliente.toLowerCase().includes(filtros.cliente.toLowerCase());
      const matchMontoMin = !filtros.montoMin || v.monto >= Number(filtros.montoMin);
      const matchMontoMax = !filtros.montoMax || v.monto <= Number(filtros.montoMax);
      return matchFechaInicio && matchFechaFin && matchEstado && matchCliente && matchMontoMin && matchMontoMax;
    });
  }, [ventas, filtros]);

  const totalVentas = ventasFiltradas.reduce((acc, v) => acc + v.monto, 0);
  
  const gastosEnPeriodo = useMemo(() => {
    return gastos.filter(g => {
      const matchFechaInicio = !filtros.fechaInicio || g.fecha >= filtros.fechaInicio;
      const matchFechaFin = !filtros.fechaFin || g.fecha <= filtros.fechaFin;
      return matchFechaInicio && matchFechaFin;
    });
  }, [gastos, filtros.fechaInicio, filtros.fechaFin]);

  const totalGastos = gastosEnPeriodo.reduce((acc, g) => acc + g.monto, 0);
  const metaVenta = totalGastos * 1.35;
  const enNumerosVerdes = totalVentas >= metaVenta;
  const porcentajeMeta = metaVenta > 0 ? Math.round((totalVentas / metaVenta) * 100) : 0;

  const datosVentasPorDia = useMemo(() => {
    const ventasPorDia: Record<string, number> = {};
    ventasFiltradas.forEach(v => {
      const dia = v.fecha.split('-')[2];
      ventasPorDia[dia] = (ventasPorDia[dia] || 0) + v.monto;
    });
    return Object.entries(ventasPorDia)
      .map(([dia, monto]) => ({ dia: `Dia ${dia}`, monto }))
      .sort((a, b) => a.dia.localeCompare(b.dia));
  }, [ventasFiltradas]);

  const datosVentasPorCategoria = useMemo(() => {
    const ventasPorCat: Record<string, number> = {};
    ventasFiltradas.forEach(v => {
      v.productos.forEach(p => {
        const producto = inventario.find(inv => inv.id === p.productoId);
        const cat = producto?.categoria || 'General';
        ventasPorCat[cat] = (ventasPorCat[cat] || 0) + p.total;
      });
    });
    return Object.entries(ventasPorCat).map(([name, value]) => ({ name, value }));
  }, [ventasFiltradas, inventario]);

  const datosMetodosPago = useMemo(() => {
    const metodos: Record<string, number> = {};
    ventasFiltradas.forEach(v => {
      const met = v.metodo_pago || 'efectivo';
      const label = met.charAt(0).toUpperCase() + met.slice(1);
      metodos[label] = (metodos[label] || 0) + v.monto;
    });
    return Object.entries(metodos).map(([name, value]) => ({ name, value }));
  }, [ventasFiltradas]);

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const handleGuardar = () => {
    if (nuevaVenta.productos && nuevaVenta.productos.length > 0 && nuevaVenta.fecha) {
      const pagoInicial = Number(montoPagado || (nuevaVenta.estado === 'Pagado' ? totalesVenta.total : 0));
      const saldoPendiente = Math.max(0, totalesVenta.total - pagoInicial);

      // Candado de stock: la suma acumulada de cada producto en la venta no puede
      // superar stock actual + (lo que esta venta en edicion ya tenia reservado).
      const itemsPorProducto: Record<string, number> = {};
      (nuevaVenta.productos || []).forEach(pp => {
        itemsPorProducto[pp.productoId] = (itemsPorProducto[pp.productoId] || 0) + (pp.cantidad || 0);
      });
      const productoStockMap: Record<string, Producto> = {};
      inventario.filter(i => i.tipo === 'producto').forEach(prod => { productoStockMap[prod.id] = prod as Producto; });
      for (const pp of nuevaVenta.productos) {
        const prod = productoStockMap[pp.productoId];
        if (!prod) continue;
        const disponible = prod.stock + (editingId ? stockYaReservado[pp.productoId] || 0 : 0);
        if (itemsPorProducto[pp.productoId] > disponible) {
          setAvisoStock(`Stock insuficiente para "${prod.nombre}": se necesitan ${itemsPorProducto[pp.productoId]} unidades y hay ${Math.max(0, disponible)} disponibles.`);
          return;
        }
      }
      setAvisoStock('');

      const datos = {
        fecha: nuevaVenta.fecha,
        cliente: nuevaVenta.cliente || 'Cliente General',
        cliente_id: nuevaVenta.cliente_id,
        productos: nuevaVenta.productos,
        subtotal: impactoVenta.neto || impactoVenta.exento || totalesVenta.subtotal,
        iva: impactoVenta.ivaDebito,
        monto: totalesVenta.total,
        margenEstimado: totalesVenta.margenEstimado,
        /** Propina separada de un documento que SI es venta indicada (no infla IVA). */
        propina: propinaCalculada,
        estado: saldoPendiente > 0 ? 'Pendiente' : 'Pagado',
        tipo_documento: tipoDocumentoNormalizado,
        metodo_pago: nuevaVenta.metodo_pago,
        modo_integracion: nuevaVenta.modo_integracion,
        monto_efectivo: nuevaVenta.metodo_pago === 'efectivo' ? pagoInicial : undefined,
        monto_digital: nuevaVenta.metodo_pago !== 'efectivo' ? pagoInicial : undefined,
        saldo_base: saldoPendiente,
        saldo_pendiente: saldoPendiente,
        fecha_vencimiento: saldoPendiente > 0 ? nuevaVenta.fecha_vencimiento : undefined,
        nota: nuevaVenta.nota,
      };
      if (editingId) {
        updateVenta(editingId, datos);
      } else {
        addVenta(datos);
      }
      setShowModal(false);
      setEditingId(null);
      setMontoPagado('');
      setNuevaVenta({
        fecha: new Date().toISOString().split('T')[0],
        estado: 'Pagado',
        cliente: '',
        productos: [],
        tipo_documento: 'boleta_electronica',
        metodo_pago: 'efectivo',
        modo_integracion: configuracionCumplimiento.modoIntegracion,
      });
    }
  };

  const abrirEdicion = (venta: Venta) => {
    setEditingId(venta.id);
    const yaPagado = venta.monto - (venta.saldo_pendiente || 0);
    setMontoPagado(String(Math.max(0, yaPagado)));
    setNuevaVenta({
      fecha: venta.fecha,
      estado: (venta.estado === 'Pendiente' ? 'Pendiente' : 'Pagado'),
      cliente: venta.cliente,
      cliente_id: venta.cliente_id,
      productos: venta.productos,
      tipo_documento: venta.tipo_documento,
      metodo_pago: (venta.metodo_pago as any) || 'efectivo',
      modo_integracion: venta.modo_integracion || configuracionCumplimiento.modoIntegracion,
      fecha_vencimiento: venta.fecha_vencimiento,
      nota: venta.nota,
    });
    setShowModal(true);
  };

  const cerrarModal = () => {
    setShowModal(false);
    setEditingId(null);
  };

  const limpiarFiltros = () => {
    setFiltros({
      fechaInicio: '',
      fechaFin: '',
      estado: 'Todos',
      cliente: '',
      montoMin: '',
      montoMax: ''
    });
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-extrabold text-primary tracking-tight">Ventas</h2>
          <p className="text-on-surface-variant mt-1">Registra y controla tus ingresos por ventas.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setShowCargaMasiva(true)}
            className="px-6 py-3 bg-surface-container-lowest text-primary border border-primary/30 rounded-full text-sm font-bold shadow-sm hover:bg-primary/5 transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">upload_file</span>
            Carga Masiva
          </button>
          <button 
            onClick={() => { setEditingId(null); setShowModal(true); }}
            className="px-6 py-3 bg-primary text-white rounded-full text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            Nueva Venta
          </button>
        </div>
      </div>

      {/* Summary Section */}
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
              <option value="personalizado">Rango Personalizado</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-primary/5 p-6 rounded-2xl shadow-sm border border-primary/20">
            <p className="text-primary text-[10px] font-black uppercase tracking-[0.2em] mb-1">Total de Ventas</p>
            <h3 className="text-3xl font-black text-primary">${totalVentas.toLocaleString('es-CL')}</h3>
            <p className="text-[10px] text-primary/60 mt-2 font-bold uppercase">
              {periodoSeleccionado === 'todos' ? 'Acumulado historico' : 'En el periodo seleccionado'}
            </p>
          </div>
          <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-outline-variant/20">
            <p className="text-on-surface-variant text-[10px] font-black uppercase tracking-[0.2em] mb-1">Total de Gastos (Costos)</p>
            <h3 className="text-3xl font-extrabold text-error">${totalGastos.toLocaleString('es-CL')}</h3>
            <p className="text-[10px] text-on-surface-variant/60 mt-2 font-bold uppercase tracking-tight">Egresos registrados en el periodo</p>
          </div>
          <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-outline-variant/20">
            <p className="text-on-surface-variant text-[10px] font-black uppercase tracking-[0.2em] mb-1">Meta de Ventas al 35%</p>
            <h3 className={`text-3xl font-extrabold ${enNumerosVerdes ? 'text-emerald-600' : 'text-secondary'}`}>${Math.round(metaVenta).toLocaleString('es-CL')}</h3>
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-500 ${enNumerosVerdes ? 'bg-emerald-500' : 'bg-secondary'}`} style={{ width: `${Math.min(100, porcentajeMeta)}%` }} />
              </div>
              <span className={`text-[10px] font-black ${enNumerosVerdes ? 'text-emerald-600' : 'text-secondary'}`}>{porcentajeMeta}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-outline-variant/20">
          <h3 className="text-sm font-bold text-on-surface uppercase tracking-widest mb-4">Ventas por Dia del Mes</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={datosVentasPorDia}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="dia" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} tickFormatter={(val) => `$${val.toLocaleString()}`} />
                <RechartsTooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`$${value.toLocaleString()}`, 'Monto']}
                />
                <Line type="monotone" dataKey="monto" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, fill: '#6366f1' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-outline-variant/20">
            <h3 className="text-sm font-bold text-on-surface uppercase tracking-widest mb-4">Por Categoria</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={datosVentasPorCategoria}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {datosVentasPorCategoria.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-outline-variant/20">
            <h3 className="text-sm font-bold text-on-surface uppercase tracking-widest mb-4">Metodo de Pago</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={datosMetodosPago}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} />
                  <YAxis hide />
                  <RechartsTooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                  <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-outline-variant/20 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold text-on-surface uppercase tracking-widest">Filtros Avanzados</h3>
          <button onClick={limpiarFiltros} className="text-sm text-primary hover:underline font-medium">Limpiar Filtros</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <label className="block text-xs text-on-surface-variant mb-1">Desde</label>
            <input 
              type="date" 
              value={filtros.fechaInicio} 
              onChange={e => {
                setFiltros({...filtros, fechaInicio: e.target.value});
                setPeriodoSeleccionado('personalizado');
              }} 
              className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface" 
            />
          </div>
          <div>
            <label className="block text-xs text-on-surface-variant mb-1">Hasta</label>
            <input 
              type="date" 
              value={filtros.fechaFin} 
              onChange={e => {
                setFiltros({...filtros, fechaFin: e.target.value});
                setPeriodoSeleccionado('personalizado');
              }} 
              className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface" 
            />
          </div>
          <div>
            <label className="block text-xs text-on-surface-variant mb-1">Estado</label>
            <select value={filtros.estado} onChange={e => setFiltros({...filtros, estado: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface">
              <option value="Todos">Todos</option>
              <option value="Pagado">Pagado</option>
              <option value="Pendiente">Pendiente</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-on-surface-variant mb-1">Cliente</label>
            <input type="text" placeholder="Buscar..." value={filtros.cliente} onChange={e => setFiltros({...filtros, cliente: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface" />
          </div>
          <div>
            <label className="block text-xs text-on-surface-variant mb-1">Monto Min.</label>
            <input type="number" placeholder="$0" value={filtros.montoMin} onChange={e => setFiltros({...filtros, montoMin: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface" />
          </div>
          <div>
            <label className="block text-xs text-on-surface-variant mb-1">Monto Max.</label>
            <input type="number" placeholder="$0" value={filtros.montoMax} onChange={e => setFiltros({...filtros, montoMax: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-container-low text-on-surface-variant font-bold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-4">Documento</th>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4">Realizado por</th>
                <th className="px-6 py-4">Productos</th>
                <th className="px-6 py-4 text-right">Total</th>
                <th className="px-6 py-4 text-right">Margen</th>
                <th className="px-6 py-4 text-center">Estado</th>
                <th className="px-6 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {ventasFiltradas.map((venta) => (
                <tr key={venta.id} className="hover:bg-surface-container-low/30 transition-colors cursor-pointer" onClick={() => setVentaNota(venta)}>
                  <td className="px-6 py-4">
                    <p className="text-xs font-black text-on-surface">
                      {DOCUMENT_LABELS[normalizeDocumentType(venta.tipo_documento)]}
                    </p>
                    <p className="text-[10px] text-on-surface-variant/60 font-bold">
                      {venta.estado_documento ? STATUS_LABELS[venta.estado_documento] : 'Documento pendiente'}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-on-surface-variant">{venta.fecha}</td>
                  <td className="px-6 py-4 font-semibold text-on-surface">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm text-primary/70">person</span>
                      {venta.cliente}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-on-surface-variant">
                      <span className="material-symbols-outlined text-sm text-tertiary">badge</span>
                      {venta.creado_por || venta.creado_por_id?.slice(0, 6)?.toUpperCase() || 'Sistema'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-on-surface">
                    {venta.productos.length === 1 ? (
                      <>
                        {venta.productos[0].productoNombre} <span className="text-on-surface-variant text-xs">(x{venta.productos[0].cantidad})</span>
                      </>
                    ) : (
                      <span className="text-sm font-medium text-primary">{venta.productos.length} productos</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right font-extrabold text-on-surface">
                    ${venta.monto.toLocaleString('es-CL')}
                    <span className="block text-[10px] text-on-surface-variant/60 font-normal">IVA: ${venta.iva?.toLocaleString('es-CL')}</span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-emerald-600">
                    {venta.margenEstimado != null ? `${venta.margenEstimado.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${venta.estado === 'Pagado' ? 'bg-emerald-100 text-emerald-700' : 'bg-secondary/20 text-secondary'}`}>
                      {venta.estado}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setVentaNota(venta); }}
                        className="p-2 text-on-surface-variant hover:text-primary transition-colors rounded-full hover:bg-primary/10"
                        title="Ver Nota de Venta (formato Chile)"
                      >
                        <span className="material-symbols-outlined text-xl">receipt_long</span>
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); abrirEdicion(venta); }}
                        className="p-2 text-on-surface-variant hover:text-primary transition-colors rounded-full hover:bg-primary/10"
                        title="Editar"
                      >
                        <span className="material-symbols-outlined text-xl">edit</span>
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setItemToDelete(venta.id);
                          setDeleteModalOpen(true);
                        }}
                        className="p-2 text-on-surface-variant hover:text-error transition-colors rounded-full hover:bg-error/10"
                        title="Eliminar"
                      >
                        <span className="material-symbols-outlined text-xl">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {ventasFiltradas.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-on-surface-variant">
                    No se encontraron ventas con los filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Nueva Venta */}
      {showModal && (
        <div className="fixed inset-0 bg-scrim/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-outline-variant/20 flex justify-between items-center bg-surface-container-low/50 shrink-0">
              <div>
                <h3 className="text-xl font-bold text-primary">{editingId ? 'Editar venta' : 'Nueva venta'}</h3>
              </div>
              <button onClick={cerrarModal} className="text-on-surface-variant hover:text-error transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
<div className="p-6 overflow-y-auto flex-grow space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Cliente</label>
                  <select
                    value={nuevaVenta.cliente_id || ''}
                    onChange={(e) => {
                      const cliente = clientes.find(c => c.id === e.target.value);
                      setNuevaVenta({ ...nuevaVenta, cliente_id: cliente?.id, cliente: cliente?.nombre ?? '' });
                    }}
                    className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface"
                  >
                    <option value="">Cliente general / nuevo</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.rut ? ` - ${c.rut}` : ''}</option>)}
                  </select>
                  {!nuevaVenta.cliente_id && (
                    <input
                      type="text"
                      value={nuevaVenta.cliente}
                      onChange={(e) => setNuevaVenta({ ...nuevaVenta, cliente: e.target.value })}
                      className="mt-2 w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface"
                      placeholder="Nombre del cliente nuevo"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Fecha de la venta</label>
                  <input 
                    type="date" 
                    value={nuevaVenta.fecha}
                    onChange={(e) => setNuevaVenta({...nuevaVenta, fecha: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Metodo de pago</label>
                  <select
                    value={nuevaVenta.metodo_pago}
                    onChange={(e) => setNuevaVenta({ ...nuevaVenta, metodo_pago: e.target.value as Venta['metodo_pago'] })}
                    className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface"
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="debito">Débito</option>
                    <option value="credito">Crédito</option>
                    <option value="mixto">Mixto</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
              </div>

              <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/30 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">add_shopping_cart</span>
                    Producto o servicio
                  </h4>
                  <label className="flex items-center gap-2 text-xs font-black text-on-surface-variant cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={productoActual.esInventario}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setProductoActual((prev) => ({
                          ...prev,
                          esInventario: on,
                          productoId: on ? prev.productoId : '',
                        }));
                      }}
                      className="accent-primary w-4 h-4"
                    />
                    Es producto del inventario
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Nombre del producto o servicio</label>
                  {productoActual.esInventario ? (
                    <select 
                      value={productoActual.productoId}
                      onChange={(e) => {
                        const sel = inventario.find(x => x.id === e.target.value);
                        setProductoActual((prev) => ({
                          ...prev,
                          productoId: e.target.value,
                          nombre: sel?.nombre ?? '',
                          categoria: sel?.categoria ?? '',
                          precio: sel?.precio ?? 0,
                          cantidad: 1,
                        }));
                      }}
                      className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface"
                    >
                      <option value="">Seleccionar de inventario...</option>
                      {inventario.filter(p => p.estado === 'activo').map(p => (
                        <option key={p.id} value={p.id}>{p.nombre} - ${p.precio.toLocaleString('es-CL')}{p.categoria ? ` (${p.categoria})` : ''}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={productoActual.nombre}
                      onChange={(e) => setProductoActual({ ...productoActual, nombre: e.target.value })}
                      placeholder="Ej: Servicio de reparacion, flete, hora de taller, articulo sin inventario..."
                      className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface"
                    />
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Cantidad</label>
                    <input 
                      type="number" 
                      min="1"
                      value={productoActual.cantidad || ''}
                      onChange={(e) => setProductoActual({...productoActual, cantidad: Number(e.target.value)})}
                      className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface" 
                    />
                    {productoSeleccionado?.tipo === 'producto' && (
                      <p className={`text-xs mt-1 ${stockInsuficiente ? 'text-error font-bold' : 'text-on-surface-variant'}`}>
                        Stock: {productoSeleccionado.stock} {productoSeleccionado.unidadMedida}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Categoría</label>
                    <input 
                      type="text"
                      value={productoActual.categoria}
                      onChange={(e) => setProductoActual({...productoActual, categoria: e.target.value})}
                      placeholder="Ej: Alimentacion, Servicio..."
                      className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Precio unitario ($)</label>
                    <input 
                      type="number" 
                      min="0"
                      value={productoActual.precio || ''}
                      onChange={(e) => setProductoActual({...productoActual, precio: Number(e.target.value)})}
                      placeholder="$0"
                      className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface" 
                    />
                  </div>
                </div>

                <div className="rounded-xl bg-primary/5 border border-primary/15 px-4 py-3 grid grid-cols-2 lg:grid-cols-4 items-center gap-4">
                  <div className="text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/70">Neto</p>
                    <p className="text-base font-bold text-on-surface">${fichaTotales.subtotal.toLocaleString('es-CL')}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/70">IVA 19% (Chile)</p>
                    <p className="text-base font-bold text-primary">${fichaTotales.iva.toLocaleString('es-CL')}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/70">Total ficha</p>
                    <p className="text-base font-extrabold text-on-surface">${fichaTotales.total.toLocaleString('es-CL')}</p>
                  </div>
                  <button 
                    onClick={handleAgregarProducto}
                    disabled={!fichaValida}
                    className="px-4 py-2 bg-primary text-white rounded-lg font-bold text-sm hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                    Agregar a la venta
                  </button>
                </div>
              </div>

              {nuevaVenta.productos && nuevaVenta.productos.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-on-surface uppercase tracking-widest">Productos en esta venta</h4>
                  <div className="border border-outline-variant/30 rounded-xl overflow-hidden">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-surface-container-low text-on-surface-variant">
                        <tr>
                          <th className="px-4 py-2">Producto</th>
                          <th className="px-4 py-2 text-right">Cant.</th>
                          <th className="px-4 py-2 text-right">Total</th>
                          <th className="px-4 py-2 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/20">
                        {nuevaVenta.productos.map((prod, idx) => (
                          <tr key={idx} className="bg-surface-container-lowest">
                            <td className="px-4 py-2">
                              <span className="font-medium text-on-surface">{prod.productoNombre}</span>
                              {prod.esInventariable === false && <span className="block text-[10px] text-on-surface-variant/60">Item libre / no inventariable</span>}
                            </td>
                            <td className="px-4 py-2 text-right">{prod.cantidad}</td>
                            <td className="px-4 py-2 text-right font-bold text-on-surface">${prod.total.toLocaleString('es-CL')}</td>
                            <td className="px-4 py-2 text-center">
                              <button onClick={() => handleRemoveProducto(idx)} className="text-on-surface-variant hover:text-error">
                                <span className="material-symbols-outlined text-sm">close</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {nuevaVenta.productos && nuevaVenta.productos.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-2xl border border-primary/15 bg-primary/5 p-4">
                  <div>
                    <label className="block text-xs font-bold text-primary uppercase tracking-widest mb-1">Documento</label>
                    <select
                      value={tipoDocumentoNormalizado}
                      onChange={(e) => setNuevaVenta({ ...nuevaVenta, tipo_documento: e.target.value as Venta['tipo_documento'] })}
                      className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface"
                    >
                      {Object.entries(DOCUMENT_LABELS).filter(([value]) => value !== 'nota_credito').map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-primary uppercase tracking-widest mb-1">Pago recibido</label>
                    <input
                      type="number"
                      min="0"
                      max={totalesVenta.total}
                      value={montoPagado}
                      onChange={(e) => {
                        setMontoPagado(e.target.value);
                        const saldo = Math.max(0, totalesVenta.total - Number(e.target.value || 0));
                        setNuevaVenta({ ...nuevaVenta, estado: saldo > 0 ? 'Pendiente' : 'Pagado' });
                      }}
                      className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface"
                      placeholder="$0"
                    />
                  </div>
                  {impactoVenta.saldoPendiente > 0 && (
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-primary uppercase tracking-widest mb-1">Fecha compromiso de pago</label>
                      <input
                        type="date"
                        value={nuevaVenta.fecha_vencimiento || ''}
                        onChange={(e) => setNuevaVenta({ ...nuevaVenta, fecha_vencimiento: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface"
                      />
                    </div>
                  )}
                </div>
              )}

              {nuevaVenta.productos && nuevaVenta.productos.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-tertiary/25 bg-tertiary/5 p-4">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary text-xl">restaurant</span>
                      <div>
                        <button 
                          type="button" 
                          onClick={() => setAplicarPropina(!aplicarPropina)}
                          className={cn(
                            "flex items-center gap-2 text-sm font-black uppercase tracking-wide transition-all",
                            aplicarPropina ? "text-tertiary" : "text-on-surface-variant"
                          )}
                        >
                          <span className={`material-symbols-outlined ${aplicarPropina ? 'text-tertiary' : ''}`}>{aplicarPropina ? 'toggle_on' : 'toggle_off'}</span>
                          Propina 10% (opcional)
                        </button>
                        <p className="text-[10px] text-on-surface-variant/70 mt-0.5">Campo separado: no infla IVA ni documento; se registra en Caja como propina.</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] uppercase tracking-widest text-on-surface-variant/70 font-bold">Propina</p>
                      <p className="text-lg font-black text-tertiary">${propinaCalculada.toLocaleString('es-CL')}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-inverse-surface p-4 text-inverse-on-surface space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-inverse-on-surface/60">Neto documento</span><span className="font-bold">${impactoVenta.neto.toLocaleString('es-CL')}</span></div>
                    <div className="flex justify-between"><span className="text-inverse-on-surface/60">IVA debito (Chile)</span><span className="font-bold">${impactoVenta.ivaDebito.toLocaleString('es-CL')}</span></div>
                    {impactoVenta.exento > 0 && (
                      <div className="flex justify-between"><span className="text-inverse-on-surface/60">Exento / no afecto</span><span className="font-bold">${impactoVenta.exento.toLocaleString('es-CL')}</span></div>
                    )}
                    <div className="flex justify-between"><span className="text-inverse-on-surface/60">Saldo pendiente</span><span className="font-bold">${impactoVenta.saldoPendiente.toLocaleString('es-CL')}</span></div>
                    <div className="flex justify-between text-lg pt-2 border-t border-inverse-on-surface/20">
                      <span className="font-bold">Total Final:</span>
                      <span className="font-extrabold">${totalesVenta.total.toLocaleString('es-CL')}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4">
                <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant">Confirmacion simple</p>
                <p className="mt-1 text-sm leading-6 text-on-surface-variant/80">
                  Al guardar se crea la venta, el documento interno, el registro de IVA del periodo,
                  el movimiento de caja por lo pagado, la cuenta por cobrar si queda saldo y la salida de stock.
                </p>
              </div>
            </div>

            {avisoStock && (
              <div className="px-6 py-3 bg-error/10 text-error text-sm font-semibold flex items-center gap-2">
                <span>⚠</span>{avisoStock}
              </div>
            )}
            <div className="px-6 py-4 border-t border-outline-variant/20 flex justify-end gap-3 bg-surface-container-low/50 shrink-0">
              <button onClick={cerrarModal} className="px-6 py-2 rounded-full font-bold text-on-surface-variant hover:bg-surface-container-high/50 transition-colors">
                Cancelar
              </button>
              <button 
                onClick={handleGuardar} 
                disabled={!nuevaVenta.productos || nuevaVenta.productos.length === 0}
                className="px-6 py-2 bg-primary text-white rounded-full font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
              >
                Guardar Venta
              </button>
            </div>
          </div>
        </div>
      )}

        {ventaNota && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
            <div className="nota-venta-sheet w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-surface shadow-2xl">
              <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-outline-variant/30 bg-surface px-5 py-3 print:hidden">
                <h3 className="flex items-center gap-2 text-lg font-black text-on-surface">
                  <span className="material-symbols-outlined text-primary">receipt_long</span>
                  Nota de Venta
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-on-primary transition-colors hover:bg-primary-dark"
                    title="Imprimir / Guardar PDF"
                  >
                    <span className="material-symbols-outlined text-base">print</span>
                    Imprimir / PDF
                  </button>
                  <button
                    onClick={() => setVentaNota(null)}
                    className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
                    title="Cerrar"
                  >
                    <span className="material-symbols-outlined text-xl">close</span>
                  </button>
                </div>
              </div>

              <div className="p-6 text-on-surface">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xl font-black tracking-tight text-on-surface">
                      {DOCUMENT_LABELS[normalizeDocumentType(ventaNota.tipo_documento)] || 'Nota de Venta'}
                    </p>
                    <p className="mt-0.5 text-sm text-on-surface-variant">
                      {ventaNota.estado === 'Pagado' ? 'COMPROBANTE DE PAGO' : 'DOCUMENTO PENDIENTE'}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-bold text-on-surface">Folio: <span className="text-primary">{ventaNota.id}</span></p>
                    <p className="text-on-surface-variant">Fecha: {ventaNota.fecha?.split('T')[0]}</p>
                    {ventaNota.documento_id && (
                      <p className="text-on-surface-variant">Doc. SII: {ventaNota.documento_id}</p>
                    )}
                  </div>
                </div>

                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-primary">Cliente</p>
                    <p className="text-base font-black text-on-surface">{ventaNota.cliente}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${ventaNota.estado === 'Pagado' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {ventaNota.estado}
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-outline-variant/30 bg-surface-container-low/50 text-[11px] uppercase tracking-wider text-on-surface-variant">
                        <th className="px-3 py-2">Descripción</th>
                        <th className="px-3 py-2 text-right">Cant.</th>
                        <th className="px-3 py-2 text-right">P.Unit</th>
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      {ventaNota.productos.map((vp, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2">
                            <p className="font-medium text-on-surface">{vp.productoNombre}</p>
                            {vp.descuentoTipo && vp.descuentoTipo !== 'ninguno' && (
                              <p className="text-[11px] text-primary">
                                Descuento {vp.descuentoValor}{vp.descuentoTipo === 'porcentaje' ? '%' : ''}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-on-surface-variant">{vp.cantidad}</td>
                          <td className="px-3 py-2 text-right text-on-surface-variant">${vp.precioBase.toLocaleString('es-CL')}</td>
                          <td className="px-3 py-2 text-right font-bold text-on-surface">${vp.total.toLocaleString('es-CL')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 ml-auto w-full max-w-xs space-y-1.5 text-sm">
                  <div className="flex justify-between text-on-surface-variant">
                    <span>Subtotal</span>
                    <span className="text-on-surface">${ventaNota.subtotal.toLocaleString('es-CL')}</span>
                  </div>
                  <div className="flex justify-between text-on-surface-variant">
                    <span>IVA (19%)</span>
                    <span className="text-on-surface">${ventaNota.iva.toLocaleString('es-CL')}</span>
                  </div>
                  {ventaNota.propina && ventaNota.propina > 0 && (
                    <div className="flex justify-between text-on-surface-variant">
                      <span>Propina</span>
                      <span className="text-on-surface">${ventaNota.propina.toLocaleString('es-CL')}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-outline-variant/30 pt-2 text-base font-black text-on-surface">
                    <span>Total a cobrar</span>
                    <span>${(ventaNota.monto + (ventaNota.propina || 0)).toLocaleString('es-CL')}</span>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-dashed border-outline-variant/40 pt-3 text-xs text-on-surface-variant print:hidden">
                  <p>
                    <span className="inline-flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">person</span>
                      Realizado por: <span className="font-bold text-on-surface">{ventaNota.creado_por || ventaNota.creado_por_id?.slice(0, 6)?.toUpperCase() || '—'}</span>
                    </span>
                  </p>
                  <p>Método: {ventaNota.metodo_pago || 'No especificado'}</p>
                </div>
                <p className="mt-5 hidden text-center text-[11px] text-on-surface-variant print:block">
                  Gracias por su compra. Documento no válido como factura electrónica ante el SII.
                </p>
              </div>
            </div>
          </div>
        )}

      <ConfirmDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setItemToDelete(null);
        }}
        onConfirm={() => {
          if (itemToDelete) {
            deleteVenta(itemToDelete);
          }
        }}
        title="Eliminar Venta"
      />

      {showCargaMasiva && (
        <Suspense fallback={null}>
          <ModalCargaMasivaVentas
            isOpen
            onClose={() => setShowCargaMasiva(false)}
            onImport={handleImportMasivo}
            ventasExistentes={ventas}
            inventario={inventario}
            modoIntegracion={configuracionCumplimiento.modoIntegracion}
          />
        </Suspense>
      )}
    </div>
  );
}
