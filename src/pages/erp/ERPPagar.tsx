import { useState } from 'react';
import { useERP, MetodoPago } from '../../1.-ERP/context/ERPContext';
import SelectorFecha from '../../1.-ERP/components/SelectorFecha';
import CampoMoneda from '../../components/CampoMoneda';
import { cn, formatFecha } from '@/lib/utils';
import { formatCLP, hoyISO } from '../../lib/fechas';
import PestanasCuentas from '../../1.-ERP/components/PestanasCuentas';
import Paginacion, { usePaginacion } from '../../components/Paginacion';
import { ChipVencimiento } from './ERPCobrar';

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
    gastos, ventas, saldos, getSaldoPendienteGasto, getSaldoPendienteVenta, getAbonosByReferencia, addAbono
  } = useERP();
  const [deudaModal, setDeudaModal] = useState<Deuda | null>(null);
  const [form, setForm] = useState({ monto: '', metodo_pago: 'efectivo' as MetodoPago, fecha: hoyISO() });
  const [soloVencidas, setSoloVencidas] = useState(false);

  const fmt = (n: number) => formatCLP(Math.abs(n));
  // Fuente única de saldos, más atrasados primero (correcciones #4 y #15).
  const pendientes = saldos.pendientesPagar.filter(d => !soloVencidas || d.diasAtraso > 0);
  const paginacion = usePaginacion(pendientes, 25, [soloVencidas]);

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
    setForm({ monto: '', metodo_pago: 'efectivo', fecha: hoyISO() });
  };

  return (
    <div className="p-8 space-y-8">
      <PestanasCuentas />

      <label className="flex items-center gap-2 text-sm font-semibold text-on-surface-variant">
        <input type="checkbox" checked={soloVencidas} onChange={e => setSoloVencidas(e.target.checked)} />
        Solo vencidas ({saldos.resumen.comprasVencidas.toLocaleString('es-CL')} · {fmt(saldos.resumen.vencidoPagar)})
      </label>

      {pendientes.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm p-12 text-center">
          <span className="material-symbols-outlined text-5xl text-secondary">task_alt</span>
          <h3 className="mt-4 text-lg font-bold text-on-surface">Todo al día</h3>
          <p className="mt-1 text-sm text-on-surface-variant">No tienes cuentas por pagar {soloVencidas ? 'vencidas' : 'pendientes'}.</p>
        </div>
      ) : (
        <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-container-low border-b border-outline-variant/20">
                <tr>
                  {['Documento', 'Fecha', 'Proveedor', 'Total', 'Saldo', 'Vencimiento', 'Abonos', 'Acciones'].map(h => (
                    <th key={h} className="p-4 text-xs font-bold text-outline uppercase tracking-wider text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {paginacion.visibles.map(g => (
                  <tr key={g.id} className={cn('hover:bg-surface-container-low/50 transition-colors', g.diasAtraso > 0 && 'bg-error/[0.03]')}>
                    <td className="p-4 font-bold text-xs text-on-surface whitespace-nowrap">{g.numero}</td>
                    <td className="p-4 text-on-surface-variant whitespace-nowrap">{formatFecha(g.fecha)}</td>
                    <td className="p-4 font-bold text-on-surface">{g.contraparte}</td>
                    <td className="p-4 font-bold text-on-surface">{fmt(g.monto)}</td>
                    <td className="p-4 font-extrabold text-error">{fmt(g.saldo)}</td>
                    <td className="p-4"><ChipVencimiento fecha={g.fechaVencimiento} diasAtraso={g.diasAtraso} /></td>
                    <td className="p-4 text-on-surface-variant text-xs">{getAbonosByReferencia(g.id).length || '—'}</td>
                    <td className="p-4">
                      <button onClick={() => setDeudaModal({ tipo: 'pago', id: g.id })}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-error text-inverse-on-surface text-xs font-bold hover:bg-error/80 transition-colors">
                        <span className="material-symbols-outlined text-sm">savings</span>
                        Pagar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacion {...paginacion} />
        </div>
      )}

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
