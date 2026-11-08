import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import {
  createDocumentFromPurchase,
  createDocumentFromSale,
  createIntegrationEvent,
  createCreditNote,
  DocumentStatus,
  DocumentType,
  DocumentoTributario,
  F29Preparador,
  IntegracionEvento,
  IntegrationMode,
  PagoPOS,
  prepareF29,
  previewSaleImpact,
  SaleImpactPreview,
  ConfiguracionCumplimiento,
  normalizeDocumentType,
  calculateSaleDocumentAmounts,
  periodoTributarioFromDate,
} from '../services/documentCompliance';
import { calcularSaldos, type Saldos } from '../services/saldos';
import { redondearCLP, hoyISO } from '../../lib/fechas';
import { consumirLotes, consumirEnvases, crearEnvases, costoPromedio, presentacionesActivas } from '../services/costeo';

export type {
  DocumentStatus,
  DocumentType,
  DocumentoTributario,
  F29Preparador,
  IntegracionEvento,
  IntegrationMode,
  PagoPOS,
  SaleImpactPreview,
} from '../services/documentCompliance';

export type EstadoPago = 'Pagado' | 'Pendiente' | 'Por Pagar';
export type MetodoPago = 'efectivo' | 'transferencia' | 'debito' | 'credito' | 'mixto' | 'cheque';
export type TipoDocumento = DocumentType | 'boleta' | 'factura' | 'nota_venta';

export interface VentaProducto {
  productoId: string;
  productoNombre: string;
  /** true = producto/servicio del negocio o ítem libre NO inventariable (no toca stock). Falso: id inexistente = venta con texto libre. */
  esInventariable?: boolean;
  cantidad: number;
  precioBase: number;
  costoUnitario: number;
  descuentoTipo?: 'porcentaje' | 'monto' | 'ninguno';
  descuentoValor?: number;
  /** Categoria del item al momento de la venta; si no se informo queda 'Sin categoria'. */
  categoria?: string;
  /** Presentación vendida (decant, saco…) y lo que realmente descontó en unidad base. */
  presentacionId?: string;
  presentacionNombre?: string;
  cantidadBase?: number;
  /** Costo de venta congelado al vender según el método de costeo (no se recalcula después). */
  costoVenta?: number;
  subtotal: number;
  iva: number;
  total: number;
}

export interface Venta {
  id: string;
  fecha: string;
  cliente: string;
  cliente_id?: string;
  productos: VentaProducto[];
  subtotal: number;
  iva: number;
  monto: number;
  monto_neto?: number;

  /** Propina registrada como campo separado: no infla IVA ni documento tributario,
   *  se suma al total a cobrar (Caja) y queda trazada como propina. */
  propina?: number;
  /** Quien creo la venta (multi-cuenta PYME: el vendedor registra, el admin/dueño ve todo). */
  creado_por_id?: string;
  creado_por?: string;
  /** Negocio (PYME) al que pertenece la venta. */
  negocio_id?: string;
  estado: EstadoPago;
  tipo_documento?: TipoDocumento;
  documento_id?: string;
  periodo_tributario?: string;
  modo_integracion?: IntegrationMode;
  estado_documento?: DocumentStatus;
  metodo_pago?: MetodoPago;
  monto_efectivo?: number;
  monto_digital?: number;
  /** Saldo base antes de abonos (no se descuenta en addAbono). */
  saldo_base?: number;
  saldo_pendiente?: number;
  fecha_vencimiento?: string;
  nota?: string;
}

export interface Gasto {
  id: string;
  fecha: string;
  proveedor: string;
  proveedor_id?: string;
  categoria: string;
  subtotal: number;
  iva: number;
  monto: number;
  esFactura: boolean;
  documento_id?: string;
  periodo_tributario?: string;
  tipo_documento_compra?: TipoDocumento;
  estado: EstadoPago;
  metodo_pago?: MetodoPago;
  /** Saldo base antes de abonos (no se descuenta en addAbono). */
  saldo_base?: number;
  saldo_pendiente?: number;
  fecha_vencimiento?: string;
  recurrente?: boolean;
  dia_recurrente?: number;
  notas?: string;
  adjunto_url?: string;
}

export interface Abono {
  id: string;
  referencia_id: string;
  documento_id?: string;
  pago_pos_id?: string;
  origen?: 'manual' | 'pos' | 'banco' | 'ajuste';
  tipo: 'cobro' | 'pago';
  monto: number;
  monto_abono: number;
  metodo_pago: MetodoPago;
  fecha: string;
  nota?: string;
  cliente_proveedor?: string;
}

export interface Cliente {
  id: string;
  nombre: string;
  rut?: string;
  telefono: string;
  email: string;
  ventas: number;
  deuda: number;
  limite_credito?: number;
  direccion?: string;
  comuna?: string;
  notas?: string;
}

export interface Proveedor {
  id: string;
  nombre: string;
  categoria: string;
  telefono: string;
  email?: string;
  deuda: number;
  rut?: string;
  condicion_pago?: string;
}

export interface Movimiento {
  id: string;
  fecha: string;
  tipo: 'Ingreso' | 'Egreso';
  concepto: string;
  monto: number;
  saldo: number;
  metodo_pago?: MetodoPago;
  referencia_id?: string;
}

export interface Producto {
  id: string
  nombre: string
  codigo: string
  codigoBarras?: string
  categoria: string
  tipo: 'producto' | 'servicio'
  modalidadServicio?: 'por_hora' | 'por_pedido'
  tarifaHora?: number
  costoHora?: number
  precioFijo?: number
  costoFijo?: number
  tiempoMinimoHoras?: number
  tipoOperativo?: 'producto_simple' | 'servicio' | 'pack' | 'insumo' | 'producto_compuesto'
  descripcion?: string
  costo: number
  precio: number
  incluyeIva?: boolean
  stock: number
  stockReservado?: number
  stockMinimo?: number
  bodegaPrincipalId?: string
  unidadMedida: string
  estado: 'activo' | 'inactivo'
  proveedorId?: string
  esInventariable?: boolean
  // ── Fraccionamiento (doc. «Inventario: fraccionamiento y método de costeo») ──
  /** Unidad más chica en que se mide el stock. stock y stockMinimo van SIEMPRE en esta unidad. */
  unidadBase?: UnidadBase
  /** Formas de venderlo (decant 5 ml, saco 25 kg…). Sin presentaciones = se vende por unidad base. */
  presentaciones?: Presentacion[]
  /** Unidades de compra (1 frasco = 100 ml): solo informativas para registrar ingresos. */
  unidadesCompra?: { id: string; nombre: string; factor: number }[]
  /** Control por envases (frascos/sacos con saldo propio). Recomendado para no perecibles. */
  controlEnvases?: boolean
  /** Capacidad de cada envase en unidad base (ej. 100 ml por frasco). */
  capacidadEnvase?: number
}

export type UnidadBase = 'unidad' | 'ml' | 'l' | 'g' | 'kg';
export type MetodoCosteo = 'fifo' | 'promedio';

export interface Presentacion {
  id: string;
  nombre: string;
  /** Unidades base que descuenta cada venta de esta presentación. */
  factor: number;
  /** Precio con IVA. */
  precio: number;
  sku?: string;
  /** De dónde sale: granel, un envase cerrado completo o el envase abierto. */
  origen?: 'granel' | 'envase_cerrado' | 'envase_abierto';
  activa: boolean;
  /** Insumos que también se descuentan (ej. 1 atomizador por decant). */
  receta?: { productoId: string; cantidad: number }[];
}

/** Cada compra crea un lote con su costo (tabla destino: erp.lote). */
export interface Lote {
  id: string;
  productoId: string;
  fecha: string;
  cantidadInicial: number;
  cantidadRestante: number;
  /** Costo por unidad base. */
  costoUnitario: number;
  compraId?: string;
  vencimiento?: string;
}

