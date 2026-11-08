import { memo, useId, useMemo } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCLP, formatCLPCorto } from '@/lib/fechas';
import { CajaTooltip, EstadoVacio, Leyenda } from './comunes';
import { usePaletaGraficos } from './paleta';
import { useEsMovil } from './useEsMovil';

export type TipoMarca = 'area' | 'barra' | 'linea';
export interface DefSerie { clave: string; nombre: string; color: string; tipo?: TipoMarca }
/** Lo mínimo que necesita un punto: lo que entrega `agruparSerie` más valores numéricos. */
export interface PuntoGrafico { etiqueta: string; etiquetaLarga: string }

const valor = (pt: PuntoGrafico, clave: string) => Number((pt as unknown as Record<string, unknown>)[clave]) || 0;

interface Props {
  /** Puntos de `agruparSerie` (u otros con `etiqueta` y `etiquetaLarga`). */
  puntos: PuntoGrafico[];
  series: DefSerie[];
  tipo?: TipoMarca;
  alto?: number;
  formato?: (n: number) => string;
  formatoEje?: (n: number) => string;
  apilado?: boolean;
  vacio?: string;
}

/**
 * Serie temporal (área, barras o línea, combinables) sobre tramos continuos.
 * El eje X oculta solo las etiquetas que no caben (minTickGap) y el eje Y usa montos
 * compactos; el tooltip muestra la fecha completa del tramo y los montos exactos.
 * En teléfonos: algo más bajo, menos marcas en ambos ejes y la leyenda bajo el gráfico.
 */
function GraficoSerie({
  puntos, series, tipo = 'area', alto = 260, formato = formatCLP, formatoEje = formatCLPCorto, apilado, vacio,
}: Props) {
  const p = usePaletaGraficos();
  const movil = useEsMovil();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const altoReal = movil ? Math.min(alto, 220) : alto;
  const fuenteEje = movil ? 10 : 11;

  const { hayDatos, hayNegativos, anchoEje } = useMemo(() => {
    let max = 0;
    let neg = false;
    for (const pt of puntos) for (const s of series) {
      const v = valor(pt, s.clave);
      if (Math.abs(v) > max) max = Math.abs(v);
      if (v < 0) neg = true;
    }
    return { hayDatos: max > 0, hayNegativos: neg, anchoEje: Math.max(32, (formatoEje(neg ? -max : max).length) * (movil ? 6 : 6.5) + 8) };
  }, [puntos, series, formatoEje, movil]);

  if (!hayDatos) return <EstadoVacio alto={altoReal} texto={vacio} />;

  const animar = puntos.length <= 200;
  const conPuntos = puntos.length <= 12;
  const conBarras = series.some(s => (s.tipo ?? tipo) === 'barra');

  const leyenda = series.length > 1
    ? <Leyenda abajo={movil} items={series.map(s => ({ nombre: s.nombre, color: s.color, linea: (s.tipo ?? tipo) === 'linea' }))} />
    : null;

  return (
    <div className="min-w-0">
      {!movil && leyenda}
      <div style={{ height: altoReal }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: altoReal }}>
          <ComposedChart data={puntos} margin={{ top: 6, right: movil ? 4 : 6, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
            <defs>
              {series.map(s => (
                <linearGradient key={s.clave} id={`${id}-${s.clave}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke={p.grilla} strokeOpacity={0.6} strokeDasharray="3 3" />
            <XAxis
              dataKey="etiqueta" tickLine={false} axisLine={{ stroke: p.grilla }} tickMargin={6}
              tick={{ fill: p.eje, fontSize: fuenteEje }} interval="preserveStartEnd" minTickGap={movil ? 28 : 16}
            />
            <YAxis
              tickLine={false} axisLine={false} width={anchoEje} tickCount={movil ? 4 : 5}
              tick={{ fill: p.eje, fontSize: fuenteEje }} tickFormatter={formatoEje}
            />
            {hayNegativos && <ReferenceLine y={0} stroke={p.eje} strokeOpacity={0.5} />}
            <Tooltip
              isAnimationActive={false}
              wrapperStyle={{ outline: 'none' }}
              cursor={conBarras ? { fill: p.cursor, fillOpacity: 0.6 } : { stroke: p.grilla, strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                const punto = active ? (payload?.[0]?.payload as PuntoGrafico | undefined) : undefined;
                if (!punto) return null;
                return (
                  <CajaTooltip
                    titulo={punto.etiquetaLarga}
                    filas={series.map(s => ({ nombre: s.nombre, color: s.color, valor: formato(valor(punto, s.clave)) }))}
                  />
                );
              }}
            />
            {series.map(s => {
              const marca = s.tipo ?? tipo;
              const comunes = { dataKey: s.clave, name: s.nombre, isAnimationActive: animar, stackId: apilado ? 'a' : undefined };
              if (marca === 'barra') {
                return <Bar key={s.clave} {...comunes} fill={s.color} radius={apilado ? 0 : [4, 4, 0, 0]} maxBarSize={32} />;
              }
              const trazo = {
                stroke: s.color, strokeWidth: 2, type: 'monotone' as const,
                dot: conPuntos ? { r: 3, fill: s.color, stroke: p.superficie, strokeWidth: 1.5 } : false,
                activeDot: { r: 5, fill: s.color, stroke: p.superficie, strokeWidth: 2 },
              };
              return marca === 'area'
                ? <Area key={s.clave} {...comunes} {...trazo} fill={`url(#${id}-${s.clave})`} />
                : <Line key={s.clave} {...comunes} {...trazo} />;
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {movil && leyenda}
    </div>
  );
}

/** Las páginas pasan `series` como literal: se compara por contenido para no redibujar en cada render. */
const mismasProps = (a: Props, b: Props) => {
  const claves = Object.keys(a) as Array<keyof Props>;
  return claves.length === Object.keys(b).length
    && claves.every(k => (k === 'series' ? JSON.stringify(a.series) === JSON.stringify(b.series) : a[k] === b[k]));
};

export default memo(GraficoSerie, mismasProps);
