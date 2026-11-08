// Piezas de interfaz reutilizadas por todas las pantallas de Mentorías.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import type { Tono } from '../util';

/** Carga asíncrona con estado de carga/error y `recargar`. Conserva los datos al recargar. */
export function useCarga<T>(cargar: () => Promise<T>, deps: unknown[] = []) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [cargando, setCargando] = useState(true);
  const [version, setVersion] = useState(0);
  const claveAnterior = useRef<string | null>(null);
  const clave = JSON.stringify(deps);

  useEffect(() => {
    let vivo = true;
    if (claveAnterior.current !== clave) { claveAnterior.current = clave; setDatos(null); }
    setCargando(true);
    setError(null);
    cargar()
      .then((d) => { if (vivo) setDatos(d); })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e : new Error(String(e))); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [clave, version]); // eslint-disable-line react-hooks/exhaustive-deps

  return { datos, setDatos, error, cargando, recargar: () => setVersion((v: number) => v + 1) };
}

/** Ícono Material Symbols (decorativo). El tamaño va en línea porque la hoja de Google fija 24 px. */
export function Icono({ n, size = 20, fill, className }: { n: string; size?: number; fill?: boolean; className?: string; key?: string | number }) {
  return (
    <span aria-hidden="true" className={cn('material-symbols-outlined shrink-0 leading-none', fill && 'ms-fill', className)} style={{ fontSize: size }}>
      {n}
    </span>
  );
}

const TONOS: Record<Tono, string> = {
  neutro: 'bg-(--m-subtle) text-(--m-muted) border-(--m-border)',
  acento: 'bg-(--m-accent-soft) text-(--m-accent-text) border-transparent',
  exito: 'bg-(--m-success-soft) text-(--m-success) border-transparent',
  info: 'bg-(--m-info-soft) text-(--m-info) border-transparent',
  aviso: 'bg-(--m-warning-soft) text-(--m-warning) border-transparent',
  peligro: 'bg-(--m-danger-soft) text-(--m-danger) border-transparent',
};

interface ChipProps {
  key?: string | number;
  children: ReactNode;
  tono?: Tono;
  icono?: string;
  /** Si se entrega, el chip es un botón de filtro (aria-pressed). */
  onClick?: () => void;
  activo?: boolean;
  className?: string;
}

export function Chip({ children, tono = 'neutro', icono, onClick, activo, className }: ChipProps) {
  const base = 'inline-flex items-center gap-1 rounded-full border font-semibold whitespace-nowrap';
  const contenido = <>{icono && <Icono n={icono} size={16} />}{children}</>;
  if (!onClick) return <span className={cn(base, 'px-2.5 py-0.5 text-xs', TONOS[tono], className)}>{contenido}</span>;
  return (
    <button
      type="button"
      aria-pressed={!!activo}
      onClick={onClick}
      className={cn(base, 'min-h-11 px-3 text-sm transition sm:min-h-9', className,
        activo ? 'border-(--m-accent) bg-(--m-accent) text-(--m-on-accent)' : 'border-(--m-border) bg-(--m-card) text-(--m-text) hover:border-(--m-accent)')}
    >
      {contenido}
    </button>
  );
}

export function BarraProgreso({ valor, etiqueta, className }: { valor: number; etiqueta: string; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(valor)));
  return (
    <div role="progressbar" aria-label={etiqueta} aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}
      className={cn('h-2 overflow-hidden rounded-full bg-(--m-skeleton)', className)}>
      <div className="h-full rounded-full bg-(--m-accent) transition-[width]" style={{ width: `${v}%` }} />
    </div>
  );
}

export const Esqueleto = ({ className }: { className?: string; key?: string | number }) => (
  <div aria-hidden="true" className={cn('animate-pulse rounded-xl bg-(--m-skeleton)', className)} />
);

export function Estado({ icono, titulo, texto, accion }: { icono: string; titulo: string; texto?: string; accion?: ReactNode }) {
  return (
    <div className="m-card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-(--m-accent-soft) text-(--m-accent-text)"><Icono n={icono} size={28} /></span>
      <h2 className="text-lg font-bold">{titulo}</h2>
      {texto && <p className="max-w-md text-sm text-(--m-muted)">{texto}</p>}
      {accion}
    </div>
  );
}

