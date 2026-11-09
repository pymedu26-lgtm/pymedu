// Catálogo FIJO de permisos (formato modulo.accion). Cada app registra aquí los suyos;
// se carga en cuentas.permiso al arrancar y no se edita desde la interfaz.
// Plantillas de roles: ./plantillas-roles.json (migradas desde src/lib/roles.ts).
import { readFileSync } from 'fs';

const plantillas = JSON.parse(readFileSync(new URL('./plantillas-roles.json', import.meta.url), 'utf8'));

/** App dueña de cada módulo de la matriz. */
const APP_MODULO = {
  ventas: 'erp', gastos: 'erp', inventario: 'erp', promociones: 'erp', clientes: 'erp',
  proveedores: 'erp', caja: 'erp', reportes: 'erp', rrhh: 'erp', config: 'erp',
  mentoria: 'mentorias', comunidad: 'mentorias', programas: 'mentorias',
  academia: 'academia',
  dashboard: 'cuentas', organizaciones: 'cuentas', usuarios: 'cuentas', planes: 'cuentas',
  roles: 'cuentas', auditoria: 'cuentas', soporte: 'cuentas',
};

const ACCIONES = { leer: 'Ver', escribir: 'Crear y editar', eliminar: 'Eliminar' };
export const NIVEL_A_ACCIONES = { r: ['leer'], rw: ['leer', 'escribir'], rwd: ['leer', 'escribir', 'eliminar'] };

/** Permisos específicos de Mentorías (además de mentoria.leer/escribir/eliminar). */
const EXTRA = [
  ['mentorias.curso.crear', 'mentorias', 'mentoria', 'curso.crear', 'Crear cursos y mentorías grupales en borrador', ['plataforma', 'institucion', 'proveedor']],
  ['mentorias.curso.publicar', 'mentorias', 'mentoria', 'curso.publicar', 'Enviar cursos a revisión / publicar', ['plataforma', 'institucion', 'proveedor']],
  ['mentorias.curso.aprobar', 'mentorias', 'mentoria', 'curso.aprobar', 'Aprobar o rechazar cursos (Comité de contenido)', ['plataforma', 'institucion']],
  ['mentorias.grupo.gestionar', 'mentorias', 'mentoria', 'grupo.gestionar', 'Armar grupos, cohortes y asignar mentores', ['plataforma', 'institucion', 'proveedor']],
  ['mentorias.panel.ver', 'mentorias', 'mentoria', 'panel.ver', 'Ver panel de uso y rendición de cuentas', ['plataforma', 'institucion', 'proveedor']],
  ['mentorias.liquidaciones.ver', 'mentorias', 'mentoria', 'liquidaciones.ver', 'Ver ventas y liquidaciones del proveedor', ['plataforma', 'proveedor']],
  ['roles.gestionar', 'cuentas', 'roles', 'gestionar', 'Crear, editar y asignar roles de su organización', ['plataforma', 'institucion', 'negocio', 'proveedor']],
];

export const MODULOS = plantillas.modulos;

export const PERMISOS = [
  ...Object.keys(APP_MODULO).flatMap((modulo) =>
    Object.entries(ACCIONES).map(([accion, verbo]) => ({
      codigo: `${modulo}.${accion}`,
      app: APP_MODULO[modulo],
      modulo,
      accion,
      descripcion: `${verbo} · ${MODULOS[modulo]?.label ?? modulo}`,
      ambitos: ['plataforma', 'institucion', 'negocio', 'proveedor'],
    }))),
  ...EXTRA.map(([codigo, app, modulo, accion, descripcion, ambitos]) => ({ codigo, app, modulo, accion, descripcion, ambitos })),
];

const AMBITO_ROL = {
  superadmin: 'plataforma', demo: 'plataforma', curador: 'plataforma',
  admin_institucional: 'institucion', coordinador: 'institucion', mentor: 'institucion',
  admin_proveedor: 'proveedor', instructor: 'proveedor',
};
const SISTEMA = new Set(['superadmin', 'demo']);
const PLANTILLAS_COPIABLES = new Set(['vendedor', 'gestor', 'encargado_rrhh', 'empleado', 'contador_externo']);

const permisosDeMatriz = (matriz) =>
  Object.entries(matriz).flatMap(([modulo, nivel]) => (NIVEL_A_ACCIONES[nivel] ?? []).map((a) => `${modulo}.${a}`));

const extrasPorRol = {
  superadmin: EXTRA.map((e) => e[0]),
  demo: EXTRA.map((e) => e[0]),
  admin_institucional: ['mentorias.curso.crear', 'mentorias.curso.publicar', 'mentorias.curso.aprobar', 'mentorias.grupo.gestionar', 'mentorias.panel.ver', 'roles.gestionar'],
  coordinador: ['mentorias.grupo.gestionar', 'mentorias.panel.ver'],
  mentor: ['mentorias.curso.crear'],
  emprendedor: ['roles.gestionar'],
  'dueño': ['roles.gestionar'],
};

/** 12 roles actuales + 3 nuevos (Admin Proveedor, Instructor, Curador) como plantillas de sistema. */
export const ROLES_PLANTILLA = [
  ...plantillas.roles.map((r) => ({
    codigo: r.codigo,
    nombre: r.nombre,
    descripcion: r.descripcion,
    ambito: AMBITO_ROL[r.codigo] ?? 'negocio',
    es_sistema: SISTEMA.has(r.codigo),
    es_plantilla: PLANTILLAS_COPIABLES.has(r.codigo),
    permisos: [...new Set([...permisosDeMatriz(r.matriz), ...(extrasPorRol[r.codigo] ?? [])])],
  })),
  {
    codigo: 'admin_proveedor', nombre: 'Admin Proveedor', ambito: 'proveedor', es_sistema: false, es_plantilla: false,
    descripcion: 'Administra una organización proveedora de contenido: crea y vende cursos, gestiona instructores y ve liquidaciones.',
    permisos: ['mentoria.leer', 'mentoria.escribir', 'mentoria.eliminar', 'mentorias.curso.crear', 'mentorias.curso.publicar',
      'mentorias.grupo.gestionar', 'mentorias.panel.ver', 'mentorias.liquidaciones.ver', 'roles.gestionar'],
  },
  {
    codigo: 'instructor', nombre: 'Instructor', ambito: 'proveedor', es_sistema: false, es_plantilla: true, padre: 'admin_proveedor',
    descripcion: 'Dicta los cursos de un proveedor: corrige tareas y sigue la asistencia. No ve pagos.',
    permisos: ['mentoria.leer', 'mentoria.escribir', 'mentorias.curso.crear', 'mentorias.grupo.gestionar'],
  },
  {
    codigo: 'curador', nombre: 'Curador', ambito: 'plataforma', es_sistema: false, es_plantilla: false,
    descripcion: 'Integrante del Comité de contenido: revisa y aprueba cursos públicos con la lista de chequeo.',
    permisos: ['mentoria.leer', 'mentorias.curso.aprobar'],
  },
];
