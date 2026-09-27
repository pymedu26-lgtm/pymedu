import { useRef, useState, ChangeEvent, DragEvent } from 'react';
import * as XLSX from 'xlsx';
import { EstadoPago, Gasto, MetodoPago, TipoDocumento } from '../context/ERPContext';
import { DocumentType } from '../services/documentCompliance';
import {
  ESTADOS, EXTENSIONES, METODOS_PAGO, descargarLibroPlantilla, elegirEnum, extensionValida,
  formatPesos, mapearColumnas, normKey, parseFecha, parseNumero,
} from './cargaMasivaUtil';

interface ModalCargaMasivaGastosProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (gastos: Partial<Gasto>[]) => void;
  gastosExistentes: Gasto[];
}

type CampoClave =
  | 'fecha' | 'proveedor' | 'rut' | 'categoria' | 'tipoDocumento' | 'folio'
  | 'monto' | 'subtotal' | 'iva' | 'estado' | 'metodoPago' | 'fechaVencimiento' | 'nota';

interface GastoPrevio {
  clave: string;
  fila: number;
  fecha: string;
  proveedor: string;
  folio: string;
  categoria: string;
  tipoDocumento: TipoDocumento;
  subtotal: number;
  iva: number;
  monto: number;
  estado: EstadoPago;
  metodoPago: MetodoPago;
  fechaVencimiento: string;
  nota: string;
  existe: boolean;
  errores: string[];
  gasto: Partial<Gasto>;
}

const COLUMNAS: { campo: CampoClave; titulo: string; obligatorio: boolean; ayuda: string }[] = [
  { campo: 'fecha', titulo: 'Fecha', obligatorio: true, ayuda: 'Formato aaaa-mm-dd o dd-mm-aaaa.' },
  { campo: 'proveedor', titulo: 'Proveedor', obligatorio: true, ayuda: 'Razón social de quien emitió el gasto. Si va vacío se usa el RUT.' },
  { campo: 'rut', titulo: 'RUT Proveedor', obligatorio: false, ayuda: 'Opcional. Identifica al proveedor y alimenta el crédito fiscal.' },
  { campo: 'categoria', titulo: 'Categoria', obligatorio: false, ayuda: 'Insumos/Mercaderia, Servicios Basicos, Arriendo, Sueldos, Publicidad, Tecnologia, Transporte, Capacitacion, Mantencion, IVA/Impuestos u Otros.' },
  { campo: 'tipoDocumento', titulo: 'Tipo Documento', obligatorio: false, ayuda: 'factura_electronica (33), boleta_electronica (39), factura_exenta (34) o boleta_exenta (41).' },
  { campo: 'folio', titulo: 'Folio', obligatorio: false, ayuda: 'Numero del documento. Sirve para detectar duplicados en reimportaciones.' },
  { campo: 'monto', titulo: 'Monto Total', obligatorio: false, ayuda: 'Total con IVA. Si informas Neto e IVA puedes dejarlo vacio.' },
  { campo: 'subtotal', titulo: 'Neto', obligatorio: false, ayuda: 'Monto sin IVA. Tiene prioridad sobre el cálculo automático.' },
  { campo: 'iva', titulo: 'IVA', obligatorio: false, ayuda: 'IVA de la operación. Si falta se calcula al 19% sobre el neto.' },
  { campo: 'estado', titulo: 'Estado', obligatorio: false, ayuda: 'Pagado (por defecto), Pendiente o Por Pagar (deja saldo pendiente).' },
  { campo: 'metodoPago', titulo: 'Método de Pago', obligatorio: false, ayuda: 'efectivo (por defecto), transferencia, debito, credito, mixto o cheque.' },
  { campo: 'fechaVencimiento', titulo: 'Vencimiento', obligatorio: false, ayuda: 'Solo para gastos Pendientes: fecha en que se debe pagar.' },
  { campo: 'nota', titulo: 'Nota', obligatorio: false, ayuda: 'Observación o glosa del gasto.' },
];

