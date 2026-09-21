import { useState } from 'react';
import { useERP, MetodoPago } from '../../1.-ERP/context/ERPContext';
import { cn, formatFecha } from '@/lib/utils';

const METODOS: { value: MetodoPago; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'cheque', label: 'Cheque' },
];

export default function ERPPagar() {
  const { gastos, getSaldoPendienteGasto, getAbonosByReferencia, addAbono } = useERP();
  const [abonoGastoId, setAbonoGastoId] = useState<string | null>(null);
  const [form, setForm] = useState({ monto: '', metodo_pago: 'efectivo' as MetodoPago, fecha: new Date().toISOString().split('T')[0] });

  const fmt = (n: number) => `$${Math.abs(n).toLocaleString('es-CL')}`;

  const pendientes = gastos
    .filter(g => getSaldoPendienteGasto(g.id) > 0)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  const totalPorPagar = pendientes.reduce((a, g) => a + getSaldoPendienteGasto(g.id), 0);

  const registrarAbono = () => {
    if (!abonoGastoId || !form.monto || Number(form.monto) <= 0) return;
    const gasto = gastos.find(g => g.id === abonoGastoId);
    if (!gasto) return;
    addAbono({
      referencia_id: abonoGastoId,
      tipo: 'pago',
      monto: Number(form.monto),
      monto_abono: Number(form.monto),
      metodo_pago: form.metodo_pago,
      fecha: form.fecha,
      cliente_proveedor: gasto.proveedor,
      origen: 'manual',
    });
    setAbonoGastoId(null);
    setForm({ monto: '', metodo_pago: 'efectivo', fecha: new Date().toISOString().split('T')[0] });
  };

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-3xl font-extrabold text-error flex items-center gap-3">
          <span className="material-symbols-outlined text-4xl">send_money</span>
          Cuentas por Pagar
        </h2>
        <p className="text-on-surface-variant mt-1 text-sm">Gastos con saldo pendiente y pagos registrados.</p>
      </div>

      <div className="bg-error/5 p-6 rounded-2xl border border-error/20">
        <p className="text-[10px] font-black uppercase tracking-widest text-error">Total por pagar</p>
        <p className="text-3xl font-black text-error mt-1">{fmt(totalPorPagar)}</p>
      </div>

      <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant/20">
              <tr>
                {['ID', 'Fecha', 'Proveedor', 'Total', 'Saldo', 'Vence', 'Abonos', 'Acciones'].map(h => (
                  <th key={h} className="p-4 text-xs font-bold text-outline uppercase tracking-wider text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {pendientes.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-on-surface-variant">No hay cuentas por pagar pendientes.</td></tr>
              )}
              {pendientes.map(g => {
                const saldo = getSaldoPendienteGasto(g.id);
                const abonos = getAbonosByReferencia(g.id);
                return (
                  <tr key={g.id} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="p-4 font-mono text-xs text-outline">{g.id}</td>
                    <td className="p-4 text-on-surface-variant whitespace-nowrap">{formatFecha(g.fecha)}</td>
                    <td className="p-4 font-bold text-on-surface">{g.proveedor}</td>
                    <td className="p-4 font-bold text-on-surface">{fmt(g.monto)}</td>
                    <td className="p-4 font-extrabold text-error">{fmt(saldo)}</td>
                    <td className="p-4 text-on-surface-variant text-xs">{formatFecha(g.fecha_vencimiento)}</td>
                    <td className="p-4 text-on-surface-variant text-xs">{abonos.length ? abonos.length : '—'}</td>
                    <td className="p-4">
                      <button onClick={() => setAbonoGastoId(g.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-error text-white text-xs font-bold hover:bg-error/80 transition-colors">
                        <span className="material-symbols-outlined text-sm">savings</span>
                        Pagar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {abonoGastoId && (() => {
        const gasto = gastos.find(g => g.id === abonoGastoId);
        const saldo = gasto ? getSaldoPendienteGasto(gasto.id) : 0;
        return (
          <div className="fixed inset-0 bg-scrim/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface-container-lowest rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-outline-variant/20 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-error">Registrar pago</h3>
                  <p className="text-xs text-on-surface-variant mt-1">{gasto?.proveedor} · saldo {fmt(saldo)}</p>
                </div>
                <button onClick={() => setAbonoGastoId(null)} className="text-on-surface-variant hover:text-on-surface">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Monto</label>
                    <input type="number" value={form.monto} max={saldo} onChange={e => setForm({ ...form, monto: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl font-bold focus:border-error outline-none bg-surface-container-lowest text-on-surface" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Fecha</label>
                    <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-error outline-none bg-surface-container-lowest text-on-surface" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Método de pago</label>
                  <select value={form.metodo_pago} onChange={e => setForm({ ...form, metodo_pago: e.target.value as MetodoPago })}
                    className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-error outline-none bg-surface-container-lowest text-on-surface">
                    {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="px-6 pb-6 flex gap-3">
                <button onClick={() => setAbonoGastoId(null)} className="flex-1 py-3 rounded-2xl border-2 border-outline-variant/50 font-bold text-on-surface-variant">Cancelar</button>
                <button onClick={registrarAbono} disabled={!form.monto || Number(form.monto) <= 0}
                  className={cn('flex-1 py-3 rounded-2xl bg-error text-white font-bold disabled:opacity-50')}>
                  Registrar Pago
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}