import { useAuth } from '@/context/AuthContext';
import { Link } from 'react-router-dom';

const programas = [
  { id: 'p1', nombre: 'Emprendimiento Juvenil', cohortes: 2, emprendedores: 38, coordinador: 'María González', avance: 64, estado: 'activo' as const },
  { id: 'p2', nombre: 'Innovación Digital', cohortes: 1, emprendedores: 22, coordinador: 'Ana Silva', avance: 45, estado: 'activo' as const },
  { id: 'p3', nombre: 'Sostenibilidad Local', cohortes: 1, emprendedores: 8, coordinador: 'María González', avance: 90, estado: 'activo' as const },
];

const alertas = [
  { id: 'a1', tipo: 'cumplimiento' as const, titulo: 'Baja participación en módulo Finanzas', descripcion: 'Cohorte Juvenil — solo 40% completó el módulo esta semana.', prioridad: 'alta', fecha: '25 Jul 2026' },
  { id: 'a2', tipo: 'desercion' as const, titulo: '3 emprendedores sin actividad 7+ días', descripcion: 'Riesgo de abandono detectado en cohorte Innovación Digital.', prioridad: 'alta', fecha: '24 Jul 2026' },
  { id: 'a3', tipo: 'calidad' as const, titulo: 'Datos incompletos en 12 registros', descripcion: 'Campos obligatorios sin llenar: RUT, dirección, rubro.', prioridad: 'media', fecha: '23 Jul 2026' },
  { id: 'a4', tipo: 'vencimiento' as const, titulo: 'Reporte mensual pendiente de revisión', descripcion: 'Cierre de julio — falta revisión de cumplimiento global.', prioridad: 'media', fecha: '22 Jul 2026' },
];

const cohortesActivas = [
  { id: 'c1', nombre: 'EJ-2026-01', programa: 'Emprendimiento Juvenil', emprendedores: 18, mentorAsignados: 4, avance: 72, estado: 'activa' as const },
  { id: 'c2', nombre: 'EJ-2026-02', programa: 'Emprendimiento Juvenil', emprendedores: 20, mentorAsignados: 3, avance: 55, estado: 'activa' as const },
  { id: 'c3', nombre: 'ID-2026-01', programa: 'Innovación Digital', emprendedores: 22, mentorAsignados: 4, avance: 45, estado: 'activa' as const },
  { id: 'c4', nombre: 'SL-2026-01', programa: 'Sostenibilidad Local', emprendedores: 8, mentorAsignados: 2, avance: 90, estado: 'activa' as const },
];

const tareasPendientes = [
  { id: 't1', tarea: 'Asignar mentores a cohorte EJ-02', plazo: '27 Jul 2026', prioridad: 'alta' },
  { id: 't2', tarea: 'Revisar datos incompletos de comunidad', plazo: '30 Jul 2026', prioridad: 'media' },
  { id: 't3', tarea: 'Exportar reporte mensual de avance', plazo: '01 Ago 2026', prioridad: 'media' },
  { id: 't4', tarea: 'Aprobar solicitud de nuevo programa', plazo: '28 Jul 2026', prioridad: 'alta' },
];

