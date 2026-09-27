import { useAuth } from '@/context/AuthContext';

const emprendedores = [
  {
    id: '1',
    nombre: 'Pedro Martínez',
    negocio: 'Pyme Demo Chile',
    rubro: 'Comercio',
    estado: 'en_curso' as const,
    avance: 78,
    cursosCompletados: 12,
    cursosTotal: 18,
    alertas: 1,
    ultimaActividad: 'Hace 2 horas',
    proximaSesion: '28 Jul 2026, 10:00',
    riesgo: 'bajo' as const,
  },
  {
    id: '2',
    nombre: 'Laura Díaz',
    negocio: 'Artesanías Laura',
    rubro: 'Artesanías',
    estado: 'riesgo' as const,
    avance: 45,
    cursosCompletados: 6,
    cursosTotal: 18,
    alertas: 3,
    ultimaActividad: 'Hace 5 dias',
    proximaSesion: null,
    riesgo: 'alto' as const,
  },
  {
    id: '3',
    nombre: 'Roberto Sánchez',
    negocio: 'Tech Solutions',
    rubro: 'Tecnología',
    estado: 'en_curso' as const,
    avance: 92,
    cursosCompletados: 16,
    cursosTotal: 18,
    alertas: 0,
    ultimaActividad: 'Ayer',
    proximaSesion: '29 Jul 2026, 15:00',
    riesgo: 'bajo' as const,
  },
  {
    id: '4',
    nombre: 'María López',
    negocio: 'Eco Foods',
    rubro: 'Alimentos',
    estado: 'en_curso' as const,
    avance: 65,
    cursosCompletados: 9,
    cursosTotal: 18,
    alertas: 2,
    ultimaActividad: 'Hace 2 dias',
    proximaSesion: '30 Jul 2026, 11:00',
    riesgo: 'medio' as const,
  },
  {
    id: '5',
    nombre: 'Juan Carlos Vega',
    negocio: 'Transporte Vega',
    rubro: 'Transporte',
    estado: 'cerrado' as const,
    avance: 100,
    cursosCompletados: 18,
    cursosTotal: 18,
    alertas: 0,
    ultimaActividad: 'Hace 1 semana',
    proximaSesion: null,
    riesgo: 'bajo' as const,
  },
];

const tareasPendientes = [
  { id: '1', emprendedor: 'Laura Díaz', tarea: 'Revisar plan de negocio actualizado', plazo: '27 Jul 2026', prioridad: 'alta' },
  { id: '2', emprendedor: 'Pedro Martínez', tarea: 'Aprobar solicitud de crédito', plazo: '29 Jul 2026', prioridad: 'media' },
  { id: '3', emprendedor: 'María López', tarea: 'Revisión de facturación IVA', plazo: '30 Jul 2026', prioridad: 'media' },
  { id: '4', emprendedor: 'Laura Díaz', tarea: 'Seguimiento post reunión', plazo: '01 Ago 2026', prioridad: 'baja' },
];

const sesionesProximas = [
  { id: '1', emprendedor: 'Pedro Martínez', fecha: '28 Jul 2026', hora: '10:00', tipo: 'Individual', tema: 'Revisión de inventario' },
  { id: '2', emprendedor: 'Roberto Sánchez', fecha: '29 Jul 2026', hora: '15:00', tipo: 'Individual', tema: 'Escalamiento de ventas' },
  { id: '3', emprendedor: 'María López', fecha: '30 Jul 2026', hora: '11:00', tipo: 'Individual', tema: 'Formalización tributaria' },
];

const estadoConfig = {
  en_curso: { label: 'En curso', color: 'bg-info-container text-on-info-container' },
  riesgo: { label: 'En riesgo', color: 'bg-error-container text-on-error-container' },
  cerrado: { label: 'Cerrado', color: 'bg-surface-container text-on-surface-variant' },
};

const riesgoConfig = {
  bajo: { label: 'Bajo', color: 'bg-success-container text-on-success-container' },
  medio: { label: 'Medio', color: 'bg-warning-container text-on-warning-container' },
  alto: { label: 'Alto', color: 'bg-error-container text-on-error-container' },
};

const prioridadConfig = {
  alta: { color: 'bg-error-container text-on-error-container', dot: 'bg-error' },
  media: { color: 'bg-warning-container text-on-warning-container', dot: 'bg-warning' },
  baja: { color: 'bg-surface-container text-on-surface-variant', dot: 'bg-outline' },
};

