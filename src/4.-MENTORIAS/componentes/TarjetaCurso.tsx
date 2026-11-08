import { Link } from 'react-router-dom';
import { ETIQUETA_FORMATO, type CursoResumen, type Origen } from '../tipos';
import { duracion, precio, RECURSO, type Tono } from '../util';
import BadgeVivo from './BadgeVivo';
import { BarraProgreso, Chip, Esqueleto, Icono } from './ui';

const TONO_ORIGEN: Record<Origen['tipo'], Tono> = { comunidad: 'acento', publico: 'info', proveedor: 'neutro' };

/** Miniatura del curso o, si no hay, un degradado con el ícono del formato. */
export function Miniatura({ curso, className }: { curso: Pick<CursoResumen, 'miniatura_url' | 'tipo_recurso_principal'>; className?: string }) {
  return curso.miniatura_url
    ? <img src={curso.miniatura_url} alt="" loading="lazy" className={`aspect-video w-full object-cover ${className ?? ''}`} />
    : (
      <div className={`m-placeholder grid aspect-video w-full place-items-center text-white/90 ${className ?? ''}`}>
        <Icono n={RECURSO[curso.tipo_recurso_principal]?.icono ?? 'school'} size={44} />
      </div>
    );
}

export function OrigenTag({ origen }: { origen: Origen }) {
  return <Chip tono={TONO_ORIGEN[origen.tipo]} icono={origen.tipo === 'comunidad' ? 'groups' : origen.tipo === 'publico' ? 'public' : 'storefront'}>{origen.etiqueta}</Chip>;
}

export default function TarjetaCurso({ curso }: { curso: CursoResumen; key?: string }) {
  return (
    <Link to={`/mentorias/curso/${curso.id}`}
      className="m-card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-(--m-accent) hover:shadow-lg">
      <div className="relative">
        <Miniatura curso={curso} />
        <span className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <Chip className="bg-(--m-card)/95">{ETIQUETA_FORMATO[curso.formato]}</Chip>
          {curso.estado_vivo.tipo !== 'grabado' && <BadgeVivo estado={curso.estado_vivo} />}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <OrigenTag origen={curso.origen} />
        <h3 className="line-clamp-2 font-bold leading-snug group-hover:text-(--m-accent-text)">{curso.titulo}</h3>
        <p className="line-clamp-2 text-sm text-(--m-muted)">{curso.descripcion_corta}</p>
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs text-(--m-muted)">
          {curso.mentor && <span className="flex items-center gap-1"><Icono n="person" size={16} />{curso.mentor.nombre}</span>}
          <span className="flex items-center gap-1"><Icono n="schedule" size={16} />{duracion(curso.duracion_min)}</span>
          <span className="ml-auto text-sm font-bold text-(--m-text)">{precio(curso.precio)}</span>
        </div>
        {curso.inscrito && (
          <div className="flex items-center gap-2 text-xs font-semibold text-(--m-muted)">
            <BarraProgreso valor={curso.progreso_pct} etiqueta={`Progreso en ${curso.titulo}`} className="flex-1" />
            {Math.round(curso.progreso_pct)}%
          </div>
        )}
      </div>
    </Link>
  );
}

export const TarjetaCursoEsqueleto = () => (
  <div className="m-card overflow-hidden">
    <Esqueleto className="aspect-video rounded-none" />
    <div className="space-y-2 p-4"><Esqueleto className="h-4 w-1/3" /><Esqueleto className="h-5 w-4/5" /><Esqueleto className="h-4 w-full" /></div>
  </div>
);
