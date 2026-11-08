// ═══════════════════════════════════════════════════════════════════════
// PymEdu Mentorías — contrato de la API (/api/mentorias/*)
// Backend: server/src/mentorias/rutas.js · Tablas: server/sql/03_mentorias.sql
// Estos tipos son la fuente de verdad compartida entre frontend y backend.
// ═══════════════════════════════════════════════════════════════════════

export type Formato = 'curso' | 'mentoria_grupal' | 'taller';
export type Visibilidad = 'comunidad' | 'publico' | 'privado';
/** Madurez del negocio (vocabulario único, ver «Reglas de diseño»). */
export type NivelMadurez = 'semilla' | 'crecimiento' | 'escala';
/** Dificultad del contenido: se muestra con otro nombre para no confundir con la madurez. */
export type Dificultad = 'basico' | 'intermedio' | 'avanzado';
export type TipoRecurso = 'video' | 'audio' | 'pdf';
export type TipoLeccion = 'video' | 'audio' | 'pdf' | 'cuestionario' | 'tarea';
export type EstadoCurso = 'borrador' | 'en_revision' | 'publicado' | 'archivado' | 'rechazado';
export type EstadoGrupo = 'abierto' | 'lleno' | 'en_curso' | 'terminado' | 'cancelado';
export type EstadoInscripcion = 'pendiente_pago' | 'activa' | 'completada' | 'lista_espera' | 'abandonada' | 'reembolsada';

export interface Persona { id: string; nombre: string; avatar_url?: string | null }

/** Etiqueta de origen que se muestra en la tarjeta. */
export interface Origen { tipo: 'comunidad' | 'publico' | 'proveedor'; etiqueta: string }

/** Tres estados de emisión (reemplaza la etiqueta «EN VIVO» engañosa). */
export interface EstadoVivo { tipo: 'grabado' | 'en_vivo' | 'proxima'; inicio?: string }

export interface CursoResumen {
  id: string;
  titulo: string;
  descripcion_corta: string;
  formato: Formato;
  visibilidad: Visibilidad;
  origen: Origen;
  categoria: { slug: string; nombre: string };
  nivel_madurez: NivelMadurez;
  dificultad: Dificultad;
  /** Pesos, entero. 0 = gratis. */
  precio: number;
  duracion_min: number;
  miniatura_url: string | null;
  mentor: Persona | null;
  tipo_recurso_principal: TipoRecurso;
  estado_vivo: EstadoVivo;
  inscrito: boolean;
  progreso_pct: number;
}

export interface Faceta<T extends string = string> { valor: T; nombre: string; total: number }

export interface CatalogoRespuesta {
  data: CursoResumen[];
  total: number;
  pagina: number;
  facetas: {
    categorias: Faceta[];
    niveles: Faceta<NivelMadurez>[];
    formatos: Faceta<TipoRecurso>[];
  };
}

export interface Leccion {
  id: string;
  orden: number;
  titulo: string;
  tipo: TipoLeccion;
  duracion_min: number;
  /** Solo viene si la persona está inscrita (video = URL de YouTube no listado). */
  url_recurso: string | null;
  completado: boolean;
  /** null = disponible. Si está bloqueada explica por qué («Se abre el jueves 14 a las 10:00», «Completa el paso 1»). */
  bloqueo: { motivo: string } | null;
}

export interface Modulo { id: string; orden: number; titulo: string; lecciones: Leccion[] }

export interface RecursoDescargable { id: string; nombre: string; tipo: 'pdf' | 'xlsx' | 'docx' | 'otro'; peso_kb: number }

export interface Sesion { id: string; inicio: string; fin: string; url_sala: string | null; url_grabacion: string | null }

export interface Grupo {
  id: string;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  cupos: number;
  inscritos: number;
  estado: EstadoGrupo;
  mentor: Persona | null;
  proxima_sesion: Sesion | null;
}

export interface Comentario { id: string; usuario_nombre: string; estrellas: number; texto: string; creado_en: string }

export interface CursoDetalle extends CursoResumen {
  descripcion: string;
  objetivos: string[];
  modulos: Modulo[];
  recursos: RecursoDescargable[];
  grupos: Grupo[];
  comentarios: { total: number; promedio: number; items: Comentario[] };
  inscripcion: { id: string; estado: EstadoInscripcion; grupo_id: string | null; progreso_pct: number } | null;
  /** Segundo donde quedó la persona en el último video (para retomar). */
  ultima_posicion_seg: number;
  /** Se emite al llegar al 100 %. */
  certificado?: Certificado | null;
}

/** Lo único que expone la verificación pública (GET /certificados/:codigo, sin sesión). */
export interface CertificadoPublico { participante: string; curso: string; organizacion: string; emitido_en: string }
export interface Certificado extends CertificadoPublico { codigo: string; curso_id: string }

export interface Acompanamiento {
  proxima_sesion: { curso_id: string; curso_titulo: string; inicio: string; mentor_nombre: string | null; url_sala: string | null } | null;
  ruta: { nivel: NivelMadurez; progreso_pct: number; cursos_completados: number; cursos_totales: number };
  actividad: { tipo: 'progreso' | 'inscripcion' | 'certificado' | 'comentario'; texto: string; fecha: string }[];
  /** Solo si el ERP está conectado: recomendación calculada con datos del negocio. */
  recomendacion: (CursoResumen & { motivo: string }) | null;
  erp_conectado: boolean;
}

