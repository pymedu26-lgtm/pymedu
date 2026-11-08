import { useState, useMemo, useEffect, useRef, lazy, Suspense, useDeferredValue } from 'react';
import { presentacionesActivas } from '../services/costeo';
import {
  textoDisponibilidad, describirConsumos, resumenStock, formatCantidad, usaEnvases, stockDisponible, tipoPresentacion, aBase, desdeBase, r3, contarEnvases,
  type ErrorInventario, type UnidadEntrada,
} from '../services/inventarioFraccionado';
import { useERP, Venta, VentaProducto, Producto, normalizarNombre, type Presentacion } from '../context/ERPContext';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import TarjetasResumen from '../components/TarjetasResumen';
import BuscadorCliente from '../components/BuscadorCliente';
import SelectorFecha from '../components/SelectorFecha';
import CampoMoneda from '../../components/CampoMoneda';
import FiltroPeriodo from '../components/FiltroPeriodo';
import SelectorDesplegable, { etiquetaRangoPeriodo, rangoPeriodo } from '../../components/SelectorDesplegable';
import { useAuth } from '../../context/AuthContext';
import { DOCUMENT_LABELS, STATUS_LABELS, normalizeDocumentType } from '../services/documentCompliance';
import { abrirPdfNotaVenta, abrirPdfVentasLote } from '../services/pdfNotaVenta';
import { cn, formatFecha } from '@/lib/utils';
import { formatCLP, rangoMes as rangoMesLocal, rangoUltimosMeses } from '@/lib/fechas';
import { agruparSerie, totalesPor, NOMBRE_GRANULARIDAD } from '@/lib/series';
import GraficoSerie from '../../components/graficos/GraficoSerie';
import GraficoDona from '../../components/graficos/GraficoDona';
import GraficoBarras from '../../components/graficos/GraficoBarras';
import { METODO_PAGO, TarjetaGrafico } from '../../components/graficos/comunes';
import { usePaletaGraficos } from '../../components/graficos/paleta';

/** El lector de Excel pesa ~400 KB: se descarga solo al abrir la carga masiva, no con la pagina. */
const ModalCargaMasivaVentas = lazy(() => import('../components/ModalCargaMasivaVentas'));

/** Boleta o Factura segun el tipo de documento elegido (agrupa variantes exentas). */
function tipoBoletaOFactura(tipo: Venta['tipo_documento']): 'Boleta' | 'Factura' | 'Otro' {
  const doc = normalizeDocumentType(tipo);
  if (doc.startsWith('boleta')) return 'Boleta';
  if (doc.startsWith('factura')) return 'Factura';
  return 'Otro';
}

/** Categorias de una venta en la tabla: muestra hasta 2 y el resto como "+N". */
function ChipsCategorias({ categorias }: { categorias: string[] }) {
  if (categorias.length === 0) {
    return <span className="text-on-surface-variant/50 text-xs">—</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {categorias.slice(0, 2).map(c => (
        <span
          key={c}
          className={`px-2 py-1 rounded-full text-[10px] font-bold whitespace-nowrap ${
            c === 'Sin categoria'
              ? 'bg-surface-container-high text-on-surface-variant/80 border border-dashed border-outline-variant/40'
              : 'bg-secondary/15 text-secondary'
          }`}
        >
          {c}
        </span>
      ))}
      {categorias.length > 2 && (
        <span
          title={categorias.slice(2).join(', ')}
          className="px-2 py-1 rounded-full text-[10px] font-bold bg-primary/10 text-primary cursor-help"
        >
          +{categorias.length - 2}
        </span>
      )}
    </div>
  );
}

