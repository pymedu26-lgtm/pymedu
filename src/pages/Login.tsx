import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, Rol } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

const rolRedirectMap: Record<string, string> = {
  superadmin: '/admin/inicio',
  admin_institucional: '/institucion/inicio',
  coordinador: '/programa/inicio',
  mentor: '/mentor/inicio',
  emprendedor: '/erp/inicio',
  dueño: '/erp/inicio',
  demo: '/demo/inicio',
};

const testAccounts = [
  { key: 'supadmin', label: 'Super Admin', icon: 'shield', color: 'bg-red-500', rol: 'superadmin' as Rol, email: 'supadmin@pymedu.com', password: 'Demo#2026' },
  { key: 'admin', label: 'Admin Institucional', icon: 'admin_panel_settings', color: 'bg-purple-500', rol: 'admin_institucional' as Rol, email: 'admin@colegiosanjose.cl', password: 'Demo#2026' },
  { key: 'coord', label: 'Coordinador', icon: 'group_work', color: 'bg-blue-500', rol: 'coordinador' as Rol, email: 'coord@colegiosanjose.cl', password: 'Demo#2026' },
  { key: 'ment', label: 'Mentor', icon: 'school', color: 'bg-teal-500', rol: 'mentor' as Rol, email: 'mentor@colegiosanjose.cl', password: 'Demo#2026' },
  { key: 'empre', label: 'Emprendedor', icon: 'storefront', color: 'bg-green-500', rol: 'emprendedor' as Rol, email: 'emprendedor@pymedu.com', password: 'Demo#2026' },
  { key: 'demo', label: 'Demo (todos los roles)', icon: 'visibility', color: 'bg-amber-500', rol: 'demo' as Rol, email: 'demo@pymedu.com', password: 'Demo#2026' },
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { user, perfil, signIn } = useAuth();

  const handleLoginError = (err: unknown) => {
    setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
  };

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const p = await signIn(email, password);
      navigate(rolRedirectMap[p.rol as string] ?? '/erp/inicio', { replace: true });
    } catch (err) {
      handleLoginError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleTestLogin = async (email: string, password: string) => {
    setLoading(true);
    setError('');
    try {
      const p = await signIn(email, password);
      navigate(rolRedirectMap[p.rol as string] ?? '/erp/inicio', { replace: true });
    } catch (err) {
      handleLoginError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface-container-lowest rounded-3xl p-8 shadow-xl">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-white">login</span>
          </div>
          <h2 className="text-3xl font-extrabold text-on-surface">Bienvenido</h2>
          <p className="text-on-surface-variant mt-2">Ingresa a tu cuenta PymEdu</p>
        </div>

        {error && (
          <div className="p-4 mb-6 bg-red-50 text-red-600 rounded-xl text-sm font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-on-surface mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-4 rounded-xl border-2 border-surface-container-high focus:border-primary/50 focus:ring-4 focus:ring-primary/10 outline-none transition-all"
              placeholder="tu@negocio.com"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-on-surface mb-1">Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-4 rounded-xl border-2 border-surface-container-high focus:border-primary/50 focus:ring-4 focus:ring-primary/10 outline-none transition-all"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 mt-2 bg-primary text-white text-lg font-bold rounded-xl shadow-lg hover:bg-primary/90 disabled:opacity-70 flex justify-center items-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entrar'}
          </button>
        </form>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-outline-variant"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-surface-container-lowest text-outline font-medium">Acceso rapido por rol</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {testAccounts.map((acc) => (
            <button
              key={acc.key}
              type="button"
              disabled={loading}
              onClick={() => handleTestLogin(acc.email, acc.password)}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border-2 border-surface-container-high hover:border-primary/30 hover:bg-primary/5 transition-all text-left disabled:opacity-50"
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${acc.color} text-white`}>
                <span className="material-symbols-outlined text-lg">{acc.icon}</span>
              </span>
              <div>
                <p className="text-sm font-bold text-on-surface">{acc.label}</p>
                <p className="text-xs text-on-surface-variant">{acc.email} / {acc.password}</p>
              </div>
            </button>
          ))}
        </div>

        <p className="text-center mt-6 text-on-surface-variant font-medium">
          ¿No tienes una cuenta? <Link to="/register" className="text-primary hover:underline">Regístrate</Link>
        </p>
      </div>
    </div>
  );
}
