import { useState } from 'react';

const participantes = [
  { id: '1', nombre: 'Pedro Martínez', email: 'pedro@demo.cl', rubro: 'Comercio', region: 'Metropolitana', estado: 'activo' as const, cohortes: ['EJ-2026-01'], mentor: 'Carlos Ruiz', avance: 78, formalizado: true },
  { id: '2', nombre: 'Laura Díaz', email: 'laura@demo.cl', rubro: 'Artesanías', region: 'Valparaíso', estado: 'activo' as const, cohortes: ['EJ-2026-01'], mentor: 'Carlos Ruiz', avance: 45, formalizado: false },
  { id: '3', nombre: 'Roberto Sánchez', email: 'roberto@demo.cl', rubro: 'Tecnología', region: 'Metropolitana', estado: 'activo' as const, cohortes: ['ID-2026-01'], mentor: 'Ana Silva', avance: 92, formalizado: true },
  { id: '4', nombre: 'María López', email: 'maria.l@demo.cl', rubro: 'Alimentos', region: 'Biobío', estado: 'activo' as const, cohortes: ['EJ-2026-02'], mentor: 'Luis Torres', avance: 65, formalizado: true },
  { id: '5', nombre: 'Juan Carlos Vega', email: 'jvega@demo.cl', rubro: 'Transporte', region: 'Metropolitana', estado: 'completado' as const, cohortes: ['EJ-2026-01'], mentor: 'Carlos Ruiz', avance: 100, formalizado: true },
  { id: '6', nombre: 'Ana Rodríguez', email: 'ana.r@demo.cl', rubro: 'Servicios', region: 'O\'Higgins', estado: 'activo' as const, cohortes: ['ID-2026-01'], mentor: 'Ana Silva', avance: 38, formalizado: false },
  { id: '7', nombre: 'Felipe Torres', email: 'ftorres@demo.cl', rubro: 'Construcción', region: 'Metropolitana', estado: 'inactivo' as const, cohortes: [], mentor: null, avance: 0, formalizado: false },
  { id: '8', nombre: 'Carolina Soto', email: 'csoto@demo.cl', rubro: 'Alimentos', region: 'Araucanía', estado: 'activo' as const, cohortes: ['SL-2026-01'], mentor: 'Luis Torres', avance: 55, formalizado: false },
  { id: '9', nombre: 'Diego Muñoz', email: 'dmunoz@demo.cl', rubro: 'Tecnología', region: 'Metropolitana', estado: 'activo' as const, cohortes: ['ID-2026-01'], mentor: 'Ana Silva', avance: 71, formalizado: true },
  { id: '10', nombre: 'Valentina Reyes', email: 'vreyes@demo.cl', rubro: 'Retail', region: 'Valparaíso', estado: 'activo' as const, cohortes: ['EJ-2026-02'], mentor: 'Luis Torres', avance: 29, formalizado: false },
];

const regiones = ['Todas', 'Metropolitana', 'Valparaíso', 'Biobío', 'O\'Higgins', 'Araucanía'];
const rubros = ['Todos', 'Comercio', 'Artesanías', 'Tecnología', 'Alimentos', 'Transporte', 'Servicios', 'Construcción', 'Retail'];
const estados = ['Todos', 'activo', 'inactivo', 'completado'];

const estadoConfig: Record<string, { label: string; color: string }> = {
  activo: { label: 'Activo', color: 'bg-success-container text-on-success-container' },
  inactivo: { label: 'Inactivo', color: 'bg-surface-container text-on-surface-variant' },
  completado: { label: 'Completado', color: 'bg-info-container text-on-info-container' },
};