export default function ERPVentas() {
  const { user: userAuth, perfil } = useAuth();
  const {
    ventas, gastos, clientes, inventario, promociones, documentosTributarios, pagosPOS, configuracionCumplimiento, addVenta, updateVenta, deleteVenta, previewVentaImpacto, envases,
    simularVenta, politicaEnvaseAbierto, registrarEventos,
  } = useERP();
  /** Buscador del catálogo (productos y sus subcategorías como opciones directas). */
  const [busquedaCatalogo, setBusquedaCatalogo] = useState('');
  /** Venta por peso/volumen variable: lo que marca la balanza y su unidad. */
  const [pesoTexto, setPesoTexto] = useState('1');
  const [pesoUnidad, setPesoUnidad] = useState<UnidadEntrada>('kg');
  /** Celular: catálogo → cobro (en tablet y escritorio se ven las dos columnas). */
  const [pasoMovil, setPasoMovil] = useState<'catalogo' | 'cobro'>('catalogo');
  const [showModal, setShowModal] = useState(false);
  const [showCargaMasiva, setShowCargaMasiva] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [montoPagado, setMontoPagado] = useState('');
  const [avisoStock, setAvisoStock] = useState('');
  /** Resultado de la carga masiva (ventas rechazadas por stock). */
  const [avisoMasivo, setAvisoMasivo] = useState('');
  /** Id estable de la venta nueva: un doble clic o reintento con el mismo id no descuenta dos veces. */
  const idVentaRef = useRef<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [activeTab, setActiveTab] = useState<'lista' | 'analisis'>('lista');

  useEffect(() => {
    if (periodoSeleccionado === 'personalizado' && !filtros.fechaInicio && !filtros.fechaFin) {
      const { inicio, fin } = rangoUltimos3Meses();
      setFiltros(prev => ({ ...prev, fechaInicio: inicio, fechaFin: fin }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Propina 10% opcional: campo separado (Caja), no infla IVA ni documento tributario. */
  const [aplicarPropina, setAplicarPropina] = useState(false);
  /** Venta seleccionada en la tabla → abre Nota de Venta formato Chile (imprimir/PDF). */
  const [ventaNota, setVentaNota] = useState<Venta | null>(null);
  /** Generando el PDF: deshabilita el botón para no abrir varias pestañas. */
  const [generandoPdf, setGenerandoPdf] = useState(false);
  /** Ids de las ventas marcadas en la tabla: alimentan el PDF múltiple. */
  const [ventasSeleccionadas, setVentasSeleccionadas] = useState<string[]>([]);

  const [filtros, setFiltros] = useState({
    fechaInicio: '',
    fechaFin: '',
    estado: 'Todos',
    cliente: '',
    categoria: '',
    realizadoPor: ''
  });

  const handleImportMasivo = (nuevasVentas: Omit<Venta, 'id'>[]) => {
    const rechazadas: string[] = [];
    nuevasVentas.forEach((v, i) => {
      const r = addVenta(v);
      if ('error' in r) rechazadas.push(`fila ${i + 1}: ${r.error.mensaje}`);
    });
    setAvisoMasivo(rechazadas.length
      ? `${rechazadas.length} de ${nuevasVentas.length} ventas no se importaron (no alcanzaba el stock). ${rechazadas.slice(0, 3).join(' · ')}${rechazadas.length > 3 ? '…' : ''}`
      : '');
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
    /** Presentación elegida (decant, saco…); '' = venta por unidad base. */
    presentacionId: '',
    nombre: '',
    categoria: '',
    cantidad: 1,
    precio: 0,
    descuentoTipo: 'ninguno' as 'porcentaje' | 'monto' | 'ninguno',
    descuentoValor: 0,
    descuentoMotivo: ''
  });

  const productoSeleccionado = inventario.find(p => p.id === productoActual.productoId);
  const presentacionesProducto = presentacionesActivas(productoSeleccionado);
  const presentacionActual = presentacionesProducto.find(x => x.id === productoActual.presentacionId);
  /** Unidades base que descuenta cada unidad vendida (decant 5 ml → 5). */
  const factorActual = presentacionActual?.factor ?? 1;
  const esVariable = !!productoSeleccionado && !!presentacionActual && tipoPresentacion(productoSeleccionado, presentacionActual) === 'variable';
  const unidadesPeso: UnidadEntrada[] = productoSeleccionado?.unidadBase === 'ml' ? ['l', 'ml'] : ['kg', 'g'];
  const pesosRapidos: { valor: number; unidad: UnidadEntrada }[] = unidadesPeso[0] === 'l'
    ? [{ valor: 0.5, unidad: 'l' }, { valor: 1, unidad: 'l' }, { valor: 2, unidad: 'l' }]
    : [{ valor: 500, unidad: 'g' }, { valor: 1, unidad: 'kg' }, { valor: 2, unidad: 'kg' }, { valor: 5, unidad: 'kg' }];
  /** Cantidad de la ficha en la unidad de la subcategoría (variable: peso ÷ unidad de precio). */
  const cantidadFicha = esVariable
    ? r3(aBase(Number(pesoTexto.replace(',', '.')) || 0, pesoUnidad) / (factorActual || 1))
    : Number(productoActual.cantidad) || 0;
  /** «1,37 kg × $1.500/kg». */
  const detalleMedidaDe = (pres: Presentacion, cantidad: number) => {
    const unidad = pres.unidadVenta ?? (productoSeleccionado?.unidadBase === 'ml' ? 'l' : 'kg');
    const etiqueta = unidad === 'l' ? 'L' : unidad;
    return `${cantidad.toLocaleString('es-CL', { maximumFractionDigits: 3 })} ${etiqueta} × ${formatCLP(pres.precio)}/${etiqueta}`;
  };
  const tipoDocumentoNormalizado = normalizeDocumentType(nuevaVenta.tipo_documento);
  const documentosDelMes = documentosTributarios.filter(d => d.periodoTributario === (nuevaVenta.fecha ?? '').slice(0, 7));
  const documentosPendientes = documentosTributarios.filter(d => ['borrador', 'pendiente_emision', 'observado', 'rechazado_sii'].includes(d.estado)).length;
  const pagosSinVenta = pagosPOS.filter(p => p.estadoConciliacion === 'sin_venta').length;
  
  const promocionActiva = useMemo(() => {
    if (!productoSeleccionado || !nuevaVenta.fecha) return null;
    return promociones.find(p => 
      p.estado === 'activa' && 
      p.fechaInicio <= nuevaVenta.fecha! && 
      (!p.fechaFin || p.fechaFin >= nuevaVenta.fecha!) &&
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

  /** Cantidad ya cargada en la venta, en unidad base (las presentaciones descuentan factor × cantidad). */
  const cantidadEnVenta = (productoId: string) =>
    (nuevaVenta.productos || [])
      .filter(p => p.productoId === productoId)
      .reduce((acc, p) => acc + (p.cantidadBase ?? p.cantidad ?? 0), 0);

  /** Datos del emisor que se imprimen en el PDF, tomados del perfil. */
  const datosEmisorPdf = {
    nombre: perfil?.negocio_nombre,
    rut: perfil?.negocio_rut,
    giro: perfil?.negocio_rubro,
    direccion: perfil?.negocio_direccion,
    comuna: perfil?.negocio_comuna,
    logoUrl: perfil?.logo_url,
  };

  /** Genera el PDF de la nota y lo abre en una pestaña nueva para previsualizar y descargar. */
  const handleVerPdf = async () => {
    if (!ventaNota || generandoPdf) return;
    setGenerandoPdf(true);
    try {
      await abrirPdfNotaVenta(ventaNota, datosEmisorPdf);
    } catch (e) {
      console.error('No se pudo generar el PDF de la venta', e);
      alert('No se pudo generar el PDF. Intenta de nuevo.');
    } finally {
      setGenerandoPdf(false);
    }
  };

  /** Un solo PDF con una página por venta, para las marcadas en la tabla. */
  const handlePdfSeleccionadas = async () => {
    if (ventasMarcadas.length === 0 || generandoPdf) return;
    setGenerandoPdf(true);
    try {
      await abrirPdfVentasLote(ventasMarcadas, datosEmisorPdf);
    } catch (e) {
      console.error('No se pudo generar el PDF multiple', e);
      alert('No se pudo generar el PDF. Intenta de nuevo.');
    } finally {
      setGenerandoPdf(false);
    }
  };

const ventaEditada = editingId ? ventas.find(v => v.id === editingId) : undefined;

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
    if (descuentoTipo === 'porcentaje') descuento = Math.round(bruto * (descuentoValor / 100));
    else if (descuentoTipo === 'monto') descuento = descuentoValor;
    const base = Math.max(0, Math.round(bruto - descuento));
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
    const cantidad = cantidadFicha || (esVariable ? 0 : 1);
    if (!nombre || precio <= 0 || !(cantidad > 0)) return null;

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

    const pres = esInventario ? presentacionActual : undefined;
    return {
      productoId: esInventario ? productoSeleccionado!.id : `TEXTO-LIBRE-${crypto.randomUUID().slice(0, 8)}`,
      productoNombre: pres ? `${nombre} › ${pres.nombre}` : nombre,
      esInventariable: esInventario,
      cantidad,
      precioBase: precio,
      // Estimado para la vista previa; al guardar el contexto congela el costo real según el método de costeo.
      costoUnitario: esInventario ? Math.round((productoSeleccionado?.costo ?? 0) * (pres?.factor ?? 1)) : 0,
      ...(pres ? { presentacionId: pres.id, presentacionNombre: pres.nombre, cantidadBase: r3(cantidad * pres.factor) } : {}),
      ...(pres && esVariable ? { detalleMedida: detalleMedidaDe(pres, cantidad) } : {}),
      descuentoTipo: aplicaDescuento ? productoActual.descuentoTipo : 'ninguno',
      descuentoValor: aplicaDescuento ? productoActual.descuentoValor : 0,
      /** Sin categoria informada queda 'Sin categoria', no cadena vacia. */
      categoria: productoActual.categoria.trim() || 'Sin categoria',
      subtotal: totales.subtotal,
      iva: totales.iva,
      total: totales.total,
    };
  };

  // ── Simulación con las MISMAS funciones que al guardar (services/inventarioFraccionado.ts):
  // detecta stock insuficiente o que hay que abrir un frasco antes de agregar o confirmar.
  const carrito = nuevaVenta.productos || [];
  const itemCandidato = productoActual.esInventario && productoSeleccionado?.tipo === 'producto' && Number(productoActual.cantidad) > 0
    ? construirItemVenta() : null;
  const simCarrito = carrito.length > 0 ? simularVenta(carrito, editingId ?? undefined) : null;
  const simConItem = itemCandidato ? simularVenta([...carrito, itemCandidato], editingId ?? undefined) : null;
  const errorItem = simConItem?.error && (simConItem.error.linea === carrito.length || !simCarrito?.error) ? simConItem.error : undefined;
  const lineaItemSimulada = simConItem && !simConItem.error ? simConItem.lineas[carrito.length] : undefined;
  const stockInsuficiente = !!errorItem;
  const mensajeVenta = (e: ErrorInventario) => (e.linea !== undefined ? `Línea ${e.linea + 1}: ${e.mensaje}` : e.mensaje);

  /** La venta abriría un envase cerrado: «Abrirá F4». */
  const aperturaItem = simConItem && !simConItem.error
    ? simConItem.aperturas.filter(a => a.productoId === productoSeleccionado?.id && !(simCarrito?.aperturas ?? []).some(x => x.envaseId === a.envaseId)).map(a => a.codigo).join(', ')
    : '';
  const usaEnvasesEnCarrito = carrito.some(l => usaEnvases(inventario.find(p => p.id === l.productoId)));
  /** «2 decants», «1,2 kg», «3 unidades». */
  const textoMaximo = (maximo: number, linea?: VentaProducto) => {
    const prod = linea ? inventario.find(p => p.id === linea.productoId) : productoSeleccionado;
    const pres = linea ? prod?.presentaciones?.find(x => x.id === linea.presentacionId) : presentacionActual;
    if (prod && pres && tipoPresentacion(prod, pres) === 'variable') return formatCantidad(maximo * pres.factor, prod.unidadBase);
    if (prod && pres && tipoPresentacion(prod, pres) === 'completa' && usaEnvases(prod)) return contarEnvases(prod, maximo);
    const nombre = pres?.nombre ?? '';
    return /^decant/i.test(nombre) ? `${maximo} decant${maximo === 1 ? '' : 's'}` : `${maximo} ${maximo === 1 ? 'unidad' : 'unidades'}`;
  };
  const limpiarFicha = () => {
    setProductoActual(prev => ({ ...prev, esInventario: true, productoId: '', presentacionId: '', nombre: '', categoria: '', cantidad: 1, precio: 0, descuentoTipo: 'ninguno', descuentoValor: 0, descuentoMotivo: '' }));
    setPesoTexto('1');
    setBusquedaCatalogo('');
  };
  /** Elige producto + subcategoría desde el buscador o los chips. */
  const seleccionarOpcion = (prod: Producto, pres?: Presentacion) => {
    const variable = !!pres && tipoPresentacion(prod, pres) === 'variable';
    setProductoActual(prev => ({
      ...prev, esInventario: true, productoId: prod.id, presentacionId: pres?.id ?? '', nombre: prod.nombre, categoria: prod.categoria ?? '',
      precio: pres?.precio ?? prod.precio ?? 0, cantidad: prev.productoId === prod.id ? prev.cantidad : 1,
      ...(prev.productoId === prod.id ? {} : { descuentoTipo: 'ninguno' as const, descuentoValor: 0, descuentoMotivo: '' }),
    }));
    if (variable) { setPesoUnidad(pres!.unidadVenta === 'l' || prod.unidadBase === 'ml' ? 'l' : 'kg'); setPesoTexto('1'); }
    setBusquedaCatalogo('');
  };
  /** «Vender el máximo disponible (2 decants)». */
  const venderMaximo = () => {
    const maximo = errorItem?.maximo ?? 0;
    if (!(maximo > 0)) return;
    if (esVariable && presentacionActual) setPesoTexto(String(desdeBase(maximo * presentacionActual.factor, pesoUnidad)).replace('.', ','));
    else setProductoActual(prev => ({ ...prev, cantidad: maximo }));
  };
  /** Ajusta una línea del carrito al máximo que alcanza (recalcula totales). */
  const ajustarLineaAlMaximo = (idx: number, maximo: number) => {
    setNuevaVenta(prev => {
      const prods = [...(prev.productos || [])];
      const l = prods[idx];
      if (!l) return prev;
      const prod = inventario.find(x => x.id === l.productoId);
      const pres = prod?.presentaciones?.find(x => x.id === l.presentacionId);
      const incluyeIva = prod ? !!prod.incluyeIva : true;
      const tipoDesc = l.descuentoTipo && l.descuentoTipo !== 'ninguno' ? l.descuentoTipo : 'ninguno';
      const t = calcularTotalesItem(l.precioBase, maximo, tipoDesc, tipoDesc === 'ninguno' ? 0 : (l.descuentoValor || 0), incluyeIva);
      prods[idx] = {
        ...l, cantidad: maximo, ...(pres ? { cantidadBase: r3(maximo * pres.factor) } : {}),
        ...(l.detalleMedida && pres ? { detalleMedida: detalleMedidaDe(pres, maximo) } : {}),
        subtotal: t.subtotal, iva: t.iva, total: t.total,
      };
      return { ...prev, productos: prods };
    });
  };
  /** Catálogo: cada subcategoría es una opción directa («Lattafa Asad · Decant 5 ml · $6.500 · 393 disponibles»). */
  const busquedaDiferida = useDeferredValue(busquedaCatalogo);
  const opcionesCatalogo = useMemo(() => {
    const q = normalizarNombre(busquedaDiferida);
    const lista: { clave: string; producto: Producto; pres?: Presentacion; tipo?: string; precio: number; disp: string; agotado: boolean }[] = [];
    for (const prod of inventario) {
      if (prod.estado !== 'activo') continue;
      const texto = normalizarNombre(`${prod.nombre} ${prod.categoria ?? ''} ${prod.codigo ?? ''}`);
      const pres = prod.tipo === 'producto' ? presentacionesActivas(prod) : [];
      if (pres.length) {
        for (const x of pres) {
          if (q && !texto.includes(q) && !normalizarNombre(x.nombre).includes(q)) continue;
          const d = textoDisponibilidad(prod, envases, x, politicaEnvaseAbierto);
          lista.push({ clave: `${prod.id}:${x.id}`, producto: prod, pres: x, tipo: tipoPresentacion(prod, x), precio: x.precio, disp: d.texto, agotado: d.unidades <= 0 });
        }
      } else {
        if (q && !texto.includes(q)) continue;
        const stock = prod.tipo === 'producto' ? stockDisponible(prod, envases) : 0;
        lista.push({
          clave: prod.id, producto: prod, precio: Number(prod.precio) || Number(prod.precioFijo) || Number(prod.tarifaHora) || 0,
          disp: prod.tipo === 'producto' ? (stock > 0 ? `${formatCantidad(stock, prod.unidadBase)} disponibles` : 'Sin stock') : 'Servicio',
          agotado: prod.tipo === 'producto' && stock <= 0,
        });
      }
      if (lista.length >= (q ? 40 : 10)) break;
    }
    return lista;
  }, [busquedaDiferida, inventario, envases, politicaEnvaseAbierto]);

  const handleAgregarProducto = () => {
    // Bloqueo: no alcanza el stock total → no entra al carrito y queda registrado el intento.
    if (errorItem) {
      registrarEventos(simConItem?.eventos ?? [], false);
      return;
    }
    const item = construirItemVenta();
    if (!item) return;

    setNuevaVenta(prev => {
      const prods = prev.productos || [];
      // Las ventas por peso no se juntan: cada pesada es su propia línea.
      const idx = item.detalleMedida ? -1 : prods.findIndex(p =>
        (p.esInventariable ?? false) === (item.esInventariable ?? false) && !p.detalleMedida &&
        p.productoId === item.productoId && (p.presentacionId ?? '') === (item.presentacionId ?? '')
      );
      if (idx >= 0) {
        const actual = prods[idx];
        const cantidadTotal = actual.cantidad + item.cantidad;
        const incluyeIva = item.total === item.precioBase * item.cantidad;
        const tipoDesc = actual.descuentoTipo && actual.descuentoTipo !== 'ninguno' ? actual.descuentoTipo : 'ninguno';
        const totales = calcularTotalesItem(item.precioBase, cantidadTotal, tipoDesc, tipoDesc === 'ninguno' ? 0 : (actual.descuentoValor || 0), incluyeIva);
        const newProds = prods.slice();
        newProds[idx] = { ...actual, cantidad: cantidadTotal, cantidadBase: actual.cantidadBase !== undefined ? (actual.cantidadBase + (item.cantidadBase ?? 0)) : undefined, subtotal: totales.subtotal, iva: totales.iva, total: totales.total };
        return { ...prev, productos: newProds };
      }
      return { ...prev, productos: [...prods, item] };
    });

    setProductoActual({
      esInventario: true,
      productoId: '',
      presentacionId: '',
      nombre: '',
      categoria: '',
      cantidad: 1,
      precio: 0,
      descuentoTipo: 'ninguno',
      descuentoValor: 0,
      descuentoMotivo: ''
    });
    setPesoTexto('1');
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
    cantidadFicha,
    productoActual.esInventario && productoActual.descuentoTipo !== 'ninguno' ? productoActual.descuentoTipo : 'ninguno',
    productoActual.esInventario && productoActual.descuentoTipo !== 'ninguno' ? productoActual.descuentoValor : 0,
    fichaIncluyeIva
  );
  // Con stock insuficiente el botón sigue activo: al tocarlo se informa y se registra el intento.
  const fichaValida = productoActual.nombre.trim().length > 0
    && Number(productoActual.precio) > 0
    && (esVariable ? cantidadFicha > 0 : cantidadFicha >= 1);

  const totalesVenta = useMemo(() => {
    const prods = nuevaVenta.productos || [];
    const subtotal = prods.reduce((acc, p) => acc + p.subtotal, 0);
    const iva = prods.reduce((acc, p) => acc + p.iva, 0);
    const total = prods.reduce((acc, p) => acc + p.total, 0);

    return { subtotal, iva, total };
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
      setMontoPagado(String(Math.round(totalesVenta.total)));
    }
  }, [showModal, nuevaVenta.estado, totalesVenta.total]);

  const [periodoSeleccionado, setPeriodoSeleccionado] = useState('este_mes');

  /** Rango de mes natural en fechas locales (toISOString() corría el día por UTC). */
  const rangoMes = (offset: number) => rangoMesLocal(offset);

  /** Últimos 3 meses: mes actual + 2 meses atrás */
  const rangoUltimos3Meses = () => rangoUltimosMeses(3);

  useEffect(() => {
    const rango = rangoPeriodo(periodoSeleccionado);
    if (rango) setFiltros(prev => ({ ...prev, fechaInicio: rango.inicio, fechaFin: rango.fin }));
  }, [periodoSeleccionado]);

  /** Rango real de datos disponibles: acota hasta donde el usuario puede navegar. */
  const rangoDisponible = useMemo(() => {
    const fechas = ventas.map(v => v.fecha).filter(Boolean).sort();
    if (fechas.length === 0) return null;
    return { min: fechas[0], max: fechas[fechas.length - 1] };
  }, [ventas]);

  /** El rango manual parte con últimos 3 meses por defecto. */
  const elegirPeriodo = (valor: string) => {
    setPeriodoSeleccionado(valor);
    if (valor === 'personalizado') {
      const { inicio, fin } = rangoUltimos3Meses();
      setFiltros(prev => ({ ...prev, fechaInicio: inicio, fechaFin: fin }));
    }
  };

  const etiquetaRango = etiquetaRangoPeriodo(
    periodoSeleccionado === 'personalizado',
    filtros.fechaInicio,
    filtros.fechaFin,
    rangoDisponible
  );

  /* ══ Categorias y autores: alimentan los filtros y la columna Categoria ══ */

  /** Categoria del inventario por id de producto: respaldo cuando el item no la trae. */
  const categoriaPorProducto = useMemo(() => {
    const mapa: Record<string, string> = {};
    inventario.forEach(p => {
      if (p.categoria) mapa[p.id] = p.categoria;
    });
    return mapa;
  }, [inventario]);

  /** Categorias distintas de los items de una venta, en el orden en que aparecen. */
  const categoriasDeVenta = (venta: Venta): string[] => {
    const cats = new Set<string>();
    venta.productos.forEach(p => {
      cats.add(p.categoria || categoriaPorProducto[p.productoId] || 'Sin categoria');
    });
    return Array.from(cats);
  };

  /** Resueltas una vez por venta (sobre todas, no solo las filtradas: el filtro las necesita),
   *  junto con la lista de categorias existentes, que es la que ofrece el filtro. */
  const { categoriasPorVenta, categoriasDisponibles } = useMemo(() => {
    const porVenta: Record<string, string[]> = {};
    const existentes = new Set<string>();
    ventas.forEach(v => {
      const cats = categoriasDeVenta(v);
      porVenta[v.id] = cats;
      cats.forEach(c => existentes.add(c));
    });
    return {
      categoriasPorVenta: porVenta,
      categoriasDisponibles: Array.from(existentes).sort((a, b) => a.localeCompare(b)),
    };
  }, [ventas, categoriaPorProducto]);

  /** Quien registro la venta, con el mismo fallback que muestra la tabla. */
  const autorDeVenta = (venta: Venta): string =>
    venta.creado_por || venta.creado_por_id?.slice(0, 6)?.toUpperCase() || 'Sistema';

  /** Opciones del filtro Realizado por. */
  const autoresDisponibles = useMemo<string[]>(() => {
    const autores = new Set<string>();
    ventas.forEach(v => autores.add(autorDeVenta(v)));
    return Array.from(autores).sort((a, b) => a.localeCompare(b));
  }, [ventas]);

  const filtrosDeferred = useDeferredValue(filtros);
  const ventasFiltradas = useMemo(() => {
    return ventas.filter(v => {
      const matchFechaInicio = !filtrosDeferred.fechaInicio || v.fecha >= filtrosDeferred.fechaInicio;
      const matchFechaFin = !filtrosDeferred.fechaFin || v.fecha <= filtrosDeferred.fechaFin;
      const matchEstado = filtrosDeferred.estado === 'Todos' || v.estado === filtrosDeferred.estado;
      const matchCliente = !filtrosDeferred.cliente || v.cliente.toLowerCase().includes(filtrosDeferred.cliente.toLowerCase());
      // La venta entra si al menos uno de sus items es de la categoria elegida.
      const matchCategoria = !filtrosDeferred.categoria || (categoriasPorVenta[v.id] ?? []).includes(filtrosDeferred.categoria);
      const matchAutor = !filtrosDeferred.realizadoPor || autorDeVenta(v) === filtrosDeferred.realizadoPor;
      return matchFechaInicio && matchFechaFin && matchEstado && matchCliente && matchCategoria && matchAutor;
    });
  }, [ventas, filtrosDeferred, categoriasPorVenta]);

  /* ══ Acciones múltiples sobre la tabla ══ */

  /** Ventas marcadas, en el orden en que aparecen en la tabla. */
  const ventasMarcadas = useMemo(
    () => ventasFiltradas.filter(v => ventasSeleccionadas.includes(v.id)),
    [ventasFiltradas, ventasSeleccionadas]
  );

  const todasMarcadas = ventasFiltradas.length > 0 && ventasFiltradas.every(v => ventasSeleccionadas.includes(v.id));

  const alternarVenta = (id: string) => {
    setVentasSeleccionadas(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const alternarTodas = () => {
    setVentasSeleccionadas(prev => {
      if (todasMarcadas) return prev.filter(id => !ventasFiltradas.some(v => v.id === id));
      return Array.from(new Set([...prev, ...ventasFiltradas.map(v => v.id)]));
    });
  };

  // Al cambiar los filtros la lista muestra otras ventas: la marca se reinicia para
  // no generar un PDF con documentos que el usuario ya no ve.
  useEffect(() => {
    setVentasSeleccionadas([]);
  }, [filtros, periodoSeleccionado]);

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

  /* ══ Gráficos ══
   * La serie cubre TODO el rango elegido con tramos continuos (en cero si no hubo
   * ventas) y elige día / semana / mes según el largo del rango, no según las fechas
   * que tienen datos: con varios meses ya no se dibujan cientos de puntos. */
  const paleta = usePaletaGraficos();
  const serieVentas = useMemo(
    () => agruparSerie(ventasFiltradas, { inicio: filtrosDeferred.fechaInicio, fin: filtrosDeferred.fechaFin }, v => v.fecha, v => ({ monto: v.monto })),
    [ventasFiltradas, filtrosDeferred.fechaInicio, filtrosDeferred.fechaFin]
  );

  const datosVentasPorCategoria = useMemo(
    () => totalesPor(ventasFiltradas.flatMap(v => v.productos), p => p.categoria || categoriaPorProducto[p.productoId], p => p.total),
    [ventasFiltradas, categoriaPorProducto]
  );

  const datosMetodosPago = useMemo(
    () => totalesPor(ventasFiltradas, v => METODO_PAGO[v.metodo_pago || 'efectivo'] ?? v.metodo_pago, v => v.monto),
    [ventasFiltradas]
  );

  const handleGuardar = () => {
    if (nuevaVenta.productos && nuevaVenta.productos.length > 0 && nuevaVenta.fecha) {
      /** Estado elegido a mano por el usuario: respeta su marca, no se recalcula. */
      const estadoElegido: Venta['estado'] = nuevaVenta.estado === 'Pendiente' ? 'Pendiente' : 'Pagado';
      const pagoInicial = estadoElegido === 'Pagado'
        ? totalesVenta.total
        : Number(montoPagado || 0);
      const saldoPendiente = estadoElegido === 'Pagado'
        ? 0
        : Math.max(0, totalesVenta.total - pagoInicial);

      // Inventario: misma validación que al guardar (todas las líneas o ninguna).
      if (simCarrito?.error) { setAvisoStock(mensajeVenta(simCarrito.error)); return; }
      setAvisoStock('');

      const datos = {
        fecha: nuevaVenta.fecha,
        cliente: nuevaVenta.cliente || 'Cliente General',
        cliente_id: nuevaVenta.cliente_id,
        productos: nuevaVenta.productos,
        subtotal: impactoVenta.neto || impactoVenta.exento || totalesVenta.subtotal,
        iva: impactoVenta.ivaDebito,
        monto: totalesVenta.total,
        /** Propina separada de un documento que SI es venta indicada (no infla IVA). */
        propina: propinaCalculada,
        estado: estadoElegido,
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
      setGuardando(true);
      const r = editingId ? updateVenta(editingId, datos) : addVenta({ ...datos, id: idVentaRef.current ?? undefined });
      setGuardando(false);
      if ('error' in r) { setAvisoStock(mensajeVenta(r.error)); return; }
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

  const exportarVentasCSV = () => {
    const headers = ['Folio', 'Fecha', 'Cliente', 'Tipo_Documento', 'Estado', 'Metodo_Pago', 'Subtotal', 'IVA', 'Total', 'Nota'];
    const rows = ventas.map(v => [
      v.folio,
      v.fecha,
      v.cliente,
      v.tipo_documento,
      v.estado,
      v.metodo_pago,
      v.subtotal,
      v.iva,
      v.total,
      v.nota || '',
    ]);
    descargarCSV(`ventas_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
  };
  const cerrarModal = () => {
    setShowModal(false);
    setEditingId(null);
    setPasoMovil('catalogo');
    setBusquedaCatalogo('');
  };

  const limpiarFiltros = () => {
    const { inicio, fin } = rangoMes(0);
    setFiltros({
      fechaInicio: inicio,
      fechaFin: fin,
      estado: 'Todos',
      cliente: '',
      categoria: '',
      realizadoPor: ''
    });
    setPeriodoSeleccionado('este_mes');
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex flex-wrap gap-4 justify-between items-center">
        <div>
          <h2 className="text-3xl font-extrabold text-primary tracking-tight">Ventas</h2>
          <p className="text-on-surface-variant mt-1">Registra y controla tus ingresos por ventas.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button 
            onClick={() => setShowCargaMasiva(true)}
            className="px-6 py-3 bg-surface-container-lowest text-primary border border-primary/30 rounded-full text-sm font-bold shadow-sm hover:bg-primary/5 transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">upload_file</span>
            Carga Masiva
          </button>
          <button onClick={exportarVentasCSV}
            className="px-6 py-3 bg-surface-container-lowest text-primary border border-primary/30 rounded-full text-sm font-bold shadow-sm hover:bg-primary/5 transition-all flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">download</span>
            Exportar
          </button>
          <button 
            onClick={() => { setEditingId(null); idVentaRef.current = crypto.randomUUID(); setAvisoStock(''); setPasoMovil('catalogo'); setBusquedaCatalogo(''); setShowModal(true); }}
            className="px-6 py-3 bg-primary text-inverse-on-surface rounded-full text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            Nueva Venta
          </button>
        </div>
      </div>

      {avisoMasivo && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-error/30 bg-error/10 px-4 py-3 text-sm font-bold text-error" role="alert">
          <span>{avisoMasivo}</span>
          <button type="button" onClick={() => setAvisoMasivo('')} aria-label="Cerrar aviso"><span className="material-symbols-outlined text-base">close</span></button>
        </div>
      )}

      {/* Summary Section */}
      <div className="space-y-4">
        <FiltroPeriodo
          periodo={periodoSeleccionado}
          etiqueta={etiquetaRango}
          rango={filtros}
          onPeriodo={elegirPeriodo}
          onRango={rango => setFiltros(prev => ({ ...prev, ...rango }))}
        />

        <TarjetasResumen
          totalVentas={totalVentas}
          totalGastos={totalGastos}
          meta={metaVenta}
          porcentajeMeta={porcentajeMeta}
          enNumerosVerdes={enNumerosVerdes}
          etiquetaPeriodo={etiquetaRango}
        />
      </div>

      {/* Gráficos: la serie del periodo a todo el ancho; categorías y métodos de pago lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TarjetaGrafico
          className="lg:col-span-2"
          icono="show_chart"
          titulo="Ventas por periodo"
          subtitulo={`Monto vendido ${NOMBRE_GRANULARIDAD[serieVentas.granularidad]} · ${etiquetaRango}`}
          extra={`${ventasFiltradas.length.toLocaleString('es-CL')} ventas · ${formatCLP(totalVentas)}`}
        >
          <GraficoSerie
            puntos={serieVentas.puntos}
            tipo={serieVentas.granularidad === 'dia' ? 'area' : 'barra'}
            series={[{ clave: 'monto', nombre: 'Ventas', color: paleta.ingresos }]}
            vacio="Sin ventas en el periodo"
          />
        </TarjetaGrafico>
        <TarjetaGrafico icono="donut_large" titulo="Por categoría" subtitulo="Monto vendido por categoría de producto">
          <GraficoDona items={datosVentasPorCategoria} vacio="Sin ventas en el periodo" />
        </TarjetaGrafico>
        <TarjetaGrafico icono="payments" titulo="Método de pago" subtitulo="Monto cobrado y participación">
          <GraficoBarras items={datosMetodosPago} color={paleta.ingresos} mostrarPct vacio="Sin ventas en el periodo" />
        </TarjetaGrafico>
      </div>

      {/* Filters */}
      <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-outline-variant/20 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold text-on-surface uppercase tracking-widest">Filtros Avanzados</h3>
          <button onClick={limpiarFiltros} className="text-sm text-primary hover:underline font-medium">Limpiar Filtros</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-on-surface-variant mb-1">Cliente</label>
            <input type="text" placeholder="Buscar..." value={filtros.cliente} onChange={e => setFiltros({...filtros, cliente: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface" />
          </div>
          <div>
            <label className="block text-xs text-on-surface-variant mb-1">Estado</label>
            <SelectorDesplegable
              className="w-full"
              valor={filtros.estado}
              onChange={valor => setFiltros({ ...filtros, estado: valor })}
              opciones={[
                { valor: 'Todos', etiqueta: 'Todos' },
                { valor: 'Pagado', etiqueta: 'Pagado' },
                { valor: 'Pendiente', etiqueta: 'Pendiente' }
              ]}
            />
          </div>
          <div>
            <label className="block text-xs text-on-surface-variant mb-1">Categoría</label>
            <SelectorDesplegable
              className="w-full"
              valor={filtros.categoria}
              onChange={valor => setFiltros({ ...filtros, categoria: valor })}
              opciones={[
                { valor: '', etiqueta: 'Todas' },
                ...categoriasDisponibles.map(c => ({ valor: c, etiqueta: c }))
              ]}
            />
          </div>
          <div>
            <label className="block text-xs text-on-surface-variant mb-1">Realizado por</label>
            <SelectorDesplegable
              className="w-full"
              valor={filtros.realizadoPor}
              onChange={valor => setFiltros({ ...filtros, realizadoPor: valor })}
              opciones={[
                { valor: '', etiqueta: 'Todos' },
                ...autoresDisponibles.map(a => ({ valor: a, etiqueta: a }))
              ]}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-container-low text-on-surface-variant font-bold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-4 py-4 w-10">
                  <input
                    type="checkbox"
                    checked={todasMarcadas}
                    onChange={alternarTodas}
                    disabled={ventasFiltradas.length === 0}
                    title="Seleccionar todas las ventas de la lista"
                    className="w-4 h-4 accent-primary cursor-pointer disabled:opacity-40"
                  />
                </th>
                <th className="px-6 py-4">Documento</th>
                <th className="px-6 py-4">Tipo</th>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4">Realizado por</th>
                <th className="px-6 py-4">Productos</th>
                <th className="px-6 py-4 text-right">Total</th>
                <th className="px-6 py-4">Categoría</th>
                <th className="px-6 py-4 text-center">Estado</th>
                <th className="px-6 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {ventasFiltradas.map((venta) => (
                <tr key={venta.id} className={`hover:bg-surface-container-low/30 transition-colors cursor-pointer ${ventasSeleccionadas.includes(venta.id) ? 'bg-primary/5' : ''}`} onClick={() => setVentaNota(venta)}>
                  <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={ventasSeleccionadas.includes(venta.id)}
                      onChange={() => alternarVenta(venta.id)}
                      title={`Marcar ${DOCUMENT_LABELS[normalizeDocumentType(venta.tipo_documento)] || 'venta'} ${venta.documento_id || venta.id}`}
                      className="w-4 h-4 rounded accent-primary cursor-pointer"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-xs font-black text-on-surface">
                      {DOCUMENT_LABELS[normalizeDocumentType(venta.tipo_documento)]}
                    </p>
                    <p className="text-[10px] text-on-surface-variant/60 font-bold">
                      {venta.estado_documento ? STATUS_LABELS[venta.estado_documento] : 'Documento pendiente'}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                      tipoBoletaOFactura(venta.tipo_documento) === 'Boleta'
                        ? 'bg-primary/10 text-primary'
                        : tipoBoletaOFactura(venta.tipo_documento) === 'Factura'
                          ? 'bg-tertiary/15 text-tertiary'
                          : 'bg-surface-container-high text-on-surface-variant'
                    }`}>
                      {tipoBoletaOFactura(venta.tipo_documento)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-on-surface-variant whitespace-nowrap">{formatFecha(venta.fecha)}</td>
                  <td className="px-6 py-4 font-semibold text-on-surface">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm text-primary/70">person</span>
                      {venta.cliente}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-on-surface-variant">
                      <span className="material-symbols-outlined text-sm text-tertiary">badge</span>
                      {autorDeVenta(venta)}
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
                  <td className="px-6 py-4">
                    <ChipsCategorias categorias={categoriasPorVenta[venta.id] ?? []} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${venta.estado === 'Pagado' ? 'bg-success-container text-on-success-container' : 'bg-secondary/20 text-secondary'}`}>
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
                  <td colSpan={11} className="px-6 py-8 text-center text-on-surface-variant">
                    No se encontraron ventas con los filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Acciones múltiples: al pie de la tabla, junto al resumen de lo marcado */}
      <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/20 p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="material-symbols-outlined text-xl text-primary">checklist</span>
          <p className="text-sm text-on-surface-variant">
            {ventasMarcadas.length > 0 ? (
              <>
                <span className="font-bold text-on-surface">{ventasMarcadas.length}</span>
                {ventasMarcadas.length === 1 ? ' venta seleccionada' : ' ventas seleccionadas'}
                <span className="text-on-surface-variant/70">
                  {' '}· total ${ventasMarcadas.reduce((acc, v) => acc + v.monto, 0).toLocaleString('es-CL')}
                </span>
              </>
            ) : (
              'Marca las ventas de la tabla para generar un PDF con varias notas.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {ventasMarcadas.length > 0 && (
            <button
              onClick={() => setVentasSeleccionadas([])}
              className="px-3 py-2 rounded-xl text-xs font-bold text-on-surface-variant hover:text-error transition-colors hover:bg-error/10 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">close</span>
              Quitar seleccion
            </button>
          )}

          <button
            onClick={handlePdfSeleccionadas}
            disabled={ventasMarcadas.length === 0 || generandoPdf}
            title={ventasMarcadas.length === 0 ? 'Selecciona al menos una venta' : 'Un PDF con una pagina por venta'}
            className="px-4 py-2 rounded-xl text-sm font-bold bg-primary text-inverse-on-surface shadow-sm hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">
              {generandoPdf ? 'progress_activity' : 'picture_as_pdf'}
            </span>
            {generandoPdf ? 'Generando...' : 'Generar PDF'}
          </button>
        </div>
      </div>

      {/* Modal Nueva Venta — mobile-first: en el celular una columna (buscador → subcategorías →
          cantidad o peso) y el carrito como barra inferior fija con «Cobrar»; desde md, dos
          columnas (catálogo | carrito). */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-scrim/50 backdrop-blur-sm sm:items-center sm:p-4">
          <div role="dialog" aria-modal="true" aria-label={editingId ? 'Editar venta' : 'Nueva venta'}
            className="flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden bg-surface-container-lowest shadow-2xl sm:h-auto sm:max-h-[94vh] sm:rounded-3xl">
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-outline-variant/20 bg-surface-container-low/50 px-4 py-2 sm:px-6 sm:py-3"
              style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}>
              <div className="flex min-w-0 items-center gap-1">
                {pasoMovil === 'cobro' && (
                  <button type="button" onClick={() => setPasoMovil('catalogo')} aria-label="Seguir agregando productos"
                    className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container md:hidden">
                    <span className="material-symbols-outlined">arrow_back</span>
                  </button>
                )}
                <h3 className="truncate text-lg font-bold text-primary sm:text-xl">
                  {editingId ? 'Editar venta' : 'Nueva venta'}
                  <span className="ml-2 text-xs font-bold text-on-surface-variant md:hidden">{pasoMovil === 'cobro' ? '· Cobro' : ''}</span>
                </h3>
              </div>
              <button onClick={cerrarModal} aria-label="Cerrar" className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container hover:text-error">
                <span className="material-symbols-outlined">close</span>
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto md:grid md:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] md:overflow-hidden">
              {/* ── Catálogo ── */}
              <section className={cn('space-y-4 p-4 sm:p-6 md:overflow-y-auto', pasoMovil === 'cobro' && 'hidden md:block')} aria-label="Catálogo">
                {productoActual.esInventario ? (
                  <>
                    <div className="relative">
                      <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline">search</span>
                      <input type="search" value={busquedaCatalogo} onChange={e => setBusquedaCatalogo(e.target.value)} aria-label="Buscar producto o subcategoría"
                        placeholder="Buscar producto o subcategoría…" autoComplete="off"
                        className="min-h-12 w-full rounded-2xl border border-outline-variant/50 bg-surface-container-lowest py-3 pl-11 pr-4 text-base text-on-surface outline-none focus:ring-2 focus:ring-primary/20 sm:text-sm" />
                    </div>

                    {(busquedaCatalogo.trim() || !productoSeleccionado) && (
                      <ul className="divide-y divide-outline-variant/20 overflow-hidden rounded-2xl border border-outline-variant/30" aria-label="Resultados">
                        {opcionesCatalogo.length === 0 && <li className="px-4 py-6 text-center text-sm text-on-surface-variant">Sin resultados. Prueba otro nombre o agrega un ítem libre.</li>}
                        {opcionesCatalogo.map(o => (
                          <li key={o.clave}>
                            <button type="button" onClick={() => seleccionarOpcion(o.producto, o.pres)}
                              className={cn('flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-container-low', o.agotado && 'opacity-60')}>
                              <span className="material-symbols-outlined text-primary">{o.pres ? (o.tipo === 'variable' ? 'scale' : o.tipo === 'completa' ? 'liquor' : 'water_drop') : o.producto.tipo === 'servicio' ? 'work' : 'inventory_2'}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-bold text-on-surface">{o.producto.nombre}{o.pres && <span className="font-medium text-on-surface-variant"> · {o.pres.nombre}</span>}</span>
                                <span className="block text-xs text-on-surface-variant">{formatCLP(o.precio)}{o.tipo === 'variable' ? `/${o.pres?.unidadVenta ?? 'kg'}` : ''} · {o.disp}</span>
                              </span>
                              <span className="material-symbols-outlined text-outline">add_circle</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {productoSeleccionado && !busquedaCatalogo.trim() && (
                      <div className="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-base font-black text-on-surface">{productoSeleccionado.nombre}</p>
                            {productoSeleccionado.tipo === 'producto' && (
                              <p className="text-xs text-on-surface-variant">Hay {usaEnvases(productoSeleccionado) ? resumenStock(productoSeleccionado, envases).texto : formatCantidad(stockDisponible(productoSeleccionado, envases), productoSeleccionado.unidadBase)}</p>
                            )}
                          </div>
                          <button type="button" onClick={limpiarFicha} className="min-h-11 shrink-0 rounded-full px-3 text-xs font-bold text-primary hover:bg-primary/10">Cambiar</button>
                        </div>

                        {presentacionesProducto.length > 0 && (
                          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 hide-scrollbar sm:flex-wrap" role="radiogroup" aria-label="Subcategoría de venta">
                            {presentacionesProducto.map(pr => {
                              const disp = textoDisponibilidad(productoSeleccionado, envases, pr, politicaEnvaseAbierto);
                              const activa = pr.id === productoActual.presentacionId;
                              return (
                                <button key={pr.id} type="button" role="radio" aria-checked={activa}
                                  onClick={() => seleccionarOpcion(productoSeleccionado, pr)}
                                  className={cn('min-h-14 shrink-0 rounded-2xl border-2 px-4 py-2 text-left transition-colors',
                                    activa ? 'border-primary bg-surface-container-lowest text-primary shadow-sm' : 'border-outline-variant/40 bg-surface-container-lowest text-on-surface',
                                    disp.unidades <= 0 && 'opacity-50')}>
                                  <span className="block text-sm font-black">{pr.nombre}</span>
                                  <span className="block text-[11px] font-bold opacity-80">{formatCLP(pr.precio)}{tipoPresentacion(productoSeleccionado, pr) === 'variable' ? `/${pr.unidadVenta ?? 'kg'}` : ''} · {disp.texto}</span>
                                  {disp.detalle && <span className="block text-[10px] font-medium opacity-70">{disp.detalle}</span>}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {esVariable ? (
                          <div className="space-y-2">
                            <label className="block text-xs font-bold text-on-surface-variant" htmlFor="venta-peso">{unidadesPeso[0] === 'l' ? 'Volumen' : 'Peso'}</label>
                            <div className="flex gap-2">
                              <input id="venta-peso" type="text" inputMode="decimal" autoComplete="off" value={pesoTexto}
                                onChange={e => setPesoTexto(e.target.value.replace(/[^\d.,]/g, ''))}
                                className="min-h-14 min-w-0 flex-1 rounded-2xl border border-outline-variant/50 bg-surface-container-lowest px-4 text-2xl font-black text-on-surface outline-none focus:ring-2 focus:ring-primary/20" />
                              <div className="flex rounded-2xl border border-outline-variant/40 p-1" role="radiogroup" aria-label="Unidad">
                                {unidadesPeso.map(uu => (
                                  <button key={uu} type="button" role="radio" aria-checked={pesoUnidad === uu} onClick={() => setPesoUnidad(uu)}
                                    className={cn('min-h-11 min-w-12 rounded-xl px-3 text-sm font-black', pesoUnidad === uu ? 'bg-primary text-inverse-on-surface' : 'text-on-surface-variant')}>
                                    {uu === 'l' ? 'L' : uu}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {pesosRapidos.map(r => (
                                <button key={`${r.valor}${r.unidad}`} type="button" onClick={() => { setPesoUnidad(r.unidad); setPesoTexto(String(r.valor).replace('.', ',')); }}
                                  className="min-h-11 rounded-full border border-outline-variant/40 bg-surface-container-lowest px-4 text-xs font-bold text-on-surface">
                                  {r.valor.toLocaleString('es-CL')} {r.unidad === 'l' ? 'L' : r.unidad}
                                </button>
                              ))}
                            </div>
                            {cantidadFicha > 0 && presentacionActual && (
                              <p className="text-sm font-bold text-on-surface">{detalleMedidaDe(presentacionActual, cantidadFicha)} = {formatCLP(fichaTotales.total)}</p>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-bold text-on-surface-variant">Cantidad</span>
                            <div className="flex items-center gap-1 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-1">
                              <button type="button" aria-label="Quitar uno" onClick={() => setProductoActual(prev => ({ ...prev, cantidad: Math.max(1, (Number(prev.cantidad) || 1) - 1) }))}
                                className="flex h-12 w-12 items-center justify-center rounded-xl text-primary hover:bg-primary/10"><span className="material-symbols-outlined">remove</span></button>
                              <input type="number" min={1} inputMode="numeric" aria-label="Cantidad" value={productoActual.cantidad || ''}
                                onChange={e => setProductoActual({ ...productoActual, cantidad: Math.max(0, Math.floor(Number(e.target.value))) })}
                                className="h-12 w-16 bg-transparent text-center text-xl font-black text-on-surface outline-none" />
                              <button type="button" aria-label="Agregar uno" onClick={() => setProductoActual(prev => ({ ...prev, cantidad: (Number(prev.cantidad) || 0) + 1 }))}
                                className="flex h-12 w-12 items-center justify-center rounded-xl text-primary hover:bg-primary/10"><span className="material-symbols-outlined">add</span></button>
                            </div>
                          </div>
                        )}

                        {promocionActiva && (
                          <p className="flex items-center gap-2 rounded-xl border border-tertiary/30 bg-tertiary/10 px-3 py-2 text-xs font-bold text-tertiary">
                            <span className="material-symbols-outlined text-base">local_offer</span>
                            Promoción «{promocionActiva.nombre}» ({promocionActiva.tipo === 'porcentaje' ? `-${promocionActiva.valor}%` : `-${formatCLP(promocionActiva.valor)}`})
                          </p>
                        )}

                        {productoSeleccionado.tipo === 'producto' && errorItem ? (
                          <div className="space-y-2 rounded-xl border border-error/40 bg-error/10 px-3 py-3" role="alert">
                            <p className="flex items-start gap-1 text-sm font-bold text-error"><span className="material-symbols-outlined text-base">block</span>{errorItem.mensaje}</p>
                            <div className="flex flex-wrap gap-2">
                              {(errorItem.maximo ?? 0) > 0 && (
                                <button type="button" onClick={venderMaximo} className="min-h-11 rounded-full bg-primary px-4 text-xs font-bold text-inverse-on-surface">
                                  Vender el máximo disponible ({textoMaximo(errorItem.maximo!)})
                                </button>
                              )}
                              <button type="button" onClick={limpiarFicha} className="min-h-11 rounded-full border border-error/40 px-4 text-xs font-bold text-error">Quitar</button>
                            </div>
                          </div>
                        ) : productoSeleccionado.tipo === 'producto' && lineaItemSimulada?.consumosEnvase?.length ? (
                          <p className="rounded-xl bg-surface-container-lowest px-3 py-2 text-xs font-bold text-primary" role="status">
                            {aperturaItem ? `Abrirá ${aperturaItem} · ` : ''}Descuenta {describirConsumos(productoSeleccionado, simConItem!.envases, lineaItemSimulada.consumosEnvase)}
                          </p>
                        ) : null}

                        <div className="flex items-center gap-3">
                          <div className="min-w-0 flex-1 text-xs text-on-surface-variant">
                            <p>Neto {formatCLP(fichaTotales.subtotal)} · IVA {formatCLP(fichaTotales.iva)}</p>
                            <p className="text-base font-black text-on-surface">{formatCLP(fichaTotales.total)}</p>
                          </div>
                          <button type="button" onClick={handleAgregarProducto} disabled={!fichaValida}
                            className="flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-inverse-on-surface shadow-lg shadow-primary/20 disabled:opacity-50">
                            <span className="material-symbols-outlined text-lg">add_shopping_cart</span> Agregar
                          </button>
                        </div>
                      </div>
                    )}

                    <button type="button" onClick={() => { limpiarFicha(); setProductoActual(prev => ({ ...prev, esInventario: false })); }}
                      className="inline-flex min-h-11 items-center gap-1 text-xs font-bold text-on-surface-variant hover:text-primary">
                      <span className="material-symbols-outlined text-base">edit_note</span> Agregar un ítem libre (servicio o artículo sin inventario)
                    </button>
                  </>
                ) : (
                  <div className="space-y-3 rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-black text-on-surface">Ítem libre (no toca el inventario)</p>
                      <button type="button" onClick={() => setProductoActual(prev => ({ ...prev, esInventario: true, nombre: '', precio: 0 }))} className="min-h-11 rounded-full px-3 text-xs font-bold text-primary">Volver al catálogo</button>
                    </div>
                    <input type="text" value={productoActual.nombre} onChange={e => setProductoActual({ ...productoActual, nombre: e.target.value })} aria-label="Nombre del ítem"
                      placeholder="Ej: flete, hora de taller, reparación…" className="min-h-11 w-full rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3 text-base text-on-surface outline-none focus:ring-2 focus:ring-primary/20 sm:text-sm" />
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" min={1} inputMode="numeric" value={productoActual.cantidad || ''} aria-label="Cantidad" onChange={e => setProductoActual({ ...productoActual, cantidad: Number(e.target.value) })}
                        className="min-h-11 w-full rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3 text-base text-on-surface outline-none sm:text-sm" />
                      <CampoMoneda valor={productoActual.precio || ''} onChange={valor => setProductoActual({ ...productoActual, precio: valor })}
                        className="min-h-11 rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3 text-base text-on-surface outline-none sm:text-sm" placeholder="Precio" />
                    </div>
                    <input type="text" value={productoActual.categoria} onChange={e => setProductoActual({ ...productoActual, categoria: e.target.value })} aria-label="Categoría"
                      placeholder="Categoría (opcional)" className="min-h-11 w-full rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3 text-base text-on-surface outline-none sm:text-sm" />
                    <button type="button" onClick={handleAgregarProducto} disabled={!fichaValida}
                      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-inverse-on-surface disabled:opacity-50">
                      <span className="material-symbols-outlined text-lg">add_shopping_cart</span> Agregar · {formatCLP(fichaTotales.total)}
                    </button>
                  </div>
                )}
              </section>

              {/* ── Carrito y cobro ── */}
              <section className={cn('space-y-4 border-outline-variant/20 bg-surface-container-low/40 p-4 sm:p-6 md:overflow-y-auto md:border-l', pasoMovil === 'catalogo' && 'hidden md:block')} aria-label="Carrito">
                <div>
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-black text-on-surface">
                    <span className="material-symbols-outlined text-primary">shopping_cart</span> Carrito
                    {carrito.length > 0 && <span className="rounded-full bg-primary/10 px-2 text-xs text-primary">{carrito.length}</span>}
                  </h4>
                  {carrito.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-outline-variant/40 px-4 py-6 text-center text-sm text-on-surface-variant">Agrega productos desde el catálogo.</p>
                  ) : (
                    <ul className="divide-y divide-outline-variant/20 overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest">
                      {carrito.map((prod, idx) => {
                        const l = simCarrito?.lineas[idx];
                        const pr = inventario.find(x => x.id === prod.productoId);
                        const errorLinea = simCarrito?.error?.linea === idx ? simCarrito.error : undefined;
                        return (
                          <li key={idx} className="px-3 py-2">
                            <div className="flex items-start gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-on-surface">{prod.productoNombre}</p>
                                <p className="text-xs text-on-surface-variant">{prod.detalleMedida ?? `${prod.cantidad.toLocaleString('es-CL')} × ${formatCLP(prod.precioBase)}`}</p>
                                {prod.esInventariable === false && <p className="text-[10px] text-on-surface-variant/70">Ítem libre</p>}
                                {prod.descuentoTipo && prod.descuentoTipo !== 'ninguno' && (
                                  <p className="text-[10px] font-bold text-tertiary">Promoción {prod.descuentoTipo === 'porcentaje' ? `-${prod.descuentoValor}%` : `-${formatCLP(prod.descuentoValor ?? 0)}`}</p>
                                )}
                                {!errorLinea && l?.consumosEnvase?.length && pr ? <p className="text-[11px] font-bold text-primary">Descuenta {describirConsumos(pr, simCarrito!.envases, l.consumosEnvase)}</p> : null}
                              </div>
                              <span className="shrink-0 text-sm font-black text-on-surface">{formatCLP(prod.total)}</span>
                              <button type="button" onClick={() => handleRemoveProducto(idx)} aria-label={`Quitar ${prod.productoNombre}`}
                                className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-on-surface-variant hover:text-error"><span className="material-symbols-outlined text-lg">close</span></button>
                            </div>
                            {errorLinea && (
                              <div className="mt-1 space-y-1 rounded-lg bg-error/10 px-2 py-2" role="alert">
                                <p className="text-[11px] font-bold text-error">{errorLinea.mensaje}</p>
                                <div className="flex flex-wrap gap-2">
                                  {(errorLinea.maximo ?? 0) > 0 && (
                                    <button type="button" onClick={() => ajustarLineaAlMaximo(idx, errorLinea.maximo!)} className="min-h-9 rounded-full bg-primary px-3 text-[11px] font-bold text-inverse-on-surface">
                                      Vender el máximo ({textoMaximo(errorLinea.maximo!, prod)})
                                    </button>
                                  )}
                                  <button type="button" onClick={() => handleRemoveProducto(idx)} className="min-h-9 rounded-full border border-error/40 px-3 text-[11px] font-bold text-error">Quitar línea</button>
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
                  <div className="sm:col-span-2 md:col-span-1 xl:col-span-2">
                    <label className="mb-1 block text-xs font-bold text-on-surface-variant">Cliente</label>
                    <BuscadorCliente clientes={clientes} clienteId={nuevaVenta.cliente_id} clienteNombre={nuevaVenta.cliente}
                      onChange={(cliente, nombre) => setNuevaVenta(prev => ({ ...prev, cliente_id: cliente?.id, cliente: nombre }))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-on-surface-variant">Fecha</label>
                    <SelectorFecha value={nuevaVenta.fecha || ''} onChange={fecha => setNuevaVenta({ ...nuevaVenta, fecha })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-on-surface-variant">Método de pago</label>
                    <SelectorDesplegable className="w-full" valor={nuevaVenta.metodo_pago}
                      onChange={valor => setNuevaVenta({ ...nuevaVenta, metodo_pago: valor as Venta['metodo_pago'] })}
                      opciones={[
                        { valor: 'efectivo', etiqueta: 'Efectivo' }, { valor: 'transferencia', etiqueta: 'Transferencia' }, { valor: 'debito', etiqueta: 'Débito' },
                        { valor: 'credito', etiqueta: 'Crédito' }, { valor: 'mixto', etiqueta: 'Mixto' }, { valor: 'cheque', etiqueta: 'Cheque' },
                      ]} />
                  </div>
                </div>

                <div className="space-y-2 rounded-2xl border border-primary/15 bg-primary/5 p-3">
                  <div className="flex gap-2" role="radiogroup" aria-label="Tipo de documento">
                    {(['Boleta', 'Factura'] as const).map(op => {
                      const activo = tipoBoletaOFactura(nuevaVenta.tipo_documento) === op;
                      return (
                        <button key={op} type="button" role="radio" aria-checked={activo}
                          onClick={() => setNuevaVenta({ ...nuevaVenta, tipo_documento: op === 'Boleta' ? 'boleta_electronica' : 'factura_electronica' })}
                          className={cn('flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border text-sm font-black transition-all',
                            activo ? 'border-primary bg-primary text-inverse-on-surface' : 'border-outline-variant/40 bg-surface-container-lowest text-on-surface-variant')}>
                          <span className="material-symbols-outlined text-lg">{op === 'Boleta' ? 'receipt' : 'request_quote'}</span>{op}
                        </button>
                      );
                    })}
                  </div>
                  <details>
                    <summary className="flex min-h-9 cursor-pointer items-center text-[11px] font-bold text-on-surface-variant">Variante del documento</summary>
                    <SelectorDesplegable className="mt-1 w-full" valor={tipoDocumentoNormalizado}
                      onChange={valor => setNuevaVenta({ ...nuevaVenta, tipo_documento: valor as Venta['tipo_documento'] })}
                      opciones={Object.entries(DOCUMENT_LABELS).filter(([value]) => value !== 'nota_credito').map(([value, label]) => ({ valor: value, etiqueta: label }))} />
                  </details>
                </div>

                {carrito.length > 0 && (
                  <>
                    <div className="space-y-3 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-3">
                      <div className="flex gap-2" role="radiogroup" aria-label="Estado de la venta">
                        {(['Pagado', 'Pendiente'] as const).map(op => {
                          const activo = (nuevaVenta.estado || 'Pagado') === op;
                          return (
                            <button key={op} type="button" role="radio" aria-checked={activo}
                              onClick={() => { setMontoPagado(op === 'Pagado' ? String(Math.round(totalesVenta.total)) : ''); setNuevaVenta(prev => ({ ...prev, estado: op })); }}
                              className={cn('flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl border text-sm font-black',
                                activo ? (op === 'Pagado' ? 'border-success bg-success text-on-success' : 'border-secondary bg-secondary text-on-surface') : 'border-outline-variant/40 text-on-surface-variant')}>
                              <span className="material-symbols-outlined text-lg">{op === 'Pagado' ? 'check_circle' : 'schedule'}</span>{op}
                            </button>
                          );
                        })}
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-on-surface-variant">Pago recibido</label>
                        <CampoMoneda valor={montoPagado} onChange={valor => {
                          setMontoPagado(String(valor));
                          const saldo = Math.max(0, totalesVenta.total - valor);
                          setNuevaVenta(prev => ({ ...prev, estado: saldo > 0 ? 'Pendiente' : 'Pagado' }));
                        }} className="min-h-11 rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3 text-base text-on-surface outline-none sm:text-sm" />
                      </div>
                      {impactoVenta.saldoPendiente > 0 && (
                        <div>
                          <label className="mb-1 block text-xs font-bold text-on-surface-variant">Fecha compromiso de pago</label>
                          <SelectorFecha value={nuevaVenta.fecha_vencimiento || ''} onChange={fecha => setNuevaVenta({ ...nuevaVenta, fecha_vencimiento: fecha })} />
                        </div>
                      )}
                      <button type="button" onClick={() => setAplicarPropina(!aplicarPropina)} aria-pressed={aplicarPropina}
                        className={cn('flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border px-3 text-xs font-bold', aplicarPropina ? 'border-tertiary/40 bg-tertiary/10 text-tertiary' : 'border-outline-variant/40 text-on-surface-variant')}>
                        <span className="flex items-center gap-1"><span className="material-symbols-outlined">{aplicarPropina ? 'toggle_on' : 'toggle_off'}</span> Propina 10 % (opcional)</span>
                        <span>{formatCLP(propinaCalculada)}</span>
                      </button>
                    </div>

                    <div className="space-y-1 rounded-2xl bg-inverse-surface p-4 text-sm text-inverse-on-surface">
                      <div className="flex justify-between"><span className="text-inverse-on-surface/60">Neto documento</span><span className="font-bold">{formatCLP(impactoVenta.neto)}</span></div>
                      <div className="flex justify-between"><span className="text-inverse-on-surface/60">IVA débito</span><span className="font-bold">{formatCLP(impactoVenta.ivaDebito)}</span></div>
                      {impactoVenta.exento > 0 && <div className="flex justify-between"><span className="text-inverse-on-surface/60">Exento</span><span className="font-bold">{formatCLP(impactoVenta.exento)}</span></div>}
                      {impactoVenta.saldoPendiente > 0 && <div className="flex justify-between"><span className="text-inverse-on-surface/60">Saldo pendiente</span><span className="font-bold">{formatCLP(impactoVenta.saldoPendiente)}</span></div>}
                      <div className="flex justify-between border-t border-inverse-on-surface/20 pt-2 text-lg"><span className="font-bold">Total</span><span className="font-extrabold">{formatCLP(totalesVenta.total)}</span></div>
                    </div>
                    <p className="text-[11px] leading-5 text-on-surface-variant">
                      Al confirmar se crea la venta, el documento, el IVA del periodo, el movimiento de caja, la cuenta por cobrar si queda saldo y la salida de stock (si hace falta abre {usaEnvasesEnCarrito ? 'la siguiente botella o saco' : 'lo necesario'} y te avisa).
                    </p>
                  </>
                )}
              </section>
            </div>

            {/* Pie fijo: en el celular es la barra del carrito con «Cobrar» / «Confirmar venta». */}
            <footer className="shrink-0 border-t border-outline-variant/20 bg-surface-container-lowest px-4 pt-3 sm:px-6"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}>
              {(avisoStock || simCarrito?.error) && (
                <p className="mb-2 rounded-xl bg-error/10 px-3 py-2 text-xs font-bold text-error" role="alert">{avisoStock || mensajeVenta(simCarrito!.error!)}</p>
              )}
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-on-surface-variant">{carrito.length} ítem{carrito.length === 1 ? '' : 's'}</p>
                  <p className="text-xl font-black text-on-surface">{formatCLP(totalesVenta.total)}</p>
                </div>
                <button onClick={cerrarModal} className="hidden min-h-11 rounded-full px-5 text-sm font-bold text-on-surface-variant hover:bg-surface-container-high md:block">Cancelar</button>
                {pasoMovil === 'catalogo' && (
                  <button type="button" onClick={() => setPasoMovil('cobro')} disabled={carrito.length === 0}
                    className="flex min-h-12 items-center gap-2 rounded-2xl bg-primary px-6 text-sm font-bold text-inverse-on-surface shadow-lg shadow-primary/20 disabled:opacity-50 md:hidden">
                    <span className="material-symbols-outlined text-lg">payments</span> Cobrar
                  </button>
                )}
                <button onClick={handleGuardar} disabled={guardando || carrito.length === 0 || !!simCarrito?.error}
                  className={cn('min-h-12 items-center gap-2 rounded-2xl bg-primary px-6 text-sm font-bold text-inverse-on-surface shadow-lg shadow-primary/20 disabled:opacity-50',
                    pasoMovil === 'cobro' ? 'flex' : 'hidden md:flex')}>
                  <span className="material-symbols-outlined text-lg">check</span> {editingId ? 'Guardar cambios' : 'Confirmar venta'}
                </button>
              </div>
            </footer>
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
                    onClick={handleVerPdf}
                    disabled={generandoPdf}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-on-primary transition-colors hover:bg-primary-dark disabled:opacity-60 disabled:cursor-wait"
                    title="Abrir PDF en una pestaña nueva"
                  >
                    <span className="material-symbols-outlined text-base">
                      {generandoPdf ? 'hourglass_top' : 'picture_as_pdf'}
                    </span>
                    {generandoPdf ? 'Generando PDF...' : 'Ver / Descargar PDF'}
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
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${ventaNota.estado === 'Pagado' ? 'bg-success-container text-on-success-container' : 'bg-warning-container text-on-warning-container'}`}>
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
                          <td className="px-3 py-2 text-right text-on-surface-variant">{vp.detalleMedida ? vp.detalleMedida.split(' × ')[0] : vp.cantidad}</td>
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
