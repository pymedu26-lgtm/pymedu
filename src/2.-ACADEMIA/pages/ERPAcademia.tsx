import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import manifest from '../manifest.json';

// Corrección #22: títulos, resúmenes y duración reales de cada lección (extraídos del HTML a manifest.json).
// Terminología: módulo = Financiero / Legal; cada módulo tiene niveles y cada nivel, lecciones.

type ModuloId = 'Fin' | 'Legal';

interface Leccion {
  id: string;
  title: string;
  resumen: string;
  duracion: string;
  category: string;
  type: string;
  level: number;
  lesson: number;
}

interface Nivel { titulo: string; descripcion: string; icon: string }

const MODULOS: Record<ModuloId, { nombre: string; icon: string; niveles: Record<number, Nivel> }> = {
  Fin: {
    nombre: 'Financiero', icon: 'insights',
    niveles: {
      1: { titulo: 'Nivel 1: Primeros pasos', descripcion: 'Dinero, presupuesto, ahorro, tarjetas y seguridad: la base de tus finanzas.', icon: 'school' },
      2: { titulo: 'Nivel 2: Operar mejor', descripcion: 'Flujo de caja, costos, formalización, IVA y F29, financiamiento y precios.', icon: 'trending_up' },
      3: { titulo: 'Nivel 3: Decidir con datos', descripcion: 'Contabilidad, punto de equilibrio, evaluación de inversiones, KPIs y crecimiento.', icon: 'query_stats' },
    },
  },
  Legal: {
    nombre: 'Legal', icon: 'gavel',
    niveles: {
      1: { titulo: 'Nivel 1: Formaliza tu empresa', descripcion: 'Forma legal, constitución, patentes, permisos e identidad digital.', icon: 'account_balance' },
      2: { titulo: 'Nivel 2: Contratos y clientes', descripcion: 'Contratos, arriendo comercial, Ley del Consumidor, pago a 30 días y e-commerce.', icon: 'handshake' },
      3: { titulo: 'Nivel 3: Tu equipo de trabajo', descripcion: 'Contrato de trabajo, sueldo y cotizaciones, finiquito, honorarios y prevención.', icon: 'badge' },
      4: { titulo: 'Nivel 4: Protege tus activos', descripcion: 'Marca, datos personales, propiedad intelectual y confidencialidad.', icon: 'verified_user' },
      5: { titulo: 'Nivel 5: Deudas, conflictos y cierre', descripcion: 'Cobranza, insolvencia, conflictos entre socios y término de giro.', icon: 'gavel' },
    },
  },
};

const LECCIONES = [...manifest.gratis, ...manifest.suscripcion] as Leccion[];

const leccionesDe = (modulo: ModuloId) => LECCIONES.filter(c => c.type === modulo);
const nivelesDe = (modulo: ModuloId) => {
  const porNivel = new Map<number, Leccion[]>();
  leccionesDe(modulo).forEach(c => porNivel.set(c.level, [...(porNivel.get(c.level) ?? []), c]));
  return [...porNivel.entries()].sort(([a], [b]) => a - b);
};
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const LessonCard = ({ leccion, modulo }: { leccion: Leccion; modulo: ModuloId; key?: string }) => {
  const navigate = useNavigate();
  return (
    <article className="bg-surface-container-lowest rounded-[28px] shadow-sm border border-outline-variant/30 overflow-hidden group hover:shadow-lg hover:shadow-primary/5 transition-all flex flex-col">
      <div className="h-24 relative flex items-center justify-center bg-primary/5">
        <span className="material-symbols-outlined text-5xl text-primary opacity-70 group-hover:opacity-100 transition-opacity">{MODULOS[modulo].icon}</span>
        <span className="absolute right-4 top-4 rounded-full bg-surface-container-lowest/90 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-on-surface shadow-sm">
          {leccion.category === 'gratis' ? 'Acceso libre' : 'Premium'}
        </span>
      </div>
      <div className="p-6 flex flex-col flex-1">
        <div className="flex justify-between items-start mb-3">
          <span className="text-[10px] font-extrabold px-2 py-1 rounded-full uppercase tracking-wider bg-primary/10 text-primary">
            Lección {leccion.level}.{leccion.lesson}
          </span>
          {leccion.duracion && (
            <span className="text-xs font-bold text-outline flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">schedule</span> {leccion.duracion}
            </span>
          )}
        </div>
        <h3 className="font-black text-on-surface text-lg mb-2 leading-tight group-hover:text-primary transition-colors">{leccion.title}</h3>
        <p className="text-sm text-on-surface-variant mb-5 leading-6 flex-1 line-clamp-4">{leccion.resumen}</p>
        <button
          onClick={() => navigate(`/erp/academia/${leccion.category}/${leccion.id}`)}
          className="mt-auto self-end inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-black text-inverse-on-surface transition-colors hover:bg-primary/90"
        >
          Empezar
          <span className="material-symbols-outlined text-sm">arrow_forward</span>
        </button>
      </div>
    </article>
  );
};

export default function ERPAcademia() {
  const [modulo, setModulo] = useState<ModuloId>('Fin');
  const niveles = nivelesDe(modulo);

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6 pb-24 lg:p-8">
      <div className="rounded-[28px] border border-outline-variant/30 bg-surface-container-lowest p-2 shadow-sm">
        <div className="grid gap-2 md:grid-cols-2">
          {(Object.keys(MODULOS) as ModuloId[]).map(id => {
            const activo = modulo === id;
            return (
              <button key={id} onClick={() => setModulo(id)}
                className={cn('rounded-2xl px-5 py-4 text-left text-sm transition-all',
                  activo ? 'bg-primary text-inverse-on-surface shadow-lg shadow-primary/15' : 'bg-surface-container-low text-on-surface-variant hover:bg-primary/5 hover:text-primary')}>
                <span className="flex items-center gap-2 font-black">
                  <span className="material-symbols-outlined text-lg">{MODULOS[id].icon}</span>
                  Módulo {MODULOS[id].nombre}
                </span>
                <span className={cn('mt-1 block text-xs leading-5', activo ? 'text-white/70' : 'text-on-surface-variant')}>
                  {plural(leccionesDe(id).length, 'lección', 'lecciones')} en {plural(nivelesDe(id).length, 'nivel', 'niveles')}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div key={modulo} className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {niveles.map(([nivel, lecciones]) => {
          const info = MODULOS[modulo].niveles[nivel] ?? { titulo: `Nivel ${nivel}`, descripcion: '', icon: 'school' };
          return (
            <section key={nivel} className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <span className="material-symbols-outlined text-2xl">{info.icon}</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-on-surface">{info.titulo}</h3>
                    <p className="text-sm leading-6 text-on-surface-variant">{info.descripcion}</p>
                  </div>
                </div>
                <span className="w-fit rounded-full border border-outline-variant/40 bg-surface-container-lowest px-4 py-2 text-xs font-black uppercase tracking-wider text-on-surface-variant">
                  {plural(lecciones.length, 'lección', 'lecciones')}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {lecciones.map(l => <LessonCard key={l.id} leccion={l} modulo={modulo} />)}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