/** Envase con saldo propio (tabla destino: erp.envase). */
export interface Envase {
  id: string;
  productoId: string;
  loteId?: string;
  codigo: string;
  capacidad: number;
  restante: number;
  estado: 'cerrado' | 'abierto' | 'agotado' | 'vendido';
  abiertoEn?: string;
}

export interface MovimientoInventario {
  id: string;
  productoId: string;
  tipo: 'ingreso' | 'salida' | 'ajuste' | 'merma' | 'devolucion';
  cantidad: number;
  costoUnitario?: number;
  fecha: string;
  motivo: string;
  origenTipo?: 'venta' | 'compra' | 'devolucion' | 'ajuste' | 'produccion' | 'traslado';
  origenId?: string;
  documentoId?: string;
  bodegaId?: string;
  lote?: string;
}

export interface Promocion {
  id: string;
  nombre: string;
  tipo: 'porcentaje' | 'monto';
  valor: number;
  fechaInicio: string;
  /** Sin fecha = promoción sin fecha de fin definida (vigente hasta desactivarla). */
  fechaFin?: string;
  productoId?: string;
  estado: 'activa' | 'inactiva';
}

// ════════════════════════════════════════════════════
// ESTADO INICIAL — vacío para cuentas nuevas
// ════════════════════════════════════════════════════

function safeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 100000)}`;
}

/** Nombre comparable: sin tildes, minúsculas y espacios simples. */
export const normalizarNombre = (s?: string) =>
  (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const normalizarRut = (s?: string) => (s ?? '').replace(/[^0-9kK]/g, '').toUpperCase();

function buscarCliente(lista: Cliente[], id?: string, nombre?: string): Cliente | undefined {
  if (id) {
    const porId = lista.find(c => c.id === id);
    if (porId) return porId;
  }
  const nom = normalizarNombre(nombre);
  return nom ? lista.find(c => normalizarNombre(c.nombre) === nom) : undefined;
}

/** Sueldos, honorarios y planilla van a gasto de personal / RR.HH., no a proveedores. */
const esCategoriaPersonal = (categoria?: string) => /sueldo|remuneraci|honorario|planilla/i.test(categoria ?? '');

const DEMO_CONFIG: ConfiguracionCumplimiento = {
  modoIntegracion: 'sandbox',
  ambiente: 'sandbox',
  ppmTasa: 1,
  usaFoliosManual: true,
};

// ══════════════════════════════════════════════════════
// CONTEXT
// ══════════════════════════════════════════════════════

interface ERPContextType {
  ventas: Venta[];
  gastos: Gasto[];
  clientes: Cliente[];
  proveedores: Proveedor[];
  movimientos: Movimiento[];
  inventario: Producto[];
  movimientosInventario: MovimientoInventario[];
  promociones: Promocion[];
  abonos: Abono[];
  documentosTributarios: DocumentoTributario[];
  integracionEventos: IntegracionEvento[];
  pagosPOS: PagoPOS[];
  configuracionCumplimiento: ConfiguracionCumplimiento;
  saldoActual: number;
  /** Lotes de compra (costeo FIFO / promedio) y envases con saldo propio. */
  lotes: Lote[];
  envases: Envase[];
  metodoCosteo: MetodoCosteo;
  setMetodoCosteo: (metodo: MetodoCosteo) => void;
  /** Saldos por cobrar/pagar calculados en un solo lugar (corrección #4). */
  saldos: Saldos;
  /** Une clientes repetidos por RUT o nombre (corrección #12). Devuelve cuántos se fusionaron. */
  fusionarClientesDuplicados: () => number;
  addVenta: (venta: Omit<Venta, 'id'>) => void;
  updateVenta: (id: string, venta: Partial<Venta>) => void;
  deleteVenta: (id: string) => void;
  addGasto: (gasto: Omit<Gasto, 'id'>) => void;
  updateGasto: (id: string, gasto: Partial<Gasto>) => void;
  deleteGasto: (id: string) => void;
  addCliente: (cliente: Omit<Cliente, 'id' | 'ventas' | 'deuda'>) => void;
  updateCliente: (id: string, cliente: Partial<Cliente>) => void;
  deleteCliente: (id: string) => void;
  addProveedor: (proveedor: Omit<Proveedor, 'id' | 'deuda'>) => void;
  updateProveedor: (id: string, proveedor: Partial<Proveedor>) => void;
  deleteProveedor: (id: string) => void;
  addProducto: (producto: Omit<Producto, 'id'>) => void;
  editProducto: (id: string, producto: Partial<Producto>) => void;
  deleteProducto: (id: string) => void;
  addMovimientoInventario: (movimiento: Omit<MovimientoInventario, 'id'>) => void;
  addPromocion: (promocion: Omit<Promocion, 'id'>) => void;
  editPromocion: (id: string, promocion: Partial<Promocion>) => void;
  deletePromocion: (id: string) => void;
  addAbono: (abono: Omit<Abono, 'id'>) => void;
  createNotaCredito: (documentoId: string, motivo: string, monto: number, devuelveStock?: boolean) => void;
  reconcilePagoPOS: (pagoId: string, ventaId: string) => void;
  previewVentaImpacto: (venta: Omit<Venta, 'id'>, montoPagado?: number) => SaleImpactPreview;
  getDocumentosByPeriodo: (periodo: string) => DocumentoTributario[];
  getF29Preparador: (periodo: string, ppmTasa?: number) => F29Preparador;
  getAbonosByReferencia: (referenciaId: string) => Abono[];
  getSaldoPendienteVenta: (ventaId: string) => number;
  getSaldoPendienteGasto: (gastoId: string) => number;
  updatePpmTasa: (nuevoValor: number) => Promise<void>;
}

const ERPContext = createContext<ERPContextType | undefined>(undefined);

export function ERPProvider({ children }: { children: ReactNode }) {
  const { user, perfil } = useAuth();

  const [ventas, setVentas] = useState<Venta[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [abonos, setAbonos] = useState<Abono[]>([]);
  const [inventario, setInventario] = useState<Producto[]>([]);
  const [movimientosInventario, setMovimientosInventario] = useState<MovimientoInventario[]>([]);
  const [promociones, setPromociones] = useState<Promocion[]>([]);
  const [documentosTributarios, setDocumentosTributarios] = useState<DocumentoTributario[]>([]);
  const [integracionEventos, setIntegracionEventos] = useState<IntegracionEvento[]>([]);
  const [pagosPOS, setPagosPOS] = useState<PagoPOS[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [envases, setEnvases] = useState<Envase[]>([]);
  const [configuracionCumplimiento, setConfiguracionCumplimiento] = useState<ConfiguracionCumplimiento>(DEMO_CONFIG);

  const [hydrated, setHydrated] = useState(false);
  /** Última versión guardada de cada objeto, por colección (null = aún no hay línea base). */
  const guardadoRef = useRef<Record<string, Map<string, object>> | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saldoActual = movimientos.reduce((acc, m) => m.tipo === 'Ingreso' ? acc + m.monto : acc - m.monto, 0);

  // ══ Carga desde Railway Postgres ══════════════════
  useEffect(() => {
    let active = true;
    setHydrated(false);
    guardadoRef.current = null;

    if (!user) return () => { active = false; };

    (async () => {
      try {
        const { data } = await api.getErp();

        if (!active) return;

        const grouped = (data ?? []).reduce<Record<string, unknown[]>>((acc, r) => {
          (acc[r.coleccion] ??= []).push(r.data);
          return acc;
        }, {});

        // ══ Cura de saldos (una sola vez) ═══════════════════
        // Datos creados antes del fix ya tenían `saldo_pendiente` descontado en
        // cada abono. Se recupera la base como `saldo_pendiente + Σ abonos`
        // (tope: el monto) y se marca con `saldo_base` para no re-inflar al recargar.
        const abonosCrudos = (grouped.abonos ?? []) as Abono[];
        const curarVentas = (raw: Venta[]): Venta[] => raw.map(v => {
          if (v.saldo_base !== undefined) return v;
          const cobrado = abonosCrudos
            .filter(a => a.referencia_id === v.id && a.tipo === 'cobro')
            .reduce((acc, a) => acc + a.monto_abono, 0);
          const base = Math.max(0, Math.min(v.monto ?? 0, (v.saldo_pendiente ?? 0) + cobrado));
          const restante = Math.max(0, base - cobrado);
          return {
            ...v,
            saldo_base: base,
            saldo_pendiente: base,
            estado: restante <= 0 ? 'Pagado' : v.estado === 'Pagado' ? 'Pendiente' : v.estado,
          };
        });
        const curarGastos = (raw: Gasto[]): Gasto[] => raw.map(g => {
          if (g.saldo_base !== undefined) return g;
          const pagado = abonosCrudos
            .filter(a => a.referencia_id === g.id && a.tipo === 'pago')
            .reduce((acc, a) => acc + a.monto_abono, 0);
          const base = Math.max(0, Math.min(g.monto ?? 0, (g.saldo_pendiente ?? 0) + pagado));
          const restante = Math.max(0, base - pagado);
          return {
            ...g,
            saldo_base: base,
            saldo_pendiente: base,
            estado: restante <= 0 ? 'Pagado' : g.estado === 'Pagado' ? 'Por Pagar' : g.estado,
          };
        });

        setVentas(curarVentas((grouped.ventas ?? []) as Venta[]));
        setGastos(curarGastos((grouped.gastos ?? []) as Gasto[]));
        setClientes((grouped.clientes ?? []) as Cliente[]);
        setProveedores((grouped.proveedores ?? []) as Proveedor[]);
        setMovimientos((grouped.movimientos ?? []) as Movimiento[]);
        setAbonos((grouped.abonos ?? []) as Abono[]);
        setInventario((grouped.inventario ?? []) as Producto[]);
        setMovimientosInventario((grouped.movimientosInventario ?? []) as MovimientoInventario[]);
        setPromociones((grouped.promociones ?? []) as Promocion[]);
        setDocumentosTributarios((grouped.documentosTributarios ?? []) as DocumentoTributario[]);
        setIntegracionEventos((grouped.integracionEventos ?? []) as IntegracionEvento[]);
        setPagosPOS((grouped.pagosPOS ?? []) as PagoPOS[]);
        setLotes((grouped.lotes ?? []) as Lote[]);
        setEnvases((grouped.envases ?? []) as Envase[]);
        const cfg = grouped.config?.[0] as ConfiguracionCumplimiento | undefined;
        if (cfg) setConfiguracionCumplimiento({ ...DEMO_CONFIG, ...cfg });
      } catch (err) {
        console.error('No se pudo cargar el ERP desde Railway (¿existe la tabla erp_datos?):', err);
      } finally {
        if (active) setHydrated(true);
      }
    })();

    return () => { active = false; };
  }, [user?.id]);

  // ══ Guardado incremental (corrección #1) ════════
  // Antes se reenviaba TODA la base en cada render (incluso al solo abrir una página).
  // Ahora se compara cada objeto con la última versión guardada (por referencia: el
  // estado es inmutable) y solo viajan los que cambiaron o se borraron.
  const configFila = useMemo(() => ({ id: 'config', ...configuracionCumplimiento }), [configuracionCumplimiento]);

  useEffect(() => {
    if (!hydrated || !user) return;

    const snapshot: Record<string, { id: string }[]> = {
      ventas, gastos, clientes, proveedores, movimientos, inventario,
      movimientosInventario, promociones, abonos, documentosTributarios,
      integracionEventos, pagosPOS, lotes, envases, config: [configFila],
    };

    // Primera pasada tras cargar: se toma como línea base y NO se guarda nada.
    if (!guardadoRef.current) {
      guardadoRef.current = Object.fromEntries(
        Object.entries(snapshot).map(([col, items]) => [col, new Map(items.map(i => [i.id, i as object]))])
      );
      return;
    }

    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(async () => {
      const base = guardadoRef.current!;
      try {
        for (const [coleccion, items] of Object.entries(snapshot)) {
          const previo = base[coleccion] ?? new Map<string, object>();
          const cambiados = items.filter(it => previo.get(it.id) !== it);
          const vivos = new Set(items.map(i => i.id));
          const borrados = [...previo.keys()].filter(id => !vivos.has(id));
          if (cambiados.length === 0 && borrados.length === 0) continue;

          // Lotes de 500 para no mandar cuerpos gigantes en cargas masivas.
          for (let i = 0; i < cambiados.length; i += 500) {
            await api.upsertErp(cambiados.slice(i, i + 500).map(it => ({ coleccion, id: it.id, data: it })));
          }
          if (borrados.length > 0) await api.deleteErp(coleccion, borrados);
          base[coleccion] = new Map(items.map(i => [i.id, i as object]));
        }
      } catch (err) {
        console.error('No se pudo guardar el ERP:', err);
      }
    }, 600);

    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [hydrated, user,
    ventas, gastos, clientes, proveedores, movimientos, inventario,
    movimientosInventario, promociones, abonos, documentosTributarios,
    integracionEventos, pagosPOS, lotes, envases, configFila]);

  // ══ Saldos: fuente única (corrección #4) ═══════════
  const saldos = useMemo(() => {
    const folios = new Map<string, string | number>();
    documentosTributarios.forEach(d => { if (d.folioInterno) folios.set(d.id, d.folioInterno); });
    return calcularSaldos(ventas, gastos, abonos, folios);
  }, [ventas, gastos, abonos, documentosTributarios]);

  // Referencias vivas para resolver cliente/proveedor dentro de bucles (cargas masivas).
  const clientesRef = useRef<Cliente[]>(clientes);
  const proveedoresRef = useRef<Proveedor[]>(proveedores);
  useEffect(() => { clientesRef.current = clientes; }, [clientes]);
  useEffect(() => { proveedoresRef.current = proveedores; }, [proveedores]);
  const lotesRef = useRef<Lote[]>(lotes);
  const envasesRef = useRef<Envase[]>(envases);
  useEffect(() => { lotesRef.current = lotes; }, [lotes]);
  useEffect(() => { envasesRef.current = envases; }, [envases]);

  const metodoCosteo: MetodoCosteo = configuracionCumplimiento.metodoCosteo ?? 'promedio';
  const setMetodoCosteo = (metodo: MetodoCosteo) => setConfiguracionCumplimiento(prev => ({ ...prev, metodoCosteo: metodo }));

  /** Ingreso a inventario: crea el lote (y los envases si el producto los controla). */
  const registrarLote = (producto: Producto, cantidadBase: number, costoUnitario: number, fecha = hoyISO(), compraId?: string) => {
    if (!(cantidadBase > 0)) return;
    const lote: Lote = { id: safeId('LOT'), productoId: producto.id, fecha, cantidadInicial: cantidadBase, cantidadRestante: cantidadBase, costoUnitario, compraId };
    lotesRef.current = [...lotesRef.current, lote];
    setLotes(lotesRef.current);
    const nuevos = crearEnvases(producto, envasesRef.current, cantidadBase, lote.id);
    if (nuevos.length) {
      envasesRef.current = [...envasesRef.current, ...nuevos];
      setEnvases(envasesRef.current);
    }
  };

  /** Consume lotes según el método; devuelve el costo total de lo consumido. */
  const consumir = (producto: Producto, cantidadBase: number) => {
    const r = consumirLotes(lotesRef.current, producto.id, cantidadBase, metodoCosteo, Number(producto.costo) || 0);
    if (r.lotes !== lotesRef.current) { lotesRef.current = r.lotes; setLotes(r.lotes); }
    return r;
  };

  const fusionarClientesDuplicados = (): number => {
    const grupos = new Map<string, Cliente[]>();
    clientes.forEach(c => {
      const clave = c.rut ? `rut:${normalizarRut(c.rut)}` : `nom:${normalizarNombre(c.nombre)}`;
      if (!grupos.has(clave)) grupos.set(clave, []);
      grupos.get(clave)!.push(c);
    });
    const reemplazo = new Map<string, Cliente>();
    const resultado: Cliente[] = [];
    let fusionados = 0;
    grupos.forEach(lista => {
      const [principal, ...resto] = lista;
      const unido: Cliente = resto.reduce((acc, c) => ({
        ...acc,
        rut: acc.rut || c.rut, telefono: acc.telefono || c.telefono, email: acc.email || c.email,
        direccion: acc.direccion || c.direccion, comuna: acc.comuna || c.comuna,
        ventas: acc.ventas + c.ventas, deuda: acc.deuda + c.deuda,
      }), principal);
      resto.forEach(c => reemplazo.set(c.id, unido));
      fusionados += resto.length;
      resultado.push(unido);
    });
    if (fusionados === 0) return 0;
    setClientes(resultado);
    setVentas(prev => prev.map(v => {
      const destino = v.cliente_id ? reemplazo.get(v.cliente_id) : undefined;
      return destino ? { ...v, cliente_id: destino.id, cliente: destino.nombre } : v;
    }));
    return fusionados;
  };

  // ══ Helpers ══════════════════════════════════════

  const getAbonosByReferencia = (referenciaId: string) =>
    abonos.filter(a => a.referencia_id === referenciaId);

  // O(1): leen del cálculo único de saldos (antes filtraban todos los abonos por documento).
  const getSaldoPendienteVenta = (ventaId: string): number => saldos.porVenta.get(ventaId) ?? 0;
  const getSaldoPendienteGasto = (gastoId: string): number => saldos.porGasto.get(gastoId) ?? 0;

  const getDocumentosByPeriodo = (periodo: string) =>
    documentosTributarios.filter(d => d.periodoTributario === periodo);

  const getF29Preparador = (periodo: string, ppmTasa = configuracionCumplimiento.ppmTasa): F29Preparador =>
    prepareF29({ documentos: documentosTributarios, periodo, ppmTasa, pagosPOS });

  const previewVentaImpacto = (venta: Omit<Venta, 'id'>, montoPagado?: number): SaleImpactPreview =>
    previewSaleImpact({
      cliente: venta.cliente,
      productos: venta.productos ?? [],
      fecha: venta.fecha,
      subtotal: venta.subtotal,
      iva: venta.iva,
      total: venta.monto,
      tipoDocumento: venta.tipo_documento,
      metodoPago: venta.metodo_pago,
      montoPagado: montoPagado ?? Math.max(0, venta.monto - (venta.saldo_pendiente ?? 0)),
      modoIntegracion: venta.modo_integracion ?? configuracionCumplimiento.modoIntegracion,
    });

  // ══ addAbono ════════════════════════════════════

  const addAbono = (abono: Omit<Abono, 'id'>) => {
    const newId = safeId('ABO');
    const nuevoAbono: Abono = { ...abono, id: newId };
    setAbonos(prev => [nuevoAbono, ...prev]);

    if (abono.tipo === 'cobro') {
      const venta = ventas.find(v => v.id === abono.referencia_id);
      const base = venta ? (venta.saldo_base ?? venta.saldo_pendiente ?? (venta.estado === 'Pendiente' ? venta.monto : 0)) : 0;
      const yaCobrado = abonos.filter(a => a.referencia_id === abono.referencia_id && a.tipo === 'cobro').reduce((acc, a) => acc + a.monto_abono, 0);
      const restante = Math.max(0, base - yaCobrado - abono.monto_abono);
      setVentas(prev => prev.map(v => {
        if (v.id !== abono.referencia_id) return v;
        return { ...v, saldo_pendiente: base, estado: restante <= 0 ? 'Pagado' : 'Pendiente' };
      }));
      setClientes(prev => prev.map(c => {
        if (c.nombre.toLowerCase() !== (abono.cliente_proveedor || '').toLowerCase()) return c;
        return { ...c, deuda: Math.max(0, c.deuda - abono.monto_abono) };
      }));
      setMovimientos(prev => [{
        id: `M-${String(prev.length + 1).padStart(3, '0')}`,
        fecha: abono.fecha, tipo: 'Ingreso',
        concepto: `Cobro a ${abono.cliente_proveedor}`,
        monto: abono.monto_abono, saldo: 0,
        metodo_pago: abono.metodo_pago, referencia_id: abono.referencia_id,
      }, ...prev]);
    } else {
      const gasto = gastos.find(g => g.id === abono.referencia_id);
      const base = gasto ? (gasto.saldo_base ?? gasto.saldo_pendiente ?? (gasto.estado === 'Por Pagar' ? gasto.monto : 0)) : 0;
      const yaPagado = abonos.filter(a => a.referencia_id === abono.referencia_id && a.tipo === 'pago').reduce((acc, a) => acc + a.monto_abono, 0);
      const restante = Math.max(0, base - yaPagado - abono.monto_abono);
      setGastos(prev => prev.map(g => {
        if (g.id !== abono.referencia_id) return g;
        return { ...g, saldo_pendiente: base, estado: restante <= 0 ? 'Pagado' : 'Por Pagar' };
      }));
      setProveedores(prev => prev.map(p => {
        if (p.nombre.toLowerCase() !== (abono.cliente_proveedor || '').toLowerCase()) return p;
        return { ...p, deuda: Math.max(0, p.deuda - abono.monto_abono) };
      }));
      setMovimientos(prev => [{
        id: `M-${String(prev.length + 1).padStart(3, '0')}`,
        fecha: abono.fecha, tipo: 'Egreso',
        concepto: `Pago a ${abono.cliente_proveedor}`,
        monto: abono.monto_abono, saldo: 0,
        metodo_pago: abono.metodo_pago, referencia_id: abono.referencia_id,
      }, ...prev]);
    }
  };

  // ══ addVenta ════════════════════════════════════

  const addVenta = (venta: Omit<Venta, 'id'>) => {
    const newId = safeId('VT');
    venta = { ...venta, monto: redondearCLP(venta.monto), subtotal: redondearCLP(venta.subtotal), iva: redondearCLP(venta.iva) };
    const saldoPendiente = venta.estado === 'Pendiente' ? redondearCLP(venta.saldo_pendiente ?? venta.monto) : 0;
    // Se busca en la referencia viva (no en el `clientes` del render): en cargas masivas
    // addVenta se llama en bucle y el closure viejo creaba un cliente nuevo por venta.
    const clienteExistente = buscarCliente(clientesRef.current, venta.cliente_id, venta.cliente);
    const clienteId = clienteExistente?.id ?? crypto.randomUUID();
    if (!clienteExistente && venta.cliente) {
      clientesRef.current = [{ id: clienteId, nombre: venta.cliente, telefono: '', email: '', ventas: 0, deuda: 0 }, ...clientesRef.current];
    }
    const documento = createDocumentFromSale({
      saleId: newId,
      fecha: venta.fecha,
      cliente: venta.cliente || 'Cliente General',
      clienteId,
      subtotal: venta.subtotal,
      iva: venta.iva,
      total: venta.monto,
      tipoDocumento: venta.tipo_documento ?? 'boleta_electronica',
      modoIntegracion: venta.modo_integracion ?? configuracionCumplimiento.modoIntegracion,
      observacion: venta.nota,
    });
    const evento = createIntegrationEvent({
      proveedor: documento.modoIntegracion === 'api_integrated' ? 'sii' : 'sistema',
      tipoEvento: 'documento_generado_desde_venta',
      entidadTipo: 'documento_tributario',
      entidadId: documento.id,
      modoIntegracion: documento.modoIntegracion,
      estado: documento.modoIntegracion === 'api_integrated' ? 'pendiente' : 'registrado',
      payloadResumen: {
        venta_id: newId,
        folio_interno: documento.folioInterno,
        tipo_documento: documento.tipoDocumento,
        estado: documento.estado,
      },
    });
    // ── Inventario: unidad base, presentaciones, receta, envases y costo congelado ──
    // Cada línea descuenta cantidad × factor de su presentación (decant 5 ml = 5 ml) más
    // los insumos de la receta, consume lotes con el método elegido y guarda su costo.
    const pedidoPorProducto = new Map<string, number>();
    const productosConCosto = (venta.productos ?? []).map(vp => {
      if (vp.esInventariable === false) return vp;
      const producto = inventario.find(p => p.id === vp.productoId);
      if (!producto || producto.tipo !== 'producto' || !(vp.cantidad > 0)) return vp;
      const pres = presentacionesActivas(producto).find(x => x.id === vp.presentacionId);
      const cantidadBase = vp.cantidadBase ?? vp.cantidad * (pres?.factor ?? 1);
      pedidoPorProducto.set(producto.id, (pedidoPorProducto.get(producto.id) ?? 0) + cantidadBase);
      let costo = consumir(producto, cantidadBase).costoTotal;
      if (pres && producto.controlEnvases) {
        const r = consumirEnvases(producto, envasesRef.current, pres, vp.cantidad);
        if (r.error) console.warn(`[inventario] ${producto.nombre}: ${r.error}`);
        else { envasesRef.current = r.envases; setEnvases(r.envases); }
      }
      for (const insumo of pres?.receta ?? []) {
        const pi = inventario.find(p => p.id === insumo.productoId);
        if (!pi) continue;
        const cant = insumo.cantidad * vp.cantidad;
        pedidoPorProducto.set(pi.id, (pedidoPorProducto.get(pi.id) ?? 0) + cant);
        costo += consumir(pi, cant).costoTotal;
      }
      return { ...vp, cantidadBase, costoVenta: costo, costoUnitario: Math.round(costo / vp.cantidad) };
    });

    const newVenta: Venta = {
      ...venta,
      productos: productosConCosto,
      id: newId,
      cliente_id: clienteId,
      documento_id: documento.id,
      periodo_tributario: documento.periodoTributario,
      modo_integracion: documento.modoIntegracion,
      estado_documento: documento.estado,
      tipo_documento: documento.tipoDocumento,
      saldo_base: saldoPendiente,
      saldo_pendiente: saldoPendiente,
      iva: documento.iva,
      subtotal: documento.neto || documento.exento || venta.subtotal,
      propina: venta.propina ?? 0,
      creado_por_id: user?.id ?? venta.creado_por_id,
      creado_por: perfil?.nombre_completo || (user?.email ?? venta.creado_por ?? 'Sistema'),
      negocio_id: perfil?.institucion_id ?? venta.negocio_id,
    };
    setVentas(prev => [newVenta, ...prev]);
    setDocumentosTributarios(prev => [documento, ...prev]);
    setIntegracionEventos(prev => [evento, ...prev]);

    // El stock se descuenta agrupado por producto (en unidad base) para que dos líneas
    // del mismo producto no se resten contra el mismo saldo.
    pedidoPorProducto.forEach((pedido, productoId) => {
      const producto = inventario.find(p => p.id === productoId);
      if (!producto || producto.tipo !== 'producto') return;
      // Nunca se descuenta mas de lo que hay. Se registra la salida efectiva y no la
      // pedida: deleteVenta restituye lo que dice el movimiento, asi que ambas
      // operaciones siguen siendo simetricas y el historial no miente.
      const deducido = Math.min(Math.max(0, producto.stock), pedido);
      if (deducido <= 0) return;
      setInventario(prev => prev.map(p => (
        p.id === productoId ? { ...p, stock: Math.max(0, p.stock - pedido) } : p
      )));
      setMovimientosInventario(prev => [{
        id: safeId('MI'),
        productoId,
        tipo: 'salida',
        cantidad: deducido,
        fecha: new Date().toISOString(),
        motivo: `Venta #${newId.split('-')[0]}`,
        origenTipo: 'venta',
        origenId: newId,
        documentoId: documento.id,
      }, ...prev]);
    });

    if (venta.cliente) {
      setClientes(prev => {
        const existing = prev.find(c => c.id === clienteId) ?? buscarCliente(prev, undefined, venta.cliente);
        if (existing) {
          return prev.map(c => c.id === existing.id ? { ...c, ventas: c.ventas + 1, deuda: c.deuda + saldoPendiente } : c);
        }
        return [{ id: clienteId, nombre: venta.cliente, telefono: '', email: '', ventas: 1, deuda: saldoPendiente }, ...prev];
      });
    }

    const esNotaCredito = normalizeDocumentType(documento.tipoDocumento) === 'nota_credito';
    const montoPagadoAhora = esNotaCredito ? 0 : venta.monto - saldoPendiente;
    if (montoPagadoAhora > 0) {
      setMovimientos(prev => [{
        id: `M-${String(prev.length + 1).padStart(3, '0')}`, fecha: venta.fecha, tipo: 'Ingreso',
        concepto: `Venta — ${venta.cliente}`, monto: montoPagadoAhora, saldo: 0,
        metodo_pago: venta.metodo_pago, referencia_id: newId,
      }, ...prev]);
    }
    // Propina (10% opcional) como campo separado: ingreso propio en Caja, no infla IVA ni stock.
    if (venta.propina && venta.propina > 0) {
      setMovimientos(prev => [{
        id: `M-${String(prev.length + 1).padStart(3, '0')}`, fecha: venta.fecha, tipo: 'Ingreso',
        concepto: `Propina — ${venta.cliente || 'Cliente General'}`, monto: venta.propina, saldo: 0,
        metodo_pago: venta.metodo_pago ?? 'efectivo', referencia_id: newId,
      }, ...prev]);
    }
  };

  const deleteVenta = (id: string) => {
    const venta = ventas.find(v => v.id === id);
    if (!venta) return;

    // 1) Devolver stock. Se restituye lo que efectivamente registro la venta en sus
    // movimientos, no las lineas del documento: asi el stock vuelve exactamente al
    // valor previo, incluso si la venta se guardo con faltante o llevaba texto libre.
    const salidasPorProducto = new Map<string, number>();
    movimientosInventario
      .filter(m => m.origenTipo === 'venta' && m.origenId === id)
      .forEach(m => salidasPorProducto.set(m.productoId, (salidasPorProducto.get(m.productoId) ?? 0) + (m.cantidad || 0)));
    salidasPorProducto.forEach((devolver, productoId) => {
      setInventario(prev => prev.map(p => (
        p.id === productoId && p.tipo === 'producto' ? { ...p, stock: p.stock + devolver } : p
      )));
      const producto = inventario.find(p => p.id === productoId);
      const linea = venta.productos.find(x => x.productoId === productoId);
      const costoBase = linea?.costoVenta && linea.cantidadBase ? linea.costoVenta / linea.cantidadBase : Number(producto?.costo) || 0;
      if (producto) registrarLote(producto, devolver, costoBase, hoyISO(), `devolucion-${id}`);
    });

    // 2) Quitar movimientos de caja vinculados (ingreso de la venta + cobros)
    setMovimientos(prev => prev.filter(m => !(m.referencia_id === id)));

    // 3) Quitar abonos (cobros) asociados a la venta
    setAbonos(prev => prev.filter(a => !(a.referencia_id === id)));

    // 4) Quitar documento tributario y sus eventos de integracion
    const documentoId = venta.documento_id;
    setDocumentosTributarios(prev => prev.filter(d => (documentoId ? d.id !== documentoId : true) && d.ventaId !== id));
    setIntegracionEventos(prev => prev.filter(e =>
      documentoId && e.entidadTipo === 'documento_tributario' ? e.entidadId !== documentoId : true
    ));

    // 5) Quitar la salida de inventario registrada por la venta
    setMovimientosInventario(prev => prev.filter(m => !(m.origenTipo === 'venta' && m.origenId === id)));

    // 6) Ajustar cliente (menos ventas y menos deuda)
    if (venta.cliente) {
      const base = venta.saldo_base ?? venta.saldo_pendiente ?? 0;
      setClientes(prev => prev.map(c =>
        c.nombre.toLowerCase() === venta.cliente.toLowerCase()
          ? { ...c, ventas: Math.max(0, c.ventas - 1), deuda: Math.max(0, c.deuda - base) }
          : c
      ));
    }

    setVentas(prev => prev.filter(v => v.id !== id));
  };

  const updateVenta = (id: string, p: Partial<Venta>) => {
    const anterior = ventas.find(v => v.id === id);
    if (!anterior) return;

    const productosViejos = anterior.productos ?? [];
    const productosNuevos = p.productos ?? anterior.productos ?? [];
    const nombreNuevo = p.cliente ?? anterior.cliente;
    const fechaNueva = p.fecha ?? anterior.fecha;
    const totalNuevo = p.monto ?? anterior.monto;
    const baseNueva = p.saldo_base ?? p.saldo_pendiente ?? (anterior.saldo_base ?? anterior.saldo_pendiente ?? 0);

    // 1) Stock en UNIDAD BASE (una línea de 4 decants de 5 ml descuenta 20 ml, no 4).
    const base = (pp: VentaProducto) => pp.cantidadBase ?? pp.cantidad ?? 0;
    const inventariable = (pp: VentaProducto) => pp.esInventariable !== false && inventario.some(x => x.id === pp.productoId && x.tipo === 'producto');
    const idsProducto = new Set([...productosViejos.map(x => x.productoId), ...productosNuevos.map(x => x.productoId)]);
    setInventario(prev => prev.map(prod => {
      if (prod.tipo !== 'producto' || !idsProducto.has(prod.id)) return prod;
      const viejo = productosViejos.filter(pp => pp.productoId === prod.id).reduce((a, pp) => a + base(pp), 0);
      const nuevo = productosNuevos.filter(pp => pp.productoId === prod.id).reduce((a, pp) => a + base(pp), 0);
      return { ...prod, stock: Math.max(0, prod.stock - (nuevo - viejo)) };
    }));

    // 1b) Costeo: lo vendido antes vuelve como lote a su costo y se consume lo nuevo con el
    // método vigente; cada línea queda con su costo recalculado (los envases no se reabren).
    productosViejos.filter(inventariable).forEach(pp => {
      const prod = inventario.find(x => x.id === pp.productoId)!;
      const costoBase = pp.costoVenta && base(pp) ? pp.costoVenta / base(pp) : Number(prod.costo) || 0;
      registrarLote(prod, base(pp), costoBase, hoyISO(), `edicion-${id}`);
    });
    const productosRecosteados = productosNuevos.map(pp => {
      if (!inventariable(pp) || !(pp.cantidad > 0)) return pp;
      const prod = inventario.find(x => x.id === pp.productoId)!;
      const costo = consumir(prod, base(pp)).costoTotal;
      return { ...pp, cantidadBase: base(pp), costoVenta: costo, costoUnitario: Math.round(costo / pp.cantidad) };
    });

    // 2) Movimientos de inventario: reemplazar las salidas de la venta
    setMovimientosInventario(prev => {
      const sinViejos = prev.filter(m => !(m.origenTipo === 'venta' && m.origenId === id));
      const nuevasSalidas = productosRecosteados.filter(inventariable).map(pp => ({
        id: safeId('MI'),
        productoId: pp.productoId,
        tipo: 'salida' as const,
        cantidad: base(pp),
        costoUnitario: pp.costoVenta && base(pp) ? Math.round(pp.costoVenta / base(pp)) : undefined,
        fecha: new Date().toISOString(),
        motivo: `Venta #${id.split('-')[0]}`,
        origenTipo: 'venta' as const,
        origenId: id,
      }));
      return [...nuevasSalidas, ...sinViejos];
    });

    // 3) Caja: eliminar el ingreso anterior y registrar el nuevo pago efectivo
    setMovimientos(prev => {
      const sinVienta = prev.filter(m => !(m.tipo === 'Ingreso' && m.referencia_id === id));
      const pagoAhora = Math.max(0, totalNuevo - baseNueva);
      if (pagoAhora <= 0) return sinVienta;
      return [{
        id: `M-${String(prev.length + 1).padStart(3, '0')}`,
        fecha: fechaNueva,
        tipo: 'Ingreso',
        concepto: `Venta — ${nombreNuevo}`,
        monto: pagoAhora,
        saldo: 0,
        metodo_pago: p.metodo_pago ?? anterior.metodo_pago,
        referencia_id: id,
      }, ...sinVienta];
    });

    // 4) Documento tributario vinculado: recalcular montos/periodo/estado
    const tipoDocumento = normalizeDocumentType((p.tipo_documento ?? anterior.tipo_documento ?? 'boleta_electronica') as DocumentType);
    setDocumentosTributarios(prev => prev.map(doc => {
      if (doc.ventaId !== id) return doc;
      const montos = calculateSaleDocumentAmounts({
        saleId: id,
        fecha: fechaNueva,
        cliente: nombreNuevo,
        clienteId: p.cliente_id ?? anterior.cliente_id,
        subtotal: p.subtotal ?? anterior.subtotal ?? 0,
        iva: p.iva ?? anterior.iva ?? 0,
        total: totalNuevo,
        tipoDocumento,
        modoIntegracion: p.modo_integracion ?? anterior.modo_integracion ?? 'sandbox',
      });
      const estado = p.estado_documento ?? doc.estado;
      return {
        ...doc,
        tipoDocumento,
        neto: montos.neto,
        iva: montos.iva,
        exento: montos.exento,
        total: montos.total,
        periodoTributario: periodoTributarioFromDate(fechaNueva),
        clienteId: p.cliente_id ?? anterior.cliente_id,
        estado: p.estado_documento
          ? estado
          : p.modo_integracion === 'manual_controlled'
            ? 'registrado_externamente'
            : (p.estado === 'Pagado' && doc.estado === 'pendiente_emision'
              ? 'emitido_interno'
              : doc.estado),
      };
    }));

    // 5) Cliente: ajustar deuda por el cambio de saldo base
    setClientes(prev => prev.map(c => {
      const coincideViejo = anterior.cliente && c.nombre.toLowerCase() === anterior.cliente.toLowerCase();
      if (!coincideViejo) return c;
      const baseVieja = anterior.saldo_base ?? anterior.saldo_pendiente ?? 0;
      return { ...c, deuda: Math.max(0, c.deuda - baseVieja + baseNueva) };
    }));

    setVentas(prev => prev.map(v => v.id === id ? {
      ...v,
      ...p,
      productos: productosRecosteados,
      saldo_pendiente: baseNueva,
      subtotal: p.subtotal ?? anterior.subtotal,
      iva: p.iva ?? anterior.iva,
      tipo_documento: tipoDocumento,
      periodo_tributario: periodoTributarioFromDate(fechaNueva),
      estado_documento: p.estado_documento ?? anterior.estado_documento,
      modo_integracion: p.modo_integracion ?? anterior.modo_integracion,
    } : v));
  };

  // ══ addGasto ════════════════════════════════════

  const addGasto = (gasto: Omit<Gasto, 'id'>) => {
    const newId = safeId('GAS');
    gasto = { ...gasto, monto: redondearCLP(gasto.monto), subtotal: redondearCLP(gasto.subtotal), iva: redondearCLP(gasto.iva) };
    const saldoPendiente = gasto.estado === 'Por Pagar' ? redondearCLP(gasto.saldo_pendiente ?? gasto.monto) : 0;
    // Sueldos y honorarios son gasto de personal, no un proveedor (corrección #33).
    const esGastoPersonal = esCategoriaPersonal(gasto.categoria);
    const proveedorExistente = esGastoPersonal ? undefined : (gasto.proveedor_id
      ? proveedoresRef.current.find(p => p.id === gasto.proveedor_id)
      : proveedoresRef.current.find(p => normalizarNombre(p.nombre) === normalizarNombre(gasto.proveedor)));
    const proveedorId = proveedorExistente?.id ?? crypto.randomUUID();
    if (!proveedorExistente && gasto.proveedor && !esGastoPersonal) {
      proveedoresRef.current = [{ id: proveedorId, nombre: gasto.proveedor, categoria: gasto.categoria, telefono: '', deuda: 0 }, ...proveedoresRef.current];
    }
    const documento = createDocumentFromPurchase({
      gastoId: newId,
      fecha: gasto.fecha,
      proveedor: gasto.proveedor,
      proveedorId,
      subtotal: gasto.subtotal,
      iva: gasto.iva,
      total: gasto.monto,
      esFactura: gasto.esFactura,
      modoIntegracion: 'manual_controlled',
    });
    const evento = createIntegrationEvent({
      proveedor: 'sistema',
      tipoEvento: 'documento_compra_registrado',
      entidadTipo: 'documento_tributario',
      entidadId: documento.id,
      modoIntegracion: documento.modoIntegracion,
      payloadResumen: { gasto_id: newId, folio_interno: documento.folioInterno, derecho_credito_iva: gasto.esFactura },
    });
    const newGasto: Gasto = {
      ...gasto,
      id: newId,
      proveedor_id: proveedorId,
      documento_id: documento.id,
      periodo_tributario: documento.periodoTributario,
      tipo_documento_compra: documento.tipoDocumento,
      saldo_base: saldoPendiente,
      saldo_pendiente: saldoPendiente,
    };
    setGastos(prev => [newGasto, ...prev]);
    setDocumentosTributarios(prev => [documento, ...prev]);
    setIntegracionEventos(prev => [evento, ...prev]);

    if (gasto.proveedor && !esGastoPersonal) {
      setProveedores(prev => {
        const existing = prev.find(p => p.id === proveedorId) ?? prev.find(p => normalizarNombre(p.nombre) === normalizarNombre(gasto.proveedor));
        if (existing) return prev.map(p => p.id === existing.id ? { ...p, deuda: p.deuda + saldoPendiente } : p);
        return [{ id: proveedorId, nombre: gasto.proveedor, categoria: gasto.categoria, telefono: '', deuda: saldoPendiente }, ...prev];
      });
    }

    if (gasto.estado === 'Pagado') {
      setMovimientos(prev => [{
        id: `M-${String(prev.length + 1).padStart(3, '0')}`, fecha: gasto.fecha, tipo: 'Egreso',
        concepto: `Gasto ${gasto.proveedor}`, monto: gasto.monto, saldo: 0, metodo_pago: gasto.metodo_pago,
        referencia_id: newId,
      }, ...prev]);
    }
  };

  const deleteGasto = (id: string) => {
    const gasto = gastos.find(g => g.id === id);
    if (!gasto) return;

    setMovimientos(prev => prev.filter(m => !(m.referencia_id === id)));
    setAbonos(prev => prev.filter(a => !(a.referencia_id === id)));
    const documentoId = gasto.documento_id;
    setDocumentosTributarios(prev => prev.filter(d => (documentoId ? d.id !== documentoId : true) && d.gastoId !== id));

    if (gasto.proveedor) {
      const base = gasto.saldo_base ?? gasto.saldo_pendiente ?? 0;
      setProveedores(prev => prev.map(pr =>
        pr.nombre.toLowerCase() === gasto.proveedor.toLowerCase()
          ? { ...pr, deuda: Math.max(0, pr.deuda - base) }
          : pr
      ));
    }
    setGastos(prev => prev.filter(g => g.id !== id));
  };

  const updateGasto = (id: string, p: Partial<Gasto>) => {
    const anterior = gastos.find(g => g.id === id);
    if (!anterior) return;

    const totalNuevo = p.monto ?? anterior.monto;
    const fechaNueva = p.fecha ?? anterior.fecha;
    const proveedorNuevo = p.proveedor ?? anterior.proveedor;

    // Base final: si queda "Por Pagar" se debe el total; si "Pagado" ya no se debe nada.
    const baseNueva = p.estado === 'Pagado'
      ? 0
      : (p.estado === 'Por Pagar'
        ? totalNuevo
        : (p.saldo_base ?? p.saldo_pendiente ?? (anterior.saldo_base ?? anterior.saldo_pendiente ?? 0)));

    setMovimientos(prev => {
      const sinGasto = prev.filter(m => !(m.tipo === 'Egreso' && m.referencia_id === id));
      const pagoAhora = p.estado === 'Por Pagar'
        ? 0
        : Math.max(0, totalNuevo - baseNueva);
      if (pagoAhora <= 0) return sinGasto;
      return [{
        id: `M-${String(prev.length + 1).padStart(3, '0')}`,
        fecha: fechaNueva,
        tipo: 'Egreso',
        concepto: `Gasto ${proveedorNuevo}`,
        monto: pagoAhora,
        saldo: 0,
        metodo_pago: p.metodo_pago ?? anterior.metodo_pago,
        referencia_id: id,
      }, ...sinGasto];
    });

    setProveedores(prev => prev.map(pr => {
      if (!anterior.proveedor || pr.nombre.toLowerCase() !== anterior.proveedor.toLowerCase()) return pr;
      const baseVieja = anterior.saldo_base ?? anterior.saldo_pendiente ?? 0;
      return { ...pr, deuda: Math.max(0, pr.deuda - baseVieja + baseNueva) };
    }));

    setGastos(prev => prev.map(g => g.id === id ? {
      ...g, ...p,
      saldo_base: baseNueva > 0 ? baseNueva : undefined,
      saldo_pendiente: baseNueva > 0 ? baseNueva : undefined,
    } : g));
  };

  // ══ CRUD — Clientes ════════════════════════════

  const addCliente = (c: Omit<Cliente, 'id' | 'ventas' | 'deuda'>) => {
    const newId = crypto.randomUUID();
    setClientes(prev => [{ ...c, id: newId, ventas: 0, deuda: 0 }, ...prev]);
  };

  const deleteCliente = (id: string) => {
    setClientes(prev => prev.filter(c => c.id !== id));
  };

  const updateCliente = (id: string, c: Partial<Cliente>) => {
    setClientes(prev => prev.map(cl => (cl.id === id ? { ...cl, ...c } : cl)));
  };

  // ══ CRUD — Proveedores ═════════════════════════

  const addProveedor = (p: Omit<Proveedor, 'id' | 'deuda'>) => {
    const newId = crypto.randomUUID();
    setProveedores(prev => [{ ...p, id: newId, deuda: 0 }, ...prev]);
  };

  const updateProveedor = (id: string, p: Partial<Proveedor>) => {
    setProveedores(prev => prev.map(pr => (pr.id === id ? { ...pr, ...p } : pr)));
  };

  const deleteProveedor = (id: string) => {
    setProveedores(prev => prev.filter(p => p.id !== id));
  };

  // ══ CRUD — Inventario ══════════════════════════

  const addProducto = (producto: Omit<Producto, 'id'>) => {
    const newId = crypto.randomUUID();
    setInventario(prev => [{ ...producto, id: newId }, ...prev]);
    if (producto.tipo === 'producto' && producto.stock > 0) {
      registrarLote({ ...producto, id: newId } as Producto, Number(producto.stock), Number(producto.costo) || 0);
      setMovimientosInventario(prev => [{
        id: crypto.randomUUID(), productoId: newId, tipo: 'ingreso',
        cantidad: producto.stock, costoUnitario: producto.costo,
        fecha: new Date().toISOString(), motivo: 'Inventario inicial',
      }, ...prev]);
    }
  };

  const editProducto = (id: string, p: Partial<Producto>) => {
    setInventario(prev => prev.map(x => x.id === id ? { ...x, ...p } : x));
  };

  const deleteProducto = (id: string) => {
    setInventario(prev => prev.filter(p => p.id !== id));
  };

  const addMovimientoInventario = (m: Omit<MovimientoInventario, 'id'>) => {
    const newId = crypto.randomUUID();
    const producto = inventario.find(p => p.id === m.productoId);
    let costoMovimiento = m.costoUnitario;
    if (producto && producto.tipo === 'producto') {
      const fecha = (m.fecha || '').slice(0, 10) || hoyISO();
      if (m.tipo === 'ingreso' || m.tipo === 'devolucion' || (m.tipo === 'ajuste' && m.cantidad > 0)) {
        registrarLote(producto, m.cantidad, m.costoUnitario && m.costoUnitario > 0 ? m.costoUnitario : costoPromedio(lotesRef.current, producto.id, Number(producto.costo) || 0), fecha);
      } else if (m.tipo === 'salida' || m.tipo === 'merma' || (m.tipo === 'ajuste' && m.cantidad < 0)) {
        const cantidad = Math.abs(m.cantidad);
        costoMovimiento = cantidad > 0 ? Math.round(consumir(producto, cantidad).costoTotal / cantidad) : 0;
      }
    }
    setMovimientosInventario(prev => [{ ...m, costoUnitario: costoMovimiento, id: newId }, ...prev]);
    // El saldo se calcula DENTRO del actualizador funcional: si se calculara antes
    // (leyendo `inventario` del render), varios movimientos al mismo producto en un
    // mismo lote se pisarian entre si y se perderian los ajustes anteriores.
    setInventario(prev => prev.map(p => {
      if (p.id !== m.productoId) return p;
      let stock = p.stock;
      if (m.tipo === 'ingreso' || m.tipo === 'devolucion') stock += m.cantidad;
      else if (m.tipo === 'salida' || m.tipo === 'merma') stock = Math.max(0, stock - m.cantidad);
      else if (m.tipo === 'ajuste') stock += m.cantidad;
      // El costo solo lo define un ingreso: en una salida, merma o ajuste el valor
      // enviado puede venir de un campo oculto y dejaria de corresponder al producto.
      // El costo mostrado es el promedio ponderado de los lotes vigentes (corrección #11).
      const redefineCosto = (m.tipo === 'ingreso') && m.costoUnitario != null && m.costoUnitario > 0;
      return { ...p, stock, costo: redefineCosto ? Math.round(costoPromedio(lotesRef.current, p.id, m.costoUnitario!)) : p.costo };
    }));
  };

  // ══ CRUD — Promociones ═════════════════════════

  const addPromocion = (p: Omit<Promocion, 'id'>) => {
    const newId = crypto.randomUUID();
    setPromociones(prev => [{ ...p, id: newId }, ...prev]);
  };
  const editPromocion = (id: string, p: Partial<Promocion>) => {
    setPromociones(prev => prev.map(x => x.id === id ? { ...x, ...p } : x));
  };
  const deletePromocion = (id: string) => {
    setPromociones(prev => prev.filter(p => p.id !== id));
  };

  // ══ createNotaCredito ══════════════════════════

  const createNotaCredito = (documentoId: string, motivo: string, monto: number, devuelveStock = false) => {
    const original = documentosTributarios.find(d => d.id === documentoId);
    if (!original) return;
    const notaCredito = createCreditNote({
      original,
      motivo,
      monto,
      parcial: monto < original.total,
      devuelveStock,
      modoIntegracion: original.modoIntegracion,
    });
    const evento = createIntegrationEvent({
      proveedor: 'sistema',
      tipoEvento: 'nota_credito_generada',
      entidadTipo: 'documento_tributario',
      entidadId: notaCredito.id,
      modoIntegracion: notaCredito.modoIntegracion,
      payloadResumen: { documento_original_id: original.id, motivo, monto, devuelve_stock: devuelveStock },
    });
    setDocumentosTributarios(prev => [
      notaCredito,
      ...prev.map(d => d.id === original.id ? { ...d, estado: 'ajustado_con_nota_credito' } : d),
    ]);
    setIntegracionEventos(prev => [evento, ...prev]);
    if (original.ventaId) {
      setVentas(prev => prev.map(v => {
        if (v.id !== original.ventaId) return v;
        const nuevoBase = Math.max(0, (v.saldo_base ?? v.saldo_pendiente ?? 0) - monto);
        return { ...v, saldo_base: nuevoBase, saldo_pendiente: nuevoBase, estado: nuevoBase === 0 ? 'Pagado' : v.estado };
      }));
    }
  };

  // ══ reconcilePagoPOS ═══════════════════════════

  const reconcilePagoPOS = (pagoId: string, ventaId: string) => {
    const venta = ventas.find(v => v.id === ventaId);
    if (!venta) return;
    setPagosPOS(prev => prev.map(p => p.id === pagoId ? {
      ...p, estadoConciliacion: 'conciliado', ventaId, documentoId: venta.documento_id,
    } : p));
    const evento = createIntegrationEvent({
      proveedor: 'pos', tipoEvento: 'pago_conciliado', entidadTipo: 'pago_pos', entidadId: pagoId,
      modoIntegracion: 'manual_controlled',
      payloadResumen: { venta_id: ventaId, documento_id: venta.documento_id },
    });
    setIntegracionEventos(prev => [evento, ...prev]);
  };

  // ══ updatePpmTasa ══════════════════════════════

  const ppmDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePpmTasa = async (nuevoValor: number): Promise<void> => {
    setConfiguracionCumplimiento(prev => ({ ...prev, ppmTasa: nuevoValor }));
    if (ppmDebounceRef.current) clearTimeout(ppmDebounceRef.current);
  };

  return (
    <ERPContext.Provider value={{
      ventas, gastos, clientes, proveedores, movimientos, inventario, movimientosInventario, promociones, abonos,
      documentosTributarios, integracionEventos, pagosPOS, configuracionCumplimiento, saldoActual, saldos, fusionarClientesDuplicados,
      lotes, envases, metodoCosteo, setMetodoCosteo,
      addVenta, updateVenta, addGasto, updateGasto, addCliente, updateCliente, addProveedor, updateProveedor, addProducto, editProducto, addMovimientoInventario, addPromocion, editPromocion,
      deleteVenta, deleteGasto, deleteCliente, deleteProveedor, deleteProducto, deletePromocion,
      addAbono, createNotaCredito, reconcilePagoPOS, previewVentaImpacto, getDocumentosByPeriodo, getF29Preparador,
      getAbonosByReferencia, getSaldoPendienteVenta, getSaldoPendienteGasto, updatePpmTasa,
    }}>
      {children}
    </ERPContext.Provider>
  );
}

export function useERP() {
  const context = useContext(ERPContext);
  if (context === undefined) throw new Error('useERP must be used within an ERPProvider');
  return context;
}
