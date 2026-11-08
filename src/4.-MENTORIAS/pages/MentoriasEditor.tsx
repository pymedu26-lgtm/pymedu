// Editor de un curso: contenido (módulos, lecciones, recursos) y operación (grupos, cupos, sesiones).
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { mentoriasApi, type Metodo } from '../api';
import { FormularioCurso, FormularioPanel, formDesdeEditor, type CampoDef, type FormularioPanelProps, type Valores } from '../componentes/formularios';
import { Aviso, BarraProgreso, Chip, Esqueleto, Estado, EstadoError, Icono, Tarjeta, useCarga } from '../componentes/ui';
import {
  ETIQUETA_ESTADO_CURSO, type CandidatoMentor, type CursoEditor, type EstadoGrupo, type GrupoEditor, type LeccionEditor, type ModuloEditor,
  type RecursoEditor, type Sesion,
} from '../tipos';
import {
  aInputChile, duracion, ESTADO_GRUPO, esNoDisponible, fecha, fechaHora, hora, ICONO_ARCHIVO, mensajeError, pct, pesoArchivo,
  sumarMinutosInput, TIPO_LECCION, TONO_ESTADO_CURSO, youtubeId, type Tono,
} from '../util';

type Dialogo = Omit<FormularioPanelProps, 'onCerrar'>;
const ops = (lista: [string, string][]) => lista.map(([valor, texto]) => ({ valor, texto }));

const CAMPOS_MODULO: CampoDef[] = [{ k: 'titulo', etiqueta: 'Título del módulo', requerido: true, ancho: true }];
const CAMPOS_LECCION: CampoDef[] = [
  { k: 'titulo', etiqueta: 'Título', requerido: true, ancho: true },
  { k: 'tipo', etiqueta: 'Tipo', tipo: 'select', requerido: true, opciones: ops(Object.entries(TIPO_LECCION).map(([k, t]) => [k, t.nombre])) },
  { k: 'duracion_min', etiqueta: 'Duración (minutos)', tipo: 'numero' },
  { k: 'url_recurso', etiqueta: 'Enlace del recurso', tipo: 'url', ancho: true, placeholder: 'https://…', ayuda: 'Video: enlace de YouTube «no listado». Otros tipos: enlace de Drive, R2 u otro.' },
  { k: 'disponible_desde', etiqueta: 'Disponible desde (hora de Chile)', tipo: 'fechahora', ancho: true, ayuda: 'Déjalo vacío para que esté disponible de inmediato.' },
  { k: 'requiere_anterior', etiqueta: 'Exigir completar la lección anterior', tipo: 'check' },
];
const CAMPOS_RECURSO: CampoDef[] = [
  { k: 'nombre', etiqueta: 'Nombre', requerido: true, ancho: true },
  { k: 'tipo', etiqueta: 'Tipo de archivo', tipo: 'select', requerido: true, opciones: ops([['pdf', 'PDF'], ['xlsx', 'Excel (XLSX)'], ['docx', 'Word (DOCX)'], ['otro', 'Otro']]) },
  { k: 'peso_kb', etiqueta: 'Peso (KB)', tipo: 'numero' },
  { k: 'url', etiqueta: 'Enlace de descarga', tipo: 'url', requerido: true, ancho: true, placeholder: 'https://drive.google.com/…', ayuda: 'Se guarda tal cual; quienes estén inscritos lo reciben con un enlace temporal.' },
];
const CAMPOS_SESION: CampoDef[] = [
  { k: 'inicio', etiqueta: 'Inicio (hora de Chile)', tipo: 'fechahora', requerido: true },
  { k: 'fin', etiqueta: 'Término (hora de Chile)', tipo: 'fechahora', requerido: true },
  { k: 'url_sala', etiqueta: 'Enlace de la sala', tipo: 'url', ancho: true, placeholder: 'https://meet.google.com/…' },
  { k: 'url_grabacion', etiqueta: 'Enlace de la grabación', tipo: 'url', ancho: true, ayuda: 'Puedes agregarlo después de la sesión.' },
];
const ESTADOS_EDITABLES: EstadoGrupo[] = ['abierto', 'en_curso', 'terminado'];
function camposGrupo(mentores: CandidatoMentor[], g?: GrupoEditor): CampoDef[] {
  const actual = g?.mentor;
  const opciones = [...mentores.map((m) => ({ valor: m.id, texto: m.nombre })),
    ...(actual?.id && !mentores.some((m) => m.id === actual.id) ? [{ valor: actual.id, texto: actual.nombre }] : [])];
  return [
    { k: 'nombre', etiqueta: 'Nombre del grupo', requerido: true, ancho: true, placeholder: 'Grupo marzo' },
    { k: 'mentor_id', etiqueta: 'Mentor', tipo: 'select', ancho: true, opciones, vacio: actual && !actual.id ? `${actual.nombre} (sin cuenta en PymEdu)` : 'Sin mentor asignado' },
    { k: 'fecha_inicio', etiqueta: 'Inicio', tipo: 'fecha', requerido: true },
    { k: 'fecha_fin', etiqueta: 'Término', tipo: 'fecha', requerido: true },
    { k: 'cupos', etiqueta: 'Cupos', tipo: 'numero', requerido: true },
    ...(g ? [{ k: 'estado', etiqueta: 'Estado', tipo: 'select' as const, requerido: true, opciones: ESTADOS_EDITABLES.map((e) => ({ valor: e, texto: ESTADO_GRUPO[e].nombre })) }] : []),
  ];
}
// Al elegir el inicio, el término se propone 60 minutos después.
const derivarSesion = (v: Valores, campo: string): Valores =>
  campo === 'inicio' && v.inicio && (!v.fin || String(v.fin) <= String(v.inicio)) ? { ...v, fin: sumarMinutosInput(String(v.inicio), 60) } : v;

