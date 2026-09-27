import * as XLSX from 'xlsx';
import { EstadoPago, MetodoPago } from '../context/ERPContext';

export const EXTENSIONES = ['.xlsx', '.xls', '.xlsm', '.csv'];

export const METODOS_PAGO: { valor: MetodoPago; alias: string[] }[] = [
  { valor: 'efectivo', alias: ['efectivo', 'cash', 'efectivopago'] },
  { valor: 'transferencia', alias: ['transferencia', 'transferenciaelectronica', 'bancotransferencia', 'bancotransfer', 'transfer'] },
  { valor: 'debito', alias: ['debito', 'tarjetadebito', 'debitocredito'] },
  { valor: 'credito', alias: ['credito', 'tarjetacredito', 'creditocredito'] },
  { valor: 'cheque', alias: ['cheque', 'cheques'] },
  { valor: 'mixto', alias: ['mixto', 'multiple', 'varios'] },
];

/** Estados de pago comunes. Cada modulo amplia esta lista segun su semantica. */
export const ESTADOS: { valor: EstadoPago; alias: string[] }[] = [
  { valor: 'Pagado', alias: ['pagado', 'pagada', 'paid', 'cancelado', 'cobrado', 'pagadas'] },
  { valor: 'Pendiente', alias: ['pendiente', 'pendientedepago', 'pendientes', 'unpaid'] },
];

/** Normaliza un encabezado para comparar sin tildes, espacios ni signos. */
export function normKey(valor: unknown): string {
  return String(valor ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Detecta si el archivo tiene extensión compatible con Excel/CSV. */
export function extensionValida(nombre: string): boolean {
  const ext = nombre.slice(nombre.lastIndexOf('.')).toLowerCase();
  return EXTENSIONES.includes(ext);
}

export function pad2(n: number | string): string {
  return String(n).padStart(2, '0');
}

export function aISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Serial de Excel (días desde 1899-12-30) → aaaa-mm-dd. */
export function serialAISO(serial: number): string {
  const d = new Date(Math.round((serial - 25569) * 86400000));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Acepta Date de Excel, serial numérico y texto en formatos Chilean, ISO o compacto. */
export function parseFecha(valor: unknown): string {
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
export function parseNumero(valor: unknown): number {
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

export function elegirEnum<T extends string>(valor: unknown, opciones: { valor: T; alias: string[] }[], defecto: T): T {
  const clave = normKey(valor);
  if (!clave) return defecto;
  const encontrada = opciones.find(o => o.alias.some(a => normKey(a) === clave));
  return encontrada ? encontrada.valor : defecto;
}

/** Resuelve el índice de cada columna del archivo tolerando nombres alternativos. */
export function mapearColumnas<T extends string>(encabezados: unknown[], alias: Record<T, string[]>): Record<T, number> {
  const mapa = {} as Record<T, number>;
  (Object.keys(alias) as T[]).forEach(campo => {
    const indice = encabezados.findIndex(h => alias[campo].some(a => normKey(a) === normKey(h)));
    mapa[campo] = indice;
  });
  return mapa;
}

export function formatPesos(monto: number): string {
  return `$${Math.round(monto).toLocaleString('es-CL')}`;
}

/** Genera y descarga un libro xlsx con la plantilla de datos y una hoja de instrucciones. */
export function descargarLibroPlantilla(
  nombreArchivo: string,
  hojaDatos: string,
  matrizDatos: (string | number)[][],
  anchosDatos: { wch: number }[],
  instrucciones: (string | number)[][],
  anchosInstrucciones: { wch: number }[]
) {
  const hoja = XLSX.utils.aoa_to_sheet(matrizDatos);
  hoja['!cols'] = anchosDatos;
  hoja['!autofilter'] = { ref: hoja['!ref'] ?? 'A1:A1' };

  const hojaInstrucciones = XLSX.utils.aoa_to_sheet(instrucciones);
  hojaInstrucciones['!cols'] = anchosInstrucciones;

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, hojaDatos);
  XLSX.utils.book_append_sheet(libro, hojaInstrucciones, 'Instrucciones');

  const datos = XLSX.write(libro, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([datos], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = nombreArchivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
