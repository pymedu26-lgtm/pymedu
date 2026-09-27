import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Emprendedor, emprendedores, EstadoCaso } from '../data';

interface Sesion {
  id: string;
  fecha: string;
  hora: string;
  tipo: string;
  tema: string;
  resumen: string;
  acuerdos: string[];
}

interface Tarea {
  id: string;
  descripcion: string;
  plazo: string;
  estado: 'pendiente' | 'completada';
  prioridad: 'alta' | 'media' | 'baja';
}

interface Nota {
  id: string;
  fecha: string;
  contenido: string;
  autor: string;
}

const sesionesBase: Sesion[] = [
  { id: 's1', fecha: '25 Jul 2026', hora: '10:00', tipo: 'Individual', tema: 'Revisión de inventario', resumen: 'Se revisó el sistema de control de stock actual. El emprendedor tiene problemas con productos de baja rotación.', acuerdos: ['Implementar clasificación ABC', 'Revisar stock cada 15 días', 'Eliminar productos sin movimiento en 3 meses'] },
  { id: 's2', fecha: '18 Jul 2026', hora: '14:00', tipo: 'Individual', tema: 'Plan de negocio', resumen: 'Se revisó el plan de negocio actualizado. Falta incluir proyección de flujo de caja a 12 meses.', acuerdos: ['Actualizar proyecciones financieras', 'Incluir análisis de competencia'] },
  { id: 's3', fecha: '11 Jul 2026', hora: '10:00', tipo: 'Individual', tema: 'Formalización SII', resumen: 'Se explicó el proceso de inscripción en SII y los documentos necesarios.', acuerdos: ['Recopilar documentos para SII', 'Agendar visita a SUCRE'] },
];

const tareasBase: Tarea[] = [
  { id: 't1', descripcion: 'Aplicar clasificación ABC al inventario', plazo: '01 Ago 2026', estado: 'pendiente', prioridad: 'alta' },
  { id: 't2', descripcion: 'Actualizar proyección de flujo de caja 12 meses', plazo: '05 Ago 2026', estado: 'pendiente', prioridad: 'media' },
  { id: 't3', descripcion: 'Recopilar documentos para inscripción SII', plazo: '10 Ago 2026', estado: 'pendiente', prioridad: 'media' },
  { id: 't4', descripcion: 'Revisar stock y eliminar productos sin movimiento', plazo: '15 Ago 2026', estado: 'pendiente', prioridad: 'baja' },
  { id: 't5', descripcion: 'Completar módulo de Presupuesto en Academia', plazo: '20 Jul 2026', estado: 'completada', prioridad: 'media' },
];

const prioridadConfig = {
  alta: { color: 'bg-error-container text-on-error-container', dot: 'bg-error' },
  media: { color: 'bg-warning-container text-on-warning-container', dot: 'bg-warning' },
  baja: { color: 'bg-surface-container text-on-surface-variant', dot: 'bg-outline' },
};

const estadoCasoConfig: Record<EstadoCaso, { label: string; color: string }> = {
  en_curso: { label: 'En curso', color: 'bg-info-container text-on-info-container' },
  riesgo: { label: 'En riesgo', color: 'bg-error-container text-on-error-container' },
  cerrado: { label: 'Cerrado', color: 'bg-surface-container text-on-surface-variant' },
};

const riesgoConfig = {
  bajo: { label: 'Bajo', color: 'bg-success-container text-on-success-container' },
  medio: { label: 'Medio', color: 'bg-warning-container text-on-warning-container' },
  alto: { label: 'Alto', color: 'bg-error-container text-on-error-container' },
};

function estadoCasoDesdeEmprendedor(e: Emprendedor | undefined): EstadoCaso {
  return e?.estado ?? 'en_curso';
}

function notasInicialesDel(e: Emprendedor | undefined): Nota[] {
  const nombre = e?.nombre ?? 'Emprendedor';
  return [
    { id: 'n1', fecha: '25 Jul 2026, 10:30', contenido: `${nombre} muestra buena disposición. ${e?.notas ?? ''}`.trim(), autor: 'Carlos Ruiz' },
    { id: 'n2', fecha: '18 Jul 2026, 14:45', contenido: 'El plan de negocio necesita trabajo en la parte financiera. No tiene claro el concepto de punto de equilibrio.', autor: 'Carlos Ruiz' },
  ];
}

