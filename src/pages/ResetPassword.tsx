import { useState, FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { api } from '../lib/api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al restablecer contraseña');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface-container-lowest rounded-3xl p-8 shadow-xl">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-white">lock_reset</span>
          </div>
          <h2 className="text-3xl font-extrabold text-on-surface">Restablecer contraseña</h2>
          <p className="text-on-surface-variant mt-2">Ingresa tu nueva contraseña</p>
        </div>

        {error && (
          <div className="p-4 mb-6 bg-error-container text-on-error-container rounded-xl text-sm font-medium">
            {error}
          </div>
        )}

        {success ? (
          <div className="p-4 mb-6 bg-success/10 text-success rounded-xl text-sm font-medium text-center">
            Contraseña restablecida correctamente. Redirigiendo al inicio de sesión...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-on-surface mb-1">Nueva contraseña</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-4 rounded-xl border-2 border-surface-container-high focus:border-primary/50 focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-on-surface mb-1">Confirmar contraseña</label>
              <input
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full p-4 rounded-xl border-2 border-surface-container-high focus:border-primary/50 focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                placeholder="Repite la contraseña"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !token}
              className="w-full py-4 mt-2 bg-primary text-inverse-on-surface text-lg font-bold rounded-xl shadow-lg hover:bg-primary/90 disabled:opacity-70 flex justify-center items-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Restablecer contraseña'}
            </button>
          </form>
        )}

        <p className="text-center mt-6 text-on-surface-variant font-medium">
          <Link to="/login" className="text-primary hover:underline">Volver al inicio de sesión</Link>
        </p>
      </div>
    </div>
  );
}
