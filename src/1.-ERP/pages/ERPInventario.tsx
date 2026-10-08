import { useState, useMemo, useEffect } from 'react';
import { useERP, Producto, MovimientoInventario } from '../context/ERPContext';
import { useAuth } from '../../context/AuthContext';
import { puedeEditarModulo } from '@/lib/roles';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import SelectorFecha from '../components/SelectorFecha';
import FiltroPeriodo from '../components/FiltroPeriodo';
import SelectorDesplegable, { etiquetaRangoPeriodo } from '../../components/SelectorDesplegable';
import { cn } from '@/lib/utils';
import { useColoresTema } from '@/lib/useColoresTema';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from 'recharts';

const COLORES_CATEGORIA = ['primary', 'secondary', 'tertiary', 'teal', 'violet'] as const;

export type EstadoStock = 'sin_stock' | 'bajo' | 'ok' | 'no_aplica';

/**
 * Criterio unico de alerta de stock. Antes cada vista repetia el predicado con
 * pequeñas diferencias: el KPI y la tabla contaban inactivos y la vista de tarjetas
 * no exigia que fuera un producto, asi que un servicio se pintaba "Stock bajo".
 * Este es el mismo criterio que ya usan Dashboard y el Centro de Alertas.
 *
 * `stock` permite evaluar contra el stock de otro periodo; si se omite usa el actual.
 */
function estadoStock(producto: Producto, stock: number = producto.stock): EstadoStock {
  if (producto.tipo !== 'producto' || producto.estado !== 'activo') return 'no_aplica';
  if (stock <= 0) return 'sin_stock';
  if (stock <= producto.stockMinimo) return 'bajo';
  return 'ok';
}

const ETIQUETA_STOCK: Record<EstadoStock, { texto: string; clase: string }> = {
  sin_stock: { texto: 'Sin stock', clase: 'bg-error-container text-on-error-container' },
  bajo: { texto: 'Stock bajo', clase: 'bg-secondary/20 text-secondary' },
  ok: { texto: 'OK', clase: 'bg-success-container text-on-success-container' },
  no_aplica: { texto: '—', clase: '' },
};

/**
 * Campos que se autocompletan al elegir Producto o Servicio. Lo que no aplica en el
 * otro caso se deja en cero o vacio a proposito: un servicio con stock o codigo de
 * barras colgando ensucia la valorizacion, el historial y el contador de alertas.
 */
const CAMPOS_INICIALES = (
  tipo: 'producto' | 'servicio_hora' | 'servicio_pedido' = 'producto'
): Partial<Producto> => {
  const esServicio = tipo !== 'producto'
  const modalidad = tipo === 'servicio_hora' ? 'por_hora' : tipo === 'servicio_pedido' ? 'por_pedido' : undefined

  return {
    nombre: '',
    codigo: '',
    codigoBarras: '',
    categoria: esServicio ? 'Servicios' : 'Mercadería',
    tipo: esServicio ? 'servicio' : 'producto',
    modalidadServicio: modalidad,
    tarifaHora: 0,
    costoHora: 0,
    precioFijo: 0,
    costoFijo: 0,
    tiempoMinimoHoras: 0,
    tipoOperativo: esServicio ? 'servicio' : 'producto_simple',
    descripcion: '',
    costo: 0,
    precio: 0,
    incluyeIva: true,
    stock: 0,
    stockReservado: 0,
    stockMinimo: 0,
    unidadMedida: tipo === 'servicio_hora' ? 'hora' : tipo === 'servicio_pedido' ? 'pedido' : 'un',
    estado: 'activo',
    proveedorId: ''
  }
}

/** Campos que el usuario escribio y que valen igual para un producto y para un servicio. */
const CAMPOS_COMUNES: (keyof Producto)[] = [
  'nombre', 'codigo', 'descripcion', 'costo', 'precio', 'tarifaHora', 'costoHora', 'precioFijo', 'costoFijo', 'incluyeIva', 'proveedorId', 'estado'
]

/** Categorias sugeridas segun el tipo. Se combinan con las ya existentes en el inventario. */
const CATEGORIAS_POR_TIPO = {
  producto: ['Mercadería', 'Insumos', 'Otros'],
  servicio_hora: ['Servicios', 'Otros'],
  servicio_pedido: ['Servicios', 'Otros']
} as const

