import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Link } from 'react-router-dom';
import { api, request } from '@/lib/api';
import { formatCLP } from '@/lib/fechas';
import { rolLabel } from '@/lib/roles';
import { WEBPAY_MODO_PRUEBA } from '@/lib/planes';

// Corrección #36: KPIs y salud desde endpoints reales; lo que no tiene fuente se marca "Dato de ejemplo".

interface Datos {
  stats: Record<string, number> | null;
  roles: Record<string, number> | null;
  pagos: { total: number; aprobados: number; ingresos: number } | null;
  salud: { ok: boolean; baseDatos: string; entorno: string } | null;
  instituciones: { id: string; nombre: string; activa: number | boolean }[] | null;
}

const ticketsEjemplo = [
  { id: 't1', titulo: 'Error al exportar reportes CSV', org: 'Municipalidad de Santiago', prioridad: 'alta', estado: 'abierto' },
  { id: 't2', titulo: 'Solicitud de nuevo módulo contable', org: 'Incubadora Innova', prioridad: 'media', estado: 'en_progreso' },
  { id: 't3', titulo: 'Lentitud en carga de cursos', org: 'Universidad Católica', prioridad: 'alta', estado: 'abierto' },
];

const prioridadConfig: Record<string, string> = {
  alta: 'bg-error-container text-on-error-container',
  media: 'bg-warning-container text-on-warning-container',
  baja: 'bg-surface-container text-on-surface-variant',
};

const ticketEstadoConfig: Record<string, { color: string; label: string }> = {
  abierto: { color: 'bg-error-container text-on-error-container', label: 'Abierto' },
  en_progreso: { color: 'bg-warning-container text-on-warning-container', label: 'En progreso' },
  resuelto: { color: 'bg-success-container text-on-success-container', label: 'Resuelto' },
};

const EjemploBadge = () => (
  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-warning-container text-on-warning-container">Dato de ejemplo</span>
);

const num = (n: number | undefined | null) => (n == null ? '—' : n.toLocaleString('es-CL'));

