import { useEffect, useRef, useState, ChangeEvent, DragEvent } from 'react';
import * as XLSX from 'xlsx';
import { EstadoPago, MetodoPago, Producto, Venta, VentaProducto } from '../context/ERPContext';
import { DocumentType, IntegrationMode, isExemptDocument, normalizeDocumentType } from '../services/documentCompliance';
import {
  ESTADOS, EXTENSIONES, METODOS_PAGO, descargarLibroPlantilla, elegirEnum, extensionValida,
  formatPesos, mapearColumnas, normKey, parseFecha, parseNumero,
} from './cargaMasivaUtil';

interface ModalCargaMasivaVentasProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (ventas: Omit<Venta, 'id'>[]) => void;
  ventasExistentes: Venta[];
  inventario: Producto[];
  modoIntegracion: IntegrationMode;
}

type CampoClave = 'folio' | 'fecha' | 'rut' | 'cliente' | 'tipoDocumento' | 'codigo' | 'descripcion'
  | 'cantidad' | 'precio' | 'descuento' | 'estado' | 'metodoPago' | 'nota';

interface GrupoVenta {
  clave: string;
  folio: string;
  fecha: string;
  cliente: string;
  tipoDocumento: DocumentType;
  estado: EstadoPago;
  metodoPago: MetodoPago;
  nota: string;
  items: VentaProducto[];
  errores: string[];
}

interface VentaPrevia {
  clave: string;
  folio: string;
  fecha: string;
  cliente: string;
  tipoDocumento: DocumentType;
  items: number;
  subtotal: number;
  iva: number;
  total: number;
  estado: EstadoPago;
  metodoPago: MetodoPago;
  existe: boolean;
  errores: string[];
  venta: Omit<Venta, 'id'>;
}

const COLUMNAS: { campo: CampoClave; titulo: string; obligatorio: boolean; ayuda: string }[] = [
  { campo: 'folio', titulo: 'Folio', obligatorio: false, ayuda: 'Agrupa varias filas en una misma venta. Si va vacío, cada fila es una venta independiente.' },
  { campo: 'fecha', titulo: 'Fecha', obligatorio: true, ayuda: 'Formato aaaa-mm-dd o dd-mm-aaaa.' },
  { campo: 'rut', titulo: 'RUT Cliente', obligatorio: false, ayuda: 'Opcional. Se usa como nombre si no hay Razón Social.' },
  { campo: 'cliente', titulo: 'Razón Social', obligatorio: true, ayuda: 'Nombre del cliente. Si el cliente ya existe en Ventas se reutiliza.' },
  { campo: 'tipoDocumento', titulo: 'Tipo Documento', obligatorio: false, ayuda: 'boleta_electronica (por defecto), factura_electronica, boleta_exenta o factura_exenta.' },
  { campo: 'codigo', titulo: 'Código Producto', obligatorio: false, ayuda: 'Debe existir en Inventario: permite descontar stock y conocer el costo.' },
  { campo: 'descripcion', titulo: 'Descripción', obligatorio: true, ayuda: 'Obligatoria solo si no informas Código Producto.' },
  { campo: 'cantidad', titulo: 'Cantidad', obligatorio: false, ayuda: 'Por defecto 1.' },
  { campo: 'precio', titulo: 'Precio Unitario', obligatorio: true, ayuda: 'Precio de cada unidad, IVA incluido.' },
  { campo: 'descuento', titulo: 'Descuento %', obligatorio: false, ayuda: 'Descuento sobre el bruto de la línea. Por defecto 0.' },
  { campo: 'estado', titulo: 'Estado', obligatorio: false, ayuda: 'Pagado (por defecto) o Pendiente.' },
  { campo: 'metodoPago', titulo: 'Método de Pago', obligatorio: false, ayuda: 'efectivo (por defecto), transferencia, debito, credito, mixto o cheque.' },
  { campo: 'nota', titulo: 'Nota', obligatorio: false, ayuda: 'Observación interna de la venta.' },
];

