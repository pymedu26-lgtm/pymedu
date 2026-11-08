import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { mentoriasApi } from '../api';
import { Aviso, Chip, Esqueleto, Estado, EstadoError, Icono, Panel, useCarga } from '../componentes/ui';
import { ETIQUETA_ESTADO_CURSO, ETIQUETA_FORMATO, type ChecklistRevision, type RevisionPendiente } from '../tipos';
import { ETIQUETA_VISIBILIDAD, fechaHora, precio, type Tono } from '../util';

/** Lista fija del Comité de contenido. */
const CHECKLIST: { clave: keyof ChecklistRevision; titulo: string; detalle: string }[] = [
  { clave: 'pertinencia', titulo: 'Pertinencia', detalle: 'El contenido es útil para emprendedores y pymes del ecosistema.' },
  { clave: 'calidad', titulo: 'Calidad', detalle: 'Video, audio y materiales se ven y escuchan bien; el contenido está completo.' },
  { clave: 'sin_info_enganosa', titulo: 'Sin información engañosa', detalle: 'No promete resultados garantizados ni contiene datos falsos.' },
  { clave: 'precio_declarado', titulo: 'Precio declarado', detalle: 'El precio es visible y coherente con lo que se entrega.' },
];
const SIN_MARCAR: ChecklistRevision = { pertinencia: false, calidad: false, sin_info_enganosa: false, precio_declarado: false };
const APROBADOR: Record<RevisionPendiente['aprobador'], { texto: string; tono: Tono }> = {
  comite: { texto: 'Comité de contenido', tono: 'info' },
  institucion: { texto: 'Admin institucional', tono: 'acento' },
  automatica: { texto: 'Aprobación automática', tono: 'neutro' },
};

function PanelRevision({ curso, onCerrar, onResuelto }: {
  key?: string; curso: RevisionPendiente; onCerrar: () => void; onResuelto: (texto: string) => void;
}) {
  const [checklist, setChecklist] = useState<ChecklistRevision>(SIN_MARCAR);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState<'aprobar' | 'rechazar' | null>(null);
  const [error, setError] = useState('');
  const completo = CHECKLIST.every((i) => checklist[i.clave]);

  const resolver = async (aprobado: boolean) => {
    setEnviando(aprobado ? 'aprobar' : 'rechazar');
    setError('');
    try {
      const r = await mentoriasApi.resolverRevision(curso.id, { aprobado, checklist, motivo: aprobado ? undefined : motivo.trim() });
      onResuelto(aprobado
        ? `«${curso.titulo}» fue aprobado (estado: ${ETIQUETA_ESTADO_CURSO[r.estado]}).`
        : `«${curso.titulo}» fue rechazado. Quien lo creó verá el motivo.`);
    } catch (e) {
      setError((e as Error).message);
      setEnviando(null);
    }
  };

  return (
    <Panel titulo="Revisar curso" onCerrar={onCerrar}
      pie={<>
        <button type="button" className="m-btn m-btn-peligro" disabled={!motivo.trim() || !!enviando} onClick={() => resolver(false)}>
          <Icono n="block" />{enviando === 'rechazar' ? 'Rechazando…' : 'Rechazar'}
        </button>
        <button type="button" className="m-btn m-btn-primario" disabled={!completo || !!enviando} onClick={() => resolver(true)}>
          <Icono n="verified" />{enviando === 'aprobar' ? 'Aprobando…' : 'Aprobar'}
        </button>
      </>}>
      <div className="space-y-5">
        <div>
          <h3 className="text-lg font-bold">{curso.titulo}</h3>
          <p className="text-sm text-(--m-muted)">{curso.organizacion.nombre} · {curso.categoria.nombre} · {ETIQUETA_FORMATO[curso.formato]}</p>
          <p className="text-sm text-(--m-muted)">{ETIQUETA_VISIBILIDAD[curso.visibilidad]} · {precio(curso.precio)} · Enviado el {fechaHora(curso.enviado_en)}</p>
          <Link to={`/mentorias/curso/${curso.id}`} target="_blank" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-(--m-accent-text) hover:underline">
            Ver contenido del curso<Icono n="open_in_new" size={16} />
          </Link>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-bold">Lista de chequeo</legend>
          {CHECKLIST.map((i) => (
            <label key={i.clave} className={cn('flex cursor-pointer gap-3 rounded-xl border p-3 transition',
              checklist[i.clave] ? 'border-(--m-success) bg-(--m-success-soft)' : 'border-(--m-border) hover:border-(--m-accent)')}>
              <input type="checkbox" className="mt-0.5 size-5 accent-(--m-accent)" checked={checklist[i.clave]}
                onChange={(e) => setChecklist((c: ChecklistRevision) => ({ ...c, [i.clave]: e.target.checked }))} />
              <span><span className="block text-sm font-semibold">{i.titulo}</span><span className="block text-xs text-(--m-muted)">{i.detalle}</span></span>
            </label>
          ))}
          {!completo && <p className="text-xs text-(--m-muted)">Para aprobar, marca los cuatro criterios.</p>}
        </fieldset>

        <label className="block space-y-1">
          <span className="block text-sm font-bold">Motivo del rechazo</span>
          <textarea className="m-input min-h-24" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={1000}
            placeholder="Explica qué debe corregir quien creó el curso." />
          <span className="block text-xs text-(--m-muted)">Obligatorio para rechazar.</span>
        </label>
        {error && <Aviso tono="peligro">{error}</Aviso>}
      </div>
    </Panel>
  );
}

