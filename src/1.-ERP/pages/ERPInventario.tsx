import { useState, useMemo, useRef, useEffect, type ChangeEvent } from 'react';
import { useERP, Producto, MovimientoInventario } from '../context/ERPContext';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { cn } from '@/lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';

export default function ERPInventario() {
  const { inventario, movimientosInventario, proveedores, addProducto, editProducto, deleteProducto, addMovimientoInventario } = useERP();
  const [activeTab, setActiveTab] = useState<'lista' | 'movimientos' | 'herramientas' | 'toma'>('lista');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [showModal, setShowModal] = useState(false);
  const [showMovimientoModal, setShowMovimientoModal] = useState(false);
  const [showHistorialModal, setShowHistorialModal] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const [conteoFisico, setConteoFisico] = useState<Record<string, number>>({});
  const [tomaScannerInput, setTomaScannerInput] = useState('');
  const tomaScannerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeTab === 'toma' && tomaScannerRef.current) {
      tomaScannerRef.current.focus();
    }
  }, [activeTab]);

  const [bulkCategory, setBulkCategory] = useState('Todas');
  const [bulkPercentage, setBulkPercentage] = useState(0);
  const [bulkType, setBulkType] = useState<'precio' | 'costo'>('precio');

  const [nuevoProducto, setNuevoProducto] = useState<Partial<Producto>>({
    nombre: '',
    codigo: '',
    codigoBarras: '',
    categoria: 'Mercadería',
    tipo: 'producto',
    tipoOperativo: 'producto_simple',
    descripcion: '',
    costo: 0,
    precio: 0,
    incluyeIva: true,
    stock: 0,
    stockReservado: 0,
    stockMinimo: 0,
    unidadMedida: 'un',
    estado: 'activo',
    proveedorId: ''
  });

  const exportToCSV = () => {
    const headers = ['Nombre', 'Código', 'Categoría', 'Stock', 'Costo', 'Precio Venta', 'Estado'];
    const rows = inventario.map(p => [p.nombre, p.codigo, p.categoria, p.stock, p.costo, p.precio, p.estado]);
    const csvContent = [headers, ...rows].map(e => e.join(';')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `inventario_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportTemplate = () => {
    const headers = ['Nombre*', 'Codigo_SKU', 'Codigo_Barras', 'Categoria*', 'Tipo(producto/servicio)', 'Descripcion', 'Costo*', 'Precio_Venta*', 'Stock_Actual', 'Stock_Minimo', 'Unidad_Medida'];
    const example = ['Ejemplo Producto', 'PROD-001', '780000', 'Mercadería', 'producto', 'Descripción opcional', '5000', '8500', '10', '5', 'un'];
    const csvContent = [headers, example].map(e => e.join(';')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'plantilla_inventario.csv';
    link.click();
  };

  const importFromCSV = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      const dataLines = lines.slice(1);
      let importados = 0;
      dataLines.forEach(line => {
        if (!line.trim()) return;
        const [nombre, codigo, barras, cat, tipo, desc, costo, precio, stock, minimo, unidad] = line.split(';');
        if (nombre && cat) {
          addProducto({
            nombre: nombre.trim(),
            codigo: codigo?.trim() || '',
            codigoBarras: barras?.trim() || '',
            categoria: cat.trim(),
            tipo: (tipo?.trim().toLowerCase() as any) || 'producto',
            tipoOperativo: tipo?.trim().toLowerCase() === 'servicio' ? 'servicio' : 'producto_simple',
            descripcion: desc?.trim() || '',
            costo: Number(costo) || 0,
            precio: Number(precio) || 0,
            incluyeIva: true,
            stock: Number(stock) || 0,
            stockMinimo: Number(minimo) || 0,
            unidadMedida: unidad?.trim() || 'un',
            estado: 'activo'
          });
          importados++;
        }
      });
      alert(`Se han importado ${importados} productos correctamente.`);
    };
    reader.readAsText(file);
  };

  const handleBulkUpdate = () => {
    if (bulkPercentage === 0) return;
    const affected = inventario.filter(p => bulkCategory === 'Todas' || p.categoria === bulkCategory);
    if (window.confirm(`¿Estás seguro de actualizar el ${bulkType} de ${affected.length} productos en un ${bulkPercentage}%?`)) {
      const factor = 1 + (bulkPercentage / 100);
      affected.forEach(p => {
        const oldValue = (bulkType === 'precio' ? p.precio : p.costo);
        const newValue = Math.round(oldValue * factor);
        editProducto(p.id, { [bulkType]: newValue });
      });
      alert('Actualización masiva completada con éxito.');
      setBulkPercentage(0);
    }
  };

  const [nuevoMovimiento, setNuevoMovimiento] = useState<Partial<MovimientoInventario>>({
    productoId: '',
    tipo: 'ingreso',
    cantidad: 1,
    costoUnitario: 0,
    fecha: new Date().toISOString().split('T')[0],
    motivo: ''
  });

  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'producto' | 'servicio'>('todos');

  const totalProductos = inventario.length;
  const valorInventario = inventario.reduce((acc, p) => acc + (p.stock * p.costo), 0);
  const valorVenta = inventario.reduce((acc, p) => acc + (p.stock * p.precio), 0);
  const productosBajoStock = inventario.filter(p => p.tipo === 'producto' && p.stock <= p.stockMinimo).length;

  const valorizacionPorCategoria = useMemo(() => {
    const mapa: Record<string, { costo: number; venta: number; items: number }> = {};
    inventario.filter(p => p.tipo === 'producto').forEach(p => {
      if (!mapa[p.categoria]) mapa[p.categoria] = { costo: 0, venta: 0, items: 0 };
      mapa[p.categoria].costo += p.stock * p.costo;
      mapa[p.categoria].venta += p.stock * p.precio;
      mapa[p.categoria].items += 1;
    });
    return Object.entries(mapa).sort((a, b) => b[1].costo - a[1].costo);
  }, [inventario]);
  const maxValor = valorizacionPorCategoria[0]?.[1].costo || 1;

  const inventarioFiltrado = useMemo(() =>
    inventario.filter(p => {
      const matchBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.codigo.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.categoria.toLowerCase().includes(busqueda.toLowerCase());
      const matchTipo = filtroTipo === 'todos' || p.tipo === filtroTipo;
      return matchBusqueda && matchTipo;
    }), [inventario, busqueda, filtroTipo]
  );

  const handleEditClick = (producto: Producto) => {
    setEditingId(producto.id);
    setNuevoProducto(producto);
    setShowModal(true);
  };

  const handleMovimientoClick = (productoId: string) => {
    const producto = inventario.find(p => p.id === productoId);
    setNuevoMovimiento({
      productoId,
      tipo: 'ingreso',
      cantidad: 1,
      costoUnitario: producto?.costo || 0,
      fecha: new Date().toISOString().split('T')[0],
      motivo: ''
    });
    setShowMovimientoModal(true);
  };

  const handleHistorialClick = (productoId: string) => {
    setSelectedProductId(productoId);
    setShowHistorialModal(true);
  };

  const handleTomaScanner = (code: string) => {
    if (!code) return;
    const producto = inventario.find(p => p.codigoBarras === code || p.codigo === code);
    if (producto) {
      setConteoFisico(prev => ({
        ...prev,
        [producto.id]: (prev[producto.id] || 0) + 1
      }));
      setTomaScannerInput('');
    }
  };

  const handleApplyAjustes = () => {
    const ajustes = Object.entries(conteoFisico).map(([id, fisico]) => {
      const p = inventario.find(prod => prod.id === id);
      const diferencia = Number(fisico) - (p?.stock || 0);
      return { id, diferencia, fisico };
    }).filter(a => a.diferencia !== 0);

    if (ajustes.length === 0) {
      alert('No hay diferencias que ajustar.');
      return;
    }

    if (window.confirm(`Se realizarán ${ajustes.length} movimientos de ajuste. ¿Continuar?`)) {
      ajustes.forEach(a => {
        addMovimientoInventario({
          productoId: a.id,
          tipo: 'ajuste',
          cantidad: a.diferencia,
          motivo: `Ajuste por Toma de Inventario - Conteo Físico: ${a.fisico}`,
          fecha: new Date().toISOString()
        });
      });
      alert('Inventario sincronizado con éxito.');
      setConteoFisico({});
      setActiveTab('lista');
    }
  };

  const handleGuardar = () => {
    if (nuevoProducto.nombre && nuevoProducto.categoria) {
      const productoData = {
        nombre: nuevoProducto.nombre,
        codigo: nuevoProducto.codigo || '',
        codigoBarras: nuevoProducto.codigoBarras || '',
        categoria: nuevoProducto.categoria,
        tipo: nuevoProducto.tipo || 'producto',
        tipoOperativo: nuevoProducto.tipoOperativo || (nuevoProducto.tipo === 'servicio' ? 'servicio' : 'producto_simple'),
        descripcion: nuevoProducto.descripcion || '',
        costo: Number(nuevoProducto.costo) || 0,
        precio: Number(nuevoProducto.precio) || 0,
        incluyeIva: nuevoProducto.incluyeIva ?? true,
        stock: Number(nuevoProducto.stock) || 0,
        stockReservado: Number(nuevoProducto.stockReservado) || 0,
        stockMinimo: Number(nuevoProducto.stockMinimo) || 0,
        unidadMedida: nuevoProducto.unidadMedida || 'un',
        estado: nuevoProducto.estado || 'activo',
        proveedorId: nuevoProducto.proveedorId || ''
      };

      if (editingId) {
        editProducto(editingId, productoData);
      } else {
        addProducto(productoData);
      }
      
      setShowModal(false);
      setEditingId(null);
      setNuevoProducto({
        nombre: '', codigo: '', codigoBarras: '', categoria: 'Mercadería',
        tipo: 'producto', tipoOperativo: 'producto_simple', descripcion: '',
        costo: 0, precio: 0, incluyeIva: true, stock: 0, stockReservado: 0,
        stockMinimo: 0, unidadMedida: 'un', estado: 'activo', proveedorId: ''
      });
    }
  };

  const handleGuardarMovimiento = () => {
    if (nuevoMovimiento.productoId && nuevoMovimiento.cantidad && nuevoMovimiento.motivo) {
      addMovimientoInventario({
        productoId: nuevoMovimiento.productoId,
        tipo: nuevoMovimiento.tipo as 'ingreso' | 'salida' | 'ajuste' | 'merma' | 'devolucion',
        cantidad: Number(nuevoMovimiento.cantidad),
        costoUnitario: Number(nuevoMovimiento.costoUnitario) || undefined,
        fecha: new Date(nuevoMovimiento.fecha!).toISOString(),
        motivo: nuevoMovimiento.motivo
      });
      setShowMovimientoModal(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 border-b border-outline-variant/30 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-3xl">inventory_2</span>
            </div>
            <h2 className="text-3xl font-black text-on-surface tracking-tight">Gestión de Inventario</h2>
          </div>
          <p className="text-on-surface-variant text-sm font-medium">Control centralizado de existencias, costos y logística operativa.</p>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <button onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2.5 bg-surface-container-lowest border-2 border-outline-variant/30 text-on-surface-variant rounded-xl font-bold text-sm hover:bg-surface-container-low transition-all">
            <span className="material-symbols-outlined text-lg">download</span>
            Exportar
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-105 transition-all">
            <span className="material-symbols-outlined text-lg">add_box</span>
            Nuevo Producto
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex p-1 bg-surface-container-high rounded-2xl w-full sm:w-auto">
          {[
            { id: 'lista', label: 'Inventario', icon: 'list' },
            { id: 'movimientos', label: 'Movimientos', icon: 'swap_horiz' },
            { id: 'toma', label: 'Toma Stock', icon: 'barcode_scanner' },
            { id: 'herramientas', label: 'Herramientas', icon: 'construction' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center justify-center gap-2 flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
                activeTab === tab.id ? "bg-surface-container-lowest text-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              <span className="material-symbols-outlined text-lg">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'lista' && (
          <div className="flex items-center gap-2 bg-surface-container-high p-1 rounded-xl">
            <button onClick={() => setViewMode('table')}
              className={cn("p-2 rounded-lg transition-all", viewMode === 'table' ? "bg-surface-container-lowest text-primary shadow-sm" : "text-outline")}>
              <span className="material-symbols-outlined">table_rows</span>
            </button>
            <button onClick={() => setViewMode('cards')}
              className={cn("p-2 rounded-lg transition-all", viewMode === 'cards' ? "bg-surface-container-lowest text-primary shadow-sm" : "text-outline")}>
              <span className="material-symbols-outlined">grid_view</span>
            </button>
          </div>
        )}
      </div>

      {activeTab === 'lista' && (
        <div className="space-y-6 animate-in fade-in duration-500">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Productos Activos', value: String(totalProductos), icon: 'inventory_2', color: 'text-primary', bg: 'bg-primary/5', border: 'border-primary/20' },
              { label: 'Valorización Costo', value: `$${valorInventario.toLocaleString('es-CL')}`, icon: 'payments', color: 'text-on-surface', bg: 'bg-surface-container-low', border: 'border-outline-variant/30' },
              { label: 'Valorización Venta', value: `$${valorVenta.toLocaleString('es-CL')}`, icon: 'sell', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100' },
              { label: 'Alertas de Stock', value: String(productosBajoStock), icon: 'warning', color: productosBajoStock > 0 ? 'text-error' : 'text-on-surface-variant', bg: productosBajoStock > 0 ? 'bg-error/5' : 'bg-surface-container-low', border: productosBajoStock > 0 ? 'border-error/20' : 'border-outline-variant/30' },
            ].map(k => (
              <div key={k.label} className={cn('p-5 rounded-3xl border-2 transition-all hover:shadow-md', k.bg, k.border)}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-black text-outline uppercase tracking-widest">{k.label}</p>
                  <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center bg-surface-container-lowest shadow-sm', k.color)}>
                    <span className="material-symbols-outlined text-lg">{k.icon}</span>
                  </div>
                </div>
                <p className={cn('text-2xl font-black', k.color)}>{k.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Pie Chart */}
            <div className="lg:col-span-2 bg-surface-container-lowest rounded-3xl border-2 border-outline-variant/20 p-6 shadow-sm">
              <h3 className="text-sm font-black text-outline uppercase tracking-widest mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">pie_chart</span>
                Distribución por Categoría
              </h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={valorizacionPorCategoria.map(([cat, val]) => ({ name: cat, value: val.costo }))}
                      cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value"
                    >
                      {valorizacionPorCategoria.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={['#1B3022', '#C5A059', '#3F2427', '#777775', '#2E5037'][index % 5]} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number) => `$${value.toLocaleString('es-CL')}`}
                    />
                    <Legend verticalAlign="middle" align="right" layout="vertical" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Consejo */}
            <div className="bg-primary rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
              <div className="relative z-10">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60 mb-2">Consejo Logístico</p>
                <h4 className="text-xl font-black mb-4 leading-tight">Optimiza tu capital de trabajo</h4>
                <p className="text-white/80 text-sm leading-relaxed mb-6">
                  Tienes <strong>{productosBajoStock} productos</strong> bajo el stock mínimo. Realiza un ajuste de inventario o genera una orden de compra para evitar quiebres.
                </p>
                <button onClick={() => setActiveTab('herramientas')}
                  className="w-full py-3 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-lg">auto_awesome</span>
                  Ver sugerencias de compra
                </button>
              </div>
              <span className="material-symbols-outlined absolute -bottom-10 -right-10 text-[180px] opacity-10 rotate-12">inventory</span>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-4 bg-surface-container-lowest p-4 rounded-3xl border-2 border-outline-variant/20">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">search</span>
              <input 
                type="text" placeholder="Buscar por nombre, código o categoría..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-surface-container-low border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 outline-none font-medium text-on-surface" 
              />
            </div>
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as any)}
              className="px-4 py-3 bg-surface-container-low border-none rounded-2xl text-sm font-bold text-on-surface-variant outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="todos">Todos los Tipos</option>
              <option value="producto">Productos</option>
              <option value="servicio">Servicios</option>
            </select>
          </div>

          {/* Table / Cards */}
          {viewMode === 'table' ? (
            <div className="bg-surface-container-lowest rounded-3xl border-2 border-outline-variant/20 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-container-low border-b border-outline-variant/20">
                    <tr>
                      {['Código', 'Nombre', 'Categoría', 'Stock', 'Costo', 'Precio Venta', 'Margen', 'Acciones'].map(h => (
                        <th key={h} className="px-6 py-5 font-black text-outline uppercase tracking-widest text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {inventarioFiltrado.map((producto) => {
                      const precioNeto = producto.incluyeIva ? Math.round(producto.precio / 1.19) : producto.precio;
                      const margen = precioNeto > 0 ? ((precioNeto - producto.costo) / precioNeto) * 100 : 0;
                      const alertaStock = producto.tipo === 'producto' && producto.stock <= producto.stockMinimo;
                      const sinStock = producto.tipo === 'producto' && producto.stock === 0;

                      return (
                        <tr key={producto.id} className="group hover:bg-surface-container-low/50 transition-colors">
                          <td className="px-6 py-4">
                            <span className="px-2.5 py-1 bg-surface-container-high text-on-surface-variant rounded-lg font-black text-[10px] uppercase tracking-wider">
                              {producto.codigo || 'S/C'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-on-surface">{producto.nombre}</span>
                              <span className="text-[10px] text-outline font-medium truncate max-w-[150px]">{producto.descripcion}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-[10px] font-black uppercase tracking-wider">
                              {producto.categoria}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {producto.tipo === 'producto' ? (
                              <div className="flex flex-col items-end">
                                <span className={cn(
                                  "font-black text-base",
                                  sinStock ? 'text-error' : alertaStock ? 'text-secondary' : 'text-on-surface'
                                )}>
                                  {producto.stock}
                                </span>
                                <span className="text-[9px] font-bold text-outline uppercase">{producto.unidadMedida}</span>
                                {producto.stockReservado ? (
                                  <span className="text-[9px] font-medium text-primary">({producto.stockReservado} res.)</span>
                                ) : null}
                              </div>
                            ) : (
                              <span className="material-symbols-outlined text-outline/30">settings</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right font-bold text-on-surface-variant">
                            ${producto.costo.toLocaleString('es-CL')}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex flex-col items-end">
                              <span className="font-black text-on-surface">${producto.precio.toLocaleString('es-CL')}</span>
                              <span className="text-[9px] text-outline font-bold uppercase">{producto.incluyeIva ? 'IVA inc.' : '+ IVA'}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className={cn(
                              "px-2.5 py-1 rounded-lg text-[11px] font-black",
                              margen > 30 ? "bg-emerald-100 text-emerald-700" : margen > 15 ? "bg-secondary/10 text-secondary" : "bg-error/10 text-error"
                            )}>
                              {margen.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handleMovimientoClick(producto.id)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-outline hover:bg-primary/10 hover:text-primary transition-all" title="Stock">
                                <span className="material-symbols-outlined text-lg">swap_horiz</span>
                              </button>
                              <button onClick={() => handleEditClick(producto)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-outline hover:bg-primary/10 hover:text-primary transition-all" title="Editar">
                                <span className="material-symbols-outlined text-lg">edit</span>
                              </button>
                              <button onClick={() => { setItemToDelete(producto.id); setDeleteModalOpen(true); }}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-outline hover:bg-error/10 hover:text-error transition-all" title="Eliminar">
                                <span className="material-symbols-outlined text-lg">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {inventarioFiltrado.map(producto => (
                <div key={producto.id} className="bg-surface-container-lowest rounded-3xl border-2 border-outline-variant/20 p-5 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group">
                  <div className="flex justify-between items-start mb-4">
                    <span className="px-3 py-1 bg-surface-container-high text-on-surface-variant rounded-full text-[9px] font-black uppercase tracking-wider">
                      {producto.categoria}
                    </span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEditClick(producto)} className="text-outline hover:text-primary"><span className="material-symbols-outlined text-lg">edit</span></button>
                      <button onClick={() => { setItemToDelete(producto.id); setDeleteModalOpen(true); }} className="text-outline hover:text-error"><span className="material-symbols-outlined text-lg">delete</span></button>
                    </div>
                  </div>
                  
                  <h4 className="text-lg font-black text-on-surface mb-1 truncate">{producto.nombre}</h4>
                  <p className="text-xs text-outline font-bold mb-4 uppercase tracking-tighter">{producto.codigo || 'Sin Código'}</p>
                  
                  <div className="flex items-center gap-4 mb-6">
                    <div className="flex-1 p-3 bg-surface-container-low rounded-2xl">
                      <p className="text-[9px] font-black text-outline uppercase mb-1">Stock</p>
                      <p className={cn(
                        "text-xl font-black",
                        producto.stock <= producto.stockMinimo ? "text-secondary" : "text-on-surface"
                      )}>{producto.stock} <span className="text-[10px] uppercase">{producto.unidadMedida}</span></p>
                    </div>
                    <div className="flex-1 p-3 bg-emerald-50 rounded-2xl">
                      <p className="text-[9px] font-black text-emerald-400 uppercase mb-1">Precio</p>
                      <p className="text-xl font-black text-emerald-700">${producto.precio.toLocaleString('es-CL')}</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => handleMovimientoClick(producto.id)}
                      className="flex-1 py-2.5 bg-primary text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-primary/90 transition-all">
                      <span className="material-symbols-outlined text-base">swap_horiz</span>
                      Ajustar Stock
                    </button>
                    <button onClick={() => handleHistorialClick(producto.id)}
                      className="w-10 h-10 border-2 border-outline-variant/20 text-outline rounded-xl flex items-center justify-center hover:bg-surface-container-low transition-all">
                      <span className="material-symbols-outlined text-lg">history</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {inventarioFiltrado.length === 0 && (
            <div className="bg-surface-container-lowest rounded-3xl border-2 border-dashed border-outline-variant/30 p-20 text-center">
              <span className="material-symbols-outlined text-6xl text-outline/30 mb-4">inventory_2</span>
              <h3 className="text-xl font-black text-on-surface-variant">No se encontraron productos</h3>
              <p className="text-outline text-sm mt-2">Prueba cambiando los filtros o la búsqueda.</p>
            </div>
          )}
        </div>
      )}

      {/* Tab Movimientos */}
      {activeTab === 'movimientos' && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="bg-surface-container-lowest rounded-3xl border-2 border-outline-variant/20 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-outline-variant/20 flex items-center justify-between">
              <h3 className="text-lg font-black text-on-surface">Historial Global de Movimientos</h3>
              <span className="px-4 py-1.5 bg-primary/10 text-primary rounded-full text-xs font-black">
                Últimos 100 registros
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-container-low">
                  <tr>
                    {['Fecha', 'Producto', 'Tipo', 'Cantidad', 'Motivo'].map(h => (
                      <th key={h} className="px-6 py-4 font-black text-outline uppercase tracking-widest text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {movimientosInventario.slice(0, 100).map(mov => {
                    const prod = inventario.find(p => p.id === mov.productoId);
                    return (
                      <tr key={mov.id} className="hover:bg-surface-container-low/50 transition-colors">
                        <td className="px-6 py-4 text-on-surface-variant font-medium">
                          {new Date(mov.fecha).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-6 py-4 font-bold text-on-surface">{prod?.nombre || 'Producto eliminado'}</td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                            mov.tipo === 'ingreso' || mov.tipo === 'devolucion' ? "bg-emerald-100 text-emerald-600" :
                            mov.tipo === 'salida' || mov.tipo === 'merma' ? "bg-error/10 text-error" : "bg-surface-container-high text-on-surface-variant"
                          )}>
                            {mov.tipo}
                          </span>
                        </td>
                        <td className={cn(
                          "px-6 py-4 text-right font-black",
                          mov.tipo === 'ingreso' || mov.tipo === 'devolucion' ? "text-emerald-600" : "text-error"
                        )}>
                          {mov.tipo === 'ingreso' || mov.tipo === 'devolucion' ? '+' : '-'}{mov.cantidad}
                        </td>
                        <td className="px-6 py-4 text-on-surface-variant text-xs italic">{mov.motivo}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab Toma de Inventario */}
      {activeTab === 'toma' && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="bg-primary rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
            <div className="relative z-10 flex flex-col md:flex-row justify-between gap-6">
              <div className="max-w-xl">
                <h3 className="text-2xl font-black mb-2 flex items-center gap-3">
                  <span className="material-symbols-outlined text-3xl">barcode_scanner</span>
                  Toma de Inventario Física
                </h3>
                <p className="text-white/70 text-sm font-medium mb-6">
                  Escanea todos los productos físicamente presentes en tu bodega. El sistema comparará tu conteo con el stock registrado y permitirá realizar ajustes masivos.
                </p>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-white/40">qr_code_scanner</span>
                  <input 
                    ref={tomaScannerRef} type="text" placeholder="Escanea aquí para sumar +1 al conteo..."
                    value={tomaScannerInput} onChange={(e) => setTomaScannerInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleTomaScanner(tomaScannerInput); }}
                    className="w-full pl-12 pr-4 py-4 bg-white/10 border-2 border-white/20 rounded-2xl text-white placeholder:text-white/40 focus:bg-white/20 focus:border-white/40 outline-none transition-all font-bold"
                  />
                </div>
              </div>
              <div className="flex flex-col justify-center items-center bg-white/10 rounded-3xl p-6 border border-white/10 backdrop-blur-sm min-w-[200px]">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-1">Ítems Escaneados</p>
                <p className="text-5xl font-black mb-2">{Object.keys(conteoFisico).length}</p>
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-tight">Diferentes SKUs</p>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-3xl border-2 border-outline-variant/20 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/50">
              <h3 className="text-lg font-black text-on-surface">Resumen de Conciliación</h3>
              <div className="flex gap-3">
                <button onClick={() => setConteoFisico({})}
                  className="px-4 py-2 text-on-surface-variant hover:text-on-surface font-bold text-sm transition-colors">
                  Limpiar Todo
                </button>
                <button onClick={handleApplyAjustes}
                  className="px-6 py-2 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-105 transition-all flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg">sync_alt</span>
                  Aplicar Ajustes de Stock
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-container-low">
                  <tr>
                    {['Producto', 'Stock Sistema', 'Conteo Físico', 'Diferencia', 'Estado'].map((h, i) => (
                      <th key={h} className={cn("px-6 py-4 font-black text-outline uppercase tracking-widest text-[10px]", i >= 1 && "text-right", i === 4 && "text-center")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {Object.entries(conteoFisico).map(([id, fisico]) => {
                    const p = inventario.find(prod => prod.id === id);
                    const sistema = p?.stock || 0;
                    const diferencia = Number(fisico) - sistema;
                    return (
                      <tr key={id} className="hover:bg-surface-container-low/50 transition-colors">
                        <td className="px-6 py-4 font-bold text-on-surface">{p?.nombre}</td>
                        <td className="px-6 py-4 text-right font-medium text-on-surface-variant">{sistema}</td>
                        <td className="px-6 py-4 text-right">
                          <input type="number" value={fisico}
                            onChange={(e) => setConteoFisico(prev => ({ ...prev, [id]: Number(e.target.value) }))}
                            className="w-20 px-2 py-1 bg-surface-container-low border border-outline-variant/30 rounded-lg text-right font-black focus:ring-2 focus:ring-primary/20 outline-none text-on-surface"
                          />
                        </td>
                        <td className={cn(
                          "px-6 py-4 text-right font-black",
                          diferencia > 0 ? "text-emerald-600" : diferencia < 0 ? "text-error" : "text-outline"
                        )}>
                          {diferencia > 0 ? '+' : ''}{diferencia}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                            diferencia === 0 ? "bg-surface-container-high text-outline" : 
                            diferencia > 0 ? "bg-emerald-100 text-emerald-600" : "bg-error/10 text-error"
                          )}>
                            {diferencia === 0 ? 'Correcto' : diferencia > 0 ? 'Sobrante' : 'Faltante'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {Object.keys(conteoFisico).length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center opacity-30">
                          <span className="material-symbols-outlined text-5xl mb-2">inventory</span>
                          <p className="font-bold">Comienza a escanear productos para ver la comparativa.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab Herramientas */}
      {activeTab === 'herramientas' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in duration-500">
          {/* Importación */}
          <div className="bg-surface-container-lowest rounded-3xl border-2 border-outline-variant/20 p-8 shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-primary text-3xl">upload_file</span>
            </div>
            <h3 className="text-2xl font-black text-on-surface mb-2">Carga Masiva</h3>
            <p className="text-on-surface-variant text-sm mb-8 font-medium">Sube tu inventario existente usando nuestra plantilla estandarizada.</p>
            
            <div className="space-y-4">
              <button onClick={exportTemplate}
                className="w-full py-4 bg-surface-container-high text-on-surface rounded-2xl font-bold text-sm hover:bg-surface-container-highest transition-all flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-lg">download_for_offline</span>
                Descargar Plantilla CSV
              </button>
              
              <div className="relative">
                <input type="file" accept=".csv" onChange={importFromCSV} className="hidden" id="import-file" />
                <label htmlFor="import-file"
                  className="w-full py-4 bg-primary text-white rounded-2xl font-black text-sm shadow-xl hover:bg-primary/90 transition-all flex items-center justify-center gap-2 cursor-pointer">
                  <span className="material-symbols-outlined text-lg">publish</span>
                  Subir Archivo de Inventario
                </label>
              </div>
              <p className="text-[10px] text-outline text-center font-medium">Soporta archivos .csv separados por punto y coma (;)</p>
            </div>
          </div>

          {/* Ajuste Masivo */}
          <div className="bg-surface-container-lowest rounded-3xl border-2 border-outline-variant/20 p-8 shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-secondary/10 flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-secondary text-3xl">bolt</span>
            </div>
            <h3 className="text-2xl font-black text-on-surface mb-2">Ajuste Masivo de Valores</h3>
            <p className="text-on-surface-variant text-sm mb-8 font-medium">Actualiza precios o costos de forma automática por categoría.</p>
            
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-outline uppercase tracking-widest mb-2">Tipo de Valor</label>
                <div className="flex p-1 bg-surface-container-high rounded-xl">
                  <button onClick={() => setBulkType('precio')}
                    className={cn("flex-1 py-2 rounded-lg text-xs font-bold transition-all", bulkType === 'precio' ? "bg-surface-container-lowest text-primary shadow-sm" : "text-on-surface-variant")}>Precio Venta</button>
                  <button onClick={() => setBulkType('costo')}
                    className={cn("flex-1 py-2 rounded-lg text-xs font-bold transition-all", bulkType === 'costo' ? "bg-surface-container-lowest text-primary shadow-sm" : "text-on-surface-variant")}>Costo Unitario</button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-outline uppercase tracking-widest mb-2">Categoría</label>
                <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)}
                  className="w-full px-4 py-3 bg-surface-container-low border-none rounded-2xl text-sm font-bold text-on-surface-variant outline-none focus:ring-2 focus:ring-primary/20">
                  <option value="Todas">Todas las categorías</option>
                  {Array.from(new Set(inventario.map(p => p.categoria))).map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-outline uppercase tracking-widest mb-2">Porcentaje de Ajuste</label>
                <div className="relative">
                  <input type="number" value={bulkPercentage} onChange={e => setBulkPercentage(Number(e.target.value))}
                    className="w-full pl-4 pr-12 py-3 bg-surface-container-low border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none text-on-surface" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-outline">%</span>
                </div>
                <p className="mt-2 text-[10px] text-outline font-medium italic">Usa valores negativos para bajar precios (ej: -10).</p>
              </div>

              <button onClick={handleBulkUpdate} disabled={bulkPercentage === 0}
                className="w-full py-4 bg-on-surface text-white rounded-2xl font-black text-sm shadow-xl hover:bg-on-surface/80 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-lg">published_with_changes</span>
                Aplicar Actualización Masiva
              </button>
            </div>
          </div>

          {/* Generador de Etiquetas */}
          <div className="bg-scrim rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden group">
            <div className="relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mb-6">
                <span className="material-symbols-outlined text-white text-3xl">barcode_scanner</span>
              </div>
              <h3 className="text-2xl font-black mb-2">Generador de Etiquetas</h3>
              <p className="text-white/60 text-sm mb-8 font-medium">Imprime códigos de barras y SKU para tu bodega física.</p>
              
              <div className="space-y-4 mb-8">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                  <p className="text-xs font-bold text-white/80">Formato: Carta (A4)</p>
                  <p className="text-[10px] text-white/40 mt-1">30 etiquetas por hoja (65mm x 35mm)</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                  <p className="text-xs font-bold text-white/80">Incluye: Nombre + Código + Precio</p>
                </div>
              </div>

              <button className="w-full py-4 bg-white text-on-surface rounded-2xl font-black text-sm shadow-xl hover:bg-surface-container-low transition-all flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-lg">print</span>
                Preparar Impresión
              </button>
            </div>
            <span className="material-symbols-outlined absolute -top-10 -left-10 text-[200px] opacity-5 rotate-45">qr_code_2</span>
          </div>
        </div>
      )}

      {/* Modal Nuevo Producto / Editar */}
      {showModal && (
        <div className="fixed inset-0 bg-scrim/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant/20 flex justify-between items-center bg-surface-container-low/50">
              <h3 className="text-xl font-bold text-primary">{editingId ? 'Editar Producto' : 'Registrar Nuevo Producto'}</h3>
              <button onClick={() => { setShowModal(false); setEditingId(null); }} className="text-on-surface-variant hover:text-error transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Nombre</label>
                  <input type="text" value={nuevoProducto.nombre} onChange={(e) => setNuevoProducto({...nuevoProducto, nombre: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" placeholder="Ej: Cuaderno Universitario" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Código / SKU</label>
                  <input type="text" value={nuevoProducto.codigo} onChange={(e) => setNuevoProducto({...nuevoProducto, codigo: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" placeholder="Ej: CUAD-001" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Codigo de barras</label>
                  <input type="text" value={nuevoProducto.codigoBarras || ''} onChange={(e) => setNuevoProducto({ ...nuevoProducto, codigoBarras: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" placeholder="Ej: 7800000000000" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Uso operativo</label>
                  <select value={nuevoProducto.tipoOperativo || 'producto_simple'} onChange={(e) => setNuevoProducto({ ...nuevoProducto, tipoOperativo: e.target.value as Producto['tipoOperativo'] })}
                    className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface">
                    <option value="producto_simple">Producto simple</option>
                    <option value="servicio">Servicio</option>
                    <option value="pack">Pack / combo</option>
                    <option value="insumo">Insumo</option>
                    <option value="producto_compuesto">Producto compuesto</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Tipo</label>
                  <select value={nuevoProducto.tipo} onChange={(e) => setNuevoProducto({...nuevoProducto, tipo: e.target.value as 'producto' | 'servicio'})}
                    className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface" disabled={!!editingId}>
                    <option value="producto">Producto (Físico)</option>
                    <option value="servicio">Servicio (Intangible)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Categoría</label>
                  <select value={nuevoProducto.categoria} onChange={(e) => setNuevoProducto({...nuevoProducto, categoria: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface">
                    <option value="Mercadería">Mercadería</option>
                    <option value="Insumos">Insumos</option>
                    <option value="Servicios">Servicios</option>
                    <option value="Otros">Otros</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Descripción</label>
                <textarea value={nuevoProducto.descripcion} onChange={(e) => setNuevoProducto({...nuevoProducto, descripcion: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none resize-none text-on-surface bg-surface-container-lowest" placeholder="Descripción detallada..." rows={2} />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Proveedor Principal</label>
                <select value={nuevoProducto.proveedorId || ''} onChange={(e) => setNuevoProducto({ ...nuevoProducto, proveedorId: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface">
                  <option value="">Sin proveedor asignado</option>
                  {proveedores.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Costo Unitario</label>
                  <input type="number" value={nuevoProducto.costo || ''} onChange={(e) => setNuevoProducto({...nuevoProducto, costo: Number(e.target.value)})}
                    className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" placeholder="$0" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Precio Venta Base</label>
                  <input type="number" value={nuevoProducto.precio || ''} onChange={(e) => setNuevoProducto({...nuevoProducto, precio: Number(e.target.value)})}
                    className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" placeholder="$0" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="incluyeIva" checked={nuevoProducto.incluyeIva}
                  onChange={(e) => setNuevoProducto({...nuevoProducto, incluyeIva: e.target.checked})}
                  className="w-4 h-4 text-primary rounded border-outline-variant/50 focus:ring-primary/20" />
                <label htmlFor="incluyeIva" className="text-sm text-on-surface font-medium">El precio de venta incluye IVA</label>
              </div>

              {nuevoProducto.tipo === 'producto' && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-surface-container-low rounded-xl border border-outline-variant/20">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Stock Actual</label>
                    <input type="number" value={nuevoProducto.stock || ''} onChange={(e) => setNuevoProducto({...nuevoProducto, stock: Number(e.target.value)})}
                      className="w-full px-4 py-2 rounded-lg border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" placeholder="0" disabled={!!editingId} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Reservado</label>
                    <input type="number" value={nuevoProducto.stockReservado || ''} onChange={(e) => setNuevoProducto({...nuevoProducto, stockReservado: Number(e.target.value)})}
                      className="w-full px-4 py-2 rounded-lg border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Stock Mínimo</label>
                    <input type="number" value={nuevoProducto.stockMinimo || ''} onChange={(e) => setNuevoProducto({...nuevoProducto, stockMinimo: Number(e.target.value)})}
                      className="w-full px-4 py-2 rounded-lg border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Unidad</label>
                    <input type="text" value={nuevoProducto.unidadMedida} onChange={(e) => setNuevoProducto({...nuevoProducto, unidadMedida: e.target.value})}
                      className="w-full px-4 py-2 rounded-lg border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" placeholder="un, kg, lt..." />
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-outline-variant/20 flex justify-end gap-3 bg-surface-container-low/50">
              <button onClick={() => { setShowModal(false); setEditingId(null); }} className="px-6 py-2 rounded-full font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors">
                Cancelar
              </button>
              <button onClick={handleGuardar} className="px-6 py-2 bg-primary text-white rounded-full font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
                {editingId ? 'Guardar Cambios' : 'Guardar Producto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Registrar Movimiento */}
      {showMovimientoModal && (
        <div className="fixed inset-0 bg-scrim/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant/20 flex justify-between items-center bg-surface-container-low/50">
              <h3 className="text-xl font-bold text-primary">Registrar Movimiento</h3>
              <button onClick={() => setShowMovimientoModal(false)} className="text-on-surface-variant hover:text-error transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Producto</label>
                <div className="px-4 py-3 rounded-xl border border-outline-variant/50 bg-surface-container-low font-medium text-on-surface">
                  {inventario.find(p => p.id === nuevoMovimiento.productoId)?.nombre}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Tipo de Movimiento</label>
                  <select value={nuevoMovimiento.tipo} onChange={(e) => setNuevoMovimiento({...nuevoMovimiento, tipo: e.target.value as any})}
                    className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface">
                    <option value="ingreso">Ingreso / Compra</option>
                    <option value="salida">Salida / Venta</option>
                    <option value="ajuste">Ajuste (+/-)</option>
                    <option value="merma">Merma / Pérdida</option>
                    <option value="devolucion">Devolución</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Cantidad</label>
                  <input type="number" value={nuevoMovimiento.cantidad || ''} onChange={(e) => setNuevoMovimiento({...nuevoMovimiento, cantidad: Number(e.target.value)})}
                    className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" />
                </div>
              </div>
              {nuevoMovimiento.tipo === 'ingreso' && (
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Costo Unitario (Opcional)</label>
                  <input type="number" value={nuevoMovimiento.costoUnitario || ''} onChange={(e) => setNuevoMovimiento({...nuevoMovimiento, costoUnitario: Number(e.target.value)})}
                    className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" placeholder="Actualizar costo..." />
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Motivo / Observación</label>
                <input type="text" value={nuevoMovimiento.motivo} onChange={(e) => setNuevoMovimiento({...nuevoMovimiento, motivo: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" placeholder="Ej: Compra a proveedor, conteo físico..." />
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Fecha</label>
                <input type="date" value={nuevoMovimiento.fecha} onChange={(e) => setNuevoMovimiento({...nuevoMovimiento, fecha: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-outline-variant/20 flex justify-end gap-3 bg-surface-container-low/50">
              <button onClick={() => setShowMovimientoModal(false)} className="px-6 py-2 rounded-full font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors">
                Cancelar
              </button>
              <button onClick={handleGuardarMovimiento} className="px-6 py-2 bg-primary text-white rounded-full font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
                Registrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Historial de Movimientos */}
      {showHistorialModal && selectedProductId && (
        <div className="fixed inset-0 bg-scrim/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-outline-variant/20 flex justify-between items-center bg-surface-container-low/50">
              <div>
                <h3 className="text-xl font-bold text-primary">Historial de Movimientos</h3>
                <p className="text-sm text-on-surface-variant">{inventario.find(p => p.id === selectedProductId)?.nombre}</p>
              </div>
              <button onClick={() => { setShowHistorialModal(false); setSelectedProductId(null); }} className="text-on-surface-variant hover:text-error transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-0 overflow-y-auto flex-1">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-container-low text-on-surface-variant font-bold uppercase tracking-wider text-xs sticky top-0">
                  <tr>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4">Tipo</th>
                    <th className="px-6 py-4 text-right">Cantidad</th>
                    <th className="px-6 py-4">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {movimientosInventario
                    .filter(m => m.productoId === selectedProductId)
                    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
                    .map(mov => (
                    <tr key={mov.id} className="hover:bg-surface-container-low/30 transition-colors">
                      <td className="px-6 py-4 text-on-surface-variant">{new Date(mov.fecha).toLocaleDateString('es-CL')}</td>
                      <td className="px-6 py-4">
                        <span className={cn('px-2 py-1 rounded-md text-xs font-bold capitalize',
                          mov.tipo === 'ingreso' || mov.tipo === 'devolucion' ? 'bg-emerald-100 text-emerald-700' :
                          mov.tipo === 'salida' ? 'bg-secondary/20 text-secondary' :
                          mov.tipo === 'merma' ? 'bg-error/10 text-error' :
                          'bg-surface-container-high text-on-surface'
                        )}>
                          {mov.tipo}
                        </span>
                      </td>
                      <td className={cn('px-6 py-4 text-right font-bold',
                        mov.tipo === 'ingreso' || mov.tipo === 'devolucion' ? 'text-emerald-600' :
                        mov.tipo === 'salida' || mov.tipo === 'merma' ? 'text-error' :
                        'text-on-surface'
                      )}>
                        {mov.tipo === 'ingreso' || mov.tipo === 'devolucion' ? '+' : mov.tipo === 'salida' || mov.tipo === 'merma' ? '-' : ''}{mov.cantidad}
                      </td>
                      <td className="px-6 py-4 text-on-surface-variant">{mov.motivo}</td>
                    </tr>
                  ))}
                  {movimientosInventario.filter(m => m.productoId === selectedProductId).length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-on-surface-variant">
                        No hay movimientos registrados para este producto.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmar Eliminación */}
      <ConfirmDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setItemToDelete(null); }}
        onConfirm={() => { if (itemToDelete) deleteProducto(itemToDelete); }}
        title="Eliminar Producto"
      />
    </div>
  );
}