/** Nombres alternativos aceptados, incluidos los del detalle de compras del SII. */
const ALIAS: Record<CampoClave, string[]> = {
  fecha: ['fecha', 'fechagasto', 'fechacompra', 'fechaemision', 'fechaemisiondoc', 'fechadocto', 'fechav', 'f'],
  proveedor: ['proveedor', 'razonsocial', 'razonsocialemisor', 'razonsocialproveedor', 'nombreproveedor', 'emisor', 'nombre', 'razon'],
  rut: ['rut', 'rutproveedor', 'rutemisor', 'rutempresa', 'rutrazonsocial', 'r'],
  categoria: ['categoria', 'categoriagasto', 'tipogasto', 'tipocosto', 'clasificacion', 'grupo', 'c'],
  tipoDocumento: ['tipodocumento', 'tipodocto', 'tipodoc', 'tipo', 'tipocomprobante', 'tipodocumento'],
  folio: ['folio', 'nrodocto', 'nrodocumento', 'numerodocumento', 'numdocumento', 'ndoc', 'n', 'documento', 'idgasto'],
  monto: ['montototal', 'monto', 'total', 'totalgasto', 'valortotal', 'bruto', 'montoivaincluido', 'totalconiva', 'montototalconiva'],
  subtotal: ['neto', 'subtotal', 'montoneto', 'valorneto', 'netosii', 'base', 'basesii'],
  iva: ['iva', 'montoiva', 'valoriva', 'ivasii', 'ivaacumulado'],
  estado: ['estado', 'estadopago', 'condicionpago', 'estadogasto', 'estadocompra'],
  metodoPago: ['metodopago', 'metododepago', 'formapago', 'formadepago', 'mediopago', 'medio', 'tipopago', 'mp'],
  fechaVencimiento: ['fechavencimiento', 'vencimiento', 'fechavto', 'fecha_vencimiento', 'vto', 'vence'],
  nota: ['nota', 'notas', 'observacion', 'observaciones', 'comentario', 'comentarios', 'glosa', 'descripcion'],
};

const TIPOS_DOC: { valor: DocumentType; alias: string[] }[] = [
  { valor: 'factura_exenta', alias: ['facturaexenta', 'facturaexentaoafectaiva', '34', 'fe'] },
  { valor: 'boleta_exenta', alias: ['boletaexenta', 'boletaexentaoafectaiva', '41', 'be'] },
  { valor: 'factura_electronica', alias: ['facturaelectronica', 'factura', '33', 'fac'] },
  { valor: 'boleta_electronica', alias: ['boletaelectronica', 'boleta', '39', 'bol'] },
  { valor: 'nota_credito', alias: ['notacredito', 'notacreditocompra', 'nc', '61'] },
];

/** Mapea el tipo de documento de compra al tipo genérico que guarda Gasto. */
const TIPO_COMPRA: { valor: TipoDocumento; alias: string[] }[] = TIPOS_DOC.map(t => ({
  valor: t.valor as TipoDocumento,
  alias: t.alias,
}));

/** Estados de pago de un gasto. "Por Pagar" es el que genera saldo pendiente en addGasto. */
const ESTADOS_GASTO: { valor: EstadoPago; alias: string[] }[] = [
  ...ESTADOS,
  { valor: 'Por Pagar', alias: ['porpagar', 'por pagar', 'deudaporpagar', 'pendientedepago', 'deuda', 'unpaid', 'credito'] },
];

const CATEGORIAS = [
  'Insumos/Mercaderia', 'Servicios Basicos', 'Arriendo', 'Sueldos', 'Publicidad',
  'Tecnologia', 'Transporte', 'Capacitacion', 'Mantencion', 'IVA/Impuestos', 'Otros',
];

const CATEGORIAS_KEY = new Map(CATEGORIAS.map(c => [normKey(c), c]));

/** Ajusta el texto de categoría a una de la lista, o devuelve null si no existe. */
function normalizarCategoria(valor: unknown): string | null {
  const clave = normKey(valor);
  if (!clave) return null;
  return CATEGORIAS_KEY.get(clave) ?? null;
}

/** La categoría no reconocida se informa como error en vez de caer silenciosamente en "Otros". */
function calcularMontos(monto: number, subtotal: number, iva: number, esExento: boolean) {
  if (subtotal > 0 || iva > 0) {
    const neto = subtotal > 0 ? subtotal : 0;
    const imp = iva > 0 ? iva : (esExento ? 0 : Math.round(neto * 0.19));
    return { subtotal: neto, iva: imp, monto: neto + imp };
  }
  if (esExento) return { subtotal: monto, iva: 0, monto };
  const neto = Math.round(monto / 1.19);
  return { subtotal: neto, iva: monto - neto, monto };
}

