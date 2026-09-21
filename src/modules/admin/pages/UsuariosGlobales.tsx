import { useState, useEffect, useCallback } from 'react';
import { api } from '../../../lib/api';

const PAGE_SIZE = 20;

const ROLES_CREABLES = [
  { value: 'admin_institucional', label: 'Admin Institucional' },
  { value: 'coordinador', label: 'Coordinador' },
  { value: 'mentor', label: 'Mentor' },
  { value: 'emprendedor', label: 'Emprendedor' },
  { value: 'dueño', label: 'Dueño' },
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'gestor', label: 'Gestor' },
  { value: 'encargado_rrhh', label: 'Enc. RRHH' },
  { value: 'empleado', label: 'Empleado' },
  { value: 'contador_externo', label: 'Contador' },
];

const MEMBRESIAS = [
  { value: 'free', label: 'Gratis' },
  { value: 'pro', label: 'Pro' },
  { value: 'premium', label: 'Premium' },
] as const;

const membresiaConfig: Record<string, { label: string; color: string }> = {
  free: { label: 'Gratis', color: 'bg-slate-100 text-slate-600' },
  pro: { label: 'Pro', color: 'bg-amber-100 text-amber-700' },
  premium: { label: 'Premium', color: 'bg-indigo-100 text-indigo-700' },
};

const rolConfig: Record<string, { label: string; color: string; icon: string }> = {
  superadmin: { label: 'Super Admin', color: 'bg-red-100 text-red-700', icon: 'shield' },
  admin_institucional: { label: 'Admin Institucional', color: 'bg-purple-100 text-purple-700', icon: 'admin_panel_settings' },
  coordinador: { label: 'Coordinador', color: 'bg-blue-100 text-blue-700', icon: 'supervisor_account' },
  mentor: { label: 'Mentor', color: 'bg-teal-100 text-teal-700', icon: 'school' },
  emprendedor: { label: 'Emprendedor', color: 'bg-green-100 text-green-700', icon: 'storefront' },
  dueño: { label: 'Dueño', color: 'bg-green-100 text-green-700', icon: 'storefront' },
  vendedor: { label: 'Vendedor', color: 'bg-orange-100 text-orange-700', icon: 'point_of_sale' },
  gestor: { label: 'Gestor', color: 'bg-cyan-100 text-cyan-700', icon: 'manage_accounts' },
  encargado_rrhh: { label: 'Enc. RRHH', color: 'bg-pink-100 text-pink-700', icon: 'badge' },
  empleado: { label: 'Empleado', color: 'bg-slate-100 text-slate-700', icon: 'person' },
  contador_externo: { label: 'Contador', color: 'bg-amber-100 text-amber-700', icon: 'calculate' },
};