const ALIAS: Record<CampoClave, string[]> = {
  folio: ['folio', 'nrodocto', 'nrodocumento', 'nrodocto', 'numerodocumento', 'numdocumento', 'ndoc', 'n', 'documento', 'idventa'],
  fecha: ['fecha', 'fechaventa', 'fechaemision', 'fechaemisiondoc', 'fechav', 'f'],
  rut: ['rut', 'rutcliente', 'rutreceptor', 'rutempresa', 'r'],
  cliente: ['razonsocial', 'cliente', 'nombrecliente', 'nombre', 'receptor', 'empresa', 'razon', 'clienteempresa'],
  tipoDocumento: ['tipodocumento', 'tipodocto', 'tipodoc', 'tipo', 'tipocomprobante'],
  codigo: ['codigoproducto', 'codigo', 'codigosku', 'sku', 'codigobarras', 'codigointerno', 'idproducto'],
  descripcion: ['descripcion', 'producto', 'detalle', 'nombreproducto', 'concepto', 'item'],
  cantidad: ['cantidad', 'cant', 'cants', 'unidades', 'cantidadunidades', 'q'],
  precio: ['preciounitario', 'precio', 'preciounid', 'valorunitario', 'pu', 'preciounidad', 'p'],
  descuento: ['descuento', 'descuentoporcentaje', 'descuento%', 'dctopct', 'dcto', 'desc'],
  estado: ['estado', 'estadopago', 'estadoweb', 'condicionpago', 'estadoventa'],
  metodoPago: ['metodopago', 'metododepago', 'formapago', 'formadepago', 'mediopago', 'medio', 'tipopago', 'mp'],
  nota: ['nota', 'notas', 'observacion', 'observaciones', 'comentario', 'comentarios'],
};

/** En Ventas "por pagar" es un estado de cobranza pendiente, no un saldo por pagar. */
const ESTADOS_VENTA: { valor: EstadoPago; alias: string[] }[] = ESTADOS.map(e =>
  e.valor === 'Pendiente'
    ? { valor: e.valor, alias: [...e.alias, 'porpagar', 'por pagar', 'deuda', 'credito'] }
    : e
);

const TIPOS_DOC: { valor: DocumentType; alias: string[] }[] = [
  { valor: 'factura_exenta', alias: ['facturaexenta', 'facturaexentaoafectaiva', '34', 'fe'] },
  { valor: 'boleta_exenta', alias: ['boletaexenta', 'boletaexentaoafectaiva', '41', 'be'] },
  { valor: 'factura_electronica', alias: ['facturaelectronica', 'factura', '33'] },
  { valor: 'boleta_electronica', alias: ['boletaelectronica', 'boleta', '39'] },
];

/** Igual que el cálculo de ítems del formulario de venta: precio con IVA incluido por defecto.
 *  Un documento exento no desglosa IVA: el monto completo queda como monto exento. */
function calcularItem(precio: number, cantidad: number, descuentoPct: number, incluyeIva: boolean, exento = false) {
  const d = Math.min(Math.max(descuentoPct, 0), 100);
  const base = Math.max(0, precio * cantidad - precio * cantidad * (d / 100));
  if (exento) return { subtotal: base, iva: 0, total: base };
  if (incluyeIva) {
    const subtotal = Math.round(base / 1.19);
    return { subtotal, iva: base - subtotal, total: base };
  }
  const iva = Math.round(base * 0.19);
  return { subtotal: base, iva, total: base + iva };
}

function buscarProducto(codigo: unknown, descripcion: unknown, inventario: Producto[]): Producto | null {
  const c = normKey(codigo);
  if (c) {
    const porCodigo = inventario.find(p => normKey(p.codigo) === c
      || normKey(p.codigoBarras) === c
      || normKey(p.id) === c);
    if (porCodigo) return porCodigo;
  }
  const d = normKey(descripcion);
  if (d) {
    const porNombre = inventario.find(p => normKey(p.nombre) === d);
    if (porNombre) return porNombre;
  }
  return null;
}

