import { useState } from 'react';

type EstadoEmprendedor = 'activo' | 'riesgo' | 'completado' | 'inactivo';

interface Emprendedor {
  id: string;
  nombre: string;
  negocio: string;
  cohorte: string;
  mentor: string;
  estado: EstadoEmprendedor;
  avance: number;
  cursosCompletados: number;
  cursosTotal: number;
  documentosPendientes: number;
  ultimaActividad: string;
  hitos: string[];
}

const emprendedores: Emprendedor[] = [
  { id: '1', nombre: 'Pedro Martinez', negocio: 'Pyme Demo Chile', cohorte: 'Emprendimiento Juvenil 2026', mentor: 'Carlos Ruiz', estado: 'activo', avance: 78, cursosCompletados: 12, cursosTotal: 18, documentosPendientes: 1, ultimaActividad: 'Hace 2 horas', hitos: ['Inscripcion SII', 'Plan de negocio'] },
  { id: '2', nombre: 'Laura Diaz', negocio: 'Artesanias Laura', cohorte: 'Emprendimiento Juvenil 2026', mentor: 'Sin asignar', estado: 'riesgo', avance: 45, cursosCompletados: 6, cursosTotal: 18, documentosPendientes: 3, ultimaActividad: 'Hace 5 dias', hitos: [] },
  { id: '3', nombre: 'Roberto Sanchez', negocio: 'Tech Solutions', cohorte: 'Innovacion Digital', mentor: 'Ana Morales', estado: 'activo', avance: 92, cursosCompletados: 16, cursosTotal: 18, documentosPendientes: 0, ultimaActividad: 'Ayer', hitos: ['Inscripcion SII', 'Plan de negocio', 'Marca INAPI'] },
  { id: '4', nombre: 'Maria Lopez', negocio: 'Eco Foods', cohorte: 'Innovacion Digital', mentor: 'Jorge Pena', estado: 'activo', avance: 65, cursosCompletados: 9, cursosTotal: 18, documentosPendientes: 2, ultimaActividad: 'Hace 2 dias', hitos: ['Plan de negocio'] },
  { id: '5', nombre: 'Juan Carlos Vega', negocio: 'Transporte Vega', cohorte: 'Sostenibilidad Local', mentor: 'Sofia Reyes', estado: 'completado', avance: 100, cursosCompletados: 18, cursosTotal: 18, documentosPendientes: 0, ultimaActividad: 'Hace 1 semana', hitos: ['Inscripcion SII', 'Plan de negocio', 'Marca INAPI', 'Certificacion'] },
  { id: '6', nombre: 'Camila Rojas', negocio: 'EcoTextil', cohorte: 'Sostenibilidad Local', mentor: 'Carlos Ruiz', estado: 'activo', avance: 55, cursosCompletados: 7, cursosTotal: 18, documentosPendientes: 2, ultimaActividad: 'Hace 3 dias', hitos: ['Plan de negocio'] },
  { id: '7', nombre: 'Felipe Torres', negocio: 'FoodTech', cohorte: 'Innovacion Digital', mentor: 'Ana Morales', estado: 'inactivo', avance: 20, cursosCompletados: 3, cursosTotal: 18, documentosPendientes: 4, ultimaActividad: 'Hace 2 semanas', hitos: [] },
];

const cohortes = ['Todas', 'Emprendimiento Juvenil 2026', 'Innovacion Digital', 'Sostenibilidad Local'];

const estadoConfig: Record<EstadoEmprendedor, { label: string; color: string }> = {
  activo: { label: 'Activo', color: 'bg-success-container text-on-success-container' },
  riesgo: { label: 'En riesgo', color: 'bg-error-container text-on-error-container' },
  completado: { label: 'Completado', color: 'bg-info-container text-on-info-container' },
  inactivo: { label: 'Inactivo', color: 'bg-surface-container text-on-surface-variant' },
};

