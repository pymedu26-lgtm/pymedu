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
  // Rampa categórica de 12 pasos (--color-cat-1..12): gráficos por categoría.
  cat1: '--color-cat-1',
  cat2: '--color-cat-2',
  cat3: '--color-cat-3',
  cat4: '--color-cat-4',
  cat5: '--color-cat-5',
  cat6: '--color-cat-6',
  cat7: '--color-cat-7',
  cat8: '--color-cat-8',
  cat9: '--color-cat-9',
  cat10: '--color-cat-10',
  cat11: '--color-cat-11',
  cat12: '--color-cat-12',
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
  cat1: '#C62828',
  cat2: '#B26A00',
  cat3: '#6D28D9',
  cat4: '#1D4ED8',
  cat5: '#0F766E',
  cat6: '#15803D',
  cat7: '#047857',
  cat8: '#C2410C',
  cat9: '#0E7490',
  cat10: '#BE185D',
  cat11: '#475569',
  cat12: '#4F46E5',
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
    // Los efectos de los hijos corren antes que el del ThemeProvider, que es quien
    // escribe data-theme: leer aquí directamente tomaba los colores del tema anterior.
    // Se relee cuando el atributo cambia de verdad.
    setColores(leer());
    const observador = new MutationObserver(() => setColores(leer()));
    observador.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observador.disconnect();
  }, [theme]);

  return colores;
}
