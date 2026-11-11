import { useEffect, useMemo, useState } from 'react';
import { api, type PermisoApi, type RolApi } from '../lib/api';
import { cn } from '../lib/utils';
import { formatFecha } from '../lib/fechas';

type Ambito = RolApi['ambito'];
const ACCIONES = [['leer', 'Leer'], ['escribir', 'Escribir'], ['eliminar', 'Eliminar']] as const;
const ETIQUETA_AMBITO: Record<Ambito, string> = { plataforma: 'Plataforma', institucion: 'Institución', negocio: 'Negocio', proveedor: 'Proveedor' };
const APPS_POR_AMBITO: Record<Ambito, string[] | null> = { plataforma: null, institucion: null, negocio: ['erp'], proveedor: ['mentorias'] };

/**
 * Roles dinámicos (documento «Roles dinámicos»): matriz editable módulos × Leer/Escribir/Eliminar.
 * Reglas visibles en la UI (y validadas en el servidor): nadie otorga un permiso que no tiene,
 * un subrol solo puede quitar permisos de su padre y los roles de sistema no se editan.
 * Se usa en Superadmin → Roles y en ERP → Equipo (ámbito negocio).
 */
export default function GestorRoles({ ambitoInicial = 'plataforma', titulo = 'Roles y permisos', compacto = false }: { ambitoInicial?: Ambito; titulo?: string; compacto?: boolean }) {
  const [catalogo, setCatalogo] = useState<{ permisos: PermisoApi[]; modulos: Record<string, { label: string; icon: string }>; mios: Set<string> } | null>(null);
  const [roles, setRoles] = useState<RolApi[]>([]);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [historial, setHistorial] = useState<Awaited<ReturnType<typeof api.auditoriaRol>>['data'] | null>(null);
  const [nuevo, setNuevo] = useState<{ nombre: string; ambito: Ambito; padre: string } | null>(null);

  const cargar = async (mantener?: string) => {
    try {
      const [c, r] = await Promise.all([api.rolesCatalogo(), api.roles()]);
      setCatalogo({ permisos: c.data, modulos: c.modulos, mios: new Set(c.mios) });
      const visibles = ambitoInicial === 'plataforma' ? r.data : r.data.filter(x => x.ambito === ambitoInicial);
      setRoles(visibles);
      const elegido = visibles.find(x => x.id === (mantener ?? seleccion)) ?? visibles[0];
      if (elegido) { setSeleccion(elegido.id); setBorrador(new Set(elegido.permisos)); }
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los roles');
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, []);

  const rol = roles.find(r => r.id === seleccion) ?? null;
  const padre = rol?.rol_padre_id ? roles.find(r => r.id === rol.rol_padre_id) : null;
  const apps = rol ? APPS_POR_AMBITO[rol.ambito] : null;

  const { filasModulo, extras } = useMemo(() => {
    const permisos = (catalogo?.permisos ?? []).filter(p => !apps || apps.includes(p.app) || p.codigo === 'roles.gestionar');
    const modulos = [...new Set(permisos.filter(p => ACCIONES.some(([a]) => a === p.accion)).map(p => p.modulo))];
    return { filasModulo: modulos, extras: permisos.filter(p => !ACCIONES.some(([a]) => a === p.accion)) };
  }, [catalogo, apps]);

  /** Por qué una casilla no se puede marcar (o null si se puede). */
  const bloqueo = (codigo: string): string | null => {
    if (!rol || !catalogo) return 'Cargando';
    if (rol.es_sistema) return 'Rol de sistema: no se edita';
    if (!catalogo.mios.has(codigo)) return 'No puedes otorgar un permiso que no tienes';
    if (padre && !padre.permisos.includes(codigo)) return `El rol padre «${padre.nombre}» no lo tiene: un subrol solo puede quitar`;
    return null;
  };
  const alternar = (codigo: string) => {
    if (bloqueo(codigo)) return;
    setBorrador(prev => { const s = new Set(prev); if (s.has(codigo)) s.delete(codigo); else s.add(codigo); return s; });
  };
  const cambios = rol ? rol.permisos.length !== borrador.size || rol.permisos.some(p => !borrador.has(p)) : false;

  const ejecutar = async (accion: () => Promise<unknown>, ok: string, mantener?: string) => {
    setGuardando(true); setError(''); setAviso('');
    try { const r = await accion(); setAviso(ok); await cargar(typeof r === 'string' ? r : mantener); }
    catch (e) {
      const err = e as Error & { detalle?: string[] };
      setError(`${err.message}${err.detalle?.length ? `: ${err.detalle.join(', ')}` : ''}`);
    } finally { setGuardando(false); }
  };

  if (!catalogo) {
    return <div className="p-8 text-sm text-on-surface-variant">{error || 'Cargando roles…'}</div>;
  }

  const grupos = [
    { titulo: 'Plantillas de plataforma', lista: roles.filter(r => !r.organizacion_id) },
    { titulo: 'De tu organización', lista: roles.filter(r => r.organizacion_id) },
  ].filter(g => g.lista.length);

  return (
    <div className={cn('space-y-6', !compacto && 'p-4 sm:p-8')}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        {compacto ? (
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-on-surface">
              <span className="material-symbols-outlined text-primary">admin_panel_settings</span>
              {titulo}
            </h3>
            <p className="mt-1 text-sm text-on-surface-variant">Crea roles y subroles combinando permisos del catálogo. Nadie puede dar un permiso que no tiene.</p>
          </div>
        ) : (
          <div>
            <h2 className="flex items-center gap-3 text-3xl font-extrabold text-primary">
              <span className="material-symbols-outlined text-4xl">admin_panel_settings</span>{titulo}
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">Crea roles y subroles combinando permisos del catálogo. Nadie puede dar un permiso que no tiene.</p>
          </div>
        )}
        <button onClick={() => setNuevo({ nombre: '', ambito: ambitoInicial, padre: '' })}
          className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-inverse-on-surface shadow-sm">
          <span className="material-symbols-outlined text-lg">add</span>Nuevo rol
        </button>
      </div>

      {(error || aviso) && (
        <p className={cn('rounded-xl px-4 py-2 text-sm font-semibold', error ? 'bg-error-container text-on-error-container' : 'bg-success-container text-on-success-container')}>{error || aviso}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-4">
          {grupos.map(g => (
            <div key={g.titulo}>
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-outline">{g.titulo}</p>
              <div className="space-y-1">
                {g.lista.map(r => (
                  <button key={r.id} onClick={() => { setSeleccion(r.id); setBorrador(new Set(r.permisos)); setHistorial(null); }}
                    className={cn('flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors',
                      r.id === seleccion ? 'bg-primary/10 font-bold text-primary' : 'text-on-surface hover:bg-surface-container-low', !r.activo && 'opacity-50')}>
                    <span className="min-w-0 truncate">{r.rol_padre_id && '↳ '}{r.nombre}</span>
                    <span className="flex shrink-0 items-center gap-1 text-[10px] text-outline">
                      {r.es_sistema && <span className="material-symbols-outlined text-sm" title="Rol de sistema">lock</span>}
                      {r.permisos.length}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </aside>

        {rol && (
          <section className="min-w-0 rounded-3xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant/20 p-5">
              <div className="min-w-0">
                <h3 className="text-xl font-black text-on-surface">{rol.nombre}</h3>
                <p className="mt-1 text-sm text-on-surface-variant">{rol.descripcion || 'Sin descripción'}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold">
                  <span className="rounded-full bg-surface-container-high px-2 py-0.5">Ámbito: {ETIQUETA_AMBITO[rol.ambito]}</span>
                  {padre && <span className="rounded-full bg-info-container px-2 py-0.5 text-on-info-container">Subrol de {padre.nombre}</span>}
                  {rol.es_sistema && <span className="rounded-full bg-error-container px-2 py-0.5 text-on-error-container">Sistema · no editable</span>}
                  {rol.es_plantilla && <span className="rounded-full bg-warning-container px-2 py-0.5 text-on-warning-container">Plantilla copiable</span>}
                  <span className="rounded-full bg-surface-container-high px-2 py-0.5">{rol.usuarios} usuario(s)</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={async () => setHistorial((await api.auditoriaRol(rol.id)).data)} className="rounded-full border border-outline-variant/50 px-4 py-2 text-xs font-bold text-on-surface-variant">Historial</button>
                {!rol.es_sistema && rol.activo && (
                  <button disabled={guardando} onClick={() => window.confirm(`¿Desactivar el rol «${rol.nombre}»?`) && ejecutar(() => api.desactivarRol(rol.id), 'Rol desactivado', rol.id)}
                    className="rounded-full border border-error/40 px-4 py-2 text-xs font-bold text-error">Desactivar</button>
                )}
                {!rol.es_sistema && (
                  <button disabled={!cambios || guardando} onClick={() => ejecutar(() => api.actualizarRol(rol.id, { permisos: [...borrador] }), 'Permisos guardados', rol.id)}
                    className="rounded-full bg-primary px-5 py-2 text-xs font-bold text-inverse-on-surface disabled:opacity-40">{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-low">
                  <tr>
                    <th className="p-3 text-left text-[10px] font-black uppercase tracking-widest text-outline">Módulo</th>
                    {ACCIONES.map(([, etiqueta]) => <th key={etiqueta} className="p-3 text-center text-[10px] font-black uppercase tracking-widest text-outline">{etiqueta}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {filasModulo.map(modulo => (
                    <tr key={modulo} className="hover:bg-surface-container-low/40">
                      <td className="p-3">
                        <span className="flex items-center gap-2 font-semibold text-on-surface">
                          <span className="material-symbols-outlined text-base text-outline">{catalogo.modulos[modulo]?.icon ?? 'apps'}</span>
                          {catalogo.modulos[modulo]?.label ?? modulo}
                        </span>
                      </td>
                      {ACCIONES.map(([accion]) => {
                        const codigo = `${modulo}.${accion}`;
                        const motivo = bloqueo(codigo);
                        return (
                          <td key={accion} className="p-3 text-center">
                            <input type="checkbox" aria-label={`${catalogo.modulos[modulo]?.label ?? modulo}: ${accion}`} title={motivo ?? ''}
                              checked={borrador.has(codigo)} disabled={!!motivo} onChange={() => alternar(codigo)}
                              className="h-4 w-4 accent-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-40" />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {extras.length > 0 && (
              <div className="border-t border-outline-variant/20 p-5">
                <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-outline">Permisos específicos</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {extras.map(p => {
                    const motivo = bloqueo(p.codigo);
                    return (
                      <label key={p.codigo} title={motivo ?? ''} className={cn('flex items-start gap-2 rounded-xl border border-outline-variant/30 p-3 text-sm', motivo && 'opacity-50')}>
                        <input type="checkbox" checked={borrador.has(p.codigo)} disabled={!!motivo} onChange={() => alternar(p.codigo)} className="mt-0.5 h-4 w-4" />
                        <span><span className="font-semibold text-on-surface">{p.descripcion}</span><span className="block font-mono text-[10px] text-outline">{p.codigo}</span></span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {historial && (
              <div className="border-t border-outline-variant/20 p-5">
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-outline">Historial de cambios</p>
                {historial.length === 0 ? <p className="text-sm text-on-surface-variant">Sin cambios registrados.</p> : (
                  <ul className="space-y-1 text-sm text-on-surface-variant">
                    {historial.map(h => <li key={h.id}>{formatFecha(h.creado_en)} · <b className="text-on-surface">{h.accion}</b> por {h.usuario ?? 'sistema'}</li>)}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}
      </div>

      {nuevo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 p-4" onClick={() => setNuevo(null)}>
          <div className="w-full max-w-md space-y-4 rounded-3xl bg-surface-container-lowest p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-on-surface">Nuevo rol</h3>
            <label className="block text-xs font-bold text-on-surface-variant">Nombre
              <input autoFocus value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Ej. Cajero turno noche"
                className="mt-1 w-full rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3 py-2 text-sm outline-none focus:border-primary" />
            </label>
            {ambitoInicial === 'plataforma' && (
              <label className="block text-xs font-bold text-on-surface-variant">Ámbito
                <select value={nuevo.ambito} onChange={e => setNuevo({ ...nuevo, ambito: e.target.value as Ambito, padre: '' })}
                  className="mt-1 w-full rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3 py-2 text-sm">
                  {(Object.keys(ETIQUETA_AMBITO) as Ambito[]).map(a => <option key={a} value={a}>{ETIQUETA_AMBITO[a]}</option>)}
                </select>
              </label>
            )}
            <label className="block text-xs font-bold text-on-surface-variant">Rol padre (subrol: parte de sus permisos y solo puede quitar)
              <select value={nuevo.padre} onChange={e => setNuevo({ ...nuevo, padre: e.target.value })}
                className="mt-1 w-full rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3 py-2 text-sm">
                <option value="">Ninguno (rol nuevo vacío)</option>
                {roles.filter(r => r.ambito === nuevo.ambito && r.activo && !r.es_sistema).map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setNuevo(null)} className="rounded-full px-4 py-2 text-sm font-bold text-on-surface-variant">Cancelar</button>
              <button disabled={!nuevo.nombre.trim() || guardando}
                onClick={() => {
                  const base = roles.find(r => r.id === nuevo.padre);
                  // Un subrol nace con los permisos del padre que este usuario puede otorgar.
                  const permisos = (base?.permisos ?? []).filter(p => catalogo.mios.has(p));
                  ejecutar(async () => {
                    const { data } = await api.crearRol({ nombre: nuevo.nombre.trim(), ambito: nuevo.ambito, rol_padre_id: nuevo.padre || null, permisos });
                    setNuevo(null);
                    return data.id;
                  }, 'Rol creado');
                }}
                className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-inverse-on-surface disabled:opacity-40">Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
