// Mis grupos: sesión de hoy, sesiones (.ics), asistencia por sesión y avance de cada participante.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { mentoriasApi } from '../api';
import { BotonIcs } from '../componentes/BotonDescarga';
import { Aviso, BarraProgreso, Chip, Esqueleto, Estado, EstadoError, Icono, Tarjeta, useCarga } from '../componentes/ui';
import type { EstadoInscripcion, GrupoDetalle, Sesion } from '../tipos';
import { diaChile, ESTADO_GRUPO, fecha, fechaHora, hora, mensajeError, type Tono } from '../util';

const MARGEN_LISTA_MS = 30 * 60_000; // igual que el backend: se pasa lista desde 30 min antes
const abierta = (s: Sesion) => Date.parse(s.inicio) - MARGEN_LISTA_MS <= Date.now();
const enCurso = (s: Sesion) => Date.parse(s.inicio) <= Date.now() && Date.now() < Date.parse(s.fin);
const ESTADO_PARTICIPANTE: Partial<Record<EstadoInscripcion, { texto: string; tono: Tono }>> = {
  pendiente_pago: { texto: 'Pago pendiente', tono: 'aviso' }, completada: { texto: 'Completó', tono: 'exito' },
};

function Asistencia({ grupo, sesion, onGuardado }: { grupo: GrupoDetalle; sesion: Sesion; onGuardado: () => void; key?: string }) {
  const largo = Math.round((Date.parse(sesion.fin) - Date.parse(sesion.inicio)) / 60_000);
  type Marcas = Record<string, { asistio: boolean; minutos: string }>;
  const [marcas, setMarcas] = useState(() => Object.fromEntries(grupo.participantes.map((p) => {
    const r = grupo.asistencia.find((a) => a.sesion_id === sesion.id && a.usuario_id === p.usuario_id);
    return [p.usuario_id, { asistio: !!r?.asistio, minutos: r?.asistio ? String(r.minutos) : '' }];
  }))) as [Marcas, (f: (m: Marcas) => Marcas) => void];
  const [estado, setEstado] = useState<{ tono: Tono; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const habilitada = abierta(sesion);
  const registrada = grupo.asistencia.some((a) => a.sesion_id === sesion.id);
  const presentes = Object.values(marcas).filter((m) => m.asistio).length;
  const marcar = (id: string, asistio: boolean) =>
    setMarcas((m: Marcas) => ({ ...m, [id]: { asistio, minutos: asistio ? m[id].minutos || String(largo) : '' } }));

  const guardar = async () => {
    setGuardando(true);
    setEstado(null);
    try {
      await mentoriasApi.guardarAsistencia(sesion.id, Object.entries(marcas).map(([usuario_id, m]) => ({ usuario_id, asistio: m.asistio, minutos: Number(m.minutos) || 0 })));
      setEstado({ tono: 'exito', texto: `Guardamos la asistencia: ${presentes} de ${grupo.participantes.length} presentes.` });
      onGuardado();
    } catch (e) {
      setEstado({ tono: 'peligro', texto: mensajeError(e) });
    } finally {
      setGuardando(false);
    }
  };

  if (!grupo.participantes.length) return <p className="text-sm text-(--m-muted)">Aún no hay personas inscritas en este grupo.</p>;
  return (
    <div className="space-y-3">
      {!habilitada && <Aviso tono="info">Podrás pasar lista desde 30 minutos antes del inicio ({fechaHora(sesion.inicio)}).</Aviso>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] text-sm">
          <thead>
            <tr className="border-b border-(--m-border) text-left text-xs uppercase tracking-wide text-(--m-muted)">
              <th scope="col" className="py-2 pr-3 font-semibold">Participante</th>
              <th scope="col" className="px-3 py-2 text-center font-semibold">Asistió</th>
              <th scope="col" className="py-2 pl-3 text-right font-semibold">Minutos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-(--m-border)">
            {grupo.participantes.map((p) => {
              const m = marcas[p.usuario_id];
              return (
                <tr key={p.usuario_id}>
                  <th scope="row" className="py-2 pr-3 text-left font-semibold">{p.nombre}</th>
                  <td className="px-3 py-1 text-center">
                    <input type="checkbox" className="size-5 accent-(--m-accent)" aria-label={`${p.nombre} asistió`} checked={m.asistio} disabled={!habilitada}
                      onChange={(e: { target: HTMLInputElement }) => marcar(p.usuario_id, e.target.checked)} />
                  </td>
                  <td className="py-1 pl-3 text-right">
                    <input type="number" min={0} max={largo} className="m-input ml-auto w-24 text-right" aria-label={`Minutos de ${p.nombre}`} value={m.minutos}
                      disabled={!habilitada || !m.asistio} onChange={(e: { target: HTMLInputElement }) => setMarcas((x: Marcas) => ({ ...x, [p.usuario_id]: { ...x[p.usuario_id], minutos: e.target.value } }))} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-(--m-muted)">{presentes} de {grupo.participantes.length} presentes{!registrada && ' · Aún sin registrar'}</span>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="m-btn m-btn-secundario" disabled={!habilitada} onClick={() => grupo.participantes.forEach((p) => marcar(p.usuario_id, true))}>Marcar a todos</button>
          <button type="button" className="m-btn m-btn-primario" disabled={!habilitada || guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar asistencia'}</button>
        </div>
      </div>
      {estado && <Aviso tono={estado.tono} onCerrar={() => setEstado(null)}>{estado.texto}</Aviso>}
    </div>
  );
}

function DetalleGrupo({ id }: { id: string; key?: string }) {
  const { datos: g, error, recargar } = useCarga(() => mentoriasApi.grupo(id), [id]);
  const [elegida, setElegida] = useState<string | null>(null);

  if (!g) return error ? <EstadoError error={error} onReintentar={recargar} /> : <div className="space-y-4" aria-busy="true"><Esqueleto className="h-32" /><Esqueleto className="h-64" /></div>;

  const hoy = diaChile();
  const deHoy = g.sesiones.find((s) => diaChile(s.inicio) === hoy) ?? null;
  const destacada = deHoy ?? g.proxima_sesion;
  // Para pasar lista: la elegida; si no, la de hoy o la última que ya empezó.
  const lista = g.sesiones.find((s) => s.id === elegida) ?? deHoy ?? [...g.sesiones].reverse().find(abierta) ?? g.sesiones[0] ?? null;
  const realizadas = g.sesiones.filter((s) => Date.parse(s.inicio) <= Date.now()).length;

  return (
    <div className="min-w-0 space-y-5">
      <header className="m-card p-5">
        <div className="flex flex-wrap gap-2">
          <Chip tono={ESTADO_GRUPO[g.estado].tono}>{ESTADO_GRUPO[g.estado].nombre}</Chip>
          {g.soy_mentor ? <Chip tono="acento" icono="person">Eres mentor de este grupo</Chip> : g.mentor && <Chip icono="person">{g.mentor.nombre}</Chip>}
        </div>
        <h2 className="mt-2 text-xl font-extrabold tracking-tight">{g.nombre}</h2>
        <Link to={`/mentorias/curso/${g.curso.id}`} className="text-sm font-semibold text-(--m-accent-text) hover:underline">{g.curso.titulo}</Link>
        <p className="mt-1 text-xs text-(--m-muted)">{fecha(g.fecha_inicio)} al {fecha(g.fecha_fin)} · {g.inscritos}/{g.cupos} cupos{g.en_espera > 0 && ` · ${g.en_espera} en lista de espera`}</p>
      </header>

      <Tarjeta titulo={deHoy ? 'Sesión de hoy' : 'Próxima sesión'} icono="event">
        {destacada ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{fechaHora(destacada.inicio)}–{hora(destacada.fin)}</p>
              <p className="text-xs text-(--m-muted)">Hora de Chile{enCurso(destacada) && ' · En curso ahora'}</p>
            </div>
            {destacada.url_sala && (
              <a href={destacada.url_sala} target="_blank" rel="noopener noreferrer" className="m-btn m-btn-primario"><Icono n="videocam" />Entrar a la sala</a>
            )}
            <BotonIcs sesionId={destacada.id} />
          </div>
        ) : <p className="text-sm text-(--m-muted)">No hay sesiones próximas en este grupo.</p>}
      </Tarjeta>

      <Tarjeta titulo="Sesiones" icono="calendar_month">
        {g.sesiones.length ? (
          <ul className="divide-y divide-(--m-border)">
            {g.sesiones.map((s, i) => {
              const pasada = Date.parse(s.fin) < Date.now();
              return (
                <li key={s.id} className={cn('flex flex-wrap items-center gap-2 py-2', s.id === lista?.id && 'rounded-lg bg-(--m-accent-soft) px-2')}>
                  <span className="min-w-0 flex-1 text-sm">
                    <strong>Sesión {i + 1}</strong> · {fechaHora(s.inicio)}–{hora(s.fin)}
                    {s.id === deHoy?.id ? <Chip tono="acento" className="ml-2">Hoy</Chip> : pasada && <Chip className="ml-2">Realizada</Chip>}
                    {s.url_grabacion && <a href={s.url_grabacion} target="_blank" rel="noopener noreferrer" className="ml-2 text-(--m-accent-text) hover:underline">Grabación</a>}
                  </span>
                  <button type="button" className="m-btn m-btn-secundario" aria-pressed={s.id === lista?.id} onClick={() => setElegida(s.id)}><Icono n="how_to_reg" />Asistencia</button>
                  <BotonIcs sesionId={s.id} texto=".ics" />
                </li>
              );
            })}
          </ul>
        ) : <p className="text-sm text-(--m-muted)">El grupo aún no tiene sesiones agendadas.</p>}
      </Tarjeta>

      {lista && (
        <Tarjeta titulo={`Asistencia · Sesión ${g.sesiones.indexOf(lista) + 1}`} icono="how_to_reg"
          accion={<span className="text-xs text-(--m-muted)">{fechaHora(lista.inicio)}</span>}>
          <Asistencia key={lista.id} grupo={g} sesion={lista} onGuardado={recargar} />
        </Tarjeta>
      )}

      <Tarjeta titulo={`Participantes (${g.participantes.length})`} icono="group">
        {g.participantes.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="border-b border-(--m-border) text-left text-xs uppercase tracking-wide text-(--m-muted)">
                  <th scope="col" className="py-2 pr-3 font-semibold">Participante</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Avance del curso</th>
                  <th scope="col" className="py-2 pl-3 text-right font-semibold">Asistencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--m-border)">
                {g.participantes.map((p) => (
                  <tr key={p.usuario_id}>
                    <th scope="row" className="py-2.5 pr-3 text-left font-semibold">
                      {p.nombre}
                      {ESTADO_PARTICIPANTE[p.estado] && <Chip tono={ESTADO_PARTICIPANTE[p.estado]!.tono} className="ml-2">{ESTADO_PARTICIPANTE[p.estado]!.texto}</Chip>}
                    </th>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <BarraProgreso valor={p.progreso_pct} etiqueta={`Avance de ${p.nombre}`} className="w-28" />
                        <span className="tabular-nums text-xs text-(--m-muted)">{p.progreso_pct}%</span>
                      </div>
                    </td>
                    <td className="py-2.5 pl-3 text-right tabular-nums">{p.asistencias} de {realizadas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-(--m-muted)">Aún no hay personas inscritas.</p>}
      </Tarjeta>
    </div>
  );
}

export default function MentoriasGrupos() {
  const { datos, error, recargar } = useCarga(() => mentoriasApi.misGrupos());
  const [elegido, setElegido] = useState<string | null>(null);
  const grupos = datos ?? [];
  const actual = grupos.find((g) => g.id === elegido)?.id ?? grupos[0]?.id ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">Mis grupos</h1>
        <p className="text-sm text-(--m-muted)">Sesiones, asistencia y avance de las personas de tus grupos.</p>
      </header>
      {!datos ? (error ? <EstadoError error={error} onReintentar={recargar} /> : (
        <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]" aria-busy="true"><Esqueleto className="h-48" /><Esqueleto className="h-80" /></div>
      )) : !grupos.length ? (
        <Estado icono="groups" titulo="Aún no tienes grupos" texto="Cuando te asignen como mentor de un grupo, o tu organización cree grupos, aparecerán aquí." />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <nav aria-label="Grupos" className="lg:sticky lg:top-20">
            <ul className="space-y-2">
              {grupos.map((g) => (
                <li key={g.id}>
                  <button type="button" aria-current={g.id === actual || undefined} onClick={() => setElegido(g.id)}
                    className={cn('m-card w-full p-3 text-left transition hover:border-(--m-accent)', g.id === actual && 'border-(--m-accent) shadow-[inset_3px_0_0_var(--m-accent)]')}>
                    <span className="block truncate text-xs font-semibold text-(--m-muted)">{g.curso.titulo}</span>
                    <span className="block truncate font-bold">{g.nombre}</span>
                    <span className="mt-1 flex items-center gap-1 text-xs text-(--m-muted)">
                      <Icono n="event" size={14} />{g.proxima_sesion ? fechaHora(g.proxima_sesion.inicio) : 'Sin sesiones próximas'}
                    </span>
                    <span className="mt-0.5 block text-xs text-(--m-muted)">{g.inscritos}/{g.cupos} cupos{g.soy_mentor && ' · Eres mentor'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          {actual && <DetalleGrupo key={actual} id={actual} />}
        </div>
      )}
    </div>
  );
}
