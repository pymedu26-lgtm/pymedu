import { useMemo } from 'react';
import { useERP } from '../../1.-ERP/context/ERPContext';

export default function ERPCaja() {
  const { movimientos, saldoActual, ventas, gastos } = useERP();
  const fmt = (n: number) => `$${Math.abs(n).toLocaleString('es-CL')}`;

  const totalIngresos = movimientos.filter(m => m.tipo === 'Ingreso').reduce((a, m) => a + m.monto, 0);
  const totalEgresos = movimientos.filter(m => m.tipo === 'Egreso').reduce((a, m) => a + m.monto, 0);

  const { ingresosMes, egresosMes } = useMemo(() => {
    const mes = new Date().toISOString().slice(0, 7);
    return {
      ingresosMes: movimientos.filter(m => m.tipo === 'Ingreso' && m.fecha.slice(0, 7) === mes).reduce((a, m) => a + m.monto, 0),
      egresosMes: movimientos.filter(m => m.tipo === 'Egreso' && m.fecha.slice(0, 7) === mes).reduce((a, m) => a + m.monto, 0),
    };
  }, [movimientos]);

  const ordenados = [...movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha));

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-3xl font-extrabold text-primary flex items-center gap-3">
          <span className="material-symbols-outlined text-4xl">account_balance</span>
          Caja y Bancos
        </h2>
        <p className="text-on-surface-variant mt-1 text-sm">Movimientos de caja generados automaticamente por ventas, gastos y abonos.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-primary/5 p-5 rounded-2xl border border-primary/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">Saldo actual</p>
          <p className="text-3xl font-black text-primary mt-1">{fmt(saldoActual)}</p>
        </div>
        <div className="bg-success-container p-5 rounded-2xl border border-success/30">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-success-container">Ingresos totales</p>
          <p className="text-3xl font-black text-on-success-container mt-1">{fmt(totalIngresos)}</p>
        </div>
        <div className="bg-error/5 p-5 rounded-2xl border border-error/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-error">Egresos totales</p>
          <p className="text-3xl font-black text-error mt-1">{fmt(totalEgresos)}</p>
        </div>
        <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Resultado del mes</p>
          <p className="text-3xl font-black text-on-surface mt-1">{fmt(ingresosMes - egresosMes)}</p>
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant/20">
              <tr>
                {['Fecha', 'Concepto', 'Tipo', 'Metodo', 'Monto'].map(h => (
                  <th key={h} className="p-4 text-xs font-bold text-outline uppercase tracking-wider text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {ordenados.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-on-surface-variant">Aun no hay movimientos de caja.</td></tr>
              )}
              {ordenados.map(m => (
                <tr key={m.id} className="hover:bg-surface-container-low/50 transition-colors">
                  <td className="p-4 text-on-surface-variant whitespace-nowrap">{new Date(m.fecha).toLocaleDateString('es-CL')}</td>
                  <td className="p-4 font-bold text-on-surface">{m.concepto}</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${m.tipo === 'Ingreso' ? 'bg-success-container text-on-success-container' : 'bg-error/10 text-error'}`}>
                      {m.tipo}
                    </span>
                  </td>
                  <td className="p-4 text-on-surface-variant text-xs capitalize">{m.metodo_pago || '—'}</td>
                  <td className={`p-4 font-extrabold text-right ${m.tipo === 'Ingreso' ? 'text-success' : 'text-error'}`}>
                    {m.tipo === 'Ingreso' ? '+' : '−'}{fmt(m.monto)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-surface-container-low border-t-2 border-outline-variant/30">
              <tr>
                <td colSpan={4} className="p-4 font-extrabold text-on-surface">SALDO</td>
                <td className="p-4 font-extrabold text-primary text-right">{fmt(saldoActual)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}