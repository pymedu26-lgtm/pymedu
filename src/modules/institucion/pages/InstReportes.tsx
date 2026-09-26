import { useState } from 'react';

const reportes = [
  {
    id: 'r1', categoria: 'cobertura' as const, titulo: 'Cobertura y Crecimiento de la Comunidad',
    descripcion: 'Participantes totales, nuevos ingresos, tasa de crecimiento mensual.',
    icon: 'groups', color: 'bg-blue-500',
    metrics: [
      { label: 'Participantes totales', value: '128' },
      { label: 'Nuevos este mes', value: '18' },
      { label: 'Tasa de crecimiento', value: '+16%' },
      { label: 'Regiones cubiertas', value: '5' },
    ],
  },
  {
    id: 'r2', categoria: 'participacion' as const, titulo: 'Participación y Actividad por Programa',
    descripcion: 'Sesiones asistidas, tareas completadas, interacciones por cohorte.',
    icon: 'insights', color: 'bg-teal-500',
    metrics: [
      { label: 'Sesiones este mes', value: '234' },
      { label: 'Asistencia promedio', value: '82%' },
      { label: 'Tareas completadas', value: '156' },
      { label: 'Interacciones totales', value: '1.2k' },
    ],
  },
  {
    id: 'r3', categoria: 'progreso' as const, titulo: 'Progreso Formativo y Módulos Completados',
    descripcion: 'Avance promedio, módulos terminados, certificaciones emitidas.',
    icon: 'school', color: 'bg-green-500',
    metrics: [
      { label: 'Avance promedio', value: '64%' },
      { label: 'Módulos completados', value: '312' },
      { label: 'Certificaciones emitidas', value: '15' },
      { label: 'Tiempo promedio', value: '4.2 meses' },
    ],
  },
  {
    id: 'r4', categoria: 'financiera' as const, titulo: 'Salud Financiera Agregada de Emprendedores',
    descripcion: 'Ingresos promedio, punto de equilibrio, IVA declarado.',
    icon: 'account_balance', color: 'bg-purple-500',
    metrics: [
      { label: 'Ingreso promedio mensual', value: '$2.4M' },
      { label: 'En punto de equilibrio', value: '68%' },
      { label: 'Declaraciones IVA al día', value: '72%' },
      { label: 'Cuentas por cobrar', value: '$8.2M' },
    ],
  },
  {
    id: 'r5', categoria: 'formalizacion' as const, titulo: 'Formalización y Estado Legal',
    descripcion: 'Negocios formalizados, RUT activo, permisos municipales.',
    icon: 'verified', color: 'bg-amber-500',
    metrics: [
      { label: 'Formalizados', value: '67%' },
      { label: 'Con RUT activo', value: '82%' },
      { label: 'Con permiso municipal', value: '58%' },
      { label: 'Trámites en curso', value: '12' },
    ],
  },
  {
    id: 'r6', categoria: 'retencion' as const, titulo: 'Retención y Deserción',
    descripcion: 'Tasa de retención, abandonos, motivos de deserción.',
    icon: 'person_off', color: 'bg-red-500',
    metrics: [
      { label: 'Tasa de retención', value: '89%' },
      { label: 'Desertores este mes', value: '3' },
      { label: 'Reactivaciones', value: '2' },
      { label: 'Motivo #1 de deserción', value: 'Falta de tiempo' },
    ],
  },
];