export default function SuperAdminDashboard() {
  const { perfil } = useAuth();
  const [d, setD] = useState<Datos | null>(null);

  useEffect(() => {
    let activo = true;
    const o = <T,>(p: Promise<T>) => p.catch(() => null);
    Promise.all([
      o(api.getPerfilesStats()),
      o(api.getRolCounts().then(r => r.data)),
      o(request<Datos['pagos']>('/api/pagos/estadisticas')),
      o(request<Datos['salud']>('/api/health')),
      o(api.getInstituciones().then(r => r.data as unknown as NonNullable<Datos['instituciones']>)),
    ]).then(([stats, roles, pagos, salud, instituciones]) => {
      if (activo) setD({ stats, roles, pagos, salud, instituciones });
    });
    return () => { activo = false; };
  }, []);

  const cargando = d === null;
  const apiOk = !!d?.salud?.ok;
  const instActivas = d?.instituciones?.filter(i => !!i.activa).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-3xl text-error">shield</span>
          <div>
            <h1 className="text-2xl font-extrabold text-on-surface">Panel Super Admin</h1>
            <p className="text-on-surface-variant">Bienvenido, {perfil?.nombre_completo} — Vista global de la plataforma</p>
          </div>
        </div>
        {!cargando && (
          <span className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 ${apiOk ? 'bg-success-container text-on-success-container' : 'bg-error-container text-on-error-container'}`}>
            <span className={`h-2 w-2 rounded-full ${apiOk ? 'bg-success animate-pulse' : 'bg-error'}`} />
            {apiOk ? 'API operativa' : 'API sin respuesta'}
          </span>
        )}
      </div>

      {/* KPIs globales (datos reales) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Organizaciones', value: num(d?.instituciones?.length), icon: 'apartment', color: 'bg-info', sub: instActivas == null ? 'sin datos' : `${instActivas} activas` },
          { label: 'Usuarios activos', value: num(d?.stats?.total), icon: 'group', color: 'bg-info', sub: `${num(d?.stats?.mentores)} mentores · ${num(d?.stats?.coordinadores)} coordinadores` },
          { label: 'Emprendedores', value: num(d?.stats?.emprendedores), icon: 'storefront', color: 'bg-success', sub: 'cuentas activas' },
          {
            label: 'Ingresos Webpay', value: d?.pagos ? formatCLP(d.pagos.ingresos) : '—', icon: 'paid', color: 'bg-warning',
            sub: d?.pagos ? `${num(d.pagos.aprobados)} pagos aprobados (histórico)${WEBPAY_MODO_PRUEBA ? ' · modo prueba' : ''}` : 'sin datos',
          },
        ].map((stat) => (
          <div key={stat.label} className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/30">
            <div className="flex items-center gap-3 mb-3">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.color} text-inverse-on-surface`}>
                <span className="material-symbols-outlined">{stat.icon}</span>
              </span>
              <span className="text-sm font-bold text-on-surface-variant">{stat.label}</span>
            </div>
            <p className="text-3xl font-extrabold text-on-surface">{cargando ? '…' : stat.value}</p>
            <p className="text-xs text-on-surface-variant mt-1">{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Estado del sistema: /api/health */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
          <div className="p-5 border-b border-outline-variant/30 flex items-center gap-2">
            <span className="material-symbols-outlined text-success">monitor_heart</span>
            <h2 className="font-extrabold text-on-surface">Estado del sistema</h2>
          </div>
          <div className="p-5 space-y-3 text-sm">
            {[
              ['API', cargando ? '…' : apiOk ? 'Operativa' : 'Sin respuesta'],
              ['Base de datos', d?.salud?.baseDatos === 'postgres' ? 'PostgreSQL' : d?.salud?.baseDatos === 'local' ? 'Local (desarrollo)' : '—'],
              ['Entorno', d?.salud?.entorno ?? '—'],
              ['Webpay', WEBPAY_MODO_PRUEBA ? 'Modo prueba' : 'Producción'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between">
                <span className="font-bold text-on-surface-variant">{k}</span>
                <span className="font-extrabold text-on-surface">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Usuarios por rol: /api/admin/perfiles/conteo-por-rol */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
          <div className="p-5 border-b border-outline-variant/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-info">badge</span>
              <h2 className="font-extrabold text-on-surface">Usuarios por rol</h2>
            </div>
            <Link to="/admin/usuarios" className="text-xs font-bold text-primary hover:underline">Ver usuarios</Link>
          </div>
          <div className="p-5 space-y-2 text-sm">
            {d?.roles && Object.keys(d.roles).length > 0
              ? (Object.entries(d.roles) as [string, number][]).sort(([, a], [, b]) => b - a).map(([rol, n]) => (
                <div key={rol} className="flex items-center justify-between">
                  <span className="text-on-surface-variant">{rolLabel(rol)}</span>
                  <span className="font-extrabold text-on-surface">{num(n)}</span>
                </div>
              ))
              : <p className="text-on-surface-variant">{cargando ? 'Cargando…' : 'Sin datos'}</p>}
          </div>
        </div>

        {/* Organizaciones reales */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
          <div className="p-5 border-b border-outline-variant/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-info">apartment</span>
              <h2 className="font-extrabold text-on-surface">Organizaciones</h2>
            </div>
            <Link to="/admin/instituciones" className="text-xs font-bold text-primary hover:underline">Gestionar</Link>
          </div>
          <div className="divide-y divide-outline-variant/30">
            {(d?.instituciones ?? []).slice(0, 6).map((org) => (
              <div key={org.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <p className="font-bold text-on-surface text-sm truncate">{org.nombre}</p>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${org.activa ? 'bg-success-container text-on-success-container' : 'bg-error-container text-on-error-container'}`}>
                  {org.activa ? 'activa' : 'inactiva'}
                </span>
              </div>
            ))}
            {!cargando && !d?.instituciones?.length && <p className="p-5 text-sm text-on-surface-variant">Sin organizaciones registradas.</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tickets: aún sin backend */}
        <div className="lg:col-span-2 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
          <div className="p-5 border-b border-outline-variant/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-error">confirmation_number</span>
              <h2 className="font-extrabold text-on-surface">Tickets de soporte</h2>
              <EjemploBadge />
            </div>
            <Link to="/admin/soporte" className="text-xs font-bold text-primary hover:underline">Ver todos</Link>
          </div>
          <div className="divide-y divide-outline-variant/30">
            {ticketsEjemplo.map((ticket) => (
              <div key={ticket.id} className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${prioridadConfig[ticket.prioridad]}`}>{ticket.prioridad}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${ticketEstadoConfig[ticket.estado].color}`}>{ticketEstadoConfig[ticket.estado].label}</span>
                </div>
                <p className="font-bold text-on-surface text-sm">{ticket.titulo}</p>
                <p className="text-xs text-on-surface-variant mt-1">{ticket.org}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-5">
          <h2 className="font-extrabold text-on-surface mb-4">Acciones rápidas</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Crear institución', icon: 'add_business', path: '/admin/instituciones' },
              { label: 'Planes', icon: 'workspace_premium', path: '/admin/planes' },
              { label: 'Roles y permisos', icon: 'admin_panel_settings', path: '/admin/roles' },
              { label: 'Configuración', icon: 'settings', path: '/admin/config' },
              { label: 'Auditoría', icon: 'fact_check', path: '/admin/auditoria' },
              { label: 'Soporte', icon: 'support_agent', path: '/admin/soporte' },
            ].map((action) => (
              <Link key={action.label} to={action.path}
                className="flex items-center gap-3 p-3 rounded-xl border-2 border-surface-container-high hover:border-primary/30 hover:bg-primary/5 transition-all">
                <span className="material-symbols-outlined text-primary text-lg">{action.icon}</span>
                <span className="text-sm font-bold text-on-surface">{action.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
