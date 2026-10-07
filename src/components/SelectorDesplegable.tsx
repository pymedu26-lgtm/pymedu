import { useEffect, useRef, useState } from 'react';
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

interface SelectorDesplegableProps {
  valor: string;
  opciones: OpcionDesplegable[];
  onChange: (valor: string) => void;
  icono?: string;
  className?: string;
  /** Etiqueta mostrada a la derecha del valor actual (ej. el rango de fechas). */
  hint?: string | null;
}

/**
 * Reemplaza al <select> nativo: el popup de opciones lo dibuja el sistema
 * operativo y no puede seguir los tokens de tema de la pagina. Este selector
 * pinta la lista con los mismos colores, radios y tipografia del resto del ERP.
 */
export default function SelectorDesplegable({
  valor,
  opciones,
  onChange,
  icono,
  className,
  hint
}: SelectorDesplegableProps) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  const seleccionada = opciones.find(o => o.valor === valor) ?? opciones[0];

  useEffect(() => {
    if (!abierto) return;

    const onPointerDown = (e: MouseEvent) => {
      if (!contenedorRef.current?.contains(e.target as Node)) setAbierto(false);
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

  const elegir = (v: string) => {
    onChange(v);
    setAbierto(false);
  };

  return (
    <div ref={contenedorRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setAbierto(a => !a)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        className="flex items-center gap-2 bg-surface-container-lowest px-4 py-2 rounded-xl border border-outline-variant/50 shadow-sm hover:border-primary/40 transition-colors"
      >
        {icono && <span className="material-symbols-outlined text-outline text-sm">{icono}</span>}
        <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
          {seleccionada?.etiqueta}
        </span>
        {hint && (
          <span
            title={hint}
            className="max-w-[10rem] truncate text-[10px] font-semibold text-on-surface-variant/50 normal-case tracking-normal"
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

      {abierto && (
        <div
          role="listbox"
          className="absolute z-50 mt-2 min-w-full w-max max-w-[16rem] overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-container-lowest shadow-xl shadow-shadow/10"
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
                      'block text-xs uppercase tracking-wider',
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
        </div>
      )}
    </div>
  );
}
