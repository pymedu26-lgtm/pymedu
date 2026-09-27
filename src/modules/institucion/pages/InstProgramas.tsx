import { useState } from 'react';

const programasData = [
  {
    id: 'p1', nombre: 'Emprendimiento Juvenil', descripcion: 'Programa de formación integral para emprendedores jóvenes entre 18 y 30 años.',
    coordinador: 'María González', estado: 'activo' as const, fechaInicio: '01 Mar 2026', fechaFin: '30 Nov 2026',
    cohortes: [
      { id: 'c1', nombre: 'EJ-2026-01', emprendedores: 18, mentorAsignados: 4, avance: 72, estado: 'activa', fechaInicio: '01 Mar 2026', fechaFin: '30 Jun 2026' },
      { id: 'c2', nombre: 'EJ-2026-02', emprendedores: 20, mentorAsignados: 3, avance: 55, estado: 'activa', fechaInicio: '01 May 2026', fechaFin: '30 Sep 2026' },
    ],
    modulos: ['Finanzas', 'Legal', 'Marketing Digital', 'Gestión de Personas'],
  },
  {
    id: 'p2', nombre: 'Innovación Digital', descripcion: 'Capacitación en transformación digital y herramientas tecnológicas para PYMES.',
    coordinador: 'Ana Silva', estado: 'activo' as const, fechaInicio: '15 Abr 2026', fechaFin: '15 Dic 2026',
    cohortes: [
      { id: 'c3', nombre: 'ID-2026-01', emprendedores: 22, mentorAsignados: 4, avance: 45, estado: 'activa', fechaInicio: '15 Abr 2026', fechaFin: '15 Ago 2026' },
    ],
    modulos: ['Herramientas Digitales', 'E-commerce', 'Analítica de Datos', 'Automatización'],
  },
  {
    id: 'p3', nombre: 'Sostenibilidad Local', descripcion: 'Emprendimiento sostenible y economía circular para negocios locales.',
    coordinador: 'María González', estado: 'activo' as const, fechaInicio: '01 Jun 2026', fechaFin: '30 Nov 2026',
    cohortes: [
      { id: 'c4', nombre: 'SL-2026-01', emprendedores: 8, mentorAsignados: 2, avance: 90, estado: 'activa', fechaInicio: '01 Jun 2026', fechaFin: '30 Sep 2026' },
    ],
    modulos: ['Economía Circular', 'Certificaciones Verdes', 'Marketing Verde'],
  },
];

const coordinadores = ['María González', 'Ana Silva', 'Luis Torres'];

