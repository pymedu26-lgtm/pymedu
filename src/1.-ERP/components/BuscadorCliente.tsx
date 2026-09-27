import { useEffect, useMemo, useRef, useState } from 'react';
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

/**
 * Campo de cliente con busqueda: filtra por nombre o RUT contra el modulo de
 * Clientes del ERP. Si no hay coincidencia se puede escribir un cliente nuevo.
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
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTexto(clienteNombre ?? '');
  }, [clienteId, clienteNombre]);

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

  const consulta = texto.trim().toLowerCase();
  const coincide = (c: Cliente) =>
    !consulta || c.nombre.toLowerCase().includes(consulta) || (c.rut ?? '').toLowerCase().includes(consulta);

  const resultados = useMemo(
    () => (consulta ? clientes.filter(coincide).slice(0, 8) : clientes.slice(0, 8)),
    [clientes, consulta]
  );

  const elegido = clientes.find(c => c.id === clienteId);
  const hayCoincidenciaExacta = !!elegido && elegido.nombre.toLowerCase() === consulta;

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

  return (
    <div ref={contenedorRef} className={cn('relative', className)}>
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none text-lg">
          search
        </span>
        <input
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

      {abierto && resultados.length > 0 && (
        <div
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-outline-variant/50 bg-surface-container-lowest shadow-xl shadow-shadow/10"
        >
          {resultados.map(c => {
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
          })}
        </div>
      )}

      {abierto && consulta && resultados.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3 py-2.5 shadow-xl shadow-shadow/10">
          <p className="text-xs text-on-surface-variant">
            Sin coincidencias. Se guardará como <span className="font-black text-primary">{texto.trim()}</span>
          </p>
        </div>
      )}
    </div>
  );
}
