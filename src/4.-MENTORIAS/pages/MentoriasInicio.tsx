import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { mentoriasApi } from '../api';
import { BotonCertificado } from '../componentes/BotonDescarga';
import TarjetaCurso, { Miniatura, TarjetaCursoEsqueleto } from '../componentes/TarjetaCurso';
import { BarraProgreso, Chip, Esqueleto, Estado, EstadoError, Icono, Tarjeta, useCarga, Aviso } from '../componentes/ui';
import { ETIQUETA_NIVEL, type Acompanamiento, type CursoResumen, type Faceta, type NivelMadurez, type TipoRecurso } from '../tipos';
import { fecha, fechaHora, RECURSO, truncar } from '../util';

const FILTROS = ['categoria', 'nivel', 'formato', 'q'] as const;
type Filtros = Record<(typeof FILTROS)[number], string>;
const NIVELES: NivelMadurez[] = ['semilla', 'crecimiento', 'escala'];
const FORMATOS: TipoRecurso[] = ['video', 'audio', 'pdf'];
const ICONO_ACTIVIDAD: Record<Acompanamiento['actividad'][number]['tipo'], string> = {
  progreso: 'trending_up', inscripcion: 'how_to_reg', certificado: 'workspace_premium', comentario: 'chat',
};
const total = (lista: Faceta[] | undefined, valor: string) => lista?.find((f) => f.valor === valor)?.total ?? 0;

