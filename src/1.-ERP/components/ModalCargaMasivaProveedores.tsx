import { useRef, useState, ChangeEvent, DragEvent } from 'react';
import * as XLSX from 'xlsx';
import { Proveedor } from '../context/ERPContext';
import {
  descargarLibroPlantilla, extensionValida,
  formatPesos, mapearColumnas, normKey, parseNumero,
  limpiarCelda,
} from './cargaMasivaUtil';
import TablaResponsiva, { type ColumnaTabla } from '../../components/TablaResponsiva';
import ModalResponsivo from '../../components/ModalResponsivo';
import { cn } from '@/lib/utils';

type ProveedorNuevo = Omit<Proveedor, 'id' | 'deuda'>;

interface ModalCargaMasivaProveedoresProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (proveedores: ProveedorNuevo[]) => void;
  proveedoresExistentes: Proveedor[];
}

type CampoClave =
  | 'nombre' | 'rut' | 'telefono' | 'email' | 'categoria'
  | 'condicionPago';

interface ProveedorPrevio {
  clave: string;
  fila: number;
  nombre: string;
  rut: string;
  telefono: string;
  email: string;
  categoria: string;
  condicionPago: string;
  existe: boolean;
  errores: string[];
  proveedor: ProveedorNuevo;
}

const CATEGORIAS = ['Insumos / Mercaderia', 'Servicios Basicos', 'Arriendo', 'Sueldos', 'Publicidad', 'Tecnologia', 'Transporte', 'Otros'];

const COLUMNAS: { campo: CampoClave; titulo: string; obligatorio: boolean; ayuda: string }[] = [
  { campo: 'nombre', titulo: 'Nombre', obligatorio: true, ayuda: 'Nombre o razón social del proveedor.' },
  { campo: 'rut', titulo: 'RUT', obligatorio: false, ayuda: 'RUT del proveedor con dígito verificador. Debe ser único.' },
  { campo: 'telefono', titulo: 'Teléfono', obligatorio: false, ayuda: 'Número de contacto, ej: +56912345678.' },
  { campo: 'email', titulo: 'Email', obligatorio: false, ayuda: 'Correo electrónico de contacto.' },
  { campo: 'categoria', titulo: 'Categoría', obligatorio: false, ayuda: 'Categoría del proveedor (se asigna una por defecto si está vacía).' },
  { campo: 'condicionPago', titulo: 'Condición de Pago', obligatorio: false, ayuda: 'Ej: 30 días, Contado, etc.' },
];

const ALIAS: Record<CampoClave, string[]> = {
  nombre: ['nombre', 'proveedor', 'razonsocial', 'nombreproveedor', 'razon_social'],
  rut: ['rut', 'rutproveedor', 'dni', 'documento', 'rut_empresa'],
  telefono: ['telefono', 'teléfono', 'fono', 'celular', 'contacto', 'movil', 'telefono_contacto'],
  email: ['email', 'correo', 'correoelectronico', 'mail', 'email_contacto', 'correo_electronico'],
  categoria: ['categoria', 'categoría', 'tipo', 'giro', 'rublo'],
  condicionPago: ['condicionpago', 'condicion_pago', 'condicion', 'formapago', 'forma_pago', 'plazo'],
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validarRUT(rut: string): boolean {
  const limpio = (rut ?? '').replace(/[^0-9kK]/g, '');
  if (limpio.length < 2) return false;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1).toUpperCase();
  if (cuerpo.length < 1 || cuerpo.length > 8) return false;
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  const dvEsperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  return dv === dvEsperado;
}

