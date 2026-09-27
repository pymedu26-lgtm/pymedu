import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn, formatFecha } from '@/lib/utils';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];
const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** Medidas del calendario: ancho fijo y alto aproximado para decidir si abre hacia arriba. */
const ANCHO_CALENDARIO = 280;
const ALTO_CALENDARIO = 336;
const SEPARACION = 4;
const MARGEN_VENTANA = 8;

/** Fecha local en ISO 'YYYY-MM-DD'; se evita toISOString() por el corrimiento de zona horaria. */
const aIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const desdeIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

interface SelectorFechaProps {
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  placeholder?: string;
  /** Limita la navegacion del calendario, util en el filtro por periodo. */
  min?: string;
  max?: string;
  /** Hoy en ISO, para resaltar el dia actual. */
  hoy?: string;
}

/**
 * Calendario propio con los tokens de tema del ERP. El <input type="date"> nativo
 * abre el selector del sistema operativo, que no se puede alinear con la pagina.
 *
 * El calendario se dibuja en un portal sobre document.body: dentro de un modal el
 * ancestro declarativo con overflow-hidden o overflow-auto lo recortaba, y el
 * backdrop-filter del overlay convierte al overlay en contenedor de position:fixed.
 * Como portal queda al margen de ambos problemas.
 */
