import { memo, useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { formatCLP, formatCLPCorto } from '@/lib/fechas';
import { topN, type ItemValor } from '@/lib/series';
import { cn } from '@/lib/utils';
import { EstadoVacio, pct } from './comunes';
import { usePaletaGraficos } from './paleta';

const TAM = 168;

/** `color` fija el color de un elemento (p. ej. un estado); si no, la paleta categórica. */
export type ItemDona = ItemValor & { color?: string };

interface Props {
  items: ItemDona[];
  /** Cuántas porciones antes de plegar el resto en "Otros" (por defecto 6). */
  max?: number;
  formato?: (n: number) => string;
  formatoCorto?: (n: number) => string;
  etiquetaTotal?: string;
  vacio?: string;
}

/**
 * Dona Top-N + "Otros" con el total al centro y una leyenda HTML con % al lado (o debajo
 * en tarjetas angostas, vía container query). La leyenda se desplaza si no cabe: con
 * miles de categorías el gráfico ya no se aplasta ni se rompe.
 */
function GraficoDona({
  items, max = 6, formato = formatCLP, formatoCorto = formatCLPCorto, etiquetaTotal = 'Total', vacio,
}: Props) {
  const p = usePaletaGraficos();
  const [activo, setActivo] = useState<number | null>(null);
  const datos = useMemo(() => topN(items, max) as ItemDona[], [items, max]);
  const total = useMemo(() => datos.reduce((s, d) => s + d.valor, 0), [datos]);

  if (!total) return <EstadoVacio alto={TAM} texto={vacio} icono="donut_large" />;

  const color = (d: ItemDona, i: number) => d.color ?? (d.agrupados ? p.otros : p.categorias[i % p.categorias.length]);
  const foco = activo !== null ? datos[activo] : null;

  return (
    <div className="@container">
      <div className="flex flex-col @sm:flex-row items-center gap-4 @sm:gap-6">
        <div className="relative shrink-0" style={{ width: TAM, height: TAM }} onMouseLeave={() => setActivo(null)}>
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: TAM, height: TAM }}>
            <PieChart>
              <Pie
                data={datos} dataKey="valor" nameKey="nombre" cx="50%" cy="50%"
                innerRadius={TAM / 2 - 30} outerRadius={TAM / 2 - 2} startAngle={90} endAngle={-270}
                stroke={p.superficie} strokeWidth={2} minAngle={2}
                isAnimationActive={datos.length <= 200}
                onMouseEnter={(_, i) => setActivo(i)}
              >
                {datos.map((d, i) => (
                  <Cell key={d.nombre} fill={color(d, i)} fillOpacity={activo === null || activo === i ? 1 : 0.3} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-8">
            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant truncate max-w-full">
              {foco ? foco.nombre : etiquetaTotal}
            </span>
            <span className="text-base font-black text-on-surface tabular-nums leading-tight" title={formato(foco ? foco.valor : total)}>
              {formatoCorto(foco ? foco.valor : total)}
            </span>
            {foco && <span className="text-[11px] font-bold text-on-surface-variant tabular-nums">{pct(foco.valor, total)}</span>}
          </div>
        </div>

        <ul className="w-full min-w-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain" style={{ maxHeight: TAM }}>
          {datos.map((d, i) => (
            <li
              key={d.nombre}
              title={`${d.nombre}: ${formato(d.valor)} (${pct(d.valor, total)})`}
              onMouseEnter={() => setActivo(i)}
              onMouseLeave={() => setActivo(null)}
              className={cn('flex items-center gap-2 rounded-lg px-2 py-[3px] text-xs transition-colors', activo === i && 'bg-surface-container-low')}
            >
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color(d, i) }} />
              <span className="flex-1 min-w-0 truncate font-medium text-on-surface">
                {d.agrupados ? `${d.nombre} (${d.agrupados.toLocaleString('es-CL')})` : d.nombre}
              </span>
              <span className="font-bold text-on-surface tabular-nums">{pct(d.valor, total)}</span>
              <span className="hidden @xs:inline w-[4.5rem] text-right text-on-surface-variant tabular-nums">{formatoCorto(d.valor)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default memo(GraficoDona);
