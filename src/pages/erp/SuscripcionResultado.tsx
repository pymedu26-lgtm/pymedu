import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

interface PagoDetalle {
  buy_order: string;
  plan: string;
  monto: number;
  estado: string;
  codigo_autorizacion: string | null;
  tarjeta: string | null;
}

const fmt = (n: number) => `$${n.toLocaleString('es-CL')}`;

const CONFIG_ESTADO: Record<string, { icon: string; color: string; bg: string; titulo: string; desc: string }> = {
  aprobado: {
    icon: 'check_circle', color: 'text-emerald-400', bg: 'bg-emerald-500/15',
    titulo: '¡Pago aprobado!',
    desc: 'Tu suscripción fue activada. Ya puedes disfrutar de todas las funciones de tu nuevo plan.',
  },
  rechazado: {
    icon: 'cancel', color: 'text-red-400', bg: 'bg-red-500/15',
    titulo: 'Pago rechazado',
    desc: 'La transacción no fue autorizada por el emisor de la tarjeta. Puedes intentarlo nuevamente.',
  },
  cancelado: {
    icon: 'remove_shopping_cart', color: 'text-amber-400', bg: 'bg-amber-500/15',
    titulo: 'Pago cancelado',
    desc: 'Cancelaste la operación en Webpay. No se realizó ningún cobro.',
  },
  error: {
    icon: 'error', color: 'text-red-400', bg: 'bg-red-500/15',
    titulo: 'Error en el pago',
    desc: 'Ocurrió un problema procesando la transacción. Si el problema persiste, contacta a soporte.',
  },
};

export default function SuscripcionResultado() {
  const [searchParams] = useSearchParams();
  const estado = searchParams.get('estado') ?? 'error';
  const orden = searchParams.get('orden');
  const config = CONFIG_ESTADO[estado] ?? CONFIG_ESTADO.error;
  const { user, perfil, recargarPerfil } = useAuth();

  const [pago, setPago] = useState<PagoDetalle | null>(null);
  const [activando, setActivando] = useState(false);

  useEffect(() => {
    if (!orden) return;

    const activarMembresia = async (plan: string) => {
      const nivel = plan === 'premium' ? 'premium' : plan === 'pro' ? 'pro' : null;
      if (!nivel || !user || perfil?.membresia_nivel === nivel) return;

      setActivando(true);
      const expira = new Date(Date.now() + 30 * 86400000).toISOString();
      // Activa SU PROPIA membresia en el Postgres de Railway.
      try {
        await api.activarMembresia(nivel, expira);
        await recargarPerfil();
      } catch (err) {
        console.error('No se pudo activar la membresia:', err instanceof Error ? err.message : err);
      }
      setActivando(false);
    };

    api.getPagoWebpay(orden)
      .then(async res => {
        setPago(res.data);
        if (estado === 'aprobado' && res.data.estado === 'pagada') {
          await activarMembresia(res.data.plan);
        }
      })
      .catch(() => setPago(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orden]);

  return (
    <div className="p-6 md:p-8 max-w-xl mx-auto min-h-screen flex items-center">
      <div className="w-full bg-surface-container-lowest dark-card rounded-3xl shadow-sm p-10 text-center">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 ${config.bg}`}>
          <span className={`material-symbols-outlined text-4xl ${config.color}`}>{config.icon}</span>
        </div>
        <h2 className="text-2xl font-extrabold text-on-surface mb-2">{config.titulo}</h2>
        <p className="text-sm text-on-surface-variant font-medium leading-relaxed mb-6">{config.desc}</p>

        {activando && (
          <div className="mb-6 inline-block text-xs font-bold uppercase tracking-widest text-primary animate-pulse">
            Activando tu plan...
          </div>
        )}

        {pago && (
          <div className="bg-surface-container-low rounded-2xl p-5 text-left space-y-2 mb-6">
            {[
              ['Plan', pago.plan === 'pro' ? 'Pro' : 'Premium'],
              ['Monto', fmt(pago.monto)],
              ['Orden de compra', pago.buy_order],
              ...(pago.tarjeta ? [['Tarjeta', pago.tarjeta] as const] : []),
              ...(pago.codigo_autorizacion ? [['Código de autorización', pago.codigo_autorizacion] as const] : []),
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 text-sm">
                <span className="text-on-surface-variant font-medium">{label}</span>
                <span className="font-bold text-on-surface capitalize">{value}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {estado === 'aprobado' ? (
            <button
              onClick={() => { window.location.href = '/erp/inicio'; }}
              className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold py-3 px-6 rounded-2xl text-sm transition-colors shadow-md glow-primary"
            >
              Ir al inicio
            </button>
          ) : (
            <button
              onClick={() => { window.location.href = '/erp/suscripcion'; }}
              className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold py-3 px-6 rounded-2xl text-sm transition-colors shadow-md glow-primary"
            >
              Volver a intentar
            </button>
          )}
          <button
            onClick={() => { window.location.href = '/erp/inicio'; }}
            className="flex-1 bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-bold py-3 px-6 rounded-2xl text-sm transition-colors"
          >
            Ir al inicio
          </button>
        </div>
      </div>
    </div>
  );
}
