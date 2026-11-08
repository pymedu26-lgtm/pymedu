export type DocumentType =
  | 'boleta_electronica'
  | 'factura_electronica'
  | 'boleta_exenta'
  | 'factura_exenta'
  | 'nota_venta_interna'
  | 'cotizacion'
  | 'nota_credito';

export type IntegrationMode = 'sandbox' | 'manual_controlled' | 'api_integrated';

export type DocumentStatus =
  | 'borrador'
  | 'pendiente_emision'
  | 'emitido_interno'
  | 'enviado_sii'
  | 'aceptado_sii'
  | 'rechazado_sii'
  | 'observado'
  | 'registrado_externamente'
  | 'ajustado_con_nota_credito';

export type DocumentOperation = 'venta' | 'compra' | 'ajuste';
export type IntegrationProvider = 'sii' | 'pos' | 'banco' | 'pdf' | 'storage' | 'sistema';
export type IntegrationEventStatus = 'registrado' | 'pendiente' | 'exitoso' | 'fallido' | 'observado';

export interface DocumentoTributario {
  id: string;
  empresaId?: string;
  operacion: DocumentOperation;
  folioInterno: string;
  folioTributario?: string;
  tipoDocumento: DocumentType;
  estado: DocumentStatus;
  neto: number;
  iva: number;
  exento: number;
  total: number;
  periodoTributario: string;
  ventaId?: string;
  gastoId?: string;
  clienteId?: string;
  proveedorId?: string;
  documentoReferenciaId?: string;
  modoIntegracion: IntegrationMode;
  observacion?: string;
  payloadResumen?: Record<string, unknown>;
  createdAt?: string;
}

export interface IntegracionEvento {
  id: string;
  empresaId?: string;
  proveedor: IntegrationProvider;
  tipoEvento: string;
  estado: IntegrationEventStatus;
  entidadTipo: string;
  entidadId: string;
  modoIntegracion: IntegrationMode;
  payloadResumen: Record<string, unknown>;
  errorCodigo?: string;
  errorMensaje?: string;
  createdAt: string;
}

export interface PagoPOS {
  id: string;
  empresaId?: string;
  fecha: string;
  monto: number;
  metodoPago?: string;
  proveedorPOS: string;
  estadoConciliacion: 'recibido' | 'conciliado' | 'sin_venta' | 'observado';
  ventaId?: string;
  documentoId?: string;
  referenciaExterna?: string;
  observacion?: string;
}

export interface ConfiguracionCumplimiento {
  modoIntegracion: IntegrationMode;
  ambiente: 'sandbox' | 'produccion';
  ppmTasa: number;
  usaFoliosManual: boolean;
  contadorEmail?: string;
  /** Método de costeo del inventario (por defecto promedio). LIFO no se acepta en Chile. */
  metodoCosteo?: 'fifo' | 'promedio';
  /** Qué frasco abierto usar para una porción: el que tiene menos (para terminarlo) o el abierto hace más tiempo. */
  politicaEnvaseAbierto?: 'menos_contenido' | 'mas_antiguo';
  /** Permite completar una porción con dos envases abiertos (por defecto no). */
  permitirMezclarEnvases?: boolean;
}

export interface SaleDocumentInput {
  saleId: string;
  fecha: string;
  cliente: string;
  clienteId?: string;
  subtotal: number;
  iva: number;
  total: number;
  tipoDocumento: DocumentType | 'boleta' | 'factura' | 'nota_venta';
  modoIntegracion?: IntegrationMode;
  estado?: DocumentStatus;
  observacion?: string;
}

export interface PurchaseDocumentInput {
  gastoId: string;
  fecha: string;
  proveedor: string;
  proveedorId?: string;
  subtotal: number;
  iva: number;
  total: number;
  esFactura: boolean;
  modoIntegracion?: IntegrationMode;
  estado?: DocumentStatus;
}

export interface SaleImpactPreview {
  cliente: string;
  documento: DocumentType;
  neto: number;
  ivaDebito: number;
  exento: number;
  total: number;
  metodoPago?: string;
  impactoCaja: number;
  impactoStock: { productoId: string; productoNombre: string; cantidad: number }[];
  saldoPendiente: number;
  impactoCxC: number;
  periodoTributario: string;
  afectaIva: boolean;
  mensajeIntegracion: string;
}

