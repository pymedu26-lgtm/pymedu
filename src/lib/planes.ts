// Fuente unica de verdad de planes, precios y limites.
// Se usa en la landing, en Plan y suscripcion y en el Panel general para que
// los tres lugares muestren siempre lo mismo.

export type PlanId = 'free' | 'pro' | 'premium';

export interface PlanInfo {
  id: PlanId;
  nombre: string;
  precio: number;
  descripcion: string;
  features: string[];
  destacado?: boolean;
}

/** Usos mensuales (movimientos) incluidos en el plan gratuito. */
export const LIMITE_USOS_FREE = 30;

export const PLANES: PlanInfo[] = [
  {
    id: 'free',
    nombre: 'Básico',
    precio: 0,
    descripcion: 'Para emprendimientos que están partiendo',
    features: [
      'Ventas, gastos e inventario',
      `Hasta ${LIMITE_USOS_FREE} usos al mes`,
      'Clientes y proveedores',
      'Academia gratuita',
      'Alertas tributarias básicas',
    ],
  },
  {
    id: 'pro',
    nombre: 'Pro',
    precio: 10000,
    descripcion: 'Para negocios en crecimiento',
    features: [
      'Todo lo del plan Básico',
      'Uso ilimitado del ERP',
      'Reportes SII y F29 preparado',
      'Clientes y proveedores ilimitados',
      'Cuentas por cobrar y pagar',
    ],
    destacado: true,
  },
  {
    id: 'premium',
    nombre: 'Premium',
    precio: 20000,
    descripcion: 'Para pymes que venden al Estado y necesitan más soporte',
    features: [
      'Todo lo del plan Pro',
      'Mercados Públicos y Portal Municipal',
      'Soporte prioritario',
    ],
  },
];

export const PLAN_FREE = PLANES[0];
export const PLAN_PRO = PLANES[1];
export const PLAN_PREMIUM = PLANES[2];

export function planPorId(id: string | null | undefined): PlanInfo {
  return PLANES.find((p) => p.id === id) ?? PLAN_FREE;
}

/** Los planes pagos (sin contar el gratuito). */
export function esPlanPago(nivel: string | null | undefined): boolean {
  return nivel === 'pro' || nivel === 'premium';
}

/** Mercados Públicos y Portal Municipal son exclusivos de Premium. */
export function puedeUsarMercadosPublicos(nivel: string | null | undefined): boolean {
  return nivel === 'premium';
}

export function formatearPrecio(precio: number): string {
  return `$${precio.toLocaleString('es-CL')}`;
}

// ── Planes institucionales ────────────────────────────────────────────────
// Son otra línea de producto: se licencian por organización (usuarios,
// emprendedores, mentores), no por negocio. Se mantienen acá para que el panel
// de superadministración no invente nombres ni precios distintos a los del
// resto de la plataforma.

export interface PlanInstitucionInfo {
  id: string;
  nombre: string;
  precio: number;
  descripcion: string;
  modulos: string[];
  limites: { usuarios: number; emprendedores: number; mentores: number; coordinadores: number };
  features: string[];
  popular?: boolean;
}

export const PLANES_INSTITUCION: PlanInstitucionInfo[] = [
  {
    id: 'institucion-basico',
    nombre: 'Básico Institucional',
    precio: 0,
    descripcion: 'Para organizaciones que están comenzando.',
    modulos: ['Academia'],
    limites: { usuarios: 50, emprendedores: 25, mentores: 5, coordinadores: 2 },
    features: ['Acceso a cursos básicos', '1 coordinador', 'Soporte por email', 'Reportes básicos'],
  },
  {
    id: 'institucion-profesional',
    nombre: 'Profesional Institucional',
    precio: 299000,
    descripcion: 'Para instituciones en crecimiento con necesidades avanzadas.',
    modulos: ['Academia', 'ERP', 'Mentoría'],
    limites: { usuarios: 200, emprendedores: 100, mentores: 20, coordinadores: 5 },
    features: ['Todo lo del Básico Institucional', 'ERP completo', 'Mentoría ilimitada', 'Soporte prioritario', 'Reportes avanzados', 'API básica'],
    popular: true,
  },
  {
    id: 'institucion-premium',
    nombre: 'Premium Institucional',
    precio: 599000,
    descripcion: 'Para grandes instituciones con acceso completo.',
    modulos: ['Academia', 'ERP', 'Mentoría', 'Comunidad', 'Laboratorio'],
    limites: { usuarios: -1, emprendedores: -1, mentores: -1, coordinadores: -1 },
    features: ['Todo lo del Profesional Institucional', 'Comunidad completa', 'Laboratorio de innovación', 'SSO / SAML', 'Soporte 24/7', 'API completa', 'Branding personalizado', 'SLA garantizado'],
  },
];

/** Módulos que se pueden habilitar por plan institucional. */
export const MODULOS_GLOBALES = [
  { id: 'academia', nombre: 'Academia', icon: 'school', descripcion: 'Cursos, módulos y certificaciones', incluidoEn: ['Básico Institucional', 'Profesional Institucional', 'Premium Institucional'] },
  { id: 'erp', nombre: 'ERP', icon: 'point_of_sale', descripcion: 'Ventas, gastos, inventario y contabilidad', incluidoEn: ['Profesional Institucional', 'Premium Institucional'] },
  { id: 'mentoria', nombre: 'Mentoría', icon: 'groups', descripcion: 'Sesiones, seguimiento y acuerdos', incluidoEn: ['Profesional Institucional', 'Premium Institucional'] },
  { id: 'comunidad', nombre: 'Comunidad', icon: 'diversity_3', descripcion: 'Networking y eventos entre emprendedores', incluidoEn: ['Premium Institucional'] },
  { id: 'laboratorio', nombre: 'Laboratorio', icon: 'science', descripcion: 'Innovación, prototipos y testing', incluidoEn: ['Premium Institucional'] },
];
