import { useState } from 'react';

const tickets = [
  { id: 'TK-001', titulo: 'Error al exportar reportes CSV', org: 'Municipalidad de Santiago', solicitante: 'María González', prioridad: 'alta' as const, estado: 'abierto' as const, categoria: 'bug', fecha: '25 Jul 2026', sla: '4 horas', slaRestante: '2h 15min' },
  { id: 'TK-002', titulo: 'Solicitud de nuevo modulo contable', org: 'Incubadora Innova', solicitante: 'Ana Silva', prioridad: 'media' as const, estado: 'en_progreso' as const, categoria: 'feature', fecha: '24 Jul 2026', sla: '24 horas', slaRestante: '18h 30min' },
  { id: 'TK-003', titulo: 'Lentitud en carga de cursos', org: 'Universidad Católica', solicitante: 'Diego Muñoz', prioridad: 'alta' as const, estado: 'abierto' as const, categoria: 'rendimiento', fecha: '25 Jul 2026', sla: '4 horas', slaRestante: '1h 45min' },
  { id: 'TK-004', titulo: 'No puede crear cohorte nueva', org: 'Fundación Emprende', solicitante: 'Carlos Ruiz', prioridad: 'media' as const, estado: 'en_progreso' as const, categoria: 'bug', fecha: '23 Jul 2026', sla: '24 horas', slaRestante: 'Resuelto' },
  { id: 'TK-005', titulo: 'Solicitud de acceso SSO', org: 'Universidad Católica', solicitante: 'Roberto Sánchez', prioridad: 'baja' as const, estado: 'abierto' as const, categoria: 'configuracion', fecha: '22 Jul 2026', sla: '72 horas', slaRestante: '48h' },
  { id: 'TK-006', titulo: 'Error en calculo de IVA', org: 'Municipalidad de Santiago', solicitante: 'Pedro Martínez', prioridad: 'alta' as const, estado: 'resuelto' as const, categoria: 'bug', fecha: '21 Jul 2026', sla: '4 horas', slaRestante: 'Resuelto en 1h 20min' },
];

const prioridadConfig: Record<string, { color: string; dot: string }> = {
  alta: { color: 'bg-error-container text-on-error-container', dot: 'bg-error' },
  media: { color: 'bg-warning-container text-on-warning-container', dot: 'bg-warning' },
  baja: { color: 'bg-surface-container text-on-surface-variant', dot: 'bg-outline' },
};

const estadoConfig: Record<string, { color: string; label: string; icon: string }> = {
  abierto: { color: 'bg-error-container text-on-error-container', label: 'Abierto', icon: 'radio_button_unchecked' },
  en_progreso: { color: 'bg-warning-container text-on-warning-container', label: 'En progreso', icon: 'pending' },
  resuelto: { color: 'bg-success-container text-on-success-container', label: 'Resuelto', icon: 'check_circle' },
};

const categoriaConfig: Record<string, { color: string; label: string }> = {
  bug: { color: 'bg-error-container text-on-error-container', label: 'Bug' },
  feature: { color: 'bg-info-container text-on-info-container', label: 'Feature' },
  rendimiento: { color: 'bg-warning-container text-on-warning-container', label: 'Rendimiento' },
  configuracion: { color: 'bg-info-container text-on-info-container', label: 'Configuracion' },
};

