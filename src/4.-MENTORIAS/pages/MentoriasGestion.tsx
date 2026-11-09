import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { mentoriasApi } from '../api';
import { CURSO_VACIO, FormularioCurso, type EdicionCurso, type FormCurso } from '../componentes/formularios';
import { Aviso, Chip, Esqueleto, Estado, EstadoError, Icono, useCarga } from '../componentes/ui';
import { ETIQUETA_ESTADO_CURSO, ETIQUETA_FORMATO, type CursoGestion, type EstadoCurso } from '../tipos';
import { ETIQUETA_VISIBILIDAD, fecha, mensajeError, numero, precio, TONO_ESTADO_CURSO, type Tono } from '../util';

const ESTADOS: EstadoCurso[] = ['borrador', 'en_revision', 'rechazado', 'publicado', 'archivado'];

export default function MentoriasGestion() {
  const { datos, setDatos, error, recargar } = useCarga(() => mentoriasApi.gestion());
  const categorias = useCarga(() => mentoriasApi.categorias());
  const [filtro, setFiltro] = useState<EstadoCurso | null>(null);
  const [edicion, setEdicion] = useState<EdicionCurso | null>(null);
  const [aviso, setAviso] = useState<{ tono: Tono; texto: string } | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);

  const cursos = datos?.data ?? [];
  const conteo = useMemo(() => cursos.reduce((acc, c) => ({ ...acc, [c.estado]: (acc[c.estado] ?? 0) + 1 }), {} as Partial<Record<EstadoCurso, number>>), [cursos]);
  const lista = useMemo(() => (filtro ? cursos.filter((c) => c.estado === filtro) : cursos), [cursos, filtro]);

  const reemplazar = (c: CursoGestion, nuevo = false) => setDatos((d: typeof datos) => d && {
    ...d, data: nuevo ? [c, ...d.data] : d.data.map((x) => (x.id === c.id ? c : x)),
  });

  const nuevo = () => setEdicion({
    inicial: { ...CURSO_VACIO, visibilidad: datos?.comunidades.length ? 'comunidad' : 'publico', comunidad_id: datos?.comunidades.length === 1 ? datos.comunidades[0].id : '' },
    cargando: false, parcial: false,
  });

  // Aplica la ficha cargada solo si el panel sigue abierto en ese mismo curso.
  const siSigue = (id: string, e: EdicionCurso) => setEdicion((actual: EdicionCurso | null) => (actual?.id === id ? e : actual));
  const editar = async (c: CursoGestion) => {
    // CursoGestion no trae todos los campos del formulario: se completan con la ficha del curso.
    const base: FormCurso = { ...CURSO_VACIO, titulo: c.titulo, formato: c.formato, visibilidad: c.visibilidad, categoria_slug: c.categoria.slug, precio: c.precio };
    setEdicion({ id: c.id, inicial: base, cargando: true, parcial: false });
    try {
      const d = await mentoriasApi.curso(c.id);
      siSigue(c.id, {
        id: c.id, cargando: false, parcial: false,
        inicial: { ...base, descripcion: d.descripcion, objetivos: d.objetivos.join('\n'), nivel_madurez: d.nivel_madurez, dificultad: d.dificultad, duracion_min: String(d.duracion_min), miniatura_url: d.miniatura_url ?? '' },
      });
    } catch {
      siSigue(c.id, { id: c.id, inicial: base, cargando: false, parcial: true });
    }
  };

  const enviarRevision = async (c: CursoGestion) => {
    setEnviando(c.id);
    try {
      reemplazar(await mentoriasApi.enviarRevision(c.id));
      setAviso({ tono: 'exito', texto: `Enviamos «${c.titulo}» a revisión. Te avisaremos cuando tenga respuesta.` });
    } catch (e) {
      setAviso({ tono: 'peligro', texto: mensajeError(e) });
    } finally {
      setEnviando(null);
    }
  };

  if (!datos) return error ? <EstadoError error={error} onReintentar={recargar} /> : (
    <div className="mx-auto max-w-5xl space-y-3" aria-busy="true"><Esqueleto className="h-10 w-48" />{[1, 2, 3].map((i) => <Esqueleto key={i} className="h-28" />)}</div>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Mis cursos</h1>
          <p className="text-sm text-(--m-muted)">Crea tus cursos, arma su contenido y sus grupos, y envíalos a revisión para publicarlos.</p>
        </div>
        {datos.puede_crear && <button type="button" className="m-btn m-btn-primario" onClick={nuevo}><Icono n="add" />Nuevo curso</button>}
      </header>

      {cursos.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
          <Chip onClick={() => setFiltro(null)} activo={!filtro}>Todos <span className="opacity-70">{cursos.length}</span></Chip>
          {ESTADOS.filter((e) => conteo[e]).map((e) => (
            <Chip key={e} onClick={() => setFiltro(filtro === e ? null : e)} activo={filtro === e}>
              {ETIQUETA_ESTADO_CURSO[e]} <span className="opacity-70">{conteo[e]}</span>
            </Chip>
          ))}
        </div>
      )}

      {aviso && <Aviso tono={aviso.tono} onCerrar={() => setAviso(null)}>{aviso.texto}</Aviso>}

      {!cursos.length ? (
        <Estado icono="edit_note" titulo="Aún no tienes cursos"
          texto={datos.puede_crear ? 'Crea tu primer curso: quedará como borrador hasta que lo envíes a revisión.' : 'Cuando tengas cursos asignados aparecerán aquí.'}
          accion={datos.puede_crear && <button type="button" className="m-btn m-btn-primario" onClick={nuevo}><Icono n="add" />Nuevo curso</button>} />
      ) : (
        <ul className="space-y-3">
          {lista.map((c) => (
            <li key={c.id} className="m-card p-4 sm:p-5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-2">
                    <Chip tono={TONO_ESTADO_CURSO[c.estado]}>{ETIQUETA_ESTADO_CURSO[c.estado]}</Chip>
                    <Chip>{ETIQUETA_FORMATO[c.formato]}</Chip>
                    <Chip icono={c.visibilidad === 'publico' ? 'public' : c.visibilidad === 'comunidad' ? 'groups' : 'lock'}>{ETIQUETA_VISIBILIDAD[c.visibilidad]}</Chip>
                  </div>
                  <h2 className="mt-2 font-bold">{c.titulo}</h2>
                  <p className="mt-0.5 text-xs text-(--m-muted)">
                    {c.categoria.nombre} · {c.organizacion.nombre} · {precio(c.precio)} · {numero(c.inscritos)} inscritos · Actualizado el {fecha(c.actualizado_en)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {c.estado === 'publicado' && <Link to={`/mentorias/curso/${c.id}`} className="m-btn m-btn-secundario"><Icono n="visibility" />Ver</Link>}
                  {c.estado !== 'archivado' && (
                    <Link to={`/mentorias/gestion/${c.id}`} className="m-btn m-btn-secundario"><Icono n="view_list" />Contenido y grupos</Link>
                  )}
                  {(c.estado === 'borrador' || c.estado === 'rechazado') && datos.puede_crear && (
                    <button type="button" className="m-btn m-btn-secundario" onClick={() => editar(c)}><Icono n="edit" />Editar datos</button>
                  )}
                  {(c.estado === 'borrador' || c.estado === 'rechazado') && (
                    <button type="button" className="m-btn m-btn-primario" disabled={enviando === c.id} onClick={() => enviarRevision(c)}>
                      <Icono n="send" />{enviando === c.id ? 'Enviando…' : 'Enviar a revisión'}
                    </button>
                  )}
                </div>
              </div>
              {c.estado === 'rechazado' && c.motivo_rechazo && (
                <div className="mt-3"><Aviso tono="peligro"><strong>Motivo del rechazo:</strong> {c.motivo_rechazo}</Aviso></div>
              )}
            </li>
          ))}
        </ul>
      )}

      {edicion && (
        <FormularioCurso key={`${edicion.id ?? 'nuevo'}-${edicion.cargando}`} edicion={edicion} categorias={categorias.datos ?? []} comunidades={datos.comunidades}
          onCerrar={() => setEdicion(null)}
          onGuardado={(c, esNuevo) => {
            reemplazar(c, esNuevo);
            setEdicion(null);
            setAviso({ tono: 'exito', texto: esNuevo ? `Creamos «${c.titulo}» como borrador. Ahora agrégale contenido desde «Contenido y grupos».` : `Guardamos los cambios de «${c.titulo}».` });
          }} />
      )}
    </div>
  );
}
