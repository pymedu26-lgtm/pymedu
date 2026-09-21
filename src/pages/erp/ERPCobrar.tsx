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

export default function ERPCobrar() {
  const { ventas, getSaldoPendienteVenta, getAbonosByReferencia, addAbono } = useERP();
  const [abonoVentaId, setAbonoVentaId] = useState<string | null>(null);
  const [form, setForm] = useState({ monto: '', metodo_pago: 'efectivo' as MetodoPago, fecha: new Date().toISOString().split('T')[0] });

  const fmt = (n: number) => `$${Math.abs(n).toLocaleString('es-CL')}`;

  const pendientes = ventas
    .filter(v => getSaldoPendienteVenta(v.id) > 0)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  const totalPorCobrar = pendientes.reduce((a, v) => a + getSaldoPendienteVenta(v.id), 0);

  const registrarAbono = () => {
    if (!abonoVentaId || !form.monto || Number(form.monto) <= 0) return;
    const venta = ventas.find(v => v.id === abonoVentaId);
    if (!venta) return;
    addAbono({
      referencia_id: abonoVentaId,
      tipo: 'cobro',
      monto: Number(form.monto),
      monto_abono: Number(form.monto),
      metodo_pago: form.metodo_pago,
      fecha: form.fecha,
      cliente_proveedor: venta.cliente,
      origen: 'manual',
    });
    setAbonoVentaId(null);
    setForm({ monto: '', metodo_pago: 'efectivo', fecha: new Date().toISOString().split('T')[0] });
  };

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-3xl font-extrabold text-secondary flex items-center gap-3">
          <span className="material-symbols-outlined text-4xl">payments</span>
          Cuentas por Cobrar
        </h2>
        <p className="text-on-surface-variant mt-1 text-sm">Ventas con saldo pendiente y cobros registrados.</p>
      </div>

      <div className="bg-secondary/10 p-6 rounded-2xl border border-secondary/20">
        <p className="text-[10px] font-black uppercase tracking-widest text-secondary">Total por cobrar</p>
        <p className="text-3xl font-black text-secondary mt-1">{fmt(totalPorCobrar)}</p>
      </div>

      <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant/20">
              <tr>
                {['ID', 'Fecha', 'Cliente', 'Total', 'Saldo', 'Vence', 'Abonos', 'Acciones'].map(h => (
                  <th key={h} className="p-4 text-xs font-bold text-outline uppercase tracking-wider text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {pendientes.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-on-surface-variant">No hay cuentas por cobrar pendientes.</td></tr>
              )}
              {pendientes.map(v => {
                const saldo = getSaldoPendienteVenta(v.id);
                const abonos = getAbonosByReferencia(v.id);
                return (
                  <tr key={v.id} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="p-4 font-mono text-xs text-outline">{v.id}</td>
                    <td className="p-4 text-on-surface-variant whitespace-nowrap">{formatFecha(v.fecha)}</td>
                    <td className="p-4 font-bold text-on-surface">{v.cliente}</td>
                    <td className="p-4 font-bold text-on-surface">{fmt(v.monto)}</td>
                    <td className="p-4 font-extrabold text-secondary">{fmt(saldo)}</td>
                    <td className="p-4 text-on-surface-variant text-xs">{formatFecha(v.fecha_vencimiento)}</td>
                    <td className="p-4 text-on-surface-variant text-xs">{abonos.length ? abonos.length : '—'}</td>
                    <td className="p-4">
                      <button onClick={() => setAbonoVentaId(v.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-secondary text-white text-xs font-bold hover:bg-secondary/80 transition-colors">
                        <span className="material-symbols-outlined text-sm">payments</span>
                        Cobrar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {abonoVentaId && (() => {
        const venta = ventas.find(v => v.id === abonoVentaId);
        const saldo = venta ? getSaldoPendienteVenta(venta.id) : 0;
        return (
          <div className="fixed inset-0 bg-scrim/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface-container-lowest rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-outline-variant/20 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-secondary">Registrar cobro</h3>
                  <p className="text-xs text-on-surface-variant mt-1">{venta?.cliente} · saldo {fmt(saldo)}</p>
                </div>
                <button onClick={() => setAbonoVentaId(null)} className="text-on-surface-variant hover:text-on-surface">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Monto</label>
                    <input type="number" value={form.monto} max={saldo} onChange={e => setForm({ ...form, monto: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl font-bold focus:border-secondary outline-none bg-surface-container-lowest text-on-surface" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Fecha</label>
                    <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-secondary outline-none bg-surface-container-lowest text-on-surface" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Método de pago</label>
                  <select value={form.metodo_pago} onChange={e => setForm({ ...form, metodo_pago: e.target.value as MetodoPago })}
                    className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-secondary outline-none bg-surface-container-lowest text-on-surface">
                    {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="px-6 pb-6 flex gap-3">
                <button onClick={() => setAbonoVentaId(null)} className="flex-1 py-3 rounded-2xl border-2 border-outline-variant/50 font-bold text-on-surface-variant">Cancelar</button>
                <button onClick={registrarAbono} disabled={!form.monto || Number(form.monto) <= 0}
                  className={cn('flex-1 py-3 rounded-2xl bg-secondary text-white font-bold disabled:opacity-50')}>
                  Registrar Cobro
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}