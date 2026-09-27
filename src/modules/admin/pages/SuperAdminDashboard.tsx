import { useAuth } from '@/context/AuthContext';
import { Link } from 'react-router-dom';

const organizaciones = [
  { id: 'o1', nombre: 'Municipalidad de Santiago', plan: 'Premium', usuarios: 128, emprendedores: 63, estado: 'activa', avance: 72 },
  { id: 'o2', nombre: 'Incubadora Innova', plan: 'Profesional', usuarios: 85, emprendedores: 42, estado: 'activa', avance: 58 },
  { id: 'o3', nombre: 'Universidad Católica', plan: 'Premium', usuarios: 210, emprendedores: 95, estado: 'activa', avance: 81 },
  { id: 'o4', nombre: 'Fundación Emprende', plan: 'Básico', usuarios: 34, emprendedores: 18, estado: 'activa', avance: 45 },
  { id: 'o5', nombre: 'Municipalidad de Temuco', plan: 'Profesional', usuarios: 78, emprendedores: 35, estado: 'suspendida', avance: 30 },
];

const ticketsRecientes = [
  { id: 't1', titulo: 'Error al exportar reportes CSV', org: 'Municipalidad de Santiago', prioridad: 'alta', estado: 'abierto', fecha: '25 Jul 2026' },
  { id: 't2', titulo: 'Solicitud de nuevo módulo contable', org: 'Incubadora Innova', prioridad: 'media', estado: 'en_progreso', fecha: '24 Jul 2026' },
  { id: 't3', titulo: ' Lentitud en carga de cursos', org: 'Universidad Católica', prioridad: 'alta', estado: 'abierto', fecha: '25 Jul 2026' },
];

const actividadReciente = [
  { id: 'a1', accion: 'Nueva institución creada', detalle: 'Fundación Emprende registrada', usuario: 'SupAdmin', fecha: '25 Jul 14:30', icon: 'add_business' },
  { id: 'a2', accion: 'Plan actualizado', detalle: 'U. Católica → Premium', usuario: 'SupAdmin', fecha: '25 Jul 11:15', icon: 'upgrade' },
  { id: 'a3', accion: 'Módulo habilitado', detalle: 'Contabilidad para Innova', usuario: 'SupAdmin', fecha: '24 Jul 16:45', icon: 'extension' },
  { id: 'a4', accion: 'Institución suspendida', detalle: 'Muni Temuco — pago vencido', usuario: 'Sistema', fecha: '24 Jul 09:00', icon: 'block' },
  { id: 'a5', accion: '3 tickets resueltos', detalle: 'Soporte técnico nivel 2', usuario: 'SupAdmin', fecha: '23 Jul 18:20', icon: 'check_circle' },
];

const prioridadConfig: Record<string, { color: string; dot: string }> = {
  alta: { color: 'bg-error-container text-on-error-container', dot: 'bg-error' },
  media: { color: 'bg-warning-container text-on-warning-container', dot: 'bg-warning' },
  baja: { color: 'bg-surface-container text-on-surface-variant', dot: 'bg-outline' },
};

const ticketEstadoConfig: Record<string, { color: string; label: string }> = {
  abierto: { color: 'bg-error-container text-on-error-container', label: 'Abierto' },
  en_progreso: { color: 'bg-warning-container text-on-warning-container', label: 'En progreso' },
  resuelto: { color: 'bg-success-container text-on-success-container', label: 'Resuelto' },
};

