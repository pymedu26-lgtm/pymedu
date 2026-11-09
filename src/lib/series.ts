// Series temporales y rankings para los gráficos del ERP. Funciones puras, sin React.
// Las fechas son locales 'YYYY-MM-DD' (nunca toISOString(), que corre el día por UTC).
import { diasEntre, formatFecha, hoyISO, isoLocal, nombrePeriodo, nombrePeriodoCorto, parseFechaLocal } from './fechas';

export type Granularidad = 'dia' | 'semana' | 'mes' | 'trimestre';
export interface RangoFechas { inicio: string; fin: string }

/** Un tramo del eje X: clave estable, etiquetas para eje/tooltip y los valores sumados. */
export type PuntoSerie<K extends string = string> = {
  clave: string;
  /** Texto corto del eje: `12`, `sem 03-nov`, `nov`, `nov 26`. */
  etiqueta: string;
  /** Texto del tooltip: `Lun 03-11-2026`, `Semana 03-11-2026 al 09-11-2026`, `Noviembre 2026`. */
  etiquetaLarga: string;
  /** Fechas reales que cubre el tramo, recortadas al rango elegido. */
  inicio: string;
  fin: string;
} & Record<K, number>;

export interface Serie<K extends string = string> {
  puntos: PuntoSerie<K>[];
  granularidad: Granularidad;
  rango: RangoFechas | null;
}

export interface ItemValor {
  nombre: string;
  valor: number;
  /** Solo en el tramo "Otros": cuántos elementos agrupa. */
  agrupados?: number;
}

export const NOMBRE_GRANULARIDAD: Record<Granularidad, string> = {
  dia: 'por día', semana: 'por semana', mes: 'por mes', trimestre: 'por trimestre',
};

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const mesCorto = (iso: string) => nombrePeriodoCorto(iso.slice(0, 7)).split(' ')[0];
const sumarDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * Tamaño del tramo según el largo del rango, para que un gráfico nunca pase de ~35 puntos:
 * hasta 31 días → día · hasta 120 → semana (≤ 18) · hasta 3 años → mes (≤ 36) · más → trimestre.
 */
export function granularidad(inicio: string, fin: string): Granularidad {
  const dias = Math.abs(diasEntre(inicio, fin)) + 1;
  if (dias <= 31) return 'dia';
  if (dias <= 120) return 'semana';
  if (dias <= 1096) return 'mes';
  return 'trimestre';
}

/** Primer día del tramo que contiene `d`. Las semanas parten el lunes. */
function inicioTramo(d: Date, g: Granularidad): Date {
  if (g === 'dia') return d;
  if (g === 'semana') return sumarDias(d, -((d.getDay() + 6) % 7));
  return new Date(d.getFullYear(), g === 'mes' ? d.getMonth() : Math.floor(d.getMonth() / 3) * 3, 1);
}

function siguienteTramo(d: Date, g: Granularidad): Date {
  if (g === 'dia') return sumarDias(d, 1);
  if (g === 'semana') return sumarDias(d, 7);
  return new Date(d.getFullYear(), d.getMonth() + (g === 'mes' ? 1 : 3), 1);
}