export default function UsuariosGlobales() {
  const [usuarios, setUsuarios] = useState<Record<string, unknown>[]>([]);
  const [instituciones, setInstituciones] = useState<Record<string, string>[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [busqueda, setBusqueda] = useState('');
  const [filtroRol, setFiltroRol] = useState('todos');
  const [filtroInst, setFiltroInst] = useState('todas');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [showCrear, setShowCrear] = useState(false);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [nuevoUsuario, setNuevoUsuario] = useState({
    nombre_completo: '',
    email: '',
    password: '',
    rol: 'emprendedor',
    institucion_id: '',
    membresia_nivel: 'premium' as 'free' | 'pro' | 'premium',
  });

  const fetchInstituciones = useCallback(async () => {
    try {
      const { data } = await api.getInstituciones();
      setInstituciones((data ?? []) as unknown as Record<string, string>[]);
    } catch (err) {
      console.error('Error cargando instituciones:', err);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.getRolCounts();
      setStats(data ?? {});
    } catch (err) {
      console.error('Error cargando stats:', err);
    }
  }, []);

  const fetchUsuarios = useCallback(async () => {
    setLoading(true);

    const params: Record<string, string> = {
      page: String(page + 1),
      pageSize: String(PAGE_SIZE),
      sort: 'created_at',
      dir: 'desc',
      excluir_superadmin: '1',
    };
    if (filtroRol !== 'todos') params.rol = filtroRol;
    if (filtroInst !== 'todas') params.institucion_id = filtroInst;
    if (busqueda) params.busqueda = busqueda;

    try {
      const res = await api.getPerfiles(params);
      setUsuarios(res.data as unknown as Record<string, unknown>[]);
      setTotal(res.total);
      setHasMore(res.hasMore);
    } catch (err) {
      console.error('Error cargando usuarios:', err);
    }
    setLoading(false);
  }, [busqueda, filtroRol, filtroInst, page]);

  useEffect(() => { fetchInstituciones(); fetchStats(); }, [fetchInstituciones, fetchStats]);
  useEffect(() => { fetchUsuarios(); }, [fetchUsuarios]);
  useEffect(() => { setPage(0); }, [busqueda, filtroRol, filtroInst]);

  const getInstName = (id: string) => instituciones.find(i => i.id === id)?.nombre ?? '—';

  const crearUsuario = async () => {
    setError('');
    setExito('');
    if (!nuevoUsuario.nombre_completo.trim() || !nuevoUsuario.email.trim() || !nuevoUsuario.password) {
      setError('Nombre, email y contraseña son obligatorios.');
      return;
    }
    if (nuevoUsuario.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setCreando(true);
    try {
      await api.crearUsuario({
        email: nuevoUsuario.email.trim(),
        password: nuevoUsuario.password,
        nombre_completo: nuevoUsuario.nombre_completo.trim(),
        rol: nuevoUsuario.rol,
        institucion_id: nuevoUsuario.institucion_id || null,
        membresia: nuevoUsuario.membresia_nivel,
        activo: true,
      });
    } catch (err) {
      setCreando(false);
      setError(err instanceof Error ? err.message : 'No se pudo crear el usuario.');
      return;
    }
    setCreando(false);
    setExito(`Usuario ${nuevoUsuario.email.trim()} creado con membresía ${
      membresiaConfig[nuevoUsuario.membresia_nivel].label
    }.`);
    setNuevoUsuario({ nombre_completo: '', email: '', password: '', rol: 'emprendedor', institucion_id: '', membresia_nivel: 'premium' });
    fetchUsuarios();
    fetchStats();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-3xl text-blue-500">group</span>
          <div>
            <h1 className="text-2xl font-extrabold text-on-surface">Todos los Usuarios</h1>
            <p className="text-on-surface-variant">{total} usuarios en {instituciones.length} instituciones</p>
          </div>
        </div>
        <button
          onClick={() => { setError(''); setExito(''); setShowCrear(true); }}
          className="flex items-center gap-2 px-5 py-3 bg-primary text-white rounded-2xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
        >
          <span className="material-symbols-outlined text-lg">person_add</span>
          Crear usuario
        </button>
      </div>

      {/* Stats por rol */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(rolConfig).filter(([k]) => stats[k] > 0).map(([key, config]) => (
          <button
            key={key}
            onClick={() => setFiltroRol(filtroRol === key ? 'todos' : key)}
            className={`bg-surface-container-lowest rounded-2xl p-4 border transition-all text-left ${
              filtroRol === key ? 'border-primary/40 shadow-md' : 'border-outline-variant/30 hover:border-primary/20'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${config.color}`}>{stats[key] || 0}</span>
              <span className="material-symbols-outlined text-on-surface-variant text-sm">{config.icon}</span>
            </div>
            <p className="text-xs font-bold text-on-surface-variant">{config.label}</p>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="flex-1 min-w-[200px] p-3 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none transition-all text-sm"
          />
          <select value={filtroInst} onChange={(e) => setFiltroInst(e.target.value)} className="p-3 rounded-xl border-2 border-surface-container-high outline-none text-sm font-bold">
            <option value="todas">Todas las instituciones</option>
            {instituciones.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
          </select>
          <div className="text-xs text-on-surface-variant font-bold">
            {total} resultado{total !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-outline-variant/30">
                <th className="text-left p-4 text-xs font-extrabold text-on-surface-variant uppercase tracking-wider">Usuario</th>
                <th className="text-left p-4 text-xs font-extrabold text-on-surface-variant uppercase tracking-wider">Rol</th>
                <th className="text-left p-4 text-xs font-extrabold text-on-surface-variant uppercase tracking-wider">Membresía</th>
                <th className="text-left p-4 text-xs font-extrabold text-on-surface-variant uppercase tracking-wider">Institución</th>
                <th className="text-left p-4 text-xs font-extrabold text-on-surface-variant uppercase tracking-wider">Estado</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center text-on-surface-variant">Cargando...</td></tr>
              ) : usuarios.map((u) => (
                <tr key={u.id as string} className="hover:bg-surface-container-low/50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-sm font-extrabold shrink-0">
                        {(u.nombre_completo as string)?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <p className="font-bold text-on-surface text-sm">{u.nombre_completo as string}</p>
                        <p className="text-xs text-on-surface-variant">{u.email as string}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${rolConfig[u.rol as string]?.color ?? 'bg-slate-100 text-slate-600'}`}>
                      {rolConfig[u.rol as string]?.label ?? u.rol as string}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${membresiaConfig[(u.membresia_nivel as string) ?? 'free']?.color ?? 'bg-slate-100 text-slate-600'}`}>
                      {membresiaConfig[(u.membresia_nivel as string) ?? 'free']?.label ?? (u.membresia_nivel as string) ?? 'Gratis'}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-on-surface-variant">
                    {getInstName(u.institucion_id as string)}
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      u.activo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1">
                      <button className="p-1.5 rounded-lg hover:bg-surface-container-high transition-colors" title="Editar">
                        <span className="material-symbols-outlined text-on-surface-variant text-lg">edit</span>
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-surface-container-high transition-colors" title="Cambiar rol">
                        <span className="material-symbols-outlined text-on-surface-variant text-lg">swap_horiz</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && usuarios.length === 0 && (
          <div className="p-12 text-center">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/30">person_off</span>
            <p className="mt-3 text-on-surface-variant font-bold">No se encontraron usuarios</p>
          </div>
        )}
      </div>

      {/* Paginación */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-on-surface-variant">
            Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total}
          </p>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="px-4 py-2 rounded-xl border-2 border-surface-container-high text-sm font-bold disabled:opacity-40 hover:bg-surface-container-high transition-colors"
            >
              Anterior
            </button>
            <button
              disabled={!hasMore}
              onClick={() => setPage(p => p + 1)}
              className="px-4 py-2 rounded-xl border-2 border-surface-container-high text-sm font-bold disabled:opacity-40 hover:bg-surface-container-high transition-colors"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* Modal: Crear usuario */}
      {showCrear && (
        <div className="fixed inset-0 bg-scrim/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-outline-variant/30 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-on-surface">Crear usuario</h3>
              <button onClick={() => setShowCrear(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              {exito && (
                <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 rounded-xl px-3 py-2">
                  <span className="material-symbols-outlined text-base">check_circle</span> {exito}
                </p>
              )}
              {error && (
                <p className="flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2">
                  <span className="material-symbols-outlined text-base">error</span> {error}
                </p>
              )}
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Nombre completo</label>
                <input
                  type="text"
                  value={nuevoUsuario.nombre_completo}
                  onChange={e => setNuevoUsuario({ ...nuevoUsuario, nombre_completo: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-primary outline-none bg-surface-container-lowest text-on-surface"
                  placeholder="Ej: María González"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Email</label>
                <input
                  type="email"
                  value={nuevoUsuario.email}
                  onChange={e => setNuevoUsuario({ ...nuevoUsuario, email: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-primary outline-none bg-surface-container-lowest text-on-surface"
                  placeholder="usuario@correo.cl"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Contraseña</label>
                <input
                  type="password"
                  value={nuevoUsuario.password}
                  onChange={e => setNuevoUsuario({ ...nuevoUsuario, password: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-primary outline-none bg-surface-container-lowest text-on-surface"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Rol</label>
                <select
                  value={nuevoUsuario.rol}
                  onChange={e => setNuevoUsuario({ ...nuevoUsuario, rol: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-primary outline-none bg-surface-container-lowest text-on-surface"
                >
                  {ROLES_CREABLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Institución</label>
                <select
                  value={nuevoUsuario.institucion_id}
                  onChange={e => setNuevoUsuario({ ...nuevoUsuario, institucion_id: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-primary outline-none bg-surface-container-lowest text-on-surface"
                >
                  <option value="">Sin institución</option>
                  {instituciones.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Membresía</label>
                <select
                  value={nuevoUsuario.membresia_nivel}
                  onChange={e => setNuevoUsuario({ ...nuevoUsuario, membresia_nivel: e.target.value as 'free' | 'pro' | 'premium' })}
                  className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-primary outline-none bg-surface-container-lowest text-on-surface"
                >
                  {MEMBRESIAS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3 shrink-0">
              <button onClick={() => setShowCrear(false)} className="flex-1 py-3 rounded-2xl border-2 border-outline-variant/50 font-bold text-on-surface-variant">Cancelar</button>
              <button
                onClick={crearUsuario}
                disabled={creando}
                className="flex-1 py-3 rounded-2xl bg-primary text-white font-bold shadow-lg shadow-primary/20 disabled:opacity-50"
              >
                {creando ? 'Creando...' : 'Crear usuario'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
