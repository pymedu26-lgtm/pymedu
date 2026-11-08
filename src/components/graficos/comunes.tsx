import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Tarjeta única de los gráficos del ERP: mismo fondo, radio, borde y cabecera. */
export function TarjetaGrafico({ titulo, subtitulo, icono, extra, className, children }: {
  titulo: string;
  subtitulo?: ReactNode;
  icono?: string;
  extra?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-5 min-w-0 flex flex-col', className)}>
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
            {icono && <span className="material-symbols-outlined text-base text-primary">{icono}</span>}
            {titulo}
          </h3>
          {subtitulo && <p className="text-xs text-on-surface-variant mt-0.5">{subtitulo}</p>}
        </div>
        {extra && <div className="text-xs font-bold text-on-surface-variant tabular-nums">{extra}</div>}
      </header>
      <div className="flex-1 min-w-0">{children}</div>
    </section>
  );
}

export function EstadoVacio({ alto = 220, texto, icono = 'query_stats' }: { alto?: number; texto?: string; icono?: string }) {
  return (
    <div style={{ height: alto }} className="flex flex-col items-center justify-center gap-1 text-center">
      <span className="material-symbols-outlined text-3xl text-outline/40">{icono}</span>
      <p className="text-sm font-semibold text-on-surface-variant">{texto ?? 'Sin datos en el periodo'}</p>
    </div>
  );
}

/** Caja del tooltip: usa los tokens del tema, así se ve bien en claro y oscuro. */
export function CajaTooltip({ titulo, filas }: {
  titulo: ReactNode;
  filas: Array<{ nombre: string; valor: string; color?: string; fuerte?: boolean }>;
}) {
  return (
    <div className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs shadow-lg shadow-shadow/10 min-w-[11rem] max-w-[16rem]">
      <p className="font-bold text-on-surface mb-1.5">{titulo}</p>
      <ul className="space-y-1">
        {filas.map(f => (
          <li key={f.nombre} className="flex items-center gap-2">
            {f.color && <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: f.color }} />}
            <span className="flex-1 min-w-0 truncate text-on-surface-variant">{f.nombre}</span>
            <span className={cn('tabular-nums text-on-surface', f.fuerte ? 'font-black' : 'font-bold')}>{f.valor}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Leyenda HTML compacta (fuera del SVG, nunca empuja ni recorta el gráfico). */
export function Leyenda({ items }: { items: Array<{ nombre: string; color: string; linea?: boolean }> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-xs text-on-surface-variant">
      {items.map(i => (
        <li key={i.nombre} className="flex items-center gap-1.5">
          <span className={cn('shrink-0', i.linea ? 'w-3.5 h-0.5 rounded-full' : 'w-2.5 h-2.5 rounded-sm')} style={{ background: i.color }} />
          {i.nombre}
        </li>
      ))}
    </ul>
  );
}

/** Etiqueta legible del método de pago (los datos guardan la clave sin tilde). */
export const METODO_PAGO: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transferencia', debito: 'Débito', credito: 'Crédito', cheque: 'Cheque', mixto: 'Mixto',
};

/** Porcentaje con una decimal, formato es-CL. */
export const pct = (parte: number, total: number) =>
  `${(total > 0 ? (parte / total) * 100 : 0).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`;
