import { useAuth } from '@/context/AuthContext';

const cohortes = [
  { id: 'c1', nombre: 'Emprendimiento Juvenil 2026', emprendedores: 15, mentorAsignados: 3, avance: 68, estado: 'activa' as const },
  { id: 'c2', nombre: 'Innovacion Digital', emprendedores: 22, mentorAsignados: 4, avance: 45, estado: 'activa' as const },
  { id: 'c3', nombre: 'Sostenibilidad Local', emprendedores: 8, mentorAsignados: 2, avance: 90, estado: 'activa' as const },
];

const alertas = [
  { id: '1', tipo: 'riesgo' as const, titulo: 'Laura Diaz — 5 dias sin actividad', descripcion: 'Emprendedor sin conexion reciente. Requiere seguimiento urgente.', emprendedor: 'Laura Diaz', prioridad: 'alta' },
  { id: '2', tipo: 'vencimiento' as const, titulo: '3 documentos pendientes de revision', descripcion: 'Formulario Sercotec vence el 01 de Agosto.', emprendedor: 'Varios', prioridad: 'media' },
  { id: '3', tipo: 'alerta' as const, titulo: 'Maria Lopez — IVA sin declarar', descripcion: 'Facturacion de julio pendiente de revisión tributaria.', emprendedor: 'Maria Lopez', prioridad: 'media' },
];

const eventos = [
  { id: 'e1', titulo: 'Webinar: Finanzas para emprendedores', fecha: '28 Jul 2026', hora: '10:00', tipo: 'webinar', participantes: 25 },
  { id: 'e2', titulo: 'Reunion de coordinacion', fecha: '29 Jul 2026', hora: '09:00', tipo: 'reunion', participantes: 5 },
  { id: 'e3', titulo: 'Taller: Como postular a fondos', fecha: '31 Jul 2026', hora: '14:00', tipo: 'taller', participantes: 18 },
  { id: 'e4', titulo: 'Cierre de cohorte Juvenil', fecha: '15 Ago 2026', hora: '11:00', tipo: 'evento', participantes: 15 },
];

const tareasPendientes = [
  { id: 't1', tarea: 'Asignar mentor a nuevos emprendedores', cohortes: 2, plazo: '27 Jul 2026', prioridad: 'alta' },
  { id: 't2', tarea: 'Revisar avance modulo Finanzas', cohortes: 1, plazo: '30 Jul 2026', prioridad: 'media' },
  { id: 't3', tarea: 'Enviar encuesta de satisfaccion', cohortes: 3, plazo: '01 Ago 2026', prioridad: 'media' },
  { id: 't4', tarea: 'Preparar materiales webinar', cohortes: 1, plazo: '27 Jul 2026', prioridad: 'alta' },
];

const tipoEventoConfig: Record<string, { color: string; icon: string }> = {
  webinar: { color: 'bg-info-container text-on-info-container', icon: 'videocam' },
  reunion: { color: 'bg-info-container text-on-info-container', icon: 'groups' },
  taller: { color: 'bg-success-container text-on-success-container', icon: 'handyman' },
  evento: { color: 'bg-warning-container text-on-warning-container', icon: 'celebration' },
};

const prioridadConfig: Record<string, { color: string; dot: string }> = {
  alta: { color: 'bg-error-container text-on-error-container', dot: 'bg-error' },
  media: { color: 'bg-warning-container text-on-warning-container', dot: 'bg-warning' },
  baja: { color: 'bg-surface-container text-on-surface-variant', dot: 'bg-outline' },
};

