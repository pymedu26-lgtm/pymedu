export type EstadoCaso = 'en_curso' | 'riesgo' | 'cerrado';

export interface Emprendedor {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  negocio: string;
  rubro: string;
  rut: string;
  region: string;
  comuna: string;
  estado: EstadoCaso;
  avance: number;
  cursosCompletados: number;
  cursosTotal: number;
  alertas: number;
  ultimaActividad: string;
  proximaSesion: string | null;
  riesgo: 'bajo' | 'medio' | 'alto';
  notas: string;
  metas: string[];
  documentos: string[];
}

export const emprendedores: Emprendedor[] = [
  {
    id: '1', nombre: 'Pedro Martínez', email: 'pedro@pyme.cl', telefono: '+56912345678',
    negocio: 'Pyme Demo Chile', rubro: 'Comercio', rut: '12.345.678-9',
    region: 'Metropolitana', comuna: 'Santiago',
    estado: 'en_curso', avance: 78, cursosCompletados: 12, cursosTotal: 18,
    alertas: 1, ultimaActividad: 'Hace 2 horas', proximaSesion: '28 Jul 2026, 10:00',
    riesgo: 'bajo', notas: 'Avanzando bien en módulo financiero. Pendiente revisar flujo de caja.',
    metas: ['Completar módulo de finanzas', 'Formalizar empresa ante SII', 'Abrir segunda sucursal'],
    documentos: ['Plan de negocio v2.pdf', 'RUT actualizado.pdf', 'Balance 2026.xlsx'],
  },
  {
    id: '2', nombre: 'Laura Díaz', email: 'laura@artesanias.cl', telefono: '+56987654321',
    negocio: 'Artesanías Laura', rubro: 'Artesanías', rut: '15.678.901-2',
    region: 'Biobío', comuna: 'Concepción',
    estado: 'riesgo', avance: 45, cursosCompletados: 6, cursosTotal: 18,
    alertas: 3, ultimaActividad: 'Hace 5 dias', proximaSesion: null,
    riesgo: 'alto', notas: 'Ha dejado de asistir a sesiones. Posible problema personal. Intentar contacto.',
    metas: ['Reactivar asistencia', 'Completar formulario Sercotec', 'Actualizar inventario'],
    documentos: ['Formulario Sercotec.docx', 'Catálogo productos.pdf'],
  },
  {
    id: '3', nombre: 'Roberto Sánchez', email: 'roberto@techsol.cl', telefono: '+56911223344',
    negocio: 'Tech Solutions', rubro: 'Tecnología', rut: '18.901.234-5',
    region: 'Metropolitana', comuna: 'Las Condes',
    estado: 'en_curso', avance: 92, cursosCompletados: 16, cursosTotal: 18,
    alertas: 0, ultimaActividad: 'Ayer', proximaSesion: '29 Jul 2026, 15:00',
    riesgo: 'bajo', notas: 'Excelente progreso. Casi listo para certificación final.',
    metas: ['Completar certificación', 'Postular a fondos Corfo', 'Escalar equipo'],
    documentos: ['Plan estratégico 2026.pdf', 'Estados financieros.xlsx'],
  },
  {
    id: '4', nombre: 'María López', email: 'maria@ecofoods.cl', telefono: '+56955667788',
    negocio: 'Eco Foods', rubro: 'Alimentos', rut: '14.567.890-3',
    region: 'Valparaíso', comuna: 'Viña del Mar',
    estado: 'en_curso', avance: 65, cursosCompletados: 9, cursosTotal: 18,
    alertas: 2, ultimaActividad: 'Hace 2 dias', proximaSesion: '30 Jul 2026, 11:00',
    riesgo: 'medio', notas: 'Necesita apoyo con facturación IVA. Confundida con F29.',
    metas: ['Aprender a declarar IVA', 'Obtener patente municipal', 'Crear marca registrada'],
    documentos: ['Facturas emitidas julio.pdf', 'Solicitud patente.docx'],
  },
  {
    id: '5', nombre: 'Juan Carlos Vega', email: 'jc@transportevega.cl', telefono: '+56933445566',
    negocio: 'Transporte Vega', rubro: 'Transporte', rut: '16.789.012-4',
    region: 'O\'Higgins', comuna: 'Rancagua',
    estado: 'cerrado', avance: 100, cursosCompletados: 18, cursosTotal: 18,
    alertas: 0, ultimaActividad: 'Hace 1 semana', proximaSesion: null,
    riesgo: 'bajo', notas: 'Caso cerrado exitosamente. Certificación completada. Empresa formalizada.',
    metas: ['Certificación completada ✓'],
    documentos: ['Certificado final.pdf', 'RUT empresa.pdf', 'Contrato arriendo.pdf'],
  },
];

export const estadoConfig: Record<EstadoCaso, { label: string; color: string }> = {
  en_curso: { label: 'En curso', color: 'bg-info-container text-on-info-container' },
  riesgo: { label: 'En riesgo', color: 'bg-error-container text-on-error-container' },
  cerrado: { label: 'Cerrado', color: 'bg-surface-container text-on-surface-variant' },
};

export const riesgoConfig = {
  bajo: { label: 'Bajo', color: 'bg-success-container text-on-success-container' },
  medio: { label: 'Medio', color: 'bg-warning-container text-on-warning-container' },
  alto: { label: 'Alto', color: 'bg-error-container text-on-error-container' },
};