import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { escucharToasts, type Toast } from '../lib/toasts';
import { cn } from '../lib/utils';

const ESTILO: Record<Toast['tipo'], { icono: string; cls: string }> = {
  info: { icono: 'info', cls: 'text-primary' },
  exito: { icono: 'check_circle', cls: 'text-success' },
  aviso: { icono: 'warning', cls: 'text-warning' },
  error: { icono: 'error', cls: 'text-error' },
};

/** Pila de avisos en vivo. Abajo al centro en móvil (sobre la barra inferior), abajo a la derecha en escritorio. */
export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => escucharToasts(t => {
    setToasts(prev => [...prev.slice(-2), t]);
    window.setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), t.duracion);
  }), []);
  const cerrar = (id: string) => setToasts(prev => prev.filter(x => x.id !== id));

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[1300] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)' }}
    >
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-3 shadow-xl">
          <span className={cn('material-symbols-outlined mt-0.5 text-xl', ESTILO[t.tipo].cls)}>{ESTILO[t.tipo].icono}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-on-surface">{t.titulo}</p>
            {t.detalle && <p className="mt-0.5 text-xs text-on-surface-variant">{t.detalle}</p>}
            {t.accion && <Link to={t.accion.url} onClick={() => cerrar(t.id)} className="mt-1 inline-block text-xs font-bold text-primary">{t.accion.etiqueta}</Link>}
          </div>
          <button type="button" aria-label="Cerrar aviso" onClick={() => cerrar(t.id)} className="-m-1 flex h-9 w-9 items-center justify-center rounded-full text-outline hover:bg-surface-container">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
      ))}
    </div>
  );
}
