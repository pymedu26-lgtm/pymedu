import { useState } from 'react';

const organizaciones = [
  { id: 'o1', nombre: 'Municipalidad de Santiago', codigo: 'MUNI-SCL', tipo: 'Municipalidad', plan: 'Premium', usuarios: 128, emprendedores: 63, coord: 4, mentores: 8, estado: 'activa' as const, fechaCreacion: '01 Ene 2026', region: 'Metropolitana', modulos: ['ERP', 'Academia', 'Mentoría', 'Comunidad'] },
  { id: 'o2', nombre: 'Incubadora Innova', codigo: 'INNOVA-01', tipo: 'Incubadora', plan: 'Profesional', usuarios: 85, emprendedores: 42, coord: 3, mentores: 6, estado: 'activa' as const, fechaCreacion: '15 Feb 2026', region: 'Valparaíso', modulos: ['ERP', 'Academia', 'Mentoría'] },
  { id: 'o3', nombre: 'Universidad Católica', codigo: 'UC-001', tipo: 'Universidad', plan: 'Premium', usuarios: 210, emprendedores: 95, coord: 6, mentores: 12, estado: 'activa' as const, fechaCreacion: '01 Mar 2026', region: 'Metropolitana', modulos: ['ERP', 'Academia', 'Mentoría', 'Comunidad', 'Laboratorio'] },
  { id: 'o4', nombre: 'Fundación Emprende', codigo: 'FE-CHI', tipo: 'Fundación', plan: 'Básico', usuarios: 34, emprendedores: 18, coord: 1, mentores: 2, estado: 'activa' as const, fechaCreacion: '20 Abr 2026', region: 'Biobío', modulos: ['Academia'] },
  { id: 'o5', nombre: 'Municipalidad de Temuco', codigo: 'MUNI-TEM', tipo: 'Municipalidad', plan: 'Profesional', usuarios: 78, emprendedores: 35, coord: 2, mentores: 5, estado: 'suspendida' as const, fechaCreacion: '01 Mar 2026', region: 'Araucanía', modulos: ['ERP', 'Academia', 'Mentoría'] },
  { id: 'o6', nombre: 'Sello Verde SpA', codigo: 'SELLO-V', tipo: 'Empresa', plan: 'Básico', usuarios: 12, emprendedores: 8, coord: 1, mentores: 1, estado: 'activa' as const, fechaCreacion: '10 Jul 2026', region: 'O\'Higgins', modulos: ['Academia'] },
];

const tipoConfig: Record<string, { color: string; icon: string }> = {
  Municipalidad: { color: 'bg-info-container text-on-info-container', icon: 'location_city' },
  Incubadora: { color: 'bg-success-container text-on-success-container', icon: 'rocket_launch' },
  Universidad: { color: 'bg-info-container text-on-info-container', icon: 'school' },
  Fundación: { color: 'bg-warning-container text-on-warning-container', icon: 'volunteer_activism' },
  Empresa: { color: 'bg-teal-container text-on-teal-container', icon: 'business' },
};