export default function CoordDashboard() {
  const { perfil } = useAuth();

  const totalEmprendedores = cohortes.reduce((a, c) => a + c.emprendedores, 0);
  const totalMentores = cohortes.reduce((a, c) => a + c.mentorAsignados, 0);
  const alertasAltas = alertas.filter(a => a.prioridad === 'alta').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-3xl text-info">group_work</span>
        <div>
          <h1 className="text-2xl font-extrabold text-on-surface">Panel Coordinador</h1>
          <p className="text-on-surface-variant">Bienvenido, {perfil?.nombre_completo}</p>
        </div>
      </div>

      {/* Metricas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Emprendedores', value: totalEmprendedores.toString(), icon: 'groups', color: 'bg-success', sub: 'en 3 cohortes' },
          { label: 'Mentores', value: totalMentores.toString(), icon: 'school', color: 'bg-teal', sub: 'asignados' },
          { label: 'Alertas Activas', value: alertas.length.toString(), icon: 'warning', color: 'bg-error', sub: `${alertasAltas} alta prioridad` },
          { label: 'Eventos esta semana', value: '3', icon: 'event', color: 'bg-info', sub: 'proximos' },
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
        {/* Alertas */}
        <div className="lg:col-span-2 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
          <div className="p-5 border-b border-outline-variant/30 flex items-center gap-2">
            <span className="material-symbols-outlined text-error">notifications_active</span>
            <h2 className="font-extrabold text-on-surface">Alertas y Casos Criticos</h2>
          </div>
          <div className="divide-y divide-outline-variant/30">
            {alertas.map((alerta) => (
              <div key={alerta.id} className="p-4 hover:bg-surface-container-low/50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                        alerta.tipo === 'riesgo' ? 'bg-error-container text-on-error-container' :
                        alerta.tipo === 'vencimiento' ? 'bg-warning-container text-on-warning-container' :
                        'bg-info-container text-on-info-container'
                      }`}>
                        {alerta.tipo}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${prioridadConfig[alerta.prioridad].color}`}>
                        {alerta.prioridad}
                      </span>
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

        {/* Eventos proximos */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
          <div className="p-5 border-b border-outline-variant/30 flex items-center gap-2">
            <span className="material-symbols-outlined text-info">event</span>
            <h2 className="font-extrabold text-on-surface">Proximos Eventos</h2>
          </div>
          <div className="divide-y divide-outline-variant/30">
            {eventos.map((evento) => (
              <div key={evento.id} className="p-4 hover:bg-surface-container-low/50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tipoEventoConfig[evento.tipo].color}`}>
                    <span className="material-symbols-outlined text-lg">{tipoEventoConfig[evento.tipo].icon}</span>
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-on-surface text-sm truncate">{evento.titulo}</p>
                    <p className="text-xs text-on-surface-variant">{evento.fecha} · {evento.hora} · {evento.participantes} participantes</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cohortes activas */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
        <div className="p-5 border-b border-outline-variant/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-success">school</span>
            <h2 className="font-extrabold text-on-surface">Cohortes Activas</h2>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-success-container text-on-success-container">{cohortes.length} activas</span>
        </div>
        <div className="divide-y divide-outline-variant/30">
          {cohortes.map((cohorte) => (
            <div key={cohorte.id} className="p-4 hover:bg-surface-container-low/50 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <p className="font-extrabold text-on-surface">{cohorte.nombre}</p>
                <span className="text-sm font-bold text-on-surface-variant">{cohorte.avance}%</span>
              </div>
              <div className="w-full bg-surface-container-high rounded-full h-2 mb-2">
                <div className="bg-success h-2 rounded-full" style={{ width: `${cohorte.avance}%` }} />
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

      {/* Tareas pendientes */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
        <div className="p-5 border-b border-outline-variant/30 flex items-center gap-2">
          <span className="material-symbols-outlined text-warning">task_alt</span>
          <h2 className="font-extrabold text-on-surface">Tareas Pendientes</h2>
        </div>
        <div className="divide-y divide-outline-variant/30">
          {tareasPendientes.map((tarea) => (
            <div key={tarea.id} className="p-4 flex items-center justify-between hover:bg-surface-container-low/50 transition-colors">
              <div className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${prioridadConfig[tarea.prioridad].dot}`} />
                <div>
                  <p className="font-bold text-on-surface text-sm">{tarea.tarea}</p>
                  <p className="text-xs text-on-surface-variant">{tarea.cohortes} cohorte{tarea.cohortes > 1 ? 's' : ''} · Plazo: {tarea.plazo}</p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${prioridadConfig[tarea.prioridad].color}`}>
                {tarea.prioridad}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
