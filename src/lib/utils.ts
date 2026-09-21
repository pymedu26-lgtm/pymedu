import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formatea una fecha ISO 'YYYY-MM-DD' como 'DD/MM/YYYY' sin conversión de zona horaria. */
export function formatFecha(iso?: string): string {
  const [y, m, d] = (iso ?? '').split('-');
  if (!y || !m || !d) return iso || '—';
  return `${d}/${m}/${y}`;
}
