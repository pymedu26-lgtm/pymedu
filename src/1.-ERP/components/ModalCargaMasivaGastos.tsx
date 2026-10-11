import { useRef, useState, ChangeEvent, DragEvent } from 'react';
import * as XLSX from 'xlsx';
import { EstadoPago, Gasto, MetodoPago, TipoDocumento } from '../context/ERPContext';
import { DocumentType } from '../services/documentCompliance';
import {
  ESTADOS, EXTENSIONES, METODOS_PAGO, descargarLibroPlantilla, elegirEnum, extensionValida,
  formatPesos, mapearColumnas, normKey, parseBooleano, parseFecha, parseNumero,
} from './cargaMasivaUtil';

interface ModalCargaMasivaGastosProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (gastos: Partial<Gasto>[]) => void;
  gastosExistentes: Gasto[];
}

type CampoClave =
  | 'fecha' | 'proveedor' | 'rut' | 'categoria' | 'tipoDocumento' | 'folio'
  | 'monto' | 'subtotal' | 'iva' | 'estado' | 'metodoPago' | 'fechaVencimiento'
  | 'recurrente' | 'nota';

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
  recurrente: boolean;
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
  { campo: 'recurrente', titulo: 'Recurrente', obligatorio: false, ayuda: 'Si/No. Marca el gasto como recurrente (mensual), igual que el formulario.' },
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
  recurrente: ['recurrente', 'gastorecurrente', 'esrecurrente', 'recurrencia', 'mensual', 'periodicidad', 'recurrente_mensual'],
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
      ['2026-09-01', 'PROVEEDOR EJEMPLO SPA', '76.123.456-7', 'Insumos/Mercaderia', '33', '1001', 11900, '', '', 'Pagado', 'transferencia', '', '', 'Compra de mercadería'],
      ['02-09-2026', 'SERVICIOS DE TELECOMUNICACIONES', '96.888.777-1', 'Servicios Basicos', '33', '1002', '', 100000, 19000, 'Pendiente', 'debito', '30-09-2026', 'No', 'Factura de internet'],
      ['15-09-2026', 'COMERCIO MINORISTA', '77.555.444-K', 'Arriendo', '39', '1003', 500000, '', '', 'Pagado', 'efectivo', '', 'Si', 'Arriendo mensual'],
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
      ['Recurrente', '', 'Acepta Si/No, 1/0, X o vacío. Marca el gasto como recurrente mensual, igual que el formulario.'],
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
      setError('Formato no admitido. Solo se aceptan archivos .xlsx de la plantilla de descarga.');
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
          const recurrente = parseBooleano(celda(fila, 'recurrente'));
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
            recurrente,
            dia_recurrente: recurrente ? 1 : undefined,
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
            recurrente,
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

  const confirmar = () => {
    onImport(aImportar.map(p => p.gasto));
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-surface/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col border border-outline-variant/40">
        <div className="p-6 border-b border-outline-variant/30 flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-black text-primary">Carga Masiva de Gastos</h3>
            <p className="text-on-surface-variant text-sm mt-1">Importa múltiples gastos desde Excel o CSV en un solo paso.</p>
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
                      <p className="text-lg font-bold text-on-surface">{previas.length} gastos detectados</p>
                      <p className="text-sm text-on-surface-variant">
                        {seleccionadas.size} seleccionados para importar · {previas.filter(p => p.existe).length} ya existen · {previas.filter(p => p.errores.length > 0).length} con errores
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
                          <th className="px-4 py-3 text-left font-bold text-on-surface-variant">Fila</th>
                          <th className="px-4 py-3 text-left font-bold text-on-surface-variant">Folio</th>
                          <th className="px-4 py-3 text-left font-bold text-on-surface-variant">Fecha</th>
                          <th className="px-4 py-3 text-left font-bold text-on-surface-variant">Proveedor</th>
                          <th className="px-4 py-3 text-left font-bold text-on-surface-variant">Categoría</th>
                          <th className="px-4 py-3 text-center font-bold text-on-surface-variant">Recurrente</th>
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
                              <td className="px-4 py-2 text-on-surface-variant font-medium">{p.fila}</td>
                              <td className="px-4 py-2 font-bold text-primary">{p.folio || '—'}</td>
                              <td className="px-4 py-2 text-on-surface-variant whitespace-nowrap">{p.fecha}</td>
                              <td className="px-4 py-2 max-w-[180px] truncate font-medium" title={p.proveedor}>{p.proveedor}</td>
                              <td className="px-4 py-2 text-on-surface-variant text-xs">{p.categoria}</td>
                              <td className="px-4 py-2 text-center">
                                {p.recurrente ? (
                                  <span title="Gasto recurrente mensual" className="px-2 py-0.5 bg-tertiary/10 text-tertiary rounded-full text-[10px] font-black uppercase">Si</span>
                                ) : <span className="text-outline">—</span>}
                              </td>
                              <td className="px-4 py-2 text-right font-black text-on-surface whitespace-nowrap">{formatPesos(p.monto)}</td>
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
                                {p.existe && <span className="block text-on-surface-variant font-semibold">Ya existe un gasto con este Folio, Proveedor y Fecha.</span>}
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
            <p className="text-sm text-on-surface-variant">{seleccionadas.size} gastos seleccionados para importar</p>
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