function descargarPlantilla() {
  descargarLibroPlantilla(
    'plantilla_proveedores.xlsx',
    'Proveedores',
    [
      COLUMNAS.map(c => c.titulo),
      ['Proveedor Ejemplo', '76.543.210-K', '+56912345678', 'proveedor@ejemplo.cl', 'Insumos / Mercaderia', '30 días'],
      ['Servicios Ejemplo Ltda.', '12.345.678-9', '+56987654321', 'contacto@servicios.cl', 'Servicios Basicos', 'Contado'],
    ],
    COLUMNAS.map(c => ({ wch: Math.max(16, c.titulo.length + 4) })),
    [
      ['Columna', 'Obligatorio', 'Descripción'],
      ...COLUMNAS.map(c => [c.titulo, c.obligatorio ? 'Si' : 'No', c.ayuda]),
      [],
      ['RUT', '', 'Si se ingresa, debe ser válido y único.'],
      ['Email', '', 'Si se ingresa, debe tener un formato de correo válido.'],
      ['Categoría', '', `Valores sugeridos: ${CATEGORIAS.join(', ')}`],
    ],
    [{ wch: 20 }, { wch: 14 }, { wch: 95 }]
  );
}

export default function ModalCargaMasivaProveedores({
  isOpen, onClose, onImport, proveedoresExistentes
}: ModalCargaMasivaProveedoresProps) {
  const [arrastrando, setArrastrando] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previas, setPrevias] = useState<ProveedorPrevio[]>([]);
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
        if (filas.length < 2) throw new Error('La hoja está vacía: necesitas el encabezado y al menos un proveedor.');

        const indiceEncabezado = filas.findIndex(fila => mapearColumnas(fila, ALIAS).nombre >= 0);
        if (indiceEncabezado < 0) {
          throw new Error('No se reconoce el encabezado. Descarga la plantilla y copia sus columnas.');
        }

        const columnas = mapearColumnas(filas[indiceEncabezado], ALIAS);
        const celda = (fila: unknown[], campo: CampoClave) => {
          const i = columnas[campo];
          return i >= 0 ? limpiarCelda(fila[i]) : '';
        };

        const existentesRut = new Map(
          proveedoresExistentes.filter(c => normKey(c.rut)).map(c => [normKey(c.rut), c.id])
        );
        const existentesNombres = new Map(proveedoresExistentes.map(c => [normKey(c.nombre), c.id]));

        const resultados: ProveedorPrevio[] = [];

        filas.slice(indiceEncabezado + 1).forEach((fila, offset) => {
          const numeroFila = indiceEncabezado + offset + 2;
          if (!fila.some(v => String(v ?? '').trim() !== '')) return;

          const nombre = String(celda(fila, 'nombre')).trim();
          const rut = String(celda(fila, 'rut')).trim();
          const telefono = String(celda(fila, 'telefono')).trim();
          const email = String(celda(fila, 'email')).trim();
          const categoria = String(celda(fila, 'categoria')).trim();
          const condicionPago = String(celda(fila, 'condicionPago')).trim();

          const errores: string[] = [];
          if (!nombre) errores.push('El nombre es obligatorio.');
          if (rut && !validarRUT(rut)) errores.push('El RUT no es válido. Revisa el dígito verificador.');
          if (email && !EMAIL_REGEX.test(email)) errores.push('El email no tiene un formato válido.');

          const claveNormRut = normKey(rut);
          const claveNormNombre = normKey(nombre);
          let existe = false;
          if (claveNormRut && existentesRut.has(claveNormRut)) existe = true;
          if (!existe && claveNormNombre && existentesNombres.has(claveNormNombre)) existe = true;

          resultados.push({
            clave: `f${numeroFila}-${claveNormRut || claveNormNombre || Math.random()}`,
            fila: numeroFila,
            nombre,
            rut,
            telefono,
            email,
            categoria,
            condicionPago,
            existe,
            errores,
            proveedor: {
              nombre,
              rut: rut || undefined,
              telefono,
              email: email || undefined,
              categoria: categoria || CATEGORIAS[0],
              condicion_pago: condicionPago || undefined,
            },
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
      .map(p => p.proveedor);
    if (aImportar.length === 0) return;
    onImport(aImportar);
    limpiar();
    onClose();
  };

  const cerrarModal = () => { limpiar(); onClose(); };
  const bloqueada = (p: ProveedorPrevio) => p.existe || p.errores.length > 0;
  const casilla = (p: ProveedorPrevio, clase: string) => (
    <input
      type="checkbox"
      checked={seleccionadas.has(p.clave)}
      disabled={bloqueada(p)}
      onChange={() => toggleSeleccion(p.clave)}
      aria-label={`Importar fila ${p.fila}`}
      className={clase}
    />
  );
  const estadoFila = (p: ProveedorPrevio) => p.errores.length > 0 ? (
    <span className="px-2 py-0.5 bg-error-container text-on-error-container rounded-full text-[10px] font-black uppercase whitespace-nowrap">Revisar</span>
  ) : p.existe ? (
    <span className="px-2 py-0.5 bg-surface-container text-on-surface-variant rounded-full text-[10px] font-black uppercase whitespace-nowrap">Ya existe</span>
  ) : (
    <span className="px-2 py-0.5 bg-success-container text-on-success-container rounded-full text-[10px] font-black uppercase whitespace-nowrap">Nuevo</span>
  );
  const observaciones = (p: ProveedorPrevio) => (
    <span className="block text-xs">
      {p.existe && <span className="px-2 py-0.5 bg-secondary/20 text-secondary rounded-full">Ya existe</span>}
      {p.errores.map((e, i) => (
        <span key={i} className="block text-error">{e}</span>
      ))}
      {!p.existe && p.errores.length === 0 && <span className="text-success">Listo para importar</span>}
    </span>
  );
  /** Desde md: misma tabla de antes. Bajo md: una tarjeta por fila con la casilla de 44 px. */
  const columnasPrevia: ColumnaTabla<ProveedorPrevio>[] = [
    { clave: 'importar', titulo: 'Importar', celda: p => casilla(p, 'w-4 h-4 accent-primary') },
    { clave: 'fila', titulo: 'Fila', celda: p => <span className="text-on-surface-variant font-medium">{p.fila}</span> },
    { clave: 'nombre', titulo: 'Nombre', celda: p => <span className="block font-bold text-on-surface max-w-xs truncate" title={p.nombre}>{p.nombre}</span> },
    { clave: 'rut', titulo: 'RUT', celda: p => <span className="text-on-surface-variant font-mono">{p.rut}</span> },
    { clave: 'telefono', titulo: 'Teléfono', celda: p => <span className="text-on-surface-variant whitespace-nowrap">{p.telefono}</span> },
    { clave: 'email', titulo: 'Email', celda: p => <span className="block text-on-surface-variant max-w-xs truncate" title={p.email}>{p.email}</span> },
    { clave: 'categoria', titulo: 'Categoría', celda: p => <span className="text-on-surface-variant">{p.categoria}</span> },
    { clave: 'condicion', titulo: 'Condición', celda: p => <span className="text-on-surface-variant">{p.condicionPago}</span> },
    { clave: 'observaciones', titulo: 'Observaciones', celda: observaciones },
  ];

  if (!isOpen) return null;

  const hayPie = !!archivo && !cargando && previas.length > 0;
  const botonSecundario = 'min-h-11 px-4 py-2 bg-surface-container-lowest border border-outline-variant/40 rounded-full text-sm font-bold transition-all';

  return (
    <ModalResponsivo
      titulo="Carga Masiva de Proveedores"
      subtitulo="Importa múltiples proveedores desde Excel en un solo paso."
      onCerrar={cerrarModal}
      ancho="sm:max-w-6xl"
      pie={hayPie ? (
        <>
          <p className="w-full sm:w-auto sm:mr-auto text-sm text-on-surface-variant">{seleccionadas.size} proveedores seleccionados para importar</p>
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
              <button type="button" onClick={limpiar} className="min-h-11 flex items-center gap-2 px-4 py-2 bg-surface-container-lowest border border-outline-variant/40 rounded-full text-sm font-bold hover:bg-primary/10 hover:text-primary transition-all">
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
                        <span>Fila {p.fila}{p.rut ? ` · ${p.rut}` : ''}</span>
                        {observaciones(p)}
                      </>
                    )}
                    insigniaTarjeta={estadoFila}
                    datosTarjeta={p => [
                      { etiqueta: 'Categoría', valor: p.categoria || '—' },
                      { etiqueta: 'Condición', valor: p.condicionPago || '—' },
                      { etiqueta: 'Teléfono', valor: p.telefono || '—' },
                      { etiqueta: 'Email', valor: <span className="break-all">{p.email || '—'}</span> },
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