const SOLO_LECTURA: Partial<Record<CursoEditor['curso']['estado'], string>> = {
  en_revision: 'El curso está en revisión: su contenido queda bloqueado hasta que tenga respuesta.',
  publicado: 'El curso está publicado: su contenido ya no se puede modificar. Los grupos y sesiones sí se pueden gestionar.',
  archivado: 'El curso está archivado: solo se puede consultar.',
};

function VistaVideo({ v }: { v: Valores }) {
  if (v.tipo !== 'video' || !v.url_recurso) return null;
  const id = youtubeId(String(v.url_recurso));
  if (!id) return <Aviso tono="aviso">No reconocemos un video de YouTube en ese enlace.</Aviso>;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-(--m-border) p-2">
      <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" className="h-16 w-28 rounded-lg bg-(--m-skeleton) object-cover" />
      <p className="text-sm"><span className="block font-semibold text-(--m-success)">Video de YouTube reconocido</span>
        <span className="text-xs text-(--m-muted)">Id: <code>{id}</code></span></p>
    </div>
  );
}

/** Botones compactos de ícono: subir/bajar (si hay orden), editar y eliminar. */
function Acciones({ nombre, subir, bajar, editar, eliminar, ocupado }: {
  nombre: string; subir?: (() => void) | null; bajar?: (() => void) | null; editar?: () => void; eliminar?: () => void; ocupado: boolean;
}) {
  const b = 'grid size-11 place-items-center rounded-lg text-(--m-muted) hover:bg-(--m-card) hover:text-(--m-text) disabled:opacity-30 sm:size-8';
  const ordenable = subir !== undefined || bajar !== undefined;
  return (
    <div className="flex shrink-0 items-center">
      {ordenable && <button type="button" className={b} aria-label={`Subir ${nombre}`} disabled={ocupado || !subir} onClick={subir ?? undefined}><Icono n="arrow_upward" size={18} /></button>}
      {ordenable && <button type="button" className={b} aria-label={`Bajar ${nombre}`} disabled={ocupado || !bajar} onClick={bajar ?? undefined}><Icono n="arrow_downward" size={18} /></button>}
      {editar && <button type="button" className={b} aria-label={`Editar ${nombre}`} disabled={ocupado} onClick={editar}><Icono n="edit" size={18} /></button>}
      {eliminar && <button type="button" className={cn(b, 'hover:text-(--m-danger)')} aria-label={`Eliminar ${nombre}`} disabled={ocupado} onClick={eliminar}><Icono n="delete" size={18} /></button>}
    </div>
  );
}

const estructura = (mods: ModuloEditor[]) => mods.map((m) => ({ id: m.id, lecciones: m.lecciones.map((l) => l.id) }));
function intercambiar<T>(lista: T[], i: number, d: number): T[] {
  const r = [...lista];
  [r[i], r[i + d]] = [r[i + d], r[i]];
  return r;
}