export default function InstComunidad() {
  const [busqueda, setBusqueda] = useState('');
  const [filtroRegion, setFiltroRegion] = useState('Todas');
  const [filtroRubro, setFiltroRubro] = useState('Todos');
  const [filtroEstado, setFiltroEstado] = useState('Todos');
  const [vista, setVista] = useState<'tabla' | 'cards'>('tabla');

  const filtrados = participantes.filter((p) => {
    const matchBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || p.email.toLowerCase().includes(busqueda.toLowerCase());
    const matchRegion = filtroRegion === 'Todas' || p.region === filtroRegion;
    const matchRubro = filtroRubro === 'Todos' || p.rubro === filtroRubro;
    const matchEstado = filtroEstado === 'Todos' || p.estado === filtroEstado;
    return matchBusqueda && matchRegion && matchRubro && matchEstado;
  });

  const stats = {
    total: participantes.length,
    activos: participantes.filter(p => p.estado === 'activo').length,
    formalizados: participantes.filter(p => p.formalizado).length,
    conMentor: participantes.filter(p => p.mentor).length,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-3xl text-info">diversity_3</span>
          <div>
            <h1 className="text-2xl font-extrabold text-on-surface">Comunidad</h1>
            <p className="text-on-surface-variant">{stats.total} participantes registrados</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-outline-variant/30 text-sm font-bold text-on-surface-variant hover:bg-surface-container-low transition-colors">
            <span className="material-symbols-outlined text-lg">upload_file</span>
            Importar
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-primary text-inverse-on-surface font-bold rounded-xl hover:bg-primary/90 transition-colors">
            <span className="material-symbols-outlined text-lg">person_add</span>
            Agregar
          </button>
        </div>
      </div>

      {/* Stats resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats.total, icon: 'groups', color: 'bg-info' },
          { label: 'Activos', value: stats.activos, icon: 'check_circle', color: 'bg-success' },
          { label: 'Formalizados', value: stats.formalizados, icon: 'verified', color: 'bg-teal' },
          { label: 'Con Mentor', value: stats.conMentor, icon: 'school', color: 'bg-info' },
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
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Buscar por nombre o email..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full p-3 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none transition-all text-sm"
            />
          </div>
          <select
            value={filtroRegion}
            onChange={(e) => setFiltroRegion(e.target.value)}
            className="p-3 rounded-xl border-2 border-surface-container-high outline-none text-sm font-bold"
          >
            {regiones.map(r => <option key={r}>{r}</option>)}
          </select>
          <select
            value={filtroRubro}
            onChange={(e) => setFiltroRubro(e.target.value)}
            className="p-3 rounded-xl border-2 border-surface-container-high outline-none text-sm font-bold"
          >
            {rubros.map(r => <option key={r}>{r}</option>)}
          </select>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="p-3 rounded-xl border-2 border-surface-container-high outline-none text-sm font-bold"
          >
            {estados.map(e => <option key={e}>{e}</option>)}
          </select>
          <div className="flex rounded-xl border-2 border-surface-container-high overflow-hidden">
            <button
              onClick={() => setVista('tabla')}
              className={`px-3 py-2 text-sm font-bold transition-colors ${vista === 'tabla' ? 'bg-primary text-inverse-on-surface' : 'hover:bg-surface-container-high'}`}
            >
              <span className="material-symbols-outlined text-lg">table_rows</span>
            </button>
            <button
              onClick={() => setVista('cards')}
              className={`px-3 py-2 text-sm font-bold transition-colors ${vista === 'cards' ? 'bg-primary text-inverse-on-surface' : 'hover:bg-surface-container-high'}`}
            >
              <span className="material-symbols-outlined text-lg">grid_view</span>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 text-xs text-on-surface-variant">
          <span className="font-bold">{filtrados.length}</span> resultado{filtrados.length !== 1 ? 's' : ''}
          {(busqueda || filtroRegion !== 'Todas' || filtroRubro !== 'Todos' || filtroEstado !== 'Todos') && (
            <button
              onClick={() => { setBusqueda(''); setFiltroRegion('Todas'); setFiltroRubro('Todos'); setFiltroEstado('Todos'); }}
              className="ml-2 text-primary font-bold hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Vista tabla */}
      {vista === 'tabla' && (
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-outline-variant/30">
                  <th className="text-left p-4 text-xs font-extrabold text-on-surface-variant uppercase tracking-wider">Nombre</th>
                  <th className="text-left p-4 text-xs font-extrabold text-on-surface-variant uppercase tracking-wider">Rubro</th>
                  <th className="text-left p-4 text-xs font-extrabold text-on-surface-variant uppercase tracking-wider">Región</th>
                  <th className="text-left p-4 text-xs font-extrabold text-on-surface-variant uppercase tracking-wider">Cohorte</th>
                  <th className="text-left p-4 text-xs font-extrabold text-on-surface-variant uppercase tracking-wider">Mentor</th>
                  <th className="text-left p-4 text-xs font-extrabold text-on-surface-variant uppercase tracking-wider">Avance</th>
                  <th className="text-left p-4 text-xs font-extrabold text-on-surface-variant uppercase tracking-wider">Estado</th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {filtrados.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-info-container text-on-info-container text-sm font-extrabold shrink-0">
                          {p.nombre[0]}
                        </div>
                        <div>
                          <p className="font-bold text-on-surface text-sm">{p.nombre}</p>
                          <p className="text-xs text-on-surface-variant">{p.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-on-surface-variant">{p.rubro}</td>
                    <td className="p-4 text-sm text-on-surface-variant">{p.region}</td>
                    <td className="p-4">
                      {p.cohortes.length > 0 ? p.cohortes.map(c => (
                        <span key={c} className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-info-container text-on-info-container mr-1">{c}</span>
                      )) : <span className="text-xs text-on-surface-variant">—</span>}
                    </td>
                    <td className="p-4 text-sm text-on-surface-variant">{p.mentor ?? '—'}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-surface-container-high rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${p.avance >= 80 ? 'bg-success' : p.avance >= 50 ? 'bg-info' : p.avance > 0 ? 'bg-warning' : 'bg-surface-container-highest'}`}
                            style={{ width: `${p.avance}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-on-surface-variant">{p.avance}%</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${estadoConfig[p.estado].color}`}>
                        {estadoConfig[p.estado].label}
                      </span>
                    </td>
                    <td className="p-4">
                      <button className="p-1.5 rounded-lg hover:bg-surface-container-high transition-colors">
                        <span className="material-symbols-outlined text-on-surface-variant text-lg">more_vert</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtrados.length === 0 && (
            <div className="p-12 text-center">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant/30">search_off</span>
              <p className="mt-3 text-on-surface-variant font-bold">No se encontraron resultados</p>
              <p className="text-sm text-on-surface-variant">Intenta ajustar los filtros de búsqueda</p>
            </div>
          )}
        </div>
      )}

      {/* Vista cards */}
      {vista === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtrados.map((p) => (
            <div key={p.id} className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/30 hover:border-primary/30 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-info-container text-on-info-container text-sm font-extrabold">
                    {p.nombre[0]}
                  </div>
                  <div>
                    <p className="font-extrabold text-on-surface">{p.nombre}</p>
                    <p className="text-xs text-on-surface-variant">{p.email}</p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${estadoConfig[p.estado].color}`}>
                  {estadoConfig[p.estado].label}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-on-surface-variant mb-3">
                <div><span className="font-bold">Rubro:</span> {p.rubro}</div>
                <div><span className="font-bold">Región:</span> {p.region}</div>
                <div><span className="font-bold">Mentor:</span> {p.mentor ?? '—'}</div>
                <div><span className="font-bold">Formalizado:</span> {p.formalizado ? 'Sí' : 'No'}</div>
              </div>
              {p.cohortes.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {p.cohortes.map(c => (
                    <span key={c} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-info-container text-on-info-container">{c}</span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-surface-container-high rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${p.avance >= 80 ? 'bg-success' : p.avance >= 50 ? 'bg-info' : p.avance > 0 ? 'bg-warning' : 'bg-surface-container-highest'}`}
                    style={{ width: `${p.avance}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-on-surface-variant">{p.avance}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