const categoriaConfig: Record<string, { color: string; bg: string }> = {
  cobertura: { color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
  participacion: { color: 'text-teal-600', bg: 'bg-teal-50 border-teal-200' },
  progreso: { color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
  financiera: { color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
  formalizacion: { color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  retencion: { color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
};

const meses = ['Julio 2026', 'Junio 2026', 'Mayo 2026', 'Abril 2026', 'Marzo 2026'];

export default function InstReportes() {
  const [mesSeleccionado, setMesSeleccionado] = useState('Julio 2026');
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-3xl text-indigo-500">analytics</span>
          <div>
            <h1 className="text-2xl font-extrabold text-on-surface">Reportes Institucionales</h1>
            <p className="text-on-surface-variant">Vista global del desempeño de la institución</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={mesSeleccionado}
            onChange={(e) => setMesSeleccionado(e.target.value)}
            className="p-3 rounded-xl border-2 border-surface-container-high outline-none text-sm font-bold"
          >
            {meses.map(m => <option key={m}>{m}</option>)}
          </select>
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-outline-variant/30 text-sm font-bold text-on-surface-variant hover:bg-surface-container-low transition-colors">
            <span className="material-symbols-outlined text-lg">download</span>
            Exportar
          </button>
        </div>
      </div>

      {/* Resumen general */}
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-6 text-white">
        <h2 className="font-extrabold text-lg mb-4">Resumen General — {mesSeleccionado}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Cobertura', value: '78%', trend: '+5%' },
            { label: 'Participación', value: '82%', trend: '+3%' },
            { label: 'Avance Global', value: '64%', trend: '+8%' },
            { label: 'Retención', value: '89%', trend: '+1%' },
          ].map((item) => (
            <div key={item.label} className="bg-white/15 rounded-xl p-4 backdrop-blur-sm">
              <p className="text-sm font-bold text-white/70">{item.label}</p>
              <p className="text-2xl font-extrabold">{item.value}</p>
              <p className="text-xs text-white/60 mt-1">{item.trend} vs mes anterior</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tarjetas de reporte */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportes.map((rep) => (
          <div
            key={rep.id}
            className={`bg-surface-container-lowest rounded-2xl border overflow-hidden cursor-pointer transition-all ${
              expanded === rep.id ? 'border-primary/40 shadow-lg' : 'border-outline-variant/30 hover:border-primary/20'
            }`}
            onClick={() => setExpanded(expanded === rep.id ? null : rep.id)}
          >
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${rep.color} text-white`}>
                    <span className="material-symbols-outlined">{rep.icon}</span>
                  </span>
                  <div>
                    <span className={`text-[10px] font-extrabold uppercase tracking-wider ${categoriaConfig[rep.categoria].color}`}>
                      {rep.categoria}
                    </span>
                    <h3 className="font-extrabold text-on-surface text-sm">{rep.titulo}</h3>
                  </div>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant text-lg">
                  {expanded === rep.id ? 'expand_less' : 'expand_more'}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mb-4">{rep.descripcion}</p>
              <div className="grid grid-cols-2 gap-3">
                {rep.metrics.map((m, i) => (
                  <div key={i} className={`rounded-xl p-3 border ${categoriaConfig[rep.categoria].bg}`}>
                    <p className="text-xs font-bold text-on-surface-variant">{m.label}</p>
                    <p className="text-lg font-extrabold text-on-surface">{m.value}</p>
                  </div>
                ))}
              </div>
            </div>
            {expanded === rep.id && (
              <div className="border-t border-outline-variant/30 p-5 space-y-3">
                <h4 className="text-sm font-extrabold text-on-surface">Detalle del Reporte</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-on-surface-variant">Período:</span>
                    <span className="font-bold text-on-surface">{mesSeleccionado}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-on-surface-variant">Última actualización:</span>
                    <span className="font-bold text-on-surface">25 Jul 2026</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-on-surface-variant">Datos incluidos:</span>
                    <span className="font-bold text-on-surface">128 participantes</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button className="flex-1 px-3 py-2 rounded-xl text-xs font-bold border border-outline-variant/30 hover:bg-surface-container-high transition-colors flex items-center justify-center gap-1">
                    <span className="material-symbols-outlined text-sm">visibility</span>
                    Ver completo
                  </button>
                  <button className="flex-1 px-3 py-2 rounded-xl text-xs font-bold bg-primary text-white hover:bg-primary/90 transition-colors flex items-center justify-center gap-1">
                    <span className="material-symbols-outlined text-sm">download</span>
                    Exportar PDF
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
