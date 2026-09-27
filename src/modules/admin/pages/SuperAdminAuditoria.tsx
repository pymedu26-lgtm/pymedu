import { useState } from 'react';

const logs = [
  { id: 'l1', fecha: '25 Jul 2026 14:32:18', usuario: 'Carlos Mendoza', accion: 'login', modulo: 'Auth', detalle: 'Inicio de sesion exitoso', ip: '190.45.12.34', nivel: 'info' as const },
  { id: 'l2', fecha: '25 Jul 2026 14:28:05', usuario: 'María González', accion: 'crear_usuario', modulo: 'Usuarios', detalle: 'Creó cuenta de emprendedor: Pedro Martinez', ip: '190.45.12.34', nivel: 'info' as const },
  { id: 'l3', fecha: '25 Jul 2026 14:15:42', usuario: 'Sistema', accion: 'backup', modulo: 'Sistema', detalle: 'Backup automatico completado (2.4GB)', ip: '—', nivel: 'info' as const },
  { id: 'l4', fecha: '25 Jul 2026 13:55:11', usuario: 'Carlos Mendoza', accion: 'modificar_plan', modulo: 'Planes', detalle: 'Plan de U. Católica actualizado: Profesional → Premium', ip: '190.45.12.34', nivel: 'warning' as const },
  { id: 'l5', fecha: '25 Jul 2026 13:20:30', usuario: 'Sistema', accion: 'error', modulo: 'API', detalle: 'Rate limit excedido por IP 200.34.56.78 (500 req/min)', ip: '200.34.56.78', nivel: 'error' as const },
  { id: 'l6', fecha: '25 Jul 2026 12:45:00', usuario: 'Ana Silva', accion: 'login', modulo: 'Auth', detalle: 'Inicio de sesion exitoso', ip: '190.45.12.50', nivel: 'info' as const },
  { id: 'l7', fecha: '25 Jul 2026 12:10:22', usuario: 'Carlos Mendoza', accion: 'suspender_org', modulo: 'Organizaciones', detalle: 'Municipalidad de Temuco suspendida por pago vencido', ip: '190.45.12.34', nivel: 'warning' as const },
  { id: 'l8', fecha: '25 Jul 2026 11:30:00', usuario: 'Sistema', accion: 'alerta', modulo: 'Monitoreo', detalle: 'Uso de CPU superó 80% por 5 minutos', ip: '—', nivel: 'error' as const },
  { id: 'l9', fecha: '25 Jul 2026 10:15:45', usuario: 'Carlos Mendoza', accion: 'habilitar_modulo', modulo: 'Modulos', detalle: 'Modulo Laboratorio habilitado para Universidad Catolica', ip: '190.45.12.34', nivel: 'info' as const },
  { id: 'l10', fecha: '25 Jul 2026 09:00:00', usuario: 'Sistema', accion: 'cron', modulo: 'Tareas', detalle: 'Tarea programada: limpieza de sesiones expiradas (48 eliminadas)', ip: '—', nivel: 'info' as const },
  { id: 'l11', fecha: '24 Jul 2026 23:45:12', usuario: 'Sistema', accion: 'backup', modulo: 'Sistema', detalle: 'Backup nocturno completado', ip: '—', nivel: 'info' as const },
  { id: 'l12', fecha: '24 Jul 2026 22:10:33', usuario: 'Desconocido', accion: 'login_fallido', modulo: 'Auth', detalle: '3 intentos fallidos de login para admin@pymedu.cl', ip: '102.34.56.78', nivel: 'error' as const },
];

const nivelConfig: Record<string, { color: string; icon: string }> = {
  info: { color: 'bg-info-container text-on-info-container', icon: 'info' },
  warning: { color: 'bg-warning-container text-on-warning-container', icon: 'warning' },
  error: { color: 'bg-error-container text-on-error-container', icon: 'error' },
};

const moduloConfig: Record<string, { color: string }> = {
  Auth: { color: 'bg-info-container text-on-info-container' },
  Usuarios: { color: 'bg-info-container text-on-info-container' },
  Sistema: { color: 'bg-surface-container text-on-surface-variant' },
  Planes: { color: 'bg-warning-container text-on-warning-container' },
  API: { color: 'bg-error-container text-on-error-container' },
  Organizaciones: { color: 'bg-success-container text-on-success-container' },
  Modulos: { color: 'bg-teal-container text-on-teal-container' },
  Monitoreo: { color: 'bg-error-container text-on-error-container' },
  Tareas: { color: 'bg-surface-container text-on-surface-variant' },
};