export default function MentorDashboard() {
  const { perfil } = useAuth();

  const totalEmprendedores = emprendedores.length;
  const enRiesgo = emprendedores.filter(e => e.riesgo === 'alto').length;
  const tareasAlta = tareasPendientes.filter(t => t.prioridad === 'alta').length;
  const avancePromedio = Math.round(emprendedores.reduce((a, e) => a + e.avance, 0) / totalEmprendedores);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-3xl text-teal">school</span>
        <div>
          <h1 className="text-2xl font-extrabold text-on-surface">Panel Mentor</h1>
          <p className="text-on-surface-variant">Bienvenido, {perfil?.nombre_completo}</p>
        </div>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Mis Emprendedores', value: totalEmprendedores.toString(), icon: 'groups', color: 'bg-teal', sub: 'asignados' },
          { label: 'En Riesgo', value: enRiesgo.toString(), icon: 'warning', color: 'bg-error', sub: 'requieren atención' },
          { label: 'Tareas Urgentes', value: tareasAlta.toString(), icon: 'task_alt', color: 'bg-warning', sub: 'prioridad alta' },
          { label: 'Avance Promedio', value: `${avancePromedio}%`, icon: 'trending_up', color: 'bg-info', sub: 'del grupo' },
        ].map((stat) => (
          <div key={stat.label} className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/30">
            <div className="flex items-center gap-3 mb-3">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.color} text-inverse-on-surface`}>
                <span className="material-symbols-outlined">{stat.icon}</span>
              </span>
              <div>
                <span className="text-sm font-bold text-on-surface-variant">{stat.label}</span>
                <p className="text-xs text-on-surface-variant">{stat.sub}</p>
              </div>
            </div>
            <p className="text-3xl font-extrabold text-on-surface">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Emergencias y alertas */}
        <div className="lg:col-span-2 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
          <div className="p-5 border-b border-outline-variant/30 flex items-center gap-2">
            <span className="material-symbols-outlined text-error">notifications_active</span>
            <h2 className="font-extrabold text-on-surface">Alertas y Casos en Riesgo</h2>
          </div>
          <div className="divide-y divide-outline-variant/30">
            {emprendedores.filter(e => e.alertas > 0).map((empre) => (
              <div key={empre.id} className="p-4 hover:bg-surface-container-low/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-error-container text-on-error-container text-sm font-extrabold">
                      {empre.nombre[0]}
                    </div>
                    <div>
                      <p className="font-bold text-on-surface">{empre.nombre}</p>
                      <p className="text-sm text-on-surface-variant">{empre.negocio}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-error-container text-on-error-container">
                      {empre.alertas} alerta{empre.alertas > 1 ? 's' : ''}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${riesgoConfig[empre.riesgo].color}`}>
                      Riesgo {riesgoConfig[empre.riesgo].label}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-on-surface-variant mt-2 ml-13">
                  Última actividad: {empre.ultimaActividad}
                </p>
              </div>
            ))}
            {emprendedores.filter(e => e.alertas > 0).length === 0 && (
              <div className="p-8 text-center">
                <span className="material-symbols-outlined text-4xl text-success">check_circle</span>
                <p className="mt-2 text-on-surface-variant font-bold">Sin alertas pendientes</p>
              </div>
            )}
          </div>
        </div>

        {/* Próximas sesiones */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
          <div className="p-5 border-b border-outline-variant/30 flex items-center gap-2">
            <span className="material-symbols-outlined text-info">event</span>
            <h2 className="font-extrabold text-on-surface">Próximas Sesiones</h2>
          </div>
          <div className="divide-y divide-outline-variant/30">
            {sesionesProximas.map((sesion) => (
              <div key={sesion.id} className="p-4 hover:bg-surface-container-low/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-info-container text-on-info-container">
                    <span className="material-symbols-outlined">event</span>
                  </div>
                  <div>
                    <p className="font-bold text-on-surface text-sm">{sesion.emprendedor}</p>
                    <p className="text-xs text-on-surface-variant">{sesion.fecha} · {sesion.hora}</p>
                  </div>
                </div>
                <p className="text-xs text-on-surface-variant mt-2 ml-13">{sesion.tema}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tareas pendientes */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
        <div className="p-5 border-b border-outline-variant/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-warning">task_alt</span>
            <h2 className="font-extrabold text-on-surface">Tareas Pendientes</h2>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-warning-container text-on-warning-container">
            {tareasPendientes.length} tareas
          </span>
        </div>
        <div className="divide-y divide-outline-variant/30">
          {tareasPendientes.map((tarea) => (
            <div key={tarea.id} className="p-4 flex items-center justify-between hover:bg-surface-container-low/50 transition-colors">
              <div className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${prioridadConfig[tarea.prioridad].dot}`} />
                <div>
                  <p className="font-bold text-on-surface text-sm">{tarea.tarea}</p>
                  <p className="text-xs text-on-surface-variant">{tarea.emprendedor} · Plazo: {tarea.plazo}</p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${prioridadConfig[tarea.prioridad].color}`}>
                {tarea.prioridad}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Resumen de progreso del grupo */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-teal">bar_chart</span>
          <h2 className="font-extrabold text-on-surface">Progreso del Grupo</h2>
        </div>
        <div className="space-y-3">
          {emprendedores.filter(e => e.estado !== 'cerrado').map((empre) => (
            <div key={empre.id} className="flex items-center gap-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-container text-on-teal-container text-sm font-extrabold shrink-0">
                {empre.nombre[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-bold text-on-surface truncate">{empre.nombre}</span>
                  <span className="text-sm font-bold text-on-surface-variant">{empre.avance}%</span>
                </div>
                <div className="w-full bg-surface-container-high rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${empre.riesgo === 'alto' ? 'bg-error' : empre.riesgo === 'medio' ? 'bg-warning' : 'bg-teal'}`}
                    style={{ width: `${empre.avance}%` }}
                  />
                </div>
                <p className="text-xs text-on-surface-variant mt-1">
                  {empre.cursosCompletados}/{empre.cursosTotal} cursos completados
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
