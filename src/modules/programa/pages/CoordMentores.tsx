import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';

interface Mentor {
  id: string;
  nombre: string;
  email: string;
  especialidad: string;
  emprendedoresAsignados: number;
  maxEmprendedores: number;
  emprendedores: string[];
  estado: 'activo' | 'inactivo';
  sesionesMes: number;
}

const mentoresIniciales: Mentor[] = [
  { id: '1', nombre: 'Carlos Ruiz', email: 'carlos@inst.cl', especialidad: 'Finanzas y Formalizacion', emprendedoresAsignados: 4, maxEmprendedores: 6, emprendedores: ['Pedro Martinez', 'Camila Rojas', 'Juan Carlos Vega', 'Maria Lopez'], estado: 'activo', sesionesMes: 8 },
  { id: '2', nombre: 'Ana Morales', email: 'ana.m@inst.cl', especialidad: 'Marketing Digital', emprendedoresAsignados: 3, maxEmprendedores: 6, emprendedores: ['Roberto Sanchez', 'Maria Lopez', 'Felipe Torres'], estado: 'activo', sesionesMes: 6 },
  { id: '3', nombre: 'Jorge Pena', email: 'jorge@inst.cl', especialidad: 'Gestion Operacional', emprendedoresAsignados: 2, maxEmprendedores: 6, emprendedores: ['Maria Lopez', 'Camila Rojas'], estado: 'activo', sesionesMes: 4 },
  { id: '4', nombre: 'Sofia Reyes', email: 'sofia@inst.cl', especialidad: 'E-Commerce', emprendedoresAsignados: 1, maxEmprendedores: 6, emprendedores: ['Juan Carlos Vega'], estado: 'activo', sesionesMes: 2 },
];

const cohortes = [
  { id: 'c1', nombre: 'Emprendimiento Juvenil 2026', emprendedores: 15, mentorAsignados: 3, avance: 68, estado: 'activa' as const, ruta: 'Ruta Basica: Finanzas + Legal' },
  { id: 'c2', nombre: 'Innovacion Digital', emprendedores: 22, mentorAsignados: 4, avance: 45, estado: 'activa' as const, ruta: 'Ruta Completa: 3 niveles' },
  { id: 'c3', nombre: 'Sostenibilidad Local', emprendedores: 8, mentorAsignados: 2, avance: 90, estado: 'activa' as const, ruta: 'Ruta Basica: Legal' },
];

export default function CoordMentores() {
  const { perfil } = useAuth();
  const [tab, setTab] = useState<'mentores' | 'cohortes'>('mentores');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-3xl text-teal">school</span>
          <h1 className="text-2xl font-extrabold text-on-surface">Gestion de Mentores y Cohortes</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-surface-container-lowest rounded-2xl p-2 border border-outline-variant/30">
        {([
          { key: 'mentores', label: 'Mentores', icon: 'school' },
          { key: 'cohortes', label: 'Cohortes y Rutas', icon: 'group_work' },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
              tab === t.key
                ? 'bg-primary text-inverse-on-surface shadow-lg shadow-primary/15'
                : 'text-on-surface-variant hover:bg-primary/5'
            }`}
          >
            <span className="material-symbols-outlined text-lg">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Mentores */}
      {tab === 'mentores' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button className="flex items-center gap-2 px-5 py-2.5 bg-primary text-inverse-on-surface font-bold rounded-xl hover:bg-primary/90 transition-colors">
              <span className="material-symbols-outlined text-lg">person_add</span>
              Asignar Mentor
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mentoresIniciales.map((mentor) => (
              <div key={mentor.id} className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/30 hover:border-primary/30 transition-colors">
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-container text-on-teal-container font-extrabold text-lg">
                    {mentor.nombre[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-extrabold text-on-surface">{mentor.nombre}</p>
                    <p className="text-sm text-on-surface-variant">{mentor.especialidad}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${mentor.estado === 'activo' ? 'bg-success-container text-on-success-container' : 'bg-surface-container text-on-surface-variant'}`}>
                    {mentor.estado}
                  </span>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-on-surface-variant">Emprendedores asignados</span>
                      <span className="font-bold text-on-surface">{mentor.emprendedoresAsignados}/{mentor.maxEmprendedores}</span>
                    </div>
                    <div className="w-full bg-surface-container-high rounded-full h-2">
                      <div className="bg-teal h-2 rounded-full" style={{ width: `${(mentor.emprendedoresAsignados / mentor.maxEmprendedores) * 100}%` }} />
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-outline mb-1.5">Emprendedores</p>
                    <div className="flex flex-wrap gap-1.5">
                      {mentor.emprendedores.map((e) => (
                        <span key={e} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-container-high text-on-surface-variant">
                          {e}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-outline-variant/30">
                    <span className="text-xs text-on-surface-variant">{mentor.sesionesMes} sesiones este mes</span>
                    <button className="text-xs font-bold text-primary hover:underline">Ver historial</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab Cohortes */}
      {tab === 'cohortes' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button className="flex items-center gap-2 px-5 py-2.5 bg-primary text-inverse-on-surface font-bold rounded-xl hover:bg-primary/90 transition-colors">
              <span className="material-symbols-outlined text-lg">add</span>
              Nueva Cohorte
            </button>
          </div>

          <div className="space-y-4">
            {cohortes.map((cohorte) => (
              <div key={cohorte.id} className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/30">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-extrabold text-on-surface text-lg">{cohorte.nombre}</p>
                    <p className="text-sm text-on-surface-variant mt-1">{cohorte.ruta}</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-success-container text-on-success-container">
                    {cohorte.estado}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-surface-container-low rounded-xl p-3 text-center">
                    <p className="text-2xl font-extrabold text-on-surface">{cohorte.emprendedores}</p>
                    <p className="text-xs text-on-surface-variant">Emprendedores</p>
                  </div>
                  <div className="bg-surface-container-low rounded-xl p-3 text-center">
                    <p className="text-2xl font-extrabold text-teal">{cohorte.mentorAsignados}</p>
                    <p className="text-xs text-on-surface-variant">Mentores</p>
                  </div>
                  <div className="bg-surface-container-low rounded-xl p-3 text-center">
                    <p className="text-2xl font-extrabold text-success">{cohorte.avance}%</p>
                    <p className="text-xs text-on-surface-variant">Avance</p>
                  </div>
                  <div className="bg-surface-container-low rounded-xl p-3 text-center">
                    <p className="text-2xl font-extrabold text-info">3</p>
                    <p className="text-xs text-on-surface-variant">Modulos activos</p>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-on-surface-variant">Avance general</span>
                    <span className="font-bold text-on-surface">{cohorte.avance}%</span>
                  </div>
                  <div className="w-full bg-surface-container-high rounded-full h-2">
                    <div className="bg-success h-2 rounded-full" style={{ width: `${cohorte.avance}%` }} />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <button className="px-3 py-1.5 text-xs font-bold text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">
                      Asignar mentores
                    </button>
                    <button className="px-3 py-1.5 text-xs font-bold text-on-surface-variant border border-outline-variant/40 rounded-lg hover:bg-surface-container-low transition-colors">
                      Ver emprendedores
                    </button>
                  </div>
                  <button className="px-3 py-1.5 text-xs font-bold text-primary hover:underline">
                    Editar cohorte
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
