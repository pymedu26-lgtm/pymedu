import { useRef, useState, ChangeEvent, DragEvent } from 'react';
import * as XLSX from 'xlsx';
import { Cliente } from '../context/ERPContext';
import {
  descargarLibroPlantilla, extensionValida,
  formatPesos, mapearColumnas, normKey, parseNumero,
} from './cargaMasivaUtil';

type ClienteNuevo = Omit<Cliente, 'id' | 'ventas' | 'deuda'>;

interface ModalCargaMasivaClientesProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (clientes: ClienteNuevo[]) => void;
  clientesExistentes: Cliente[];
}

type CampoClave =
  | 'nombre' | 'rut' | 'telefono' | 'email' | 'direccion'
  | 'comuna' | 'limiteCredito' | 'notas';

interface ClientePrevio {
  clave: string;
  fila: number;
  nombre: string;
  rut: string;
  telefono: string;
  email: string;
  direccion: string;
  comuna: string;
  limiteCredito: number;
  notas: string;
  existe: boolean;
  errores: string[];
  cliente: ClienteNuevo;
}

const COLUMNAS: { campo: CampoClave; titulo: string; obligatorio: boolean; ayuda: string }[] = [
  { campo: 'nombre', titulo: 'Nombre', obligatorio: true, ayuda: 'Nombre o razón social del cliente.' },
  { campo: 'rut', titulo: 'RUT', obligatorio: false, ayuda: 'RUT del cliente con dígito verificador. Debe ser único.' },
  { campo: 'telefono', titulo: 'Teléfono', obligatorio: false, ayuda: 'Número de contacto, ej: +56912345678.' },
  { campo: 'email', titulo: 'Email', obligatorio: false, ayuda: 'Correo electrónico de contacto.' },
  { campo: 'direccion', titulo: 'Dirección', obligatorio: false, ayuda: 'Dirección particular o comercial.' },
  { campo: 'comuna', titulo: 'Comuna', obligatorio: false, ayuda: 'Comuna del cliente.' },
  { campo: 'limiteCredito', titulo: 'Límite de Crédito', obligatorio: false, ayuda: 'Monto máximo de crédito. Por defecto 0.' },
  { campo: 'notas', titulo: 'Notas', obligatorio: false, ayuda: 'Observaciones internas del cliente.' },
];

const ALIAS: Record<CampoClave, string[]> = {
  nombre: ['nombre', 'cliente', 'razonsocial', 'nombrecliente', 'razon_social', 'nombreo_razon_social'],
  rut: ['rut', 'rutcliente', 'dni', 'documento', 'rut_empresa'],
  telefono: ['telefono', 'teléfono', 'fono', 'celular', 'contacto', 'movil', 'telefono_contacto', 'telefono1'],
  email: ['email', 'correo', 'correoelectronico', 'mail', 'email_contacto', 'correo_electronico'],
  direccion: ['direccion', 'dirección', 'domicilio', 'direccioncliente', 'direccion_cliente'],
  comuna: ['comuna', 'ciudad', 'municipio', 'localidad'],
  limiteCredito: ['limitecredito', 'limite_credito', 'credito', 'limite', 'cupo'],
  notas: ['notas', 'nota', 'observaciones', 'comentarios', 'detalle'],
};

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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function descargarPlantilla() {
  descargarLibroPlantilla(
    'plantilla_clientes.xlsx',
    'Clientes',
    [
      COLUMNAS.map(c => c.titulo),
      ['Cliente de Ejemplo', '12.345.678-9', '+56912345678', 'cliente@ejemplo.cl', 'Av. Siempre Viva 123', 'Santiago', 100000, 'Cliente frecuente'],
      ['Empresa Ejemplo SpA', '76.543.210-K', '+56987654321', 'contacto@empresa.cl', 'Camino Empresarial 456', 'Providencia', 500000, 'Crédito a 30 días'],
    ],
    COLUMNAS.map(c => ({ wch: Math.max(16, c.titulo.length + 4) })),
    [
      ['Columna', 'Obligatorio', 'Descripción'],
      ...COLUMNAS.map(c => [c.titulo, c.obligatorio ? 'Si' : 'No', c.ayuda]),
      [],
      ['RUT', '', 'Si se ingresa, debe ser válido y único. Clientes con el mismo RUT no se importan.'],
      ['Email', '', 'Si se ingresa, debe tener un formato de correo válido.'],
      ['Límite de Crédito', '', 'Monto máximo. Usa 0 o déjalo vacío si no corresponde.'],
    ],
    [{ wch: 20 }, { wch: 14 }, { wch: 95 }]
  );
}

