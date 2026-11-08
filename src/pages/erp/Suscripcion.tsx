import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { formatCLP } from '../../lib/fechas';
import { PLANES, periodoPlan, planPorId, WEBPAY_MODO_PRUEBA, type PlanId } from '../../lib/planes';

// Estilo visual por plan; los datos (nombre, precio, features) vienen de lib/planes.ts.
const ESTILO: Record<PlanId, { color: string; bg: string; iconBg: string; border: string }> = {
  free: { color: 'text-on-surface-variant', bg: 'bg-surface-container-low', iconBg: 'bg-primary/15 text-primary', border: 'border-outline-variant/30' },
  pro: { color: 'text-success', bg: 'bg-success/5', iconBg: 'bg-success/15 text-success', border: 'border-success/30' },
  premium: { color: 'text-warning', bg: 'bg-warning/5', iconBg: 'bg-warning/15 text-warning', border: 'border-warning/30' },
};

export default function Suscripcion() {
  const { perfil, user } = useAuth();
  const [pagando, setPagando] = useState<PlanId | null>(null);
  const [error, setError] = useState('');

  const nivelActual = perfil?.membresia_nivel ?? 'free';

  const iniciarPago = async (plan: Exclude<PlanId, 'free'>) => {
    if (!user) {
      setError('Debes iniciar sesión para suscribirte.');
      return;
    }
    setPagando(plan);
    setError('');
    try {
      const transaccion = await api.crearPagoWebpay(plan, user.id, user.email);

      // Redirigir a Webpay via POST con el token de la transacción
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = transaccion.url;
      const tokenInput = document.createElement('input');
      tokenInput.type = 'hidden';
      tokenInput.name = 'token_ws';
      tokenInput.value = transaccion.token_ws;
      form.appendChild(tokenInput);
      document.body.appendChild(form);
      try {
        form.submit();
      } catch (errSub) {
        setError(`No se pudo abrir Webpay: ${errSub instanceof Error ? errSub.message : String(errSub)}`);
        setPagando(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar el pago. Verifica que el servidor API esté corriendo.');
      setPagando(null);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto min-h-screen">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="w-14 h-14 rounded-2xl bg-warning/15 flex items-center justify-center mx-auto text-warning mb-4">
          <span className="material-symbols-outlined text-3xl">workspace_premium</span>
        </div>
        <h2 className="text-3xl font-extrabold text-on-surface tracking-tight">Elige tu plan</h2>
        <p className="text-on-surface-variant mt-2 font-medium max-w-xl mx-auto">
          Desbloquea todo el poder de PymEdu. Paga con tarjeta de débito o crédito a través de Webpay.
        </p>
        <span className="inline-block mt-4 text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-4 py-1.5 rounded-full">
          Tu plan actual: {planPorId(nivelActual).nombre}
        </span>
        {WEBPAY_MODO_PRUEBA && (
          <p className="mt-3 mx-auto w-fit flex items-center gap-2 text-xs font-bold text-warning bg-warning/10 border border-warning/30 px-4 py-2 rounded-2xl">
            <span className="material-symbols-outlined text-base">science</span>
            Modo prueba: los pagos con Webpay no generan cobros reales.
          </p>
        )}
      </div>

      {error && (
        <div className="mb-6 max-w-2xl mx-auto p-4 rounded-2xl bg-error/10 border border-error/30 text-error text-sm font-medium">
          {error}
        </div>
      )}

      {/* Planes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {PLANES.map(plan => {
          const esActual = plan.id === nivelActual;
          const estilo = ESTILO[plan.id];
          return (
            <div key={plan.id}
              className={`relative flex flex-col p-7 rounded-3xl shadow-sm border ${estilo.bg} ${estilo.border} ${plan.destacado ? 'shadow-lg scale-[1.02]' : ''}`}>
              {plan.destacado && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-extrabold uppercase tracking-widest bg-success text-inverse-on-surface px-3 py-1 rounded-full">
                  Más popular
                </span>
              )}
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center mb-4 ${estilo.iconBg}`}>
                <span className="material-symbols-outlined text-2xl">{plan.icon}</span>
              </div>
              <h3 className="text-lg font-extrabold text-on-surface">{plan.nombre}</h3>
              <p className="mt-2">
                <span className="text-3xl font-extrabold text-on-surface">
                  {plan.precio === 0 ? 'Gratis' : formatCLP(plan.precio)}
                </span>
                {plan.precio > 0 && <span className="text-sm text-on-surface-variant font-medium"> {periodoPlan(plan)}</span>}
              </p>
              <ul className="flex-1 mt-5 space-y-2.5">
                {plan.features.map(f => (
                  <li key={f.texto} className={`flex items-start gap-2 text-sm font-medium ${f.estado === 'proximamente' ? 'text-on-surface-variant/60' : 'text-on-surface-variant'}`}>
                    <span className={`material-symbols-outlined text-base mt-0.5 ${f.estado === 'proximamente' ? 'text-on-surface-variant/50' : estilo.color}`}>
                      {f.estado === 'proximamente' ? 'schedule' : 'check_circle'}
                    </span>
                    <span>
                      {f.texto}
                      {f.estado === 'proximamente' && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-warning">Próximamente</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                disabled={esActual || pagando !== null}
                onClick={() => iniciarPago(plan.id as Exclude<PlanId, 'free'>)}
                className={`mt-6 w-full py-3 rounded-2xl text-sm font-bold transition-all ${
                  esActual
                    ? 'bg-surface-container-highest text-on-surface-variant cursor-default'
                    : plan.id === 'free'
                      ? 'bg-surface-container-highest text-on-surface-variant cursor-not-allowed'
                      : `bg-primary hover:bg-primary/90 text-inverse-on-surface shadow-md glow-primary ${pagando ? 'opacity-60 cursor-wait' : ''}`
                }`}
              >
                {esActual
                  ? 'Plan actual'
                  : plan.id === 'free'
                    ? 'Incluido en tu cuenta'
                    : pagando === plan.id
                      ? 'Conectando con Webpay…'
                      : `Suscribirme · ${formatCLP(plan.precio)}`}
              </button>
            </div>
          );
        })}
      </div>

      {/* Info de pago: nunca mostrar datos de tarjetas de prueba fuera de desarrollo (corrección #6) */}
      <div className="max-w-3xl mx-auto bg-surface-container-lowest dark-card rounded-3xl shadow-sm p-6">
        <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-lg text-info">info</span>
          Pago seguro con Webpay Plus
          {WEBPAY_MODO_PRUEBA && (
            <span className="ml-auto text-[10px] font-extrabold uppercase tracking-widest bg-warning/15 text-warning px-2.5 py-1 rounded-full">Modo prueba</span>
          )}
        </h3>
        <p className="text-xs text-on-surface-variant font-medium leading-relaxed">
          Al elegir un plan serás redirigido a Webpay para pagar con tarjeta de débito o crédito chilena.
        </p>
        {WEBPAY_MODO_PRUEBA && import.meta.env.DEV && (
          <p className="mt-2 text-[11px] text-on-surface-variant/80 font-mono">
            [Solo desarrollo] Tarjeta de prueba Transbank: 4051 8856 0044 6623 · CVV 123 · RUT 11.111.111-1 · clave 123
          </p>
        )}
      </div>
    </div>
  );
}