export default function InstitucionesList() {
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [showCrear, setShowCrear] = useState(false);

  const filtrados = organizaciones.filter(o => {
    const matchBusqueda = o.nombre.toLowerCase().includes(busqueda.toLowerCase()) || o.codigo.toLowerCase().includes(busqueda.toLowerCase());
    const matchTipo = filtroTipo === 'todos' || o.tipo === filtroTipo;
    const matchEstado = filtroEstado === 'todos' || o.estado === filtroEstado;
    return matchBusqueda && matchTipo && matchEstado;
  });

  const stats = {
    total: organizaciones.length,
    activas: organizaciones.filter(o => o.estado === 'activa').length,
    suspendidas: organizaciones.filter(o => o.estado === 'suspendida').length,
    usuarios: organizaciones.reduce((a, o) => a + o.usuarios, 0),
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-3xl text-info">apartment</span>
          <div>
            <h1 className="text-2xl font-extrabold text-on-surface">Organizaciones</h1>
            <p className="text-on-surface-variant">{stats.total} organizaciones · {stats.activas} activas · {stats.suspendidas} suspendidas</p>
          </div>
        </div>
        <button
          onClick={() => setShowCrear(!showCrear)}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-inverse-on-surface font-bold rounded-xl hover:bg-primary/90 transition-colors"
        >
          <span className="material-symbols-outlined text-lg">add_business</span>
          Nueva Organización
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats.total, icon: 'apartment', color: 'bg-info' },
          { label: 'Activas', value: stats.activas, icon: 'check_circle', color: 'bg-success' },
          { label: 'Suspendidas', value: stats.suspendidas, icon: 'block', color: 'bg-error' },
          { label: 'Usuarios', value: stats.usuarios, icon: 'group', color: 'bg-info' },
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

      {/* Formulario crear */}
      {showCrear && (
        <div className="bg-surface-container-lowest rounded-2xl border-2 border-primary/30 p-6 space-y-4">
          <h2 className="font-extrabold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">add_business</span>
            Crear Nueva Organización
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-on-surface-variant mb-1">Nombre</label>
              <input type="text" placeholder="Nombre de la organización" className="w-full p-3 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none transition-all text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1">Código único</label>
              <input type="text" placeholder="EJ: MUNI-001" className="w-full p-3 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none transition-all text-sm uppercase" />
            </div>
            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1">Tipo</label>
              <select className="w-full p-3 rounded-xl border-2 border-surface-container-high outline-none text-sm">
                {Object.keys(tipoConfig).map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1">Plan</label>
              <select className="w-full p-3 rounded-xl border-2 border-surface-container-high outline-none text-sm">
                <option>Básico</option>
                <option>Profesional</option>
                <option>Premium</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1">Región</label>
              <select className="w-full p-3 rounded-xl border-2 border-surface-container-high outline-none text-sm">
                <option>Metropolitana</option>
                <option>Valparaíso</option>
                <option>Biobío</option>
                <option>O'Higgins</option>
                <option>Araucanía</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-on-surface-variant mb-1">Módulos habilitados</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {['ERP', 'Academia', 'Mentoría', 'Comunidad', 'Laboratorio'].map((mod) => (
                  <label key={mod} className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-surface-container-high hover:border-primary/30 cursor-pointer transition-colors text-sm">
                    <input type="checkbox" className="rounded" defaultChecked={mod === 'Academia'} />
                    {mod}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCrear(false)} className="px-4 py-2 rounded-xl text-sm font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors">Cancelar</button>
            <button className="px-5 py-2 bg-primary text-inverse-on-surface font-bold rounded-xl hover:bg-primary/90 transition-colors text-sm">Crear Organización</button>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Buscar por nombre o código..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="flex-1 min-w-[200px] p-3 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none transition-all text-sm"
          />
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="p-3 rounded-xl border-2 border-surface-container-high outline-none text-sm font-bold">
            <option value="todos">Todos los tipos</option>
            {Object.keys(tipoConfig).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="p-3 rounded-xl border-2 border-surface-container-high outline-none text-sm font-bold">
            <option value="todos">Todos los estados</option>
            <option value="activa">Activa</option>
            <option value="suspendida">Suspendida</option>
          </select>
        </div>
      </div>

      {/* Lista */}
      <div className="space-y-4">
        {filtrados.map((org) => (
          <div key={org.id} className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-5 hover:border-primary/20 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-4">
                <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${tipoConfig[org.tipo].color}`}>
                  <span className="material-symbols-outlined">{tipoConfig[org.tipo].icon}</span>
                </span>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-extrabold text-on-surface">{org.nombre}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      org.estado === 'activa' ? 'bg-success-container text-on-success-container' : 'bg-error-container text-on-error-container'
                    }`}>
                      {org.estado}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-container-high text-on-surface-variant">
                      {org.plan}
                    </span>
                  </div>
                  <p className="text-sm text-on-surface-variant">Código: {org.codigo} · {org.tipo} · {org.region}</p>
                  <div className="flex items-center gap-4 text-xs text-on-surface-variant mt-1">
                    <span>{org.usuarios} usuarios</span>
                    <span>{org.emprendedores} emprendedores</span>
                    <span>{org.coord} coordinadores</span>
                    <span>{org.mentores} mentores</span>
                    <span>Creada: {org.fechaCreacion}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button className="p-2 rounded-lg hover:bg-surface-container-high transition-colors" title="Editar">
                  <span className="material-symbols-outlined text-on-surface-variant">edit</span>
                </button>
                <button className="p-2 rounded-lg hover:bg-surface-container-high transition-colors" title="Configurar módulos">
                  <span className="material-symbols-outlined text-on-surface-variant">extension</span>
                </button>
                {org.estado === 'activa' ? (
                  <button className="p-2 rounded-lg hover:bg-warning-container transition-colors" title="Suspender">
                    <span className="material-symbols-outlined text-warning">block</span>
                  </button>
                ) : (
                  <button className="p-2 rounded-lg hover:bg-success-container transition-colors" title="Reactivar">
                    <span className="material-symbols-outlined text-success">check_circle</span>
                  </button>
                )}
                <button className="p-2 rounded-lg hover:bg-error-container transition-colors" title="Eliminar">
                  <span className="material-symbols-outlined text-error">delete</span>
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {org.modulos.map((mod) => (
                <span key={mod} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-container text-on-teal-container">{mod}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
