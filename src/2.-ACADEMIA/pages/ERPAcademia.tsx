import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import manifest from '../manifest.json';

type Course = {
  id: string;
  title: string;
  description: string;
  duration: string;
  level: string;
  progress: number;
  icon: string;
  color: 'primary' | 'secondary' | 'emerald' | 'amber' | 'indigo';
  outcome?: string;
  category: string;
  lesson?: number;
};

const mapManifestToCourses = (category: 'gratis' | 'suscripcion') => {
  return manifest[category].map(c => ({
    id: c.id,
    title: c.title,
    description: `Leccion ${c.level}.${c.lesson} del modulo ${c.type}.`,
    duration: '35 min',
    level: c.level === 1 ? 'Basico' : c.level === 2 ? 'Intermedio' : 'Avanzado',
    progress: 0,
    icon: c.type === 'Fin' ? 'monitoring' : 'gavel',
    color: c.type === 'Fin' ? 'primary' : 'indigo',
    category: c.category,
    type: c.type,
    lesson: c.lesson,
    levelNum: c.level
  }));
};

const allCourses = [...mapManifestToCourses('gratis'), ...mapManifestToCourses('suscripcion')];

const getCoursesByTab = (tab: 'comercial' | 'legal') => {
  const typeFilter = tab === 'comercial' ? 'Fin' : 'Legal';
  const filtered = allCourses.filter(c => c.type === typeFilter);

  return {
    basico: filtered.filter(c => c.levelNum === 1),
    intermedio: filtered.filter(c => c.levelNum === 2),
    avanzado: filtered.filter(c => c.levelNum >= 3),
  };
};

