export type Rol =
  | 'superadmin'
  | 'admin_institucional'
  | 'coordinador'
  | 'mentor'
  | 'emprendedor'
  | 'dueño'
  | 'vendedor'
  | 'gestor'
  | 'encargado_rrhh'
  | 'empleado'
  | 'contador_externo'
  | 'demo';

export type NivelPermiso = 'rwd' | 'rw' | 'r' | 'none';

export type GrupoRolId = 'reservado' | 'institucional' | 'pyme';

export type RolOrigen = 'sistema' | 'inst_admin' | 'pyme_admin';

export interface RolDefinicion {
  id: Rol;
  label: string;
  color: string;
  badge: string;
  icon: string;
  nivel: number;
  grupo: GrupoRolId;
  definidoPor: RolOrigen;
  descripcion: string;
  guia?: string;
  permisosApp: string[];
  matriz: Record<string, NivelPermiso>;
}

export interface GrupoRolDefinicion {
  id: GrupoRolId;
  label: string;
  icon: string;
  descripcion: string;
  roles: Rol[];
}

export const MODULOS: Record<string, { label: string; icon: string }> = {
  dashboard: { label: 'Panel', icon: 'dashboard' },
  organizaciones: { label: 'Organizaciones', icon: 'apartment' },
  programas: { label: 'Programas', icon: 'school' },
  usuarios: { label: 'Usuarios', icon: 'group' },
  comunidad: { label: 'Comunidad', icon: 'diversity_3' },
  mentoria: { label: 'Mentoría', icon: 'groups' },
  academia: { label: 'Academia', icon: 'auto_stories' },
  ventas: { label: 'Ventas', icon: 'point_of_sale' },
  gastos: { label: 'Compras y gastos', icon: 'receipt_long' },
  inventario: { label: 'Inventario', icon: 'inventory_2' },
  promociones: { label: 'Promociones', icon: 'loyalty' },
  clientes: { label: 'Clientes', icon: 'groups' },
  proveedores: { label: 'Proveedores', icon: 'local_shipping' },
  caja: { label: 'Caja y bancos', icon: 'account_balance' },
  reportes: { label: 'Reportes y tributos', icon: 'bar_chart' },
  rrhh: { label: 'RRHH', icon: 'badge' },
  config: { label: 'Configuración', icon: 'settings' },
  planes: { label: 'Planes', icon: 'workspace_premium' },
  roles: { label: 'Roles', icon: 'admin_panel_settings' },
  auditoria: { label: 'Auditoría', icon: 'fact_check' },
  soporte: { label: 'Soporte', icon: 'support_agent' },
};

const T = (rest: Record<string, NivelPermiso>): Record<string, NivelPermiso> => ({
  dashboard: 'none',
  organizaciones: 'none',
  programas: 'none',
  usuarios: 'none',
  comunidad: 'none',
  mentoria: 'none',
  academia: 'none',
  ventas: 'none',
  gastos: 'none',
  inventario: 'none',
  promociones: 'none',
  clientes: 'none',
  proveedores: 'none',
  caja: 'none',
  reportes: 'none',
  rrhh: 'none',
  config: 'none',
  planes: 'none',
  roles: 'none',
  auditoria: 'none',
  soporte: 'none',
  ...rest,
});

