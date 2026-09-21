import { useState, useEffect, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

interface InstitucionResultado {
  id: string;
  nombre: string;
  rubro?: string | null;
  region?: string | null;
  comuna?: string | null;
}

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [institucion, setInstitucion] = useState<InstitucionResultado | null>(null);
  const [busquedaInst, setBusquedaInst] = useState('');
  const [resultadosInst, setResultadosInst] = useState<InstitucionResultado[]>([]);
  const [buscandoInst, setBuscandoInst] = useState(false);
  const [codigoInvitacion, setCodigoInvitacion] = useState('');
  const navigate = useNavigate();
  const { register } = useAuth();

  // Búsqueda de instituciones (debounce 350ms) para solicitar vinculación
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

  const handleRegister = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const perfil = await register(
        email.trim(),
        password,
        fullName.trim(),
        {
          institucion_id: institucion ? institucion.id : undefined,
          codigo_invitacion: codigoInvitacion.trim() ? codigoInvitacion.trim().toUpperCase() : undefined,
        }
      );

      const rolRedirectMap: Record<string, string> = {
        superadmin: '/admin/inicio',
        admin_institucional: '/institucion/inicio',
        coordinador: '/programa/inicio',
        mentor: '/mentor/inicio',
        emprendedor: '/erp/inicio',
        dueño: '/erp/inicio',
        demo: '/demo/inicio',
      };
      navigate(rolRedirectMap[String(perfil.rol)] ?? '/erp/inicio', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrarse');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface-container-lowest rounded-3xl p-8 shadow-xl">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-white">person_add</span>
          </div>
          <h2 className="text-3xl font-extrabold text-on-surface">Crea tu cuenta</h2>
          <p className="text-on-surface-variant mt-2">Nivel actual: PYME Free</p>
        </div>

        {error && (
          <div className="p-4 mb-6 bg-red-50 text-red-600 rounded-xl text-sm font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-on-surface mb-1">Nombre Completo</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full p-4 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none"
              placeholder="Ej. Juan Pérez"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-on-surface mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-4 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none"
              placeholder="tu@negocio.com"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-on-surface mb-1">
              Institución <span className="text-on-surface-variant font-medium">(opcional)</span>
            </label>
            {institucion ? (
              <div className="w-full p-4 rounded-xl border-2 border-surface-container-high flex items-center gap-3">
                <span className="material-symbols-outlined text-on-surface-variant">apartment</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-on-surface truncate">{institucion.nombre}</p>
                  <p className="text-xs text-on-surface-variant">
                    {[institucion.comuna, institucion.region].filter(Boolean).join(', ') || institucion.rubro}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setInstitucion(null)}
                  className="p-1 rounded-lg hover:bg-surface-container-lowest transition-colors"
                  title="Quitar institución"
                >
                  <span className="material-symbols-outlined text-on-surface-variant">close</span>
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={busquedaInst}
                  onChange={(e) => setBusquedaInst(e.target.value)}
                  className="w-full p-4 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none"
                  placeholder="Busca tu institución por nombre (ej. Instituto San José)"
                />
                {buscandoInst && (
                  <p className="absolute -bottom-6 left-0 text-xs text-on-surface-variant">Buscando...</p>
                )}
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
            <p className="text-xs text-on-surface-variant mt-2">
              Si eliges una institución, el administrador deberá aprobar tu solicitud antes de vincular tu cuenta.
            </p>
          </div>

          <div>
            <label className="block text-sm font-bold text-on-surface mb-1">
              Código de invitación <span className="text-on-surface-variant font-medium">(opcional)</span>
            </label>
            <input
              type="text"
              value={codigoInvitacion}
              onChange={(e) => setCodigoInvitacion(e.target.value)}
              className="w-full p-4 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none uppercase placeholder:normal-case"
              placeholder="Ej. AB12CD34"
            />
            <p className="text-xs text-on-surface-variant mt-2">
              Si tienes un código entregado por tu institución, canjéalo aquí y se vinculará tu cuenta de inmediato.
            </p>
          </div>

          <div>
            <label className="block text-sm font-bold text-on-surface mb-1">Contraseña</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-4 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 mt-2 bg-primary text-white text-lg font-bold rounded-xl shadow-lg hover:bg-primary/90 disabled:opacity-70 flex justify-center items-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Crear Cuenta'}
          </button>
        </form>

        <p className="text-center mt-6 text-on-surface-variant font-medium">
          ¿Ya tienes cuenta? <Link to="/login" className="text-primary hover:underline">Inicia sesión</Link>
        </p>
      </div>
    </div>
  );
}