export default function ModalCargaMasivaClientes({
  isOpen, onClose, onImport, clientesExistentes
}: ModalCargaMasivaClientesProps) {
  const [arrastrando, setArrastrando] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previas, setPrevias] = useState<ClientePrevio[]>([]);
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
        if (filas.length < 2) throw new Error('La hoja está vacía: necesitas el encabezado y al menos un cliente.');

        const indiceEncabezado = filas.findIndex(fila => mapearColumnas(fila, ALIAS).nombre >= 0);
        if (indiceEncabezado < 0) {
          throw new Error('No se reconoce el encabezado. Descarga la plantilla y copia sus columnas.');
        }

        const columnas = mapearColumnas(filas[indiceEncabezado], ALIAS);
        const celda = (fila: unknown[], campo: CampoClave) => {
          const i = columnas[campo];
          return i >= 0 ? fila[i] ?? '' : '';
        };

        const existentesRut = new Map(
          clientesExistentes.filter(c => normKey(c.rut)).map(c => [normKey(c.rut), c.id])
        );
        const existentesNombres = new Map(clientesExistentes.map(c => [normKey(c.nombre), c.id]));

        const resultados: ClientePrevio[] = [];

        filas.slice(indiceEncabezado + 1).forEach((fila, offset) => {
          const numeroFila = indiceEncabezado + offset + 2;
          if (!fila.some(v => String(v ?? '').trim() !== '')) return;

          const nombre = String(celda(fila, 'nombre')).trim();
          const rut = String(celda(fila, 'rut')).trim();
          const telefono = String(celda(fila, 'telefono')).trim();
          const email = String(celda(fila, 'email')).trim();
          const direccion = String(celda(fila, 'direccion')).trim();
          const comuna = String(celda(fila, 'comuna')).trim();
          const limiteCredito = parseNumero(celda(fila, 'limiteCredito'));
          const notas = String(celda(fila, 'notas')).trim();

          const errores: string[] = [];
          if (!nombre) errores.push('El nombre es obligatorio.');
          if (rut && !validarRUT(rut)) errores.push('El RUT no es válido. Revisa el dígito verificador.');
          if (email && !EMAIL_REGEX.test(email)) errores.push('El email no tiene un formato válido.');
          if (limiteCredito < 0) errores.push('El límite de crédito no puede ser negativo.');

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
            direccion,
            comuna,
            limiteCredito,
            notas,
            existe,
            errores,
            cliente: {
              nombre,
              rut: rut || undefined,
              telefono,
              email,
              direccion: direccion || undefined,
              comuna: comuna || undefined,
              notas: notas || undefined,
              limite_credito: limiteCredito > 0 ? limiteCredito : undefined,
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
      .map(p => p.cliente);
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
            <h3 className="text-2xl font-black text-primary">Carga Masiva de Clientes</h3>
            <p className="text-on-surface-variant text-sm mt-1">Importa múltiples clientes desde Excel en un solo paso.</p>
          </div>
          <button onClick={() => { limpiar(); onClose(); }} className="text-on-surface-variant hover:text-error transition-colors">
            <span className="material-symbols-outlined text-3xl">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!archivo && (
            <div
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDragEnter={onDragEnter}
              onDragLeave={onDragLeave}
              className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center transition-all ${arrastrando ? 'border-primary bg-primary/5' : 'border-outline-variant/50 hover:border-primary/40'}`}
            >
              <span className="material-symbols-outlined text-6xl text-primary mb-4">cloud_upload</span>
              <h4 className="text-xl font-bold text-on-surface mb-2">Arrastra tu archivo aquí</h4>
              <p className="text-on-surface-variant mb-4">o</p>
              <button onClick={() => inputRef.current?.click()} className="px-6 py-3 bg-primary text-inverse-on-surface rounded-full font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
                Seleccionar archivo
              </button>
              <input ref={inputRef} type="file" accept=".xlsx" onChange={onFileChange} className="hidden" />
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
                          <th className="px-4 py-3 text-left font-bold text-on-surface-variant">RUT</th>
                          <th className="px-4 py-3 text-left font-bold text-on-surface-variant">Teléfono</th>
                          <th className="px-4 py-3 text-left font-bold text-on-surface-variant">Email</th>
                          <th className="px-4 py-3 text-left font-bold text-on-surface-variant">Comuna</th>
                          <th className="px-4 py-3 text-right font-bold text-on-surface-variant">Límite</th>
                          <th className="px-4 py-3 text-left font-bold text-on-surface-variant">Observaciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previas.map(p => {
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
                              <td className="px-4 py-2 text-on-surface-variant font-mono">{p.rut}</td>
                              <td className="px-4 py-2 text-on-surface-variant whitespace-nowrap">{p.telefono}</td>
                              <td className="px-4 py-2 text-on-surface-variant max-w-xs truncate" title={p.email}>{p.email}</td>
                              <td className="px-4 py-2 text-on-surface-variant">{p.comuna}</td>
                              <td className="px-4 py-2 text-right font-medium">{formatPesos(p.limiteCredito)}</td>
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
            <p className="text-sm text-on-surface-variant">{seleccionadas.size} clientes seleccionados para importar</p>
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
