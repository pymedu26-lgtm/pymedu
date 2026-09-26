import { useEffect, useRef, useState, ChangeEvent, DragEvent } from 'react';
import * as XLSX from 'xlsx';
import { EstadoPago, MetodoPago, Producto, Venta, VentaProducto } from '../context/ERPContext';
import { DocumentType, IntegrationMode, isExemptDocument, normalizeDocumentType } from '../services/documentCompliance';

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

const EXTENSIONES = ['.xlsx', '.xls', '.xlsm', '.csv'];

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

const TIPOS_DOC: { valor: DocumentType; alias: string[] }[] = [
  { valor: 'factura_exenta', alias: ['facturaexenta', 'facturaexentaoafectaiva', '34', 'fe'] },
  { valor: 'boleta_exenta', alias: ['boletaexenta', 'boletaexentaoafectaiva', '41', 'be'] },
  { valor: 'factura_electronica', alias: ['facturaelectronica', 'factura', '33'] },
  { valor: 'boleta_electronica', alias: ['boletaelectronica', 'boleta', '39'] },
];

const METODOS_PAGO: { valor: MetodoPago; alias: string[] }[] = [
  { valor: 'efectivo', alias: ['efectivo', 'cash', 'efectivopago'] },
  { valor: 'transferencia', alias: ['transferencia', 'transferenciaelectronica', 'bancotransferencia'] },
  { valor: 'debito', alias: ['debito', 'tarjetadebito', 'debitocredito'] },
  { valor: 'credito', alias: ['credito', 'tarjetacredito', 'creditocredito'] },
  { valor: 'cheque', alias: ['cheque', 'cheques'] },
  { valor: 'mixto', alias: ['mixto', 'multiple', 'varios'] },
];

const ESTADOS: { valor: EstadoPago; alias: string[] }[] = [
  { valor: 'Pagado', alias: ['pagado', 'pagada', 'paid', 'cancelado', 'cobrado'] },
  { valor: 'Pendiente', alias: ['pendiente', 'porpagar', 'pendientedepago', 'deuda', 'unpaid'] },
];