export default function SuperAdminSoporte() {
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroPrioridad, setFiltroPrioridad] = useState('todos');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtrados = tickets.filter(t => {
    const matchEstado = filtroEstado === 'todos' || t.estado === filtroEstado;
    const matchPrioridad = filtroPrioridad === 'todos' || t.prioridad === filtroPrioridad;
    return matchEstado && matchPrioridad;
  });

  const stats = {
    total: tickets.length,
    abiertos: tickets.filter(t => t.estado === 'abierto').length,
    enProgreso: tickets.filter(t => t.estado === 'en_progreso').length,
    resueltos: tickets.filter(t => t.estado === 'resuelto').length,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-3xl text-warning">support_agent</span>
          <div>
            <h1 className="text-2xl font-extrabold text-on-surface">Soporte y Tickets</h1>
            <p className="text-on-surface-variant">Gestion de incidencias, SLA y soporte tecnico avanzado</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-5 py-2.5 bg-primary text-inverse-on-surface font-bold rounded-xl hover:bg-primary/90 transition-colors">
          <span className="material-symbols-outlined text-lg">add</span>
          Nuevo Ticket
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats.total, icon: 'confirmation_number', color: 'bg-outline' },
          { label: 'Abiertos', value: stats.abiertos, icon: 'radio_button_unchecked', color: 'bg-error' },
          { label: 'En Progreso', value: stats.enProgreso, icon: 'pending', color: 'bg-warning' },
          { label: 'Resueltos', value: stats.resueltos, icon: 'check_circle', color: 'bg-success' },
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

      {/* SLA overview */}
      <div className="bg-gradient-to-br from-warning to-error rounded-2xl p-5 text-inverse-on-surface">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined">timer</span>
          <h2 className="font-extrabold">Estado de SLA</h2>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-inverse-on-surface/10 rounded-xl p-3 backdrop-blur-sm">
            <p className="text-xs font-bold text-inverse-on-surface/70">Cumplimiento SLA</p>
            <p className="text-2xl font-extrabold">94%</p>
          </div>
          <div className="bg-inverse-on-surface/10 rounded-xl p-3 backdrop-blur-sm">
            <p className="text-xs font-bold text-inverse-on-surface/70">Tiempo promedio respuesta</p>
            <p className="text-2xl font-extrabold">1.8h</p>
          </div>
          <div className="bg-inverse-on-surface/10 rounded-xl p-3 backdrop-blur-sm">
            <p className="text-xs font-bold text-inverse-on-surface/70">Tickets vencidos hoy</p>
            <p className="text-2xl font-extrabold">0</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl border-2 border-surface-container-high overflow-hidden">
            {[
              { value: 'todos', label: 'Todos' },
              { value: 'abierto', label: 'Abiertos' },
              { value: 'en_progreso', label: 'En progreso' },
              { value: 'resuelto', label: 'Resueltos' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFiltroEstado(opt.value)}
                className={`px-3 py-2 text-xs font-bold transition-colors ${
                  filtroEstado === opt.value ? 'bg-primary text-inverse-on-surface' : 'hover:bg-surface-container-high text-on-surface-variant'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <select value={filtroPrioridad} onChange={(e) => setFiltroPrioridad(e.target.value)} className="p-3 rounded-xl border-2 border-surface-container-high outline-none text-sm font-bold">
            <option value="todos">Todas las prioridades</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
          <span className="text-xs text-on-surface-variant font-bold">{filtrados.length} tickets</span>
        </div>
      </div>

      {/* Lista de tickets */}
      <div className="space-y-3">
        {filtrados.map((ticket) => (
          <div key={ticket.id} className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
            <div
              className="p-5 cursor-pointer hover:bg-surface-container-low/50 transition-colors"
              onClick={() => setExpanded(expanded === ticket.id ? null : ticket.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-xs font-mono font-bold text-on-surface-variant">{ticket.id}</span>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${prioridadConfig[ticket.prioridad].color}`}>
                        {ticket.prioridad}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${estadoConfig[ticket.estado].color}`}>
                        {estadoConfig[ticket.estado].label}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${categoriaConfig[ticket.categoria].color}`}>
                        {categoriaConfig[ticket.categoria].label}
                      </span>
                    </div>
                    <p className="font-extrabold text-on-surface">{ticket.titulo}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{ticket.org} · {ticket.solicitante} · {ticket.fecha}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0 ml-4">
                  <div className="text-right hidden md:block">
                    <p className="text-xs text-on-surface-variant">SLA</p>
                    <p className={`text-sm font-extrabold ${
                      ticket.slaRestante.includes('Resuelto') ? 'text-success' :
                      ticket.slaRestante.startsWith('1h') || ticket.slaRestante.startsWith('2h') ? 'text-error' : 'text-on-surface'
                    }`}>
                      {ticket.slaRestante}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">
                    {expanded === ticket.id ? 'expand_less' : 'expand_more'}
                  </span>
                </div>
              </div>
            </div>

            {expanded === ticket.id && (
              <div className="border-t border-outline-variant/30 p-5 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs font-bold text-on-surface-variant">Prioridad</p>
                    <p className="font-bold">{ticket.prioridad}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-on-surface-variant">Categoria</p>
                    <p className="font-bold">{ticket.categoria}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-on-surface-variant">SLA asignado</p>
                    <p className="font-bold">{ticket.sla}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-on-surface-variant">Tiempo restante</p>
                    <p className="font-bold">{ticket.slaRestante}</p>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1">Agregar nota interna</label>
                  <textarea rows={2} placeholder="Escribe una nota sobre este ticket..." className="w-full p-3 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none transition-all text-sm resize-none" />
                </div>
                <div className="flex items-center gap-2">
                  {ticket.estado === 'abierto' && (
                    <button className="px-4 py-2 rounded-xl text-sm font-bold bg-warning text-inverse-on-surface hover:bg-warning/90 transition-colors">
                      Tomar ticket
                    </button>
                  )}
                  {ticket.estado === 'en_progreso' && (
                    <button className="px-4 py-2 rounded-xl text-sm font-bold bg-success text-inverse-on-surface hover:bg-success/90 transition-colors">
                      Marcar resuelto
                    </button>
                  )}
                  <button className="px-4 py-2 rounded-xl text-sm font-bold border-2 border-outline-variant/30 hover:bg-surface-container-high transition-colors">
                    Escalar
                  </button>
                  <button className="px-4 py-2 rounded-xl text-sm font-bold border-2 border-outline-variant/30 hover:bg-surface-container-high transition-colors">
                    Asignar a...
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