function descargarPlantilla() {
  descargarLibroPlantilla(
    'plantilla_gastos.xlsx',
    'Gastos',
    [
      COLUMNAS.map(c => c.titulo),
      ['2026-09-01', 'PROVEEDOR EJEMPLO SPA', '76.123.456-7', 'Insumos/Mercaderia', '33', '1001', 11900, '', '', 'Pagado', 'transferencia', '', 'Compra de mercadería'],
      ['02-09-2026', 'SERVICIOS DE TELECOMUNICACIONES', '96.888.777-1', 'Servicios Basicos', '33', '1002', '', 100000, 19000, 'Pendiente', 'debito', '30-09-2026', 'Factura de internet'],
      ['15-09-2026', 'COMERCIO MINORISTA', '77.555.444-K', 'Arriendo', '39', '1003', 500000, '', '', 'Pagado', 'efectivo', '', 'Arriendo mensual'],
    ],
    COLUMNAS.map(c => ({ wch: Math.max(16, c.titulo.length + 4) })),
    [
      ['Columna', 'Obligatorio', 'Descripcion'],
      ...COLUMNAS.map(c => [c.titulo, c.obligatorio ? 'Si' : 'No', c.ayuda]),
      [],
      ['Montos', '', 'Informa "Monto Total" con IVA, o bien "Neto" e "IVA". Con solo el total, el neto se calcula al 19%.'],
      ['Categorias', '', CATEGORIAS.join(' · ')],
      ['Documentos SII', '', 'Acepta los codigos del Registro de Compras: 33 factura, 39 boleta, 34/41 exentas, 61 nota de credito.'],
      ['Duplicados', '', 'Una fila con el mismo Folio, Proveedor y Fecha que ya existe no se importa.'],
      ['Pendientes', '', 'Un gasto Pendiente con Vencimiento genera saldo pendiente por cobrar.'],
    ],
    [{ wch: 20 }, { wch: 14 }, { wch: 95 }]
  );
}