export default function ERPInventario() {
  const { inventario, movimientosInventario, ventas, proveedores, addProducto, editProducto, deleteProducto, addMovimientoInventario } = useERP();
  // La matriz de roles define quien escribe en cada modulo, pero hasta ahora solo se
  // dibujaba en la pantalla de administracion y ninguna pagina la consultaba.
  const { perfil } = useAuth();
  const puedeEditar = puedeEditarModulo(perfil?.rol, 'inventario');
  const c = useColoresTema();
  const [activeTab, setActiveTab] = useState<'lista' | 'movimientos'>('lista');
  const [showModal, setShowModal] = useState(false);
  const [showMovimientoModal, setShowMovimientoModal] = useState(false);
  const [showHistorialModal, setShowHistorialModal] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [mostrarInputCategoria, setMostrarInputCategoria] = useState(false)
  const [nuevaCategoria, setNuevaCategoria] = useState('')
  const [barcodeManualEntry, setBarcodeManualEntry] = useState(false)

  /* ══ Periodo de los movimientos: mismo selector que Ventas, a la derecha ══ */

  const [periodoMovimientos, setPeriodoMovimientos] = useState('este_mes');
  const [rangoMovimientos, setRangoMovimientos] = useState({ fechaInicio: '', fechaFin: '' });

  /** Rango de mes natural en ISO 'YYYY-MM-DD', igual que en Ventas. */
  const rangoMes = (offset: number) => {
    const hoy = new Date();
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth() + offset, 1).toISOString().split('T')[0];
    const fin = new Date(hoy.getFullYear(), hoy.getMonth() + offset + 1, 0).toISOString().split('T')[0];
    return { inicio, fin };
  };

  useEffect(() => {
    if (periodoMovimientos === 'personalizado') return;
    const { inicio, fin } = periodoMovimientos === 'mes_anterior' ? rangoMes(-1) : rangoMes(0);
    setRangoMovimientos({ fechaInicio: inicio, fechaFin: fin });
  }, [periodoMovimientos]);

  /** El rango manual parte con el mes actual; las fechas quedan editables. */
  const elegirPeriodoMovimientos = (valor: string) => {
    setPeriodoMovimientos(valor);
    if (valor === 'personalizado') {
      const { inicio, fin } = rangoMes(0);
      setRangoMovimientos({ fechaInicio: inicio, fechaFin: fin });
    }
  };

  /** Rango real de datos: acota hasta donde el usuario puede navegar. */
  const rangoMovimientosDisponible = useMemo(() => {
    const fechas = movimientosInventario.map(m => m.fecha).filter(Boolean).sort();
    if (fechas.length === 0) return null;
    return { min: fechas[0], max: fechas[fechas.length - 1] };
  }, [movimientosInventario]);

  /**
   * El historial antes hacia `slice(0, 100)`: los 100 mas recientes sin mirar la fecha,
   * asi que al elegir un periodo se veian movimientos de otra epoca y los del periodo
   * quedaban escondidos detras del corte. Ahora se filtra por fecha y el limite de 100
   * se aplica despues.
   *
   * `movimientosEnRango` queda sin recortar porque el grafico por dia lo usa como base:
   * si se dibujara sobre la lista de 100, el grafico sumaria menos que la tabla.
   */
  const movimientosEnRango = useMemo(() => {
    const { fechaInicio, fechaFin } = rangoMovimientos;
    return movimientosInventario.filter(m => {
      const fecha = (m.fecha || '').slice(0, 10);
      if (fechaInicio && fecha < fechaInicio) return false;
      if (fechaFin && fecha > fechaFin) return false;
      return true;
    });
  }, [movimientosInventario, rangoMovimientos]);

  const movimientosFiltrados = useMemo(() => ({
    total: movimientosEnRango.length,
    lista: movimientosEnRango.slice(0, 100)
  }), [movimientosEnRango]);

  /**
   * Movimientos por dia del periodo, con entradas y salidas por separado: es el
   * equivalente al grafico de ventas por dia, pero con las dosSeries que importan en
   * bodega. El dia se ordena numericamente; ordenar el texto "Dia 10" contra "Dia 2"
   * los deja fuera de secuencia.
   */
  const datosMovimientosPorDia = useMemo(() => {
    const porDia: Record<number, { dia: number; etiqueta: string; entradas: number; salidas: number }> = {};
    movimientosEnRango.forEach(m => {
      const dia = Number((m.fecha || '').slice(8, 10));
      if (!dia) return;
      if (!porDia[dia]) porDia[dia] = { dia, etiqueta: `Dia ${dia}`, entradas: 0, salidas: 0 };
      if (m.tipo === 'ingreso' || m.tipo === 'devolucion') porDia[dia].entradas += m.cantidad;
      else if (m.tipo === 'salida' || m.tipo === 'merma') porDia[dia].salidas += m.cantidad;
    });
    return Object.values(porDia).sort((a, b) => a.dia - b.dia);
  }, [movimientosEnRango]);

  const etiquetaRangoMovimientos = etiquetaRangoPeriodo(
    periodoMovimientos === 'personalizado',
    rangoMovimientos.fechaInicio,
    rangoMovimientos.fechaFin,
    rangoMovimientosDisponible
  );

  /**
   * Stock al cierre del periodo. El filtro de mes tambien aplica en Inventario, y como
   * `Producto` no tiene fecha, lo unico que un periodo puede cambiar es el stock que se
   * muestra. Se parte del stock actual y se revierten los movimientos posteriores al
   * cierre; con "Este Mes" el cierre cae en el futuro y no hay nada que revertir, asi que
   * los numeros no se mueven salvo que se pida un periodo pasado.
   *
   * Un `ajuste` no es un delta sino el stock resultante, asi que sirve de ancla: se toma
   * el mas antiguo posterior al cierre y de ahi se retrocede hasta la fecha de corte. Si
   * no hay ningun ajuste, se retrocede desde el stock actual.
   */
  const stockAlCierre = useMemo(() => {
    const corte = rangoMovimientos.fechaFin;
    if (!corte) return null;

    /** Delta de un movimiento: el ajuste fija nivel, no suma. */
    const delta = (m: MovimientoInventario) =>
      m.tipo === 'ingreso' || m.tipo === 'devolucion' ? m.cantidad
        : m.tipo === 'salida' || m.tipo === 'merma' ? -m.cantidad
          : 0;

    // Ancla: el ajuste mas antiguo en o despues del corte. Sin ancla se parte del actual.
    const ajustes = movimientosInventario
      .filter(m => m.tipo === 'ajuste' && (m.fecha || '').slice(0, 10) >= corte)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    const ancla = ajustes[0];
    const stockActualPorProducto = (p: Producto) => (ancla && ancla.productoId === p.id ? ancla.cantidad : p.stock);

    // Movimientos a revertir: posteriores al corte, pero hasta el ancla como maximo.
    const reversibles = movimientosInventario.filter(m => {
      const fecha = (m.fecha || '').slice(0, 10);
      if (fecha <= corte) return false;
      if (ancla && fecha > ancla.fecha.slice(0, 10)) return false;
      return true;
    });
    if (reversibles.length === 0 && !ancla) return null;

    return (p: Producto) => {
      const yaAnclado = Boolean(ancla && ancla.productoId === p.id);
      const ventana = reversibles.filter(m => m.productoId === p.id);
      const suma = ventana.reduce((acc, m) => acc + delta(m), 0);
      return yaAnclado ? ancla.cantidad - suma : p.stock - suma;
    };
  }, [movimientosInventario, rangoMovimientos.fechaFin]);

  /** El stock a mostrar: el del cierre del periodo, o el actual si no hay nada que revertir. */
  const stockMostrado = (p: Producto): number => (stockAlCierre ? stockAlCierre(p) : p.stock);

  /**
   * Productos y servicios mas solicitados en el periodo. Se cuenta por cantidad, que
   * es la medida de demanda, y no por valor: un producto caro pedido una vez no es mas
   * solicitado que uno barato pedido cien veces. Entra cualquier item del catalogo,
   * asi que los servicios aparecen igual que los productos; el texto libre de una
   * venta no cuenta porque no es un producto ni un servicio.
   */
  const topMasSolicitados = useMemo(() => {
    const porProducto = new Map<string, number>();
    const { fechaInicio, fechaFin } = rangoMovimientos;
    ventas.forEach(v => {
      const fecha = (v.fecha || '').slice(0, 10);
      if (fechaInicio && fecha < fechaInicio) return;
      if (fechaFin && fecha > fechaFin) return;
      v.productos.forEach(item => {
        porProducto.set(item.productoId, (porProducto.get(item.productoId) ?? 0) + item.cantidad);
      });
    });
    return inventario
      .filter(p => porProducto.has(p.id))
      .map(p => ({ nombre: p.nombre, solicitudes: porProducto.get(p.id) ?? 0 }))
      .filter(x => x.solicitudes > 0)
      .sort((a, b) => b.solicitudes - a.solicitudes || a.nombre.localeCompare(b.nombre))
      .slice(0, 5);
  }, [ventas, inventario, rangoMovimientos]);

  const [nuevoProducto, setNuevoProducto] = useState<Partial<Producto>>(CAMPOS_INICIALES());

  /**
   * Orden de columnas del archivo de inventario. Es el mismo que usa la plantilla,
   * asi que lo que se exporta se puede volver a importar sin perder datos.
   * Estado se agrega al final: los archivos de antes lo omitian y se lee como 'activo'.
   */
  const COLUMNAS_INVENTARIO = [
    'Nombre', 'Codigo_SKU', 'Codigo_Barras', 'Categoria', 'Tipo',
    'Descripcion', 'Costo', 'Precio_Venta', 'Stock_Actual', 'Stock_Minimo', 'Unidad_Medida', 'Estado',
  ] as const;

  /** Escapa separadores y saltos de linea para que un valor no rompa el CSV. */
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

  const exportToCSV = () => {
    descargarCSV(
      `inventario_${new Date().toISOString().split('T')[0]}.csv`,
      [...COLUMNAS_INVENTARIO],
      inventario.map(p => [
        p.nombre, p.codigo, p.codigoBarras, p.categoria, p.tipo, p.descripcion,
        p.costo, p.precio, p.stock, p.stockMinimo, p.unidadMedida, p.estado,
      ])
    );
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

  // Tipo efectivo del formulario. Se normaliza en un solo lugar porque la pregunta, los
  // campos condicionales y el guardado dependen de el, y si quedara indefinido la
  // pregunta marcaria Producto mientras el bloque de stock seguiria oculto.
  const tipoEnFormulario: 'producto' | 'servicio_hora' | 'servicio_pedido' =
  nuevoProducto.tipo === 'servicio'
    ? (nuevoProducto.modalidadServicio === 'por_hora' ? 'servicio_hora' : 'servicio_pedido')
    : 'producto';

  // "Activos" de verdad: la etiqueta prometia productos vendibles, pero contaba servicios
  // e inactivos, mientras que el selector de Ventas solo ofrece los que estan activos.
  // Los KPIs siguen el periodo elegido: el stock mostrado es el del cierre, no el de hoy.
  const totalProductos = inventario.filter(p => p.estado === 'activo').length;
  const valorInventario = inventario.reduce((acc, p) => acc + (stockMostrado(p) * p.costo), 0);
  const valorVenta = inventario.reduce((acc, p) => acc + (stockMostrado(p) * p.precio), 0);
  const productosBajoStock = inventario.filter(p => {
    const e = estadoStock(p, stockMostrado(p));
    return e === 'sin_stock' || e === 'bajo';
  }).length;

  // Solo se acumula la valorizacion a costo, que es lo que usa el pie chart.
  const valorizacionPorCategoria = useMemo(() => {
    const mapa: Record<string, number> = {};
    inventario.filter(p => p.tipo === 'producto').forEach(p => {
      mapa[p.categoria] = (mapa[p.categoria] ?? 0) + stockMostrado(p) * p.costo;
    });
    return Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  }, [inventario, stockAlCierre]);

  /**
   * Conteo de productos activos segun su estado de stock en el periodo: alimenta el
   * donut "Salud del Stock", que reemplaza al consejo logístico estatico.
   */
  const stockPorEstado = useMemo(() => {
    const conteo: Record<'sin_stock' | 'bajo' | 'ok', number> = { sin_stock: 0, bajo: 0, ok: 0 };
    inventario.forEach(p => {
      const e = estadoStock(p, stockMostrado(p));
      if (e !== 'no_aplica') conteo[e] += 1;
    });
    const total = conteo.sin_stock + conteo.bajo + conteo.ok;
    return {
      total,
      datos: [
        { key: 'sin_stock', name: 'Sin stock', value: conteo.sin_stock },
        { key: 'bajo', name: 'Stock bajo', value: conteo.bajo },
        { key: 'ok', name: 'En stock', value: conteo.ok }
      ]
    };
  }, [inventario, stockAlCierre]);

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

  /**
   * Cambiar entre Producto y Servicio autocompleta los campos que dependen del tipo y
   * respeta lo que el usuario ya escribio. Al editar no se permite cambiar el tipo, como
   * antes: mover un producto con historial a servicio dejaria movimientos huerfanos.
   */
  const elegirTipo = (tipo: 'producto' | 'servicio_hora' | 'servicio_pedido') => {
    if (editingId) return;
    setMostrarInputCategoria(false)
    setNuevaCategoria('')
    setBarcodeManualEntry(false)
    setNuevoProducto(prev => {
      const yaEscrito = Object.fromEntries(
        CAMPOS_COMUNES.filter(k => prev[k] !== undefined && prev[k] !== '' && prev[k] !== 0 && prev[k] !== null).map(k => [k, prev[k]])
      );
      return { ...CAMPOS_INICIALES(tipo), ...yaEscrito };
    });
  };

  const handleGuardar = () => {
    if (nuevoProducto.nombre && nuevoProducto.categoria) {
      const tf = tipoEnFormulario
      const esProducto = tf === 'producto'
      const esServicioHora = tf === 'servicio_hora'
      const esServicioPedido = tf === 'servicio_pedido'
      const esServicio = !esProducto

      const tarifaHoraVal = Number(nuevoProducto.tarifaHora ?? 0) || 0
      const costoHoraVal = Number(nuevoProducto.costoHora ?? 0) || 0
      const precioFijoVal = Number(nuevoProducto.precioFijo ?? 0) || 0
      const costoFijoVal = Number(nuevoProducto.costoFijo ?? 0) || 0

      const precioCompat = esServicioHora
        ? tarifaHoraVal
        : esServicioPedido
          ? precioFijoVal
          : Number(nuevoProducto.precio) || 0

      const costoCompat = esServicioHora
        ? costoHoraVal
        : esServicioPedido
          ? costoFijoVal
          : Number(nuevoProducto.costo) || 0

      const productoData: Partial<Producto> = {
        nombre: nuevoProducto.nombre,
        codigo: nuevoProducto.codigo?.trim() || '',
        codigoBarras: esServicio ? '' : (nuevoProducto.codigoBarras?.trim() || ''),
        categoria: nuevoProducto.categoria,
        tipo: esServicio ? 'servicio' : 'producto',
        modalidadServicio: esServicioHora ? 'por_hora' : esServicioPedido ? 'por_pedido' : undefined,
        tarifaHora: esServicioHora ? tarifaHoraVal : undefined,
        costoHora: esServicioHora ? costoHoraVal : undefined,
        precioFijo: esServicioPedido ? precioFijoVal : undefined,
        costoFijo: esServicioPedido ? costoFijoVal : undefined,
        tiempoMinimoHoras: esServicioHora ? (Number(nuevoProducto.tiempoMinimoHoras) || 0) : undefined,
        tipoOperativo: esServicio ? 'servicio' : (nuevoProducto.tipoOperativo || 'producto_simple'),
        descripcion: nuevoProducto.descripcion || '',
        costo: costoCompat,
        precio: precioCompat,
        incluyeIva: nuevoProducto.incluyeIva ?? true,
        stock: esServicio ? 0 : (Number(nuevoProducto.stock) || 0),
        stockReservado: esServicio ? 0 : (Number(nuevoProducto.stockReservado) || 0),
        stockMinimo: esServicio ? 0 : (Number(nuevoProducto.stockMinimo) || 0),
        unidadMedida: esServicioHora
          ? (nuevoProducto.unidadMedida || 'hora')
          : esServicioPedido
            ? (nuevoProducto.unidadMedida || 'pedido')
            : (nuevoProducto.unidadMedida || 'un'),
        estado: nuevoProducto.estado || 'activo',
        proveedorId: nuevoProducto.proveedorId || ''
      };

      if (editingId) {
        editProducto(editingId, productoData);
      } else {
        addProducto(productoData as Omit<Producto, 'id'>);
      }

      setShowModal(false);
      setEditingId(null);
      setMostrarInputCategoria(false);
      setNuevaCategoria('');
      setBarcodeManualEntry(false);
      setNuevoProducto(CAMPOS_INICIALES('producto'));
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
          {puedeEditar && (
            <button onClick={() => {
              setEditingId(null)
              setMostrarInputCategoria(false)
              setNuevaCategoria('')
              setBarcodeManualEntry(false)
              setNuevoProducto(CAMPOS_INICIALES('producto'))
              setShowModal(true)
            }}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary text-inverse-on-surface rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-105 transition-all">
              <span className="material-symbols-outlined text-lg">add_box</span>
              Nuevo Producto
            </button>
          )}
        </div>
        {!puedeEditar && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-secondary/10 text-secondary border border-secondary/30 rounded-xl text-sm font-bold">
            <span className="material-symbols-outlined text-lg">lock</span>
            Solo lectura: tu rol no permite modificar el inventario
          </div>
        )}
      </div>

      {/* Tabs. El filtro de mes vive en la misma fila en las dos pestañas, siempre a
          la izquierda, y el grupo de pestañas queda a la derecha. Las fechas del rango
          personalizado se alinean por la base con el selector y las pestañas para que
          el bloque no se desajuste al aparecer. Se eliminaron los botones
          table_rows / grid_view, asi que la vista de tarjetas ya no tiene forma de
          activarse y la tabla es la unica vista. */}
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-6">
        <FiltroPeriodo
          className="min-w-0 flex-1"
          periodo={periodoMovimientos}
          etiqueta={etiquetaRangoMovimientos}
          rango={rangoMovimientos}
          onPeriodo={elegirPeriodoMovimientos}
          onRango={setRangoMovimientos}
        />

        <div className="flex p-1 bg-surface-container-high rounded-2xl w-full sm:w-auto shrink-0">
          {[
            { id: 'lista', label: 'Inventario', icon: 'list' },
            { id: 'movimientos', label: 'Movimientos', icon: 'swap_horiz' }
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
      </div>

      {activeTab === 'lista' && (
        <div className="space-y-6 animate-in fade-in duration-500">
          {/* Aviso de que los numeros son el stock del cierre del periodo, no el de hoy.
              Sin esto, cambiar de mes parece que el stock se hubiera alterado solo. */}
          {stockAlCierre && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-primary/10 text-primary border border-primary/20 rounded-xl text-sm font-bold">
              <span className="material-symbols-outlined text-lg">history</span>
              Stock al cierre de {etiquetaRangoMovimientos}. Ajustar o registrar movimientos sigue operando sobre el stock actual.
            </div>
          )}
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Productos Activos', value: String(totalProductos), icon: 'inventory_2', color: 'text-primary', bg: 'bg-primary/5', border: 'border-primary/20' },
              { label: 'Valorización Costo', value: `$${valorInventario.toLocaleString('es-CL')}`, icon: 'payments', color: 'text-on-surface', bg: 'bg-surface-container-low', border: 'border-outline-variant/30' },
              { label: 'Valorización Venta', value: `$${valorVenta.toLocaleString('es-CL')}`, icon: 'sell', color: 'text-on-success-container', bg: 'bg-success-container', border: 'border-success/30' },
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

          {/* Graficos: los mismos tres perfiles que Ventas, con los campos del
              inventario. Este bloque reemplaza al vacio que quedaba bajo los KPIs. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-surface-container-lowest rounded-3xl border-2 border-outline-variant/20 p-6 shadow-sm">
              <h3 className="text-sm font-black text-outline uppercase tracking-widest mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">show_chart</span>
                Movimientos por Dia
              </h3>
              <p className="text-[11px] text-outline font-medium mb-4">
                Entradas y salidas del periodo · {etiquetaRangoMovimientos}
              </p>
              {datosMovimientosPorDia.length === 0 ? (
                <div className="h-[260px] flex flex-col items-center justify-center text-center">
                  <span className="material-symbols-outlined text-4xl text-outline/30 mb-2">event_busy</span>
                  <p className="text-on-surface-variant text-sm font-bold">Sin movimientos en el periodo</p>
                </div>
              ) : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={datosMovimientosPorDia}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={c.outlineVariant} />
                      <XAxis dataKey="etiqueta" axisLine={false} tickLine={false} tick={{ fill: c.onSurfaceVariant, fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: c.onSurfaceVariant, fontSize: 10 }} />
                      <RechartsTooltip
                        contentStyle={{ borderRadius: '16px', border: `1px solid ${c.outlineVariant}`, background: c.surfaceLowest, color: c.onSurface, boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: number, name: string) => [`${value.toLocaleString('es-CL')} uds`, name === 'entradas' ? 'Entradas' : 'Salidas']}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', color: c.onSurfaceVariant }} />
                      <Line type="monotone" dataKey="entradas" stroke={c.success} strokeWidth={3} dot={{ r: 3, fill: c.success }} activeDot={{ r: 6 }} name="Entradas" />
                      <Line type="monotone" dataKey="salidas" stroke={c.error} strokeWidth={3} dot={{ r: 3, fill: c.error }} activeDot={{ r: 6 }} name="Salidas" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-surface-container-lowest rounded-3xl border-2 border-outline-variant/20 p-6 shadow-sm">
              <h3 className="text-sm font-black text-outline uppercase tracking-widest mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">trophy</span>
                Top 5 Mas Solicitados
              </h3>
              <p className="text-[11px] text-outline font-medium mb-4">
                Productos y servicios con mas demanda en el periodo · {etiquetaRangoMovimientos}
              </p>
              {topMasSolicitados.length === 0 ? (
                <div className="h-[260px] flex flex-col items-center justify-center text-center">
                  <span className="material-symbols-outlined text-4xl text-outline/30 mb-2">shopping_cart</span>
                  <p className="text-on-surface-variant text-sm font-bold">Sin solicitudes en el periodo</p>
                  <p className="text-outline text-xs mt-1">Aqui apareceran los productos y servicios mas pedidos.</p>
                </div>
              ) : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topMasSolicitados} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={c.outlineVariant} />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: c.onSurfaceVariant, fontSize: 10 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="nombre" axisLine={false} tickLine={false} width={110} tick={{ fill: c.onSurfaceVariant, fontSize: 10 }} />
                      <RechartsTooltip
                        contentStyle={{ borderRadius: '16px', border: `1px solid ${c.outlineVariant}`, background: c.surfaceLowest, color: c.onSurface, boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: number) => [`${value.toLocaleString('es-CL')} uds`, 'Solicitudes']}
                      />
                      <Bar dataKey="solicitudes" fill={c.tertiary} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie Chart */}
            <div className="bg-surface-container-lowest rounded-3xl border-2 border-outline-variant/20 p-6 shadow-sm">
              <h3 className="text-sm font-black text-outline uppercase tracking-widest mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">pie_chart</span>
                Distribución por Categoría
              </h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={valorizacionPorCategoria.map(([cat, valor]) => ({ name: cat, value: valor }))}
                      cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value"
                    >
                      {valorizacionPorCategoria.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={c[COLORES_CATEGORIA[index % COLORES_CATEGORIA.length]]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{ borderRadius: '16px', border: `1px solid ${c.outlineVariant}`, background: c.surfaceLowest, color: c.onSurface, boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number) => `$${value.toLocaleString('es-CL')}`}
                    />
                    <Legend verticalAlign="middle" align="right" layout="vertical" wrapperStyle={{ color: c.onSurfaceVariant }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Salud del Stock */}
            <div className="bg-surface-container-lowest rounded-3xl border-2 border-outline-variant/20 p-6 shadow-sm flex flex-col">
              <h3 className="text-sm font-black text-outline uppercase tracking-widest mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">query_stats</span>
                Salud del Stock
              </h3>
              <p className="text-[11px] text-outline font-medium mb-4">
                Productos activos según su nivel de existencias
              </p>
              {stockPorEstado.total === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center min-h-[200px]">
                  <span className="material-symbols-outlined text-4xl text-outline/30 mb-2">inventory_2</span>
                  <p className="text-on-surface-variant text-sm font-bold">Sin productos activos</p>
                </div>
              ) : (
                <>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stockPorEstado.datos}
                          cx="50%" cy="50%" innerRadius={48} outerRadius={80} paddingAngle={4} dataKey="value" nameKey="name" stroke="none"
                        >
                          {stockPorEstado.datos.map(item => (
                            <Cell
                              key={item.key}
                              fill={item.key === 'sin_stock' ? c.error : item.key === 'bajo' ? c.secondary : c.success}
                            />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          contentStyle={{ borderRadius: '16px', border: `1px solid ${c.outlineVariant}`, background: c.surfaceLowest, color: c.onSurface, boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          formatter={(value: number, name: string) => [`${value.toLocaleString('es-CL')}`, name]}
                        />
                        <Legend layout="horizontal" verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '11px', color: c.onSurfaceVariant }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {productosBajoStock > 0 ? (
                    <p className="text-[11px] font-bold text-secondary mt-3 text-center">
                      {productosBajoStock} {productosBajoStock === 1 ? 'producto requiere' : 'productos requieren'} atención
                    </p>
                  ) : (
                    <p className="text-[11px] font-bold text-success mt-3 text-center">Stock saludable en todos los productos</p>
                  )}
                </>
              )}
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
            <SelectorDesplegable
              valor={filtroTipo}
              onChange={valor => setFiltroTipo(valor as any)}
              opciones={[
                { valor: 'todos', etiqueta: 'Todos los Tipos' },
                { valor: 'producto', etiqueta: 'Productos' },
                { valor: 'servicio', etiqueta: 'Servicios' }
              ]}
            />
          </div>

          {/* Sin resultados se muestra solo el aviso: antes se pintaba la tabla con
              encabezados y sin filas y, debajo, el mismo aviso otra vez. */}
          {inventarioFiltrado.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-3xl border-2 border-dashed border-outline-variant/30 p-20 text-center">
              <span className="material-symbols-outlined text-6xl text-outline/30 mb-4">inventory_2</span>
              <h3 className="text-xl font-black text-on-surface-variant">No se encontraron productos</h3>
              <p className="text-outline text-sm mt-2">Prueba cambiando los filtros o la búsqueda.</p>
            </div>
          ) : (
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
                      const stockPeriodo = stockMostrado(producto);
                      const estado = estadoStock(producto, stockPeriodo);

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
                              <div className="flex flex-col items-end gap-0.5">
                                <span className={cn(
                                  "font-black text-base",
                                  estado === 'sin_stock' ? 'text-error' : estado === 'bajo' ? 'text-secondary' : 'text-on-surface'
                                )}>
                                  {stockPeriodo}
                                </span>
                                <span className="text-[9px] font-bold text-outline uppercase">{producto.unidadMedida}</span>
                                {estado !== 'ok' && estado !== 'no_aplica' && (
                                  <span className={cn('text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full', ETIQUETA_STOCK[estado].clase)}>
                                    {ETIQUETA_STOCK[estado].texto}
                                  </span>
                                )}
                                {(producto.stockReservado || 0) > 0 && stockPeriodo === producto.stock ? (
                                  <span className="text-[9px] font-medium text-primary">
                                    ({producto.stockReservado} res. – disp. {Math.max(0, (producto.stock || 0) - (producto.stockReservado || 0))})
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="text-[9px] font-bold text-outline uppercase">{producto.unidadMedida || 'servicio'}</span>
                                <span className="material-symbols-outlined text-outline/30">work</span>
                              </div>
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
                              margen > 30 ? "bg-success-container text-on-success-container" : margen > 15 ? "bg-secondary/10 text-secondary" : "bg-error/10 text-error"
                            )}>
                              {margen.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-1 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                              {puedeEditar && (
                                <>
                                  <button onClick={() => handleMovimientoClick(producto.id)}
                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-outline hover:bg-primary/10 hover:text-primary transition-all" title="Ajustar stock">
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
                                </>
                              )}
                              <button onClick={() => { setSelectedProductId(producto.id); setShowHistorialModal(true); }}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-outline hover:bg-primary/10 hover:text-primary transition-all" title="Historial">
                                <span className="material-symbols-outlined text-lg">history</span>
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
          )}
        </div>
      )}

      {/* Tab Movimientos */}
      {activeTab === 'movimientos' && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="bg-surface-container-lowest rounded-3xl border-2 border-outline-variant/20 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-outline-variant/20 flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-lg font-black text-on-surface">Historial Global de Movimientos</h3>
              <span className="px-4 py-1.5 bg-primary/10 text-primary rounded-full text-xs font-black">
                {movimientosFiltrados.total > movimientosFiltrados.lista.length
                  ? `Últimos ${movimientosFiltrados.lista.length} de ${movimientosFiltrados.total}`
                  : `${movimientosFiltrados.total} registros`}
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
                  {movimientosFiltrados.lista.map(mov => {
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
                            mov.tipo === 'ingreso' || mov.tipo === 'devolucion' ? "bg-success-container text-on-success-container" :
                            mov.tipo === 'salida' || mov.tipo === 'merma' ? "bg-error/10 text-error" : "bg-surface-container-high text-on-surface-variant"
                          )}>
                            {mov.tipo}
                          </span>
                        </td>
                        <td className={cn(
                          "px-6 py-4 text-right font-black",
                          mov.tipo === 'ingreso' || mov.tipo === 'devolucion' ? "text-success" : "text-error"
                        )}>
                          {mov.tipo === 'ingreso' || mov.tipo === 'devolucion' ? '+' : '-'}{mov.cantidad}
                        </td>
                        <td className="px-6 py-4 text-on-surface-variant text-xs italic">{mov.motivo}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {movimientosFiltrados.lista.length === 0 && (
                <div className="p-16 text-center">
                  <span className="material-symbols-outlined text-5xl text-outline/30 mb-3 block">event_busy</span>
                  <p className="text-on-surface-variant font-bold">Sin movimientos en el periodo seleccionado</p>
                  <p className="text-outline text-sm mt-1">
                    {movimientosInventario.length > 0
                      ? 'Prueba con otro rango o vuelve a "Este Mes".'
                      : 'Cuando ajustes el stock de un producto, el movimiento aparecera aqui.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Nuevo Producto / Editar */}
      {showModal && (
        <div className="fixed inset-0 bg-scrim/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-outline-variant/20 flex justify-between items-center bg-surface-container-low/50 shrink-0">
              <h3 className="text-xl font-bold text-primary">{editingId ? 'Editar Producto' : 'Registrar Nuevo Producto'}</h3>
              <button onClick={() => { setShowModal(false); setEditingId(null); setMostrarInputCategoria(false); setNuevaCategoria(''); setBarcodeManualEntry(false); setNuevoProducto(CAMPOS_INICIALES('producto')); }} className="text-on-surface-variant hover:text-error transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-grow">
              {/* La pregunta va primero porque de ella depende que campos tengan sentido:
                  un servicio no lleva codigo de barras ni stock minimo. */}
              <div>
                <p className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                  {editingId ? 'Tipo' : '¿Producto o Servicio?'}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {([
                    { valor: 'producto', titulo: 'Producto', desc: 'Físico, con control de stock', icon: 'inventory_2' },
                    { valor: 'servicio_hora', titulo: 'Servicio por hora', desc: 'Se cobra por hora trabajada', icon: 'schedule' },
                    { valor: 'servicio_pedido', titulo: 'Servicio por pedido', desc: 'Precio fijo por trabajo/paquete', icon: 'work' }
                  ] as const).map(op => {
                    const activo = tipoEnFormulario === op.valor;
                    return (
                      <button
                        key={op.valor}
                        type="button"
                        onClick={() => elegirTipo(op.valor)}
                        disabled={!!editingId}
                        className={cn(
                          "flex flex-col items-start gap-1 p-4 rounded-2xl border-2 text-left transition-all",
                          activo
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-outline-variant/30 hover:border-primary/40",
                          editingId && !activo && "opacity-50"
                        )}
                      >
                        <span className={cn("material-symbols-outlined text-xl", activo ? "text-primary" : "text-outline")}>{op.icon}</span>
                        <span className={cn("text-sm font-black", activo ? "text-primary" : "text-on-surface")}>{op.titulo}</span>
                        <span className="text-[11px] text-outline leading-tight">{op.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Nombre</label>
                      <input type="text" value={nuevoProducto.nombre} onChange={(e) => setNuevoProducto({...nuevoProducto, nombre: e.target.value})}
                        className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" placeholder="Ej: Cuaderno Universitario" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Código / SKU (opcional)</label>
                      <input type="text" value={nuevoProducto.codigo} onChange={(e) => setNuevoProducto({...nuevoProducto, codigo: e.target.value})}
                        className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" placeholder="Ej: CUAD-001" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Categoría</label>
                    <SelectorDesplegable
                      className="w-full"
                      valor={nuevoProducto.categoria || ''}
                      onChange={valor => {
                        if (valor === '__crear_categoria__') {
                          setMostrarInputCategoria(true)
                          setNuevaCategoria('')
                          return
                        }
                        setMostrarInputCategoria(false)
                        setNuevaCategoria('')
                        setNuevoProducto({ ...nuevoProducto, categoria: valor })
                      }}
                      opciones={[
                        ...((() => {
                          const existentes = new Set<string>()
                          inventario.forEach(p => { if (p.categoria?.trim()) existentes.add(p.categoria.trim()) })
                          CATEGORIAS_POR_TIPO[tipoEnFormulario].forEach(c => existentes.add(c as string))
                          return Array.from(existentes).sort((a,b)=>a.localeCompare(b))
                        })()).map(c => ({ valor: c, etiqueta: c })),
                        { valor: '__crear_categoria__', etiqueta: '+ Crear nueva categoría...' }
                      ]}
                    />
                    {mostrarInputCategoria && (
                      <div className="mt-2 flex gap-2">
                        <input
                          type="text"
                          value={nuevaCategoria}
                          onChange={(e)=>setNuevaCategoria(e.target.value)}
                          autoFocus
                          placeholder="Nombre de la nueva categoría"
                          className="flex-1 px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const nc = nuevaCategoria.trim()
                            if (!nc) return
                            const existentes = new Set<string>()
                            inventario.forEach(p => { if (p.categoria?.trim()) existentes.add(p.categoria.trim()) })
                            CATEGORIAS_POR_TIPO[tipoEnFormulario].forEach(c => existentes.add(c as string))
                            const lista = Array.from(existentes)
                            const existe = lista.some(c=>c.toLowerCase()===nc.toLowerCase())
                            const categoriaFinal = existe ? lista.find(c=>c.toLowerCase()===nc.toLowerCase()) || nc : nc
                            setNuevoProducto({...nuevoProducto, categoria: categoriaFinal})
                            setMostrarInputCategoria(false)
                            setNuevaCategoria('')
                          }}
                          className="px-4 py-3 bg-primary text-inverse-on-surface rounded-xl font-bold text-sm hover:scale-105 transition-transform"
                        >
                          Agregar
                        </button>
                        <button
                          type="button"
                          onClick={()=>{setMostrarInputCategoria(false); setNuevaCategoria('')}}
                          className="px-4 py-3 rounded-xl border border-outline-variant/40 font-medium hover:bg-surface-container-low transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Codigo de barras y uso operativo solo aplican a un producto fisico: un
                      servicio no se escanea y su uso operativo es siempre "servicio". */}
                  {tipoEnFormulario === 'producto' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Codigo de barras</label>
                        <input
                          type="text"
                          value={nuevoProducto.codigoBarras || ''}
                          onKeyDown={() => setBarcodeManualEntry(true)}
                          onChange={(e) => {
                            if (barcodeManualEntry) {
                              setBarcodeManualEntry(false)
                              setNuevoProducto({ ...nuevoProducto, codigoBarras: '' })
                              return
                            }
                            setNuevoProducto({ ...nuevoProducto, codigoBarras: e.target.value })
                          }}
                          onBlur={() => setBarcodeManualEntry(false)}
                          onPaste={() => setBarcodeManualEntry(false)}
                          className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest"
                          placeholder="Escanear o pegar (manual se descarta)"
                        />
                        <p className="mt-1 text-[10px] text-outline">Nota: si lo escribes manualmente, el valor no se guardará.</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Uso operativo</label>
                        <SelectorDesplegable
                          className="w-full"
                          valor={nuevoProducto.tipoOperativo || 'producto_simple'}
                          onChange={valor => setNuevoProducto({ ...nuevoProducto, tipoOperativo: valor as Producto['tipoOperativo'] })}
                          opciones={[
                            { valor: 'producto_simple', etiqueta: 'Producto simple' },
                            { valor: 'pack', etiqueta: 'Pack / combo' },
                            { valor: 'insumo', etiqueta: 'Insumo' },
                            { valor: 'producto_compuesto', etiqueta: 'Producto compuesto' }
                          ]}
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Descripción</label>
                    <textarea value={nuevoProducto.descripcion} onChange={(e) => setNuevoProducto({...nuevoProducto, descripcion: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none resize-none text-on-surface bg-surface-container-lowest" placeholder="Descripción detallada..." rows={2} />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Proveedor Principal</label>
                    <SelectorDesplegable
                      className="w-full"
                      valor={nuevoProducto.proveedorId || ''}
                      onChange={valor => setNuevoProducto({ ...nuevoProducto, proveedorId: valor })}
                      opciones={[
                        { valor: '', etiqueta: 'Sin proveedor asignado' },
                        ...proveedores.map(p => ({ valor: p.id, etiqueta: p.nombre }))
                      ]}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {tipoEnFormulario === 'servicio_hora' ? (
                      <>
                        <div>
                          <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Costo por hora ($/h)</label>
                          <input type="number" value={nuevoProducto.costoHora ?? nuevoProducto.costo ?? ''} onChange={(e) => setNuevoProducto({...nuevoProducto, costoHora: Number(e.target.value)||0})}
                            className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" placeholder="$0" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Tarifa por hora ($/h)</label>
                          <input type="number" value={nuevoProducto.tarifaHora ?? nuevoProducto.precio ?? ''} onChange={(e) => setNuevoProducto({...nuevoProducto, tarifaHora: Number(e.target.value)||0})}
                            className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" placeholder="$0" />
                        </div>
                      </>
                    ) : tipoEnFormulario === 'servicio_pedido' ? (
                      <>
                        <div>
                          <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Costo fijo ($)</label>
                          <input type="number" value={nuevoProducto.costoFijo ?? nuevoProducto.costo ?? ''} onChange={(e) => setNuevoProducto({...nuevoProducto, costoFijo: Number(e.target.value)||0})}
                            className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" placeholder="$0" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Precio fijo ($)</label>
                          <input type="number" value={nuevoProducto.precioFijo ?? nuevoProducto.precio ?? ''} onChange={(e) => setNuevoProducto({...nuevoProducto, precioFijo: Number(e.target.value)||0})}
                            className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" placeholder="$0" />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Costo Unitario</label>
                          <input type="number" value={nuevoProducto.costo || ''} onChange={(e) => setNuevoProducto({...nuevoProducto, costo: Number(e.target.value)||0})}
                            className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" placeholder="$0" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Precio Venta Base</label>
                          <input type="number" value={nuevoProducto.precio || ''} onChange={(e) => setNuevoProducto({...nuevoProducto, precio: Number(e.target.value)||0})}
                            className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" placeholder="$0" />
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="incluyeIva" checked={nuevoProducto.incluyeIva}
                      onChange={(e) => setNuevoProducto({...nuevoProducto, incluyeIva: e.target.checked})}
                      className="w-4 h-4 text-primary rounded border-outline-variant/50 focus:ring-primary/20" />
                    <label htmlFor="incluyeIva" className="text-sm text-on-surface font-medium">El precio de venta incluye IVA</label>
                  </div>
                </div>
              </div>

              {tipoEnFormulario === 'producto' && (
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
            <div className="px-6 py-4 border-t border-outline-variant/20 flex justify-end gap-3 bg-surface-container-low/50 shrink-0">
              <button onClick={() => { setShowModal(false); setEditingId(null); setMostrarInputCategoria(false); setNuevaCategoria(''); setBarcodeManualEntry(false); setNuevoProducto(CAMPOS_INICIALES('producto')); }} className="px-6 py-2 rounded-full font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors">
                Cancelar
              </button>
              <button onClick={handleGuardar} className="px-6 py-2 bg-primary text-inverse-on-surface rounded-full font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
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
                  <SelectorDesplegable
                    className="w-full"
                    valor={nuevoMovimiento.tipo}
                    onChange={valor => setNuevoMovimiento({ ...nuevoMovimiento, tipo: valor as any })}
                    opciones={[
                      { valor: 'ingreso', etiqueta: 'Ingreso / Compra' },
                      { valor: 'salida', etiqueta: 'Salida / Venta' },
                      { valor: 'ajuste', etiqueta: 'Ajuste (+/-)' },
                      { valor: 'merma', etiqueta: 'Merma / Pérdida' },
                      { valor: 'devolucion', etiqueta: 'Devolución' }
                    ]}
                  />
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
                    <SelectorFecha
                      value={nuevoMovimiento.fecha}
                      onChange={fecha => setNuevoMovimiento({ ...nuevoMovimiento, fecha: fecha })}
                    />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-outline-variant/20 flex justify-end gap-3 bg-surface-container-low/50">
              <button onClick={() => setShowMovimientoModal(false)} className="px-6 py-2 rounded-full font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors">
                Cancelar
              </button>
              <button onClick={handleGuardarMovimiento} className="px-6 py-2 bg-primary text-inverse-on-surface rounded-full font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
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
                          mov.tipo === 'ingreso' || mov.tipo === 'devolucion' ? 'bg-success-container text-on-success-container' :
                          mov.tipo === 'salida' ? 'bg-secondary/20 text-secondary' :
                          mov.tipo === 'merma' ? 'bg-error/10 text-error' :
                          'bg-surface-container-high text-on-surface'
                        )}>
                          {mov.tipo}
                        </span>
                      </td>
                      <td className={cn('px-6 py-4 text-right font-bold',
                        mov.tipo === 'ingreso' || mov.tipo === 'devolucion' ? 'text-success' :
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
