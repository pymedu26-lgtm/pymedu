// Fuente única de planes (correcciones #18/#19): la usan Landing, Suscripción y SuperAdmin.
// Montos y duración replican PLANES de server/src/webpay.js; si cambian allá, actualizar aquí.

export type PlanId = 'free' | 'pro' | 'premium';

export interface FeaturePlan {
  texto: string;
  estado: 'disponible' | 'proximamente';
}

export interface Plan {
  id: PlanId;
  nombre: string;
  /** CLP, entero. 0 = gratis. */
  precio: number;
  /** Días de acceso que otorga un pago (null = sin vencimiento). */
  duracionDias: number | null;
  descripcion: string;
  icon: string;
  destacado?: boolean;
  features: FeaturePlan[];
}

const si = (texto: string): FeaturePlan => ({ texto, estado: 'disponible' });
const pronto = (texto: string): FeaturePlan => ({ texto, estado: 'proximamente' });

export const PLANES: Plan[] = [
  {
    id: 'free', nombre: 'Básico', precio: 0, duracionDias: null, icon: 'storefront',
    descripcion: 'Para empezar a ordenar tu negocio',
    features: [si('Ventas, gastos e inventario'), si('Hasta 30 usos al mes'), si('Academia gratuita'), si('Alertas tributarias básicas')],
  },
  {
    id: 'pro', nombre: 'Pro', precio: 10000, duracionDias: 30, icon: 'trending_up', destacado: true,
    descripcion: 'Para negocios en crecimiento',
    features: [
      si('Todo lo del plan Básico'), si('Uso ilimitado del ERP'), si('Reportes e IVA mensual (preparador F29)'),
      si('Clientes y proveedores ilimitados'), si('Cuentas por cobrar y pagar'),
    ],
  },
  {
    id: 'premium', nombre: 'Premium', precio: 20000, duracionDias: 90, icon: 'workspace_premium',
    descripcion: 'Para pymes que quieren acompañamiento',
    features: [
      si('Todo lo del plan Pro'), si('Mentorías premium'), si('Mercados Públicos y Portal Municipal'), si('Soporte prioritario'),
      pronto('RRHH: remuneraciones y documentos laborales'), pronto('Equipo: roles e invitaciones'), pronto('Asistente IA'),
    ],
  },
];

export const planPorId = (id?: string | null) => PLANES.find(p => p.id === id) ?? PLANES[0];

/** '/mes' para 30 días; si no, la duración real que otorga el pago. */
export const periodoPlan = (p: Plan) => (!p.duracionDias ? '' : p.duracionDias === 30 ? '/mes' : `/ ${p.duracionDias} días`);

// Webpay: el servidor usa TBK_ENV (por defecto 'integracion'). El front lo replica con VITE_TBK_ENV;
// mientras no sea 'produccion' se muestra la insignia "Modo prueba" (corrección #6).
export const WEBPAY_MODO_PRUEBA = (import.meta.env.VITE_TBK_ENV ?? 'integracion') !== 'produccion';
