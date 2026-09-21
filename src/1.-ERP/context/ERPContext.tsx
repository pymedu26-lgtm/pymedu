import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
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
} from '../services/documentCompliance';

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
  cantidad: number;
  precioBase: number;
  costoUnitario: number;
  descuentoTipo?: 'porcentaje' | 'monto' | 'ninguno';
  descuentoValor?: number;
  descuentoMotivo?: string;
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
  margenEstimado?: number;
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
  id: string;
  nombre: string;
  codigo: string;
  codigoBarras?: string;
  categoria: string;
  tipo: 'producto' | 'servicio';
  tipoOperativo?: 'producto_simple' | 'servicio' | 'pack' | 'insumo' | 'producto_compuesto';
  descripcion: string;
  costo: number;
  precio: number;
  incluyeIva: boolean;
  stock: number;
  stockReservado?: number;
  stockMinimo: number;
  bodegaPrincipalId?: string;
  unidadMedida: string;
  estado: 'activo' | 'inactivo';
  proveedorId?: string;
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
  fechaFin: string;
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
  addVenta: (venta: Omit<Venta, 'id'>) => void;
  updateVenta: (id: string, venta: Partial<Venta>) => void;
  deleteVenta: (id: string) => void;
  addGasto: (gasto: Omit<Gasto, 'id'>) => void;
  updateGasto: (id: string, gasto: Partial<Gasto>) => void;
  deleteGasto: (id: string) => void;
  addCliente: (cliente: Omit<Cliente, 'id' | 'ventas' | 'deuda'>) => void;
  deleteCliente: (id: string) => void;
  addProveedor: (proveedor: Omit<Proveedor, 'id' | 'deuda'>) => void;
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
  const { user } = useAuth();

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
  const [configuracionCumplimiento, setConfiguracionCumplimiento] = useState<ConfiguracionCumplimiento>(DEMO_CONFIG);

  const [hydrated, setHydrated] = useState(false);
  const dbIdsRef = useRef<Record<string, Set<string>>>({});
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saldoActual = movimientos.reduce((acc, m) => m.tipo === 'Ingreso' ? acc + m.monto : acc - m.monto, 0);

  // ══ Carga desde Supabase ══════════════════════
  useEffect(() => {
    let active = true;
    setHydrated(false);

    if (!user) return () => { active = false; };

    (async () => {
      try {
        const { data, error } = await supabase
          .from('erp_datos')
          .select('coleccion, id, data');

        if (error) throw error;
        if (!active) return;

        const grouped = (data ?? []).reduce<Record<string, unknown[]>>((acc, r) => {
          (acc[r.coleccion] ??= []).push(r.data);
          return acc;
        }, {});

        dbIdsRef.current = (data ?? []).reduce<Record<string, Set<string>>>((acc, r) => {
          (acc[r.coleccion] ??= new Set()).add(r.id);
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
        const cfg = grouped.config?.[0] as ConfiguracionCumplimiento | undefined;
        if (cfg) setConfiguracionCumplimiento({ ...DEMO_CONFIG, ...cfg });
      } catch (err) {
        console.error('No se pudo cargar el ERP desde Supabase (¿ejecutaste 10-erp-persistencia.sql?):', err);
      } finally {
        if (active) setHydrated(true);
      }
    })();

    return () => { active = false; };
  }, [user?.id]);

  // ══ Guardado en Supabase (debounced) ══════════
  useEffect(() => {
    if (!hydrated || !user) return;

    const snapshot: Record<string, { id: string }[]> = {
      ventas,
      gastos,
      clientes,
      proveedores,
      movimientos,
      inventario,
      movimientosInventario,
      promociones,
      abonos,
      documentosTributarios,
      integracionEventos,
      pagosPOS,
      config: [{ id: 'config', ...configuracionCumplimiento }],
    };

    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(async () => {
      try {
        for (const [coleccion, items] of Object.entries(snapshot)) {
          const rows = items.map((it) => ({
            usuario_id: user.id,
            coleccion,
            id: it.id,
            data: it as unknown as Record<string, unknown>,
          }));
          if (rows.length > 0) {
            await supabase.from('erp_datos').upsert(rows, { onConflict: 'usuario_id,coleccion,id' });
          }
          const known = dbIdsRef.current[coleccion] ?? new Set<string>();
          const live = new Set(items.map((i) => i.id));
          const toDelete = [...known].filter((id) => !live.has(id));
          if (toDelete.length > 0) {
            await supabase
              .from('erp_datos')
              .delete()
              .match({ usuario_id: user.id, coleccion })
              .in('id', toDelete);
          }
          dbIdsRef.current[coleccion] = live;
        }
      } catch (err) {
        console.error('No se pudo guardar el ERP en Supabase:', err);
      }
    }, 600);

    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [hydrated, user,
    ventas, gastos, clientes, proveedores, movimientos, inventario,
    movimientosInventario, promociones, abonos, documentosTributarios,
    integracionEventos, pagosPOS, configuracionCumplimiento]);

  // ══ Helpers ══════════════════════════════════════

  const getAbonosByReferencia = (referenciaId: string) =>
    abonos.filter(a => a.referencia_id === referenciaId);

  const getSaldoPendienteVenta = (ventaId: string): number => {
    const venta = ventas.find(v => v.id === ventaId);
    if (!venta) return 0;
    const montoAbonado = abonos.filter(a => a.referencia_id === ventaId && a.tipo === 'cobro').reduce((acc, a) => acc + a.monto_abono, 0);
    const saldoInicial = venta.saldo_base ?? venta.saldo_pendiente ?? (venta.estado === 'Pendiente' ? venta.monto : 0);
    return Math.max(0, saldoInicial - montoAbonado);
  };

  const getSaldoPendienteGasto = (gastoId: string): number => {
    const gasto = gastos.find(g => g.id === gastoId);
    if (!gasto) return 0;
    const totalPagado = abonos.filter(a => a.referencia_id === gastoId && a.tipo === 'pago').reduce((acc, a) => acc + a.monto_abono, 0);
    const saldoInicial = gasto.saldo_base ?? gasto.saldo_pendiente ?? (gasto.estado === 'Por Pagar' ? gasto.monto : 0);
    return Math.max(0, saldoInicial - totalPagado);
  };

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
    const saldoPendiente = venta.estado === 'Pendiente' ? (venta.saldo_pendiente ?? venta.monto) : 0;
    const clienteExistente = venta.cliente_id
      ? clientes.find(c => c.id === venta.cliente_id)
      : clientes.find(c => c.nombre.toLowerCase() === venta.cliente.toLowerCase());
    const clienteId = clienteExistente?.id ?? crypto.randomUUID();
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
    const newVenta: Venta = {
      ...venta,
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
    };
    setVentas(prev => [newVenta, ...prev]);
    setDocumentosTributarios(prev => [documento, ...prev]);
    setIntegracionEventos(prev => [evento, ...prev]);

    venta.productos?.forEach(vp => {
      setInventario(prev => prev.map(p => {
        if (p.id === vp.productoId && p.tipo === 'producto') {
          return { ...p, stock: Math.max(0, p.stock - (vp.cantidad || 0)) };
        }
        return p;
      }));
      setMovimientosInventario(prev => [{
        id: safeId('MI'),
        productoId: vp.productoId,
        tipo: 'salida',
        cantidad: vp.cantidad,
        fecha: new Date().toISOString(),
        motivo: `Venta #${newId.split('-')[0]}`,
        origenTipo: 'venta',
        origenId: newId,
        documentoId: documento.id,
      }, ...prev]);
    });

    if (venta.cliente) {
      setClientes(prev => {
        const existing = prev.find(c => c.id === clienteId);
        if (existing) {
          return prev.map(c => c.id === existing.id ? { ...c, ventas: c.ventas + 1, deuda: c.deuda + saldoPendiente } : c);
        }
        return [{ id: clienteId, nombre: venta.cliente, telefono: '', email: '', ventas: 1, deuda: saldoPendiente }, ...prev];
      });
    }

    const montoPagadoAhora = venta.monto - saldoPendiente;
    if (montoPagadoAhora > 0) {
      setMovimientos(prev => [{
        id: `M-${String(prev.length + 1).padStart(3, '0')}`, fecha: venta.fecha, tipo: 'Ingreso',
        concepto: `Venta — ${venta.cliente}`, monto: montoPagadoAhora, saldo: 0,
        metodo_pago: venta.metodo_pago,
      }, ...prev]);
    }
  };

  const deleteVenta = (id: string) => {
    setVentas(prev => prev.filter(v => v.id !== id));
  };

  const updateVenta = (id: string, p: Partial<Venta>) => {
    setVentas(prev => prev.map(v => v.id === id ? { ...v, ...p } : v));
  };

  // ══ addGasto ════════════════════════════════════

  const addGasto = (gasto: Omit<Gasto, 'id'>) => {
    const newId = safeId('GAS');
    const saldoPendiente = gasto.estado === 'Por Pagar' ? (gasto.saldo_pendiente ?? gasto.monto) : 0;
    const proveedorExistente = gasto.proveedor_id
      ? proveedores.find(p => p.id === gasto.proveedor_id)
      : proveedores.find(p => p.nombre.toLowerCase() === gasto.proveedor.toLowerCase());
    const proveedorId = proveedorExistente?.id ?? crypto.randomUUID();
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

    if (gasto.proveedor) {
      setProveedores(prev => {
        const existing = prev.find(p => p.id === proveedorId);
        if (existing) return prev.map(p => p.id === existing.id ? { ...p, deuda: p.deuda + saldoPendiente } : p);
        return [{ id: proveedorId, nombre: gasto.proveedor, categoria: gasto.categoria, telefono: '', deuda: saldoPendiente }, ...prev];
      });
    }

    if (gasto.estado === 'Pagado') {
      setMovimientos(prev => [{
        id: `M-${String(prev.length + 1).padStart(3, '0')}`, fecha: gasto.fecha, tipo: 'Egreso',
        concepto: `Gasto ${gasto.proveedor}`, monto: gasto.monto, saldo: 0, metodo_pago: gasto.metodo_pago,
      }, ...prev]);
    }
  };

  const deleteGasto = (id: string) => {
    setGastos(prev => prev.filter(g => g.id !== id));
  };

  const updateGasto = (id: string, p: Partial<Gasto>) => {
    setGastos(prev => prev.map(g => g.id === id ? { ...g, ...p } : g));
  };

  // ══ CRUD — Clientes ════════════════════════════

  const addCliente = (c: Omit<Cliente, 'id' | 'ventas' | 'deuda'>) => {
    const newId = crypto.randomUUID();
    setClientes(prev => [{ ...c, id: newId, ventas: 0, deuda: 0 }, ...prev]);
  };

  const deleteCliente = (id: string) => {
    setClientes(prev => prev.filter(c => c.id !== id));
  };

  // ══ CRUD — Proveedores ═════════════════════════

  const addProveedor = (p: Omit<Proveedor, 'id' | 'deuda'>) => {
    const newId = crypto.randomUUID();
    setProveedores(prev => [{ ...p, id: newId, deuda: 0 }, ...prev]);
  };

  const deleteProveedor = (id: string) => {
    setProveedores(prev => prev.filter(p => p.id !== id));
  };

  // ══ CRUD — Inventario ══════════════════════════

  const addProducto = (producto: Omit<Producto, 'id'>) => {
    const newId = crypto.randomUUID();
    setInventario(prev => [{ ...producto, id: newId }, ...prev]);
    if (producto.tipo === 'producto' && producto.stock > 0) {
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
    setMovimientosInventario(prev => [{ ...m, id: newId }, ...prev]);
    const prodActual = inventario.find(p => p.id === m.productoId);
    let newStock = prodActual?.stock ?? 0;
    if (m.tipo === 'ingreso' || m.tipo === 'devolucion') newStock += m.cantidad;
    else if (m.tipo === 'salida' || m.tipo === 'merma') newStock = Math.max(0, newStock - m.cantidad);
    else if (m.tipo === 'ajuste') newStock += m.cantidad;
    setInventario(prev => prev.map(p => {
      if (p.id !== m.productoId) return p;
      return { ...p, stock: newStock, costo: m.costoUnitario ?? p.costo };
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
      documentosTributarios, integracionEventos, pagosPOS, configuracionCumplimiento, saldoActual,
      addVenta, updateVenta, addGasto, updateGasto, addCliente, addProveedor, addProducto, editProducto, addMovimientoInventario, addPromocion, editPromocion,
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
