import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Formato único dd-mm-aaaa (corrección #29). Se reexporta para no romper los imports existentes.
export { formatFecha, formatCLP } from './fechas';
