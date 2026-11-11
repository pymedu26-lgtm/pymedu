import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { planPorId, periodoPlan } from '../lib/planes';
import { formatCLP } from '../lib/fechas';

const PLAN_PREMIUM = planPorId('premium');

/**
 * Candado de plan para rutas exclusivas de Premium.
 * Muestra una pantalla de mejora de plan en lugar de exponer el modulo a
 * cuentas Basicas o Pro. Reutiliza la misma regla que el menu lateral.
 */
export default function RequirePremium() {
  const { perfil } = useAuth();
  const esPremium = perfil?.membresia_nivel === 'premium';

  if (esPremium) return <Outlet />;

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <section className="w-full max-w-xl rounded-[32px] border border-outline-variant/50 bg-surface-container-lowest p-8 text-center shadow-xl dark-card">
        <span
          aria-hidden="true"
          className="material-symbols-outlined mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-warning-container text-3xl text-on-warning-container"
        >
          lock
        </span>
        <h1 className="mt-5 text-2xl font-black text-on-surface">
          Modulo disponible en el plan {PLAN_PREMIUM.nombre}
        </h1>
        <p className="mt-3 text-sm leading-6 text-on-surface-variant">
          Mercados Publicos y Portal Municipal forman parte de Premium. Con tu plan actual
          puedes seguir usando ventas, gastos, inventario, clientes, cobros y reportes.
        </p>

        <div className="mt-6 rounded-2xl border border-outline-variant/40 bg-surface-container p-4 text-left">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-outline">
            Plan {PLAN_PREMIUM.nombre}
          </p>
          <p className="mt-1 text-3xl font-black text-on-surface">
            {formatCLP(PLAN_PREMIUM.precio)}
            <span className="ml-1 text-sm font-semibold text-on-surface-variant">{periodoPlan(PLAN_PREMIUM)}</span>
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-on-surface-variant">
            {PLAN_PREMIUM.features.map((feature) => (
              <li key={feature.texto} className="flex items-start gap-2">
                <span aria-hidden="true" className="material-symbols-outlined text-base text-success">
                  check
                </span>
                {feature.texto}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            to="/erp/suscripcion"
            className="rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-inverse-on-surface transition-opacity hover:opacity-90"
          >
            Mejorar mi plan
          </Link>
          <Link
            to="/erp/inicio"
            className="rounded-2xl border border-outline-variant px-5 py-3 text-sm font-bold text-on-surface-variant transition-colors hover:bg-surface-container"
          >
            Volver al panel
          </Link>
        </div>
      </section>
    </div>
  );
}