/** Tramos continuos que cubren todo el rango (sin valores). */
function tramos({ inicio, fin }: RangoFechas, g: Granularidad) {
  const desde = parseFechaLocal(inicio)!;
  const hasta = parseFechaLocal(fin)!;
  const variosMeses = inicio.slice(0, 7) !== fin.slice(0, 7);
  const variosAnios = inicio.slice(0, 4) !== fin.slice(0, 4);
  const sufijoAnio = (iso: string) => (variosAnios ? ` ${iso.slice(2, 4)}` : '');
  const salida: Array<Omit<PuntoSerie<never>, never>> = [];

  for (let d = inicioTramo(desde, g); d <= hasta && salida.length < 400; d = siguienteTramo(d, g)) {
    const clave = isoLocal(d);
    const ultimo = isoLocal(sumarDias(siguienteTramo(d, g), -1));
    const ini = clave < inicio ? inicio : clave;
    const fi = ultimo > fin ? fin : ultimo;
    const recortado = ini !== clave || fi !== ultimo;
    const tramo = ini === fi ? formatFecha(ini) : `${formatFecha(ini)} al ${formatFecha(fi)}`;
    let etiqueta: string;
    let etiquetaLarga: string;
    if (g === 'dia') {
      etiqueta = variosMeses ? `${d.getDate()} ${mesCorto(clave)}` : String(d.getDate());
      etiquetaLarga = `${DIAS[d.getDay()]} ${formatFecha(clave)}`;
    } else if (g === 'semana') {
      etiqueta = `sem ${ini.slice(8, 10)}-${mesCorto(ini)}${sufijoAnio(ini)}`;
      etiquetaLarga = ini === fi ? tramo : `Semana ${tramo}`;
    } else if (g === 'mes') {
      etiqueta = variosAnios ? nombrePeriodoCorto(clave) : mesCorto(clave);
      etiquetaLarga = nombrePeriodo(clave.slice(0, 7)) + (recortado ? ` (${tramo})` : '');
    } else {
      const t = Math.floor(d.getMonth() / 3) + 1;
      etiqueta = `T${t} ${clave.slice(2, 4)}`;
      etiquetaLarga = `Trimestre ${t} de ${d.getFullYear()}` + (recortado ? ` (${tramo})` : '');
    }
    salida.push({ clave, etiqueta, etiquetaLarga, inicio: ini, fin: fi });
  }
  return salida;
}

/**
 * Agrupa registros en tramos continuos que cubren TODO el rango elegido (con ceros donde
 * no hubo movimiento), con la granularidad adecuada al largo del rango. Sin rango, se
 * deduce del primer y último registro. Los tramos futuros vacíos del final se omiten
 * para que "Este mes" no dibuje una caída a cero en los días que aún no llegan.
 *
 * O(n): cada fecha distinta se ubica en su tramo una sola vez (caché por fecha).
 */
// T = any por defecto: si el arreglo llega como any (inferencia circular en una página), los callbacks no quedan en unknown.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function agruparSerie<T = any, K extends string = string>(
  registros: readonly T[],
  rango: Partial<RangoFechas> | null | undefined,
  getFecha: (r: T) => string | null | undefined,
  getValores: (r: T) => Partial<Record<K, number>>,
  opciones: { granularidad?: Granularidad; hoy?: string } = {}
): Serie<K> {
  let inicio = rango?.inicio?.slice(0, 10) || '';
  let fin = rango?.fin?.slice(0, 10) || '';
  if (!inicio || !fin) {
    let min = '';
    let max = '';
    for (const r of registros) {
      const f = getFecha(r)?.slice(0, 10);
      if (!f) continue;
      if (!min || f < min) min = f;
      if (!max || f > max) max = f;
    }
    inicio ||= min;
    fin ||= max;
  }
  if (!parseFechaLocal(inicio) || !parseFechaLocal(fin)) return { puntos: [], granularidad: 'dia', rango: null };
  if (inicio > fin) [inicio, fin] = [fin, inicio];

  const g = opciones.granularidad ?? granularidad(inicio, fin);
  const puntos = tramos({ inicio, fin }, g) as Array<Record<string, number | string> & { clave: string; inicio: string }>;
  const porClave = new Map(puntos.map((p, i) => [p.clave, i]));
  const tramoDeFecha = new Map<string, number>();
  const claves = new Set<string>();

  for (const r of registros) {
    const f = getFecha(r)?.slice(0, 10);
    if (!f || f < inicio || f > fin) continue;
    let i = tramoDeFecha.get(f);
    if (i === undefined) {
      const d = parseFechaLocal(f);
      i = d ? porClave.get(isoLocal(inicioTramo(d, g))) ?? -1 : -1;
      tramoDeFecha.set(f, i);
    }
    if (i < 0) continue;
    const valores = getValores(r) as Record<string, number | undefined>;
    const punto = puntos[i];
    for (const k in valores) {
      claves.add(k);
      punto[k] = ((punto[k] as number) || 0) + (Number(valores[k]) || 0);
    }
  }
  if (claves.size) for (const p of puntos) for (const k of claves) p[k] ??= 0;

  const hoy = opciones.hoy ?? hoyISO();
  const vacio = (p: Record<string, number | string>) => { for (const k of claves) if (p[k]) return false; return true; };
  let n = puntos.length;
  while (n > 1 && puntos[n - 1].inicio > hoy && vacio(puntos[n - 1])) n--;

  return { puntos: (n < puntos.length ? puntos.slice(0, n) : puntos) as unknown as PuntoSerie<K>[], granularidad: g, rango: { inicio, fin } };
}