export default function MentorSeguimiento() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { perfil } = useAuth();

  const emprendedor = emprendedores.find(e => e.id === id);

  const [tab, setTab] = useState<'sesiones' | 'tareas' | 'notas'>('sesiones');
  const [nuevaNota, setNuevaNota] = useState('');
  const [notas, setNotas] = useState<Nota[]>(() => notasInicialesDel(emprendedor));
  const [estadoCaso, setEstadoCaso] = useState<EstadoCaso>(() => estadoCasoDesdeEmprendedor(emprendedor));
  const [nuevaTarea, setNuevaTarea] = useState({ descripcion: '', plazo: '', prioridad: 'media' as 'alta' | 'media' | 'baja' });
  const [tareasState, setTareasState] = useState<Tarea[]>(tareasBase);

  const agregarNota = () => {
    if (!nuevaNota.trim()) return;
    const nota: Nota = {
      id: `n${Date.now()}`,
      fecha: new Date().toLocaleString('es-CL'),
      contenido: nuevaNota,
      autor: perfil?.nombre_completo ?? 'Mentor',
    };
    setNotas([nota, ...notas]);
    setNuevaNota('');
  };

  const toggleTarea = (id: string) => {
    setTareasState(tareasState.map(t =>
      t.id === id ? { ...t, estado: t.estado === 'pendiente' ? 'completada' : 'pendiente' } : t
    ));
  };

  const agregarTarea = () => {
    if (!nuevaTarea.descripcion.trim() || !nuevaTarea.plazo) return;
    const tarea: Tarea = {
      id: `t${Date.now()}`,
      descripcion: nuevaTarea.descripcion,
      plazo: nuevaTarea.plazo,
      estado: 'pendiente',
      prioridad: nuevaTarea.prioridad,
    };
    setTareasState([tarea, ...tareasState]);
    setNuevaTarea({ descripcion: '', plazo: '', prioridad: 'media' });
  };

  if (!emprendedor) {
    return (
      <div className="p-8 text-center max-w-xl mx-auto">
        <div className="w-20 h-20 bg-warning-container text-on-warning-container rounded-3xl flex items-center justify-center mx-auto mb-6">
          <span className="material-symbols-outlined text-4xl">person_off</span>
        </div>
        <h2 className="text-2xl font-black text-on-surface mb-2">Emprendedor no encontrado</h2>
        <p className="text-on-surface-variant mb-8">El caso que buscas no existe o ya no está asignado a ti.</p>
        <button
          onClick={() => navigate('/mentor/alumnos')}
          className="px-8 py-3 bg-inverse-surface text-inverse-on-surface rounded-2xl font-bold hover:bg-inverse-surface/90 transition-colors"
        >
          Volver a Mis Alumnos
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-3xl text-teal">assignment</span>
          <div>
            <h1 className="text-2xl font-extrabold text-on-surface">Seguimiento — {emprendedor.nombre}</h1>
            <p className="text-on-surface-variant">{emprendedor.negocio} · {emprendedor.rubro}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-on-surface-variant">Estado del caso:</span>
          <select
            value={estadoCaso}
            onChange={(e) => setEstadoCaso(e.target.value as EstadoCaso)}
            className="px-3 py-2 rounded-xl border-2 border-surface-container-high text-sm font-bold outline-none"
          >
            <option value="en_curso">En curso</option>
            <option value="riesgo">En riesgo</option>
            <option value="cerrado">Cerrado</option>
          </select>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${estadoCasoConfig[estadoCaso].color}`}>
            {estadoCasoConfig[estadoCaso].label}
          </span>
        </div>
      </div>

      {/* Resumen del emprendedor */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-outline mb-1">RUT</p>
          <p className="font-bold text-on-surface">{emprendedor.rut}</p>
        </div>
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-outline mb-1">Ubicación</p>
          <p className="font-bold text-on-surface">{emprendedor.region} · {emprendedor.comuna}</p>
        </div>
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-outline mb-1">Avance</p>
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 bg-surface-container-high rounded-full overflow-hidden">
              <div className="h-full bg-teal rounded-full" style={{ width: `${emprendedor.avance}%` }} />
            </div>
            <span className="font-bold text-on-surface text-sm">{emprendedor.avance}%</span>
          </div>
        </div>
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-outline mb-1">Riesgo</p>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${riesgoConfig[emprendedor.riesgo].color}`}>
            {riesgoConfig[emprendedor.riesgo].label}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-surface-container-lowest rounded-2xl p-2 border border-outline-variant/30">
        {([
          { key: 'sesiones', label: 'Sesiones', icon: 'event' },
          { key: 'tareas', label: 'Tareas', icon: 'task_alt' },
          { key: 'notas', label: 'Notas y Observaciones', icon: 'edit_note' },
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

      {/* Contenido Sesiones */}
      {tab === 'sesiones' && (
        <div className="space-y-4">
          {sesionesBase.map((sesion) => (
            <div key={sesion.id} className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
              <div className="p-5 border-b border-outline-variant/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-info">event</span>
                  <div>
                    <p className="font-extrabold text-on-surface">{sesion.tema}</p>
                    <p className="text-sm text-on-surface-variant">{sesion.fecha} · {sesion.hora} · {sesion.tipo}</p>
                  </div>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-outline mb-1">Resumen</p>
                  <p className="text-sm text-on-surface">{sesion.resumen}</p>
                </div>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-outline mb-2">Acuerdos y Próximos Pasos</p>
                  <ul className="space-y-1">
                    {sesion.acuerdos.map((acuerdo, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="material-symbols-outlined text-lg text-primary mt-0.5">check_circle</span>
                        <span className="text-on-surface">{acuerdo}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Contenido Tareas */}
      {tab === 'tareas' && (
        <div className="space-y-4">
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-5">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-outline mb-3">Nueva Tarea</p>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px_120px] gap-3">
              <input
                type="text"
                placeholder="Descripción de la tarea..."
                value={nuevaTarea.descripcion}
                onChange={(e) => setNuevaTarea({ ...nuevaTarea, descripcion: e.target.value })}
                className="p-3 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none text-sm"
              />
              <input
                type="text"
                placeholder="Plazo (ej: 01 Ago 2026)"
                value={nuevaTarea.plazo}
                onChange={(e) => setNuevaTarea({ ...nuevaTarea, plazo: e.target.value })}
                className="p-3 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none text-sm"
              />
              <div className="flex gap-2">
                <select
                  value={nuevaTarea.prioridad}
                  onChange={(e) => setNuevaTarea({ ...nuevaTarea, prioridad: e.target.value as 'alta' | 'media' | 'baja' })}
                  className="flex-1 p-3 rounded-xl border-2 border-surface-container-high outline-none text-sm"
                >
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
                <button
                  onClick={agregarTarea}
                  className="px-4 py-3 bg-primary text-inverse-on-surface rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">add</span>
                </button>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
            <div className="divide-y divide-outline-variant/30">
              {tareasState.map((tarea) => (
                <div key={tarea.id} className="p-4 flex items-center gap-4 hover:bg-surface-container-low/50 transition-colors">
                  <button
                    onClick={() => toggleTarea(tarea.id)}
                    className={`shrink-0 h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all ${
                      tarea.estado === 'completada'
                        ? 'bg-success border-success/50 text-inverse-on-surface'
                        : 'border-outline-variant hover:border-primary'
                    }`}
                  >
                    {tarea.estado === 'completada' && (
                      <span className="material-symbols-outlined text-sm">check</span>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold ${tarea.estado === 'completada' ? 'text-on-surface-variant line-through' : 'text-on-surface'}`}>
                      {tarea.descripcion}
                    </p>
                    <p className="text-xs text-on-surface-variant">Plazo: {tarea.plazo}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${prioridadConfig[tarea.prioridad].color}`}>
                    {tarea.prioridad}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Contenido Notas */}
      {tab === 'notas' && (
        <div className="space-y-4">
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-5">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-outline mb-3">Nueva Observación</p>
            <textarea
              value={nuevaNota}
              onChange={(e) => setNuevaNota(e.target.value)}
              placeholder="Escribe una observación, nota de caso o alerta..."
              rows={3}
              className="w-full p-4 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none text-sm resize-none"
            />
            <div className="flex justify-end mt-3">
              <button
                onClick={agregarNota}
                className="px-5 py-2.5 bg-primary text-inverse-on-surface font-bold rounded-xl text-sm hover:bg-primary/90 transition-colors"
              >
                Guardar nota
              </button>
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
            <div className="divide-y divide-outline-variant/30">
              {notas.map((nota) => (
                <div key={nota.id} className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-on-surface-variant">{nota.fecha}</span>
                    <span className="text-xs font-bold text-on-surface-variant">{nota.autor}</span>
                  </div>
                  <p className="text-sm text-on-surface leading-6">{nota.contenido}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}