export default function SuperAdminDashboard() {
  const { perfil } = useAuth();

  const totalOrgs = organizaciones.length;
  const totalUsuarios = organizaciones.reduce((a, o) => a + o.usuarios, 0);
  const totalEmprendedores = organizaciones.reduce((a, o) => a + o.emprendedores, 0);
  const orgsActivas = organizaciones.filter(o => o.estado === 'activa').length;
  const ticketsAbiertos = ticketsRecientes.filter(t => t.estado === 'abierto').length;
  const mrr = 4850000;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-3xl text-error">shield</span>
          <div>
            <h1 className="text-2xl font-extrabold text-on-surface">Panel Super Admin</h1>
            <p className="text-on-surface-variant">Bienvenido, {perfil?.nombre_completo} — Vista global de la plataforma</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-success-container text-on-success-container flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
            Sistema operativo
          </span>
        </div>
      </div>

      {/* KPIs globales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Organizaciones', value: totalOrgs.toString(), icon: 'apartment', color: 'bg-info', sub: `${orgsActivas} activas`, trend: '+2 este mes' },
          { label: 'Usuarios Totales', value: totalUsuarios.toLocaleString(), icon: 'group', color: 'bg-info', sub: 'en todas las orgs', trend: '+48 este mes' },
          { label: 'Emprendedores', value: totalEmprendedores.toLocaleString(), icon: 'storefront', color: 'bg-success', sub: 'registrados', trend: '+23 este mes' },
          { label: 'MRR', value: `$${(mrr / 1000000).toFixed(1)}M`, icon: 'paid', color: 'bg-warning', sub: 'ingreso mensual recurrente', trend: '+$350K vs anterior' },
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
            <p className="text-xs text-on-surface-variant mt-1">{stat.trend}</p>
          </div>
        ))}
      </div>

      {/* Salud del sistema + Tickets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
          <div className="p-5 border-b border-outline-variant/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-success">monitor_heart</span>
              <h2 className="font-extrabold text-on-surface">Salud del Sistema</h2>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-success-container text-on-success-container">Operativo</span>
          </div>
          <div className="p-5 space-y-4">
            {[
              { label: 'Uptime', value: '99.97%', bar: 99.97, color: 'bg-success' },
              { label: 'Tiempo respuesta API', value: '142ms', bar: 85, color: 'bg-info' },
              { label: 'Uso de CPU', value: '34%', bar: 34, color: 'bg-teal' },
              { label: 'Almacenamiento', value: '67%', bar: 67, color: 'bg-warning' },
              { label: 'Base de datos', value: '2.4GB', bar: 48, color: 'bg-info' },
            ].map((metric) => (
              <div key={metric.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-on-surface-variant">{metric.label}</span>
                  <span className="text-xs font-extrabold text-on-surface">{metric.value}</span>
                </div>
                <div className="w-full bg-surface-container-high rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full ${metric.color}`} style={{ width: `${metric.bar}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tickets recientes */}
        <div className="lg:col-span-2 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
          <div className="p-5 border-b border-outline-variant/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-error">confirmation_number</span>
              <h2 className="font-extrabold text-on-surface">Tickets de Soporte</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-error-container text-on-error-container">{ticketsAbiertos} abiertos</span>
              <Link to="/admin/soporte" className="text-xs font-bold text-primary hover:underline">Ver todos</Link>
            </div>
          </div>
          <div className="divide-y divide-outline-variant/30">
            {ticketsRecientes.map((ticket) => (
              <div key={ticket.id} className="p-4 hover:bg-surface-container-low/50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${prioridadConfig[ticket.prioridad].color}`}>
                        {ticket.prioridad}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${ticketEstadoConfig[ticket.estado].color}`}>
                        {ticketEstadoConfig[ticket.estado].label}
                      </span>
                      <span className="text-[10px] text-on-surface-variant">{ticket.fecha}</span>
                    </div>
                    <p className="font-bold text-on-surface text-sm">{ticket.titulo}</p>
                    <p className="text-xs text-on-surface-variant mt-1">{ticket.org}</p>
                  </div>
                  <button className="px-3 py-1.5 text-xs font-bold text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors shrink-0 ml-3">
                    Atender
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Resumen de organizaciones */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
          <div className="p-5 border-b border-outline-variant/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-info">apartment</span>
              <h2 className="font-extrabold text-on-surface">Organizaciones</h2>
            </div>
            <Link to="/admin/instituciones" className="text-xs font-bold text-primary hover:underline">Gestionar</Link>
          </div>
          <div className="divide-y divide-outline-variant/30">
            {organizaciones.slice(0, 4).map((org) => (
              <div key={org.id} className="p-4 hover:bg-surface-container-low/50 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-info-container text-on-info-container">
                      <span className="material-symbols-outlined text-lg">apartment</span>
                    </div>
                    <div>
                      <p className="font-bold text-on-surface text-sm">{org.nombre}</p>
                      <p className="text-xs text-on-surface-variant">{org.usuarios} usuarios · {org.emprendedores} emprendedores</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    org.estado === 'activa' ? 'bg-success-container text-on-success-container' : 'bg-error-container text-on-error-container'
                  }`}>
                    {org.estado}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-surface-container-high rounded-full h-1.5">
                    <div className="bg-info h-1.5 rounded-full" style={{ width: `${org.avance}%` }} />
                  </div>
                  <span className="text-[10px] font-bold text-on-surface-variant">{org.plan}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actividad reciente + Acciones */}
        <div className="space-y-6">
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
            <div className="p-5 border-b border-outline-variant/30 flex items-center gap-2">
              <span className="material-symbols-outlined text-info">history</span>
              <h2 className="font-extrabold text-on-surface">Actividad Reciente</h2>
            </div>
            <div className="divide-y divide-outline-variant/30">
              {actividadReciente.map((act) => (
                <div key={act.id} className="p-4 hover:bg-surface-container-low/50 transition-colors">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container-high text-on-surface-variant shrink-0 mt-0.5">
                      <span className="material-symbols-outlined text-lg">{act.icon}</span>
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-on-surface text-sm">{act.accion}</p>
                      <p className="text-xs text-on-surface-variant">{act.detalle}</p>
                      <p className="text-[10px] text-on-surface-variant mt-1">{act.usuario} · {act.fecha}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-5">
            <h2 className="font-extrabold text-on-surface mb-4">Acciones Rápidas</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Crear Institución', icon: 'add_business', path: '/admin/instituciones' },
                { label: 'Gestionar Planes', icon: 'workspace_premium', path: '/admin/planes' },
                { label: 'Roles y Permisos', icon: 'admin_panel_settings', path: '/admin/roles' },
                { label: 'Configuración', icon: 'settings', path: '/admin/config' },
                { label: 'Auditoría', icon: 'fact_check', path: '/admin/auditoria' },
                { label: 'Soporte', icon: 'support_agent', path: '/admin/soporte' },
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
    </div>
  );
}