const CourseCard = ({ course }: { course: any; key?: string }) => {
  const navigate = useNavigate();
  const colorMap: Record<string, { bg: string, text: string, badgeBg: string, badgeText: string, progress: string }> = {
    primary: { bg: 'bg-primary/5', text: 'text-primary', badgeBg: 'bg-primary/10', badgeText: 'text-primary', progress: 'bg-primary' },
    secondary: { bg: 'bg-secondary/5', text: 'text-secondary', badgeBg: 'bg-secondary/10', badgeText: 'text-secondary', progress: 'bg-secondary' },
    emerald: { bg: 'bg-primary/5', text: 'text-primary', badgeBg: 'bg-primary/10', badgeText: 'text-primary', progress: 'bg-primary' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', badgeBg: 'bg-amber-100', badgeText: 'text-amber-700', progress: 'bg-amber-500' },
    indigo: { bg: 'bg-primary/5', text: 'text-primary', badgeBg: 'bg-primary/10', badgeText: 'text-primary', progress: 'bg-primary' },
  };

  const colors = colorMap[course.color] || colorMap.primary;

  return (
    <article className="bg-surface-container-lowest rounded-[28px] shadow-sm border border-outline-variant/30 overflow-hidden group hover:shadow-lg hover:shadow-primary/5 transition-all flex flex-col">
      <div className={cn("h-28 relative flex items-center justify-center transition-colors", colors.bg)}>
        <span className={cn("material-symbols-outlined text-5xl opacity-70 group-hover:opacity-100 transition-opacity", colors.text)}>
          {course.icon}
        </span>
        <span className="absolute right-4 top-4 rounded-full bg-white/85 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-primary shadow-sm">
          {course.category === 'gratis' ? 'Acceso Libre' : 'Premium'}
        </span>
      </div>
      <div className="p-6 flex flex-col flex-1">
        <div className="flex justify-between items-start mb-3">
          <span className={cn("text-[10px] font-extrabold px-2 py-1 rounded-full uppercase tracking-wider", colors.badgeBg, colors.badgeText)}>
            {course.level}
          </span>
          <span className="text-xs font-bold text-outline flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">schedule</span> {course.duration}
          </span>
        </div>
        <h3 className="font-black text-on-surface text-lg mb-2 leading-tight group-hover:text-primary transition-colors h-14 overflow-hidden">{course.title}</h3>
        <p className="text-sm text-on-surface-variant mb-4 leading-6 flex-1">{course.description}</p>

        <div className="mb-4 rounded-2xl border border-outline-variant/25 bg-surface-container-low px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-outline">Resultado practico</p>
          <p className="mt-1 text-sm font-bold text-on-surface">
            {course.outcome ?? 'Terminas con una accion clara para aplicar en tu negocio.'}
          </p>
        </div>

        <div className="mt-auto">
          <div className="w-full bg-surface-container-high rounded-full h-2 mb-3 overflow-hidden">
            <div className={cn("h-2 rounded-full", colors.progress)} style={{ width: `${course.progress}%` }}></div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-outline font-bold">{course.progress}% completado</p>
            <button
              onClick={() => navigate(`/erp/academia/${course.category}/${course.id}`)}
              className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-black text-white transition-colors hover:bg-primary/90"
            >
              Empezar
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};

const CourseSection = ({
  title,
  description,
  icon,
  courses,
  tone = 'primary',
}: {
  title: string;
  description: string;
  icon: string;
  courses: any[];
  tone?: 'primary' | 'secondary' | 'amber';
}) => {
  const toneClass = {
    primary: 'bg-primary/10 text-primary',
    secondary: 'bg-secondary/10 text-secondary',
    amber: 'bg-amber-100 text-amber-700',
  }[tone];

  if (courses.length === 0) return null;

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl', toneClass)}>
            <span className="material-symbols-outlined text-2xl">{icon}</span>
          </div>
          <div>
            <h3 className="text-xl font-black text-on-surface">{title}</h3>
            <p className="text-sm leading-6 text-on-surface-variant">{description}</p>
          </div>
        </div>
        <span className="w-fit rounded-full border border-outline-variant/40 bg-surface-container-lowest px-4 py-2 text-xs font-black uppercase tracking-wider text-on-surface-variant">
          {courses.length} modulos
        </span>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {courses.map(course => (
          <CourseCard key={course.id} course={course} />
        ))}
      </div>
    </section>
  );
};

export default function ERPAcademia() {
  const [activeTab, setActiveTab] = useState<'comercial' | 'legal'>('comercial');
  const courses = getCoursesByTab(activeTab);

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6 pb-24 lg:p-8">
      <div className="rounded-[28px] border border-outline-variant/30 bg-surface-container-lowest p-2 shadow-sm">
        <div className="grid gap-2 md:grid-cols-2">
        <button
          onClick={() => setActiveTab('comercial')}
          className={cn(
            "rounded-2xl px-5 py-4 text-left text-sm transition-all",
            activeTab === 'comercial'
              ? "bg-primary text-white shadow-lg shadow-primary/15"
              : "bg-surface-container-low text-on-surface-variant hover:bg-primary/5 hover:text-primary"
          )}
        >
          <span className="flex items-center gap-2 font-black">
            <span className="material-symbols-outlined text-lg">storefront</span>
            Crecimiento del negocio
          </span>
          <span className={cn("mt-1 block text-xs leading-5", activeTab === 'comercial' ? 'text-white/68' : 'text-on-surface-variant')}>
            Finanzas, clientes, inventario, marketing, precios y KPIs.
          </span>
        </button>
        <button
          onClick={() => setActiveTab('legal')}
          className={cn(
            "rounded-2xl px-5 py-4 text-left text-sm transition-all",
            activeTab === 'legal'
              ? "bg-primary text-white shadow-lg shadow-primary/15"
              : "bg-surface-container-low text-on-surface-variant hover:bg-primary/5 hover:text-primary"
          )}
        >
          <span className="flex items-center gap-2 font-black">
            <span className="material-symbols-outlined text-lg">assignment_turned_in</span>
            Cumplimiento y documentos
          </span>
          <span className={cn("mt-1 block text-xs leading-5", activeTab === 'legal' ? 'text-white/68' : 'text-on-surface-variant')}>
            SII, contratos, deudas, Sercotec, Mercado Publico y carpetas.
          </span>
        </button>
        </div>
      </div>

      {activeTab === 'comercial' && (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="rounded-[32px] border border-outline-variant/30 bg-surface-container-lowest p-6 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-primary">Ruta recomendada</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_0.9fr] lg:items-center">
              <div>
                <h3 className="text-2xl font-black text-on-surface">Primero orden, despues crecimiento.</h3>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-on-surface-variant">
                  Si no sabes por donde partir, esta vista te muestra una secuencia natural: entender numeros basicos, cuidar clientes, ordenar inventario y recien despues escalar marketing o precios.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {['Entender', 'Aplicar', 'Medir'].map((item, index) => (
                  <div key={item} className="rounded-2xl bg-primary/5 px-4 py-3">
                    <p className="text-xs font-black uppercase tracking-wider text-primary">Paso {index + 1}</p>
                    <p className="mt-1 text-sm font-black text-on-surface">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <CourseSection
            title="Nivel 1: Primeros pasos"
            description="Fundamentos para entender que esta pasando en el negocio sin lenguaje tecnico."
            icon="school"
            courses={courses.basico}
          />
          <CourseSection
            title="Nivel 2: Operar mejor"
            description="Herramientas para evitar perdidas, ordenar stock y atraer clientes con acciones simples."
            icon="trending_up"
            courses={courses.intermedio}
            tone="secondary"
          />
          <CourseSection
            title="Nivel 3: Decidir con datos"
            description="Precios, margenes y KPIs explicados para que el dueno sepa que cambiar y por que."
            icon="query_stats"
            courses={courses.avanzado}
          />
        </div>
      )}

      {activeTab === 'legal' && (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <section className="rounded-[32px] border border-outline-variant/30 command-gradient p-6 text-white shadow-xl shadow-primary/20">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-on-primary-container">Ruta documental y cumplimiento</p>
            <div className="mt-3 grid gap-5 lg:grid-cols-[1fr_0.9fr] lg:items-end">
              <div>
                <h3 className="text-3xl font-black">Aprender por tarea, no por sigla</h3>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-white/75">
                  SII, Sercotec, SUPERIR y Mercado Publico aparecen como rutas simples: que documento falta, donde se guarda y quien puede ayudar a subirlo.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {['Deudas y alertas', 'Facturacion y notas', 'Carpeta Sercotec', 'Mercado Publico'].map(item => (
                  <div key={item} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 font-bold">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <CourseSection
            title="Nivel 1: Fundamentos legales"
            description="IVA, renta, facturacion y documentos tributarios explicados para preparar el mes con calma."
            icon="account_balance"
            courses={courses.basico}
            tone="amber"
          />
          <CourseSection
            title="Nivel 2: Operacion y Contratos"
            description="Alertas tempranas, registro de deuda, abonos y notas de credito con trazabilidad entendible."
            icon="account_balance_wallet"
            courses={courses.intermedio}
            tone="amber"
          />
          <CourseSection
            title="Nivel 3: Gestion Avanzada"
            description="Carpetas, certificados, propuestas y acceso controlado para terceros que apoyan al emprendedor."
            icon="workspace_premium"
            courses={courses.avanzado}
          />
        </div>
      )}
    </div>
  );
}