export default function ModalCargaMasivaGastos({
  isOpen, onClose, onImport, gastosExistentes
}: ModalCargaMasivaGastosProps) {
  const [arrastrando, setArrastrando] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previas, setPrevias] = useState<GastoPrevio[]>([]);
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragContador = useRef(0);

  const procesar = (file: File) => {
    setError(null);
    if (!extensionValida(file.name)) {
      setError('Formato no admitido. Usa un archivo .xlsx, .xls, .xlsm o .csv.');
      return;
    }
    setCargando(true);
    setArchivo(file);
    setPrevias([]);
    setSeleccionadas(new Set());

    const reader = new FileReader();
    reader.onerror = () => {
      setCargando(false);
      setError('No se pudo leer el archivo. Verifica que no este abierto en otro programa.');
    };
    reader.onload = (evento) => {
      try {
        const buffer = evento.target?.result as ArrayBuffer;
        const libro = XLSX.read(buffer, { type: 'array', cellDates: true, raw: true });
        const hoja = libro.Sheets[libro.SheetNames[0]];
        if (!hoja) throw new Error('El archivo no contiene ninguna hoja.');

        const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, blankrows: false, defval: '' });
        // El encabezado se busca por la columna obligatoria, tolerando titulos de basura arriba.
        const indiceEncabezado = filas.findIndex(fila => mapearColumnas(fila, ALIAS).fecha >= 0);
        if (indiceEncabezado < 0) {
          throw new Error('No se encontro una fila de encabezados. Debe incluir al menos las columnas Fecha y Proveedor.');
        }

        const columnas = mapearColumnas(filas[indiceEncabezado], ALIAS);
        const celda = (fila: unknown[], campo: CampoClave) => {
          const i = columnas[campo];
          return i >= 0 ? fila[i] : '';
        };

        const hoy = new Date().toISOString().split('T')[0];
        const lista: GastoPrevio[] = [];

        filas.slice(indiceEncabezado + 1).forEach((fila, offset) => {
          if (fila.every(c => String(c ?? '').trim() === '')) return;

          const numeroFila = indiceEncabezado + offset + 2;
          const fecha = parseFecha(celda(fila, 'fecha'));
          const folio = String(celda(fila, 'folio') ?? '').trim();
          const rut = String(celda(fila, 'rut') ?? '').trim();
          const proveedor = String(celda(fila, 'proveedor') ?? '').trim() || rut;
          const textoCategoria = String(celda(fila, 'categoria') ?? '').trim();
          const categoria = normalizarCategoria(textoCategoria) ?? CATEGORIAS[10];
          const tipoDocumento = elegirEnum(celda(fila, 'tipoDocumento'), TIPO_COMPRA, 'factura_electronica');
          const estado = elegirEnum(celda(fila, 'estado'), ESTADOS_GASTO, 'Pagado');
          const metodoPago = elegirEnum(celda(fila, 'metodoPago'), METODOS_PAGO, 'efectivo');
          const fechaVencimiento = parseFecha(celda(fila, 'fechaVencimiento'));
          const nota = String(celda(fila, 'nota') ?? '').trim();

          const esExento = tipoDocumento === 'factura_exenta' || tipoDocumento === 'boleta_exenta';
          const calculo = calcularMontos(
            parseNumero(celda(fila, 'monto')),
            parseNumero(celda(fila, 'subtotal')),
            parseNumero(celda(fila, 'iva')),
            esExento
          );

          const errores: string[] = [];
          if (!fecha) errores.push('Fecha obligatoria en formato aaaa-mm-dd o dd-mm-aaaa.');
          if (!proveedor) errores.push('Falta el Proveedor o el RUT.');
          if (calculo.monto <= 0) errores.push('El monto debe ser mayor a 0.');
          if (textoCategoria && !normalizarCategoria(textoCategoria)) {
            errores.push(`Categoria "${textoCategoria}" no existe. Usa: ${CATEGORIAS.join(', ')}.`);
          }

          // El folio viaja en las notas, que es donde el gasto guarda su trazabilidad.
          const existe = Boolean(folio) && gastosExistentes.some(g =>
            String(g.notas ?? '').toLowerCase().includes(`folio ${folio}`.toLowerCase())
            && normKey(g.proveedor) === normKey(proveedor)
            && g.fecha === fecha
          );

          // tipo_documento_compra, periodo_tributario y los saldos los recalcula addGasto
          // a partir de esFactura y estado, asi que no se envian desde aqui.
          const gasto: Partial<Gasto> = {
            fecha: fecha || hoy,
            proveedor: proveedor || 'Proveedor sin identificar',
            categoria,
            subtotal: calculo.subtotal,
            iva: calculo.iva,
            monto: calculo.monto,
            esFactura: tipoDocumento === 'factura_electronica' || tipoDocumento === 'factura_exenta',
            estado,
            metodo_pago: metodoPago,
            notas: nota && folio ? `${nota} · Folio ${folio}` : nota || (folio ? `Folio ${folio}` : ''),
          };
          if (fechaVencimiento) gasto.fecha_vencimiento = fechaVencimiento;

          lista.push({
            clave: `L${numeroFila}-${normKey(proveedor).slice(0, 8)}`,
            fila: numeroFila,
            fecha: fecha || '—',
            proveedor: proveedor || '—',
            folio,
            categoria,
            tipoDocumento,
            subtotal: calculo.subtotal,
            iva: calculo.iva,
            monto: calculo.monto,
            estado,
            metodoPago,
            fechaVencimiento,
            nota,
            existe,
            errores,
            gasto,
          });
        });

        if (lista.length === 0) throw new Error('El archivo no tiene filas de datos.');

        setPrevias(lista);
        setSeleccionadas(new Set(lista.filter(p => p.errores.length === 0 && !p.existe).map(p => p.clave)));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo interpretar el archivo.');
        setPrevias([]);
      } finally {
        setCargando(false);
      }
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
    onImport(aImportar.map(p => p.gasto));
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-scrim/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="px-6 py-4 border-b border-outline-variant/20 flex justify-between items-center bg-surface-container-low/50">
          <div>
            <h3 className="text-xl font-bold text-primary">Carga Masiva de Gastos</h3>
            <p className="text-xs text-on-surface-variant mt-1">Sube tu Excel con muchos gastos a la vez. Aceptamos tambien el detalle de compras del SII.</p>
          </div>
          <button onClick={onClose} className="text-outline hover:text-error transition-colors">
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
            <div className="md:col-span-2 rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-success-container flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-on-success-container">table_view</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-on-surface">¿Primera vez cargando?</p>
                <p className="text-xs text-on-surface-variant">Descarga la plantilla con las columnas y un ejemplo de gasto por fila.</p>
              </div>
            </div>
            <button
              onClick={descargarPlantilla}
              className="px-5 py-4 bg-primary text-inverse-on-surface rounded-2xl font-black text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
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
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto transition-colors ${arrastrando ? 'bg-primary/15' : 'bg-surface-container'}`}>
                <span className={`material-symbols-outlined text-4xl ${arrastrando ? 'text-primary animate-bounce' : 'text-outline group-hover:text-primary'}`}>
                  {cargando ? 'hourglass_top' : 'cloud_upload'}
                </span>
              </div>
              <p className="mt-4 text-on-surface-variant font-bold">
                {cargando ? 'Leyendo archivo…' : arrastrando ? 'Suelta el archivo aquí' : 'Arrastra tu archivo Excel aquí'}
              </p>
              <p className="text-xs text-outline mt-1">
                o haz clic para buscarlo en tus carpetas · Formatos: {EXTENSIONES.join(', ')}
              </p>
            </div>
          )}

          {previas.length > 0 && (
            <div className="flex flex-wrap justify-between items-center gap-3 bg-surface-container-low p-4 rounded-2xl border border-outline-variant/30">
              <div className="flex items-center gap-3 min-w-0">
                <span className="material-symbols-outlined text-primary">description</span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-on-surface truncate">{archivo?.name}</p>
                  <p className="text-xs text-on-surface-variant">
                    {previas.length} gastos detectados · {aImportar.length} por importar ·{' '}
                    {formatPesos(previas.reduce((acc, p) => acc + p.monto, 0))} en total
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setPrevias([]); setArchivo(null); setError(null); }}
                  className="px-4 py-2 rounded-full text-xs font-bold text-on-surface-variant bg-surface-container-lowest border border-outline-variant/30 hover:bg-surface-container transition-colors"
                >
                  Cambiar archivo
                </button>
                <button
                  onClick={descargarPlantilla}
                  className="px-4 py-2 rounded-full text-xs font-bold text-primary bg-surface-container-lowest border border-primary/30 hover:bg-primary/5 transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">download_for_offline</span>
                  Plantilla
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="px-4 py-3 rounded-2xl bg-error-container border border-error/30 text-xs font-semibold text-on-error-container flex items-center gap-2">
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
                  className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-colors"
                >
                  Deseleccionar
                </button>
              </div>

              <div className="border border-outline-variant/30 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-sm text-left">
                  <thead className="bg-surface-container-low text-on-surface-variant font-bold text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 w-10"></th>
                      <th className="px-4 py-3">Folio</th>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Proveedor</th>
                      <th className="px-4 py-3">Categoría</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {previas.map(p => {
                      const bloqueada = p.errores.length > 0 || p.existe;
                      return (
                        <tr key={p.clave} className={`hover:bg-surface-container-low/50 transition-colors ${bloqueada ? 'bg-surface-container-low/40' : ''}`}>
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
                          <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{p.fecha}</td>
                          <td className="px-4 py-3 truncate max-w-[180px] font-medium" title={p.proveedor}>{p.proveedor}</td>
                          <td className="px-4 py-3 text-on-surface-variant text-xs">{p.categoria}</td>
                          <td className="px-4 py-3 text-right font-black text-on-surface whitespace-nowrap">{formatPesos(p.monto)}</td>
                          <td className="px-4 py-3 text-center">
                            {p.errores.length > 0 ? (
                              <span title={p.errores.join(' | ')} className="inline-flex items-center gap-1 text-[9px] bg-error-container text-on-error-container px-2 py-0.5 rounded-full font-black uppercase cursor-help">
                                <span className="material-symbols-outlined text-[10px]">error</span> Revisar
                              </span>
                            ) : p.existe ? (
                              <span className="inline-flex items-center gap-1 text-[9px] bg-surface-container text-on-surface-variant px-2 py-0.5 rounded-full font-black uppercase">
                                <span className="material-symbols-outlined text-[10px]">check_circle</span> Ya existe
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[9px] bg-success-container text-on-success-container px-2 py-0.5 rounded-full font-black uppercase">
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
                <details className="px-4 py-3 rounded-2xl bg-warning-container border border-warning/30 text-xs text-on-warning-container">
                  <summary className="font-black cursor-pointer">
                    {conProblemas.length} fila(s) no se importarán — revisa los detalles
                  </summary>
                  <ul className="mt-3 space-y-2 max-h-40 overflow-y-auto pr-2">
                    {conProblemas.map(p => (
                      <li key={p.clave} className="bg-surface-container-lowest/70 rounded-xl px-3 py-2">
                        <span className="font-bold">Fila {p.fila} · {p.proveedor}</span>
                        <ul className="list-disc list-inside mt-1">
                          {p.existe && <li>Ya existe un gasto con este Folio, Proveedor y Fecha.</li>}
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
          <button onClick={onClose} className="px-6 py-2 rounded-full font-bold text-on-surface-variant hover:bg-surface-container-high/50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={aImportar.length === 0 || cargando}
            className="px-6 py-2 bg-primary text-inverse-on-surface rounded-full font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">cloud_upload</span>
            Importar {aImportar.length} gastos
          </button>
        </div>
      </div>
    </div>
  );
}