function descargarPlantilla() {
  descargarLibroPlantilla(
    'plantilla_ventas.xlsx',
    'Ventas',
    [
      COLUMNAS.map(c => c.titulo),
      ['1001', '2026-09-01', '76.123.456-7', 'CLIENTE EJEMPLO SPA', 'boleta_electronica', 'PROD-001', 'Servicio de ejemplo', 2, 5000, 0, 'Pagado', 'efectivo', 'Venta de ejemplo'],
      ['1001', '2026-09-01', '76.123.456-7', 'CLIENTE EJEMPLO SPA', 'boleta_electronica', '', 'Ítem libre sin stock', 1, 11900, 10, 'Pagado', 'efectivo', 'Segunda línea del mismo folio'],
      ['1002', '02-09-2026', '99.888.777-6', 'OTRA EMPRESA LTDA', 'factura_electronica', '', 'Servicio mensual', 1, 250000, 0, 'Pendiente', 'transferencia', ''],
    ],
    COLUMNAS.map(c => ({ wch: Math.max(14, c.titulo.length + 4) })),
    [
      ['Columna', 'Obligatorio', 'Descripcion'],
      ...COLUMNAS.map(c => [c.titulo, c.obligatorio ? 'Si' : 'No', c.ayuda]),
      [],
      ['Como agrupar', '', 'Repite el mismo Folio en varias filas para sumar esas lineas en una sola venta.'],
      ['Sin Folio', '', 'Cada fila se importa como una venta independiente.'],
      ['Stock', '', 'Un Codigo Producto existente en Inventario descuenta stock; el resto se registra como texto libre.'],
      ['IVA', '', 'El Precio Unitario se interpreta con IVA incluido (19%), igual que el formulario de venta.'],
      ['Exentas', '', 'Los tipos *_exenta no generan IVA y se registran como monto exento.'],
    ],
    [{ wch: 20 }, { wch: 14 }, { wch: 95 }]
  );
}

