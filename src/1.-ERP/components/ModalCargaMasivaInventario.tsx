import { useRef, useState, ChangeEvent, DragEvent } from 'react';
import * as XLSX from 'xlsx';
import { Producto } from '../context/ERPContext';
import {
  descargarLibroPlantilla, elegirEnum, extensionValida,
  formatPesos, mapearColumnas, normKey, parseBooleano, parseNumero,
} from './cargaMasivaUtil';

interface ModalCargaMasivaInventarioProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (productos: Omit<Producto, 'id'>[]) => void;
  inventarioExistente: Producto[];
}

type CampoClave =
  | 'nombre' | 'codigo' | 'codigoBarras' | 'categoria' | 'tipo'
  | 'descripcion' | 'costo' | 'precio' | 'stock' | 'stockMinimo'
  | 'unidadMedida' | 'estado' | 'incluyeIva';

interface ProductoPrevio {
  clave: string;
  fila: number;
  nombre: string;
  codigo: string;
  codigoBarras: string;
  categoria: string;
  tipo: 'producto' | 'servicio';
  descripcion: string;
  costo: number;
  precio: number;
  stock: number;
  stockMinimo: number;
  unidadMedida: string;
  estado: 'activo' | 'inactivo';
  incluyeIva: boolean;
  existe: boolean;
  errores: string[];
  producto: Omit<Producto, 'id'>;
}

const COLUMNAS: { campo: CampoClave; titulo: string; obligatorio: boolean; ayuda: string }[] = [
  { campo: 'nombre', titulo: 'Nombre', obligatorio: true, ayuda: 'Nombre del producto o servicio.' },
  { campo: 'codigo', titulo: 'Código', obligatorio: false, ayuda: 'Código SKU o interno. Debe ser único.' },
  { campo: 'codigoBarras', titulo: 'Código de Barras', obligatorio: false, ayuda: 'Código de barras EAN/UPC.' },
  { campo: 'categoria', titulo: 'Categoría', obligatorio: false, ayuda: 'Categoría del producto.' },
  { campo: 'tipo', titulo: 'Tipo', obligatorio: false, ayuda: 'producto o servicio. Por defecto producto.' },
  { campo: 'descripcion', titulo: 'Descripción', obligatorio: false, ayuda: 'Descripción del producto.' },
  { campo: 'costo', titulo: 'Costo', obligatorio: true, ayuda: 'Costo de compra o costo del producto.' },
  { campo: 'precio', titulo: 'Precio Venta', obligatorio: true, ayuda: 'Precio de venta al público.' },
  { campo: 'stock', titulo: 'Stock Actual', obligatorio: false, ayuda: 'Cantidad en stock. Por defecto 0.' },
  { campo: 'stockMinimo', titulo: 'Stock Mínimo', obligatorio: false, ayuda: 'Punto de reorden. Por defecto 0.' },
  { campo: 'unidadMedida', titulo: 'Unidad de Medida', obligatorio: false, ayuda: 'Ej: Unidad, Kg, Lt, Caja. Por defecto Unidad.' },
  { campo: 'estado', titulo: 'Estado', obligatorio: false, ayuda: 'activo o inactivo. Por defecto activo.' },
  { campo: 'incluyeIva', titulo: 'Incluye IVA', obligatorio: false, ayuda: 'Sí/No. Por defecto Sí.' },
];

const ALIAS: Record<CampoClave, string[]> = {
  nombre: ['nombre', 'producto', 'descripcionproducto', 'item', 'concepto'],
  codigo: ['codigo', 'codigoproducto', 'sku', 'codigointerno', 'idproducto', 'codigosku'],
  codigoBarras: ['codigobarras', 'barcode', 'ean', 'upc', 'codigo_barra'],
  categoria: ['categoria', 'categoría', 'grupo', 'familia', 'clasificacion'],
  tipo: ['tipo', 'tipoproducto', 'serviciooproducto', 'tipo_item'],
  descripcion: ['descripcion', 'descripción', 'detalle', 'notas'],
  costo: ['costo', 'costounitario', 'costo_compra', 'precio_compra', 'costobase'],
  precio: ['precio', 'precioventa', 'precio_venta', 'precio_unitario', 'preciounitario', 'pv'],
  stock: ['stock', 'existencia', 'cantidad', 'stockactual', 'existencias'],
  stockMinimo: ['stockminimo', 'stock_minimo', 'minimo', 'puntoreorden', 'reorden'],
  unidadMedida: ['unidadmedida', 'unidad_medida', 'unidad', 'um', 'medida'],
  estado: ['estado', 'estatus', 'condicion'],
  incluyeIva: ['incluyeiva', 'incluye_iva', 'coniva', 'iva_incluido'],
};