export const ROLES: RolDefinicion[] = [
  {
    id: 'superadmin',
    label: 'Super Admin',
    color: 'bg-red-500',
    badge: 'bg-red-100 text-red-700',
    icon: 'shield',
    nivel: 0,
    grupo: 'reservado',
    definidoPor: 'sistema',
    descripcion: 'Acceso total a la plataforma. Configuración global, auditoría, planes y soporte. Segmenta la información por institución.',
    permisosApp: [],
    matriz: T({
      dashboard: 'rwd', organizaciones: 'rwd', programas: 'rwd', usuarios: 'rwd',
      comunidad: 'rwd', mentoria: 'rwd', academia: 'rwd',
      ventas: 'rwd', gastos: 'rwd', inventario: 'rwd', promociones: 'rwd',
      clientes: 'rwd', proveedores: 'rwd', caja: 'rwd', reportes: 'rwd', rrhh: 'rwd',
      config: 'rwd', planes: 'rwd', roles: 'rwd', auditoria: 'rwd', soporte: 'rwd',
    }),
  },
  {
    id: 'demo',
    label: 'Demo (todos)',
    color: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-700',
    icon: 'theater_comedy',
    nivel: 0,
    grupo: 'reservado',
    definidoPor: 'sistema',
    descripcion: 'Cuenta de demostración con acceso a todos los roles del sistema. Solo para entornos de prueba.',
    permisosApp: [],
    matriz: T({
      dashboard: 'rwd', organizaciones: 'rwd', programas: 'rwd', usuarios: 'rwd',
      comunidad: 'rwd', mentoria: 'rwd', academia: 'rwd',
      ventas: 'rwd', gastos: 'rwd', inventario: 'rwd', promociones: 'rwd',
      clientes: 'rwd', proveedores: 'rwd', caja: 'rwd', reportes: 'rwd', rrhh: 'rwd',
      config: 'rwd', planes: 'rwd', roles: 'rwd', auditoria: 'rwd', soporte: 'rwd',
    }),
  },
  {
    id: 'admin_institucional',
    label: 'Admin Institucional',
    color: 'bg-purple-500',
    badge: 'bg-purple-100 text-purple-700',
    icon: 'admin_panel_settings',
    nivel: 1,
    grupo: 'institucional',
    definidoPor: 'inst_admin',
    descripcion: 'Administra su institución: usuarios, programas, comunidad, reportes y configuración. Ve la información de su institución.',
    permisosApp: [],
    matriz: T({
      dashboard: 'rw', organizaciones: 'r', programas: 'rw', usuarios: 'rw',
      comunidad: 'rw', mentoria: 'r', academia: 'r',
      ventas: 'r', gastos: 'r', inventario: 'r', promociones: 'r',
      clientes: 'r', proveedores: 'r', caja: 'r', reportes: 'rw', rrhh: 'r',
      config: 'rw', planes: 'r', roles: 'r', auditoria: 'r', soporte: 'rw',
    }),
  },
  {
    id: 'coordinador',
    label: 'Coordinador',
    color: 'bg-blue-500',
    badge: 'bg-blue-100 text-blue-700',
    icon: 'supervisor_account',
    nivel: 2,
    grupo: 'institucional',
    definidoPor: 'inst_admin',
    descripcion: 'Gestiona programas: asigna mentores, monitorea emprendedores y da seguimiento al avance.',
    permisosApp: ['ver_mentores', 'ver_emprendedores', 'gestionar_programas'],
    matriz: T({
      dashboard: 'r', programas: 'rw', usuarios: 'r', comunidad: 'r', mentoria: 'rw', academia: 'r',
    }),
  },
  {
    id: 'mentor',
    label: 'Mentor',
    color: 'bg-teal-500',
    badge: 'bg-teal-100 text-teal-700',
    icon: 'school',
    nivel: 3,
    grupo: 'institucional',
    definidoPor: 'inst_admin',
    descripcion: 'Acompaña a sus emprendedores asignados: sesiones, tareas y seguimiento. Accede a la Academia.',
    permisosApp: ['ver_mis_emprendedores', 'editar_seguimiento', 'ver_academia'],
    matriz: T({
      dashboard: 'r', programas: 'r', usuarios: 'r', comunidad: 'r', mentoria: 'rw', academia: 'r',
      ventas: 'r', gastos: 'r', clientes: 'r',
    }),
  },
  {
    id: 'emprendedor',
    label: 'Emprendedor',
    color: 'bg-green-500',
    badge: 'bg-green-100 text-green-700',
    icon: 'storefront',
    nivel: 4,
    grupo: 'institucional',
    definidoPor: 'sistema',
    descripcion: 'Titular de su propio negocio. Accede al ERP, la Academia y la mentoría asignada. Puede crear el equipo de su PYME.',
    permisosApp: [
      'ver_mi_perfil', 'editar_mi_negocio', 'ver_academia',
      'ver_inventario', 'ver_clientes', 'ver_proveedores',
      'ver_promociones', 'ver_equipo', 'ver_organigrama',
      'ver_documentos', 'ver_mercados_publicos', 'ver_mentorias',
    ],
    matriz: T({
      dashboard: 'r', comunidad: 'r', mentoria: 'r', academia: 'rw',
      ventas: 'rw', gastos: 'rw', inventario: 'r', promociones: 'r',
      clientes: 'r', proveedores: 'r', caja: 'r', reportes: 'r', rrhh: 'r',
      config: 'rw',
    }),
  },
  {
    id: 'dueño',
    label: 'Dueño / Admin PYME',
    color: 'bg-emerald-600',
    badge: 'bg-emerald-100 text-emerald-700',
    icon: 'storefront',
    nivel: 5,
    grupo: 'pyme',
    definidoPor: 'sistema',
    descripcion: 'Administrador de la PYME. Gestiona el negocio completo y define los tipos de rol de su equipo (ej: Vendedor, Cajero).',
    permisosApp: [
      'ver_mi_perfil', 'editar_mi_negocio', 'ver_academia',
      'ver_inventario', 'ver_clientes', 'ver_proveedores',
      'ver_promociones', 'ver_equipo', 'ver_organigrama',
      'ver_documentos', 'ver_mercados_publicos', 'ver_mentorias',
    ],
    matriz: T({
      dashboard: 'rw', comunidad: 'r', mentoria: 'r', academia: 'rw',
      ventas: 'rwd', gastos: 'rwd', inventario: 'rwd', promociones: 'rwd',
      clientes: 'rwd', proveedores: 'rwd', caja: 'rwd', reportes: 'rwd', rrhh: 'rwd',
      config: 'rwd',
    }),
  },
  {
    id: 'vendedor',
    label: 'Vendedor / Cajero',
    color: 'bg-orange-500',
    badge: 'bg-orange-100 text-orange-700',
    icon: 'point_of_sale',
    nivel: 5,
    grupo: 'pyme',
    definidoPor: 'pyme_admin',
    guia: 'VAR1',
    descripcion: 'Rol comercial de la PYME: registra ventas, atiende clientes y gestiona su perfil. Lo asigna el Administrador de la PYME.',
    permisosApp: ['crear_ventas', 'ver_clientes', 'ver_mi_perfil'],
    matriz: T({
      dashboard: 'r', ventas: 'rw', clientes: 'rw',
    }),
  },
  {
    id: 'gestor',
    label: 'Gestor',
    color: 'bg-cyan-500',
    badge: 'bg-cyan-100 text-cyan-700',
    icon: 'manage_accounts',
    nivel: 5,
    grupo: 'pyme',
    definidoPor: 'pyme_admin',
    guia: 'VAR2',
    descripcion: 'Operaciones de la PYME: inventario, caja, promociones, clientes, proveedores y reportes. Lo asigna el Administrador de la PYME.',
    permisosApp: [
      'crear_ventas', 'crear_gastos', 'ver_inventario', 'ver_caja',
      'ver_clientes', 'ver_proveedores', 'ver_promociones', 'ver_reportes',
      'ver_mi_perfil', 'ver_academia',
    ],
    matriz: T({
      dashboard: 'r', academia: 'r',
      ventas: 'r', gastos: 'rw', inventario: 'rw', promociones: 'rw',
      clientes: 'rw', proveedores: 'rw', caja: 'r', reportes: 'r',
    }),
  },
  {
    id: 'encargado_rrhh',
    label: 'Enc. RRHH',
    color: 'bg-pink-500',
    badge: 'bg-pink-100 text-pink-700',
    icon: 'badge',
    nivel: 5,
    grupo: 'pyme',
    definidoPor: 'pyme_admin',
    guia: 'VAR3',
    descripcion: 'Administra las remuneraciones y el equipo de la PYME: nómina, organigrama y documentos laborales. Lo asigna el Administrador de la PYME.',
    permisosApp: [
      'ver_remuneraciones', 'editar_remuneraciones', 'ver_empleados',
      'ver_equipo', 'ver_organigrama', 'ver_documentos', 'ver_mi_perfil',
    ],
    matriz: T({
      dashboard: 'r', academia: 'r', rrhh: 'rw', config: 'r',
    }),
  },
  {
    id: 'empleado',
    label: 'Empleado',
    color: 'bg-slate-500',
    badge: 'bg-slate-100 text-slate-700',
    icon: 'person',
    nivel: 5,
    grupo: 'pyme',
    definidoPor: 'pyme_admin',
    guia: 'VAR3',
    descripcion: 'Miembro del equipo de la PYME: acceso a su perfil, sus remuneraciones y la Academia. Lo asigna el Administrador de la PYME.',
    permisosApp: ['ver_mi_perfil', 'ver_remuneraciones', 'ver_academia'],
    matriz: T({
      dashboard: 'r', academia: 'r', rrhh: 'r',
    }),
  },
  {
    id: 'contador_externo',
    label: 'Contador externo',
    color: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-700',
    icon: 'calculate',
    nivel: 5,
    grupo: 'pyme',
    definidoPor: 'pyme_admin',
    guia: 'VAR3',
    descripcion: 'Profesional externo que revisa caja, reportes, contabilidad, clientes, proveedores e inventario de la PYME. Lo asigna el Administrador de la PYME.',
    permisosApp: [
      'ver_caja', 'ver_reportes', 'ver_reportes_fiscales', 'ver_contabilidad',
      'ver_clientes', 'ver_proveedores', 'ver_inventario', 'ver_mi_perfil',
    ],
    matriz: T({
      dashboard: 'r', caja: 'r', reportes: 'rw',
      clientes: 'r', proveedores: 'r', inventario: 'r',
    }),
  },
];

