import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useERP } from '../../1.-ERP/context/ERPContext';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';

type Tab = 'negocio' | 'cuenta' | 'equipo' | 'integraciones' | 'facturacion';

const RUBROS = [
  'Alimentación y Bebidas', 'Comercio Minorista', 'Servicios Profesionales',
  'Construcción y Remodelación', 'Educación y Capacitación', 'Estética y Belleza',
  'Salud y Bienestar', 'Tecnología y Software', 'Transporte y Logística',
  'Turismo y Hospitalidad', 'Arte y Diseño', 'Agricultura y Ganadería', 'Otro',
];

const REGIONES = [
  'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo',
  'Valparaíso', 'Metropolitana de Santiago', "O'Higgins", 'Maule', 'Ñuble',
  'Biobío', 'La Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes',
];

const SEGMENTOS = [
  { valor: 'A', label: 'Perfil A — Almacén (1 a 5 empleados)' },
  { valor: 'B', label: 'Perfil B — Minimarket (6 a 20 empleados)' },
  { valor: 'C', label: 'Perfil C — Cadena (21 a 100 empleados)' },
] as const;

const TABS: { id: Tab; icono: string; label: string }[] = [
  { id: 'negocio', icono: 'storefront', label: 'Mi Negocio' },
  { id: 'cuenta', icono: 'manage_accounts', label: 'Mi Cuenta' },
  { id: 'equipo', icono: 'group', label: 'Equipo' },
  { id: 'integraciones', icono: 'cloud_sync', label: 'Integraciones' },
  { id: 'facturacion', icono: 'credit_card', label: 'Suscripción' },
];

