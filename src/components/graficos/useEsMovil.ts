import { useSyncExternalStore } from 'react';

/** Bajo `sm` (640 px): teléfonos. Los gráficos muestran menos marcas y la leyenda abajo. */
const CONSULTA = '(max-width: 639px)';

const suscribir = (aviso: () => void) => {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(CONSULTA);
  mq.addEventListener('change', aviso);
  return () => mq.removeEventListener('change', aviso);
};

const leer = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(CONSULTA).matches;

export function useEsMovil(): boolean {
  return useSyncExternalStore(suscribir, leer, () => false);
}