export default function MentoriasRevision() {
  const { datos, setDatos, error, recargar } = useCarga(() => mentoriasApi.revisionesPendientes());
  const [abierto, setAbierto] = useState<RevisionPendiente | null>(null);
  const [aviso, setAviso] = useState('');

  if (!datos) return error ? <EstadoError error={error} onReintentar={recargar} /> : (
    <div className="mx-auto max-w-5xl space-y-3" aria-busy="true"><Esqueleto className="h-10 w-56" />{[1, 2, 3].map((i) => <Esqueleto key={i} className="h-24" />)}</div>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">Revisión de contenido</h1>
        <p className="text-sm text-(--m-muted)">Cursos enviados a revisión que esperan una decisión.</p>
      </header>
      {aviso && <Aviso tono="exito" onCerrar={() => setAviso('')}>{aviso}</Aviso>}

      {!datos.length ? (
        <Estado icono="task_alt" titulo="No hay cursos pendientes" texto="Cuando alguien envíe un curso a revisión aparecerá aquí." />
      ) : (
        <ul className="space-y-3">
          {datos.map((c) => (
            <li key={c.id} className="m-card flex flex-wrap items-center gap-4 p-4 sm:p-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-2">
                  <Chip tono={APROBADOR[c.aprobador].tono} icono="gavel">{APROBADOR[c.aprobador].texto}</Chip>
                  <Chip>{ETIQUETA_FORMATO[c.formato]}</Chip>
                  <Chip>{ETIQUETA_VISIBILIDAD[c.visibilidad]}</Chip>
                </div>
                <h2 className="mt-2 font-bold">{c.titulo}</h2>
                <p className="text-xs text-(--m-muted)">{c.organizacion.nombre} · {c.categoria.nombre} · {precio(c.precio)} · Enviado el {fechaHora(c.enviado_en)}</p>
              </div>
              <button type="button" className="m-btn m-btn-primario" onClick={() => setAbierto(c)}><Icono n="rate_review" />Revisar</button>
            </li>
          ))}
        </ul>
      )}

      {abierto && (
        <PanelRevision key={abierto.id} curso={abierto} onCerrar={() => setAbierto(null)}
          onResuelto={(texto) => {
            setDatos((d: RevisionPendiente[] | null) => d && d.filter((x) => x.id !== abierto.id));
            setAbierto(null);
            setAviso(texto);
          }} />
      )}
    </div>
  );
}
