import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn, formatFecha } from '@/lib/utils';

export interface OpcionDesplegable {
  valor: string;
  etiqueta: string;
  descripcion?: string;
  icono?: string;
}

/**
 * Periodos de filtro del ERP. El rango manual se maneja con los campos
 * Desde/Hasta del panel de filtros, que lo activan al cambiar una fecha.
 */
export const OPCIONES_PERIODO: OpcionDesplegable[] = [
  { valor: 'este_mes', etiqueta: 'Este Mes', icono: 'calendar_today' },
  { valor: 'mes_anterior', etiqueta: 'Mes Anterior', icono: 'history' },
  { valor: 'personalizado', etiqueta: 'Personalizado', icono: 'tune' }
];

/**
 * Texto que acompaña al periodo elegido: el rango que se esta viendo y, cuando
 * el usuario aun no escribe las fechas, hasta donde hay datos disponibles.
 */
export function etiquetaRangoPeriodo(
  personalizado: boolean,
  inicio: string,
  fin: string,
  rango: { min: string; max: string } | null
): string {
  if (!personalizado) return 'En el periodo seleccionado';

  const tope = rango ? `máx. ${formatFecha(rango.min)} → ${formatFecha(rango.max)}` : 'sin registros';
  if (!inicio && !fin) return `ingresa el rango · ${tope}`;

  return `${formatFecha(inicio || rango?.min)} → ${formatFecha(fin || rango?.max)}`;
}

/** Medidas de la lista flotante: alto maximo antes de decidir si abre hacia arriba. */
const ALTO_LISTA_MAX = 320;
const ANCHO_LISTA_MIN = 200;
const SEPARACION = 4;
const MARGEN_VENTANA = 8;

interface SelectorDesplegableProps {
  valor: string;
  opciones: OpcionDesplegable[];
  onChange: (valor: string) => void;
  icono?: string;
  className?: string;
  /** Etiqueta mostrada a la derecha del valor actual (ej. el rango de fechas). */
  hint?: string | null;
  disabled?: boolean;
}

/**
 * Reemplaza al <select> nativo: el popup de opciones lo dibuja el sistema
 * operativo y no puede seguir los tokens de tema de la pagina. Este selector
 * pinta la lista con los mismos colores, radios y tipografia del resto del ERP.
 *
 * La lista se dibuja en un portal sobre document.body: dentro de un modal el
 * ancestro con overflow-auto la recortaba. Al vivir en el portal queda al margen
 * de ese recorte y se reubica si el modal se desplaza o cambia la ventana.
 */
export default function SelectorDesplegable({
  valor,
  opciones,
  onChange,
  icono,
  className,
  hint,
  disabled
}: SelectorDesplegableProps) {
  const [abierto, setAbierto] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const seleccionada = opciones.find(o => o.valor === valor) ?? opciones[0];

  /** Reubica la lista si el modal se desplaza o cambia el tamaño de la ventana. */
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
      const dentroDelBoton = contenedorRef.current?.contains(destino);
      // La lista vive en el portal, asi que se comprueba aparte.
      const dentroDeLaLista = listaRef.current?.contains(destino);
      if (!dentroDelBoton && !dentroDeLaLista) setAbierto(false);
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

  /** Coloca la lista dentro de la ventana: abre arriba si no cabe abajo. */
  const posicion = useMemo(() => {
    if (!rect) return null;
    const ancho = Math.max(rect.width, ANCHO_LISTA_MIN);
    const espacioAbajo = window.innerHeight - rect.bottom - SEPARACION;
    const espacioArriba = rect.top - SEPARACION;
    const abreArriba = espacioAbajo < ALTO_LISTA_MAX && espacioArriba > espacioAbajo;
    const disponible = Math.max(160, (abreArriba ? espacioArriba : espacioAbajo) - MARGEN_VENTANA);
    const maxHeight = Math.min(ALTO_LISTA_MAX, disponible);
    const top = abreArriba
      ? Math.max(MARGEN_VENTANA, rect.top - SEPARACION - maxHeight)
      : rect.bottom + SEPARACION;
    const left = Math.min(
      Math.max(MARGEN_VENTANA, rect.left),
      Math.max(MARGEN_VENTANA, window.innerWidth - ancho - MARGEN_VENTANA)
    );
    return { top, left, maxHeight, ancho };
  }, [rect]);

  const elegir = (v: string) => {
    onChange(v);
    setAbierto(false);
  };

  return (
    <div ref={contenedorRef} className={cn('relative', className)}>
      <button
        ref={botonRef}
        type="button"
        disabled={disabled}
        onClick={() => setAbierto(a => !a)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        className={cn(
          'w-full flex items-center gap-2 bg-surface-container-lowest px-4 py-2 rounded-xl border border-outline-variant/50 shadow-sm transition-colors',
          disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-primary/40'
        )}
      >
        {icono && <span className="material-symbols-outlined text-outline text-sm">{icono}</span>}
        <span className="flex-1 min-w-0 truncate text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">
          {seleccionada?.etiqueta}
        </span>
        {hint && (
          <span
            title={hint}
            className="hidden sm:block max-w-[10rem] truncate text-[10px] font-semibold text-on-surface-variant/50 normal-case tracking-normal"
          >
            {hint}
          </span>
        )}
        <span
          className={cn(
            'material-symbols-outlined text-outline text-sm transition-transform duration-200',
            abierto && 'rotate-180'
          )}
        >
          expand_more
        </span>
      </button>

      {abierto && posicion && createPortal(
        <div
          ref={listaRef}
          role="listbox"
          style={{
            top: posicion.top,
            left: posicion.left,
            width: posicion.ancho,
            maxHeight: posicion.maxHeight
          }}
          className="fixed z-[70] overflow-y-auto overscroll-contain rounded-2xl border border-outline-variant/50 bg-surface-container-lowest shadow-xl shadow-shadow/10"
        >
          {opciones.map(o => {
            const activa = o.valor === valor;
            return (
              <button
                key={o.valor}
                type="button"
                role="option"
                aria-selected={activa}
                onClick={() => elegir(o.valor)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                  activa
                    ? 'bg-primary/10 text-primary'
                    : 'text-on-surface-variant hover:bg-surface-container-low'
                )}
              >
                {o.icono && (
                  <span
                    className={cn(
                      'material-symbols-outlined text-sm',
                      activa ? 'text-primary' : 'text-outline'
                    )}
                  >
                    {o.icono}
                  </span>
                )}
                <span className="flex-1 min-w-0">
                  <span
                    className={cn(
                      'block truncate text-xs uppercase tracking-wider',
                      activa ? 'font-black' : 'font-bold'
                    )}
                  >
                    {o.etiqueta}
                  </span>
                  {o.descripcion && (
                    <span className="block text-[10px] font-medium text-on-surface-variant/60 normal-case tracking-normal">
                      {o.descripcion}
                    </span>
                  )}
                </span>
                {activa && <span className="material-symbols-outlined text-sm text-primary">check</span>}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
