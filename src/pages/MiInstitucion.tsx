import { useState, useEffect, useCallback, FormEvent } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

interface MiVinculacion {
  institucion_id: string | null;
  institucion_nombre: string | null;
  institucion_rubro?: string | null;
  institucion_region?: string | null;
  institucion_comuna?: string | null;
  institucion_direccion?: string | null;
  institucion_logo_url?: string | null;
  jefe_id?: string | null;
  jefe_nombre?: string | null;
  solicitud_id?: string | null;
  solicitud_estado?: string | null;
  solicitud_institucion_id?: string | null;
  solicitud_institucion_nombre?: string | null;
  solicitud_created_at?: string | null;
  solicitud_respondida_at?: string | null;
}

interface InstitucionResultado {
  id: string;
  nombre: string;
  rubro?: string | null;
  region?: string | null;
  comuna?: string | null;
}

const errorLegible: Record<string, string> = {
  codigo_invalido: 'El código no es válido, ya fue usado o está vencido.',
  ya_vinculado: 'Ya estás vinculado a una institución.',
  sin_autenticacion: 'Debes iniciar sesión para realizar esta acción.',
};

export default function MiInstitucion() {
  const { perfil, recargarPerfil } = useAuth();
  const [vinculacion, setVinculacion] = useState<MiVinculacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Búsqueda de institución para solicitar vinculación
  const [institucion, setInstitucion] = useState<InstitucionResultado | null>(null);
  const [busquedaInst, setBusquedaInst] = useState('');
  const [resultadosInst, setResultadosInst] = useState<InstitucionResultado[]>([]);
  const [buscandoInst, setBuscandoInst] = useState(false);

  // Código de invitación
  const [codigoInput, setCodigoInput] = useState('');

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.miVinculacion();
      if (data) setVinculacion(data as unknown as MiVinculacion);
    } catch {
      // sin vinculacion o sin sesion: se muestra el panel vacio
    }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    let active = true;
    const termino = busquedaInst.trim();
    if (!termino) {
      setResultadosInst([]);
      setBuscandoInst(false);
      return;
    }
    const timer = setTimeout(async () => {
      setBuscandoInst(true);
      try {
        const { data } = await api.buscarInstituciones(termino);
        if (active) setResultadosInst((data ?? []) as unknown as InstitucionResultado[]);
      } catch {
        if (active) setResultadosInst([]);
      }
      if (active) setBuscandoInst(false);
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [busquedaInst]);

  const seleccionarInstitucion = (i: InstitucionResultado) => {
    setInstitucion(i);
    setBusquedaInst('');
    setResultadosInst([]);
  };

  const solicitarVinculacion = async () => {
    if (!institucion || !perfil) return;
    setTrabajando(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.solicitarVinculacion(institucion.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setTrabajando(false);
      setErrorMsg(
        msg.includes('duplicate') || msg.includes('unique')
          ? 'Ya tienes una solicitud pendiente para esta institución.'
          : msg
      );
      return;
    }
    setTrabajando(false);
    setSuccessMsg(`Solicitud enviada a ${institucion.nombre}.`);
    setInstitucion(null);
    await cargar();
  };

  const cancelarSolicitud = async () => {
    if (!perfil) return;
    setTrabajando(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const { data } = await api.miVinculacion();
      const solicitudId = (data as unknown as MiVinculacion | null)?.solicitud_id;
      if (!solicitudId) throw new Error('Sin solicitud pendiente.');
      await api.cancelarSolicitud(solicitudId);
    } catch (err) {
      setTrabajando(false);
      setErrorMsg(err instanceof Error ? err.message : 'Error al cancelar la solicitud.');
      return;
    }
    setTrabajando(false);
    setSuccessMsg('Solicitud cancelada.');
    await cargar();
  };

  const redimirCodigo = async (e: FormEvent) => {
    e.preventDefault();
    const codigo = codigoInput.trim().toUpperCase();
    if (!codigo) return;
    setTrabajando(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.redimirCodigo(codigo);
    } catch (err) {
      setTrabajando(false);
      setErrorMsg(errorLegible[err instanceof Error ? err.message : ''] ?? (err instanceof Error ? err.message : 'Error al canjear el código'));
      return;
    }
    setTrabajando(false);
    setSuccessMsg('¡Vinculación exitosa! Tu cuenta quedó asociada a la institución del código.');
    setCodigoInput('');
    await cargar();
    await recargarPerfil();
  };

  const vinculado = Boolean(vinculacion?.institucion_id);
  const pendiente = vinculacion?.solicitud_estado === 'pendiente';
  const rechazada = vinculacion?.solicitud_estado === 'rechazada';

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <span className="material-symbols-outlined text-3xl text-primary">apartment</span>
        <div>
          <h2 className="text-2xl font-extrabold text-on-surface tracking-tight">Mi institución</h2>
          <p className="text-on-surface-variant font-medium">Vinculación, solicitudes y códigos de invitación</p>
        </div>
      </div>

      {cargando ? (
        <div className="p-12 text-center text-on-surface-variant">Cargando...</div>
      ) : (
        <div className="space-y-6">
          {errorMsg && (
            <div className="flex items-center justify-between gap-3 p-4 bg-red-50 text-red-700 rounded-2xl text-sm font-bold">
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined">error_outline</span>
                {errorMsg}
              </span>
              <button onClick={() => setErrorMsg('')} className="text-red-500 hover:text-red-700">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center justify-between gap-3 p-4 bg-green-50 text-green-700 rounded-2xl text-sm font-bold">
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined">check_circle</span>
                {successMsg}
              </span>
              <button onClick={() => setSuccessMsg('')} className="text-green-500 hover:text-green-700">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
          )}

          {/* ── Vinculado a una institución ── */}
          {vinculado && (
            <div className="bg-gradient-to-br from-primary/10 to-secondary/10 dark-card rounded-3xl shadow-sm p-7 border border-primary/20">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                  <span className="material-symbols-outlined text-3xl">verified</span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold uppercase tracking-widest text-primary mb-1">
                    Cuenta vinculada
                  </p>
                  <h3 className="text-xl font-extrabold text-on-surface truncate">
                    {vinculacion?.institucion_nombre ?? 'Institución'}
                  </h3>
                  <p className="text-sm text-on-surface-variant mt-1 font-medium">
                    {[vinculacion?.institucion_rubro, vinculacion?.institucion_comuna, vinculacion?.institucion_region]
                      .filter(Boolean).join(' · ') || 'Institución asociada a tu cuenta'}
                  </p>
                  {vinculacion?.institucion_direccion && (
                    <p className="text-xs text-on-surface-variant mt-1">
                      <span className="material-symbols-outlined text-sm align-[-3px]">location_on</span>{' '}
                      {vinculacion.institucion_direccion}
                    </p>
                  )}
                  {vinculacion?.jefe_nombre && (
                    <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-high text-xs font-bold text-on-surface">
                      <span className="material-symbols-outlined text-sm">admin_panel_settings</span>
                      Administrador: {vinculacion.jefe_nombre}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Solicitud pendiente ── */}
          {!vinculado && pendiente && (
            <div className="bg-amber-500/10 dark-card rounded-3xl shadow-sm p-7 border border-amber-500/20">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500">
                  <span className="material-symbols-outlined text-2xl">hourglass_top</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-extrabold uppercase tracking-widest text-amber-500 mb-1">
                    Solicitud en revisión
                  </p>
                  <h3 className="text-lg font-extrabold text-on-surface">
                    Vinculación a {vinculacion?.solicitud_institucion_nombre ?? 'tu institución'}
                  </h3>
                  <p className="text-sm text-on-surface-variant mt-1 font-medium">
                    El administrador de la institución debe aprobar tu solicitud.
                    {vinculacion?.solicitud_created_at && (
                      <> Enviada el {new Date(vinculacion.solicitud_created_at).toLocaleDateString('es-CL')}.</>
                    )}
                  </p>
                  <button
                    onClick={cancelarSolicitud}
                    disabled={trabajando}
                    className="mt-4 px-4 py-2 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors disabled:opacity-50"
                  >
                    Cancelar solicitud
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Sin vinculación / solicitud rechazada ── */}
          {!vinculado && !pendiente && (
            <div className="space-y-6">
              {rechazada && (
                <div className="p-4 bg-red-50 text-red-700 rounded-2xl flex items-center gap-3 text-sm font-bold">
                  <span className="material-symbols-outlined">block</span>
                  Tu solicitud a {vinculacion?.solicitud_institucion_nombre ?? 'la institución'} fue rechazada.
                </div>
              )}

              {/* Solicitar vinculación */}
              <div className="bg-surface-container-lowest dark-card rounded-3xl shadow-sm p-7">
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-primary">person_add</span>
                  <h3 className="text-base font-extrabold text-on-surface">Solicitar vinculación a una institución</h3>
                </div>
                <p className="text-sm text-on-surface-variant mb-5">
                  Elige una institución y el administrador deberá aprobar tu solicitud.
                </p>

                {institucion ? (
                  <div className="flex items-center justify-between gap-3 p-4 rounded-xl border-2 border-primary/30 bg-primary/5">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="material-symbols-outlined text-on-surface-variant">apartment</span>
                      <div className="min-w-0">
                        <p className="font-bold text-on-surface truncate">{institucion.nombre}</p>
                        <p className="text-xs text-on-surface-variant">
                          {[institucion.comuna, institucion.region].filter(Boolean).join(', ') || institucion.rubro}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => setInstitucion(null)} className="p-1.5 hover:bg-surface-container-high rounded-lg" title="Quitar institución">
                      <span className="material-symbols-outlined text-on-surface-variant">close</span>
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={busquedaInst}
                      onChange={(e) => setBusquedaInst(e.target.value)}
                      placeholder="Busca tu institución por nombre..."
                      className="w-full p-4 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none transition-all"
                    />
                    {buscandoInst && <p className="text-xs text-on-surface-variant mt-1">Buscando...</p>}
                    {!buscandoInst && busquedaInst.trim() && (
                      <div className="absolute z-10 left-0 right-0 mt-2 bg-surface-container-lowest rounded-xl border border-outline-variant/40 shadow-xl overflow-hidden max-h-64 overflow-y-auto">
                        {resultadosInst.length === 0 ? (
                          <p className="p-4 text-sm text-on-surface-variant">Sin resultados</p>
                        ) : (
                          resultadosInst.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => seleccionarInstitucion(r)}
                              className="w-full text-left px-4 py-3 hover:bg-surface-container-low transition-colors flex items-center gap-3"
                            >
                              <span className="material-symbols-outlined text-on-surface-variant">apartment</span>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-on-surface truncate">{r.nombre}</p>
                                <p className="text-xs text-on-surface-variant truncate">
                                  {[r.comuna, r.region, r.rubro].filter(Boolean).join(' · ') || 'Institución'}
                                </p>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}

                {institucion && (
                  <button
                    onClick={solicitarVinculacion}
                    disabled={trabajando}
                    className="mt-4 w-full py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 disabled:opacity-50 text-sm transition-colors"
                  >
                    Enviar solicitud de vinculación
                  </button>
                )}
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1 border-t border-outline-variant/40" />
                <span className="text-xs font-extrabold uppercase tracking-widest text-on-surface-variant">o</span>
                <div className="flex-1 border-t border-outline-variant/40" />
              </div>

              {/* Canjear código */}
              <div className="bg-surface-container-lowest dark-card rounded-3xl shadow-sm p-7">
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-teal-500">card_membership</span>
                  <h3 className="text-base font-extrabold text-on-surface">Tengo un código de invitación</h3>
                </div>
                <p className="text-sm text-on-surface-variant mb-5">
                  Si tu institución te entregó un código, cánjéalo aquí y tu cuenta quedará vinculada de inmediato.
                </p>
                <form onSubmit={redimirCodigo} className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={codigoInput}
                    onChange={(e) => setCodigoInput(e.target.value)}
                    placeholder="Ej. AB12CD34"
                    className="flex-1 p-4 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none uppercase placeholder:normal-case transition-all"
                  />
                  <button
                    type="submit"
                    disabled={trabajando || !codigoInput.trim()}
                    className="px-6 py-4 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 disabled:opacity-50 text-sm transition-colors"
                  >
                    Canjear código
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}