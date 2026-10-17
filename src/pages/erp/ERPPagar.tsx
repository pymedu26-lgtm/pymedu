import { useState } from 'react';
import { useERP, MetodoPago } from '../../1.-ERP/context/ERPContext';
import SelectorFecha from '../../1.-ERP/components/SelectorFecha';
import CampoMoneda from '../../components/CampoMoneda';
import { cn, formatFecha } from '@/lib/utils';
import { DOCUMENT_LABELS, normalizeDocumentType } from '../../1.-ERP/services/documentCompliance';

const METODOS: { value: MetodoPago; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'cheque', label: 'Cheque' },
];

/** Deuda que el negocio tiene con un proveedor (gasto) o que un cliente debe al negocio (venta). */
type Deuda = { tipo: 'pago' | 'cobro'; id: string };

export default function ERPPagar() {
  const {
    gastos, ventas, getSaldoPendienteGasto, getSaldoPendienteVenta, getAbonosByReferencia, addAbono
  } = useERP();
  const [deudaModal, setDeudaModal] = useState<Deuda | null>(null);
  const [form, setForm] = useState({ monto: '', metodo_pago: 'efectivo' as MetodoPago, fecha: new Date().toISOString().split('T')[0] });

  const fmt = (n: number) => `$${Math.abs(n).toLocaleString('es-CL')}`;

  /** Gastos con saldo pendiente: lo que el negocio debe a sus proveedores. */
  const porPagar = gastos
    .filter(g => getSaldoPendienteGasto(g.id) > 0)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  /** Ventas con saldo pendiente: boletas o facturas que los clientes deben al negocio. */
  const porCobrar = ventas
    .filter(v => getSaldoPendienteVenta(v.id) > 0)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  const totalPorPagar = porPagar.reduce((a, g) => a + getSaldoPendienteGasto(g.id), 0);
  const totalPorCobrar = porCobrar.reduce((a, v) => a + getSaldoPendienteVenta(v.id), 0);

  const registrarAbono = () => {
    if (!deudaModal || !form.monto || Number(form.monto) <= 0) return;
    const monto = Number(form.monto);
    if (deudaModal.tipo === 'pago') {
      const gasto = gastos.find(g => g.id === deudaModal.id);
      if (!gasto) return;
      addAbono({
        referencia_id: deudaModal.id,
        tipo: 'pago',
        monto,
        monto_abono: monto,
        metodo_pago: form.metodo_pago,
        fecha: form.fecha,
        cliente_proveedor: gasto.proveedor,
        origen: 'manual',
      });
    } else {
      const venta = ventas.find(v => v.id === deudaModal.id);
      if (!venta) return;
      addAbono({
        referencia_id: deudaModal.id,
        tipo: 'cobro',
        monto,
        monto_abono: monto,
        metodo_pago: form.metodo_pago,
        fecha: form.fecha,
        cliente_proveedor: venta.cliente,
        origen: 'manual',
      });
    }
    setDeudaModal(null);
    setForm({ monto: '', metodo_pago: 'efectivo', fecha: new Date().toISOString().split('T')[0] });
  };

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-3xl font-extrabold text-primary flex items-center gap-3">
          <span className="material-symbols-outlined text-4xl">account_balance_wallet</span>
          Cuentas por Pagar y Cobrar
        </h2>
        <p className="text-on-surface-variant mt-1 text-sm">
          Lo que el negocio debe a proveedores y lo que los clientes deben por boletas o facturas.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-error/5 p-6 rounded-2xl border border-error/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-error">Total por pagar (proveedores)</p>
          <p className="text-3xl font-black text-error mt-1">{fmt(totalPorPagar)}</p>
          <p className="text-xs text-on-surface-variant mt-1">{porPagar.length} cuenta(s) pendiente(s)</p>
        </div>
        <div className="bg-secondary/5 p-6 rounded-2xl border border-secondary/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-secondary">Total por cobrar (clientes)</p>
          <p className="text-3xl font-black text-secondary mt-1">{fmt(totalPorCobrar)}</p>
          <p className="text-xs text-on-surface-variant mt-1">{porCobrar.length} boleta(s)/factura(s) pendiente(s)</p>
        </div>
      </div>

      {/* ══ Lo que debemos: gastos/proveedores ══ */}
      <section className="space-y-4">
        <h3 className="text-lg font-black text-error flex items-center gap-2">
          <span className="material-symbols-outlined text-xl">trending_up</span>
          Lo que debemos (proveedores)
        </h3>
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
                {porPagar.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-on-surface-variant">No hay cuentas por pagar pendientes.</td></tr>
                )}
                {porPagar.map(g => {
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
                        <button onClick={() => setDeudaModal({ tipo: 'pago', id: g.id })}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-error text-inverse-on-surface text-xs font-bold hover:bg-error/80 transition-colors">
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
      </section>

      {/* ══ Lo que nos deben: boletas/facturas de clientes ══ */}
      <section className="space-y-4">
        <h3 className="text-lg font-black text-secondary flex items-center gap-2">
          <span className="material-symbols-outlined text-xl">trending_down</span>
          Lo que nos deben (boletas o facturas de clientes)
        </h3>
        <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-container-low border-b border-outline-variant/20">
                <tr>
                  {['ID', 'Fecha', 'Cliente', 'Documento', 'Total', 'Saldo', 'Vence', 'Abonos', 'Acciones'].map(h => (
                    <th key={h} className="p-4 text-xs font-bold text-outline uppercase tracking-wider text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {porCobrar.length === 0 && (
                  <tr><td colSpan={9} className="p-8 text-center text-on-surface-variant">No hay boletas o facturas por cobrar pendientes.</td></tr>
                )}
                {porCobrar.map(v => {
                  const saldo = getSaldoPendienteVenta(v.id);
                  const abonos = getAbonosByReferencia(v.id);
                  return (
                    <tr key={v.id} className="hover:bg-surface-container-low/50 transition-colors">
                      <td className="p-4 font-mono text-xs text-outline">{v.id}</td>
                      <td className="p-4 text-on-surface-variant whitespace-nowrap">{formatFecha(v.fecha)}</td>
                      <td className="p-4 font-bold text-on-surface">{v.cliente}</td>
                      <td className="p-4 text-on-surface-variant">
                        <span className="px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-primary/10 text-primary">
                          {DOCUMENT_LABELS[normalizeDocumentType(v.tipo_documento)]}
                        </span>
                      </td>
                      <td className="p-4 font-bold text-on-surface">{fmt(v.monto)}</td>
                      <td className="p-4 font-extrabold text-secondary">{fmt(saldo)}</td>
                      <td className="p-4 text-on-surface-variant text-xs">{formatFecha(v.fecha_vencimiento)}</td>
                      <td className="p-4 text-on-surface-variant text-xs">{abonos.length ? abonos.length : '—'}</td>
                      <td className="p-4">
                        <button onClick={() => setDeudaModal({ tipo: 'cobro', id: v.id })}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-secondary text-inverse-on-surface text-xs font-bold hover:bg-secondary/80 transition-colors">
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
      </section>

      {deudaModal && (() => {
        const esPago = deudaModal.tipo === 'pago';
        const gasto = esPago ? gastos.find(g => g.id === deudaModal.id) : undefined;
        const venta = !esPago ? ventas.find(v => v.id === deudaModal.id) : undefined;
        const nombre = esPago ? gasto?.proveedor : venta?.cliente;
        const saldo = esPago
          ? (gasto ? getSaldoPendienteGasto(gasto.id) : 0)
          : (venta ? getSaldoPendienteVenta(venta.id) : 0);
        return (
          <div className="fixed inset-0 bg-scrim/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface-container-lowest rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-outline-variant/20 flex justify-between items-center">
                <div>
                  <h3 className={cn('text-lg font-bold', esPago ? 'text-error' : 'text-secondary')}>
                    {esPago ? 'Registrar pago' : 'Registrar cobro'}
                  </h3>
                  <p className="text-xs text-on-surface-variant mt-1">{nombre} · saldo {fmt(saldo)}</p>
                </div>
                <button onClick={() => setDeudaModal(null)} className="text-on-surface-variant hover:text-on-surface">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Monto</label>
                    <CampoMoneda valor={form.monto} onChange={monto => setForm({ ...form, monto: String(monto) })}
                      className={cn('px-4 py-3 border-2 rounded-xl font-bold outline-none bg-surface-container-lowest text-on-surface', esPago ? 'border-error/50 focus:border-error' : 'border-secondary/50 focus:border-secondary')} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Fecha</label>
                    <SelectorFecha value={form.fecha} onChange={fecha => setForm({ ...form, fecha: fecha })} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Método de pago</label>
                  <select value={form.metodo_pago} onChange={e => setForm({ ...form, metodo_pago: e.target.value as MetodoPago })}
                    className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-primary outline-none bg-surface-container-lowest text-on-surface">
                    {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="px-6 pb-6 flex gap-3">
                <button onClick={() => setDeudaModal(null)} className="flex-1 py-3 rounded-2xl border-2 border-outline-variant/50 font-bold text-on-surface-variant">Cancelar</button>
                <button onClick={registrarAbono} disabled={!form.monto || Number(form.monto) <= 0}
                  className={cn('flex-1 py-3 rounded-2xl text-inverse-on-surface font-bold disabled:opacity-50',
                    esPago ? 'bg-error' : 'bg-secondary')}>
                  {esPago ? 'Registrar Pago' : 'Registrar Cobro'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
