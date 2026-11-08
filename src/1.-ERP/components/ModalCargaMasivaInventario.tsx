import { useRef, useState, ChangeEvent, DragEvent } from 'react';
import * as XLSX from 'xlsx';
import { Producto, NombreEnvase } from '../context/ERPContext';
import { aBase, unidadBaseDe, formatCantidad, type UnidadEntrada } from '../services/inventarioFraccionado';
import {
  descargarLibroPlantilla, elegirEnum, extensionValida,
  formatPesos, mapearColumnas, normKey, parseBooleano, parseNumero,
  limpiarCelda,
} from './cargaMasivaUtil';
import TablaResponsiva, { type ColumnaTabla } from '../../components/TablaResponsiva';
import ModalResponsivo from '../../components/ModalResponsivo';
import { cn } from '@/lib/utils';

interface ModalCargaMasivaInventarioProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (productos: Omit<Producto, 'id'>[]) => void;
  inventarioExistente: Producto[];
}

type CampoClave =
  | 'nombre' | 'codigo' | 'codigoBarras' | 'categoria' | 'tipo'
  | 'descripcion' | 'costo' | 'precio' | 'stock' | 'stockMinimo'
  | 'unidadMedida' | 'estado' | 'incluyeIva'
  // Columnas nuevas (opcionales): productos en frascos/sacos o a granel.
  | 'formaCompra' | 'contenidoEnvase' | 'unidadContenido' | 'nombreEnvase';

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
  /** Texto de stock para la vista previa («20 frascos de 100 ml», «2.000 kg»). */
  stockTexto: string;
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
  { campo: 'formaCompra', titulo: 'Forma de Compra', obligatorio: false, ayuda: 'unidad, envase (frascos, sacos, cajas) o granel. Vacío = unidad (como antes).' },
  { campo: 'contenidoEnvase', titulo: 'Contenido por Envase', obligatorio: false, ayuda: 'Solo envase: lo que trae cada frasco o saco (ej. 100). Con envase, Stock Actual = cantidad de envases y Costo/Precio = por envase.' },
  { campo: 'unidadContenido', titulo: 'Unidad Contenido', obligatorio: false, ayuda: 'ml, L, g, kg, toneladas o unidades. A granel: unidad del Stock, Costo y Precio (ej. kg).' },
  { campo: 'nombreEnvase', titulo: 'Nombre Envase', obligatorio: false, ayuda: 'frasco, botella, saco o caja. Por defecto frasco (líquidos) o saco (peso).' },
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
  formaCompra: ['formacompra', 'forma_compra', 'formadecompra', 'comolocompras'],
  contenidoEnvase: ['contenidoenvase', 'contenido_envase', 'contenidoporenvase', 'contenido', 'capacidad'],
  unidadContenido: ['unidadcontenido', 'unidad_contenido', 'unidaddelcontenido'],
  nombreEnvase: ['nombreenvase', 'nombre_envase', 'envase'],
};

