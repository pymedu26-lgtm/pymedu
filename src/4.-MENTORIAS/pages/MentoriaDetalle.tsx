import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { mentoriasApi } from '../api';
import BadgeVivo from '../componentes/BadgeVivo';
import { BotonCertificado, BotonIcs } from '../componentes/BotonDescarga';
import { Miniatura, OrigenTag } from '../componentes/TarjetaCurso';
import { Aviso, BarraProgreso, Chip, Esqueleto, Estado, EstadoError, Estrellas, Icono, Tarjeta, useCarga } from '../componentes/ui';
import {
  ETIQUETA_DIFICULTAD, ETIQUETA_FORMATO, ETIQUETA_NIVEL,
  type Comentario, type CursoDetalle, type EstadoInscripcion, type Leccion, type RecursoDescargable,
} from '../tipos';
import {
  duracion, ESTADO_GRUPO, esNoDisponible, fecha, fechaHora, ICONO_ARCHIVO, mensajeError, pct, pesoArchivo, precio, TIPO_LECCION as LECCION, youtubeId, type Tono,
} from '../util';

const CANCELABLE: EstadoInscripcion[] = ['activa', 'pendiente_pago', 'lista_espera'];
const INSCRIPCION: Record<EstadoInscripcion, { texto: string; tono: Tono }> = {
  activa: { texto: 'Inscripción activa', tono: 'exito' },
  completada: { texto: 'Mentoría completada', tono: 'exito' },
  pendiente_pago: { texto: 'Pendiente de pago', tono: 'aviso' },
  lista_espera: { texto: 'En lista de espera', tono: 'info' },
  abandonada: { texto: 'Inscripción abandonada', tono: 'neutro' },
  reembolsada: { texto: 'Inscripción reembolsada', tono: 'neutro' },
};

// ── Reproductor de YouTube con la IFrame API (carga diferida) para guardar la posición ──
type YT = { Player: new (el: HTMLIFrameElement) => { getCurrentTime?: () => number } };
type VentanaYT = Window & { YT?: YT; onYouTubeIframeAPIReady?: () => void };
let apiYT: Promise<void> | null = null;
function cargarApiYT(): Promise<void> {
  const w = window as VentanaYT;
  return apiYT ??= new Promise<void>((listo) => {
    if (w.YT?.Player) return listo();
    const previo = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { previo?.(); listo(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    document.head.appendChild(s);
  });
}

function Reproductor({ leccion, videoId, inicio }: { leccion: Leccion; videoId: string; inicio: number; key?: string }) {
  const iframe = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    let vivo = true;
    let player: { getCurrentTime?: () => number } | null = null;
    cargarApiYT().then(() => {
      const YT = (window as VentanaYT).YT;
      if (vivo && iframe.current && YT) player = new YT.Player(iframe.current);
    });
    const guardar = () => {
      const seg = Math.floor(player?.getCurrentTime?.() ?? 0);
      if (seg > 0) mentoriasApi.progreso(leccion.id, { posicion_seg: seg }).catch(() => undefined);
    };
    const alOcultar = () => { if (document.visibilityState === 'hidden') guardar(); };
    document.addEventListener('visibilitychange', alOcultar);
    return () => { vivo = false; document.removeEventListener('visibilitychange', alOcultar); guardar(); };
  }, [leccion.id]);

  const src = `https://www.youtube-nocookie.com/embed/${videoId}?start=${Math.max(0, Math.floor(inicio))}&enablejsapi=1&rel=0&origin=${encodeURIComponent(window.location.origin)}`;
  return (
    <iframe ref={iframe} src={src} title={`Video: ${leccion.titulo}`} className="aspect-video w-full bg-black"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
  );
}