/** Suma `valor` por `clave` y devuelve la lista ordenada de mayor a menor. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function totalesPor<T = any>(
  registros: readonly T[],
  clave: (r: T) => string | null | undefined,
  valor: (r: T) => number,
  sinClave = 'Sin categoría'
): ItemValor[] {
  const mapa = new Map<string, number>();
  for (const r of registros) {
    const k = clave(r)?.trim() || sinClave;
    mapa.set(k, (mapa.get(k) ?? 0) + (Number(valor(r)) || 0));
  }
  return Array.from(mapa, ([nombre, v]) => ({ nombre, valor: v })).sort((a, b) => b.valor - a.valor);
}

/**
 * Los `n` mayores y el resto plegado en un solo tramo "Otros". Si sobra uno solo se
 * muestra tal cual (un "Otros" de un elemento no aporta). Ignora valores ≤ 0.
 */
export function topN(items: readonly ItemValor[], n: number, etiquetaOtros = 'Otros'): ItemValor[] {
  const orden = items.filter(i => i.valor > 0).sort((a, b) => b.valor - a.valor);
  if (orden.length <= n + 1) return orden;
  const resto = orden.slice(n);
  return [
    ...orden.slice(0, n),
    { nombre: etiquetaOtros, valor: resto.reduce((s, i) => s + i.valor, 0), agrupados: resto.length },
  ];
}

/** ¿El rango son meses naturales completos? (del día 1 al último día del mes). */
export function esMesesCompletos({ inicio, fin }: RangoFechas): boolean {
  const a = parseFechaLocal(inicio);
  const b = parseFechaLocal(fin);
  return Boolean(a && b && a.getDate() === 1 && sumarDias(b, 1).getDate() === 1);
}

/** Corre una fecha `n` meses manteniendo el día (acotado al largo del mes destino). */
function correrMeses(iso: string, n: number): string {
  const d = parseFechaLocal(iso)!;
  const ultimo = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
  return isoLocal(new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), ultimo)));
}

/**
 * Periodo anterior equivalente, para comparar: mes → mes anterior, trimestre → trimestre
 * anterior, año → año anterior; un rango libre → los mismos días justo antes. Si el
 * periodo está en curso se compara a la misma altura (1 al 8 de nov. vs 1 al 8 de oct.).
 */
export function rangoAnterior(rango: RangoFechas, hoy = hoyISO()): RangoFechas {
  const { inicio, fin } = rango;
  const corte = inicio <= hoy && fin > hoy ? hoy : fin;
  if (esMesesCompletos(rango)) {
    const a = parseFechaLocal(inicio)!;
    const b = parseFechaLocal(fin)!;
    const meses = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + 1;
    return {
      inicio: correrMeses(inicio, -meses),
      fin: corte === fin ? isoLocal(new Date(b.getFullYear(), b.getMonth() - meses + 1, 0)) : correrMeses(corte, -meses),
    };
  }
  const largo = diasEntre(inicio, corte) + 1;
  const a = parseFechaLocal(inicio)!;
  return { inicio: isoLocal(sumarDias(a, -largo)), fin: isoLocal(sumarDias(a, -1)) };
}

/** Texto legible de un rango: `Noviembre 2026`, `Año 2026` o `01-09-2026 al 30-11-2026`. */
export function nombreRango({ inicio, fin }: RangoFechas): string {
  if (!inicio || !fin) return formatFecha(inicio || fin);
  if (esMesesCompletos({ inicio, fin })) {
    if (inicio.slice(0, 7) === fin.slice(0, 7)) return nombrePeriodo(inicio.slice(0, 7));
    if (inicio.slice(5) === '01-01' && fin.slice(5) === '12-31' && inicio.slice(0, 4) === fin.slice(0, 4)) return `Año ${inicio.slice(0, 4)}`;
  }
  return inicio === fin ? formatFecha(inicio) : `${formatFecha(inicio)} al ${formatFecha(fin)}`;
}