const prioridadConfig: Record<string, { color: string; dot: string }> = {
  alta: { color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  media: { color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  baja: { color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
};

const alertaTipoConfig: Record<string, { color: string; icon: string }> = {
  cumplimiento: { color: 'bg-amber-100 text-amber-700', icon: 'gpp_maybe' },
  desercion: { color: 'bg-red-100 text-red-700', icon: 'person_off' },
  calidad: { color: 'bg-blue-100 text-blue-700', icon: 'fact_check' },
  vencimiento: { color: 'bg-purple-100 text-purple-700', icon: 'schedule' },
};

export default function AdminInstDashboard() {
  const { perfil } = useAuth();

  const totalEmprendedores = programas.reduce((a, p) => a + p.emprendedores, 0);
  const totalCohortes = cohortesActivas.length;
  const totalMentores = cohortesActivas.reduce((a, c) => a + c.mentorAsignados, 0);
  const avanceGlobal = Math.round(cohortesActivas.reduce((a, c) => a + c.avance * c.emprendedores, 0) / cohortesActivas.reduce((a, c) => a + c.emprendedores, 0));
  const alertasAltas = alertas.filter(a => a.prioridad === 'alta').length;
  const usuariosTotal = 128;
  const cobertura = 78;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-3xl text-purple-500">admin_panel_settings</span>
          <div>
            <h1 className="text-2xl font-extrabold text-on-surface">Panel Institucional</h1>
            <p className="text-on-surface-variant">Bienvenido, {perfil?.nombre_completo}</p>
          </div>
        </div>
        <Link to="/institucion/config" className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-outline-variant/30 text-sm font-bold text-on-surface-variant hover:bg-surface-container-low transition-colors">
          <span className="material-symbols-outlined text-lg">settings</span>
          Configuración
        </Link>
      </div>

      {/* KPIs Principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Cobertura', value: `${cobertura}%`, icon: 'groups', color: 'bg-blue-500', sub: `${usuariosTotal} usuarios totales`, trend: '+5% vs mes anterior' },
          { label: 'Cumplimiento', value: `${avanceGlobal}%`, icon: 'task_alt', color: 'bg-green-500', sub: 'avance promedio', trend: '+8% vs mes anterior' },
          { label: 'Actividad Semanal', value: '82%', icon: 'insights', color: 'bg-teal-500', sub: 'tasa de participación', trend: '234 sesiones registradas' },
          { label: 'Alertas Activas', value: alertas.length.toString(), icon: 'notifications_active', color: 'bg-red-500', sub: `${alertasAltas} de alta prioridad`, trend: 'Requieren atención' },
        ].map((stat) => (
          <div key={stat.label} className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/30">
            <div className="flex items-center gap-3 mb-3">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.color} text-white`}>
                <span className="material-symbols-outlined">{stat.icon}</span>
              </span>
              <div>
                <span className="text-sm font-bold text-on-surface-variant">{stat.label}</span>
                <p className="text-xs text-on-surface-variant">{stat.sub}</p>
              </div>
            </div>
            <p className="text-3xl font-extrabold text-on-surface">{stat.value}</p>
            <p className="text-xs text-on-surface-variant mt-1">{stat.trend}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alertas y cumplimiento */}
        <div className="lg:col-span-2 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
          <div className="p-5 border-b border-outline-variant/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-red-500">notifications_active</span>
              <h2 className="font-extrabold text-on-surface">Alertas Institucionales</h2>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">{alertas.length} activas</span>
          </div>
          <div className="divide-y divide-outline-variant/30">
            {alertas.map((alerta) => (
              <div key={alerta.id} className="p-4 hover:bg-surface-container-low/50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${alertaTipoConfig[alerta.tipo].color}`}>
                        {alerta.tipo}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${prioridadConfig[alerta.prioridad].color}`}>
                        {alerta.prioridad}
                      </span>
                      <span className="text-[10px] text-on-surface-variant">{alerta.fecha}</span>
                    </div>
                    <p className="font-bold text-on-surface text-sm">{alerta.titulo}</p>
                    <p className="text-xs text-on-surface-variant mt-1">{alerta.descripcion}</p>
                  </div>
                  <button className="px-3 py-1.5 text-xs font-bold text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors shrink-0 ml-3">
                    Atender
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Resumen de programas */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
          <div className="p-5 border-b border-outline-variant/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-purple-500">school</span>
              <h2 className="font-extrabold text-on-surface">Programas</h2>
            </div>
            <Link to="/institucion/programas" className="text-xs font-bold text-primary hover:underline">Ver todos</Link>
          </div>
          <div className="divide-y divide-outline-variant/30">
            {programas.map((prog) => (
              <div key={prog.id} className="p-4 hover:bg-surface-container-low/50 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-bold text-on-surface text-sm">{prog.nombre}</p>
                  <span className="text-sm font-bold text-on-surface-variant">{prog.avance}%</span>
                </div>
                <div className="w-full bg-surface-container-high rounded-full h-1.5 mb-2">
                  <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${prog.avance}%` }} />
                </div>
                <div className="flex items-center gap-3 text-xs text-on-surface-variant">
                  <span>{prog.emprendedores} emprendedores</span>
                  <span>·</span>
                  <span>{prog.cohortes} cohorte{prog.cohortes > 1 ? 's' : ''}</span>
                  <span>·</span>
                  <span>{prog.coordinador}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cohortes activas */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
          <div className="p-5 border-b border-outline-variant/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-green-500">group_work</span>
              <h2 className="font-extrabold text-on-surface">Cohortes Activas</h2>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">{totalCohortes} activas</span>
          </div>
          <div className="divide-y divide-outline-variant/30">
            {cohortesActivas.map((cohorte) => (
              <div key={cohorte.id} className="p-4 hover:bg-surface-container-low/50 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-extrabold text-on-surface text-sm">{cohorte.nombre}</p>
                    <p className="text-xs text-on-surface-variant">{cohorte.programa}</p>
                  </div>
                  <span className="text-sm font-bold text-on-surface-variant">{cohorte.avance}%</span>
                </div>
                <div className="w-full bg-surface-container-high rounded-full h-2 mb-2">
                  <div className={`h-2 rounded-full ${cohorte.avance >= 80 ? 'bg-green-500' : cohorte.avance >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`} style={{ width: `${cohorte.avance}%` }} />
                </div>
                <div className="flex items-center gap-4 text-xs text-on-surface-variant">
                  <span>{cohorte.emprendedores} emprendedores</span>
                  <span>·</span>
                  <span>{cohorte.mentorAsignados} mentores</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tareas pendientes + Acciones rápidas */}
        <div className="space-y-6">
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
            <div className="p-5 border-b border-outline-variant/30 flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-500">task_alt</span>
              <h2 className="font-extrabold text-on-surface">Tareas Pendientes</h2>
            </div>
            <div className="divide-y divide-outline-variant/30">
              {tareasPendientes.map((tarea) => (
                <div key={tarea.id} className="p-4 flex items-center justify-between hover:bg-surface-container-low/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full ${prioridadConfig[tarea.prioridad].dot}`} />
                    <div>
                      <p className="font-bold text-on-surface text-sm">{tarea.tarea}</p>
                      <p className="text-xs text-on-surface-variant">Plazo: {tarea.plazo}</p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${prioridadConfig[tarea.prioridad].color}`}>
                    {tarea.prioridad}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-5">
            <h2 className="font-extrabold text-on-surface mb-4">Acciones Rápidas</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Gestionar Usuarios', icon: 'group', path: '/institucion/usuarios' },
                { label: 'Ver Comunidad', icon: 'diversity_3', path: '/institucion/comunidad' },
                { label: 'Reportes', icon: 'analytics', path: '/institucion/reportes' },
                { label: 'Configuración', icon: 'settings', path: '/institucion/config' },
              ].map((action) => (
                <Link
                  key={action.label}
                  to={action.path}
                  className="flex items-center gap-3 p-3 rounded-xl border-2 border-surface-container-high hover:border-primary/30 hover:bg-primary/5 transition-all"
                >
                  <span className="material-symbols-outlined text-primary text-lg">{action.icon}</span>
                  <span className="text-sm font-bold text-on-surface">{action.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Stats globales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/30">
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 text-white">
              <span className="material-symbols-outlined">groups</span>
            </span>
            <div>
              <span className="text-sm font-bold text-on-surface-variant">Emprendedores Totales</span>
              <p className="text-xs text-on-surface-variant">en {totalCohortes} cohortes</p>
            </div>
          </div>
          <p className="text-3xl font-extrabold text-on-surface">{totalEmprendedores}</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 bg-surface-container-high rounded-full h-1.5">
              <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${avanceGlobal}%` }} />
            </div>
            <span className="text-xs font-bold text-on-surface-variant">{avanceGlobal}% avance</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/30">
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500 text-white">
              <span className="material-symbols-outlined">school</span>
            </span>
            <div>
              <span className="text-sm font-bold text-on-surface-variant">Mentores Activos</span>
              <p className="text-xs text-on-surface-variant">asignados a cohortes</p>
            </div>
          </div>
          <p className="text-3xl font-extrabold text-on-surface">{totalMentores}</p>
          <p className="text-xs text-on-surface-variant mt-2">Ratio: 1 mentor / {Math.round(totalEmprendedores / totalMentores)} emprendedores</p>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/30">
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500 text-white">
              <span className="material-symbols-outlined">verified</span>
            </span>
            <div>
              <span className="text-sm font-bold text-on-surface-variant">Formalizados</span>
              <p className="text-xs text-on-surface-variant">con negocio legal</p>
            </div>
          </div>
          <p className="text-3xl font-extrabold text-on-surface">67%</p>
          <p className="text-xs text-on-surface-variant mt-2">42 de 63 emprendedores formalizados</p>
        </div>
      </div>
    </div>
  );
}
