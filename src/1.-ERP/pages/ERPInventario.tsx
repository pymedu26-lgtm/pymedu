import { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
const ModalCargaMasivaInventario = lazy(() => import('../components/ModalCargaMasivaInventario'));
import { estadoStock as estadoStockCompartido } from '../services/alertas';
import { presentacionesActivas } from '../services/costeo';
import { resumenStock, usaEnvases, formatCantidad, stockDisponible, textoDisponibilidad, tipoPresentacion, textoMinimo, unidadMinimoDe } from '../services/inventarioFraccionado';
import TablaResponsiva from '../../components/TablaResponsiva';
import type { InventarioInicial } from '../services/registroProducto';
import RegistroProducto from '../components/RegistroProducto';
import FichaProducto from '../components/FichaProducto';
import ModalRevisionUnidades from '../components/ModalRevisionUnidades';
import Paginacion, { usePaginacion } from '../../components/Paginacion';
import { formatCLP } from '../../lib/fechas';
import { useERP, Producto, MovimientoInventario, type ResultadoInventario } from '../context/ERPContext';
import { useAuth } from '../../context/AuthContext';
import { puedeEditarModulo } from '@/lib/roles';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import SelectorFecha from '../components/SelectorFecha';
import CampoMoneda from '../../components/CampoMoneda';
import FiltroPeriodo from '../components/FiltroPeriodo';
import SelectorDesplegable, { etiquetaRangoPeriodo, rangoPeriodo } from '../../components/SelectorDesplegable';
import { cn, formatFecha } from '@/lib/utils';
import { rangoMes as rangoMesLocal } from '@/lib/fechas';
import { agruparSerie, totalesPor, NOMBRE_GRANULARIDAD } from '@/lib/series';
import GraficoSerie from '../../components/graficos/GraficoSerie';
import GraficoDona from '../../components/graficos/GraficoDona';
import GraficoBarras from '../../components/graficos/GraficoBarras';
import { TarjetaGrafico } from '../../components/graficos/comunes';
import { usePaletaGraficos } from '../../components/graficos/paleta';

/** Cantidades en unidades (los gráficos de inventario no son montos). */
const formatoUds = (n: number) => `${Math.round(n).toLocaleString('es-CL')} uds`;
const formatoEjeUds = (n: number) => Math.round(n).toLocaleString('es-CL');
const formatoProductos = (n: number) => `${n.toLocaleString('es-CL')} productos`;

export type EstadoStock = 'sin_stock' | 'bajo' | 'ok' | 'no_aplica';

/**
 * Criterio unico de alerta de stock. Antes cada vista repetia el predicado con
 * pequeñas diferencias: el KPI y la tabla contaban inactivos y la vista de tarjetas
 * no exigia que fuera un producto, asi que un servicio se pintaba "Stock bajo".
 * Este es el mismo criterio que ya usan Dashboard y el Centro de Alertas.
 *
 * `stock` permite evaluar contra el stock de otro periodo; si se omite usa el actual.
 */
function estadoStock(producto: Producto, stock: number = producto.stock, envases?: import('../context/ERPContext').Envase[]): EstadoStock {
  // Delegado al criterio único (services/alertas.ts): con envases compara las CERRADAS con el mínimo.
  return estadoStockCompartido(producto, stock, envases);
}

/** Costo y precio reales aunque vengan como texto o en campos de servicio (corrección #11). */
const costoDe = (p: Producto) => Number(p.costo) || Number(p.costoFijo) || Number(p.costoHora) || 0;
const precioDe = (p: Producto) => Number(p.precio) || Number(p.precioFijo) || Number(p.tarifaHora) || presentacionesActivas(p)[0]?.precio || 0;

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

/** Unidades de medida por defecto para productos fisicos. */
const UNIDADES_PRODUCTO: { valor: string; etiqueta: string }[] = [
  { valor: 'un', etiqueta: 'Unidad (un)' },
  { valor: 'kg', etiqueta: 'Kilogramo (kg)' },
  { valor: 'g', etiqueta: 'Gramo (g)' },
  { valor: 'lt', etiqueta: 'Litro (lt)' },
  { valor: 'ml', etiqueta: 'Mililitro (ml)' },
  { valor: 'm', etiqueta: 'Metro (m)' },
  { valor: 'cm', etiqueta: 'Centimetro (cm)' },
  { valor: 'caja', etiqueta: 'Caja' },
  { valor: 'pack', etiqueta: 'Pack' },
  { valor: 'docena', etiqueta: 'Docena' },
  { valor: 'par', etiqueta: 'Par' }
]

export default function ERPInventario() {
  const {
    inventario, movimientosInventario, ventas, proveedores, addProducto, editProducto, deleteProducto, addMovimientoInventario, envases, lotes,
    metodoCosteo, setMetodoCosteo, politicaEnvaseAbierto, plantillasSubcategoria, margenObjetivo, guardarPlantilla,
  } = useERP();
  // La matriz de roles define quien escribe en cada modulo, pero hasta ahora solo se
  // dibujaba en la pantalla de administracion y ninguna pagina la consultaba.
  const { perfil, tienePermiso } = useAuth();
  // Permiso del rol dinámico (si no hay roles cargados, cae en la matriz fija anterior).
  const puedeEditar = tienePermiso('inventario.escribir') || puedeEditarModulo(perfil?.rol, 'inventario');
  const paleta = usePaletaGraficos();
  const [activeTab, setActiveTab] = useState<'lista' | 'movimientos'>('lista');
  const [showModal, setShowModal] = useState(false);
  const [showMovimientoModal, setShowMovimientoModal] = useState(false);
  const [showHistorialModal, setShowHistorialModal] = useState(false);
  const [showCargaMasiva, setShowCargaMasiva] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [mostrarInputCategoria, setMostrarInputCategoria] = useState(false)
  const [nuevaCategoria, setNuevaCategoria] = useState('')
  const [barcodeManualEntry, setBarcodeManualEntry] = useState(false)
  /** Ficha del producto fraccionado (envases o granel). */
  const [fichaId, setFichaId] = useState<string | null>(null);
  /** Productos antiguos a revisar (lista fija al abrir, para avanzar uno por uno). */
  const [revisionIds, setRevisionIds] = useState<string[] | null>(null);
  const [errorMovimiento, setErrorMovimiento] = useState('');
  /** Acción con que se abre la ficha desde una alerta (reponer, merma). */
  const [accionFicha, setAccionFicha] = useState<'reponer' | 'merma' | null>(null);
  const [filtroStock, setFiltroStock] = useState<'todos' | 'bajo'>('todos');
  // Enlaces del Centro de alertas: ?producto=ID[&accion=reponer|merma] abre su ficha; ?filtro=bajo filtra.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const id = params.get('producto');
    const filtro = params.get('filtro');
    if (!id && filtro !== 'bajo') return;
    if (id && inventario.some(p => p.id === id)) {
      setFichaId(id);
      const accion = params.get('accion');
      setAccionFicha(accion === 'reponer' || accion === 'merma' ? accion : null);
    }
    if (filtro === 'bajo') setFiltroStock('bajo');
    if (id && !inventario.some(p => p.id === id) && inventario.length === 0) return; // aún cargando
    setParams({}, { replace: true });
  }, [params, inventario]);

  /* ══ Periodo de los movimientos: mismo selector que Ventas, a la derecha ══ */

  const [periodoMovimientos, setPeriodoMovimientos] = useState('este_mes');
  const [rangoMovimientos, setRangoMovimientos] = useState({ fechaInicio: '', fechaFin: '' });

  /** Rango de mes natural en fechas locales (toISOString() corría el día por UTC). */
  const rangoMes = (offset: number) => rangoMesLocal(offset);

  useEffect(() => {
    const rango = rangoPeriodo(periodoMovimientos);
    if (rango) setRangoMovimientos({ fechaInicio: rango.inicio, fechaFin: rango.fin });
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
   * Entradas y salidas del periodo en tramos continuos que cubren TODO el rango (día,
   * semana o mes según su largo): con varios meses ya no se dibuja un punto por fecha.
   */
  const serieMovimientos = useMemo(
    () => agruparSerie(
      movimientosEnRango,
      { inicio: rangoMovimientos.fechaInicio, fin: rangoMovimientos.fechaFin },
      m => m.fecha,
      m => m.tipo === 'ingreso' || m.tipo === 'devolucion' ? { entradas: m.cantidad, salidas: 0 }
        : m.tipo === 'salida' || m.tipo === 'merma' ? { entradas: 0, salidas: m.cantidad }
          : { entradas: 0, salidas: 0 }
    ),
    [movimientosEnRango, rangoMovimientos.fechaInicio, rangoMovimientos.fechaFin]
  );

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
  const stockMostrado = (p: Producto): number => (stockAlCierre ? stockAlCierre(p) : stockDisponible(p, envases));
  /** Estado con el criterio único: con stock actual y envases compara las cerradas con el mínimo. */
  const estadoActual = (p: Producto) => estadoStock(p, stockMostrado(p), stockAlCierre ? undefined : envases);
  /** «19 botellas + 1 abierta (70 ml)», «1,2 t · 2 lotes», «40 unidades». */
  const textoStockLista = (p: Producto): string => {
    if (p.tipo !== 'producto') return '—';
    const stock = stockMostrado(p);
    if (usaEnvases(p) && !stockAlCierre) return resumenStock(p, envases).texto;
    if (p.formaCompra === 'granel' || (p.unidadBase && p.unidadBase !== 'unidad')) {
      const nLotes = lotes.filter(l => l.productoId === p.id && l.cantidadRestante > 0).length;
      const cantidad = unidadMinimoDe(p) === 't' || (p.unidadBase === 'kg' && stock >= 1000)
        ? `${(stock / 1000).toLocaleString('es-CL', { maximumFractionDigits: 2 })} t`
        : formatCantidad(stock, p.unidadBase);
      return nLotes > 1 && !stockAlCierre ? `${cantidad} · ${nLotes} lotes` : cantidad;
    }
    const medida = (p.unidadMedida ?? '').trim();
    const generica = !medida || ['un', 'unidad', 'unidades', 'u'].includes(medida.toLowerCase());
    return `${Number(stock).toLocaleString('es-CL')} ${generica ? (Number(stock) === 1 ? 'unidad' : 'unidades') : medida}`;
  };
  const productosRevision = useMemo(() => inventario.filter(p => p.requiereRevisionUnidades), [inventario]);
  const esFraccionado = (p: Producto) => usaEnvases(p) || p.formaCompra === 'granel';

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
      .map(p => ({ nombre: p.nombre, valor: porProducto.get(p.id) ?? 0 }))
      .filter(x => x.valor > 0)
      .sort((a, b) => b.valor - a.valor || a.nombre.localeCompare(b.nombre))
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
  const valorInventario = inventario.reduce((acc, p) => acc + (p.tipo === 'producto' ? stockMostrado(p) * costoDe(p) : 0), 0);
  const valorVenta = inventario.reduce((acc, p) => acc + (p.tipo === 'producto' ? stockMostrado(p) * (presentacionesActivas(p).length ? precioDe(p) / (presentacionesActivas(p)[0].factor || 1) : precioDe(p)) : 0), 0);
  const productosBajoStock = inventario.filter(p => {
    const e = estadoActual(p);
    return e === 'sin_stock' || e === 'bajo';
  }).length;

  // Solo se acumula la valorizacion a costo, que es lo que usa el pie chart.
  const valorizacionPorCategoria = useMemo(
    () => totalesPor(inventario.filter(p => p.tipo === 'producto'), p => p.categoria, p => stockMostrado(p) * costoDe(p)),
    [inventario, stockAlCierre]
  );

  /**
   * Conteo de productos activos segun su estado de stock en el periodo: alimenta el
   * donut "Salud del Stock", que reemplaza al consejo logístico estatico.
   */
  const stockPorEstado = useMemo(() => {
    const conteo: Record<'sin_stock' | 'bajo' | 'ok', number> = { sin_stock: 0, bajo: 0, ok: 0 };
    inventario.forEach(p => {
      const e = estadoActual(p);
      if (e !== 'no_aplica') conteo[e] += 1;
    });
    const total = conteo.sin_stock + conteo.bajo + conteo.ok;
    return {
      total,
      datos: [
        { nombre: 'Sin stock', valor: conteo.sin_stock, color: paleta.critico },
        { nombre: 'Stock bajo', valor: conteo.bajo, color: paleta.alerta },
        { nombre: 'En stock', valor: conteo.ok, color: paleta.ok }
      ]
    };
  }, [inventario, stockAlCierre, paleta]);

  const inventarioFiltrado = useMemo(() =>
    inventario.filter(p => {
      const matchBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.codigo.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.categoria.toLowerCase().includes(busqueda.toLowerCase());
      const matchTipo = filtroTipo === 'todos' || p.tipo === filtroTipo;
      const matchStock = filtroStock === 'todos' || ['bajo', 'sin_stock'].includes(estadoStock(p, stockDisponible(p, envases), envases));
      return matchBusqueda && matchTipo && matchStock;
    }), [inventario, busqueda, filtroTipo, filtroStock, envases]
  );
  // Paginación: con 10.061 productos la tabla completa congelaba la página (corrección #5).
  const paginacionInventario = usePaginacion(inventarioFiltrado, 25, [busqueda, filtroTipo, filtroStock]);

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
    setErrorMovimiento('');
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
        proveedorId: nuevoProducto.proveedorId || '',
        ...(esServicio ? {} : {
          unidadBase: nuevoProducto.unidadBase || 'unidad',
          presentaciones: (nuevoProducto.presentaciones ?? []).filter(x => x.nombre.trim() && x.factor > 0),
          controlEnvases: !!nuevoProducto.controlEnvases,
          capacidadEnvase: nuevoProducto.controlEnvases ? Number(nuevoProducto.capacidadEnvase) || 0 : undefined,
        }),
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

  const cerrarModalProducto = () => {
    setShowModal(false); setEditingId(null); setMostrarInputCategoria(false); setNuevaCategoria(''); setBarcodeManualEntry(false); setNuevoProducto(CAMPOS_INICIALES('producto'));
  };
  /** Guardado del formulario «Registrar producto» (RegistroProducto). */
  const guardarProducto = (datos: Partial<Producto>, inicial: InventarioInicial): ResultadoInventario => {
    if (editingId) {
      editProducto(editingId, datos);
      cerrarModalProducto();
      return { ok: true, id: editingId };
    }
    const r = addProducto({ ...CAMPOS_INICIALES('producto'), ...datos } as Omit<Producto, 'id'>, inicial);
    if (r.ok) cerrarModalProducto();
    return r;
  };

  const handleGuardarMovimiento = () => {
    setErrorMovimiento('');
    if (!nuevoMovimiento.motivo?.trim()) { setErrorMovimiento('Escribe el motivo.'); return; }
    if (nuevoMovimiento.productoId && nuevoMovimiento.cantidad && nuevoMovimiento.motivo) {
      const r = addMovimientoInventario({
        productoId: nuevoMovimiento.productoId,
        tipo: nuevoMovimiento.tipo as 'ingreso' | 'salida' | 'ajuste' | 'merma' | 'devolucion',
        cantidad: Number(nuevoMovimiento.cantidad),
        costoUnitario: Number(nuevoMovimiento.costoUnitario) || undefined,
        fecha: new Date(nuevoMovimiento.fecha!).toISOString(),
        motivo: nuevoMovimiento.motivo
      });
      if (!r.ok) { setErrorMovimiento(r.error.mensaje); return; }
      setShowMovimientoModal(false);
    }
  };

  // Selector Producto / Servicio: va arriba en ambos formularios.
  const selectorTipo = (
    <>
              {/* La pregunta va primero porque de ella depende que campos tengan sentido:
                  un servicio no lleva codigo de barras ni stock minimo. */}
              <div>
                <p className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                  {editingId ? 'Tipo' : '¿Producto o Servicio?'}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {([
                    { valor: 'producto', titulo: 'Producto', desc: 'Físico, con control de stock', icon: 'inventory_2' },
                    { valor: 'servicio_pedido', titulo: 'Servicios', desc: 'Precio fijo por trabajo/paquete', icon: 'work' },
                    { valor: 'servicio_hora', titulo: 'Servicio por hora', desc: 'Se cobra por hora trabajada', icon: 'schedule' }
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
    </>
  );

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
          <button onClick={() => setShowCargaMasiva(true)}
            className="px-6 py-3 bg-surface-container-lowest text-primary border border-primary/30 rounded-full text-sm font-bold shadow-sm hover:bg-primary/5 transition-all flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">upload_file</span>
            Carga Masiva
          </button>
          <button onClick={exportToCSV}
            className="px-6 py-3 bg-surface-container-lowest text-primary border border-primary/30 rounded-full text-sm font-bold shadow-sm hover:bg-primary/5 transition-all flex items-center gap-2">
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
              className="px-6 py-3 bg-primary text-inverse-on-surface rounded-full text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform flex items-center gap-2">
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
              { label: 'Valorización Costo', value: formatCLP(valorInventario), icon: 'payments', color: 'text-on-surface', bg: 'bg-surface-container-low', border: 'border-outline-variant/30' },
              { label: 'Valorización Venta', value: formatCLP(Math.round(valorVenta)), icon: 'sell', color: 'text-on-success-container', bg: 'bg-success-container', border: 'border-success/30' },
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

          {/* Gráficos: movimientos del periodo anchos + ranking; valorización (dona Top-6 + Otros) + salud del stock */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <TarjetaGrafico
              className="lg:col-span-2"
              icono="swap_vert"
              titulo="Movimientos de stock"
              subtitulo={`Entradas y salidas ${NOMBRE_GRANULARIDAD[serieMovimientos.granularidad]} · ${etiquetaRangoMovimientos}`}
              extra={`${movimientosEnRango.length.toLocaleString('es-CL')} movimientos`}
            >
              <GraficoSerie
                puntos={serieMovimientos.puntos}
                tipo="barra"
                series={[
                  { clave: 'entradas', nombre: 'Entradas', color: paleta.ingresos },
                  { clave: 'salidas', nombre: 'Salidas', color: paleta.egresos },
                ]}
                formato={formatoUds}
                formatoEje={formatoEjeUds}
                vacio="Sin movimientos en el periodo"
              />
            </TarjetaGrafico>
            <TarjetaGrafico icono="trophy" titulo="Más solicitados" subtitulo="Unidades vendidas en el periodo">
              <GraficoBarras items={topMasSolicitados} max={5} color={paleta.neto} formato={formatoUds} vacio="Sin solicitudes en el periodo" />
            </TarjetaGrafico>
            <TarjetaGrafico
              className="lg:col-span-2"
              icono="donut_large"
              titulo="Valorización por categoría"
              subtitulo={stockAlCierre ? `A costo, stock al cierre de ${etiquetaRangoMovimientos}` : 'A costo, stock actual'}
            >
              <GraficoDona items={valorizacionPorCategoria} etiquetaTotal="Valor a costo" vacio="Sin productos con stock valorizado" />
            </TarjetaGrafico>
            <TarjetaGrafico icono="query_stats" titulo="Salud del stock" subtitulo="Productos activos según su nivel de existencias">
              <GraficoDona
                items={stockPorEstado.datos}
                etiquetaTotal="Productos"
                formato={formatoProductos}
                formatoCorto={formatoEjeUds}
                vacio="Sin productos activos"
              />
              {stockPorEstado.total > 0 && (
                <p className={cn('text-[11px] font-bold mt-3 text-center', productosBajoStock > 0 ? 'text-secondary' : 'text-success')}>
                  {productosBajoStock > 0
                    ? `${productosBajoStock} ${productosBajoStock === 1 ? 'producto requiere' : 'productos requieren'} atención`
                    : 'Stock saludable en todos los productos'}
                </p>
              )}
            </TarjetaGrafico>
          </div>

          {productosRevision.length > 0 && (
            <div className="flex flex-col gap-3 rounded-2xl border-2 border-secondary/40 bg-secondary/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-sm font-bold text-on-surface">
                <span className="material-symbols-outlined text-secondary">rule</span>
                Hay {productosRevision.length} producto{productosRevision.length === 1 ? '' : 's'} que necesita{productosRevision.length === 1 ? '' : 'n'} revisar sus unidades.
              </p>
              {puedeEditar && (
                <button type="button" onClick={() => setRevisionIds(productosRevision.map(p => p.id))}
                  className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-inverse-on-surface">Revisar ahora</button>
              )}
            </div>
          )}

          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-4 bg-surface-container-lowest p-4 rounded-3xl border-2 border-outline-variant/20">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">search</span>
              <input 
                type="text" placeholder="Buscar por nombre, código o categoría..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-surface-container-low border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 outline-none font-medium text-on-surface" 
              />
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs font-bold text-on-surface-variant"
              title="FIFO: cada venta usa el costo de la compra más antigua con stock. Promedio: usa el promedio ponderado de todo tu stock, recalculado en cada compra. LIFO no se acepta tributariamente en Chile. Cambia el método solo al inicio de un año (afecta reportes).">
              Costeo
              <select value={metodoCosteo} onChange={e => {
                if (window.confirm('Cambiar el método de costeo afecta el costo de las próximas ventas y tus reportes. Se recomienda hacerlo solo al inicio de un año. ¿Continuar?')) setMetodoCosteo(e.target.value as 'fifo' | 'promedio');
              }} className="bg-transparent font-black text-on-surface outline-none">
                <option value="promedio">Promedio ponderado</option>
                <option value="fifo">FIFO / PEPS</option>
              </select>
            </label>
            <button type="button" onClick={() => setFiltroStock(v => (v === 'bajo' ? 'todos' : 'bajo'))} aria-pressed={filtroStock === 'bajo'}
              className={cn('flex min-h-11 items-center justify-center gap-1 rounded-xl border px-3 text-xs font-bold', filtroStock === 'bajo' ? 'border-secondary bg-secondary/10 text-secondary' : 'border-outline-variant/40 text-on-surface-variant')}>
              <span className="material-symbols-outlined text-base">warning</span> Stock bajo
            </button>
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
            <div className="bg-surface-container-lowest rounded-3xl border-2 border-dashed border-outline-variant/30 p-10 sm:p-20 text-center">
              <span className="material-symbols-outlined text-6xl text-outline/30 mb-4">inventory_2</span>
              <h3 className="text-xl font-black text-on-surface-variant">No se encontraron productos</h3>
              <p className="text-outline text-sm mt-2">{filtroStock === 'bajo' ? 'Ningún producto tiene stock bajo.' : 'Prueba cambiando los filtros o la búsqueda.'}</p>
            </div>
          ) : (
            <div className="bg-surface-container-lowest rounded-3xl border-2 border-outline-variant/20 shadow-sm overflow-hidden">
              <TablaResponsiva
                filas={paginacionInventario.visibles as Producto[]}
                clave={p => p.id}
                resaltada={fichaId}
                etiquetaExpandir="Subcategorías de venta"
                expandible={p => {
                  const lista = p.tipo === 'producto' ? (p.presentaciones ?? []) : [];
                  if (lista.length === 0) return null;
                  return (
                    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {lista.map(x => {
                        const disp = textoDisponibilidad(p, envases, x, politicaEnvaseAbierto);
                        const tipo = tipoPresentacion(p, x);
                        return (
                          <li key={x.id} className={cn('flex items-center gap-3 rounded-xl border px-3 py-2', x.activa ? 'border-outline-variant/30 bg-surface-container-lowest' : 'border-dashed border-outline-variant/30 opacity-60')}>
                            <span className="material-symbols-outlined text-lg text-primary">{tipo === 'completa' ? 'liquor' : tipo === 'variable' ? 'scale' : 'water_drop'}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-on-surface">{x.nombre}</p>
                              <p className="text-[11px] text-on-surface-variant">
                                {formatCLP(x.precio)}{tipo === 'variable' ? ` por ${x.unidadVenta ?? (p.unidadBase === 'ml' ? 'L' : 'kg')}` : ''} · {x.activa ? disp.texto : 'Inactiva'}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  );
                }}
                tituloTarjeta={p => (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {p.nombre}
                    {p.requiereRevisionUnidades && <span className="rounded-full bg-secondary/15 px-2 py-0.5 text-[10px] font-black text-secondary">Revisar unidades</span>}
                  </span>
                )}
                subtituloTarjeta={p => `${p.categoria}${p.codigo ? ` · ${p.codigo}` : ''}`}
                insigniaTarjeta={p => {
                  const e = estadoActual(p);
                  return e === 'sin_stock' || e === 'bajo'
                    ? <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-black uppercase', ETIQUETA_STOCK[e].clase)}>{ETIQUETA_STOCK[e].texto}</span>
                    : null;
                }}
                datosTarjeta={p => [
                  { etiqueta: 'Stock', valor: textoStockLista(p) },
                  { etiqueta: 'Precio', valor: `${formatCLP(precioDe(p))}${presentacionesActivas(p).length > 1 ? ` · ${presentacionesActivas(p).length} subcat.` : ''}` },
                ]}
                onFila={p => (p.tipo === 'producto' ? setFichaId(p.id) : undefined)}
                acciones={p => [
                  ...(puedeEditar && p.tipo === 'producto' ? [{
                    etiqueta: esFraccionado(p) ? 'Abrir, merma o reponer' : 'Ajustar stock', icono: 'swap_horiz',
                    onClick: () => (esFraccionado(p) ? setFichaId(p.id) : handleMovimientoClick(p.id)),
                  }] : []),
                  ...(puedeEditar ? [{ etiqueta: 'Editar', icono: 'edit', onClick: () => handleEditClick(p) }] : []),
                  { etiqueta: 'Historial', icono: 'history', onClick: () => { setSelectedProductId(p.id); setShowHistorialModal(true); } },
                  ...(puedeEditar ? [{ etiqueta: 'Eliminar', icono: 'delete', peligro: true, onClick: () => { setItemToDelete(p.id); setDeleteModalOpen(true); } }] : []),
                ]}
                columnas={[
                  {
                    clave: 'nombre', titulo: 'Producto', celda: p => (
                      <div className="flex min-w-[12rem] flex-col">
                        <span className="font-bold text-on-surface">{p.nombre}</span>
                        {p.requiereRevisionUnidades && <span className="mt-0.5 w-fit rounded-full bg-secondary/15 px-2 py-0.5 text-[10px] font-black text-secondary">Revisar unidades</span>}
                        <span className="text-[10px] font-medium text-outline">{p.codigo || 'S/C'}{p.descripcion ? ` · ${p.descripcion}` : ''}</span>
                      </div>
                    ),
                  },
                  {
                    clave: 'categoria', titulo: 'Categoría', celda: p => (
                      <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-primary">{p.categoria}</span>
                    ),
                  },
                  {
                    clave: 'stock', titulo: 'Stock', alinear: 'derecha', celda: p => {
                      if (p.tipo !== 'producto') return <span className="text-[10px] font-bold uppercase text-outline">{p.unidadMedida || 'servicio'}</span>;
                      const e = estadoActual(p);
                      const color = e === 'sin_stock' ? 'text-error' : e === 'bajo' ? 'text-secondary' : 'text-on-surface';
                      return (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className={cn('text-sm font-black leading-tight', color)}>{textoStockLista(p)}</span>
                          {(p.stockMinimoUnidad ?? 0) > 0 && <span className="text-[10px] font-bold text-outline">mínimo {textoMinimo(p)}</span>}
                          {e !== 'ok' && e !== 'no_aplica' && <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase', ETIQUETA_STOCK[e].clase)}>{ETIQUETA_STOCK[e].texto}</span>}
                        </div>
                      );
                    },
                  },
                  {
                    clave: 'costo', titulo: 'Costo', alinear: 'derecha', celda: p => (
                      <span className="font-bold text-on-surface-variant">
                        {formatCLP(costoDe(p))}
                        {p.unidadBase && p.unidadBase !== 'unidad' && <span className="block text-[9px] text-outline">por {p.unidadBase}</span>}
                      </span>
                    ),
                  },
                  {
                    clave: 'precio', titulo: 'Precio', alinear: 'derecha', celda: p => (
                      <div className="flex flex-col items-end">
                        <span className="font-black text-on-surface">{formatCLP(precioDe(p))}</span>
                        <span className="text-[9px] font-bold uppercase text-outline">
                          {presentacionesActivas(p).length > 1 ? `${presentacionesActivas(p).length} subcategorías` : p.incluyeIva ? 'IVA inc.' : '+ IVA'}
                        </span>
                      </div>
                    ),
                  },
                  {
                    clave: 'margen', titulo: 'Margen', alinear: 'derecha', celda: p => {
                      const pres = presentacionesActivas(p);
                      const precioRef = pres[0]?.precio ?? precioDe(p);
                      const costoRef = costoDe(p) * (pres[0]?.factor ?? 1) + (Number(pres[0]?.costoInsumos) || 0);
                      const precioNeto = p.incluyeIva ? Math.round(precioRef / 1.19) : precioRef;
                      const margen = precioNeto > 0 ? ((precioNeto - costoRef) / precioNeto) * 100 : 0;
                      return (
                        <span className={cn('rounded-lg px-2.5 py-1 text-[11px] font-black', margen > 30 ? 'bg-success-container text-on-success-container' : margen > 15 ? 'bg-secondary/10 text-secondary' : 'bg-error/10 text-error')}>
                          {margen.toFixed(1)}%
                        </span>
                      );
                    },
                  },
                ]}
              />
              <Paginacion {...paginacionInventario} />
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
        <div className="fixed inset-0 bg-scrim/50 backdrop-blur-sm z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-surface-container-lowest w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col h-[100dvh] sm:h-auto sm:max-h-[92vh] sm:rounded-3xl">
            <div className="px-4 sm:px-6 py-4 border-b border-outline-variant/20 flex justify-between items-center bg-surface-container-low/50 shrink-0">
              <h3 className="text-xl font-bold text-primary">{editingId ? 'Editar producto' : 'Registrar producto'}</h3>
              <button onClick={cerrarModalProducto} aria-label="Cerrar" className="text-on-surface-variant hover:text-error transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            {tipoEnFormulario === 'producto' ? (
              <RegistroProducto
                key={editingId ?? 'nuevo'}
                editando={editingId ? inventario.find(p => p.id === editingId) ?? null : null}
                general={nuevoProducto}
                onGeneral={cambios => setNuevoProducto(prev => ({ ...prev, ...cambios }))}
                inventario={inventario}
                proveedores={proveedores}
                envases={envases}
                plantillas={plantillasSubcategoria}
                margenObjetivo={margenObjetivo}
                rubroNegocio={perfil?.negocio_rubro ?? undefined}
                onGuardarPlantilla={guardarPlantilla}
                encabezado={selectorTipo}
                onCancelar={cerrarModalProducto}
                onGuardar={guardarProducto}
              />
            ) : (<>
            <div className="p-6 space-y-4 overflow-y-auto flex-grow">
              {selectorTipo}

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
                          <CampoMoneda valor={nuevoProducto.costoHora || nuevoProducto.costo || ''} onChange={(valor) => setNuevoProducto({...nuevoProducto, costoHora: valor})}
                            className="px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Tarifa por hora ($/h)</label>
                          <CampoMoneda valor={nuevoProducto.tarifaHora || nuevoProducto.precio || ''} onChange={(valor) => setNuevoProducto({...nuevoProducto, tarifaHora: valor})}
                            className="px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Costo fijo ($)</label>
                          <CampoMoneda valor={nuevoProducto.costoFijo || nuevoProducto.costo || ''} onChange={(valor) => setNuevoProducto({...nuevoProducto, costoFijo: valor})}
                            className="px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Precio fijo ($)</label>
                          <CampoMoneda valor={nuevoProducto.precioFijo || nuevoProducto.precio || ''} onChange={(valor) => setNuevoProducto({...nuevoProducto, precioFijo: valor})}
                            className="px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" />
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
            </div>
            <div className="px-6 py-4 border-t border-outline-variant/20 flex justify-end gap-3 bg-surface-container-low/50 shrink-0">
              <button onClick={() => { setShowModal(false); setEditingId(null); setMostrarInputCategoria(false); setNuevaCategoria(''); setBarcodeManualEntry(false); setNuevoProducto(CAMPOS_INICIALES('producto')); }} className="px-6 py-2 rounded-full font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors">
                Cancelar
              </button>
              <button onClick={handleGuardar} className="px-6 py-2 bg-primary text-inverse-on-surface rounded-full font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
                {editingId ? 'Guardar Cambios' : 'Guardar Producto'}
              </button>
            </div>
            </>)}
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
                  <CampoMoneda valor={nuevoMovimiento.costoUnitario || ''} onChange={(valor) => setNuevoMovimiento({...nuevoMovimiento, costoUnitario: valor})}
                    className="px-4 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none text-on-surface bg-surface-container-lowest" placeholder="Actualizar costo..." />
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
            {errorMovimiento && <p className="px-6 pb-2 text-sm font-bold text-error">{errorMovimiento}</p>}
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

      {fichaId && inventario.some(p => p.id === fichaId) && (
        <FichaProducto producto={inventario.find(p => p.id === fichaId)!} onCerrar={() => { setFichaId(null); setAccionFicha(null); }} puedeEditar={puedeEditar}
          accionInicial={accionFicha} onEditar={puedeEditar ? () => { const p = inventario.find(x => x.id === fichaId); setFichaId(null); if (p) handleEditClick(p); } : undefined} />
      )}
      {revisionIds && (
        <ModalRevisionUnidades
          productos={revisionIds.map(id => inventario.find(p => p.id === id)).filter((p): p is Producto => !!p)}
          onCerrar={() => setRevisionIds(null)}
        />
      )}

      {/* Modal Confirmar Eliminación */}
      {showCargaMasiva && (
        <Suspense fallback={null}>
          <ModalCargaMasivaInventario
            isOpen={showCargaMasiva}
            onClose={() => setShowCargaMasiva(false)}
            onImport={(productos) => { productos.forEach(p => addProducto(p)); }}
            inventarioExistente={inventario}
          />
        </Suspense>
      )}
      <ConfirmDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setItemToDelete(null); }}
        onConfirm={() => { if (itemToDelete) deleteProducto(itemToDelete); }}
        title="Eliminar Producto"
      />
    </div>
  );
}
