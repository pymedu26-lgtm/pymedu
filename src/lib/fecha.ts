// Utilidades de fecha local.
// Evitan `new Date(...).toISOString()` para fechas sin hora: en Chile (UTC-3/-4)
// ese patron guarda el dia anterior. Trabajamos siempre con texto local
// "AAAA-MM-DD" y solo construimos Date con componentes locales.

const ISO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Fecha local como texto 'AAAA-MM-DD'. */
export function aIsoLocal(fecha: Date = new Date()): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/** Fecha de hoy (local) como texto 'AAAA-MM-DD'. */
export function hoyIso(): string {
  return aIsoLocal(new Date());
}

/**
 * Convierte 'AAAA-MM-DD' a Date local a medianoche.
 * Para textos con hora (ISO completo) delega en Date para no perderla.
 */
export function parseFechaLocal(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const match = ISO_DIA.exec(valor);
  if (match) {
    const [, anio, mes, dia] = match;
    return new Date(Number(anio), Number(mes) - 1, Number(dia));
  }
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** Formatea una fecha 'AAAA-MM-DD' sin corrimientos de zona horaria. */
export function formatearFechaLocal(
  valor: string | null | undefined,
  opciones: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' },
  locale = 'es-CL',
): string {
  const fecha = parseFechaLocal(valor);
  return fecha ? fecha.toLocaleDateString(locale, opciones) : '';
}

/** Formatea fecha y hora respetando la hora local del texto original. */
export function formatearFechaHoraLocal(
  valor: string | null | undefined,
  opciones: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  },
  locale = 'es-CL',
): string {
  const fecha = parseFechaLocal(valor);
  return fecha ? fecha.toLocaleString(locale, opciones) : '';
}

/** Rango ISO del mes natural indicado (0 = mes actual, -1 = mes anterior). */
export function rangoMes(offset = 0, base: Date = new Date()): { inicio: string; fin: string } {
  const inicio = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const fin = new Date(base.getFullYear(), base.getMonth() + offset + 1, 0);
  return { inicio: aIsoLocal(inicio), fin: aIsoLocal(fin) };
}

/** Rango ISO de los ultimos N meses completos hasta el mes actual. */
export function rangoUltimosMeses(meses = 3, base: Date = new Date()): { inicio: string; fin: string } {
  const inicio = new Date(base.getFullYear(), base.getMonth() - (meses - 1), 1);
  const fin = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return { inicio: aIsoLocal(inicio), fin: aIsoLocal(fin) };
}

/**
 * Convierte 'AAAA-MM-DD' a un timestamp ISO local (mediodia) para guardar en
 * campos que esperan fecha y hora. Usar mediodia evita que un cambio de zona
 * horaria mueva el dia guardado.
 */
export function timestampDesdeFechaLocal(valor: string | null | undefined): string {
  const fecha = parseFechaLocal(valor);
  if (!fecha) return '';
  fecha.setHours(12, 0, 0, 0);
  return fecha.toISOString();
}

/** Compara dos fechas 'AAAA-MM-DD' como texto (funciona por orden lexicografico). */
export function compararFecha(a: string | null | undefined, b: string | null | undefined): number {
  return (a ?? '').localeCompare(b ?? '');
}

export type EstadoVigencia = 'programada' | 'activa' | 'vencida';

/** Estado de una promocion u oferta segun su rango de fechas. */
export function estadoVigencia(
  fechaInicio: string | null | undefined,
  fechaFin: string | null | undefined,
  hoy: string = hoyIso(),
): EstadoVigencia {
  if (fechaInicio && fechaInicio > hoy) return 'programada';
  if (fechaFin && fechaFin < hoy) return 'vencida';
  return 'activa';
}

export type EstadoVencimiento = 'sin_fecha' | 'vencida' | 'por_vencer' | 'vigente';

/**
 * Estado de una cuenta por pagar o cobrar respecto de hoy.
 * 'por_vencer' cubre los proximos `diasAviso` dias (por defecto una semana).
 */
export function estadoVencimiento(
  fecha: string | null | undefined,
  hoy: string = hoyIso(),
  diasAviso = 7,
): EstadoVencimiento {
  if (!fecha) return 'sin_fecha';
  if (fecha < hoy) return 'vencida';
  const objetivo = parseFechaLocal(fecha);
  const base = parseFechaLocal(hoy);
  if (!objetivo || !base) return 'vigente';
  const dias = Math.round((objetivo.getTime() - base.getTime()) / 86400000);
  return dias <= diasAviso ? 'por_vencer' : 'vigente';
}