export const EstadoError = ({ error, onReintentar }: { error: Error; onReintentar: () => void }) => (
  <Estado icono="cloud_off" titulo="No pudimos cargar la información" texto={error.message}
    accion={<button type="button" className="m-btn m-btn-secundario" onClick={onReintentar}><Icono n="refresh" />Reintentar</button>} />
);

const ICONO_AVISO: Partial<Record<Tono, string>> = { exito: 'check_circle', peligro: 'error', aviso: 'warning' };

/** Mensaje en línea (resultado de una acción o error de formulario). */
export function Aviso({ tono = 'info', children, onCerrar }: { tono?: Tono; children: ReactNode; onCerrar?: () => void }) {
  const icono = ICONO_AVISO[tono] ?? 'info';
  return (
    <div role={tono === 'peligro' ? 'alert' : 'status'} className={cn('flex items-start gap-2 rounded-xl px-4 py-3 text-sm', TONOS[tono])}>
      <Icono n={icono} className="mt-px" />
      <div className="flex-1">{children}</div>
      {onCerrar && <button type="button" aria-label="Cerrar mensaje" onClick={onCerrar} className="-my-3 -mr-2 grid size-11 shrink-0 place-items-center rounded-lg sm:-my-1.5 sm:size-8"><Icono n="close" size={18} /></button>}
    </div>
  );
}

/** Tarjeta con encabezado (título + acción opcional). */
export function Tarjeta({ titulo, icono, accion, children, className, id }: {
  titulo?: string; icono?: string; accion?: ReactNode; children: ReactNode; className?: string; id?: string;
}) {
  return (
    <section id={id} className={cn('m-card p-5', className)}>
      {titulo && (
        <header className="mb-4 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold">{icono && <Icono n={icono} className="text-(--m-accent-text)" />}{titulo}</h2>
          {accion}
        </header>
      )}
      {children}
    </section>
  );
}

export function Estrellas({ valor, size = 18 }: { valor: number; size?: number }) {
  return (
    <span className="inline-flex" role="img" aria-label={`${valor.toLocaleString('es-CL', { maximumFractionDigits: 1 })} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const lleno = valor >= i - 0.25, medio = !lleno && valor >= i - 0.75;
        return <Icono key={i} n={medio ? 'star_half' : 'star'} size={size} fill={lleno || medio}
          className={lleno || medio ? 'text-(--m-accent)' : 'text-(--m-border)'} />;
      })}
    </span>
  );
}

/** Panel lateral (o inferior en móvil) modal. Cierra con Escape o clic fuera. */
export function Panel({ titulo, onCerrar, children, pie, abajo }: {
  titulo: string; onCerrar: () => void; children: ReactNode; pie?: ReactNode; abajo?: boolean;
}) {
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar.current(); };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', tecla);
    caja.current?.focus();
    return () => { document.removeEventListener('keydown', tecla); document.body.style.overflow = overflow; };
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label={titulo} className={cn('fixed inset-0 z-50 flex', abajo ? 'items-end' : 'justify-end')}>
      <div className="absolute inset-0 bg-black/45" onClick={() => cerrar.current()} />
      <div ref={caja} tabIndex={-1}
        className={cn('relative flex w-full flex-col bg-(--m-card) text-(--m-text) shadow-2xl outline-none',
          abajo ? 'max-h-[85dvh] rounded-t-2xl' : 'h-full max-w-xl')}>
        <header className="flex items-center justify-between gap-3 border-b border-(--m-border) px-5 py-3">
          <h2 className="text-lg font-bold">{titulo}</h2>
          <button type="button" className="m-btn px-2" aria-label="Cerrar" onClick={() => cerrar.current()}><Icono n="close" /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {pie && <footer className="flex flex-wrap justify-end gap-2 border-t border-(--m-border) px-5 py-3">{pie}</footer>}
      </div>
    </div>
  );
}