export const GRUPOS_ROL: GrupoRolDefinicion[] = [
  {
    id: 'reservado',
    label: 'Roles reservados',
    icon: 'lock',
    descripcion: 'Cuentas especiales de la plataforma. No se asignan ni se crean desde el panel: las gestiona el SuperAdmin.',
    roles: ['superadmin', 'demo'],
  },
  {
    id: 'institucional',
    label: 'Jerarquía institucional',
    icon: 'account_balance',
    descripcion: 'Estructura de las instituciones: SUPERADMIN → ADMINISTRADOR INSTITUCIONAL (1…n) → COORDINADOR → MENTOR → EMPRENDEDOR. Los asignan el SuperAdmin y el Admin Institucional.',
    roles: ['admin_institucional', 'coordinador', 'mentor', 'emprendedor'],
  },
  {
    id: 'pyme',
    label: 'PYME / Pequeña Empresa',
    icon: 'storefront',
    descripcion: 'Roles operativos de cada negocio. El Administrador de la PYME (Dueño o Emprendedor) los crea y asigna: corresponden a los tipos VAR1, VAR2 y VAR3 de la guía (ej: Vendedor, Cajero, Gestor, RRHH, Empleado, Contador externo).',
    roles: ['dueño', 'vendedor', 'gestor', 'encargado_rrhh', 'empleado', 'contador_externo'],
  },
];

export const ROL_INFO: Record<string, RolDefinicion> = Object.fromEntries(
  ROLES.map((r) => [r.id, r])
);

export const ROL_PUEDE_HACER: Record<string, string[]> = Object.fromEntries(
  ROLES.map((r) => [r.id, r.permisosApp])
);

export function esRolPyme(rol: string): boolean {
  return ROL_INFO[rol]?.grupo === 'pyme';
}

export function rolLabel(rol: string): string {
  return ROL_INFO[rol]?.label ?? rol;
}