export default function CoordEmprendedores() {
  const [cohorteFiltro, setCohorteFiltro] = useState('Todas');
  const [busqueda, setBusqueda] = useState('');

  const filtrados = emprendedores.filter(e => {
    const coincideCohorte = cohorteFiltro === 'Todas' || e.cohorte === cohorteFiltro;
    const coincideBusqueda = e.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      e.negocio.toLowerCase().includes(busqueda.toLowerCase());
    return coincideCohorte && coincideBusqueda;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-3xl text-success">groups</span>
          <h1 className="text-2xl font-extrabold text-on-surface">Emprendedores</h1>
        </div>
        <button className="flex items-center gap-2 px-5 py-2.5 bg-primary text-inverse-on-surface font-bold rounded-xl hover:bg-primary/90 transition-colors">
          <span className="material-symbols-outlined text-lg">person_add</span>
          Agregar Emprendedor
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Buscar por nombre o negocio..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="flex-1 p-3 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none transition-all"
        />
        <div className="flex gap-2 overflow-x-auto">
          {cohortes.map((c) => (
            <button
              key={c}
              onClick={() => setCohorteFiltro(c)}
              className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                cohorteFiltro === c
                  ? 'bg-primary text-inverse-on-surface'
                  : 'bg-surface-container-high text-on-surface-variant hover:bg-primary/10'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Estadisticas rapidas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Activos', value: emprendedores.filter(e => e.estado === 'activo').length, color: 'text-success' },
          { label: 'En riesgo', value: emprendedores.filter(e => e.estado === 'riesgo').length, color: 'text-error' },
          { label: 'Completados', value: emprendedores.filter(e => e.estado === 'completado').length, color: 'text-info' },
          { label: 'Con documentos pend.', value: emprendedores.filter(e => e.documentosPendientes > 0).length, color: 'text-warning' },
        ].map((stat) => (
          <div key={stat.label} className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/30 text-center">
            <p className={`text-2xl font-extrabold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-on-surface-variant mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Lista de emprendedores */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
        <div className="divide-y divide-outline-variant/30">
          {filtrados.map((empre) => (
            <div key={empre.id} className="p-5 hover:bg-surface-container-low/50 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-success-container text-on-success-container text-sm font-extrabold">
                    {empre.nombre[0]}
                  </div>
                  <div>
                    <p className="font-extrabold text-on-surface">{empre.nombre}</p>
                    <p className="text-sm text-on-surface-variant">{empre.negocio}</p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${estadoConfig[empre.estado].color}`}>
                  {estadoConfig[empre.estado].label}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-outline">Cohorte</p>
                  <p className="font-bold text-on-surface truncate">{empre.cohorte}</p>
                </div>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-outline">Mentor</p>
                  <p className={`font-bold truncate ${empre.mentor === 'Sin asignar' ? 'text-warning' : 'text-on-surface'}`}>{empre.mentor}</p>
                </div>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-outline">Cursos</p>
                  <p className="font-bold text-on-surface">{empre.cursosCompletados}/{empre.cursosTotal}</p>
                </div>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-outline">Docs. pendientes</p>
                  <p className={`font-bold ${empre.documentosPendientes > 0 ? 'text-warning' : 'text-success'}`}>{empre.documentosPendientes}</p>
                </div>
              </div>

              {/* Barra de avance */}
              <div className="mb-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-on-surface-variant">Avance general</span>
                  <span className="font-bold text-on-surface">{empre.avance}%</span>
                </div>
                <div className="w-full bg-surface-container-high rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full ${empre.estado === 'riesgo' ? 'bg-error' : empre.estado === 'completado' ? 'bg-info' : 'bg-success'}`} style={{ width: `${empre.avance}%` }} />
                </div>
              </div>

              {/* Hitos */}
              {empre.hitos.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {empre.hitos.map((hito) => (
                    <span key={hito} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary">
                      {hito}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-outline-variant/30">
                <span className="text-xs text-on-surface-variant">Ultima actividad: {empre.ultimaActividad}</span>
                <div className="flex gap-2">
                  {empre.mentor === 'Sin asignar' && (
                    <button className="px-3 py-1.5 text-xs font-bold text-warning border border-warning/30 rounded-lg hover:bg-warning-container transition-colors">
                      Asignar mentor
                    </button>
                  )}
                  <button className="px-3 py-1.5 text-xs font-bold text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">
                    Ver detalle
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
