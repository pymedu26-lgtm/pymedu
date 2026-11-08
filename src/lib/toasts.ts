// Avisos en vivo (toasts) sin dependencias: cualquier módulo llama a `mostrarToast` y el
// componente <Toaster /> (montado en ERPLayout) los pinta con role="status".
export type TipoToast = 'info' | 'exito' | 'aviso' | 'error';

export interface Toast {
  id: string;
  titulo: string;
  detalle?: string;
  tipo: TipoToast;
  /** Enlace opcional («Ver ficha»). */
  accion?: { etiqueta: string; url: string };
  duracion: number;
}

type Oyente = (t: Toast) => void;
const oyentes = new Set<Oyente>();
let secuencia = 0;

export function mostrarToast(t: Omit<Toast, 'id' | 'duracion' | 'tipo'> & { tipo?: TipoToast; duracion?: number }): void {
  const toast: Toast = { tipo: 'info', duracion: 6000, ...t, id: `t${Date.now()}-${++secuencia}` };
  oyentes.forEach(o => o(toast));
}

export function escucharToasts(o: Oyente): () => void {
  oyentes.add(o);
  return () => { oyentes.delete(o); };
}
