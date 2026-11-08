import { useMemo } from 'react';
import { useColoresTema } from '@/lib/useColoresTema';

/**
 * Orden categórico sobre --color-cat-N, elegido con el validador de paletas para que
 * colores vecinos (también el último con el primero, en las donas) se distingan con
 * daltonismo protan/deutan y con visión normal, en tema claro y oscuro:
 * azul, ámbar, violeta, verde, índigo, naranjo… El gris pizarra (cat-11) queda para "Otros".
 */
const ORDEN_CATEGORICO = [4, 2, 3, 6, 12, 8, 10, 9, 5, 1, 7] as const;

export interface PaletaGraficos {
  /** Semánticos de flujo: frío = entra, cálido = sale. Par seguro para daltonismo. */
  ingresos: string;
  egresos: string;
  neto: string;
  categorias: string[];
  otros: string;
  /** Estados (stock, cobro): siempre acompañados de etiqueta. */
  ok: string;
  alerta: string;
  critico: string;
  grilla: string;
  eje: string;
  superficie: string;
  cursor: string;
}

export function usePaletaGraficos(): PaletaGraficos {
  const c = useColoresTema();
  return useMemo(() => ({
    ingresos: c.cat5,
    egresos: c.cat8,
    neto: c.cat12,
    categorias: ORDEN_CATEGORICO.map(i => c[`cat${i}`]),
    otros: c.cat11,
    ok: c.success,
    alerta: c.warning,
    critico: c.error,
    grilla: c.outlineVariant,
    eje: c.onSurfaceVariant,
    superficie: c.surfaceLowest,
    cursor: c.surfaceHigh,
  }), [c]);
}
