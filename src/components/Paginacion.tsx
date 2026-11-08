import { useEffect, useMemo, useState } from 'react';

/**
 * Paginación de listas largas (corrección #5: Clientes cargaba 2.503 filas e Inventario 10.061).
 * Renderizar solo una página mantiene la tabla fluida aunque la colección sea grande.
 * `reiniciarCon` vuelve a la página 1 cuando cambian filtros o búsqueda.
 */
export function usePaginacion<T>(items: T[], tamano = 25, reiniciarCon: unknown[] = []) {
  const [pagina, setPagina] = useState(1);
  const totalPaginas = Math.max(1, Math.ceil(items.length / tamano));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPagina(1); }, reiniciarCon);
  useEffect(() => { if (pagina > totalPaginas) setPagina(totalPaginas); }, [pagina, totalPaginas]);
  const visibles = useMemo(() => items.slice((pagina - 1) * tamano, pagina * tamano), [items, pagina, tamano]);
  return { visibles, pagina, totalPaginas, setPagina, total: items.length, desde: items.length ? (pagina - 1) * tamano + 1 : 0, hasta: Math.min(items.length, pagina * tamano) };
}

export default function Paginacion({ pagina, totalPaginas, setPagina, total, desde, hasta }: ReturnType<typeof usePaginacion<unknown>>) {
  if (total === 0) return null;
  const boton = 'flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/20 px-4 py-3 text-xs text-on-surface-variant">
      <span>
        Mostrando <b className="text-on-surface">{desde.toLocaleString('es-CL')}–{hasta.toLocaleString('es-CL')}</b> de <b className="text-on-surface">{total.toLocaleString('es-CL')}</b>
      </span>
      {totalPaginas > 1 && (
        <div className="flex items-center gap-1">
          <button className={`${boton} hover:bg-surface-container`} onClick={() => setPagina(1)} disabled={pagina === 1} aria-label="Primera página">
            <span className="material-symbols-outlined text-base">first_page</span>
          </button>
          <button className={`${boton} hover:bg-surface-container`} onClick={() => setPagina(pagina - 1)} disabled={pagina === 1} aria-label="Página anterior">
            <span className="material-symbols-outlined text-base">chevron_left</span>
          </button>
          <span className="px-2 font-bold text-on-surface">{pagina} / {totalPaginas}</span>
          <button className={`${boton} hover:bg-surface-container`} onClick={() => setPagina(pagina + 1)} disabled={pagina === totalPaginas} aria-label="Página siguiente">
            <span className="material-symbols-outlined text-base">chevron_right</span>
          </button>
          <button className={`${boton} hover:bg-surface-container`} onClick={() => setPagina(totalPaginas)} disabled={pagina === totalPaginas} aria-label="Última página">
            <span className="material-symbols-outlined text-base">last_page</span>
          </button>
        </div>
      )}
    </div>
  );
}
