import { NavLink } from 'react-router-dom';
import { useERP } from '../context/ERPContext';
import { cn } from '@/lib/utils';
import { formatCLP } from '../../lib/fechas';

/** Un solo módulo «Cuentas por cobrar y pagar» con dos pestañas (corrección #17). */
export default function PestanasCuentas() {
  const { saldos: { resumen } } = useERP();
  const pestanas = [
    { to: '/erp/cobrar', icono: 'payments', titulo: 'Por cobrar', total: resumen.porCobrar, docs: resumen.ventasPorCobrar, vencidos: resumen.ventasVencidas, unidad: 'ventas sin cobrar' },
    { to: '/erp/pagar', icono: 'account_balance_wallet', titulo: 'Por pagar', total: resumen.porPagar, docs: resumen.comprasPorPagar, vencidos: resumen.comprasVencidas, unidad: 'compras por pagar' },
  ];
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-3xl font-extrabold text-primary flex items-center gap-3">
          <span className="material-symbols-outlined text-4xl">payments</span>
          Cuentas por cobrar y pagar
        </h2>
        <p className="text-on-surface-variant mt-1 text-sm">Saldos a hoy, vencimientos y abonos. Las mismas cifras que el Panel, Clientes, Proveedores y Reportes.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {pestanas.map(p => (
          <NavLink key={p.to} to={p.to}
            className={({ isActive }) => cn(
              'rounded-2xl border p-4 transition-colors',
              isActive ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-outline-variant/30 bg-surface-container-lowest hover:bg-surface-container-low'
            )}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-bold text-on-surface">
                <span className="material-symbols-outlined text-lg text-primary">{p.icono}</span>{p.titulo}
              </span>
              {p.vencidos > 0 && (
                <span className="rounded-full bg-error-container px-2 py-0.5 text-[11px] font-bold text-on-error-container">{p.vencidos.toLocaleString('es-CL')} vencidas</span>
              )}
            </div>
            <p className="mt-2 text-2xl font-black text-on-surface">{formatCLP(p.total)}</p>
            <p className="text-xs text-on-surface-variant">{p.docs.toLocaleString('es-CL')} {p.unidad}</p>
          </NavLink>
        ))}
      </div>
    </div>
  );
}
