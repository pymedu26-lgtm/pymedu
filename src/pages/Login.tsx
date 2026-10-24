import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';
import { api } from '../lib/api';

const rolRedirectMap: Record<string, string> = {
  superadmin: '/admin/inicio',
  admin_institucional: '/institucion/inicio',
  coordinador: '/programa/inicio',
  mentor: '/mentor/inicio',
  emprendedor: '/erp/inicio',
  dueño: '/erp/inicio',
  demo: '/demo/inicio',
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');
  const navigate = useNavigate();
  const { signIn } = useAuth();

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

  const handleForgot = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotMsg('');
    setError('');
    try {
      await api.forgotPassword(forgotEmail || email);
      setForgotMsg('Si el correo existe, te enviaremos instrucciones para restablecer tu contraseña.');
    } catch (err) {
      setForgotMsg(err instanceof Error ? err.message : 'Error al solicitar recuperación');
    } finally {
      setForgotLoading(false);
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
          <div className="p-4 mb-6 bg-error-container text-on-error-container rounded-xl text-sm font-medium">
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
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-bold text-on-surface">Contraseña</label>
              <button type="button" onClick={() => { setShowForgot(true); setForgotEmail(email); setForgotMsg(''); }} className="text-sm text-primary hover:underline font-medium">¿Olvidaste tu contraseña?</button>
            </div>
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
            className="w-full py-4 mt-2 bg-primary text-inverse-on-surface text-lg font-bold rounded-xl shadow-lg hover:bg-primary/90 disabled:opacity-70 flex justify-center items-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entrar'}
          </button>
        </form>

        <p className="text-center mt-6 text-on-surface-variant font-medium">
          ¿No tienes una cuenta? <Link to="/register" className="text-primary hover:underline">Regístrate</Link>
        </p>
      </div>

      {showForgot && (
        <div className="fixed inset-0 bg-scrim/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-outline-variant/20 flex justify-between items-center">
              <h3 className="text-lg font-bold text-primary">Recuperar contraseña</h3>
              <button onClick={() => setShowForgot(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleForgot} className="p-6 space-y-4">
              <p className="text-sm text-on-surface-variant">Ingresa tu correo electrónico y te enviaremos instrucciones para restablecer tu contraseña.</p>
              <div>
                <label className="block text-sm font-bold text-on-surface mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="w-full p-4 rounded-xl border-2 border-surface-container-high focus:border-primary/50 focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                  placeholder="tu@negocio.com"
                />
              </div>
              {forgotMsg && (
                <div className="p-3 bg-primary/5 text-primary rounded-xl text-sm font-medium">
                  {forgotMsg}
                </div>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForgot(false)} className="flex-1 py-3 rounded-xl border-2 border-outline-variant/50 font-bold text-on-surface-variant">Cancelar</button>
                <button type="submit" disabled={forgotLoading} className="flex-1 py-3 rounded-xl bg-primary text-inverse-on-surface font-bold shadow-lg shadow-primary/20 disabled:opacity-70 flex justify-center items-center gap-2">
                  {forgotLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