export default function MentoriasEditor() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'grupos' ? 'grupos' : 'contenido';
  const { datos, setDatos, error, recargar } = useCarga(() => mentoriasApi.editor(id), [id]);
  const puedeGrupos = !!datos?.puede_grupos;
  const mentores = useCarga(() => (puedeGrupos ? mentoriasApi.mentores(id) : Promise.resolve([] as CandidatoMentor[])), [id, puedeGrupos]);
  const categorias = useCarga(() => mentoriasApi.categorias());
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [editandoDatos, setEditandoDatos] = useState(false);
  const [aviso, setAviso] = useState<{ tono: Tono; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  if (!datos) {
    if (error && esNoDisponible(error)) {
      return <Estado icono="lock" titulo="No puedes editar este curso" texto="No existe o pertenece a otra organización."
        accion={<Link to="/mentorias/gestion" className="m-btn m-btn-primario">Volver a mis cursos</Link>} />;
    }
    if (error) return <EstadoError error={error} onReintentar={recargar} />;
    return <div className="mx-auto max-w-5xl space-y-4" aria-busy="true"><Esqueleto className="h-10 w-2/3" /><Esqueleto className="h-11 w-72" /><Esqueleto className="h-64" /></div>;
  }

  const d: CursoEditor = datos;
  const c = d.curso;
  const lecciones = d.modulos.flatMap((m) => m.lecciones);
  const minutos = lecciones.reduce((a, l) => a + l.duracion_min, 0);

  /** Ejecuta una mutación del editor; devuelve el mensaje de error (o null). */
  const mutar = async (metodo: Metodo, ruta: string, cuerpo?: unknown, exito?: string): Promise<string | null> => {
    setOcupado(true);
    try {
      setDatos(await mentoriasApi.mutarEditor(metodo, ruta, cuerpo));
      if (exito) setAviso({ tono: 'exito', texto: exito });
      return null;
    } catch (e) {
      return mensajeError(e);
    } finally {
      setOcupado(false);
    }
  };
  // Acciones sin formulario (mover, eliminar, cancelar): el error se muestra arriba.
  const accion = async (metodo: Metodo, ruta: string, cuerpo?: unknown, exito?: string) => {
    const fallo = await mutar(metodo, ruta, cuerpo, exito);
    if (fallo) setAviso({ tono: 'peligro', texto: fallo });
  };
  const confirmar = (pregunta: string, ruta: string, exito: string) => { if (window.confirm(pregunta)) accion('DELETE', ruta, undefined, exito); };
  const formulario = (titulo: string, campos: CampoDef[], inicial: Valores, metodo: Metodo, ruta: string, exito: string, extra?: Partial<Dialogo>) =>
    setDialogo({ titulo, campos, inicial, edicion: metodo === 'PATCH', onGuardar: (cuerpo) => mutar(metodo, ruta, cuerpo, exito), ...extra });

  const ordenar = (e: ReturnType<typeof estructura>) => accion('PUT', `/cursos/${c.id}/orden`, { modulos: e });
  const moverModulo = (i: number, dir: number) => ordenar(intercambiar(estructura(d.modulos), i, dir));
  const moverLeccion = (mi: number, li: number, dir: number) => {
    const e = estructura(d.modulos);
    e[mi].lecciones = intercambiar(e[mi].lecciones, li, dir);
    ordenar(e);
  };
  const flechas = (i: number, total: number, mover: (dir: number) => void) =>
    total > 1 ? { subir: i > 0 ? () => mover(-1) : null, bajar: i < total - 1 ? () => mover(1) : null } : {};

  const leccion = (m: ModuloEditor, l?: LeccionEditor) => formulario(l ? 'Editar lección' : `Nueva lección en «${m.titulo}»`, CAMPOS_LECCION, {
    titulo: l?.titulo ?? '', tipo: l?.tipo ?? 'video', duracion_min: String(l?.duracion_min ?? 10), url_recurso: l?.url_recurso ?? '',
    disponible_desde: aInputChile(l?.disponible_desde), requiere_anterior: l?.requiere_anterior ?? false,
  }, l ? 'PATCH' : 'POST', l ? `/lecciones/${l.id}` : `/modulos/${m.id}/lecciones`, l ? 'Guardamos la lección.' : 'Agregamos la lección.',
  { extra: (v) => <VistaVideo v={v} /> });
  const recurso = (r?: RecursoEditor) => formulario(r ? 'Editar recurso' : 'Nuevo recurso descargable', CAMPOS_RECURSO,
    { nombre: r?.nombre ?? '', tipo: r?.tipo ?? 'pdf', peso_kb: r ? String(r.peso_kb) : '', url: r?.url ?? '' },
    r ? 'PATCH' : 'POST', r ? `/recursos/${r.id}` : `/cursos/${c.id}/recursos`, r ? 'Guardamos el recurso.' : 'Agregamos el recurso.');
  const grupo = (g?: GrupoEditor) => formulario(g ? `Editar «${g.nombre}»` : 'Nuevo grupo', camposGrupo(mentores.datos ?? [], g), {
    nombre: g?.nombre ?? '', mentor_id: g?.mentor?.id ?? '', fecha_inicio: g?.fecha_inicio ?? '', fecha_fin: g?.fecha_fin ?? '',
    cupos: String(g?.cupos ?? 20), estado: g?.estado === 'lleno' ? 'abierto' : g?.estado ?? 'abierto',
  }, g ? 'PATCH' : 'POST', g ? `/grupos/${g.id}` : `/cursos/${c.id}/grupos`, g ? 'Guardamos el grupo.' : 'Creamos el grupo: ahora agrégale sesiones.');
  const sesion = (g: GrupoEditor, s?: Sesion) => {
    // Nueva sesión: una semana después de la última (misma hora y sala) o el primer día del grupo a las 10:00.
    const ultima = g.sesiones.at(-1);
    const inicio = s ? aInputChile(s.inicio) : ultima ? sumarMinutosInput(aInputChile(ultima.inicio), 7 * 24 * 60) : `${g.fecha_inicio}T10:00`;
    const largo = ultima ? Math.round((Date.parse(ultima.fin) - Date.parse(ultima.inicio)) / 60_000) : 60;
    formulario(s ? 'Editar sesión' : `Nueva sesión de «${g.nombre}»`, CAMPOS_SESION, {
      inicio, fin: s ? aInputChile(s.fin) : sumarMinutosInput(inicio, largo), url_sala: s?.url_sala ?? ultima?.url_sala ?? '', url_grabacion: s?.url_grabacion ?? '',
    }, s ? 'PATCH' : 'POST', s ? `/sesiones/${s.id}` : `/grupos/${g.id}/sesiones`, s ? 'Guardamos la sesión.' : 'Agendamos la sesión.', { derivar: derivarSesion });
  };
  const cancelarGrupo = (g: GrupoEditor) => {
    const avisados = g.inscritos + g.en_espera;
    if (window.confirm(`¿Cancelar «${g.nombre}»?${avisados ? ` Avisaremos por correo a ${avisados} ${avisados === 1 ? 'persona' : 'personas'} (inscritas y en lista de espera).` : ''}`)) {
      accion('PATCH', `/grupos/${g.id}`, { estado: 'cancelado' }, `Cancelamos «${g.nombre}».`);
    }
  };

  const enviarRevision = async () => {
    setOcupado(true);
    try {
      await mentoriasApi.enviarRevision(c.id);
      setAviso({ tono: 'exito', texto: c.visibilidad === 'privado' ? 'Publicamos el curso (revisión automática).' : 'Enviamos el curso a revisión. Te avisaremos cuando tenga respuesta.' });
      recargar();
    } catch (e) {
      setAviso({ tono: 'peligro', texto: mensajeError(e) });
    } finally {
      setOcupado(false);
    }
  };
  const eliminarCurso = async () => {
    if (!window.confirm(`¿Eliminar el borrador «${c.titulo}» con todo su contenido? Esta acción no se puede deshacer.`)) return;
    try {
      await mentoriasApi.eliminarCurso(c.id);
      navigate('/mentorias/gestion');
    } catch (e) {
      setAviso({ tono: 'peligro', texto: mensajeError(e) });
    }
  };

  const soloLectura = !d.editable && (SOLO_LECTURA[c.estado] ?? 'Tu rol puede gestionar los grupos de este curso, pero no editar su contenido.');

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <nav aria-label="Ruta de navegación" className="flex flex-wrap items-center gap-1 text-sm text-(--m-muted)">
        <Link to="/mentorias/gestion" className="hover:text-(--m-accent-text)">Mis cursos</Link>
        <Icono n="chevron_right" size={16} />
        <span aria-current="page" className="max-w-[20rem] truncate font-semibold text-(--m-text)">{c.titulo}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Chip tono={TONO_ESTADO_CURSO[c.estado]}>{ETIQUETA_ESTADO_CURSO[c.estado]}</Chip>
            <Chip icono="apartment">{c.organizacion.nombre}</Chip>
          </div>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight">{c.titulo}</h1>
          <p className="text-sm text-(--m-muted)">
            {d.modulos.length} {d.modulos.length === 1 ? 'módulo' : 'módulos'} · {lecciones.length} {lecciones.length === 1 ? 'lección' : 'lecciones'} · {duracion(minutos)} · {d.grupos.length} {d.grupos.length === 1 ? 'grupo' : 'grupos'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.estado === 'publicado' && <Link to={`/mentorias/curso/${c.id}`} className="m-btn m-btn-secundario"><Icono n="visibility" />Ver ficha</Link>}
          {d.editable && <button type="button" className="m-btn m-btn-secundario" onClick={() => setEditandoDatos(true)}><Icono n="edit" />Editar datos</button>}
          {d.puede_publicar && (
            <button type="button" className="m-btn m-btn-primario" disabled={ocupado || !lecciones.length} onClick={enviarRevision}
              title={lecciones.length ? undefined : 'Agrega al menos una lección'}><Icono n="send" />Enviar a revisión</button>
          )}
        </div>
      </header>

      {soloLectura && <Aviso tono="info">{soloLectura}</Aviso>}
      {c.estado === 'rechazado' && c.motivo_rechazo && <Aviso tono="peligro"><strong>Motivo del rechazo:</strong> {c.motivo_rechazo}</Aviso>}
      {aviso && <Aviso tono={aviso.tono} onCerrar={() => setAviso(null)}>{aviso.texto}</Aviso>}

      <div role="tablist" aria-label="Secciones del editor" className="flex gap-1 border-b border-(--m-border)">
        {([['contenido', 'Contenido', 'view_list'], ['grupos', 'Grupos y sesiones', 'calendar_month']] as const).map(([k, texto, icono]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setParams(k === 'grupos' ? { tab: k } : {}, { replace: true })}
            className={cn('-mb-px flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition',
              tab === k ? 'border-(--m-accent) text-(--m-text)' : 'border-transparent text-(--m-muted) hover:text-(--m-text)')}>
            <Icono n={icono} size={18} />{texto}
          </button>
        ))}
      </div>

      {tab === 'contenido' ? (
        <>
          <Tarjeta titulo="Módulos y lecciones" icono="view_list"
            accion={d.editable && <button type="button" className="m-btn m-btn-secundario" disabled={ocupado}
              onClick={() => formulario('Nuevo módulo', CAMPOS_MODULO, { titulo: '' }, 'POST', `/cursos/${c.id}/modulos`, 'Agregamos el módulo.')}><Icono n="add" />Módulo</button>}>
            {!d.modulos.length ? (
              <p className="text-sm text-(--m-muted)">{d.editable ? 'Agrega el primer módulo y luego sus lecciones.' : 'Este curso no tiene contenido.'}</p>
            ) : (
              <ol className="space-y-4">
                {d.modulos.map((m, mi) => (
                  <li key={m.id} className="overflow-hidden rounded-xl border border-(--m-border)">
                    <div className="flex items-center gap-2 bg-(--m-subtle) py-1 pr-1 pl-3">
                      <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-(--m-muted)">Módulo {mi + 1}</span>
                      <strong className="min-w-0 flex-1 truncate text-sm">{m.titulo}</strong>
                      {d.editable && (
                        <Acciones nombre={`el módulo «${m.titulo}»`} ocupado={ocupado} {...flechas(mi, d.modulos.length, (dir) => moverModulo(mi, dir))}
                          editar={() => formulario('Editar módulo', CAMPOS_MODULO, { titulo: m.titulo }, 'PATCH', `/modulos/${m.id}`, 'Guardamos el módulo.')}
                          eliminar={() => confirmar(`¿Eliminar el módulo «${m.titulo}»${m.lecciones.length ? ` y sus ${m.lecciones.length} lecciones` : ''}?`, `/modulos/${m.id}`, 'Eliminamos el módulo.')} />
                      )}
                    </div>
                    <ul className="divide-y divide-(--m-border)">
                      {m.lecciones.map((l, li) => (
                        <li key={l.id} className="flex items-center gap-3 py-1.5 pr-1 pl-3">
                          <Icono n={TIPO_LECCION[l.tipo].icono} className="text-(--m-accent-text)" />
                          <div className="min-w-0 flex-1 py-1">
                            <p className="truncate text-sm font-semibold">{l.titulo}</p>
                            <p className="text-xs text-(--m-muted)">
                              {TIPO_LECCION[l.tipo].nombre} · {duracion(l.duracion_min)}
                              {l.disponible_desde && ` · Se abre el ${fechaHora(l.disponible_desde)}`}
                              {l.requiere_anterior && ' · Requiere la anterior'}
                              {!l.url_recurso && ['video', 'audio', 'pdf'].includes(l.tipo) && <span className="text-(--m-warning)"> · Falta el enlace</span>}
                            </p>
                          </div>
                          {d.editable && (
                            <Acciones nombre={`la lección «${l.titulo}»`} ocupado={ocupado} {...flechas(li, m.lecciones.length, (dir) => moverLeccion(mi, li, dir))}
                              editar={() => leccion(m, l)} eliminar={() => confirmar(`¿Eliminar la lección «${l.titulo}»?`, `/lecciones/${l.id}`, 'Eliminamos la lección.')} />
                          )}
                        </li>
                      ))}
                      {!m.lecciones.length && <li className="px-3 py-3 text-sm text-(--m-muted)">Sin lecciones todavía.</li>}
                    </ul>
                    {d.editable && (
                      <div className="border-t border-(--m-border) px-1 py-1">
                        <button type="button" className="m-btn px-3 text-(--m-accent-text)" disabled={ocupado} onClick={() => leccion(m)}><Icono n="add" />Agregar lección</button>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Tarjeta>

          <Tarjeta titulo="Recursos descargables" icono="download"
            accion={d.editable && <button type="button" className="m-btn m-btn-secundario" disabled={ocupado} onClick={() => recurso()}><Icono n="add" />Recurso</button>}>
            {d.recursos.length ? (
              <ul className="space-y-2">
                {d.recursos.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 rounded-xl border border-(--m-border) py-1.5 pr-1 pl-3">
                    <Icono n={ICONO_ARCHIVO[r.tipo] ?? 'draft'} className="text-(--m-accent-text)" />
                    <div className="min-w-0 flex-1 py-1">
                      <p className="truncate text-sm font-semibold">{r.nombre}</p>
                      <p className="truncate text-xs text-(--m-muted)">
                        {r.tipo === 'otro' ? 'Archivo' : r.tipo.toUpperCase()}{r.peso_kb > 0 && ` · ${pesoArchivo(r.peso_kb)}`} · {' '}
                        {/^https?:/.test(r.url) ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-(--m-accent-text) hover:underline">Abrir enlace</a> : 'Material de demostración'}
                      </p>
                    </div>
                    {d.editable && <Acciones nombre={`el recurso «${r.nombre}»`} ocupado={ocupado} editar={() => recurso(r)}
                      eliminar={() => confirmar(`¿Eliminar el recurso «${r.nombre}»?`, `/recursos/${r.id}`, 'Eliminamos el recurso.')} />}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-(--m-muted)">Sin recursos descargables.</p>}
          </Tarjeta>

          {d.puede_eliminar && (
            <div className="flex justify-end">
              <button type="button" className="m-btn m-btn-peligro" onClick={eliminarCurso}><Icono n="delete" />Eliminar borrador</button>
            </div>
          )}
        </>
      ) : (
        <Tarjeta titulo="Grupos, fechas y cupos" icono="groups"
          accion={d.puede_grupos && <button type="button" className="m-btn m-btn-secundario" disabled={ocupado || mentores.cargando} onClick={() => grupo()}><Icono n="add" />Grupo</button>}>
          {!d.puede_grupos && <div className="mb-4"><Aviso tono="info">Tu rol no puede gestionar los grupos de este curso.</Aviso></div>}
          {!d.grupos.length ? (
            <p className="text-sm text-(--m-muted)">Aún no hay grupos. Crea uno para que las personas se inscriban en fechas concretas, con cupos y sesiones en vivo.</p>
          ) : (
            <ul className="space-y-4">
              {d.grupos.map((g) => {
                const activo = d.puede_grupos && g.estado !== 'cancelado';
                return (
                  <li key={g.id} className={cn('rounded-xl border border-(--m-border) p-4', g.estado === 'cancelado' && 'opacity-60')}>
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold">{g.nombre}</h3>
                          <Chip tono={ESTADO_GRUPO[g.estado].tono}>{ESTADO_GRUPO[g.estado].nombre}</Chip>
                        </div>
                        <p className="mt-0.5 text-xs text-(--m-muted)">{fecha(g.fecha_inicio)} al {fecha(g.fecha_fin)} · {g.mentor ? `Mentor: ${g.mentor.nombre}` : 'Sin mentor asignado'}</p>
                        <div className="mt-2 flex max-w-sm items-center gap-2 text-xs text-(--m-muted)">
                          <BarraProgreso valor={pct(g.inscritos, g.cupos)} etiqueta={`Cupos ocupados en ${g.nombre}`} className="flex-1" />
                          {g.inscritos}/{g.cupos} cupos{g.en_espera > 0 && ` · ${g.en_espera} en espera`}
                        </div>
                      </div>
                      {activo && (
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className="m-btn m-btn-secundario" disabled={ocupado || mentores.cargando} onClick={() => grupo(g)}><Icono n="edit" />Editar</button>
                          <button type="button" className="m-btn m-btn-peligro" disabled={ocupado} onClick={() => cancelarGrupo(g)}>Cancelar grupo</button>
                        </div>
                      )}
                    </div>
                    <h4 className="mt-4 mb-1 text-xs font-bold uppercase tracking-wide text-(--m-muted)">Sesiones</h4>
                    {g.sesiones.length ? (
                      <ul className="divide-y divide-(--m-border) rounded-lg border border-(--m-border)">
                        {g.sesiones.map((s, i) => (
                          <li key={s.id} className="flex items-center gap-2 py-1 pr-1 pl-3 text-sm">
                            <Icono n="event" size={18} className="text-(--m-muted)" />
                            <span className="min-w-0 flex-1 py-1">
                              <strong>Sesión {i + 1}</strong> · {fechaHora(s.inicio)}–{hora(s.fin)}
                              {s.url_sala && <a href={s.url_sala} target="_blank" rel="noopener noreferrer" className="ml-2 text-(--m-accent-text) hover:underline">Sala</a>}
                              {s.url_grabacion && <a href={s.url_grabacion} target="_blank" rel="noopener noreferrer" className="ml-2 text-(--m-accent-text) hover:underline">Grabación</a>}
                            </span>
                            {activo && <Acciones nombre={`la sesión ${i + 1}`} ocupado={ocupado} editar={() => sesion(g, s)}
                              eliminar={() => confirmar(`¿Eliminar la sesión del ${fechaHora(s.inicio)}? También se borra su asistencia.`, `/sesiones/${s.id}`, 'Eliminamos la sesión.')} />}
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-sm text-(--m-muted)">Sin sesiones agendadas.</p>}
                    {activo && <button type="button" className="m-btn mt-1 px-3 text-(--m-accent-text)" disabled={ocupado} onClick={() => sesion(g)}><Icono n="add" />Agregar sesión</button>}
                  </li>
                );
              })}
            </ul>
          )}
        </Tarjeta>
      )}

      {dialogo && <FormularioPanel key={dialogo.titulo} {...dialogo} onCerrar={() => setDialogo(null)} />}
      {editandoDatos && (
        <FormularioCurso edicion={{ id: c.id, inicial: formDesdeEditor(d), cargando: false, parcial: false }} categorias={categorias.datos ?? []}
          comunidades={d.comunidades} onCerrar={() => setEditandoDatos(false)}
          onGuardado={() => { setEditandoDatos(false); setAviso({ tono: 'exito', texto: 'Guardamos los datos del curso.' }); recargar(); }} />
      )}
    </div>
  );
}
