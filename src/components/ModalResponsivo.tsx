// Modal responsivo: bajo `sm` ocupa TODA la pantalla (h-[100dvh]) con encabezado y pie fijos y
// el cuerpo con scroll; desde `sm` es un diálogo centrado. Respeta las áreas seguras (notch).
import { useEffect, type ReactNode } from 'react';
import { cn } from '../lib/utils';

interface Props {
  abierto?: boolean;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  onCerrar: () => void;
  /** Ancho en escritorio (clase max-w-*). */
  ancho?: string;
  /** Acciones del pie (fijo). Si se omite, no hay pie. */
  pie?: ReactNode;
  /** Sin padding en el cuerpo (cuando el contenido maneja su propio scroll y pie). */
  cuerpoLibre?: boolean;
  /**
   * Cerrar al tocar el fondo o con Escape. Apagado por defecto: en un formulario o una carga
   * masiva a medio revisar, un toque fuera hacía perder lo avanzado. Úsalo solo en vistas de lectura.
   */
  cerrarFuera?: boolean;
  children: ReactNode;
  className?: string;
}

export default function ModalResponsivo({ abierto = true, titulo, subtitulo, onCerrar, ancho = 'sm:max-w-lg', pie, cuerpoLibre, cerrarFuera = false, children, className }: Props) {
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => { if (cerrarFuera && e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', alTeclear);
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', alTeclear); document.body.style.overflow = previo; };
  }, [abierto, onCerrar, cerrarFuera]);
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-scrim/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={cerrarFuera ? onCerrar : undefined}>
      <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}
        className={cn('flex h-[100dvh] w-full flex-col overflow-hidden bg-surface-container-lowest shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-3xl', ancho, className)}>
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-outline-variant/20 bg-surface-container-low/50 px-4 py-3 sm:px-6 sm:py-4"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-primary sm:text-xl">{titulo}</h3>
            {subtitulo && <p className="mt-0.5 text-xs text-on-surface-variant">{subtitulo}</p>}
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container hover:text-error">
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>
        {cuerpoLibre ? children : <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>}
        {pie && (
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-outline-variant/20 bg-surface-container-low/80 px-4 pt-3 sm:px-6"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}>
            {pie}
          </footer>
        )}
      </div>
    </div>
  );
}