export interface F29Preparador {
  periodo: string;
  ivaDebito: number;
  ivaCredito: number;
  ivaNotasCredito: number;
  montoExento: number;
  diferenciaIva: number;
  ppm: number;
  totalEstimado: number;
  documentosPendientes: number;
  notasCredito: number;
  ventasPOSConciliadas: number;
  alertas: string[];
}

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  boleta_electronica: 'Boleta electronica',
  factura_electronica: 'Factura electronica',
  boleta_exenta: 'Boleta exenta/no afecta',
  factura_exenta: 'Factura exenta/no afecta',
  nota_venta_interna: 'Nota de venta interna',
  cotizacion: 'Cotizacion',
  nota_credito: 'Nota de credito',
};

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  borrador: 'Borrador',
  pendiente_emision: 'Documento pendiente',
  emitido_interno: 'Emitido interno',
  enviado_sii: 'Enviado al SII',
  aceptado_sii: 'Aceptado por SII',
  rechazado_sii: 'Rechazado por SII',
  observado: 'Observado',
  registrado_externamente: 'Registrado externamente',
  ajustado_con_nota_credito: 'Ajustado con nota de credito',
};

export function periodoTributarioFromDate(fecha: string): string {
  const safeDate = fecha || new Date().toISOString().split('T')[0];
  return safeDate.slice(0, 7);
}

export function normalizeDocumentType(tipo?: DocumentType | 'boleta' | 'factura' | 'nota_venta'): DocumentType {
  if (tipo === 'boleta') return 'boleta_electronica';
  if (tipo === 'factura') return 'factura_electronica';
  if (tipo === 'nota_venta') return 'nota_venta_interna';
  return tipo ?? 'boleta_electronica';
}

export function isExemptDocument(tipo: DocumentType): boolean {
  return tipo === 'boleta_exenta' || tipo === 'factura_exenta';
}

export function isInternalDocument(tipo: DocumentType): boolean {
  return tipo === 'nota_venta_interna' || tipo === 'cotizacion';
}

export function isCreditNote(tipo: DocumentType): boolean {
  return tipo === 'nota_credito';
}

export function createsIvaDebit(tipo: DocumentType): boolean {
  return !isExemptDocument(tipo) && !isInternalDocument(tipo) && tipo !== 'nota_credito';
}

function safeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 100000)}`;
}

export function buildInternalFolio(prefix: string, fecha: string, sequenceSeed: string | number): string {
  const periodo = periodoTributarioFromDate(fecha).replace('-', '');
  const seed = String(sequenceSeed).replace(/[^0-9a-z]/gi, '').slice(-6).toUpperCase();
  return `${prefix}-${periodo}-${seed || '000001'}`;
}

export function calculateSaleDocumentAmounts(input: SaleDocumentInput) {
  const tipo = normalizeDocumentType(input.tipoDocumento);
  if (isInternalDocument(tipo)) {
    return { neto: input.total, iva: 0, exento: 0, total: input.total };
  }
  if (isExemptDocument(tipo)) {
    return { neto: 0, iva: 0, exento: input.total, total: input.total };
  }
  return { neto: input.subtotal, iva: input.iva, exento: 0, total: input.total };
}

export function createDocumentFromSale(input: SaleDocumentInput): DocumentoTributario {
  const tipoDocumento = normalizeDocumentType(input.tipoDocumento);
  const amounts = calculateSaleDocumentAmounts(input);
  const status: DocumentStatus = input.estado ?? (
    input.modoIntegracion === 'manual_controlled'
      ? 'registrado_externamente'
      : isInternalDocument(tipoDocumento)
        ? 'emitido_interno'
        : 'pendiente_emision'
  );

  return {
    id: safeId('DOC'),
    operacion: 'venta',
    folioInterno: buildInternalFolio('DTE', input.fecha, input.saleId),
    tipoDocumento,
    estado: status,
    neto: amounts.neto,
    iva: amounts.iva,
    exento: amounts.exento,
    total: amounts.total,
    periodoTributario: periodoTributarioFromDate(input.fecha),
    ventaId: input.saleId,
    clienteId: input.clienteId,
    modoIntegracion: input.modoIntegracion ?? 'sandbox',
    observacion: input.observacion,
    payloadResumen: {
      cliente: input.cliente,
      fuente: 'venta_guiada',
      entorno: input.modoIntegracion ?? 'sandbox',
    },
  };
}

export function createDocumentFromPurchase(input: PurchaseDocumentInput): DocumentoTributario {
  const tipoDocumento: DocumentType = input.esFactura ? 'factura_electronica' : 'nota_venta_interna';
  return {
    id: safeId('DOC'),
    operacion: 'compra',
    folioInterno: buildInternalFolio('COMPRA', input.fecha, input.gastoId),
    tipoDocumento,
    estado: input.estado ?? (input.esFactura ? 'registrado_externamente' : 'emitido_interno'),
    neto: input.subtotal,
    iva: input.esFactura ? input.iva : 0,
    exento: input.esFactura ? 0 : input.total,
    total: input.total,
    periodoTributario: periodoTributarioFromDate(input.fecha),
    gastoId: input.gastoId,
    proveedorId: input.proveedorId,
    modoIntegracion: input.modoIntegracion ?? 'manual_controlled',
    payloadResumen: {
      proveedor: input.proveedor,
      fuente: 'gasto_registrado',
      derecho_credito_iva: input.esFactura,
    },
  };
}

export function createIntegrationEvent(input: {
  proveedor: IntegrationProvider;
  tipoEvento: string;
  entidadTipo: string;
  entidadId: string;
  modoIntegracion?: IntegrationMode;
  estado?: IntegrationEventStatus;
  payloadResumen?: Record<string, unknown>;
  errorCodigo?: string;
  errorMensaje?: string;
}): IntegracionEvento {
  return {
    id: safeId('EVT'),
    proveedor: input.proveedor,
    tipoEvento: input.tipoEvento,
    estado: input.estado ?? 'registrado',
    entidadTipo: input.entidadTipo,
    entidadId: input.entidadId,
    modoIntegracion: input.modoIntegracion ?? 'sandbox',
    payloadResumen: input.payloadResumen ?? {},
    errorCodigo: input.errorCodigo,
    errorMensaje: input.errorMensaje,
    createdAt: new Date().toISOString(),
  };
}

export function previewSaleImpact(input: {
  cliente: string;
  productos: { productoId: string; productoNombre: string; cantidad: number; total: number }[];
  fecha: string;
  subtotal: number;
  iva: number;
  total: number;
  tipoDocumento?: DocumentType | 'boleta' | 'factura' | 'nota_venta';
  metodoPago?: string;
  montoPagado?: number;
  modoIntegracion?: IntegrationMode;
}): SaleImpactPreview {
  const tipoDocumento = normalizeDocumentType(input.tipoDocumento);
  const amounts = calculateSaleDocumentAmounts({
    saleId: 'preview',
    fecha: input.fecha,
    cliente: input.cliente,
    subtotal: input.subtotal,
    iva: input.iva,
    total: input.total,
    tipoDocumento,
    modoIntegracion: input.modoIntegracion ?? 'sandbox',
  });
  const montoPagado = Math.max(0, Math.min(input.montoPagado ?? input.total, input.total));
  const saldoPendiente = Math.max(0, input.total - montoPagado);

  return {
    cliente: input.cliente || 'Cliente general',
    documento: tipoDocumento,
    neto: amounts.neto,
    ivaDebito: amounts.iva,
    exento: amounts.exento,
    total: amounts.total,
    metodoPago: input.metodoPago,
    impactoCaja: montoPagado,
    impactoStock: input.productos.map(p => ({
      productoId: p.productoId,
      productoNombre: p.productoNombre,
      cantidad: p.cantidad,
    })),
    saldoPendiente,
    impactoCxC: saldoPendiente,
    periodoTributario: periodoTributarioFromDate(input.fecha),
    afectaIva: createsIvaDebit(tipoDocumento),
    mensajeIntegracion: (input.modoIntegracion ?? 'sandbox') === 'sandbox'
      ? 'Entorno de prueba: no envia al SII.'
      : (input.modoIntegracion ?? 'sandbox') === 'manual_controlled'
        ? 'Registro controlado: documento emitido o revisado fuera del ERP.'
        : 'Integracion preparada: requiere proveedor certificado activo.',
  };
}

export function createCreditNote(input: {
  original: DocumentoTributario;
  motivo: string;
  monto: number;
  parcial?: boolean;
  devuelveStock?: boolean;
  modoIntegracion?: IntegrationMode;
}): DocumentoTributario {
  const monto = Math.max(0, Math.min(input.monto, input.original.total));
  const ratio = input.original.total > 0 ? monto / input.original.total : 0;
  return {
    id: safeId('NC'),
    operacion: 'ajuste',
    folioInterno: buildInternalFolio('NC', new Date().toISOString().slice(0, 10), input.original.id),
    tipoDocumento: 'nota_credito',
    estado: 'pendiente_emision',
    neto: Math.round(input.original.neto * ratio),
    iva: Math.round(input.original.iva * ratio),
    exento: Math.round(input.original.exento * ratio),
    total: monto,
    periodoTributario: periodoTributarioFromDate(new Date().toISOString().slice(0, 10)),
    clienteId: input.original.clienteId,
    proveedorId: input.original.proveedorId,
    documentoReferenciaId: input.original.id,
    modoIntegracion: input.modoIntegracion ?? input.original.modoIntegracion,
    observacion: input.motivo,
    payloadResumen: {
      tipo: input.parcial ? 'parcial' : 'total',
      devuelve_stock: Boolean(input.devuelveStock),
      motivo: input.motivo,
    },
  };
}

export function prepareF29(input: {
  documentos: DocumentoTributario[];
  periodo: string;
  ppmTasa: number;
  pagosPOS?: PagoPOS[];
}): F29Preparador {
  const docsPeriodo = input.documentos.filter(d => d.periodoTributario === input.periodo);
  const docsValidos = docsPeriodo.filter(d => ['emitido_interno', 'registrado_externamente', 'aceptado_sii', 'observado', 'pendiente_emision'].includes(d.estado));
  const ventas = docsValidos.filter(d => d.operacion === 'venta');
  const compras = docsValidos.filter(d => d.operacion === 'compra');
  const notasCredito = docsValidos.filter(d => d.tipoDocumento === 'nota_credito');

  const ivaDebito = ventas
    .filter(d => createsIvaDebit(d.tipoDocumento))
    .reduce((acc, d) => acc + d.iva, 0);
  const ivaCredito = compras
    .filter(d => d.tipoDocumento === 'factura_electronica')
    .reduce((acc, d) => acc + d.iva, 0);
  const ivaNotasCredito = notasCredito.reduce((acc, d) => acc + d.iva, 0);
  const ventasNetas = ventas
    .filter(d => createsIvaDebit(d.tipoDocumento))
    .reduce((acc, d) => acc + d.neto, 0);
  const montoExento = docsValidos.reduce((acc, d) => acc + d.exento, 0);
  const diferenciaIva = Math.max(0, ivaDebito - ivaCredito - ivaNotasCredito);
  const ppm = Math.round(ventasNetas * ((input.ppmTasa || 0) / 100));
  const documentosPendientes = docsPeriodo.filter(d => ['borrador', 'pendiente_emision', 'observado', 'rechazado_sii'].includes(d.estado)).length;
  const ventasPOSConciliadas = (input.pagosPOS ?? []).filter(p => p.estadoConciliacion === 'conciliado' && p.fecha.slice(0, 7) === input.periodo).length;
  const alertas: string[] = [];

  if (documentosPendientes > 0) alertas.push(`${documentosPendientes} documento(s) requieren revision antes de declarar.`);
  if (notasCredito.length > 0) alertas.push('Existen notas de credito que ajustan IVA del periodo.');
  if (ventas.length === 0 && compras.length === 0) alertas.push('Periodo sin movimiento registrado en el ERP.');
  if (input.ppmTasa === 0) alertas.push('PPM configurado en 0%. Revisar con contador si corresponde.');

  return {
    periodo: input.periodo,
    ivaDebito,
    ivaCredito,
    ivaNotasCredito,
    montoExento,
    diferenciaIva,
    ppm,
    totalEstimado: diferenciaIva + ppm,
    documentosPendientes,
    notasCredito: notasCredito.length,
    ventasPOSConciliadas,
    alertas,
  };
}
