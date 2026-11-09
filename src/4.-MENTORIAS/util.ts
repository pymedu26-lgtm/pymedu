// Formatos y etiquetas compartidas del módulo Mentorías.
import { formatCLP, formatFecha } from '../lib/fechas';
import type { EstadoCurso, EstadoGrupo, RecursoDescargable, TipoLeccion, TipoRecurso, Visibilidad } from './tipos';

export type Tono = 'neutro' | 'acento' | 'exito' | 'info' | 'aviso' | 'peligro';

const formatoChile = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const partesChile = (d: Date) => Object.fromEntries(formatoChile.formatToParts(d).map((x) => [x.type, x.value])) as Record<string, string>;

/** dd-mm-aaaa (y HH:mm si `conHora`) en hora de Chile. Las fechas sin hora no se desplazan. */
export function fecha(iso?: string | null, conHora = false): string {
  if (!iso) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatFecha(iso);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return formatFecha(iso);
  const p = partesChile(d);
  return `${p.day}-${p.month}-${p.year}${conHora ? ` ${p.hour}:${p.minute}` : ''}`;
}
export const fechaHora = (iso?: string | null) => fecha(iso, true);
/** HH:mm en hora de Chile. */
export const hora = (iso: string) => { const p = partesChile(new Date(iso)); return `${p.hour}:${p.minute}`; };
/** aaaa-mm-dd del día en Chile (para comparar «hoy»). */
export const diaChile = (d: Date | string = new Date()) => { const p = partesChile(new Date(d)); return `${p.year}-${p.month}-${p.day}`; };

// ── <input type="datetime-local"> siempre en hora de Chile (aunque el navegador esté en otra zona) ──
/** UTC → «aaaa-mm-ddTHH:mm» de Chile. */
export function aInputChile(iso?: string | null): string {
  if (!iso) return '';
  const p = partesChile(new Date(iso));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
/** «aaaa-mm-ddTHH:mm» de Chile → ISO UTC (ajusta el desfase del horario de verano). */
export function desdeInputChile(local: string): string | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const objetivo = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let t = objetivo;
  for (let i = 0; i < 2; i++) {
    const p = partesChile(new Date(t));
    t += objetivo - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  }
  return new Date(t).toISOString();
}
/** Suma minutos a un valor de datetime-local (sin pasar por zonas horarias). */
export function sumarMinutosInput(local: string, minutos: number): string {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return '';
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + minutos * 60_000).toISOString().slice(0, 16);
}

/** Descarga un Blob como archivo. */
export function guardarArchivo(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: nombre }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Códigos de error de la API → texto para la persona. */
const ERRORES: Record<string, string> = {
  solo_borradores_editables: 'El contenido solo se puede editar mientras el curso está en borrador o rechazado.',
  curso_archivado: 'El curso está archivado.',
  curso_con_inscripciones: 'No se puede eliminar: el curso ya tiene inscripciones.',
  curso_sin_contenido: 'Agrega al menos una lección antes de enviar el curso a revisión.',
  url_video_invalida: 'El enlace no corresponde a un video de YouTube.',
  orden_invalido: 'El orden cambió mientras editabas. Recarga e inténtalo de nuevo.',
  fechas_invalidas: 'La fecha de término no puede ser anterior a la de inicio.',
  cupos_insuficientes: 'Los cupos no pueden ser menos que las personas ya inscritas (mínimo 1).',
  mentor_no_permitido: 'Esa persona no puede ser mentora de este curso.',
  horario_invalido: 'El término de la sesión debe ser posterior al inicio.',
  sesion_no_iniciada: 'Podrás pasar lista desde 30 minutos antes del inicio de la sesión.',
  registros_invalidos: 'Hay participantes que ya no pertenecen al grupo. Recarga la página.',
  inscripcion_no_cancelable: 'Esta inscripción ya no se puede cancelar.',
  sin_permiso: 'No tienes permiso para hacer esto.',
};
const CAMPO: Record<string, string> = {
  titulo: 'título', tipo: 'tipo', url_recurso: 'enlace', duracion_min: 'duración', disponible_desde: 'fecha de apertura',
  nombre: 'nombre', peso_kb: 'peso', url: 'enlace', fecha_inicio: 'fecha de inicio', fecha_fin: 'fecha de término',
  cupos: 'cupos', inicio: 'inicio', fin: 'término', url_sala: 'enlace de la sala', url_grabacion: 'enlace de la grabación',
};
export function mensajeError(e: unknown): string {
  const msg = (e as Error)?.message ?? String(e);
  const [codigo, campos] = msg.split(':');
  if (codigo === 'campos_invalidos' && campos) return `Revisa estos campos: ${campos.split(',').map((c) => CAMPO[c] ?? c).join(', ')}.`;
  return ERRORES[codigo] ?? msg;
}

export const precio = (n: number) => (n > 0 ? formatCLP(n) : 'Gratis');
export const numero = (n: number) => (Number(n) || 0).toLocaleString('es-CL');
export const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);

export function duracion(min: number): string {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}

export const pesoArchivo = (kb: number) =>
  kb >= 1024 ? `${(kb / 1024).toLocaleString('es-CL', { maximumFractionDigits: 1 })} MB` : `${Math.round(kb)} KB`;

export const truncar = (texto: string, max: number) => (texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto);

/** Id de YouTube desde youtu.be/…, watch?v=…, /embed/…, /shorts/… o el id suelto. */
export function youtubeId(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/);
  return m?.[1] ?? (/^[\w-]{11}$/.test(url) ? url : null);
}

/** 404/403 de un curso fuera de la comunidad de la persona. */
export function esNoDisponible(e: unknown): boolean {
  const err = e as { status?: number; message?: string } | null;
  return err?.status === 404 || err?.status === 403 || /\b40[34]\b|no encontrad|no disponible|not found|sin acceso/i.test(err?.message ?? '');
}

export const RECURSO: Record<TipoRecurso, { nombre: string; icono: string }> = {
  video: { nombre: 'Video', icono: 'play_circle' },
  audio: { nombre: 'Audio', icono: 'headphones' },
  pdf: { nombre: 'Guía PDF', icono: 'description' },
};

export const TIPO_LECCION: Record<TipoLeccion, { nombre: string; icono: string }> = {
  video: { nombre: 'Video', icono: 'play_circle' }, audio: { nombre: 'Audio', icono: 'headphones' },
  pdf: { nombre: 'Guía PDF', icono: 'description' }, cuestionario: { nombre: 'Cuestionario', icono: 'quiz' }, tarea: { nombre: 'Tarea', icono: 'assignment' },
};
export const ICONO_ARCHIVO: Record<RecursoDescargable['tipo'], string> = { pdf: 'picture_as_pdf', xlsx: 'table_chart', docx: 'article', otro: 'draft' };

export const ETIQUETA_VISIBILIDAD: Record<Visibilidad, string> = {
  comunidad: 'Solo mi comunidad', publico: 'Público', privado: 'Privado (enlace)',
};

export const TONO_ESTADO_CURSO: Record<EstadoCurso, Tono> = {
  borrador: 'neutro', en_revision: 'aviso', publicado: 'exito', archivado: 'neutro', rechazado: 'peligro',
};

export const ESTADO_GRUPO: Record<EstadoGrupo, { nombre: string; tono: Tono }> = {
  abierto: { nombre: 'Abierto', tono: 'exito' },
  lleno: { nombre: 'Lleno', tono: 'aviso' },
  en_curso: { nombre: 'En curso', tono: 'info' },
  terminado: { nombre: 'Terminado', tono: 'neutro' },
  cancelado: { nombre: 'Cancelado', tono: 'peligro' },
};
