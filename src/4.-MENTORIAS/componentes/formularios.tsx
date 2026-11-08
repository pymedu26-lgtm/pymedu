// Formularios de gestión: el del curso (Gestión y Editor) y uno genérico por campos (módulos, lecciones, grupos…).
import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import CampoMoneda from '../../components/CampoMoneda';
import { cn } from '../../lib/utils';
import { mentoriasApi, type Categoria } from '../api';
import {
  ETIQUETA_DIFICULTAD, ETIQUETA_FORMATO, ETIQUETA_NIVEL,
  type CursoEditor, type CursoEntrada, type CursoGestion, type Dificultad, type Formato, type NivelMadurez, type Visibilidad,
} from '../tipos';
import { desdeInputChile, ETIQUETA_VISIBILIDAD, mensajeError } from '../util';
import { Aviso, Esqueleto, Panel } from './ui';

/** Etiqueta envolvente: asocia el texto al primer campo interno sin necesidad de ids. */
export function Campo({ etiqueta, ayuda, children, className }: { etiqueta: string; ayuda?: string; children: ReactNode; className?: string; key?: string }) {
  return (
    <div className={cn('space-y-1', className)}>
      <label className="block space-y-1"><span className="block text-sm font-semibold">{etiqueta}</span>{children}</label>
      {ayuda && <p className="text-xs text-(--m-muted)">{ayuda}</p>}
    </div>
  );
}

const opciones = (mapa: Record<string, string>) =>
  Object.entries(mapa).map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>);

// ── Formulario genérico por campos ────────────────────────────────────────

export type Valores = Record<string, string | boolean>;
export interface CampoDef {
  k: string;
  etiqueta: string;
  tipo?: 'texto' | 'numero' | 'url' | 'fechahora' | 'fecha' | 'select' | 'check';
  opciones?: { valor: string; texto: string }[];
  /** Texto de la opción vacía de un select (sin él, el select no admite vacío). */
  vacio?: string;
  requerido?: boolean;
  ayuda?: string;
  /** Ocupa las dos columnas. */
  ancho?: boolean;
  placeholder?: string;
}

const TIPO_INPUT = { texto: 'text', numero: 'number', url: 'url', fechahora: 'datetime-local', fecha: 'date' } as Record<string, string>;

/** Formulario → cuerpo de la API: '' → null, números, fecha-hora de Chile → UTC. */
function aCuerpo(campos: CampoDef[], v: Valores): Record<string, unknown> {
  return Object.fromEntries(campos.map((c) => {
    if (c.tipo === 'check') return [c.k, !!v[c.k]];
    const s = String(v[c.k] ?? '').trim();
    return [c.k, !s ? null : c.tipo === 'numero' ? Number(s) : c.tipo === 'fechahora' ? desdeInputChile(s) : s];
  }));
}

export interface FormularioPanelProps {
  key?: string;
  titulo: string;
  campos: CampoDef[];
  inicial: Valores;
  /** Al editar solo se envían los campos modificados. */
  edicion?: boolean;
  /** Devuelve el mensaje de error, o null si se guardó (cierra el panel). */
  onGuardar: (cuerpo: Record<string, unknown>) => Promise<string | null>;
  onCerrar: () => void;
  /** Contenido adicional según los valores (p. ej. vista previa del video). */
  extra?: (v: Valores) => ReactNode;
  /** Ajusta valores al cambiar un campo (p. ej. término = inicio + 60 min). */
  derivar?: (v: Valores, campo: string) => Valores;
}

