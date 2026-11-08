// Tabla que bajo `md` (768 px) muestra cada fila como TARJETA: título, 2-3 datos clave y las
// acciones en un menú ⋯ (áreas táctiles de 44 px). Desde `md` mantiene la tabla de siempre,
// con scroll horizontal propio si no cabe. Uso:
//   <TablaResponsiva filas={lista} clave={f => f.id} columnas={[...]} tituloTarjeta={f => f.nombre}
//     datosTarjeta={f => [{ etiqueta: 'Total', valor: formatCLP(f.total) }]} acciones={f => [...]} />
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib/utils';

export interface ColumnaTabla<T> {
  clave: string;
  titulo: ReactNode;
  celda: (fila: T) => ReactNode;
  alinear?: 'izquierda' | 'derecha' | 'centro';
  className?: string;
}

export interface AccionFila {
  etiqueta: string;
  icono: string;
  onClick: () => void;
  peligro?: boolean;
  /** Se muestra como botón visible en la tabla de escritorio (el resto también, como íconos). */
  oculta?: boolean;
}

interface Props<T> {
  filas: T[];
  clave: (fila: T) => string;
  columnas: ColumnaTabla<T>[];
  /** Tarjeta (móvil): título, subtítulo y 2-3 datos clave. */
  tituloTarjeta: (fila: T) => ReactNode;
  subtituloTarjeta?: (fila: T) => ReactNode;
  datosTarjeta?: (fila: T) => { etiqueta: string; valor: ReactNode }[];
  /** Esquina superior derecha de la tarjeta (estado, monto). */
  insigniaTarjeta?: (fila: T) => ReactNode;
  acciones?: (fila: T) => AccionFila[];
  /** Contenido que se despliega bajo la fila (subcategorías, detalle). null = no expandible. */
  expandible?: (fila: T) => ReactNode | null;
  etiquetaExpandir?: string;
  /** Fila resaltada (deep link `?venta=ID`): se marca y se lleva a la vista. */
  resaltada?: string | null;
  vacio?: ReactNode;
  onFila?: (fila: T) => void;
  className?: string;
}

