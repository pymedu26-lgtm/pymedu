import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext';

const NOMBRES: Record<string, string> = {
  surface: '--color-surface',
  surfaceLowest: '--color-surface-container-lowest',
  surfaceLow: '--color-surface-container-low',
  surfaceContainer: '--color-surface-container',
  surfaceHigh: '--color-surface-container-high',
  onSurface: '--color-on-surface',
  onSurfaceVariant: '--color-on-surface-variant',
  outline: '--color-outline',
  outlineVariant: '--color-outline-variant',
  primary: '--color-primary',
  secondary: '--color-secondary',
  tertiary: '--color-tertiary',
  error: '--color-error',
  success: '--color-success',
  warning: '--color-warning',
  info: '--color-info',
  teal: '--color-teal',
  violet: '--color-violet',
  inverseSurface: '--color-inverse-surface',
  inverseOnSurface: '--color-inverse-on-surface',
};

export type ColoresTema = Record<keyof typeof NOMBRES, string>;

const FALLBACK: ColoresTema = {
  surface: '#F8F9FA',
  surfaceLowest: '#FFFFFF',
  surfaceLow: '#F3F4F5',
  surfaceContainer: '#EDEEEF',
  surfaceHigh: '#E7E8E9',
  onSurface: '#191C1D',
  onSurfaceVariant: '#454652',
  outline: '#767683',
  outlineVariant: '#C6C5D4',
  primary: '#1B3022',
  secondary: '#C5A059',
  tertiary: '#3F2427',
  error: '#ba1a1a',
  success: '#2E6B47',
  warning: '#8A6E2F',
  info: '#1F5C8B',
  teal: '#0F766E',
  violet: '#6D28D9',
  inverseSurface: '#2E3036',
  inverseOnSurface: '#EFF0F7',
};

function leer(): ColoresTema {
  if (typeof window === 'undefined') return FALLBACK;
  const estilos = getComputedStyle(document.documentElement);
  const salida = { ...FALLBACK };
  (Object.keys(NOMBRES) as Array<keyof typeof NOMBRES>).forEach((clave) => {
    const valor = estilos.getPropertyValue(NOMBRES[clave]).trim();
    if (valor) salida[clave] = valor;
  });
  return salida;
}

export function useColoresTema(): ColoresTema {
  const { theme } = useTheme();
  const [colores, setColores] = useState<ColoresTema>(leer);

  useEffect(() => {
    setColores(leer());
  }, [theme]);

  return colores;
}