export function FormularioPanel({ titulo, campos, inicial, edicion, onGuardar, onCerrar, extra, derivar }: FormularioPanelProps) {
  const [v, setV] = useState<Valores>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const cambiar = (k: string, x: string | boolean) => setV((a: Valores) => (derivar ? derivar({ ...a, [k]: x }, k) : { ...a, [k]: x }));

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    let cuerpo = aCuerpo(campos, v);
    if (edicion) {
      const base = aCuerpo(campos, inicial);
      cuerpo = Object.fromEntries(Object.entries(cuerpo).filter(([k, x]) => JSON.stringify(x) !== JSON.stringify(base[k])));
      if (!Object.keys(cuerpo).length) { onCerrar(); return; }
    }
    setGuardando(true);
    setError('');
    const fallo = await onGuardar(cuerpo);
    if (!fallo) { onCerrar(); return; }
    setError(fallo);
    setGuardando(false);
  };

  return (
    <Panel titulo={titulo} onCerrar={onCerrar}
      pie={<>
        <button type="button" className="m-btn m-btn-secundario" onClick={onCerrar}>Cancelar</button>
        <button type="submit" form="m-form-panel" className="m-btn m-btn-primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </>}>
      <form id="m-form-panel" onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
        {campos.map((c) => c.tipo === 'check' ? (
          <label key={c.k} className="flex min-h-11 items-center gap-3 text-sm font-semibold sm:col-span-2">
            <input type="checkbox" className="size-5 accent-(--m-accent)" checked={!!v[c.k]} onChange={(e: ChangeEvent<HTMLInputElement>) => cambiar(c.k, e.target.checked)} />
            {c.etiqueta}
          </label>
        ) : (
          <Campo key={c.k} etiqueta={c.etiqueta} ayuda={c.ayuda} className={c.ancho ? 'sm:col-span-2' : undefined}>
            {c.tipo === 'select' ? (
              <select className="m-input" required={c.requerido} value={String(v[c.k] ?? '')} onChange={(e: ChangeEvent<HTMLSelectElement>) => cambiar(c.k, e.target.value)}>
                {c.vacio !== undefined && <option value="">{c.vacio}</option>}
                {c.opciones?.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
              </select>
            ) : (
              <input className="m-input" type={TIPO_INPUT[c.tipo ?? 'texto']} required={c.requerido} min={c.tipo === 'numero' ? 0 : undefined}
                placeholder={c.placeholder} value={String(v[c.k] ?? '')} onChange={(e: ChangeEvent<HTMLInputElement>) => cambiar(c.k, e.target.value)} />
            )}
          </Campo>
        ))}
        {extra && <div className="sm:col-span-2">{extra(v)}</div>}
        {error && <div className="sm:col-span-2"><Aviso tono="peligro">{error}</Aviso></div>}
      </form>
    </Panel>
  );
}

// ── Formulario del curso (datos generales) ────────────────────────────────

export interface FormCurso {
  titulo: string; descripcion: string; objetivos: string; formato: Formato; visibilidad: Visibilidad; categoria_slug: string;
  nivel_madurez: NivelMadurez; dificultad: Dificultad; precio: number; duracion_min: string; miniatura_url: string; comunidad_id: string;
}
export interface EdicionCurso { id?: string; inicial: FormCurso; cargando: boolean; parcial: boolean }

export const CURSO_VACIO: FormCurso = {
  titulo: '', descripcion: '', objetivos: '', formato: 'curso', visibilidad: 'publico', categoria_slug: '',
  nivel_madurez: 'semilla', dificultad: 'basico', precio: 0, duracion_min: '60', miniatura_url: '', comunidad_id: '',
};

export const formDesdeEditor = ({ curso: c }: CursoEditor): FormCurso => ({
  titulo: c.titulo, descripcion: c.descripcion, objetivos: c.objetivos.join('\n'), formato: c.formato, visibilidad: c.visibilidad,
  categoria_slug: c.categoria.slug, nivel_madurez: c.nivel_madurez, dificultad: c.dificultad, precio: c.precio,
  duracion_min: String(c.duracion_min), miniatura_url: c.miniatura_url ?? '', comunidad_id: c.comunidad_id ?? '',
});

const aEntrada = (f: FormCurso): CursoEntrada => ({
  titulo: f.titulo.trim(),
  descripcion: f.descripcion.trim(),
  objetivos: f.objetivos.split('\n').map((o) => o.trim()).filter(Boolean),
  formato: f.formato,
  visibilidad: f.visibilidad,
  categoria_slug: f.categoria_slug,
  nivel_madurez: f.nivel_madurez,
  dificultad: f.dificultad,
  precio: f.precio,
  duracion_min: Math.max(0, Math.round(Number(f.duracion_min) || 0)),
  miniatura_url: f.miniatura_url.trim() || null,
  comunidad_id: f.visibilidad === 'comunidad' ? f.comunidad_id || null : null,
});

export function FormularioCurso({ edicion, categorias, comunidades, onCerrar, onGuardado }: {
  key?: string; edicion: EdicionCurso; categorias: Categoria[]; comunidades: { id: string; nombre: string }[];
  onCerrar: () => void; onGuardado: (c: CursoGestion, nuevo: boolean) => void;
}) {
  const [form, setForm] = useState<FormCurso>(edicion.inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  // Al editar puede no conocerse la comunidad actual: solo se exige si cambia la visibilidad.
  const exigeComunidad = form.visibilidad === 'comunidad' && (!edicion.id || edicion.inicial.visibilidad !== 'comunidad');
  const set = (k: keyof FormCurso) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f: FormCurso) => ({ ...f, [k]: e.target.value }));

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (exigeComunidad && !form.comunidad_id) { setError('Elige la comunidad que podrá ver este curso.'); return; }
    setGuardando(true);
    setError('');
    try {
      const entrada = aEntrada(form);
      if (!edicion.id) {
        onGuardado(await mentoriasApi.crearCurso(entrada), true);
      } else {
        // Solo se envían los campos modificados (evita pisar datos que no se pudieron precargar).
        const base = aEntrada(edicion.inicial);
        const cambios = Object.fromEntries(Object.entries(entrada)
          .filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(base[k as keyof CursoEntrada]))) as Partial<CursoEntrada>;
        if (!Object.keys(cambios).length) { onCerrar(); return; }
        onGuardado(await mentoriasApi.editarCurso(edicion.id, cambios), false);
      }
    } catch (err) {
      setError(mensajeError(err));
      setGuardando(false);
    }
  };

  const deshabilitado = edicion.cargando || guardando;
  return (
    <Panel titulo={edicion.id ? 'Editar datos del curso' : 'Nuevo curso'} onCerrar={onCerrar}
      pie={<>
        <button type="button" className="m-btn m-btn-secundario" onClick={onCerrar}>Cancelar</button>
        <button type="submit" form="m-form-curso" className="m-btn m-btn-primario" disabled={deshabilitado}>
          {guardando ? 'Guardando…' : edicion.id ? 'Guardar cambios' : 'Crear borrador'}
        </button>
      </>}>
      {edicion.cargando ? (
        <div className="space-y-4" aria-busy="true">{[1, 2, 3, 4, 5].map((i) => <Esqueleto key={i} className="h-12" />)}</div>
      ) : (
        <form id="m-form-curso" onSubmit={guardar} className="space-y-4">
          {edicion.parcial && <Aviso tono="aviso">No pudimos cargar todos los datos del curso. Solo se guardarán los campos que modifiques.</Aviso>}
          <Campo etiqueta="Título">
            <input className="m-input" required maxLength={120} value={form.titulo} onChange={set('titulo')} />
          </Campo>
          <Campo etiqueta="Descripción" ayuda="Las primeras líneas se usan como resumen en el catálogo.">
            <textarea className="m-input min-h-28" required={!edicion.parcial} value={form.descripcion} onChange={set('descripcion')} />
          </Campo>
          <Campo etiqueta="Objetivos" ayuda="Uno por línea.">
            <textarea className="m-input min-h-24" value={form.objetivos} onChange={set('objetivos')} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Formato">
              <select className="m-input" value={form.formato} onChange={set('formato')}>{opciones(ETIQUETA_FORMATO)}</select>
            </Campo>
            <Campo etiqueta="Categoría">
              <select className="m-input" required value={form.categoria_slug} onChange={set('categoria_slug')}>
                <option value="">Selecciona…</option>
                {categorias.map((c) => <option key={c.slug} value={c.slug}>{c.nombre}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Nivel de madurez">
              <select className="m-input" value={form.nivel_madurez} onChange={set('nivel_madurez')}>{opciones(ETIQUETA_NIVEL)}</select>
            </Campo>
            <Campo etiqueta="Dificultad">
              <select className="m-input" value={form.dificultad} onChange={set('dificultad')}>{opciones(ETIQUETA_DIFICULTAD)}</select>
            </Campo>
            <Campo etiqueta="Visibilidad">
              <select className="m-input" value={form.visibilidad} onChange={set('visibilidad')}>{opciones(ETIQUETA_VISIBILIDAD)}</select>
            </Campo>
            {form.visibilidad === 'comunidad' && (
              <Campo etiqueta="Comunidad">
                <select className="m-input" required={exigeComunidad} value={form.comunidad_id} onChange={set('comunidad_id')}>
                  <option value="">{exigeComunidad ? 'Selecciona…' : 'Mantener la actual'}</option>
                  {comunidades.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </Campo>
            )}
            <Campo etiqueta="Precio (CLP)" ayuda="Deja $0 para que sea gratis.">
              <CampoMoneda valor={form.precio} paso={1000} onChange={(precio: number) => setForm((f: FormCurso) => ({ ...f, precio }))} className="m-input" />
            </Campo>
            <Campo etiqueta="Duración (minutos)">
              <input type="number" min={0} step={5} className="m-input" value={form.duracion_min} onChange={set('duracion_min')} />
            </Campo>
          </div>
          <Campo etiqueta="Miniatura (URL de imagen, opcional)">
            <input type="url" className="m-input" placeholder="https://…" value={form.miniatura_url} onChange={set('miniatura_url')} />
          </Campo>
          {error && <Aviso tono="peligro">{error}</Aviso>}
        </form>
      )}
    </Panel>
  );
}
