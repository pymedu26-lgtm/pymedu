import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Cliente } from '../context/ERPContext';
import { cn } from '@/lib/utils';

interface BuscadorClienteProps {
  clientes: Cliente[];
  /** Cliente ya asociado a la venta, si viene de editar. */
  clienteId?: string;
  clienteNombre?: string;
  /** `cliente` es null cuando el texto no corresponde a un cliente del ERP. */
  onChange: (cliente: Cliente | null, nombre: string) => void;
  placeholder?: string;
  className?: string;
}

/** Medidas de la lista de resultados: alto maximo antes de decidir si abre hacia arriba. */
const ALTO_LISTA_MAX = 260;
const ANCHO_LISTA_MIN = 240;
const SEPARACION = 4;
const MARGEN_VENTANA = 8;

/**
 * Campo de cliente con busqueda: filtra por nombre o RUT contra el modulo de
 * Clientes del ERP. Si no hay coincidencia se puede escribir un cliente nuevo.
 *
 * La lista de resultados se dibuja en un portal sobre document.body: dentro del
 * modal de venta el ancestro con overflow-y-auto la recortaba y la dejaba pegada
 * al input al hacer scroll. En el portal queda al margen de ese recorte y se
 * reubica igual que los otros desplegables del ERP (SelectorDesplegable y
 * SelectorFecha), evitando que quede superpuesta o cortada por el propio modal.
 */