export default function InstProgramas() {
  const [busqueda, setBusqueda] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showNuevo, setShowNuevo] = useState(false);

  const filtrados = programasData.filter(p =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.coordinador.toLowerCase().includes(busqueda.toLowerCase())
  );

  const stats = {
    total: programasData.length,
    activos: programasData.filter(p => p.estado === 'activo').length,
    cohortes: programasData.reduce((a, p) => a + p.cohortes.length, 0),
    emprendedores: programasData.reduce((a, p) => a + p.cohortes.reduce((b, c) => b + c.emprendedores, 0), 0),
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-3xl text-teal">school</span>
          <div>
            <h1 className="text-2xl font-extrabold text-on-surface">Programas y Cohortes</h1>
            <p className="text-on-surface-variant">{stats.total} programas · {stats.cohortes} cohortes activas</p>
          </div>
        </div>
        <button
          onClick={() => setShowNuevo(!showNuevo)}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-inverse-on-surface font-bold rounded-xl hover:bg-primary/90 transition-colors"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          Nuevo Programa
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Programas', value: stats.total, icon: 'school', color: 'bg-teal' },
          { label: 'Activos', value: stats.activos, icon: 'check_circle', color: 'bg-success' },
          { label: 'Cohortes', value: stats.cohortes, icon: 'group_work', color: 'bg-info' },
          { label: 'Emprendedores', value: stats.emprendedores, icon: 'groups', color: 'bg-info' },
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

      {/* Formulario nuevo programa */}
      {showNuevo && (
        <div className="bg-surface-container-lowest rounded-2xl border-2 border-primary/30 p-6 space-y-4">
          <h2 className="font-extrabold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">add_circle</span>
            Crear Nuevo Programa
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1">Nombre del programa</label>
              <input type="text" placeholder="Ej: Emprendimiento Rural" className="w-full p-3 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none transition-all text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1">Coordinador asignado</label>
              <select className="w-full p-3 rounded-xl border-2 border-surface-container-high outline-none text-sm">
                <option value="">Seleccionar coordinador</option>
                {coordinadores.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1">Fecha de inicio</label>
              <input type="date" className="w-full p-3 rounded-xl border-2 border-surface-container-high outline-none text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1">Fecha de cierre</label>
              <input type="date" className="w-full p-3 rounded-xl border-2 border-surface-container-high outline-none text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-on-surface-variant mb-1">Descripción</label>
              <textarea rows={2} placeholder="Descripción breve del programa..." className="w-full p-3 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none transition-all text-sm resize-none" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowNuevo(false)} className="px-4 py-2 rounded-xl text-sm font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors">
              Cancelar
            </button>
            <button className="px-5 py-2 bg-primary text-inverse-on-surface font-bold rounded-xl hover:bg-primary/90 transition-colors text-sm">
              Crear Programa
            </button>
          </div>
        </div>
      )}

      {/* Búsqueda */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-4">
        <input
          type="text"
          placeholder="Buscar programa o coordinador..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full p-3 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none transition-all text-sm"
        />
      </div>

      {/* Lista de programas */}
      <div className="space-y-4">
        {filtrados.map((prog) => (
          <div key={prog.id} className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
            {/* Header del programa */}
            <div
              className="p-5 cursor-pointer hover:bg-surface-container-low/50 transition-colors"
              onClick={() => setExpanded(expanded === prog.id ? null : prog.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-extrabold text-on-surface">{prog.nombre}</h3>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-success-container text-on-success-container">
                      {prog.estado}
                    </span>
                  </div>
                  <p className="text-sm text-on-surface-variant mb-2">{prog.descripcion}</p>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-on-surface-variant">
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">person</span>
                      {prog.coordinador}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">calendar_today</span>
                      {prog.fechaInicio} — {prog.fechaFin}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">group_work</span>
                      {prog.cohortes.length} cohorte{prog.cohortes.length > 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">groups</span>
                      {prog.cohortes.reduce((a, c) => a + c.emprendedores, 0)} emprendedores
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right hidden md:block">
                    <p className="text-2xl font-extrabold text-on-surface">
                      {Math.round(prog.cohortes.reduce((a, c) => a + c.avance * c.emprendedores, 0) / prog.cohortes.reduce((a, c) => a + c.emprendedores, 0))}%
                    </p>
                    <p className="text-xs text-on-surface-variant">avance global</p>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">
                    {expanded === prog.id ? 'expand_less' : 'expand_more'}
                  </span>
                </div>
              </div>
            </div>

            {/* Detalle expandido */}
            {expanded === prog.id && (
              <div className="border-t border-outline-variant/30 p-5 space-y-4">
                {/* Módulos */}
                <div>
                  <h4 className="text-sm font-extrabold text-on-surface mb-2 flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-teal">view_module</span>
                    Módulos del Programa
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {prog.modulos.map((mod, i) => (
                      <span key={i} className="px-3 py-1.5 rounded-xl text-xs font-bold bg-teal-container text-on-teal-container border border-teal/30">
                        {mod}
                      </span>
                    ))}
                    <button className="px-3 py-1.5 rounded-xl text-xs font-bold border-2 border-dashed border-surface-container-high text-on-surface-variant hover:border-primary/30 hover:text-primary transition-colors">
                      + Agregar módulo
                    </button>
                  </div>
                </div>

                {/* Cohortes */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-extrabold text-on-surface flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm text-info">group_work</span>
                      Cohortes
                    </h4>
                    <button className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border-2 border-primary/30 text-primary hover:bg-primary/5 transition-colors">
                      <span className="material-symbols-outlined text-sm">add</span>
                      Nueva Cohorte
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {prog.cohortes.map((coh) => (
                      <div key={coh.id} className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/20">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-on-surface text-sm">{coh.nombre}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              coh.estado === 'activa' ? 'bg-success-container text-on-success-container' : 'bg-surface-container text-on-surface-variant'
                            }`}>
                              {coh.estado}
                            </span>
                          </div>
                          <span className="text-sm font-bold text-on-surface-variant">{coh.avance}%</span>
                        </div>
                        <div className="w-full bg-surface-container-high rounded-full h-2 mb-2">
                          <div
                            className={`h-2 rounded-full ${coh.avance >= 80 ? 'bg-success' : coh.avance >= 50 ? 'bg-info' : 'bg-warning'}`}
                            style={{ width: `${coh.avance}%` }}
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs text-on-surface-variant">
                          <div>
                            <span className="font-bold">{coh.emprendedores}</span> emprendedores
                          </div>
                          <div>
                            <span className="font-bold">{coh.mentorAsignados}</span> mentores
                          </div>
                          <div className="text-right">{coh.fechaInicio}</div>
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          <button className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-outline-variant/30 hover:bg-surface-container-high transition-colors">
                            Editar
                          </button>
                          <button className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-outline-variant/30 hover:bg-surface-container-high transition-colors">
                            Asignar Mentor
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