export interface InscripcionRespuesta { id: string; estado: EstadoInscripcion; posicion_espera?: number }

// ── Gestión (proveedor, institución, curador, superadmin) ─────────────────

export interface CursoGestion {
  id: string;
  titulo: string;
  formato: Formato;
  visibilidad: Visibilidad;
  estado: EstadoCurso;
  categoria: { slug: string; nombre: string };
  precio: number;
  inscritos: number;
  actualizado_en: string;
  motivo_rechazo: string | null;
  organizacion: { id: string; nombre: string };
}

export interface CursoEntrada {
  titulo: string;
  descripcion: string;
  objetivos?: string[];
  formato: Formato;
  visibilidad: Visibilidad;
  categoria_slug: string;
  nivel_madurez: NivelMadurez;
  dificultad: Dificultad;
  precio: number;
  duracion_min: number;
  miniatura_url?: string | null;
  /** Obligatorio si visibilidad = 'comunidad'. */
  comunidad_id?: string | null;
}

/** Lista fija de chequeo del Comité de contenido. */
export interface ChecklistRevision {
  pertinencia: boolean;
  calidad: boolean;
  sin_info_enganosa: boolean;
  precio_declarado: boolean;
}

export interface RevisionPendiente extends CursoGestion {
  enviado_en: string;
  /** Quién debe aprobar según la visibilidad (comité, admin institucional o automática). */
  aprobador: 'comite' | 'institucion' | 'automatica';
}

export interface PanelMetricas {
  cursos_publicados: number;
  inscritos: number;
  completados: number;
  certificados: number;
  horas_consumidas: number;
  /** Sobre las asistencias registradas por los mentores; null = aún sin registros. */
  asistencia_pct: number | null;
  /** Rendición de cuentas: uso por curso. */
  por_curso: { curso_id: string; titulo: string; inscritos: number; completados: number; horas: number; asistencia_pct: number | null }[];
}

// ── Editor de contenido y grupos (/mentorias/gestion/:id) ─────────────────

export interface LeccionEditor {
  id: string;
  orden: number;
  titulo: string;
  tipo: TipoLeccion;
  url_recurso: string | null;
  duracion_min: number;
  /** UTC; se edita en hora de Chile. */
  disponible_desde: string | null;
  requiere_anterior: boolean;
}
export interface ModuloEditor { id: string; orden: number; titulo: string; lecciones: LeccionEditor[] }
export interface RecursoEditor extends RecursoDescargable { url: string }
export interface GrupoEditor extends Omit<Grupo, 'proxima_sesion'> { en_espera: number; sesiones: Sesion[] }

export interface CursoEditor {
  curso: CursoGestion & {
    descripcion: string; objetivos: string[]; nivel_madurez: NivelMadurez; dificultad: Dificultad;
    duracion_min: number; miniatura_url: string | null; comunidad_id: string | null;
  };
  /** Contenido editable solo en borrador o rechazado. */
  editable: boolean;
  puede_publicar: boolean;
  puede_eliminar: boolean;
  /** Grupos y sesiones se gestionan también con el curso publicado. */
  puede_grupos: boolean;
  comunidades: { id: string; nombre: string }[];
  modulos: ModuloEditor[];
  recursos: RecursoEditor[];
  grupos: GrupoEditor[];
}

export interface CandidatoMentor { id: string; nombre: string; rol: string }

// ── Mis grupos (mentor, coordinación, proveedor) ──────────────────────────

export interface GrupoOperacion extends Omit<Grupo, 'proxima_sesion'> {
  en_espera: number;
  curso: { id: string; titulo: string };
  soy_mentor: boolean;
  proxima_sesion: Sesion | null;
}
export interface Participante {
  inscripcion_id: string; usuario_id: string; nombre: string; estado: EstadoInscripcion; progreso_pct: number;
  /** Sesiones con asistencia marcada. */
  asistencias: number;
}
export interface RegistroAsistencia { sesion_id: string; usuario_id: string; asistio: boolean; minutos: number }
export interface GrupoDetalle extends GrupoOperacion { sesiones: Sesion[]; participantes: Participante[]; asistencia: RegistroAsistencia[] }

/** Comisiones fijadas en el documento de arquitectura (se aplican por `origen` de la inscripción). */
export const COMISIONES = {
  catalogo: 0.15,
  enlace_proveedor: 0.05,
  cupo_institucional: 0.10,
  institucion_propia: 0,
  gratuito: 0,
} as const;

export const ETIQUETA_NIVEL: Record<NivelMadurez, string> = { semilla: 'Semilla', crecimiento: 'Crecimiento', escala: 'Escala' };
export const ETIQUETA_DIFICULTAD: Record<Dificultad, string> = { basico: 'Básico', intermedio: 'Intermedio', avanzado: 'Avanzado' };
export const ETIQUETA_FORMATO: Record<Formato, string> = { curso: 'Curso', mentoria_grupal: 'Mentoría grupal', taller: 'Taller abierto' };
export const ETIQUETA_ESTADO_CURSO: Record<EstadoCurso, string> = {
  borrador: 'Borrador', en_revision: 'En revisión', publicado: 'Publicado', archivado: 'Archivado', rechazado: 'Rechazado',
};