export default function ERPConfiguracion() {
  const { perfil, actualizarPerfil, puedeHacer } = useAuth();
  const { configuracionCumplimiento, updatePpmTasa, user } = useERP();
  const [tab, setTab] = useState<Tab>('negocio');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const notificar = (tipo: 'ok' | 'error', texto: string) => {
    setMensaje({ tipo, texto });
    setTimeout(() => setMensaje(null), 3500);
  };

  // ══ Mi Negocio ════════════════════════════════════
  const [formNegocio, setFormNegocio] = useState({
    negocio_nombre: perfil?.negocio_nombre ?? '',
    negocio_rut: perfil?.negocio_rut ?? '',
    negocio_rubro: perfil?.negocio_rubro ?? '',
    negocio_region: perfil?.negocio_region ?? '',
    negocio_comuna: perfil?.negocio_comuna ?? '',
    negocio_direccion: perfil?.negocio_direccion ?? '',
    segmento_negocio: (perfil?.segmento_negocio ?? 'C') as 'A' | 'B' | 'C',
    logo_url: perfil?.logo_url ?? '',
  });

  useEffect(() => {
    if (!perfil) return;
    setFormNegocio({
      negocio_nombre: perfil.negocio_nombre ?? '',
      negocio_rut: perfil.negocio_rut ?? '',
      negocio_rubro: perfil.negocio_rubro ?? '',
      negocio_region: perfil.negocio_region ?? '',
      negocio_comuna: perfil.negocio_comuna ?? '',
      negocio_direccion: perfil.negocio_direccion ?? '',
      segmento_negocio: (perfil.segmento_negocio as 'A' | 'B' | 'C') ?? 'C',
      logo_url: typeof perfil.logo_url === 'string' ? perfil.logo_url : '',
    });
  }, [perfil?.id]);

  const guardarNegocio = async () => {
    if (!perfil) return;
    setGuardando(true);
    try {
      await actualizarPerfil({ ...formNegocio });
      notificar('ok', 'Datos del negocio guardados');
    } catch (e) {
      notificar('error', e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const subirLogo = (archivo: File) => {
    if (archivo.size > 2 * 1024 * 1024) {
      notificar('error', 'El logo debe ser menor a 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFormNegocio(p => ({ ...p, logo_url: String(reader.result ?? '') }));
    };
    reader.readAsDataURL(archivo);
  };

  const letraLogo = useMemo(() =>
    (formNegocio.negocio_nombre || perfil?.negocio_nombre || 'P').trim()[0]?.toUpperCase() ?? 'P',
    [formNegocio.negocio_nombre, perfil?.negocio_nombre]);

  // ══ Mi Cuenta ═════════════════════════════════════
  const [formCuenta, setFormCuenta] = useState({
    nombre_completo: perfil?.nombre_completo ?? '',
    nueva_contrasena: '',
    confirmar_contrasena: '',
    notif_email: !!(perfil?.notif_email ?? true),
    notif_push: !!(perfil?.notif_push ?? false),
  });

  useEffect(() => {
    if (!perfil) return;
    setFormCuenta(p => ({
      ...p,
      nombre_completo: perfil.nombre_completo ?? '',
      notif_email: !!(perfil.notif_email ?? true),
      notif_push: !!(perfil.notif_push ?? false),
    }));
  }, [perfil?.id]);

  const guardarCuenta = async () => {
    if (!perfil) return;
    const payload: Record<string, unknown> = {
      nombre_completo: formCuenta.nombre_completo,
      notif_email: formCuenta.notif_email,
      notif_push: formCuenta.notif_push,
    };
    if (formCuenta.nueva_contrasena || formCuenta.confirmar_contrasena) {
      if (formCuenta.nueva_contrasena.length < 6) {
        notificar('error', 'La contraseña debe tener al menos 6 caracteres');
        return;
      }
      if (formCuenta.nueva_contrasena !== formCuenta.confirmar_contrasena) {
        notificar('error', 'Las contraseñas no coinciden');
        return;
      }
      payload.nueva_contrasena = formCuenta.nueva_contrasena;
      payload.confirmar_contrasena = formCuenta.confirmar_contrasena;
    }
    setGuardando(true);
    try {
      await actualizarPerfil(payload);
      setFormCuenta(p => ({ ...p, nueva_contrasena: '', confirmar_contrasena: '' }));
      notificar('ok', 'Cuenta actualizada correctamente');
    } catch (e) {
      notificar('error', e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  // ══ Equipo ════════════════════════════════════════
  const puedeGestionarEquipo = !!perfil && ['superadmin', 'admin_institucional'].includes(perfil.rol) && !!perfil.institucion_id;
  const [equipo, setEquipo] = useState<Record<string, unknown>[] | null>(null);

  useEffect(() => {
    if (!puedeGestionarEquipo || !perfil?.institucion_id) return;
    let activo = true;
    api.getUsuariosInstitucion(perfil.institucion_id)
      .then(({ data }) => { if (activo) setEquipo(data); })
      .catch(() => { if (activo) setEquipo([]); });
    return () => { activo = false; };
  }, [puedeGestionarEquipo, perfil?.institucion_id]);

  // ══ Integraciones / SII ═══════════════════════════
  const [ppm, setPpm] = useState(String(configuracionCumplimiento.ppmTasa));
  const [ppmGuardado, setPpmGuardado] = useState(false);

  const guardarPpm = async () => {
    const valor = Number(ppm);
    if (isNaN(valor) || valor < 0) return;
    await updatePpmTasa(valor);
    setPpmGuardado(true);
    setTimeout(() => setPpmGuardado(false), 2000);
  };

  if (!perfil) return null;

  const inputCls = 'w-full px-4 py-3 rounded-xl border-2 border-outline-variant/60 focus:border-primary outline-none text-sm font-bold text-on-surface bg-surface-container-lowest transition-colors';
  const labelCls = 'flex items-center gap-1 text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5';
  const campoCls = 'flex flex-col items-start gap-2 text-on-surface-variant text-sm';

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-primary flex items-center gap-3">
            <span className="material-symbols-outlined text-4xl">settings</span>
            Configuración
          </h2>
          <p className="text-on-surface-variant mt-1 text-sm">Perfil de tu negocio, cuenta, equipo y preferencias del ERP.</p>
        </div>
        {mensaje && (
          <div className={cn('flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-sm',
            mensaje.tipo === 'ok' ? 'bg-emerald-500/15 text-emerald-600' : 'bg-error/15 text-error')}>
            <span className="material-symbols-outlined">{mensaje.tipo === 'ok' ? 'check_circle' : 'error'}</span>
            {mensaje.texto}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-container-lowest dark-card p-1 rounded-2xl w-fit max-w-full overflow-x-auto">
        {TABS.map(({ id, icono, label }) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn('flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap',
              tab === id ? 'bg-primary text-white shadow-md' : 'text-on-surface-variant hover:text-on-surface')}>
            <span className="material-symbols-outlined text-base">{icono}</span>
            {label}
          </button>
        ))}
      </div>

      {/* ══ Mi Negocio ══ */}
      {tab === 'negocio' && (
        <div className="bg-surface-container-lowest dark-card rounded-3xl border border-outline-variant/20 shadow-sm p-8 space-y-6">
          <h3 className="text-lg font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">storefront</span>
            Datos del Negocio
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelCls}>Nombre del negocio</label>
              <input value={formNegocio.negocio_nombre} onChange={e => setFormNegocio(p => ({ ...p, negocio_nombre: e.target.value }))}
                placeholder="Ej: Ferretería El Clavo" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>RUT de la empresa</label>
              <input value={formNegocio.negocio_rut} onChange={e => setFormNegocio(p => ({ ...p, negocio_rut: e.target.value }))}
                placeholder="76.543.210-K" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Perfil de negocio (segmento)</label>
              <select value={formNegocio.segmento_negocio}
                onChange={e => setFormNegocio(p => ({ ...p, segmento_negocio: e.target.value as 'A' | 'B' | 'C' }))}
                className={inputCls}>
                {SEGMENTOS.map(s => <option key={s.valor} value={s.valor}>{s.label}</option>)}
              </select>
              <p className="text-[10px] text-on-surface-variant mt-1.5 leading-relaxed uppercase font-bold tracking-tighter">
                Define qué módulos y funcionalidades estarán visibles según el tamaño de tu empresa.
              </p>
            </div>
            <div>
              <label className={labelCls}>Giro / Rubro</label>
              <select value={formNegocio.negocio_rubro}
                onChange={e => setFormNegocio(p => ({ ...p, negocio_rubro: e.target.value }))}
                className={inputCls}>
                <option value="" disabled>Selecciona un rubro</option>
                {RUBROS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Región</label>
              <select value={formNegocio.negocio_region}
                onChange={e => setFormNegocio(p => ({ ...p, negocio_region: e.target.value }))}
                className={inputCls}>
                <option value="" disabled>Selecciona una región</option>
                {REGIONES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Comuna</label>
              <input value={formNegocio.negocio_comuna} onChange={e => setFormNegocio(p => ({ ...p, negocio_comuna: e.target.value }))}
                placeholder="Ej: Providencia" className={inputCls} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Dirección <span className="font-normal normal-case text-on-surface-variant/60">(opcional)</span></label>
              <input value={formNegocio.negocio_direccion} onChange={e => setFormNegocio(p => ({ ...p, negocio_direccion: e.target.value }))}
                placeholder="Av. Principal 123, Santiago" className={inputCls} />
            </div>
          </div>

          {/* Logo */}
          <div className="p-5 rounded-2xl bg-surface-container dark-card border border-outline-variant/20">
            <h4 className="text-sm font-bold text-on-surface mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-on-surface-variant">image</span>
              Logo del negocio
            </h4>
            <div className="flex items-center gap-5">
              {formNegocio.logo_url ? (
                <img src={formNegocio.logo_url} alt="Logo" className="w-20 h-20 rounded-2xl object-cover border border-outline-variant/40" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-primary text-3xl font-extrabold border-2 border-dashed border-primary/30">
                  {letraLogo}
                </div>
              )}
              <div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) subirLogo(f); }} />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 border-2 border-outline-variant rounded-xl text-sm font-bold text-on-surface-variant hover:border-primary hover:text-primary transition-colors">
                  <span className="material-symbols-outlined text-base">upload</span> {formNegocio.logo_url ? 'Cambiar logo' : 'Subir logo'}
                </button>
                {formNegocio.logo_url && (
                  <button onClick={() => setFormNegocio(p => ({ ...p, logo_url: '' }))}
                    className="ml-2 text-xs font-bold text-error hover:underline">
                    Quitar
                  </button>
                )}
                <p className="text-xs text-on-surface-variant mt-1.5">PNG, JPG o SVG — máx. 2MB</p>
              </div>
            </div>
          </div>

          <button onClick={guardarNegocio} disabled={guardando}
            className="w-full py-4 bg-primary text-white font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-70 transition-colors">
            {guardando ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">save</span>}
            Guardar cambios
          </button>
        </div>
      )}

      {/* ══ Mi Cuenta ══ */}
      {tab === 'cuenta' && (
        <div className="space-y-6 max-w-xl">
          <div className="bg-surface-container-lowest dark-card rounded-3xl border border-outline-variant/20 shadow-sm p-8 space-y-5">
            <h3 className="text-lg font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">manage_accounts</span>
              Datos personales
            </h3>
            <div>
              <label className={labelCls}>Nombre completo</label>
              <input value={formCuenta.nombre_completo} onChange={e => setFormCuenta(p => ({ ...p, nombre_completo: e.target.value }))}
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={perfil.email} disabled
                className="w-full px-4 py-3 rounded-xl border-2 border-outline-variant/20 bg-surface-container dark-card outline-none text-sm font-medium text-on-surface-variant/60 cursor-not-allowed" />
              <p className="text-xs text-on-surface-variant mt-1">El email no puede modificarse (es tu identificador único).</p>
            </div>

            <div className="pt-2">
              <h4 className="text-sm font-bold text-on-surface mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-on-surface-variant">notifications</span>
                Notificaciones
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button onClick={() => setFormCuenta(p => ({ ...p, notif_email: !p.notif_email }))}
                  className={cn('flex items-center justify-between px-4 py-3 border-2 rounded-xl font-bold text-sm transition-colors',
                    formCuenta.notif_email ? 'border-primary bg-primary/5 text-on-surface' : 'border-outline-variant/40 text-on-surface-variant')}>
                  Email
                  <span className={cn('material-symbols-outlined', formCuenta.notif_email ? 'text-primary' : 'text-on-surface-variant/50')}>
                    {formCuenta.notif_email ? 'toggle_on' : 'toggle_off'}
                  </span>
                </button>
                <button onClick={() => setFormCuenta(p => ({ ...p, notif_push: !p.notif_push }))}
                  className={cn('flex items-center justify-between px-4 py-3 border-2 rounded-xl font-bold text-sm transition-colors',
                    formCuenta.notif_push ? 'border-primary bg-primary/5 text-on-surface' : 'border-outline-variant/40 text-on-surface-variant')}>
                  Push
                  <span className={cn('material-symbols-outlined', formCuenta.notif_push ? 'text-primary' : 'text-on-surface-variant/50')}>
                    {formCuenta.notif_push ? 'toggle_on' : 'toggle_off'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-lowest dark-card rounded-3xl border border-outline-variant/20 shadow-sm p-8 space-y-5">
            <h3 className="text-lg font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">lock_reset</span>
              Cambiar contraseña
            </h3>
            <div>
              <label className={labelCls}>Nueva contraseña</label>
              <input type="password" value={formCuenta.nueva_contrasena} onChange={e => setFormCuenta(p => ({ ...p, nueva_contrasena: e.target.value }))}
                placeholder="Mínimo 6 caracteres" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Confirmar contraseña</label>
              <input type="password" value={formCuenta.confirmar_contrasena} onChange={e => setFormCuenta(p => ({ ...p, confirmar_contrasena: e.target.value }))}
                placeholder="Repite la nueva contraseña" className={inputCls} />
            </div>
          </div>

          <button onClick={guardarCuenta} disabled={guardando}
            className="w-full py-4 bg-primary text-white font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-70 transition-colors">
            {guardando ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">save</span>}
            Guardar cambios
          </button>
        </div>
      )}

      {/* ══ Equipo ══ */}
      {tab === 'equipo' && (
        <div className="space-y-6">
          <div className="bg-surface-container-lowest dark-card rounded-3xl border border-outline-variant/20 shadow-sm overflow-hidden">
            <div className="px-8 py-6 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container dark-card">
              <h3 className="text-sm font-black text-on-surface-variant uppercase tracking-widest">Miembros del Equipo</h3>
              {equipo && (
                <span className="px-3 py-1 bg-surface-container-lowest border border-outline-variant/40 rounded-full text-[10px] font-black text-on-surface-variant">
                  {equipo.length} USUARIOS
                </span>
              )}
            </div>

            {puedeGestionarEquipo ? (
              equipo === null ? (
                <div className="p-8 text-center text-on-surface-variant text-sm">
                  <span className="material-symbols-outlined animate-spin inline-block">progress_activity</span>
                </div>
              ) : equipo.length === 0 ? (
                <div className="p-8 text-center text-on-surface-variant text-sm">Aún no hay miembros en tu institución.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-on-surface-variant">
                        <th className="px-8 py-4 font-bold uppercase text-[10px]">Email</th>
                        <th className="px-8 py-4 font-bold uppercase text-[10px]">Rol</th>
                        <th className="px-8 py-4 font-bold uppercase text-[10px]">Estado</th>
                        <th className="px-8 py-4 font-bold uppercase text-[10px] text-right">Suscripción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10">
                      {equipo.map((m) => (
                        <tr key={String(m.id)} className="hover:bg-surface-container/50 transition-colors">
                          <td className="px-8 py-4">
                            <p className="font-bold text-on-surface">{String(m.nombre_completo || '—')}</p>
                            <p className="text-xs text-on-surface-variant">{String(m.email)}</p>
                          </td>
                          <td className="px-8 py-4">
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-primary/10 text-primary capitalize">
                              {String(m.rol ?? '—').replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-8 py-4">
                            <span className={cn('flex items-center gap-1.5 text-[10px] font-black uppercase',
                              m.activo ? 'text-emerald-500' : 'text-error')}>
                              <span className={cn('w-1.5 h-1.5 rounded-full', m.activo ? 'bg-emerald-500' : 'bg-error')}></span>
                              {m.activo ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="px-8 py-4 text-right text-xs font-bold text-on-surface-variant capitalize">
                            {String(m.membresia_nivel ?? 'free')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <div className="p-8 space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-primary">group</span>
                  </div>
                  <div>
                    <p className="font-bold text-on-surface">Tu equipo se gestiona desde las Administración</p>
                    <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
                      Los colaboradores, roles y permisos del ERP se administran según tu vinculación a una institución.
                      Como tu rol actual es <strong className="text-on-surface capitalize">{perfil.rol.replace(/_/g, ' ')}</strong>, puedes
                      gestionar tu empleo o vincular tu negocio desde tu institución.
                    </p>
                  </div>
                </div>
                <Link to="/erp/mi-institucion"
                  className="inline-flex items-center gap-2 px-5 py-3 border-2 border-outline-variant rounded-xl text-sm font-bold text-on-surface-variant hover:border-primary hover:text-primary transition-colors">
                  <span className="material-symbols-outlined text-lg">domain</span>
                  Ver mi institución
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ Integraciones ══ */}
      {tab === 'integraciones' && (
        <div className="space-y-6 max-w-xl">
          <div className="bg-surface-container-lowest dark-card rounded-3xl border border-outline-variant/20 shadow-sm p-8">
            <h3 className="text-lg font-bold text-on-surface mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">account_balance</span>
              Integración con SII
            </h3>
            <p className="text-sm text-on-surface-variant mb-6">Parámetros que el ERP usa para la declaración de impuestos (F29 e IVA mensual).</p>

            <div className="divide-y divide-outline-variant/10 mb-6">
              {[
                { label: 'Modo de integración', valor: configuracionCumplimiento.modoIntegracion },
                { label: 'Ambiente', valor: configuracionCumplimiento.ambiente },
                { label: 'Uso de folios manuales', valor: configuracionCumplimiento.usaFoliosManual ? 'Habilitado' : 'Deshabilitado' },
                { label: 'Declaradores disponibles', valor: 'F29 mensual' },
              ].map(item => (
                <div key={item.label} className="py-3 flex justify-between items-center">
                  <p className="text-sm font-bold text-on-surface-variant">{item.label}</p>
                  <p className="text-sm font-black text-on-surface">{item.valor}</p>
                </div>
              ))}
            </div>

            <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10">
              <div className="flex gap-3">
                <span className="material-symbols-outlined text-amber-500">security</span>
                <div>
                  <p className="text-xs font-bold text-amber-600 uppercase tracking-tight">Seguridad de tus datos</p>
                  <p className="text-[11px] text-on-surface-variant mt-1 leading-relaxed">
                    No almacenamos tu clave tributaria. Los parámetros se guardan de forma local y segura para el cálculo de tus declaraciones.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-lowest dark-card rounded-3xl border border-outline-variant/20 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-primary">percent</span>
              <div>
                <h3 className="font-bold text-on-surface">Tasa de PPM (Pagos Provisional Mensuales)</h3>
                <p className="text-xs text-on-surface-variant">Ingresa el porcentaje que aparece en tu resolución de PPM para el cálculo del F29.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <input
                type="number" step="0.1" min="0" max="100" value={ppm}
                onChange={e => setPpm(e.target.value)}
                className="flex-1 px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm font-bold focus:border-primary outline-none bg-surface-container-lowest text-on-surface" />
              <button onClick={guardarPpm}
                className="px-6 py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
                {ppmGuardado ? 'Guardado' : 'Guardar'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest dark-card p-5 text-sm text-on-surface-variant">
            <p><span className="font-black text-on-surface">Cuenta conectada:</span> {user?.email}</p>
          </div>
        </div>
      )}

      {/* ══ Suscripción ══ */}
      {tab === 'facturacion' && (
        <div className="max-w-xl bg-surface-container-lowest dark-card rounded-3xl border border-outline-variant/20 shadow-sm p-8">
          <h3 className="text-lg font-bold text-on-surface mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">credit_card</span>
            Tu Suscripción
          </h3>

          <div className={cn('p-5 rounded-2xl mb-6 border-2',
            perfil.membresia_nivel === 'free' ? 'bg-surface-container border-outline-variant/40' : 'bg-emerald-500/10 border-emerald-500/40')}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Plan Actual</p>
                <h4 className="text-xl font-extrabold text-on-surface capitalize">{perfil.membresia_nivel ?? 'free'}</h4>
              </div>
              <span className={cn('material-symbols-outlined text-4xl',
                perfil.membresia_nivel === 'free' ? 'text-on-surface-variant/50' : 'text-emerald-500')}>
                workspace_premium
              </span>
            </div>
            {perfil.membresia_expira && perfil.membresia_nivel !== 'free' && (
              <p className="text-xs text-on-surface-variant mt-2">Próxima renovación: <strong className="text-on-surface">{perfil.membresia_expira}</strong></p>
            )}
          </div>

          {perfil.membresia_nivel === 'free' ? (
            <Link to="/erp/suscripcion"
              className="w-full flex items-center justify-center gap-2 py-4 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl text-base transition-colors shadow-lg shadow-amber-500/20">
              <span className="material-symbols-outlined">rocket_launch</span>
              Pasarse a Premium — $10.000/mes
            </Link>
          ) : (
            <div className="space-y-3">
              <Link to="/erp/suscripcion"
                className="w-full py-3 border-2 border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary rounded-2xl font-bold text-sm transition-colors flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-lg">receipt_long</span>
                Ver historial de pagos
              </Link>
              <p className="text-[11px] text-on-surface-variant text-center leading-relaxed">
                La cancelación de suscripción se gestiona a través de tu institución o contactando al soporte.
              </p>
            </div>
          )}
        </div>
      )}

      {!puedeHacer('editar_mi_negocio') && tab === 'negocio' && (
        <div className="rounded-2xl border border-error/30 bg-error/10 p-5 text-sm text-error font-bold">
          Tu rol actual no tiene permiso para editar los datos del negocio.
        </div>
      )}
    </div>
  );
}