export default function MentoriasInicio() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filtros = useMemo(() => Object.fromEntries(FILTROS.map((k) => [k, params.get(k) ?? ''])) as Filtros, [params]);
  const clave = FILTROS.map((k) => filtros[k]).join('|');
  const hayFiltros = clave !== '|||';
  const [verFiltros, setVerFiltros] = useState(false);

  const catalogo = useCarga(() => mentoriasApi.catalogo({ ...filtros, pagina: 1 }), [clave]);
  const acomp = useCarga(() => mentoriasApi.acompanamiento());
  const certificados = useCarga(() => mentoriasApi.misCertificados());

  // Páginas siguientes («Cargar más»): se acumulan y se descartan al cambiar los filtros.
  const [extra, setExtra] = useState<{ items: CursoResumen[]; pagina: number; cargando: boolean; error: string }>({ items: [], pagina: 1, cargando: false, error: '' });
  const claveActual = useRef(clave);
  useEffect(() => { claveActual.current = clave; setExtra({ items: [], pagina: 1, cargando: false, error: '' }); }, [clave]);

  const cursos = useMemo(() => [...(catalogo.datos?.data ?? []), ...extra.items], [catalogo.datos, extra.items]);
  const totalCursos = catalogo.datos?.total ?? 0;
  const facetas = catalogo.datos?.facetas;

  const cargarMas = async () => {
    const pedida = clave, pagina = extra.pagina + 1;
    setExtra((e: typeof extra) => ({ ...e, cargando: true, error: '' }));
    try {
      const r = await mentoriasApi.catalogo({ ...filtros, pagina });
      if (claveActual.current === pedida) setExtra((e: typeof extra) => ({ items: [...e.items, ...r.data], pagina, cargando: false, error: '' }));
    } catch (e) {
      setExtra((x: typeof extra) => ({ ...x, cargando: false, error: (e as Error).message }));
    }
  };

  const setFiltro = (k: keyof Filtros, v: string) => {
    const p = new URLSearchParams(params);
    if (p.get(k) === v) p.delete(k); else p.set(k, v);
    setParams(p, { replace: true });
  };

  const a = acomp.datos;
  const reco = a?.erp_conectado ? a.recomendacion : null;
  const verGrupos = () => {
    const id = a?.proxima_sesion?.curso_id ?? reco?.id;
    if (id) navigate(`/mentorias/curso/${id}#grupos`);
    else document.getElementById('resultados')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="mx-auto grid max-w-[1600px] gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[15rem_minmax(0,1fr)_18rem]">
      {/* ── Filtros ── */}
      <aside aria-label="Filtros" className={cn('lg:col-span-2 xl:col-span-1', !verFiltros && 'hidden xl:block')}>
        <Tarjeta titulo="Explorar" icono="tune" className="xl:sticky xl:top-20"
          accion={hayFiltros && <button type="button" onClick={() => setParams(new URLSearchParams(), { replace: true })} className="min-h-11 px-2 text-sm font-semibold text-(--m-accent-text) hover:underline sm:min-h-0">Limpiar</button>}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-(--m-muted)">Categorías</h3>
          <ul className="mb-5 space-y-1">
            {!facetas && [1, 2, 3, 4].map((i) => <li key={i}><Esqueleto className="h-8" /></li>)}
            {facetas?.categorias.map((c) => (
              <li key={c.valor}>
                <button type="button" aria-pressed={filtros.categoria === c.valor} onClick={() => setFiltro('categoria', c.valor)}
                  className={cn('flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm sm:min-h-9',
                    filtros.categoria === c.valor ? 'bg-(--m-accent-soft) font-bold text-(--m-accent-text)' : 'hover:bg-(--m-subtle)')}>
                  <span className="truncate">{c.nombre}</span><span className="text-xs text-(--m-muted)">{c.total}</span>
                </button>
              </li>
            ))}
            {facetas && !facetas.categorias.length && <li className="text-sm text-(--m-muted)">Sin categorías para mostrar.</li>}
          </ul>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-(--m-muted)">Nivel de madurez</h3>
          <div className="mb-5 flex flex-wrap gap-2">
            {NIVELES.map((n) => (
              <Chip key={n} onClick={() => setFiltro('nivel', n)} activo={filtros.nivel === n}>
                {ETIQUETA_NIVEL[n]} <span className="opacity-70">{total(facetas?.niveles, n)}</span>
              </Chip>
            ))}
          </div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-(--m-muted)">Formato</h3>
          <div className="flex flex-wrap gap-2">
            {FORMATOS.map((f) => (
              <Chip key={f} icono={RECURSO[f].icono} onClick={() => setFiltro('formato', f)} activo={filtros.formato === f}>
                {RECURSO[f].nombre} <span className="opacity-70">{total(facetas?.formatos, f)}</span>
              </Chip>
            ))}
          </div>
        </Tarjeta>
      </aside>

      {/* ── Contenido ── */}
      <section className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Mentorías</h1>
            <p className="text-sm text-(--m-muted)">Aprende con mentores de tu comunidad y del ecosistema PymEdu.</p>
          </div>
          <button type="button" className="m-btn m-btn-secundario xl:hidden" aria-expanded={verFiltros} onClick={() => setVerFiltros((v: boolean) => !v)}>
            <Icono n="tune" />{verFiltros ? 'Ocultar filtros' : 'Filtros'}
          </button>
        </div>

        {reco && (
          <Link to={`/mentorias/curso/${reco.id}`} className="m-card grid overflow-hidden bg-(--m-navy) text-white transition hover:shadow-lg sm:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="space-y-3 p-6">
              <Chip tono="acento" icono="insights">Recomendado con los datos de tu ERP</Chip>
              <h2 className="line-clamp-2 text-xl font-extrabold leading-tight" title={reco.titulo}>{truncar(reco.titulo, 60)}</h2>
              <p className="text-sm text-white/80">{reco.motivo}</p>
              <span className="m-btn m-btn-primario">Ver mentoría<Icono n="arrow_forward" size={18} /></span>
            </div>
            <Miniatura curso={reco} className="hidden h-full sm:block" />
          </Link>
        )}

        <div id="resultados" className="scroll-mt-24">
          <h2 className="mb-3 text-lg font-bold">
            {filtros.q ? `Resultados para «${filtros.q}»` : hayFiltros ? 'Resultados' : 'Mentorías destacadas'}
            {catalogo.datos && hayFiltros && <span className="ml-2 text-sm font-medium text-(--m-muted)">({totalCursos})</span>}
          </h2>
          {catalogo.error && !catalogo.datos ? <EstadoError error={catalogo.error} onReintentar={catalogo.recargar} />
            : catalogo.datos && !cursos.length ? (
              <Estado icono="search_off" titulo="No encontramos mentorías"
                texto={hayFiltros ? 'Prueba con otros filtros o una búsqueda más amplia.' : 'Aún no hay mentorías disponibles para tu comunidad.'}
                accion={hayFiltros && <button type="button" className="m-btn m-btn-secundario" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Limpiar filtros</button>} />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4" aria-busy={catalogo.cargando}>
                {catalogo.datos ? cursos.map((c) => <TarjetaCurso key={c.id} curso={c} />) : [1, 2, 3, 4, 5, 6].map((i) => <TarjetaCursoEsqueleto key={i} />)}
              </div>
            )}
          {extra.error && <div className="mt-4"><Aviso tono="peligro">{extra.error}</Aviso></div>}
          {catalogo.datos && cursos.length < totalCursos && (
            <div className="mt-6 flex flex-col items-center gap-2">
              <button type="button" className="m-btn m-btn-secundario min-w-48" onClick={cargarMas} disabled={extra.cargando}>
                {extra.cargando ? 'Cargando…' : 'Cargar más'}
              </button>
              <p className="text-xs text-(--m-muted)">Mostrando {cursos.length} de {totalCursos}</p>
            </div>
          )}
        </div>
      </section>

      {/* ── Tu acompañamiento ── */}
      <aside aria-labelledby="m-acomp" className="space-y-4">
        <h2 id="m-acomp" className="text-lg font-bold">Tu acompañamiento</h2>
        {acomp.error && !a ? (
          <Aviso tono="peligro">No pudimos cargar tu acompañamiento. <button type="button" className="font-bold underline" onClick={acomp.recargar}>Reintentar</button></Aviso>
        ) : !a ? (
          <><Esqueleto className="h-32" /><Esqueleto className="h-40" /><Esqueleto className="h-32" /></>
        ) : (
          <>
            <Tarjeta titulo="Próxima sesión" icono="event">
              {a.proxima_sesion ? (
                <div className="space-y-1">
                  <Link to={`/mentorias/curso/${a.proxima_sesion.curso_id}`} className="font-semibold hover:text-(--m-accent-text)">{a.proxima_sesion.curso_titulo}</Link>
                  <p className="text-sm text-(--m-muted)">{fechaHora(a.proxima_sesion.inicio)}{a.proxima_sesion.mentor_nombre && ` · ${a.proxima_sesion.mentor_nombre}`}</p>
                  {a.proxima_sesion.url_sala && (
                    <a href={a.proxima_sesion.url_sala} target="_blank" rel="noopener noreferrer" className="m-btn m-btn-secundario mt-3 w-full"><Icono n="videocam" />Entrar a la sala</a>
                  )}
                </div>
              ) : <p className="text-sm text-(--m-muted)">No tienes sesiones agendadas.</p>}
            </Tarjeta>

            <Tarjeta titulo="Progreso de ruta" icono="route">
              <div className="mb-2 flex items-baseline justify-between text-sm">
                <span>Nivel <strong>{ETIQUETA_NIVEL[a.ruta.nivel]}</strong></span>
                <span className="text-lg font-extrabold">{Math.round(a.ruta.progreso_pct)}%</span>
              </div>
              <BarraProgreso valor={a.ruta.progreso_pct} etiqueta="Progreso de tu ruta" />
              <ol className="mt-3 flex justify-between text-[11px] font-semibold text-(--m-muted)">
                {NIVELES.map((n) => <li key={n} className={cn(n === a.ruta.nivel && 'text-(--m-accent-text)')}>{ETIQUETA_NIVEL[n]}</li>)}
              </ol>
              <p className="mt-2 text-xs text-(--m-muted)">{a.ruta.cursos_completados} de {a.ruta.cursos_totales} cursos completados</p>
              <button type="button" className="m-btn m-btn-primario mt-4 w-full" onClick={verGrupos}><Icono n="groups" />Ver próximos grupos</button>
            </Tarjeta>

            {!!certificados.datos?.length && (
              <Tarjeta titulo="Mis certificados" icono="workspace_premium">
                <ul className="space-y-4">
                  {certificados.datos.map((ce) => (
                    <li key={ce.codigo}>
                      <Link to={`/mentorias/curso/${ce.curso_id}`} className="text-sm font-semibold hover:text-(--m-accent-text)">{ce.curso}</Link>
                      <p className="text-xs text-(--m-muted)">Emitido el {fecha(ce.emitido_en)} · <span className="font-mono">{ce.codigo}</span></p>
                      <BotonCertificado certificado={ce} className="mt-2 w-full" />
                    </li>
                  ))}
                </ul>
              </Tarjeta>
            )}

            <Tarjeta titulo="Actividad reciente" icono="history">
              {a.actividad.length ? (
                <ul className="space-y-3">
                  {a.actividad.slice(0, 5).map((x, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-(--m-accent-soft) text-(--m-accent-text)"><Icono n={ICONO_ACTIVIDAD[x.tipo] ?? 'bolt'} size={16} /></span>
                      <span><span className="block">{x.texto}</span><span className="text-xs text-(--m-muted)">{fecha(x.fecha)}</span></span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-(--m-muted)">Aún no registras actividad.</p>}
            </Tarjeta>
          </>
        )}

        <section className="m-card bg-(--m-accent-soft) p-5">
          <h2 className="flex items-center gap-2 font-bold"><Icono n="support_agent" className="text-(--m-accent-text)" />¿Necesitas ayuda?</h2>
          <p className="mt-1 text-sm text-(--m-muted)">Escríbenos y te orientamos para elegir tu próxima mentoría.</p>
          <a href="mailto:soporte@pymedu.cl" className="m-btn m-btn-secundario mt-3 w-full"><Icono n="mail" />soporte@pymedu.cl</a>
        </section>
      </aside>
    </div>
  );
}