const FORMAS_COMPRA: { valor: 'unidad' | 'envase' | 'granel'; alias: string[] }[] = [
  { valor: 'unidad', alias: ['unidad', 'un', 'simple', 'porunidad'] },
  { valor: 'envase', alias: ['envase', 'envases', 'frasco', 'frascos', 'botella', 'botellas', 'saco', 'sacos', 'caja', 'cajas'] },
  { valor: 'granel', alias: ['granel', 'agranel', 'peso', 'kilo', 'kilos'] },
];
const UNIDADES_CONTENIDO: { valor: UnidadEntrada; alias: string[] }[] = [
  { valor: 'ml', alias: ['ml', 'mililitro', 'mililitros', 'cc'] },
  { valor: 'l', alias: ['l', 'lt', 'lts', 'litro', 'litros'] },
  { valor: 'g', alias: ['g', 'gr', 'grs', 'gramo', 'gramos'] },
  { valor: 'kg', alias: ['kg', 'kgs', 'kilo', 'kilos', 'kilogramo', 'kilogramos'] },
  { valor: 't', alias: ['t', 'ton', 'tons', 'tonelada', 'toneladas'] },
  { valor: 'unidad', alias: ['unidad', 'unidades', 'un', 'u'] },
];
const NOMBRES_ENVASE: { valor: NombreEnvase; alias: string[] }[] = [
  { valor: 'frasco', alias: ['frasco', 'frascos'] }, { valor: 'botella', alias: ['botella', 'botellas'] },
  { valor: 'saco', alias: ['saco', 'sacos'] }, { valor: 'caja', alias: ['caja', 'cajas'] },
];

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
      ['Perfume en frascos', 'PERF-001', '', 'Perfumería', 'producto', '20 frascos de 100 ml', 30000, 45000, 20, 3, 'ml', 'activo', 'Sí', 'envase', 100, 'ml', 'frasco'],
      ['Manzana a granel', 'FRUT-001', '', 'Fruta', 'producto', 'Comprada por tonelada', 400, 990, 2000, 100, 'kg', 'activo', 'Sí', 'granel', '', 'kg', ''],
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
      ['Envases', '', 'Forma de Compra = envase: Stock Actual es la cantidad de frascos/sacos, Costo y Precio son por envase y Contenido por Envase es obligatorio. Los decants se agregan después en Editar.'],
      ['Granel', '', 'Forma de Compra = granel: Stock, Costo y Precio van en la Unidad Contenido (kg, toneladas, L). Las toneladas se guardan como kg.'],
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
      setError('Formato no admitido. Solo se aceptan archivos .xlsx de la plantilla de descarga.');
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
          return i >= 0 ? limpiarCelda(fila[i]) : '';
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
          const formaCompra = tipo === 'producto' ? elegirEnum(celda(fila, 'formaCompra'), FORMAS_COMPRA, 'unidad') : 'unidad';
          const contenido = parseNumero(celda(fila, 'contenidoEnvase'));
          const unidadContenido = elegirEnum(celda(fila, 'unidadContenido') || (formaCompra === 'granel' ? unidadMedida : ''), UNIDADES_CONTENIDO, formaCompra === 'granel' ? 'kg' : 'ml');
          const textoForma = String(celda(fila, 'formaCompra'));
          const nombreEnvase = elegirEnum(celda(fila, 'nombreEnvase') || textoForma, NOMBRES_ENVASE, unidadBaseDe(unidadContenido) === 'kg' ? 'saco' : 'frasco');

          const errores: string[] = [];
          if (!nombre) errores.push('El nombre es obligatorio.');
          if (costo < 0) errores.push('El costo no puede ser negativo.');
          if (precio < 0) errores.push('El precio no puede ser negativo.');
          if (stock < 0) errores.push('El stock no puede ser negativo.');
          if (stockMinimo < 0) errores.push('El stock mínimo no puede ser negativo.');
          if (formaCompra === 'envase' && !(contenido > 0)) errores.push('Con envases, «Contenido por Envase» es obligatorio.');
          if (formaCompra === 'envase' && !Number.isInteger(stock)) errores.push('Con envases, el stock es la cantidad de envases (número entero).');

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
          // Forma de compra: se convierte a la unidad base (ml o kg) igual que el formulario.
          let stockTexto = `${stock.toLocaleString('es-CL')} ${unidadMedida}`;
          if (formaCompra === 'envase' && contenido > 0) {
            const capacidad = aBase(contenido, unidadContenido);
            const base = unidadBaseDe(unidadContenido);
            const etiquetaU = unidadContenido === 'l' ? 'L' : unidadContenido === 'unidad' ? 'unidades' : unidadContenido;
            Object.assign(productoBase, {
              formaCompra: 'envase', nombreEnvase, controlEnvases: true, capacidadEnvase: capacidad, unidadBase: base, unidadMedida: base,
              stock: stock * capacidad, stockMinimo: stockMinimo * capacidad, costo: capacidad > 0 ? costo / capacidad : costo,
              presentaciones: [{
                id: crypto.randomUUID(), nombre: `${nombreEnvase.charAt(0).toUpperCase()}${nombreEnvase.slice(1)} ${contenido.toLocaleString('es-CL')} ${etiquetaU}`,
                factor: capacidad, precio: Math.round(precio), tipo: 'completa', origen: 'envase_cerrado', activa: true,
              }],
            });
            stockTexto = `${stock.toLocaleString('es-CL')} ${nombreEnvase}s de ${contenido.toLocaleString('es-CL')} ${etiquetaU}`;
          } else if (formaCompra === 'granel') {
            const base = unidadBaseDe(unidadContenido);
            const factor = aBase(1, unidadContenido);
            const etiquetaU = unidadContenido === 'l' ? 'L' : unidadContenido === 't' ? 'tonelada' : unidadContenido;
            Object.assign(productoBase, {
              formaCompra: 'granel', controlEnvases: false, unidadBase: base, unidadMedida: base,
              stock: aBase(stock, unidadContenido), stockMinimo: aBase(stockMinimo, unidadContenido), costo: factor > 0 ? costo / factor : costo,
              presentaciones: [{ id: crypto.randomUUID(), nombre: `1 ${etiquetaU}`, factor, precio: Math.round(precio), tipo: 'porcion', origen: 'granel', activa: true }],
            });
            stockTexto = formatCantidad(aBase(stock, unidadContenido), base);
          } else if (tipo === 'producto') {
            productoBase.formaCompra = 'unidad';
          }

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
            stockTexto,
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

  const cerrarModal = () => { limpiar(); onClose(); };
  const bloqueada = (p: ProductoPrevio) => p.existe || p.errores.length > 0;
  const casilla = (p: ProductoPrevio, clase: string) => (
    <input
      type="checkbox"
      checked={seleccionadas.has(p.clave)}
      disabled={bloqueada(p)}
      onChange={() => toggleSeleccion(p.clave)}
      aria-label={`Importar fila ${p.fila}`}
      className={clase}
    />
  );
  const estadoFila = (p: ProductoPrevio) => p.errores.length > 0 ? (
    <span className="px-2 py-0.5 bg-error-container text-on-error-container rounded-full text-[10px] font-black uppercase whitespace-nowrap">Revisar</span>
  ) : p.existe ? (
    <span className="px-2 py-0.5 bg-surface-container text-on-surface-variant rounded-full text-[10px] font-black uppercase whitespace-nowrap">Ya existe</span>
  ) : (
    <span className="px-2 py-0.5 bg-success-container text-on-success-container rounded-full text-[10px] font-black uppercase whitespace-nowrap">Nuevo</span>
  );
  const observaciones = (p: ProductoPrevio) => (
    <span className="block text-xs">
      {p.existe && <span className="px-2 py-0.5 bg-secondary/20 text-secondary rounded-full">Ya existe</span>}
      {p.errores.map((e, i) => (
        <span key={i} className="block text-error">{e}</span>
      ))}
      {!p.existe && p.errores.length === 0 && <span className="text-success">Listo para importar</span>}
    </span>
  );
  /** Desde md: misma tabla de antes. Bajo md: una tarjeta por fila con la casilla de 44 px. */
  const columnasPrevia: ColumnaTabla<ProductoPrevio>[] = [
    { clave: 'importar', titulo: 'Importar', celda: p => casilla(p, 'w-4 h-4 accent-primary') },
    { clave: 'fila', titulo: 'Fila', celda: p => <span className="text-on-surface-variant font-medium">{p.fila}</span> },
    { clave: 'nombre', titulo: 'Nombre', celda: p => <span className="block font-bold text-on-surface max-w-xs truncate" title={p.nombre}>{p.nombre}</span> },
    { clave: 'codigo', titulo: 'Código', celda: p => <span className="text-on-surface-variant font-mono">{p.codigo}</span> },
    { clave: 'categoria', titulo: 'Categoría', celda: p => <span className="text-on-surface-variant">{p.categoria}</span> },
    { clave: 'tipo', titulo: 'Tipo', celda: p => <span className="text-on-surface-variant capitalize">{p.tipo}</span> },
    { clave: 'costo', titulo: 'Costo', alinear: 'derecha', celda: p => <span className="font-medium whitespace-nowrap">{formatPesos(p.costo)}</span> },
    { clave: 'precio', titulo: 'Precio', alinear: 'derecha', celda: p => <span className="font-medium whitespace-nowrap">{formatPesos(p.precio)}</span> },
    { clave: 'stock', titulo: 'Stock', alinear: 'derecha', celda: p => <span className="font-medium">{p.stockTexto}</span> },
    { clave: 'estado', titulo: 'Estado', alinear: 'centro', celda: p => <span className="capitalize">{p.estado}</span> },
    { clave: 'observaciones', titulo: 'Observaciones', celda: observaciones },
  ];

  if (!isOpen) return null;

  const hayPie = !!archivo && !cargando && previas.length > 0;
  const botonSecundario = 'min-h-11 px-4 py-2 bg-surface-container-lowest border border-outline-variant/40 rounded-full text-sm font-bold transition-all';

  return (
    <ModalResponsivo
      titulo="Carga Masiva de Inventario"
      subtitulo="Importa productos y servicios desde Excel o CSV en un solo paso."
      onCerrar={cerrarModal}
      ancho="sm:max-w-6xl"
      pie={hayPie ? (
        <>
          <p className="w-full sm:w-auto sm:mr-auto text-sm text-on-surface-variant">{seleccionadas.size} productos seleccionados para importar</p>
          <button type="button" onClick={cerrarModal} className="flex-1 sm:flex-none min-h-11 px-6 py-2.5 bg-surface-container-lowest border border-outline-variant/40 rounded-full font-bold hover:bg-surface-container-low transition-all">
            Cancelar
          </button>
          <button
            type="button"
            onClick={importarSeleccionadas}
            disabled={seleccionadas.size === 0}
            className="flex-1 sm:flex-none min-h-11 px-6 py-2.5 bg-primary text-inverse-on-surface rounded-full font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">download</span>
            Importar {seleccionadas.size > 0 ? `(${seleccionadas.size})` : ''}
          </button>
        </>
      ) : undefined}
    >
      <div className="space-y-6">
        {!archivo && (
          <div
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            className={`border-2 border-dashed rounded-2xl p-6 sm:p-10 flex flex-col items-center justify-center text-center transition-all ${arrastrando ? 'border-primary bg-primary/5' : 'border-outline-variant/50 hover:border-primary/40'}`}
          >
            <span className="material-symbols-outlined text-5xl sm:text-6xl text-primary mb-4">cloud_upload</span>
            <h4 className="text-lg sm:text-xl font-bold text-on-surface mb-2">
              <span className="hidden sm:inline">Arrastra tu archivo aquí</span>
              <span className="sm:hidden">Elige tu planilla Excel</span>
            </h4>
            <p className="hidden sm:block text-on-surface-variant mb-4">o</p>
            <button type="button" onClick={() => inputRef.current?.click()} className="min-h-11 px-6 py-3 bg-primary text-inverse-on-surface rounded-full font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
              Seleccionar archivo
            </button>
            <input ref={inputRef} type="file" accept={".xlsx"} onChange={onFileChange} className="hidden" />
            <p className="text-xs text-on-surface-variant mt-4">Formato permitido: .xlsx (plantilla de descarga)</p>
            <button type="button" onClick={descargarPlantilla} className="mt-6 min-h-11 flex items-center gap-2 px-5 py-2 bg-surface-container-lowest border border-outline-variant/40 rounded-full text-sm font-bold hover:bg-surface-container-low transition-all">
              <span className="material-symbols-outlined text-lg">download</span>
              Descargar Plantilla
            </button>
          </div>
        )}

        {archivo && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-surface-container-low rounded-xl border border-outline-variant/30">
              <div className="flex items-center gap-3 min-w-0">
                <span className="material-symbols-outlined text-3xl text-primary shrink-0">description</span>
                <div className="min-w-0">
                  <p className="font-bold text-on-surface break-all">{archivo.name}</p>
                  <p className="text-xs text-on-surface-variant">{(archivo.size / 1024).toFixed(2)} KB</p>
                </div>
              </div>
              <button type="button" onClick={limpiar} className="min-h-11 flex items-center gap-2 px-4 py-2 bg-surface-container-lowest border border-outline-variant/40 rounded-full text-sm font-bold hover:bg-error/10 hover:text-error transition-all">
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
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-on-surface">{previas.length} filas detectadas</p>
                    <p className="text-sm text-on-surface-variant">
                      {seleccionadas.size} seleccionadas para importar · {previas.filter(p => p.existe).length} ya existen · {previas.filter(p => p.errores.length > 0).length} con errores
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button type="button" onClick={seleccionarTodo} className={cn(botonSecundario, 'hover:bg-primary/5')}>
                      Seleccionar válidas
                    </button>
                    <button type="button" onClick={limpiarSeleccion} className={cn(botonSecundario, 'hover:bg-surface-container-low')}>
                      Limpiar selección
                    </button>
                  </div>
                </div>

                <div className="border border-outline-variant/30 rounded-xl overflow-hidden">
                  <TablaResponsiva
                    filas={previas}
                    clave={p => p.clave}
                    columnas={columnasPrevia}
                    tituloTarjeta={p => (
                      <label className="flex min-h-11 items-center gap-3">
                        {casilla(p, 'h-5 w-5 shrink-0 accent-primary')}
                        <span className="min-w-0 break-words">{p.nombre || 'Sin nombre'}</span>
                      </label>
                    )}
                    subtituloTarjeta={p => (
                      <>
                        <span>Fila {p.fila}{p.codigo ? ` · ${p.codigo}` : ''}{p.categoria ? ` · ${p.categoria}` : ''} · <span className="capitalize">{p.tipo}</span> · <span className="capitalize">{p.estado}</span></span>
                        {observaciones(p)}
                      </>
                    )}
                    insigniaTarjeta={estadoFila}
                    datosTarjeta={p => [
                      { etiqueta: 'Costo', valor: formatPesos(p.costo) },
                      { etiqueta: 'Precio', valor: formatPesos(p.precio) },
                      { etiqueta: 'Stock', valor: p.stockTexto },
                    ]}
                  />
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
    </ModalResponsivo>
  );
}
