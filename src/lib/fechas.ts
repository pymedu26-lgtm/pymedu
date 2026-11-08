// Utilidades de fecha y monto compartidas por toda la app.
// Regla (correcciones #3, #13 y #29): las fechas de documento son fechas SIN hora
// ('YYYY-MM-DD') y se muestran como dd-mm-aaaa; los montos en pesos van sin decimales.

const pad = (n: number) => String(n).padStart(2, '0');

/** Fecha local como 'YYYY-MM-DD'. No usa toISOString(), que convierte a UTC y corre el día. */
export function isoLocal(fecha: Date = new Date()): string {
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}

export const hoyISO = () => isoLocal(new Date());

/** Periodo 'YYYY-MM' del mes en curso (hora local). */
export const periodoActual = () => hoyISO().slice(0, 7);

/** Interpreta 'YYYY-MM-DD' (o con hora) como fecha local a medianoche, sin desfase UTC. */
export function parseFechaLocal(iso?: string): Date | null {
  const [y, m, d] = (iso ?? '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Rango de un mes natural relativo al actual (0 = este mes, -1 = anterior). */
export function rangoMes(offset = 0, base = new Date()) {
  return {
    inicio: isoLocal(new Date(base.getFullYear(), base.getMonth() + offset, 1)),
    fin: isoLocal(new Date(base.getFullYear(), base.getMonth() + offset + 1, 0)),
  };
}

/** Últimos `n` meses completos contando el actual. */
export function rangoUltimosMeses(n: number, base = new Date()) {
  return {
    inicio: isoLocal(new Date(base.getFullYear(), base.getMonth() - (n - 1), 1)),
    fin: isoLocal(new Date(base.getFullYear(), base.getMonth() + 1, 0)),
  };
}

/** Días entre dos fechas ISO (b - a), sin efectos de horario de verano. */
export function diasEntre(a: string, b: string): number {
  const fa = parseFechaLocal(a);
  const fb = parseFechaLocal(b);
  if (!fa || !fb) return 0;
  return Math.round((Date.UTC(fb.getFullYear(), fb.getMonth(), fb.getDate()) - Date.UTC(fa.getFullYear(), fa.getMonth(), fa.getDate())) / 86_400_000);
}

/** dd-mm-aaaa (formato único de la app, corrección #29). */
export function formatFecha(iso?: string): string {
  const [y, m, d] = (iso ?? '').split('T')[0].split('-');
  if (!y || !m || !d) return iso || '—';
  return `${d}-${m}-${y}`;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** 'YYYY-MM' → 'Noviembre 2026'. */
export function nombrePeriodo(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number);
  const nombre = MESES[(m || 1) - 1] ?? '';
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${y}`;
}

/** 'YYYY-MM' → 'nov 26'. */
export const nombrePeriodoCorto = (periodo: string) => {
  const [y, m] = periodo.split('-').map(Number);
  return `${MESES_CORTOS[(m || 1) - 1]} ${String(y).slice(2)}`;
};

/** Pesos chilenos sin decimales (corrección #13). */
export function formatCLP(n: number | null | undefined): string {
  const valor = Math.round(Number(n) || 0);
  return `${valor < 0 ? '-' : ''}$${Math.abs(valor).toLocaleString('es-CL')}`;
}

/** Versión compacta para ejes de gráficos: $1,2 M · $350 mil. */
export function formatCLPCorto(n: number): string {
  const abs = Math.abs(n);
  const signo = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${signo}$${(abs / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 })} M`;
  if (abs >= 1_000) return `${signo}$${Math.round(abs / 1_000).toLocaleString('es-CL')} mil`;
  return `${signo}$${Math.round(abs).toLocaleString('es-CL')}`;
}

/** Redondeo a peso entero para cálculos de montos. */
export const redondearCLP = (n: number) => Math.round(Number(n) || 0);