function FormComentario({ cursoId, onCreado }: { cursoId: string; onCreado: (c: Comentario) => void }) {
  const [estrellas, setEstrellas] = useState(0);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError('');
    try {
      onCreado(await mentoriasApi.comentar(cursoId, { estrellas, texto: texto.trim() }));
      setEstrellas(0);
      setTexto('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="mt-4 space-y-3 rounded-xl bg-(--m-subtle) p-4">
      <fieldset>
        <legend className="text-sm font-semibold">Tu calificación</legend>
        <div className="flex">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`} aria-pressed={estrellas === n}
              onClick={() => setEstrellas(n)} className="grid size-11 place-items-center rounded-lg">
              <Icono n="star" size={26} fill={n <= estrellas} className={n <= estrellas ? 'text-(--m-accent)' : 'text-(--m-muted)'} />
            </button>
          ))}
        </div>
      </fieldset>
      <label htmlFor="m-comentario" className="block text-sm font-semibold">Comentario</label>
      <textarea id="m-comentario" className="m-input min-h-24" maxLength={1000} value={texto}
        onChange={(e) => setTexto(e.target.value)} placeholder="¿Qué te pareció esta mentoría?" />
      {error && <Aviso tono="peligro">{error}</Aviso>}
      <button type="submit" className="m-btn m-btn-primario" disabled={!estrellas || !texto.trim() || enviando}>
        {enviando ? 'Publicando…' : 'Publicar comentario'}
      </button>
    </form>
  );
}

export default function MentoriaDetalle() {
  const { id = '' } = useParams();
  const { hash } = useLocation();
  const { datos: curso, setDatos, error, recargar } = useCarga(() => mentoriasApi.curso(id), [id]);
  const [leccionId, setLeccionId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tono: Tono; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => { setLeccionId(null); setAviso(null); }, [id]);
  const listo = !!curso;
  useEffect(() => { if (listo && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }); }, [listo, hash]);

  const lecciones = useMemo(() => curso?.modulos.flatMap((m) => m.lecciones) ?? [], [curso]);
  // Lección por defecto: el primer video disponible sin completar (ahí se retoma ultima_posicion_seg).
  const porDefecto = useMemo(() => {
    const videos = lecciones.filter((l) => l.tipo === 'video' && !l.bloqueo && youtubeId(l.url_recurso));
    return videos.find((l) => !l.completado) ?? videos[0] ?? null;
  }, [lecciones]);
  const proximoGrupo = useMemo(() => {
    const porFecha = [...(curso?.grupos ?? [])].sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));
    return porFecha.find((g) => g.estado === 'abierto') ?? porFecha.find((g) => g.estado === 'lleno') ?? null;
  }, [curso]);

  if (!curso) {
    if (error && esNoDisponible(error)) {
      return (
        <Estado icono="lock" titulo="Esta mentoría no está disponible"
          texto="Puede pertenecer a una comunidad de la que no formas parte o ya no estar publicada."
          accion={<Link to="/mentorias" className="m-btn m-btn-primario">Volver a explorar</Link>} />
      );
    }
    if (error) return <EstadoError error={error} onReintentar={recargar} />;
    return (
      <div className="mx-auto max-w-6xl space-y-4" aria-busy="true">
        <Esqueleto className="h-4 w-64" /><Esqueleto className="h-9 w-2/3" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"><Esqueleto className="aspect-video" /><Esqueleto className="h-80" /></div>
      </div>
    );
  }

  const c: CursoDetalle = curso;
  const actual = lecciones.find((l) => l.id === leccionId) ?? porDefecto;
  const videoId = c.inscrito && actual ? youtubeId(actual.url_recurso) : null;
  const ins = c.inscripcion;
  const puedeInscribirse = !ins || ins.estado === 'abandonada' || ins.estado === 'reembolsada';
  const progreso = ins?.progreso_pct ?? c.progreso_pct;

  const accion = async (clave: string, fn: () => Promise<void>) => {
    setOcupado(clave);
    try { await fn(); } catch (e) { setAviso({ tono: 'peligro', texto: mensajeError(e) }); } finally { setOcupado(null); }
  };

  const cancelar = () => {
    if (!ins || !window.confirm(`¿Cancelar tu inscripción en «${c.titulo}»?${ins.grupo_id && ins.estado !== 'lista_espera' ? ' Liberarás tu cupo en el grupo.' : ''} Podrás volver a inscribirte si quedan cupos.`)) return;
    accion('cancelar', async () => {
      await mentoriasApi.cancelarInscripcion(ins.id);
      setAviso({ tono: 'info', texto: 'Cancelamos tu inscripción.' });
      recargar();
    });
  };

  const inscribir = () => accion('inscribir', async () => {
    const r = await mentoriasApi.inscribir(c.id, proximoGrupo?.id);
    setAviso(
      r.estado === 'activa' ? { tono: 'exito', texto: '¡Listo! Ya estás inscrito y puedes comenzar cuando quieras.' }
        : r.estado === 'pendiente_pago' ? { tono: 'aviso', texto: 'Reservamos tu cupo. Completa el pago para activar tu inscripción.' }
          : r.estado === 'lista_espera' ? { tono: 'info', texto: `El grupo está lleno: quedaste en lista de espera${r.posicion_espera ? ` (posición ${r.posicion_espera})` : ''}. Te avisaremos si se libera un cupo.` }
            : { tono: 'info', texto: INSCRIPCION[r.estado]?.texto ?? 'Inscripción registrada.' });
    recargar();
  });

  const marcar = (l: Leccion) => accion(l.id, async () => {
    const { progreso_pct } = await mentoriasApi.progreso(l.id, { completado: true });
    setDatos((x: CursoDetalle | null) => x && {
      ...x, progreso_pct,
      inscripcion: x.inscripcion && { ...x.inscripcion, progreso_pct },
      modulos: x.modulos.map((m) => ({ ...m, lecciones: m.lecciones.map((y) => (y.id === l.id ? { ...y, completado: true } : y)) })),
    });
    recargar(); // refresca los bloqueos que dependen del paso completado
  });

  const descargar = (r: RecursoDescargable) => accion(r.id, async () => {
    const { url } = await mentoriasApi.enlaceRecurso(r.id);
    const ventana = window.open(url, '_blank');
    if (ventana) ventana.opener = null; else window.location.assign(url);
  });

  const comentado = (nuevo: Comentario) => setDatos((x: CursoDetalle | null) => x && {
    ...x,
    comentarios: {
      items: [nuevo, ...x.comentarios.items],
      total: x.comentarios.total + 1,
      promedio: (x.comentarios.promedio * x.comentarios.total + nuevo.estrellas) / (x.comentarios.total + 1),
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <nav aria-label="Ruta de navegación" className="flex flex-wrap items-center gap-1 text-sm text-(--m-muted)">
        <Link to="/mentorias" className="hover:text-(--m-accent-text)">Mentorías</Link>
        <Icono n="chevron_right" size={16} />
        <Link to={`/mentorias?categoria=${encodeURIComponent(c.categoria.slug)}`} className="hover:text-(--m-accent-text)">{c.categoria.nombre}</Link>
        <Icono n="chevron_right" size={16} />
        <span aria-current="page" className="max-w-[18rem] truncate font-semibold text-(--m-text)">{c.titulo}</span>
      </nav>

      <header className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <OrigenTag origen={c.origen} />
          <Chip>{ETIQUETA_FORMATO[c.formato]}</Chip>
          <BadgeVivo estado={c.estado_vivo} />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{c.titulo}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-(--m-muted)">
          <span className="mr-2 flex items-center gap-1"><Icono n="schedule" size={18} />{duracion(c.duracion_min)}</span>
          {c.mentor && <span className="mr-2 flex items-center gap-1"><Icono n="person" size={18} />{c.mentor.nombre}</span>}
          <Chip tono="acento" icono="eco">Nivel de madurez: {ETIQUETA_NIVEL[c.nivel_madurez]}</Chip>
          <Chip tono="info" icono="signal_cellular_alt">Dificultad: {ETIQUETA_DIFICULTAD[c.dificultad]}</Chip>
        </div>
      </header>

      {aviso && <Aviso tono={aviso.tono} onCerrar={() => setAviso(null)}>{aviso.texto}</Aviso>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <div className="m-card overflow-hidden">
            {videoId && actual ? (
              <>
                <Reproductor key={actual.id} leccion={actual} videoId={videoId} inicio={actual.id === porDefecto?.id ? c.ultima_posicion_seg : 0} />
                <p className="px-5 py-3 text-sm"><span className="text-(--m-muted)">Reproduciendo: </span><strong>{actual.titulo}</strong></p>
              </>
            ) : (
              <div className="relative">
                <Miniatura curso={c} />
                <div className="absolute inset-0 grid place-items-center bg-black/55 p-6 text-center text-white">
                  <div className="flex flex-col items-center gap-3">
                    <Icono n={c.inscrito ? 'smart_display' : 'lock'} size={36} />
                    <p className="font-semibold">
                      {c.inscrito ? 'Esta mentoría no tiene videos disponibles por ahora.' : ins ? INSCRIPCION[ins.estado].texto : 'Inscríbete para ver las lecciones.'}
                    </p>
                    {puedeInscribirse && (
                      <button type="button" className="m-btn m-btn-primario" onClick={inscribir} disabled={ocupado === 'inscribir'}>
                        {c.grupos.length ? 'Inscribirme en el próximo grupo' : 'Inscribirme'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <Tarjeta titulo="Sobre esta mentoría" icono="info">
            <p className="whitespace-pre-line text-sm leading-relaxed">{c.descripcion}</p>
            {c.objetivos.length > 0 && (
              <>
                <h3 className="mt-5 mb-2 font-bold">Lo que lograrás</h3>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {c.objetivos.map((o, i) => (
                    <li key={i} className="flex gap-2 text-sm"><Icono n="check_circle" fill className="text-(--m-success)" />{o}</li>
                  ))}
                </ul>
              </>
            )}
          </Tarjeta>

          <Tarjeta titulo="Próximos pasos" icono="checklist" accion={c.inscrito && <span className="text-sm font-semibold text-(--m-muted)">{Math.round(progreso)}% completado</span>}>
            {c.inscrito && <BarraProgreso valor={progreso} etiqueta="Progreso de la mentoría" className="mb-5" />}
            {!c.modulos.length && <p className="text-sm text-(--m-muted)">Aún no hay lecciones publicadas.</p>}
            <ol className="space-y-5">
              {c.modulos.map((m) => (
                <li key={m.id}>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-(--m-muted)">Módulo {m.orden} · {m.titulo}</h3>
                  <ul className="mt-2 divide-y divide-(--m-border) rounded-xl border border-(--m-border)">
                    {m.lecciones.map((l) => {
                      const bloqueada = !!l.bloqueo;
                      const esVideo = l.tipo === 'video' && !!youtubeId(l.url_recurso);
                      const enCurso = !!videoId && actual?.id === l.id;
                      return (
                        <li key={l.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3', enCurso && 'bg-(--m-accent-soft)')}>
                          <Icono n={l.completado ? 'check_circle' : bloqueada ? 'lock' : LECCION[l.tipo].icono} fill={l.completado}
                            className={l.completado ? 'text-(--m-success)' : 'text-(--m-muted)'} />
                          <div className="min-w-0 flex-1">
                            {c.inscrito && !bloqueada && esVideo ? (
                              <button type="button" onClick={() => setLeccionId(l.id)} aria-current={enCurso || undefined} className="text-left text-sm font-semibold hover:text-(--m-accent-text)">{l.titulo}</button>
                            ) : !bloqueada && l.url_recurso ? (
                              <a href={l.url_recurso} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold hover:text-(--m-accent-text)">{l.titulo}</a>
                            ) : <span className="text-sm font-semibold">{l.titulo}</span>}
                            <p className="text-xs text-(--m-muted)">
                              {LECCION[l.tipo].nombre} · {duracion(l.duracion_min)}
                              {l.bloqueo && <span className="text-(--m-warning)"> · {l.bloqueo.motivo}</span>}
                            </p>
                          </div>
                          {c.inscrito && !bloqueada && (l.completado
                            ? <Chip tono="exito">Completada</Chip>
                            : <button type="button" className="m-btn m-btn-secundario text-xs" disabled={ocupado === l.id} onClick={() => marcar(l)}>
                              <Icono n="done" size={18} />Marcar como completada
                            </button>)}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ol>
          </Tarjeta>

          <Tarjeta titulo="Comentarios" icono="forum">
            <div className="flex items-center gap-3">
              <span className="text-3xl font-extrabold">{c.comentarios.promedio.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
              <div>
                <Estrellas valor={c.comentarios.promedio} />
                <p className="text-xs text-(--m-muted)">{c.comentarios.total} {c.comentarios.total === 1 ? 'opinión' : 'opiniones'}</p>
              </div>
            </div>
            {c.inscrito && <FormComentario cursoId={c.id} onCreado={comentado} />}
            {c.comentarios.items.length ? (
              <ul className="mt-4 divide-y divide-(--m-border)">
                {c.comentarios.items.map((k) => (
                  <li key={k.id} className="py-3">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-sm">{k.usuario_nombre}</strong>
                      <span className="text-xs text-(--m-muted)">{fecha(k.creado_en)}</span>
                    </div>
                    <Estrellas valor={k.estrellas} size={14} />
                    <p className="mt-1 text-sm">{k.texto}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-4 text-sm text-(--m-muted)">Aún no hay comentarios.</p>}
          </Tarjeta>
        </div>

        <div className="space-y-6">
          {c.certificado && (
            <Tarjeta titulo="Tu certificado" icono="workspace_premium" className="border-(--m-success)">
              <p className="text-sm">¡Completaste esta mentoría! Tu certificado se puede verificar con el código <strong className="font-mono">{c.certificado.codigo}</strong>.</p>
              <BotonCertificado certificado={c.certificado} className="mt-3 w-full" />
              <Link to={`/verificar/${encodeURIComponent(c.certificado.codigo)}`} target="_blank" className="mt-2 block text-center text-xs font-semibold text-(--m-accent-text) hover:underline">Ver verificación pública</Link>
            </Tarjeta>
          )}

          <Tarjeta id="grupos" titulo="Próximos grupos" icono="groups" className="scroll-mt-24">
            <div className="mb-4 flex items-center justify-between gap-2">
              <span className="text-2xl font-extrabold">{precio(c.precio)}</span>
              {ins && <Chip tono={INSCRIPCION[ins.estado].tono}>{INSCRIPCION[ins.estado].texto}</Chip>}
            </div>
            {ins && CANCELABLE.includes(ins.estado) && (
              <button type="button" className="-mt-2 mb-3 min-h-11 text-sm font-semibold text-(--m-danger) hover:underline disabled:opacity-50 sm:min-h-0"
                disabled={ocupado === 'cancelar'} onClick={cancelar}>
                {ocupado === 'cancelar' ? 'Cancelando…' : ins.estado === 'lista_espera' ? 'Salir de la lista de espera' : 'Cancelar inscripción'}
              </button>
            )}
            {puedeInscribirse && (
              <>
                <button type="button" className="m-btn m-btn-primario w-full" onClick={inscribir}
                  disabled={ocupado === 'inscribir' || (c.grupos.length > 0 && !proximoGrupo)}>
                  {ocupado === 'inscribir' ? 'Inscribiendo…' : c.grupos.length ? 'Inscribirme en el próximo grupo' : 'Inscribirme'}
                </button>
                {proximoGrupo?.estado === 'lleno' && <p className="mt-2 text-xs text-(--m-muted)">Los cupos están completos: quedarás en lista de espera.</p>}
                {c.grupos.length > 0 && !proximoGrupo && <p className="mt-2 text-xs text-(--m-muted)">No hay grupos con inscripciones abiertas.</p>}
              </>
            )}
            {c.grupos.length ? (
              <ul className="mt-4 space-y-3">
                {c.grupos.map((g) => (
                  <li key={g.id} className={cn('rounded-xl border p-3', g.id === proximoGrupo?.id ? 'border-(--m-accent)' : 'border-(--m-border)')}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold">{g.nombre}</p>
                      <Chip tono={ESTADO_GRUPO[g.estado].tono}>{ESTADO_GRUPO[g.estado].nombre}</Chip>
                    </div>
                    <p className="mt-0.5 text-xs text-(--m-muted)">{fecha(g.fecha_inicio)} al {fecha(g.fecha_fin)}{g.mentor && ` · ${g.mentor.nombre}`}</p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-(--m-muted)">
                      <BarraProgreso valor={pct(g.inscritos, g.cupos)} etiqueta={`Cupos ocupados en ${g.nombre}`} className="flex-1" />
                      {g.inscritos}/{g.cupos} cupos
                    </div>
                    {g.proxima_sesion && (
                      <p className="mt-2 flex items-center gap-1 text-xs"><Icono n="event" size={14} />Próxima sesión: {fechaHora(g.proxima_sesion.inicio)}</p>
                    )}
                    {ins?.grupo_id === g.id && g.proxima_sesion?.url_sala && (
                      <a href={g.proxima_sesion.url_sala} target="_blank" rel="noopener noreferrer" className="m-btn m-btn-secundario mt-2 w-full"><Icono n="videocam" />Entrar a la sala</a>
                    )}
                    {ins?.grupo_id === g.id && (ins.estado === 'activa' || ins.estado === 'completada') && g.proxima_sesion && (
                      <BotonIcs sesionId={g.proxima_sesion.id} texto="Agregar a mi calendario (.ics)" className="mt-2 w-full" />
                    )}
                  </li>
                ))}
              </ul>
            ) : <p className="mt-4 text-sm text-(--m-muted)">Esta mentoría se realiza a tu ritmo, sin grupo.</p>}
          </Tarjeta>

          <Tarjeta titulo="Recursos descargables" icono="download">
            {c.recursos.length ? (
              <ul className="space-y-2">
                {c.recursos.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 rounded-xl border border-(--m-border) p-3">
                    <Icono n={ICONO_ARCHIVO[r.tipo] ?? 'draft'} className="text-(--m-accent-text)" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{r.nombre}</p>
                      <p className="text-xs text-(--m-muted)">{r.tipo === 'otro' ? 'Archivo' : r.tipo.toUpperCase()} · {pesoArchivo(r.peso_kb)}</p>
                    </div>
                    <span title={c.inscrito ? undefined : 'Inscríbete para descargar'}>
                      <button type="button" className="m-btn m-btn-secundario px-3" aria-label={`Descargar ${r.nombre}`}
                        disabled={!c.inscrito || ocupado === r.id} onClick={() => descargar(r)}>
                        <Icono n={ocupado === r.id ? 'hourglass_top' : 'download'} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-(--m-muted)">Esta mentoría no tiene recursos descargables.</p>}
            {!c.inscrito && c.recursos.length > 0 && <p className="mt-3 text-xs text-(--m-muted)">Inscríbete para descargar los recursos.</p>}
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