export default function BuscadorCliente({
  clientes,
  clienteId,
  clienteNombre,
  onChange,
  placeholder = 'Buscar cliente por nombre o RUT...',
  className
}: BuscadorClienteProps) {
  const [texto, setTexto] = useState(clienteNombre ?? '');
  const [abierto, setAbierto] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTexto(clienteNombre ?? '');
  }, [clienteId, clienteNombre]);

  /** Reubica la lista si cambia el tamaño de la ventana. */
  const medir = useCallback(() => {
    const el = inputRef.current;
    if (el) setRect(el.getBoundingClientRect());
  }, []);

  useLayoutEffect(() => {
    if (!abierto) {
      setRect(null);
      return;
    }
    medir();
    window.addEventListener('resize', medir);
    // Al desplazar la pagina o el modal la lista se cierra. Si se quedara fija
    // (position: fixed) terminaria flotando por encima de la barra superior o
    // del titulo del modal. El scroll dentro de la propia lista no la cierra.
    const onScroll = (e: Event) => {
      if (listaRef.current && e.target instanceof Node && listaRef.current.contains(e.target)) return;
      setAbierto(false);
    };
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [abierto, medir]);

  useEffect(() => {
    if (!abierto) return;

    const onPointerDown = (e: MouseEvent) => {
      const destino = e.target as Node;
      const dentroDelCampo = contenedorRef.current?.contains(destino);
      // La lista vive en el portal, asi que se comprueba aparte.
      const dentroDeLaLista = listaRef.current?.contains(destino);
      if (!dentroDelCampo && !dentroDeLaLista) setAbierto(false);
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

  const consulta = texto.trim().toLowerCase();
  const coincide = (c: Cliente) =>
    !consulta || c.nombre.toLowerCase().includes(consulta) || (c.rut ?? '').toLowerCase().includes(consulta);

  const resultados = useMemo(
    () => (consulta ? clientes.filter(coincide).slice(0, 8) : clientes.slice(0, 8)),
    [clientes, consulta]
  );

  const elegido = clientes.find(c => c.id === clienteId);
  const hayCoincidenciaExacta = !!elegido && elegido.nombre.toLowerCase() === consulta;

  /** Coloca la lista dentro de la ventana: abre arriba si no cabe abajo. */
  const posicion = useMemo(() => {
    if (!rect) return null;
    const ancho = Math.max(rect.width, ANCHO_LISTA_MIN);
    const espacioAbajo = window.innerHeight - rect.bottom - SEPARACION;
    const espacioArriba = rect.top - SEPARACION;
    const abreArriba = espacioAbajo < ALTO_LISTA_MAX && espacioArriba > espacioAbajo;
    const disponible = Math.max(160, (abreArriba ? espacioArriba : espacioAbajo) - MARGEN_VENTANA);
    const maxHeight = Math.min(ALTO_LISTA_MAX, disponible);
    // Al abrir hacia arriba se ancla el borde inferior de la lista al borde
    // superior del input para no depender de la altura maxima estimada.
    const top = abreArriba ? undefined : rect.bottom + SEPARACION;
    const bottom = abreArriba
      ? Math.max(MARGEN_VENTANA, window.innerHeight - rect.top + SEPARACION)
      : undefined;
    const left = Math.min(
      Math.max(MARGEN_VENTANA, rect.left),
      Math.max(MARGEN_VENTANA, window.innerWidth - ancho - MARGEN_VENTANA)
    );
    return { top, bottom, left, maxHeight, ancho };
  }, [rect]);

  /** Capa del portal: en la pagina la lista debe quedar bajo la barra superior
   *  (z-40) para no flotar sobre ella; dentro de un modal (overlay position:fixed
   *  z-50/60) necesita capa alta para no quedar tapada por el propio overlay. */
  const capa = useMemo(
    () => (abierto && inputRef.current?.closest('.fixed') ? 'z-[1000]' : 'z-30'),
    [abierto]
  );

  const escribir = (valor: string) => {
    setTexto(valor);
    setAbierto(true);
    // Un texto libre equivale a un cliente general nuevo: se desasocia el id.
    const exacto = clientes.find(c => c.nombre.toLowerCase() === valor.trim().toLowerCase());
    onChange(exacto ?? null, valor);
  };

  const elegir = (c: Cliente) => {
    setTexto(c.nombre);
    setAbierto(false);
    onChange(c, c.nombre);
  };

  const mostrarLista = resultados.length > 0 || (consulta && resultados.length === 0);

  return (
    <div ref={contenedorRef} className={cn('relative', className)}>
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none text-lg">
          search
        </span>
        <input
          ref={inputRef}
          type="text"
          value={texto}
          onFocus={() => setAbierto(true)}
          onChange={e => escribir(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full pl-10 pr-9 py-3 rounded-xl border border-outline-variant/50 focus:ring-2 focus:ring-primary/20 outline-none bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant/50"
        />
        {elegido && (
          <span
            title="Cliente del modulo de Clientes"
            className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-primary text-lg"
          >
            verified
          </span>
        )}
      </div>

      {abierto && posicion && mostrarLista && createPortal(
        <div
          ref={listaRef}
          role="listbox"
          style={{
            top: posicion.top,
            bottom: posicion.bottom,
            left: posicion.left,
            width: posicion.ancho,
            maxHeight: posicion.maxHeight
          }}
          className={cn(
            'fixed overflow-y-auto overscroll-contain rounded-xl border border-outline-variant/50 bg-surface-container-lowest shadow-xl shadow-shadow/10',
            capa
          )}
        >
          {resultados.length > 0 ? (
            resultados.map(c => {
              const activa = c.id === clienteId && hayCoincidenciaExacta;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={activa}
                  onClick={() => elegir(c)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                    activa ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-surface-container-low'
                  )}
                >
                  <span className="material-symbols-outlined text-sm text-outline">person</span>
                  <span className="flex-1 min-w-0">
                    <span className={cn('block text-sm truncate', activa ? 'font-black' : 'font-bold')}>{c.nombre}</span>
                    {c.rut && <span className="block text-[10px] text-on-surface-variant/60 font-medium">{c.rut}</span>}
                  </span>
                  {activa && <span className="material-symbols-outlined text-sm text-primary">check</span>}
                </button>
              );
            })
          ) : (
            <p className="px-3 py-2.5 text-xs text-on-surface-variant">
              Sin coincidencias. Se guardará como <span className="font-black text-primary">{texto.trim()}</span>
            </p>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}