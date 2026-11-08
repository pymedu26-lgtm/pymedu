// Cliente tipado de /api/mentorias/* (contrato en ./tipos.ts).
import { getToken, request } from '../lib/api';
import type {
  Acompanamiento, CandidatoMentor, CatalogoRespuesta, Certificado, CertificadoPublico, ChecklistRevision, Comentario, CursoDetalle,
  CursoEditor, CursoEntrada, CursoGestion, GrupoDetalle, GrupoOperacion, InscripcionRespuesta, PanelMetricas, RegistroAsistencia,
  RevisionPendiente,
} from './tipos';
import { guardarArchivo } from './util';

const B = '/api/mentorias';
export type Metodo = 'POST' | 'PATCH' | 'PUT' | 'DELETE';
const enviar = (method: Metodo, body?: unknown, extra?: RequestInit): RequestInit =>
  ({ method, body: body === undefined ? undefined : JSON.stringify(body), ...extra });
/** La mayoría de las respuestas vienen como { data }: se desenvuelven aquí. */
const data = <T>(p: Promise<{ data: T }>) => p.then((r) => r.data);

export interface FiltrosCatalogo { categoria?: string; nivel?: string; formato?: string; q?: string; pagina?: number }
export interface Categoria { slug: string; nombre: string }
export interface GestionRespuesta { data: CursoGestion[]; puede_crear: boolean; comunidades: { id: string; nombre: string }[] }
export type TipoPanel = 'institucion' | 'proveedor';

const query = (f: FiltrosCatalogo) => {
  const p = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => { if (v !== undefined && v !== '') p.set(k, String(v)); });
  return p.toString();
};

export const mentoriasApi = {
  catalogo: (f: FiltrosCatalogo) => request<CatalogoRespuesta>(`${B}/catalogo?${query(f)}`),
  categorias: () => data(request<{ data: Categoria[] }>(`${B}/categorias`)),
  curso: (id: string) => data(request<{ data: CursoDetalle }>(`${B}/cursos/${id}`)),
  inscribir: (curso_id: string, grupo_id?: string) =>
    data(request<{ data: InscripcionRespuesta }>(`${B}/inscripciones`, enviar('POST', { curso_id, grupo_id }))),
  cancelarInscripcion: (id: string) => data(request<{ data: { id: string } }>(`${B}/inscripciones/${id}`, enviar('DELETE'))),
  acompanamiento: () => data(request<{ data: Acompanamiento }>(`${B}/mi-acompanamiento`)),
  // keepalive: permite guardar la posición del video aunque se cierre la pestaña.
  progreso: (leccionId: string, body: { completado?: boolean; posicion_seg?: number }) =>
    data(request<{ data: { progreso_pct: number } }>(`${B}/lecciones/${leccionId}/progreso`, enviar('POST', body, { keepalive: true }))),
  enlaceRecurso: (id: string) => data(request<{ data: { url: string; expira_en: string } }>(`${B}/recursos/${id}/enlace`)),
  comentar: (cursoId: string, body: { estrellas: number; texto: string }) =>
    data(request<{ data: Comentario }>(`${B}/cursos/${cursoId}/comentarios`, enviar('POST', body))),
  misCertificados: () => data(request<{ data: Certificado[] }>(`${B}/mis-certificados`)),
  /** Pública (sin sesión). */
  verificarCertificado: (codigo: string) => data(request<{ data: CertificadoPublico }>(`${B}/certificados/${encodeURIComponent(codigo)}`)),

  gestion: () => request<GestionRespuesta>(`${B}/gestion/cursos`),
  crearCurso: (body: CursoEntrada) => data(request<{ data: CursoGestion }>(`${B}/cursos`, enviar('POST', body))),
  editarCurso: (id: string, body: Partial<CursoEntrada>) =>
    data(request<{ data: CursoGestion }>(`${B}/cursos/${id}`, enviar('PATCH', body))),
  eliminarCurso: (id: string) => data(request<{ data: { id: string } }>(`${B}/cursos/${id}`, enviar('DELETE'))),
  enviarRevision: (id: string) => data(request<{ data: CursoGestion }>(`${B}/cursos/${id}/revision`, enviar('POST'))),
  revisionesPendientes: () => data(request<{ data: RevisionPendiente[] }>(`${B}/revisiones/pendientes`)),
  resolverRevision: (id: string, body: { aprobado: boolean; motivo?: string; checklist: ChecklistRevision }) =>
    data(request<{ data: CursoGestion }>(`${B}/cursos/${id}/aprobar`, enviar('POST', body))),
  panel: (tipo: TipoPanel) => data(request<{ data: PanelMetricas }>(`${B}/panel/${tipo}`)),

  // Editor: todas las mutaciones (módulos, lecciones, orden, recursos, grupos, sesiones) responden con el editor completo.
  editor: (id: string) => data(request<{ data: CursoEditor }>(`${B}/cursos/${id}/editor`)),
  mutarEditor: (method: Metodo, ruta: string, body?: unknown) => data(request<{ data: CursoEditor }>(`${B}${ruta}`, enviar(method, body))),
  mentores: (cursoId: string) => data(request<{ data: CandidatoMentor[] }>(`${B}/cursos/${cursoId}/mentores`)),

  misGrupos: () => data(request<{ data: GrupoOperacion[] }>(`${B}/mis-grupos`)),
  grupo: (id: string) => data(request<{ data: GrupoDetalle }>(`${B}/grupos/${id}`)),
  guardarAsistencia: (sesionId: string, registros: Omit<RegistroAsistencia, 'sesion_id'>[]) =>
    data(request<{ data: RegistroAsistencia[] }>(`${B}/sesiones/${sesionId}/asistencia`, enviar('PUT', { registros }))),
  /** El .ics requiere sesión: se pide con el token y se guarda como archivo. */
  async descargarIcs(sesionId: string) {
    const r = await fetch(`${import.meta.env.VITE_API_URL ?? ''}${B}/sesiones/${sesionId}/ics`, { headers: { Authorization: `Bearer ${getToken() ?? ''}` } });
    if (!r.ok) throw Object.assign(new Error((await r.json().catch(() => null))?.error ?? `Error ${r.status}`), { status: r.status });
    guardarArchivo(await r.blob(), 'sesion-pymedu.ics');
  },
};