export default function SuperAdminAuditoria() {
  const [filtroNivel, setFiltroNivel] = useState('todos');
  const [filtroModulo, setFiltroModulo] = useState('todos');
  const [busqueda, setBusqueda] = useState('');

  const modulos = [...new Set(logs.map(l => l.modulo))];

  const filtrados = logs.filter(l => {
    const matchBusqueda = l.usuario.toLowerCase().includes(busqueda.toLowerCase()) || l.detalle.toLowerCase().includes(busqueda.toLowerCase());
    const matchNivel = filtroNivel === 'todos' || l.nivel === filtroNivel;
    const matchModulo = filtroModulo === 'todos' || l.modulo === filtroModulo;
    return matchBusqueda && matchNivel && matchModulo;
  });

  const stats = {
    total: logs.length,
    info: logs.filter(l => l.nivel === 'info').length,
    warnings: logs.filter(l => l.nivel === 'warning').length,
    errors: logs.filter(l => l.nivel === 'error').length,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-3xl text-on-surface-variant">fact_check</span>
          <div>
            <h1 className="text-2xl font-extrabold text-on-surface">Auditoria y Logs</h1>
            <p className="text-on-surface-variant">Trazabilidad completa de acciones en la plataforma</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-outline-variant/30 text-sm font-bold text-on-surface-variant hover:bg-surface-container-low transition-colors">
          <span className="material-symbols-outlined text-lg">download</span>
          Exportar logs
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total eventos', value: stats.total, icon: 'receipt_long', color: 'bg-outline' },
          { label: 'Informativos', value: stats.info, icon: 'info', color: 'bg-info' },
          { label: 'Advertencias', value: stats.warnings, icon: 'warning', color: 'bg-warning' },
          { label: 'Errores', value: stats.errors, icon: 'error', color: 'bg-error' },
        ].map((stat) => (
          <div key={stat.label} className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/30">
            <div className="flex items-center gap-2 mb-2">
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${stat.color} text-inverse-on-surface`}>
                <span className="material-symbols-outlined text-lg">{stat.icon}</span>
              </span>
              <span className="text-xs font-bold text-on-surface-variant">{stat.label}</span>
            </div>
            <p className="text-2xl font-extrabold text-on-surface">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Buscar por usuario o accion..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="flex-1 min-w-[200px] p-3 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none transition-all text-sm"
          />
          <select value={filtroNivel} onChange={(e) => setFiltroNivel(e.target.value)} className="p-3 rounded-xl border-2 border-surface-container-high outline-none text-sm font-bold">
            <option value="todos">Todos los niveles</option>
            <option value="info">Informativo</option>
            <option value="warning">Advertencia</option>
            <option value="error">Error</option>
          </select>
          <select value={filtroModulo} onChange={(e) => setFiltroModulo(e.target.value)} className="p-3 rounded-xl border-2 border-surface-container-high outline-none text-sm font-bold">
            <option value="todos">Todos los modulos</option>
            {modulos.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <div className="text-xs text-on-surface-variant font-bold">
            {filtrados.length} eventos
          </div>
        </div>
      </div>

      {/* Timeline de logs */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
        <div className="divide-y divide-outline-variant/30">
          {filtrados.map((log) => (
            <div key={log.id} className="p-4 hover:bg-surface-container-low/50 transition-colors">
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center shrink-0 pt-1">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full ${nivelConfig[log.nivel].color}`}>
                    <span className="material-symbols-outlined text-lg">{nivelConfig[log.nivel].icon}</span>
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[10px] font-mono text-on-surface-variant">{log.fecha}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${moduloConfig[log.modulo]?.color ?? 'bg-surface-container text-on-surface-variant'}`}>
                      {log.modulo}
                    </span>
                    <span className="text-[10px] text-on-surface-variant">IP: {log.ip}</span>
                  </div>
                  <p className="font-bold text-on-surface text-sm">{log.usuario}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">{log.detalle}</p>
                </div>
                <button className="p-1.5 rounded-lg hover:bg-surface-container-high transition-colors shrink-0">
                  <span className="material-symbols-outlined text-on-surface-variant text-lg">open_in_new</span>
                </button>
              </div>
            </div>
          ))}
        </div>
        {filtrados.length === 0 && (
          <div className="p-12 text-center">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/30">search_off</span>
            <p className="mt-3 text-on-surface-variant font-bold">No se encontraron eventos</p>
          </div>
        )}
      </div>
    </div>
  );
}