/** Normaliza un encabezado para comparar sin tildes, espacios ni signos. */
function normKey(valor: unknown): string {
  return String(valor ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Detecta si el archivo tiene extensión compatible con Excel/CSV. */
function extensionValida(nombre: string): boolean {
  const ext = nombre.slice(nombre.lastIndexOf('.')).toLowerCase();
  return EXTENSIONES.includes(ext);
}

function pad2(n: number | string): string {
  return String(n).padStart(2, '0');
}

function aISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Serial de Excel (días desde 1899-12-30) → aaaa-mm-dd. */
function serialAISO(serial: number): string {
  const d = new Date(Math.round((serial - 25569) * 86400000));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Acepta Date de Excel, serial numérico y texto en formatos Chilean, ISO o compacto. */
function parseFecha(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '';
  if (valor instanceof Date) return isNaN(valor.getTime()) ? '' : aISO(valor);
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    return valor < 20000 || valor > 60000 ? '' : serialAISO(valor);
  }
  const texto = String(valor).trim();
  let m = texto.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  m = texto.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
  m = texto.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (/^\d{5}$/.test(texto)) return serialAISO(Number(texto));
  // Cualquier otro texto numerico no es una fecha: se descarta en vez de inventar una.
  if (/^-?\d+([.,]\d+)?$/.test(texto)) return '';
  const d = new Date(texto);
  return isNaN(d.getTime()) ? '' : aISO(d);
}

/** Interpreta montos con separadores chilenos: "1.234,56", "5.950", "$1.234", 1234.56. */
function parseNumero(valor: unknown): number {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  let s = String(valor ?? '').trim().replace(/[$€\s]/g, '');
  if (!s) return 0;
  const negativo = s.startsWith('-');
  if (negativo || s.startsWith('+')) s = s.slice(1);
  const tieneComa = s.includes(',');
  const tienePunto = s.includes('.');
  if (tieneComa && tienePunto) {
    // Ambos separadores: el último es el decimal (1.234,56 en Chile / 1,234.56 en inglés).
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (tieneComa) {
    s = s.split(',').length > 2 || /,\d{3}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (tienePunto) {
    // Puntos de miles (1.234 / 1.234.567). Excepción: 0.xxx sigue siendo un decimal.
    s = s.split('.').length > 2 || (/^\d+\.\d{3}$/.test(s) && !s.startsWith('0.'))
      ? s.replace(/\./g, '')
      : s;
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return negativo ? -n : n;
}

function elegirEnum<T extends string>(valor: unknown, opciones: { valor: T; alias: string[] }[], defecto: T): T {
  const clave = normKey(valor);
  if (!clave) return defecto;
  const encontrada = opciones.find(o => o.alias.some(a => normKey(a) === clave));
  return encontrada ? encontrada.valor : defecto;
}

/** Resuelve el índice de cada columna del archivo tolerando nombres alternativos. */
function mapearColumnas(encabezados: unknown[]): Record<CampoClave, number> {
  const mapa = {} as Record<CampoClave, number>;
  (Object.keys(ALIAS) as CampoClave[]).forEach(campo => {
    const indice = encabezados.findIndex(h => ALIAS[campo].some(a => normKey(a) === normKey(h)));
    mapa[campo] = indice;
  });
  return mapa;
}

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
  const aoa: (string | number)[][] = [
    COLUMNAS.map(c => c.titulo),
    ['1001', '2026-09-01', '76.123.456-7', 'CLIENTE EJEMPLO SPA', 'boleta_electronica', 'PROD-001', 'Servicio de ejemplo', 2, 5000, 0, 'Pagado', 'efectivo', 'Venta de ejemplo'],
    ['1001', '2026-09-01', '76.123.456-7', 'CLIENTE EJEMPLO SPA', 'boleta_electronica', '', 'Ítem libre sin stock', 1, 11900, 10, 'Pagado', 'efectivo', 'Segunda línea del mismo folio'],
    ['1002', '02-09-2026', '99.888.777-6', 'OTRA EMPRESA LTDA', 'factura_electronica', '', 'Servicio mensual', 1, 250000, 0, 'Pendiente', 'transferencia', ''],
  ];
  const hoja = XLSX.utils.aoa_to_sheet(aoa);
  hoja['!cols'] = COLUMNAS.map(c => ({ wch: Math.max(14, c.titulo.length + 4) }));
  hoja['!autofilter'] = { ref: hoja['!ref'] ?? 'A1:M1' };

  const instrucciones = XLSX.utils.aoa_to_sheet([
    ['Columna', 'Obligatorio', 'Descripcion'],
    ...COLUMNAS.map(c => [c.titulo, c.obligatorio ? 'Si' : 'No', c.ayuda]),
    [],
    ['Como agrupar', '', 'Repite el mismo Folio en varias filas para sumar esas lineas en una sola venta.'],
    ['Sin Folio', '', 'Cada fila se importa como una venta independiente.'],
    ['Stock', '', 'Un Codigo Producto existente en Inventario descuenta stock; el resto se registra como texto libre.'],
    ['IVA', '', 'El Precio Unitario se interpreta con IVA incluido (19%), igual que el formulario de venta.'],
    ['Exentas', '', 'Los tipos *_exenta no generan IVA y se registran como monto exento.'],
  ]);
  instrucciones['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 95 }];

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Ventas');
  XLSX.utils.book_append_sheet(libro, instrucciones, 'Instrucciones');

  const datos = XLSX.write(libro, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([datos], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'plantilla_ventas.xlsx';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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
      setError(`Formato no soportado. Usa un archivo ${EXTENSIONES.join(', ')}.`);
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
        const indiceEncabezado = filas.findIndex(fila => mapearColumnas(fila).precio >= 0);
        if (indiceEncabezado < 0) {
          throw new Error('No se reconoce el encabezado. Descarga la plantilla y copia sus columnas.');
        }

        const columnas = mapearColumnas(filas[indiceEncabezado]);
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
          const estado = elegirEnum(celda(fila, 'estado'), ESTADOS, 'Pagado');
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
  const conProblemas = previas.filter(p => p.errores.length > 0 || p.existe);

  const confirmar = () => {
    onImport(aImportar.map(p => p.venta));
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="px-6 py-4 border-b border-outline-variant/20 flex justify-between items-center bg-surface-container-low/50">
          <div>
            <h3 className="text-xl font-bold text-primary">Carga Masiva de Ventas</h3>
            <p className="text-xs text-slate-500 mt-1">Sube tu Excel con muchas ventas a la vez usando nuestra plantilla.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-error transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-grow space-y-5">
          <input
            ref={inputRef}
            type="file"
            onChange={handleInputChange}
            accept={EXTENSIONES.join(',')}
            className="hidden"
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 rounded-2xl border border-outline-variant/30 bg-slate-50 p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-emerald-700">table_view</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800">¿Primera vez cargando?</p>
                <p className="text-xs text-slate-500">Descarga la plantilla con las columnas y un ejemplo de venta por fila.</p>
              </div>
            </div>
            <button
              onClick={descargarPlantilla}
              className="px-5 py-4 bg-primary text-white rounded-2xl font-black text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">download_for_offline</span>
              Descargar plantilla
            </button>
          </div>

          {previas.length === 0 && (
            <div
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-3xl p-10 text-center transition-all cursor-pointer group ${
                arrastrando
                  ? 'border-primary bg-primary/10 scale-[1.01]'
                  : 'border-outline-variant/50 hover:bg-primary/5 hover:border-primary/30'
              }`}
            >
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto transition-colors ${arrastrando ? 'bg-primary/15' : 'bg-slate-100'}`}>
                <span className={`material-symbols-outlined text-4xl ${arrastrando ? 'text-primary animate-bounce' : 'text-slate-300 group-hover:text-primary'}`}>
                  {cargando ? 'hourglass_top' : 'cloud_upload'}
                </span>
              </div>
              <p className="mt-4 text-slate-700 font-bold">
                {cargando ? 'Leyendo archivo…' : arrastrando ? 'Suelta el archivo aquí' : 'Arrastra tu archivo Excel aquí'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                o haz clic para buscarlo en tus carpetas · Formatos: {EXTENSIONES.join(', ')}
              </p>
            </div>
          )}

          {previas.length > 0 && (
            <div className="flex flex-wrap justify-between items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div className="flex items-center gap-3 min-w-0">
                <span className="material-symbols-outlined text-primary">description</span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{archivo?.name}</p>
                  <p className="text-xs text-slate-500">
                    {previas.length} ventas detectadas · {aImportar.length} por importar ·{' '}
                    {formatPesos(previas.reduce((acc, p) => acc + p.total, 0))} en total
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setPrevias([]); setArchivo(null); setError(null); }}
                  className="px-4 py-2 rounded-full text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
                >
                  Cambiar archivo
                </button>
                <button
                  onClick={descargarPlantilla}
                  className="px-4 py-2 rounded-full text-xs font-bold text-primary bg-white border border-primary/30 hover:bg-primary/5 transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">download_for_offline</span>
                  Plantilla
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="px-4 py-3 rounded-2xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">error</span>
              {error}
            </div>
          )}

          {previas.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSeleccionadas(new Set(importables.map(p => p.clave)))}
                  className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  Seleccionar todas
                </button>
                <button
                  onClick={() => setSeleccionadas(new Set())}
                  className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  Deseleccionar
                </button>
              </div>

              <div className="border border-outline-variant/30 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-sm text-left">
                  <thead className="bg-surface-container-low text-slate-500 font-bold text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 w-10"></th>
                      <th className="px-4 py-3">Folio</th>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3 text-center">Líneas</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {previas.map(p => {
                      const bloqueada = p.errores.length > 0 || p.existe;
                      return (
                        <tr key={p.clave} className={`hover:bg-slate-50/50 transition-colors ${bloqueada ? 'bg-slate-50/40' : ''}`}>
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={seleccionadas.has(p.clave)}
                              disabled={bloqueada}
                              onChange={() => alternarSeleccion(p.clave)}
                              className="accent-primary w-4 h-4 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="px-4 py-3 font-bold text-primary">{p.folio || '—'}</td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{p.fecha}</td>
                          <td className="px-4 py-3 truncate max-w-[200px] font-medium" title={p.cliente}>{p.cliente}</td>
                          <td className="px-4 py-3 text-center text-slate-500">{p.items}</td>
                          <td className="px-4 py-3 text-right font-black text-slate-800 whitespace-nowrap">{formatPesos(p.total)}</td>
                          <td className="px-4 py-3 text-center">
                            {p.errores.length > 0 ? (
                              <span title={p.errores.join(' | ')} className="inline-flex items-center gap-1 text-[9px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-black uppercase cursor-help">
                                <span className="material-symbols-outlined text-[10px]">error</span> Revisar
                              </span>
                            ) : p.existe ? (
                              <span className="inline-flex items-center gap-1 text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-black uppercase">
                                <span className="material-symbols-outlined text-[10px]">check_circle</span> Ya existe
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-black uppercase">
                                <span className="material-symbols-outlined text-[10px]">add_circle</span> Nuevo
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {conProblemas.length > 0 && (
                <details className="px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  <summary className="font-black cursor-pointer">
                    {conProblemas.length} venta(s) no se importarán — revisa los detalles
                  </summary>
                  <ul className="mt-3 space-y-2 max-h-40 overflow-y-auto pr-2">
                    {conProblemas.map(p => (
                      <li key={p.clave} className="bg-white/70 rounded-xl px-3 py-2">
                        <span className="font-bold">Folio {p.folio || '—'} · {p.cliente}</span>
                        <ul className="list-disc list-inside mt-1 text-amber-700">
                          {p.existe && <li>Ya existe una venta con este Folio en la misma fecha.</li>}
                          {p.errores.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-outline-variant/20 flex justify-end gap-3 bg-surface-container-low/50">
          <button onClick={onClose} className="px-6 py-2 rounded-full font-bold text-slate-600 hover:bg-slate-200/50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={aImportar.length === 0 || cargando}
            className="px-6 py-2 bg-primary text-white rounded-full font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">cloud_upload</span>
            Importar {aImportar.length} ventas
          </button>
        </div>
      </div>
    </div>
  );
}

function formatPesos(monto: number): string {
  return `$${Math.round(monto).toLocaleString('es-CL')}`;
}