export default function ModalCargaMasivaVentas({
  isOpen, onClose, onImport, ventasExistentes, inventario, modoIntegracion
}: ModalCargaMasivaVentasProps) {
  const [arrastrando, setArrastrando] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previas, setPrevias] = useState<VentaPrevia[]>([]);
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragContador = useRef(0);

  useEffect(() => {
    if (isOpen) return;
    setArchivo(null);
    setPrevias([]);
    setSeleccionadas(new Set());
    setError(null);
    setArrastrando(false);
    dragContador.current = 0;
  }, [isOpen]);

  const procesar = (file: File) => {
    if (!extensionValida(file.name)) {
      setArchivo(null);
      setPrevias([]);
      setError('Formato no admitido. Solo se aceptan archivos .xlsx de la plantilla de descarga.');
      return;
    }
    setArchivo(file);
    setError(null);
    setCargando(true);
    setPrevias([]);
    setSeleccionadas(new Set());

    const reader = new FileReader();
    reader.onload = evento => {
      try {
        const buffer = evento.target?.result as ArrayBuffer;
        // raw:true evita que el lector adivine valores en CSV: "01-09-2026" debe leerse
        // dd-mm-aaaa (formato Chile) y "5.950" como miles, no como decimal.
        const libro = XLSX.read(buffer, { type: 'array', cellDates: true, raw: true });
        const hoja = libro.Sheets[libro.SheetNames[0]];
        if (!hoja) throw new Error('El archivo no contiene hojas de cálculo.');

        const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, blankrows: false, defval: '' });
        if (filas.length < 2) throw new Error('La hoja está vacía: necesitas el encabezado y al menos una venta.');

        // La fila de encabezados se ubica por la columna de precio: aunque el archivo traiga
        // titulos, logos o notas arriba, la carga se entiende igual que la plantilla.
        const indiceEncabezado = filas.findIndex(fila => mapearColumnas(fila, ALIAS).precio >= 0);
        if (indiceEncabezado < 0) {
          throw new Error('No se reconoce el encabezado. Descarga la plantilla y copia sus columnas.');
        }

        const columnas = mapearColumnas(filas[indiceEncabezado], ALIAS);
        const celda = (fila: unknown[], campo: CampoClave) => {
          const i = columnas[campo];
          return i >= 0 ? fila[i] ?? '' : '';
        };

        const hoy = new Date().toISOString().split('T')[0];
        const grupos = new Map<string, GrupoVenta>();

        filas.slice(indiceEncabezado + 1).forEach((fila, offset) => {
          const numeroFila = indiceEncabezado + offset + 2;
          if (!fila.some(v => String(v ?? '').trim() !== '')) return;

          const folio = String(celda(fila, 'folio') ?? '').trim();
          const fecha = parseFecha(celda(fila, 'fecha'));
          const rut = String(celda(fila, 'rut') ?? '').trim();
          const cliente = String(celda(fila, 'cliente') ?? '').trim() || rut;
          const descripcion = String(celda(fila, 'descripcion') ?? '').trim();
          const codigo = celda(fila, 'codigo');
          const cantidad = parseNumero(celda(fila, 'cantidad')) || 1;
          const precio = parseNumero(celda(fila, 'precio'));
          const descuento = parseNumero(celda(fila, 'descuento'));
          const tipoDocumento = normalizeDocumentType(elegirEnum(celda(fila, 'tipoDocumento'), TIPOS_DOC, 'boleta_electronica'));
          const estado = elegirEnum(celda(fila, 'estado'), ESTADOS_VENTA, 'Pagado');
          const metodoPago = elegirEnum(celda(fila, 'metodoPago'), METODOS_PAGO, 'efectivo');
          const nota = String(celda(fila, 'nota') ?? '').trim();

          const producto = buscarProducto(codigo, descripcion, inventario);
          const errores: string[] = [];
          if (!fecha) errores.push('Fecha vacía o con formato inválido');
          if (!cliente) errores.push('Falta Razón Social del cliente');
          if (!descripcion && !producto) errores.push('Falta Descripción y Código Producto');
          if (cantidad <= 0) errores.push('Cantidad debe ser mayor a 0');
          if (precio <= 0) errores.push('Precio Unitario debe ser mayor a 0');

          const exenta = isExemptDocument(tipoDocumento);
          const calculo = calcularItem(precio, cantidad, descuento, producto ? !!producto.incluyeIva : true, exenta);
          const item: VentaProducto = {
            productoId: producto ? producto.id : `TEXTO-LIBRE-${numeroFila}-${normKey(descripcion).slice(0, 8) || 'item'}`,
            productoNombre: producto?.nombre || descripcion || 'Ítem sin descripción',
            esInventariable: !!producto && producto.tipo === 'producto',
            cantidad,
            precioBase: precio,
            costoUnitario: producto?.costo ?? 0,
            descuentoTipo: descuento > 0 ? 'porcentaje' : 'ninguno',
            descuentoValor: descuento > 0 ? descuento : 0,
            /** Mismo valor por defecto que la carga manual. */
            categoria: producto?.categoria || 'Sin categoria',
            subtotal: calculo.subtotal,
            iva: calculo.iva,
            total: calculo.total,
          };

          // Sin Folio cada fila es una venta independiente; con Folio se acumulan las líneas.
          const clave = folio ? `F:${folio}` : `L${numeroFila}`;
          const grupo = grupos.get(clave);
          if (grupo) {
            grupo.items.push(item);
            grupo.errores.push(...errores.map(e => `Fila ${numeroFila}: ${e}`));
            if (!grupo.fecha && fecha) grupo.fecha = fecha;
            if (!grupo.cliente && cliente) grupo.cliente = cliente;
            if (!grupo.nota && nota) grupo.nota = nota;
            if (estado === 'Pendiente') grupo.estado = 'Pendiente';
          } else {
            grupos.set(clave, {
              clave,
              folio,
              fecha,
              cliente,
              tipoDocumento,
              estado,
              metodoPago,
              nota,
              items: [item],
              errores: errores.map(e => `Fila ${numeroFila}: ${e}`),
            });
          }
        });

        const lista: VentaPrevia[] = [...grupos.values()].map(g => {
          const subtotal = g.items.reduce((acc, i) => acc + i.subtotal, 0);
          const iva = g.items.reduce((acc, i) => acc + i.iva, 0);
          const total = g.items.reduce((acc, i) => acc + i.total, 0);
          const pendiente = g.estado === 'Pendiente' ? total : 0;
          const fecha = g.fecha || hoy;
          const cliente = g.cliente || 'Cliente General';
          return {
            clave: g.clave,
            folio: g.folio,
            fecha,
            cliente,
            tipoDocumento: g.tipoDocumento,
            items: g.items.length,
            subtotal,
            iva,
            total,
            estado: g.estado,
            metodoPago: g.metodoPago,
            // El Folio queda trazado en la nota: permite detectar y no repetir una carga.
            existe: !!g.folio && ventasExistentes.some(v =>
              v.fecha === fecha && !!v.nota && v.nota.includes(`Folio masiva: ${g.folio}`)),
            errores: g.errores,
            venta: {
              fecha,
              cliente,
              productos: g.items,
              subtotal,
              iva,
              monto: total,
              estado: g.estado,
              tipo_documento: g.tipoDocumento,
              metodo_pago: g.metodoPago,
              modo_integracion: modoIntegracion,
              saldo_base: pendiente,
              saldo_pendiente: pendiente,
              monto_efectivo: g.estado === 'Pagado' && g.metodoPago === 'efectivo' ? total : undefined,
              monto_digital: g.estado === 'Pagado' && g.metodoPago !== 'efectivo' ? total : undefined,
              nota: `${g.nota ? `${g.nota} ` : ''}${g.folio ? `Folio masiva: ${g.folio}` : ''}`.trim() || undefined,
            },
          };
        });

        setPrevias(lista);
        setSeleccionadas(new Set(lista.filter(p => p.errores.length === 0 && !p.existe).map(p => p.clave)));
        setCargando(false);
        if (lista.length === 0) setError('El archivo no tiene filas con datos de venta.');
      } catch (err) {
        setPrevias([]);
        setCargando(false);
        setError(err instanceof Error ? err.message : 'No se pudo leer el archivo.');
      }
    };
    reader.onerror = () => {
      setCargando(false);
      setError('No se pudo leer el archivo.');
    };
    reader.readAsArrayBuffer(file);
  };

  const recibirArchivo = (file?: File) => {
    if (!file) return;
    procesar(file);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => recibirArchivo(e.target.files?.[0]);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (cargando) return;
    setArrastrando(true);
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragContador.current += 1;
    if (!cargando) setArrastrando(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragContador.current = Math.max(0, dragContador.current - 1);
    if (dragContador.current === 0) setArrastrando(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragContador.current = 0;
    setArrastrando(false);
    recibirArchivo(e.dataTransfer.files?.[0]);
  };

  const alternarSeleccion = (clave: string) => {
    setSeleccionadas(prev => {
      const nuevo = new Set(prev);
      if (nuevo.has(clave)) nuevo.delete(clave);
      else nuevo.add(clave);
      return nuevo;
    });
  };

  const importables = previas.filter(p => p.errores.length === 0 && !p.existe);
  const aImportar = importables.filter(p => seleccionadas.has(p.clave));

  const confirmar = () => {
    onImport(aImportar.map(p => p.venta));
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-surface/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col border border-outline-variant/40">
        <div className="p-6 border-b border-outline-variant/30 flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-black text-primary">Carga Masiva de Ventas</h3>
            <p className="text-on-surface-variant text-sm mt-1">Importa múltiples ventas desde Excel o CSV en un solo paso.</p>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-error transition-colors">
            <span className="material-symbols-outlined text-3xl">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!archivo && (
            <div
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center transition-all ${arrastrando ? 'border-primary bg-primary/5' : 'border-outline-variant/50 hover:border-primary/40'}`}
            >
              <span className="material-symbols-outlined text-6xl text-primary mb-4">cloud_upload</span>
              <h4 className="text-xl font-bold text-on-surface mb-2">Arrastra tu archivo aquí</h4>
              <p className="text-on-surface-variant mb-4">o</p>
              <button onClick={() => inputRef.current?.click()} className="px-6 py-3 bg-primary text-inverse-on-surface rounded-full font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
                Seleccionar archivo
              </button>
              <input ref={inputRef} type="file" accept={EXTENSIONES.join(',')} onChange={handleInputChange} className="hidden" />
              <p className="text-xs text-on-surface-variant mt-4">Formato permitido: .xlsx (plantilla de descarga)</p>
              <button onClick={descargarPlantilla} className="mt-6 flex items-center gap-2 px-5 py-2 bg-surface-container-lowest border border-outline-variant/40 rounded-full text-sm font-bold hover:bg-surface-container-low transition-all">
                <span className="material-symbols-outlined text-lg">download</span>
                Descargar Plantilla
              </button>
            </div>
          )}

          {archivo && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-surface-container-low rounded-xl border border-outline-variant/30">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-3xl text-primary">description</span>
                  <div>
                    <p className="font-bold text-on-surface">{archivo.name}</p>
                    <p className="text-xs text-on-surface-variant">{(archivo.size / 1024).toFixed(2)} KB</p>
                  </div>
                </div>
                <button onClick={() => { setPrevias([]); setArchivo(null); setError(null); }} className="flex items-center gap-2 px-4 py-2 bg-surface-container-lowest border border-outline-variant/40 rounded-full text-sm font-bold hover:bg-error/10 hover:text-error transition-all">
                  <span className="material-symbols-outlined text-lg">close</span>
                  Cambiar archivo
                </button>
              </div>

              {cargando && (
                <div className="flex flex-col items-center justify-center py-10">
                  <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                  <p className="text-on-surface-variant mt-4 font-medium">Procesando archivo...</p>
                </div>
              )}

              {error && (
                <div className="p-4 bg-error-container text-on-error-container rounded-xl flex items-start gap-3">
                  <span className="material-symbols-outlined mt-0.5">error</span>
                  <p className="text-sm font-medium whitespace-pre-wrap">{error}</p>
                </div>
              )}

              {!cargando && !error && previas.length > 0 && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-lg font-bold text-on-surface">{previas.length} ventas detectadas</p>
                      <p className="text-sm text-on-surface-variant">
                        {seleccionadas.size} seleccionadas para importar · {previas.filter(p => p.existe).length} ya existen · {previas.filter(p => p.errores.length > 0).length} con errores
                      </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => setSeleccionadas(new Set(importables.map(p => p.clave)))} className="px-4 py-2 bg-surface-container-lowest border border-outline-variant/40 rounded-full text-sm font-bold hover:bg-primary/5 transition-all">
                        Seleccionar válidas
                      </button>
                      <button onClick={() => setSeleccionadas(new Set())} className="px-4 py-2 bg-surface-container-lowest border border-outline-variant/40 rounded-full text-sm font-bold hover:bg-surface-container-low transition-all">
                        Limpiar selección
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto max-h-[40vh] border border-outline-variant/30 rounded-xl">
                    <table className="w-full text-sm">
                      <thead className="bg-surface-container sticky top-0 z-10">
                        <tr>
                          <th className="px-4 py-3 text-left font-bold text-on-surface-variant">Importar</th>
                          <th className="px-4 py-3 text-left font-bold text-on-surface-variant">Folio</th>
                          <th className="px-4 py-3 text-left font-bold text-on-surface-variant">Fecha</th>
                          <th className="px-4 py-3 text-left font-bold text-on-surface-variant">Cliente</th>
                          <th className="px-4 py-3 text-center font-bold text-on-surface-variant">Líneas</th>
                          <th className="px-4 py-3 text-right font-bold text-on-surface-variant">Total</th>
                          <th className="px-4 py-3 text-center font-bold text-on-surface-variant">Estado</th>
                          <th className="px-4 py-3 text-left font-bold text-on-surface-variant">Observaciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previas.map(p => {
                          const bloqueada = p.existe || p.errores.length > 0;
                          const checked = seleccionadas.has(p.clave);
                          return (
                            <tr key={p.clave} className={`border-b border-outline-variant/20 ${bloqueada ? 'bg-surface/60 opacity-70' : 'hover:bg-surface-container-low/60'}`}>
                              <td className="px-4 py-2">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={bloqueada}
                                  onChange={() => alternarSeleccion(p.clave)}
                                  className="w-4 h-4 accent-primary"
                                />
                              </td>
                              <td className="px-4 py-2 font-bold text-primary">{p.folio || '—'}</td>
                              <td className="px-4 py-2 text-on-surface-variant whitespace-nowrap">{p.fecha}</td>
                              <td className="px-4 py-2 max-w-[200px] truncate font-medium" title={p.cliente}>{p.cliente}</td>
                              <td className="px-4 py-2 text-center text-on-surface-variant">{p.items}</td>
                              <td className="px-4 py-2 text-right font-black text-on-surface whitespace-nowrap">{formatPesos(p.total)}</td>
                              <td className="px-4 py-2 text-center">
                                {p.errores.length > 0 ? (
                                  <span className="px-2 py-0.5 bg-error-container text-on-error-container rounded-full text-[10px] font-black uppercase">Revisar</span>
                                ) : p.existe ? (
                                  <span className="px-2 py-0.5 bg-surface-container text-on-surface-variant rounded-full text-[10px] font-black uppercase">Ya existe</span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-success-container text-on-success-container rounded-full text-[10px] font-black uppercase">Nuevo</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-xs">
                                {p.existe && <span className="block text-on-surface-variant font-semibold">Ya existe una venta con este Folio en la misma fecha.</span>}
                                {p.errores.map((e, i) => (
                                  <span key={i} className="block text-error">{e}</span>
                                ))}
                                {!p.existe && p.errores.length === 0 && <span className="text-success">Listo para importar</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {!cargando && !error && previas.length === 0 && (
                <div className="text-center py-10">
                  <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">inbox</span>
                  <p className="text-on-surface-variant font-medium">No se encontraron filas con datos para procesar.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {archivo && !cargando && previas.length > 0 && (
          <div className="p-6 border-t border-outline-variant/30 flex flex-wrap justify-between items-center gap-4 bg-surface-container-low">
            <p className="text-sm text-on-surface-variant">{seleccionadas.size} ventas seleccionadas para importar</p>
            <div className="flex gap-3">
              <button onClick={onClose} className="px-6 py-2.5 bg-surface-container-lowest border border-outline-variant/40 rounded-full font-bold hover:bg-surface-container-low transition-all">
                Cancelar
              </button>
              <button
                onClick={confirmar}
                disabled={aImportar.length === 0}
                className="px-6 py-2.5 bg-primary text-inverse-on-surface rounded-full font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">download</span>
                Importar {aImportar.length > 0 ? `(${aImportar.length})` : ''}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
