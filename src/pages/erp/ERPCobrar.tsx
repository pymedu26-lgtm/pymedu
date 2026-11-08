import { useState } from 'react';
import { useERP, MetodoPago } from '../../1.-ERP/context/ERPContext';
import SelectorFecha from '../../1.-ERP/components/SelectorFecha';
import CampoMoneda from '../../components/CampoMoneda';
import { cn, formatFecha } from '@/lib/utils';
import { formatCLP, hoyISO } from '../../lib/fechas';
import PestanasCuentas from '../../1.-ERP/components/PestanasCuentas';
import Paginacion, { usePaginacion } from '../../components/Paginacion';

/** Chip de vencimiento con días de atraso (corrección #15). */
export function ChipVencimiento({ fecha, diasAtraso }: { fecha?: string; diasAtraso: number }) {
  if (!fecha) return <span className="text-xs text-outline">Sin vencimiento</span>;
  if (diasAtraso > 0) {
    return (
      <span className="inline-flex flex-col">
        <span className="w-fit rounded-full bg-error-container px-2 py-0.5 text-[11px] font-bold text-on-error-container">Vencida · {diasAtraso} días</span>
        <span className="mt-0.5 text-[11px] text-outline">{formatFecha(fecha)}</span>
      </span>
    );
  }
  return <span className="text-xs text-on-surface-variant">{formatFecha(fecha)}</span>;
}

const METODOS: { value: MetodoPago; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'cheque', label: 'Cheque' },
];

export default function ERPCobrar() {
  const { ventas, saldos, getSaldoPendienteVenta, getAbonosByReferencia, addAbono } = useERP();
  const [abonoVentaId, setAbonoVentaId] = useState<string | null>(null);
  const [form, setForm] = useState({ monto: '', metodo_pago: 'efectivo' as MetodoPago, fecha: hoyISO() });
  const [soloVencidas, setSoloVencidas] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const fmt = (n: number) => formatCLP(Math.abs(n));

  // Fuente única de saldos: más atrasadas primero (corrección #4).
  const pendientes = saldos.pendientesCobrar.filter(d =>
    (!soloVencidas || d.diasAtraso > 0) &&
    (!busqueda || `${d.contraparte} ${d.numero}`.toLowerCase().includes(busqueda.toLowerCase())));
  const paginacion = usePaginacion(pendientes, 25, [soloVencidas, busqueda]);

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
    setForm({ monto: '', metodo_pago: 'efectivo', fecha: hoyISO() });
  };

  return (
    <div className="p-8 space-y-8">
      <PestanasCuentas />

      <div className="flex flex-wrap items-center gap-3">
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar cliente o documento…"
          className="w-full max-w-xs rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3 py-2 text-sm outline-none focus:border-primary" />
        <label className="flex items-center gap-2 text-sm font-semibold text-on-surface-variant">
          <input type="checkbox" checked={soloVencidas} onChange={e => setSoloVencidas(e.target.checked)} className="accent-[var(--color-error)]" />
          Solo vencidas ({saldos.resumen.ventasVencidas.toLocaleString('es-CL')} · {fmt(saldos.resumen.vencidoCobrar)})
        </label>
      </div>

      <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant/20">
              <tr>
                {['Documento', 'Fecha', 'Cliente', 'Total', 'Saldo', 'Vencimiento', 'Abonos', 'Acciones'].map(h => (
                  <th key={h} className="p-4 text-xs font-bold text-outline uppercase tracking-wider text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {pendientes.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-on-surface-variant">No hay cuentas por cobrar pendientes.</td></tr>
              )}
              {paginacion.visibles.map(v => {
                const abonos = getAbonosByReferencia(v.id);
                return (
                  <tr key={v.id} className={cn('hover:bg-surface-container-low/50 transition-colors', v.diasAtraso > 0 && 'bg-error/[0.03]')}>
                    <td className="p-4 font-bold text-xs text-on-surface whitespace-nowrap">{v.numero}</td>
                    <td className="p-4 text-on-surface-variant whitespace-nowrap">{formatFecha(v.fecha)}</td>
                    <td className="p-4 font-bold text-on-surface">{v.contraparte}</td>
                    <td className="p-4 font-bold text-on-surface">{fmt(v.monto)}</td>
                    <td className="p-4 font-extrabold text-secondary">{fmt(v.saldo)}</td>
                    <td className="p-4"><ChipVencimiento fecha={v.fechaVencimiento} diasAtraso={v.diasAtraso} /></td>
                    <td className="p-4 text-on-surface-variant text-xs">{abonos.length ? abonos.length : '—'}</td>
                    <td className="p-4">
                      <button onClick={() => setAbonoVentaId(v.id)}
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
        <Paginacion {...paginacion} />
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
                    <CampoMoneda valor={form.monto} onChange={monto => setForm({ ...form, monto: String(monto) })}
                      className="px-4 py-3 border-2 border-outline-variant/50 rounded-xl font-bold focus:border-secondary outline-none bg-surface-container-lowest text-on-surface" />
                  </div>
                  <div>
              <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Fecha</label>
              <SelectorFecha value={form.fecha} onChange={fecha => setForm({ ...form, fecha: fecha })} />
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
                  className={cn('flex-1 py-3 rounded-2xl bg-secondary text-inverse-on-surface font-bold disabled:opacity-50')}>
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