function MenuAcciones({ acciones, titulo }: { acciones: AccionFila[]; titulo: string }) {
  const [abierto, setAbierto] = useState(false);
  if (acciones.length === 0) return null;
  return (
    <div className="relative shrink-0">
      <button type="button" aria-label={`Acciones de ${titulo}`} aria-expanded={abierto} onClick={e => { e.stopPropagation(); setAbierto(v => !v); }}
        className="flex h-11 w-11 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container">
        <span className="material-symbols-outlined">more_vert</span>
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-30" onClick={e => { e.stopPropagation(); setAbierto(false); }} />
          <div className="absolute right-0 z-40 mt-1 w-56 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-1 shadow-xl" role="menu">
            {acciones.map(a => (
              <button key={a.etiqueta} type="button" role="menuitem"
                onClick={e => { e.stopPropagation(); setAbierto(false); a.onClick(); }}
                className={cn('flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold',
                  a.peligro ? 'text-error hover:bg-error/10' : 'text-on-surface hover:bg-surface-container-low')}>
                <span className="material-symbols-outlined text-lg">{a.icono}</span>{a.etiqueta}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const ALINEAR = { izquierda: 'text-left', derecha: 'text-right', centro: 'text-center' } as const;

export default function TablaResponsiva<T>({
  filas, clave, columnas, tituloTarjeta, subtituloTarjeta, datosTarjeta, insigniaTarjeta, acciones, expandible,
  etiquetaExpandir = 'Ver detalle', resaltada, vacio, onFila, className,
}: Props<T>) {
  // Se dibuja SOLO una de las dos vistas (tarjetas o tabla): con miles de filas dibujar ambas
  // (una oculta) duplicaba el trabajo.
  const [esAncho, setEsAncho] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const alCambiar = (e: MediaQueryListEvent) => setEsAncho(e.matches);
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const alternar = (id: string) => setExpandidas(prev => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });
  // El callback ref se recrea en cada render: sin este control la página volvía a saltar a la
  // fila resaltada con cada re-render (p. ej. al escribir en el buscador). Solo se desplaza una
  // vez por id y sobre el elemento visible (la tarjeta o la fila; la otra está con display:none).
  const desplazadaRef = useRef<string | null>(null);
  const refResaltada = (id: string) => (el: HTMLElement | null) => {
    if (!el || id !== resaltada || desplazadaRef.current === resaltada || el.getClientRects().length === 0) return;
    desplazadaRef.current = resaltada;
    requestAnimationFrame(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  };
  if (filas.length === 0) return <>{vacio ?? null}</>;

  return (
    <div className={className}>
      {/* Móvil: tarjetas */}
      {!esAncho && (<ul className="divide-y divide-outline-variant/20">
        {filas.map(f => {
          const id = clave(f);
          const extra = expandible?.(f) ?? null;
          const abierto = expandidas.has(id);
          return (
            <li key={id} ref={refResaltada(id)} className={cn('p-4', id === resaltada && 'bg-primary/5 ring-2 ring-inset ring-primary/40')}>
              <div className="flex items-start gap-2">
                <div className={cn('min-w-0 flex-1', onFila && 'cursor-pointer')} onClick={onFila ? () => onFila(f) : undefined}>
                  <div className="font-bold text-on-surface">{tituloTarjeta(f)}</div>
                  {subtituloTarjeta && <div className="mt-0.5 text-xs text-on-surface-variant">{subtituloTarjeta(f)}</div>}
                </div>
                {insigniaTarjeta && <div className="shrink-0 text-right">{insigniaTarjeta(f)}</div>}
                {acciones && <MenuAcciones acciones={acciones(f)} titulo={String(id)} />}
              </div>
              {datosTarjeta && (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  {datosTarjeta(f).map(d => (
                    <div key={d.etiqueta} className="min-w-0">
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-outline">{d.etiqueta}</dt>
                      <dd className="font-semibold text-on-surface">{d.valor}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {extra && (
                <>
                  <button type="button" onClick={() => alternar(id)} aria-expanded={abierto}
                    className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-bold text-primary">
                    <span className="material-symbols-outlined text-base">{abierto ? 'expand_less' : 'expand_more'}</span>{etiquetaExpandir}
                  </button>
                  {abierto && <div className="mt-1">{extra}</div>}
                </>
              )}
            </li>
          );
        })}
      </ul>)}

      {/* Desde md: tabla con scroll horizontal propio */}
      {esAncho && (<div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-outline-variant/20 bg-surface-container-low">
            <tr>
              {expandible && <th className="w-10 px-2" aria-label="Expandir" />}
              {columnas.map(c => (
                <th key={c.clave} className={cn('px-4 py-4 text-[10px] font-black uppercase tracking-widest text-outline lg:px-6', ALINEAR[c.alinear ?? 'izquierda'])}>{c.titulo}</th>
              ))}
              {acciones && <th className="px-4 py-4 text-center text-[10px] font-black uppercase tracking-widest text-outline">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/20">
            {filas.map(f => {
              const id = clave(f);
              const extra = expandible?.(f) ?? null;
              const abierto = expandidas.has(id);
              return (
                <Fragment key={id}>
                  <tr ref={refResaltada(id)} className={cn('group transition-colors hover:bg-surface-container-low/50', id === resaltada && 'bg-primary/5 outline outline-2 -outline-offset-2 outline-primary/40', onFila && 'cursor-pointer')}
                    onClick={onFila ? () => onFila(f) : undefined}>
                    {expandible && (
                      <td className="px-2">
                        {extra && (
                          <button type="button" onClick={e => { e.stopPropagation(); alternar(id); }} aria-expanded={abierto} aria-label={etiquetaExpandir}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-outline hover:bg-primary/10 hover:text-primary">
                            <span className="material-symbols-outlined text-lg">{abierto ? 'expand_less' : 'expand_more'}</span>
                          </button>
                        )}
                      </td>
                    )}
                    {columnas.map(c => (
                      <td key={c.clave} className={cn('px-4 py-4 lg:px-6', ALINEAR[c.alinear ?? 'izquierda'], c.className)}>{c.celda(f)}</td>
                    ))}
                    {acciones && (
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-1">
                          {acciones(f).filter(a => !a.oculta).map(a => (
                            <button key={a.etiqueta} type="button" title={a.etiqueta} aria-label={a.etiqueta} onClick={e => { e.stopPropagation(); a.onClick(); }}
                              className={cn('flex h-9 w-9 items-center justify-center rounded-lg text-outline transition-all', a.peligro ? 'hover:bg-error/10 hover:text-error' : 'hover:bg-primary/10 hover:text-primary')}>
                              <span className="material-symbols-outlined text-lg">{a.icono}</span>
                            </button>
                          ))}
                        </div>
                      </td>
                    )}
                  </tr>
                  {extra && abierto && (
                    <tr className="bg-surface-container-low/40">
                      <td colSpan={columnas.length + (acciones ? 1 : 0) + 1} className="px-4 py-3 lg:px-6">{extra}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>)}
    </div>
  );
}