const TIPOS_PRODUCTO: { valor: 'producto' | 'servicio'; alias: string[] }[] = [
  { valor: 'producto', alias: ['producto', 'prod', 'mercaderia', 'bien', 'inventariable'] },
  { valor: 'servicio', alias: ['servicio', 'serv', 'servicios'] },
];

const ESTADOS_PRODUCTO: { valor: 'activo' | 'inactivo'; alias: string[] }[] = [
  { valor: 'activo', alias: ['activo', 'activa', 'a', 'si', 's', 'true', '1', 'habilitado'] },
  { valor: 'inactivo', alias: ['inactivo', 'inactiva', 'i', 'no', 'n', 'false', '0', 'deshabilitado'] },
];

function descargarPlantilla() {
  descargarLibroPlantilla(
    'plantilla_inventario.xlsx',
    'Inventario',
    [
      COLUMNAS.map(c => c.titulo),
      ['Producto de Ejemplo', 'PROD-001', '780000000001', 'Mercadería', 'producto', 'Producto para venta', 1000, 1190, 10, 5, 'Unidad', 'activo', 'Sí'],
      ['Servicio de Ejemplo', 'SERV-001', '', 'Servicios', 'servicio', 'Servicio especializado', 5000, 5950, 0, 0, 'Servicio', 'activo', 'Sí'],
    ],
    COLUMNAS.map(c => ({ wch: Math.max(16, c.titulo.length + 4) })),
    [
      ['Columna', 'Obligatorio', 'Descripción'],
      ...COLUMNAS.map(c => [c.titulo, c.obligatorio ? 'Si' : 'No', c.ayuda]),
      [],
      ['Tipo', '', 'Usa "producto" para items con stock o "servicio" para servicios.'],
      ['IVA', '', 'Indica si el precio de venta incluye IVA (Sí) o no (No).'],
      ['Stock', '', 'Para servicios usualmente queda en 0.'],
      ['Códigos', '', 'Código y Código de Barras deben ser únicos si se ingresan.'],
    ],
    [{ wch: 20 }, { wch: 14 }, { wch: 95 }]
  );
}