export default function SelectorFecha({
  value,
  onChange,
  className,
  placeholder = 'dd/mm/aaaa',
  min,
  max,
  hoy = aIso(new Date())
}: SelectorFechaProps) {
  const [abierto, setAbierto] = useState(false);
  const [cursor, setCursor] = useState(() => (value ? desdeIso(value) : new Date()));
  const [rect, setRect] = useState<DOMRect | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const calendarioRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) setCursor(desdeIso(value));
  }, [value]);

  /** Reubica el calendario si el modal se desplaza o cambia el tamaño de la ventana. */
  const medir = useCallback(() => {
    const el = botonRef.current;
    if (el) setRect(el.getBoundingClientRect());
  }, []);

  useLayoutEffect(() => {
    if (!abierto) {
      setRect(null);
      return;
    }
    medir();
    // Con captura=true tambien se capturan los scroll de los contenedores internos del modal.
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => {
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
    };
  }, [abierto, medir]);

  useEffect(() => {
    if (!abierto) return;

    const onPointerDown = (e: MouseEvent) => {
      const destino = e.target as Node;
      const dentroDelCampo = contenedorRef.current?.contains(destino);
      // El calendario vive en el portal, asi que se comprueba aparte.
      const dentroDelCalendario = calendarioRef.current?.contains(destino);
      if (!dentroDelCampo && !dentroDelCalendario) setAbierto(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [abierto]);

  /** Coloca el calendario dentro de la ventana: abre arriba si no cabe abajo. */
  const posicion = useMemo(() => {
    if (!rect) return null;
    const espacioAbajo = window.innerHeight - rect.bottom - SEPARACION;
    const espacioArriba = rect.top - SEPARACION;
    const abreArriba = espacioAbajo < ALTO_CALENDARIO && espacioArriba > espacioAbajo;
    const disponible = Math.max(160, (abreArriba ? espacioArriba : espacioAbajo) - MARGEN_VENTANA);
    const maxHeight = Math.min(ALTO_CALENDARIO, disponible);
    const top = abreArriba
      ? Math.max(MARGEN_VENTANA, rect.top - SEPARACION - maxHeight)
      : rect.bottom + SEPARACION;
    const left = Math.min(
      Math.max(MARGEN_VENTANA, rect.left),
      Math.max(MARGEN_VENTANA, window.innerWidth - ANCHO_CALENDARIO - MARGEN_VENTANA)
    );
    return { top, left, maxHeight };
  }, [rect]);

  const dias = useMemo(() => {
    const primero = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const desplazamiento = (primero.getDay() + 6) % 7; // lunes primero
    const inicio = new Date(primero);
    inicio.setDate(primero.getDate() - desplazamiento);

    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(inicio);
      d.setDate(inicio.getDate() + i);
      return d;
    });
  }, [cursor]);

  const habilitado = (d: Date) => {
    const iso = aIso(d);
    if (min && iso < min) return false;
    if (max && iso > max) return false;
    return true;
  };

  const desplazar = (meses: number) => setCursor(c => new Date(c.getFullYear(), c.getMonth() + meses, 1));

  const elegir = (d: Date) => {
    onChange(aIso(d));
    setAbierto(false);
  };

  return (
    <div ref={contenedorRef} className={cn('relative', className)}>
      <button
        ref={botonRef}
        type="button"
        onClick={() => setAbierto(a => !a)}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-outline-variant/50 bg-surface-container-lowest text-on-surface text-sm hover:border-primary/40 transition-colors"
      >
        <span className="material-symbols-outlined text-outline text-lg">calendar_month</span>
        <span className={cn('flex-1 text-left', !value && 'text-on-surface-variant/50')}>
          {value ? formatFecha(value) : placeholder}
        </span>
        {value && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Limpiar fecha"
            onClick={e => { e.stopPropagation(); onChange(''); }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onChange(''); } }}
            className="material-symbols-outlined text-outline text-base hover:text-error transition-colors"
          >
            close
          </span>
        )}
      </button>

      {abierto && posicion && createPortal(
        <div
          ref={calendarioRef}
          role="dialog"
          aria-label="Calendario"
          style={{
            top: posicion.top,
            left: posicion.left,
            width: ANCHO_CALENDARIO,
            maxHeight: posicion.maxHeight
          }}
          className="fixed z-[70] overflow-y-auto overscroll-contain rounded-2xl border border-outline-variant/50 bg-surface-container-lowest p-3 shadow-xl shadow-shadow/10"
        >
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => desplazar(-1)}
              aria-label="Mes anterior"
              className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors"
            >
              <span className="material-symbols-outlined text-lg">chevron_left</span>
            </button>
            <select
              value={cursor.getMonth()}
              onChange={e => setCursor(c => new Date(c.getFullYear(), Number(e.target.value), 1))}
              className="px-2 py-1 rounded-lg border border-outline-variant/50 bg-surface-container-lowest text-xs font-bold text-on-surface outline-none focus:border-primary cursor-pointer"
            >
              {MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select
              value={cursor.getFullYear()}
              onChange={e => setCursor(c => new Date(Number(e.target.value), c.getMonth(), 1))}
              className="px-2 py-1 rounded-lg border border-outline-variant/50 bg-surface-container-lowest text-xs font-bold text-on-surface outline-none focus:border-primary cursor-pointer"
            >
              {Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => desplazar(1)}
              aria-label="Mes siguiente"
              className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors"
            >
              <span className="material-symbols-outlined text-lg">chevron_right</span>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {DIAS.map((d, i) => (
              <span key={i} className="text-center text-[10px] font-black text-outline uppercase">{d}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {dias.map(d => {
              const iso = aIso(d);
              const fueraDeMes = d.getMonth() !== cursor.getMonth();
              const seleccionado = iso === value;
              const esHoy = iso === hoy;
              const ok = habilitado(d);

              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!ok}
                  onClick={() => elegir(d)}
                  className={cn(
                    'h-8 rounded-lg text-xs font-bold transition-colors',
                    seleccionado
                      ? 'bg-primary text-inverse-on-surface shadow-sm'
                      : ok
                        ? cn(
                            'text-on-surface hover:bg-surface-container-low',
                            fueraDeMes && 'text-outline',
                            esHoy && !seleccionado && 'ring-1 ring-primary/40'
                          )
                        : 'text-on-surface-variant/25 cursor-not-allowed'
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => elegir(new Date())}
            className="mt-2 w-full py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider text-primary hover:bg-primary/10 transition-colors"
          >
            Hoy
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
