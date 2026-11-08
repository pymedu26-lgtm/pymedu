import { memo, useMemo } from 'react';
import { formatCLP } from '@/lib/fechas';
import type { ItemValor } from '@/lib/series';
import { EstadoVacio, pct } from './comunes';
import { usePaletaGraficos } from './paleta';

export type ItemBarra = ItemValor & { detalle?: string; color?: string };

interface Props {
  items: ItemBarra[];
  max?: number;
  /** Color único; si se omite, cada barra toma la paleta categórica por posición. */
  color?: string;
  formato?: (n: number) => string;
  /** Muestra el % de cada fila sobre el total de TODOS los items (no solo los visibles). */
  mostrarPct?: boolean;
  vacio?: string;
  alto?: number;
  /** Atenúa las demás filas (p. ej. la categoría elegida en el filtro de la tabla). */
  destacado?: string;
}

/**
 * Ranking horizontal en HTML: la etiqueta va sobre la barra con todo el ancho para
 * truncarse limpio (nombre completo al pasar el mouse) y la barra se escala contra el
 * mayor. Liviano y legible a 375 px, sin ejes que recorten nombres largos.
 */
function GraficoBarras({ items, max = 6, color, formato = formatCLP, mostrarPct, vacio, alto = 200, destacado }: Props) {
  const p = usePaletaGraficos();
  const { filas, tope, total, resto } = useMemo(() => {
    const positivos = items.filter(i => i.valor > 0).sort((a, b) => b.valor - a.valor);
    return {
      filas: positivos.slice(0, max),
      tope: positivos[0]?.valor ?? 0,
      total: positivos.reduce((s, i) => s + i.valor, 0),
      resto: Math.max(0, positivos.length - max),
    };
  }, [items, max]);

  if (!filas.length) return <EstadoVacio alto={alto} texto={vacio} icono="leaderboard" />;

  return (
    <ol className="space-y-3">
      {filas.map((f, i) => (
        <li key={f.nombre} className={destacado && destacado !== f.nombre ? 'opacity-40' : undefined} title={`${f.nombre}: ${formato(f.valor)}${f.detalle ? ` · ${f.detalle}` : ''}`}>
          <div className="flex items-baseline justify-between gap-3 text-xs mb-1">
            <span className="min-w-0 truncate font-semibold text-on-surface">{f.nombre}</span>
            <span className="shrink-0 tabular-nums">
              <span className="font-bold text-on-surface">{formato(f.valor)}</span>
              {mostrarPct && <span className="ml-1.5 text-on-surface-variant">{pct(f.valor, total)}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-container-high overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${Math.max(2, (f.valor / tope) * 100)}%`, background: f.color ?? color ?? p.categorias[i % p.categorias.length] }}
            />
          </div>
          {f.detalle && <p className="text-[11px] text-on-surface-variant mt-0.5">{f.detalle}</p>}
        </li>
      ))}
      {resto > 0 && <li className="text-[11px] text-on-surface-variant">y {resto.toLocaleString('es-CL')} más</li>}
    </ol>
  );
}

export default memo(GraficoBarras);
