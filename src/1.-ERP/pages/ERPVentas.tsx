import { useState, useMemo, useEffect, useRef } from 'react';
import { useERP, Venta, VentaProducto } from '../context/ERPContext';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import ModalSincronizacionSII from '../components/ModalSincronizacionSII';
import { DOCUMENT_LABELS, STATUS_LABELS, normalizeDocumentType } from '../services/documentCompliance';
import { cn } from '@/lib/utils';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend, LineChart, Line 
} from 'recharts';

export default function ERPVentas() {
  const { ventas, gastos, clientes, inventario, promociones, documentosTributarios, pagosPOS, addVenta, updateVenta, deleteVenta, previewVentaImpacto } = useERP();
  const [showModal, setShowModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [montoPagado, setMontoPagado] = useState('');
  const [activeTab, setActiveTab] = useState<'lista' | 'analisis'>('lista');

  const [scannerMode, setScannerMode] = useState(false);
  const [scannerInput, setScannerInput] = useState('');
  const scannerRef = useRef<HTMLInputElement>(null);

  const [filtros, setFiltros] = useState({
    fechaInicio: '',
    fechaFin: '',
    estado: 'Todos',
    cliente: '',
    montoMin: '',
    montoMax: ''
  });

  const handleImportSII = (nuevasVentas: Partial<Venta>[]) => {
    nuevasVentas.forEach(v => {
      addVenta(v as any);
    });
  };

  const [nuevaVenta, setNuevaVenta] = useState<Partial<Venta>>({
    fecha: new Date().toISOString().split('T')[0],
    estado: 'Pagado',
    cliente: '',
    productos: [],
    tipo_documento: 'boleta_electronica',
    metodo_pago: 'efectivo',
    modo_integracion: 'sandbox',
  });

  const [productoActual, setProductoActual] = useState({
    productoId: '',
    cantidad: 1,
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

  const stockInsuficiente = productoSeleccionado?.tipo === 'producto' && (productoSeleccionado.stock < productoActual.cantidad);

  const handleScannerSearch = (code: string) => {
    if (!code) return;
    
    const producto = inventario.find(p => p.codigoBarras === code || p.codigo === code);
    
    if (producto) {
      const existingIdx = (nuevaVenta.productos || []).findIndex(p => p.productoId === producto.id);
      
      if (existingIdx >= 0) {
        setNuevaVenta(prev => {
          const newProds = [...(prev.productos || [])];
          const p = newProds[existingIdx];
          const newQty = p.cantidad + 1;
          const subtotalBruto = p.precioBase * newQty;
          
          let descuento = 0;
          if (p.descuentoTipo === 'porcentaje') {
            descuento = subtotalBruto * ((p.descuentoValor || 0) / 100);
          } else if (p.descuentoTipo === 'monto') {
            descuento = (p.descuentoValor || 0);
          }
          
          const subtotalConDesc = Math.max(0, subtotalBruto - descuento);
          let neto = subtotalConDesc;
          let iva = 0;
          let total = subtotalConDesc;

          if (producto.incluyeIva) {
            neto = Math.round(subtotalConDesc / 1.19);
            iva = subtotalConDesc - neto;
          } else {
            iva = Math.round(subtotalConDesc * 0.19);
            total = subtotalConDesc + iva;
          }
          
          newProds[existingIdx] = { ...p, cantidad: newQty, subtotal: neto, iva, total };
          return { ...prev, productos: newProds };
        });
      } else {
        const precioUnitario = producto.precio;
        let neto = precioUnitario;
        let iva = 0;
        let total = precioUnitario;
        if (producto.incluyeIva) {
          neto = Math.round(precioUnitario / 1.19);
          iva = precioUnitario - neto;
        } else {
          iva = Math.round(precioUnitario * 0.19);
          total = precioUnitario + iva;
        }

        const nuevo: VentaProducto = {
          productoId: producto.id,
          productoNombre: producto.nombre,
          cantidad: 1,
          precioBase: precioUnitario,
          costoUnitario: producto.costo,
          subtotal: neto,
          iva,
          total
        };
        setNuevaVenta(prev => ({ ...prev, productos: [...(prev.productos || []), nuevo] }));
      }
      setScannerInput('');
    }
  };

  useEffect(() => {
    if (scannerMode && scannerRef.current && showModal) {
      scannerRef.current.focus();
    }
  }, [scannerMode, showModal]);

  const handleAddProducto = () => {
    if (!productoSeleccionado || stockInsuficiente || productoActual.cantidad < 1) return;

    const precioUnitario = productoSeleccionado.precio;
    const cantidad = productoActual.cantidad;
    const subtotalBruto = precioUnitario * cantidad;
    
    let descuento = 0;
    if (productoActual.descuentoTipo === 'porcentaje') {
      descuento = subtotalBruto * (productoActual.descuentoValor / 100);
    } else if (productoActual.descuentoTipo === 'monto') {
      descuento = productoActual.descuentoValor;
    }
    
    const subtotalConDescuento = Math.max(0, subtotalBruto - descuento);
    
    let iva = 0;
    let total = subtotalConDescuento;
    let subtotalNeto = subtotalConDescuento;

    if (productoSeleccionado.incluyeIva) {
      subtotalNeto = Math.round(subtotalConDescuento / 1.19);
      iva = subtotalConDescuento - subtotalNeto;
      total = subtotalConDescuento;
    } else {
      iva = Math.round(subtotalConDescuento * 0.19);
      total = subtotalConDescuento + iva;
      subtotalNeto = subtotalConDescuento;
    }

    const nuevoProducto: VentaProducto = {
      productoId: productoSeleccionado.id,
      productoNombre: productoSeleccionado.nombre,
      cantidad,
      precioBase: precioUnitario,
      costoUnitario: productoSeleccionado.costo,
      descuentoTipo: productoActual.descuentoTipo,
      descuentoValor: productoActual.descuentoValor,
      descuentoMotivo: productoActual.descuentoMotivo,
      subtotal: subtotalNeto,
      iva,
      total
    };

    setNuevaVenta(prev => ({
      ...prev,
      productos: [...(prev.productos || []), nuevoProducto]
    }));

    setProductoActual({
      productoId: '',
      cantidad: 1,
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

  const totalesVenta = useMemo(() => {
    const prods = nuevaVenta.productos || [];
    const subtotal = prods.reduce((acc, p) => acc + p.subtotal, 0);
    const iva = prods.reduce((acc, p) => acc + p.iva, 0);
    const total = prods.reduce((acc, p) => acc + p.total, 0);
    const costoTotal = prods.reduce((acc, p) => acc + (p.costoUnitario * p.cantidad), 0);
    const margenEstimado = subtotal > 0 ? ((subtotal - costoTotal) / subtotal) * 100 : 0;
    
    return { subtotal, iva, total, margenEstimado };
  }, [nuevaVenta.productos]);

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
      const datos = {
        fecha: nuevaVenta.fecha,
        cliente: nuevaVenta.cliente || 'Cliente General',
        cliente_id: nuevaVenta.cliente_id,
        productos: nuevaVenta.productos,
        subtotal: impactoVenta.neto || impactoVenta.exento || totalesVenta.subtotal,
        iva: impactoVenta.ivaDebito,
        monto: totalesVenta.total,
        margenEstimado: totalesVenta.margenEstimado,
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
        modo_integracion: 'sandbox',
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
      modo_integracion: venta.modo_integracion || 'sandbox',
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
            onClick={() => setShowSyncModal(true)}
            className="px-6 py-3 bg-surface-container-lowest text-primary border border-primary/30 rounded-full text-sm font-bold shadow-sm hover:bg-primary/5 transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">sync</span>
            Sincronizar SII
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
                <th className="px-6 py-4">ID</th>
                <th className="px-6 py-4">Documento</th>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4">Productos</th>
                <th className="px-6 py-4 text-right">Total</th>
                <th className="px-6 py-4 text-right">Margen</th>
                <th className="px-6 py-4 text-center">Estado</th>
                <th className="px-6 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {ventasFiltradas.map((venta) => (
                <tr key={venta.id} className="hover:bg-surface-container-low/30 transition-colors">
                  <td className="px-6 py-4 font-medium text-primary">{venta.id}</td>
                  <td className="px-6 py-4">
                    <p className="text-xs font-black text-on-surface">
                      {DOCUMENT_LABELS[normalizeDocumentType(venta.tipo_documento)]}
                    </p>
                    <p className="text-[10px] text-on-surface-variant/60 font-bold">
                      {venta.estado_documento ? STATUS_LABELS[venta.estado_documento] : 'Documento pendiente'}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-on-surface-variant">{venta.fecha}</td>
                  <td className="px-6 py-4 font-semibold text-on-surface">{venta.cliente}</td>
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
                    {venta.margenEstimado?.toFixed(1)}%
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${venta.estado === 'Pagado' ? 'bg-emerald-100 text-emerald-700' : 'bg-secondary/20 text-secondary'}`}>
                      {venta.estado}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button 
                        onClick={() => abrirEdicion(venta)}
                        className="p-2 text-on-surface-variant hover:text-primary transition-colors rounded-full hover:bg-primary/10"
                        title="Editar"
                      >
                        <span className="material-symbols-outlined text-xl">edit</span>
                      </button>
                      <button 
                        onClick={() => {
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
                <h3 className="text-xl font-bold text-primary">{editingId ? 'Editar venta' : 'Nueva venta guiada'}</h3>
                <p className="text-xs text-on-surface-variant mt-1">Producto / cliente / pago / documento / impacto / confirmacion</p>
              </div>
              <button onClick={cerrarModal} className="text-on-surface-variant hover:text-error transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-grow space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {['1 Producto', '2 Cliente', '3 Pago', '4 Documento', '5 Impacto'].map((paso, idx) => (
                  <div key={paso} className={`rounded-2xl px-3 py-2 text-xs font-black border ${idx < 3 || (nuevaVenta.productos?.length ?? 0) > 0 ? 'bg-primary/5 border-primary/20 text-primary' : 'bg-surface-container-low border-outline-variant/30 text-on-surface-variant/50'}`}>
                    {paso}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Fecha</label>
                  <input 
                    type="date" 
                    value={nuevaVenta.fecha}
                    onChange={(e) => setNuevaVenta({...nuevaVenta, fecha: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface" 
                  />
                </div>
              </div>

              <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/30 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">add_shopping_cart</span>
                    Agregar Producto
                  </h4>
                  <button 
                    onClick={() => setScannerMode(!scannerMode)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-black transition-all border-2",
                      scannerMode 
                        ? "bg-primary text-white border-primary shadow-md" 
                        : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/50 hover:border-primary/50"
                    )}
                  >
                    <span className="material-symbols-outlined text-sm">barcode_scanner</span>
                    {scannerMode ? 'MODO ESCANER ACTIVO' : 'ACTIVAR PISTOLEO'}
                  </button>
                </div>
                
                {scannerMode && (
                  <div className="bg-primary/5 p-4 rounded-xl border border-primary/20 animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-2">Esperando lectura de pistola...</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-primary/50">qr_code_scanner</span>
                      <input 
                        ref={scannerRef}
                        type="text" 
                        value={scannerInput}
                        onChange={(e) => setScannerInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleScannerSearch(scannerInput);
                          }
                        }}
                        placeholder="Escanea el codigo de barras aqui..."
                        className="w-full pl-12 pr-4 py-4 bg-surface-container-lowest border-2 border-primary/30 rounded-2xl text-lg font-bold text-on-surface focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                      />
                    </div>
                    <p className="text-[10px] text-on-surface-variant/60 mt-2 font-medium">El producto se anadira automaticamente al detectar el codigo.</p>
                  </div>
                )}

                <div className={cn("grid grid-cols-1 md:grid-cols-3 gap-4 transition-opacity", scannerMode && "opacity-40 pointer-events-none")}>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Producto / Servicio</label>
                    <select 
                      value={productoActual.productoId}
                      onChange={(e) => setProductoActual({...productoActual, productoId: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface"
                    >
                      <option value="">Seleccionar...</option>
                      {inventario.filter(p => p.estado === 'activo').map(p => (
                        <option key={p.id} value={p.id}>{p.nombre} - ${p.precio.toLocaleString('es-CL')}</option>
                      ))}
                    </select>
                  </div>
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
                </div>

                {productoSeleccionado && (
                  <div className="grid grid-cols-3 gap-4 pt-2 border-t border-outline-variant/20">
                    <div>
                      <label className="block text-xs text-on-surface-variant mb-1">Descuento</label>
                      <select 
                        value={productoActual.descuentoTipo}
                        onChange={(e) => setProductoActual({...productoActual, descuentoTipo: e.target.value as 'porcentaje' | 'monto' | 'ninguno', descuentoValor: 0})}
                        className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface"
                      >
                        <option value="ninguno">Ninguno</option>
                        <option value="porcentaje">Porcentaje (%)</option>
                        <option value="monto">Monto Fijo ($)</option>
                      </select>
                    </div>
                    {productoActual.descuentoTipo !== 'ninguno' && (
                      <>
                        <div>
                          <label className="block text-xs text-on-surface-variant mb-1">Valor</label>
                          <input 
                            type="number" 
                            value={productoActual.descuentoValor || ''}
                            onChange={(e) => setProductoActual({...productoActual, descuentoValor: Number(e.target.value)})}
                            className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface" 
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-on-surface-variant mb-1">Motivo</label>
                          <input 
                            type="text" 
                            value={productoActual.descuentoMotivo}
                            onChange={(e) => setProductoActual({...productoActual, descuentoMotivo: e.target.value})}
                            className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface" 
                            placeholder="Ej: Promo"
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button 
                    onClick={handleAddProducto}
                    disabled={!productoSeleccionado || stockInsuficiente || productoActual.cantidad < 1}
                    className="px-4 py-2 bg-primary/10 text-primary rounded-lg font-bold text-sm hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                              {prod.descuentoMotivo && <span className="block text-[10px] text-on-surface-variant/60">Desc: {prod.descuentoMotivo}</span>}
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
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4 rounded-2xl border border-primary/15 bg-primary/5 p-4">
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
                    <div>
                      <label className="block text-xs font-bold text-primary uppercase tracking-widest mb-1">Metodo de pago</label>
                      <select
                        value={nuevaVenta.metodo_pago}
                        onChange={(e) => setNuevaVenta({ ...nuevaVenta, metodo_pago: e.target.value as Venta['metodo_pago'] })}
                        className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface"
                      >
                        <option value="efectivo">Efectivo</option>
                        <option value="transferencia">Transferencia</option>
                        <option value="debito">Débito</option>
                        <option value="credito">Crédito</option>
                        <option value="mixto">Mixto</option>
                        <option value="cheque">Cheque</option>
                      </select>
                    </div>
                    {impactoVenta.saldoPendiente > 0 && (
                      <div className="md:col-span-3">
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

                  <div className="rounded-2xl bg-inverse-surface p-4 text-inverse-on-surface">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-primary-container font-black">Impacto antes de guardar</p>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-inverse-on-surface/60">Documento</span><span className="font-bold">{DOCUMENT_LABELS[impactoVenta.documento]}</span></div>
                      <div className="flex justify-between"><span className="text-inverse-on-surface/60">IVA debito</span><span className="font-bold">${impactoVenta.ivaDebito.toLocaleString('es-CL')}</span></div>
                      <div className="flex justify-between"><span className="text-inverse-on-surface/60">Caja ahora</span><span className="font-bold">${impactoVenta.impactoCaja.toLocaleString('es-CL')}</span></div>
                      <div className="flex justify-between"><span className="text-inverse-on-surface/60">Por cobrar</span><span className="font-bold">${impactoVenta.impactoCxC.toLocaleString('es-CL')}</span></div>
                      <div className="flex justify-between"><span className="text-inverse-on-surface/60">Stock</span><span className="font-bold">{impactoVenta.impactoStock.length} item(s)</span></div>
                    </div>
                    <p className="mt-3 rounded-xl bg-white/10 p-3 text-xs leading-5 text-inverse-on-surface/75">{impactoVenta.mensajeIntegracion}</p>
                  </div>
                </div>
              )}

              {nuevaVenta.productos && nuevaVenta.productos.length > 0 && (
                <div className="bg-primary/5 p-4 rounded-xl border border-primary/20 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-on-surface-variant">Neto documento:</span>
                    <span className="font-bold text-on-surface">${impactoVenta.neto.toLocaleString('es-CL')}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-on-surface-variant">IVA debito:</span>
                    <span className="font-bold text-on-surface">${impactoVenta.ivaDebito.toLocaleString('es-CL')}</span>
                  </div>
                  {impactoVenta.exento > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-on-surface-variant">Exento/no afecto:</span>
                      <span className="font-bold text-on-surface">${impactoVenta.exento.toLocaleString('es-CL')}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-on-surface-variant">Saldo pendiente:</span>
                    <span className="font-bold text-on-surface">${impactoVenta.saldoPendiente.toLocaleString('es-CL')}</span>
                  </div>
                  <div className="flex justify-between text-lg pt-2 border-t border-primary/20">
                    <span className="font-bold text-primary">Total Final:</span>
                    <span className="font-extrabold text-primary">${totalesVenta.total.toLocaleString('es-CL')}</span>
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

      <ModalSincronizacionSII 
        isOpen={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        onImport={handleImportSII}
        ventasExistentes={ventas}
      />
    </div>
  );
}