export default function ModalCargaMasivaInventario({
  isOpen, onClose, onImport, inventarioExistente
}: ModalCargaMasivaInventarioProps) {
  const [arrastrando, setArrastrando] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previas, setPrevias] = useState<ProductoPrevio[]>([]);
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
    setArchivo(file);
    setCargando(true);
    setPrevias([]);
    setSeleccionadas(new Set());

    const reader = new FileReader();
    reader.onload = evento => {
      try {
        const buffer = evento.target?.result as ArrayBuffer;
        const libro = XLSX.read(buffer, { type: 'array', cellDates: true, raw: true });
        const hoja = libro.Sheets[libro.SheetNames[0]];
        if (!hoja) throw new Error('El archivo no contiene hojas de cálculo.');

        const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, blankrows: false, defval: '' });
        if (filas.length < 2) throw new Error('La hoja está vacía: necesitas el encabezado y al menos un producto.');

        const indiceEncabezado = filas.findIndex(fila => mapearColumnas(fila, ALIAS).nombre >= 0);
        if (indiceEncabezado < 0) {
          throw new Error('No se reconoce el encabezado. Descarga la plantilla y copia sus columnas.');
        }

        const columnas = mapearColumnas(filas[indiceEncabezado], ALIAS);
        const celda = (fila: unknown[], campo: CampoClave) => {
          const i = columnas[campo];
          return i >= 0 ? fila[i] ?? '' : '';
        };

        const existentesCodigos = new Map(inventarioExistente.map(p => [normKey(p.codigo), p.id]));
        const existentesCodBarras = new Map(inventarioExistente.map(p => [normKey(p.codigoBarras), p.id]));
        const existentesNombres = new Map(inventarioExistente.map(p => [normKey(p.nombre), p.id]));

        const resultados: ProductoPrevio[] = [];

        filas.slice(indiceEncabezado + 1).forEach((fila, offset) => {
          const numeroFila = indiceEncabezado + offset + 2;
          if (!fila.some(v => String(v ?? '').trim() !== '')) return;

          const nombre = String(celda(fila, 'nombre')).trim();
          const codigo = String(celda(fila, 'codigo')).trim();
          const codigoBarras = String(celda(fila, 'codigoBarras')).trim();
          const categoria = String(celda(fila, 'categoria')).trim() || 'Sin categoría';
          const tipo = elegirEnum(celda(fila, 'tipo'), TIPOS_PRODUCTO, 'producto');
          const descripcion = String(celda(fila, 'descripcion')).trim();
          const costo = parseNumero(celda(fila, 'costo'));
          const precio = parseNumero(celda(fila, 'precio'));
          const stock = parseNumero(celda(fila, 'stock'));
          const stockMinimo = parseNumero(celda(fila, 'stockMinimo'));
          const unidadMedida = String(celda(fila, 'unidadMedida')).trim() || (tipo === 'servicio' ? 'Servicio' : 'Unidad');
          const estado = elegirEnum(celda(fila, 'estado'), ESTADOS_PRODUCTO, 'activo');
          const incluyeIva = parseBooleano(celda(fila, 'incluyeIva'), true);

          const errores: string[] = [];
          if (!nombre) errores.push('El nombre es obligatorio.');
          if (costo < 0) errores.push('El costo no puede ser negativo.');
          if (precio < 0) errores.push('El precio no puede ser negativo.');
          if (stock < 0) errores.push('El stock no puede ser negativo.');
          if (stockMinimo < 0) errores.push('El stock mínimo no puede ser negativo.');

          const claveNormCodigo = normKey(codigo);
          const claveNormCB = normKey(codigoBarras);
          const claveNormNombre = normKey(nombre);
          let existe = false;
          if (claveNormCodigo && existentesCodigos.has(claveNormCodigo)) existe = true;
          if (!existe && claveNormCB && existentesCodBarras.has(claveNormCB)) existe = true;
          if (!existe && !claveNormCodigo && !claveNormCB && claveNormNombre && existentesNombres.has(claveNormNombre)) existe = true;

          const productoBase: Omit<Producto, 'id'> = {
            nombre,
            codigo,
            codigoBarras: codigoBarras || undefined,
            categoria,
            tipo,
            descripcion: descripcion || undefined,
            costo,
            precio,
            stock,
            stockMinimo,
            unidadMedida,
            estado,
            incluyeIva,
            esInventariable: tipo === 'producto',
          };

          resultados.push({
            clave: `f${numeroFila}-${claveNormCodigo || claveNormNombre || Math.random()}`,
            fila: numeroFila,
            nombre,
            codigo,
            codigoBarras,
            categoria,
            tipo,
            descripcion,
            costo,
            precio,
            stock,
            stockMinimo,
            unidadMedida,
            estado,
            incluyeIva,
            existe,
            errores,
            producto: productoBase,
          });
        });

        setPrevias(resultados);
        setSeleccionadas(new Set(resultados.filter(p => !p.existe && p.errores.length === 0).map(p => p.clave)));
        setCargando(false);
      } catch (e) {
        setCargando(false);
        setError(e instanceof Error ? e.message : 'Error al procesar el archivo.');
      }
    };
    reader.onerror = () => {
      setCargando(false);
      setError('No se pudo leer el archivo. Verifica que no esté abierto en otro programa.');
    };
    reader.readAsArrayBuffer(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragContador.current = 0;
    setArrastrando(false);
    const f = e.dataTransfer.files[0];
    if (f) procesar(f);
  };

  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragContador.current++;
    setArrastrando(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragContador.current--;
    if (dragContador.current <= 0) {
      dragContador.current = 0;
      setArrastrando(false);
    }
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) procesar(f);
    if (inputRef.current) inputRef.current.value = '';
  };

  const limpiar = () => {
    setArchivo(null);
    setPrevias([]);
    setSeleccionadas(new Set());
    setError(null);
    setCargando(false);
  };

  const toggleSeleccion = (clave: string) => {
    setSeleccionadas(prev => {
      const s = new Set(prev);
      if (s.has(clave)) s.delete(clave);
      else s.add(clave);
      return s;
    });
  };

  const seleccionarTodo = () => {
    setSeleccionadas(new Set(previas.filter(p => !p.existe && p.errores.length === 0).map(p => p.clave)));
  };

  const limpiarSeleccion = () => setSeleccionadas(new Set());

  const importarSeleccionadas = () => {
    const aImportar = previas
      .filter(p => seleccionadas.has(p.clave))
      .map(p => p.producto);
    if (aImportar.length === 0) return;
    onImport(aImportar);
    limpiar();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-surface/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col border border-outline-variant/40">
        <div className="p-6 border-b border-outline-variant/30 flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-black text-primary">Carga Masiva de Inventario</h3>
            <p className="text-on-surface-variant text-sm mt-1">Importa productos y servicios desde Excel o CSV en un solo paso.</p>
          </div>
          <button onClick={() => { limpiar(); onClose(); }} className="text-on-surface-variant hover:text-error transition-colors">
            <span className="material-symbols-outlined text-3xl">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!archivo && (
            <div
              onDrop={onDrop}
              onDragEnter={onDragEnter}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDragLeave={onDragLeave}
              className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center transition-all ${arrastrando ? 'border-primary bg-primary/5' : 'border-outline-variant/50 hover:border-primary/40'}`}
            >
              <span className="material-symbols-outlined text-6xl text-primary mb-4">cloud_upload</span>
              <h4 className="text-xl font-bold text-on-surface mb-2">Arrastra tu archivo aquí</h4>
              <p className="text-on-surface-variant mb-4">o</p>
              <button onClick={() => inputRef.current?.click()} className="px-6 py-3 bg-primary text-inverse-on-surface rounded-full font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
                Seleccionar archivo
              </button>
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.xlsm,.csv" onChange={onFileChange} className="hidden" />
              <p className="text-xs text-on-surface-variant mt-4">Formatos permitidos: .xlsx, .xls, .xlsm, .csv</p>
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
                <button onClick={limpiar} className="flex items-center gap-2 px-4 py-2 bg-surface-container-lowest border border-outline-variant/40 rounded-full text-sm font-bold hover:bg-error/10 hover:text-error transition-all">
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
                      <p className="text-lg font-bold text-on-surface">{previas.length} filas detectadas</p>
                      <p className="text-sm text-on-surface-variant">
                        {seleccionadas.size} seleccionadas para importar · {previas.filter(p => p.existe).length} ya existen · {previas.filter(p => p.errores.length > 0).length} con errores
                      </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={seleccionarTodo} className="px-4 py-2 bg-surface-container-lowest border border-outline-variant/40 rounded-full text-sm font-bold hover:bg-primary/5 transition-all">
                        Seleccionar válidas
                      </button>
                      <button onClick={limpiarSeleccion} className="px-4 py-2 bg-surface-container-lowest border border-outline-variant/40 rounded-full text-sm font-bold hover:bg-surface-container-low transition-all">
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
                          <th className="px-4 py-3 text-left font-bold text-on-surface-variant">Nombre</th>
                          <th className="px-4 py-3 text-left font-bold text-on-surface-variant">Código</th>
                          <th className="px-4 py-3 text-left font-bold text-on-surface-variant">Categoría</th>
                          <th className="px-4 py-3 text-left font-bold text-on-surface-variant">Tipo</th>
                          <th className="px-4 py-3 text-right font-bold text-on-surface-variant">Costo</th>
                          <th className="px-4 py-3 text-right font-bold text-on-surface-variant">Precio</th>
                          <th className="px-4 py-3 text-right font-bold text-on-surface-variant">Stock</th>
                          <th className="px-4 py-3 text-center font-bold text-on-surface-variant">Estado</th>
                          <th className="px-4 py-3 text-left font-bold text-on-surface-variant">Observaciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previas.map((p) => {
                          const bloqueado = p.existe || p.errores.length > 0;
                          const checked = seleccionadas.has(p.clave);
                          return (
                            <tr key={p.clave} className={`border-b border-outline-variant/20 ${bloqueado ? 'bg-surface/60 opacity-70' : 'hover:bg-surface-container-low/60'}`}>
                              <td className="px-4 py-2">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={bloqueado}
                                  onChange={() => toggleSeleccion(p.clave)}
                                  className="w-4 h-4 accent-primary"
                                />
                              </td>
                              <td className="px-4 py-2 text-on-surface-variant font-medium">{p.fila}</td>
                              <td className="px-4 py-2 font-bold text-on-surface max-w-xs truncate" title={p.nombre}>{p.nombre}</td>
                              <td className="px-4 py-2 text-on-surface-variant font-mono">{p.codigo}</td>
                              <td className="px-4 py-2 text-on-surface-variant">{p.categoria}</td>
                              <td className="px-4 py-2 text-on-surface-variant capitalize">{p.tipo}</td>
                              <td className="px-4 py-2 text-right font-medium">{formatPesos(p.costo)}</td>
                              <td className="px-4 py-2 text-right font-medium">{formatPesos(p.precio)}</td>
                              <td className="px-4 py-2 text-right font-medium">{p.stock}</td>
                              <td className="px-4 py-2 text-center capitalize">{p.estado}</td>
                              <td className="px-4 py-2 text-xs">
                                {p.existe && <span className="px-2 py-0.5 bg-secondary/20 text-secondary rounded-full">Ya existe</span>}
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
            <p className="text-sm text-on-surface-variant">{seleccionadas.size} productos seleccionados para importar</p>
            <div className="flex gap-3">
              <button onClick={() => { limpiar(); onClose(); }} className="px-6 py-2.5 bg-surface-container-lowest border border-outline-variant/40 rounded-full font-bold hover:bg-surface-container-low transition-all">
                Cancelar
              </button>
              <button
                onClick={importarSeleccionadas}
                disabled={seleccionadas.size === 0}
                className="px-6 py-2.5 bg-primary text-inverse-on-surface rounded-full font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">download</span>
                Importar {seleccionadas.size > 0 ? `(${seleccionadas.size})` : ''}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
