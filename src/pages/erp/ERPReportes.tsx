import { useState } from 'react';
import { useERP } from '../../1.-ERP/context/ERPContext';

export default function ERPReportes() {
  const { ventas, gastos, inventario, getF29Preparador } = useERP();
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7));

  const fmt = (n: number) => `$${Math.abs(n).toLocaleString('es-CL')}`;

  const ventasPeriodo = ventas.filter(v => v.fecha.slice(0, 7) === periodo);
  const gastosPeriodo = gastos.filter(g => g.fecha.slice(0, 7) === periodo);
  const ingresos = ventasPeriodo.reduce((a, v) => a + v.monto, 0);
  const egresos = gastosPeriodo.reduce((a, g) => a + g.monto, 0);
  const netos = ventasPeriodo.reduce((a, v) => a + (v.subtotal ?? v.monto), 0);
  const costoVendido = ventasPeriodo.reduce((a, v) => a + v.productos.reduce((s, p) => s + (p.costoUnitario ?? 0) * (p.cantidad ?? 0), 0), 0);
  const margenBruto = netos - costoVendido;
  const valorInventario = inventario.reduce((a, p) => a + p.costo * p.stock, 0);

  const f29 = getF29Preparador(periodo);

  const periodosDisponibles = Array.from(new Set([...ventas, ...gastos].map(r => (r as any).fecha.slice(0, 7))))
    .sort().reverse().slice(0, 12);

  return (
    <div className="p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-primary flex items-center gap-3">
            <span className="material-symbols-outlined text-4xl">bar_chart</span>
            Reportes y Tributos
          </h2>
          <p className="text-on-surface-variant mt-1 text-sm">Resultado del negocio, IVA mensual (F29) y margen por periodo.</p>
        </div>
        <select value={periodo} onChange={e => setPeriodo(e.target.value)}
          className="px-4 py-2.5 border-2 border-outline-variant/50 rounded-xl text-sm font-bold text-on-surface outline-none focus:border-primary bg-surface-container-lowest">
          {periodosDisponibles.length === 0 && <option value={periodo}>{periodo}</option>}
          {periodosDisponibles.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-primary/5 p-5 rounded-2xl border border-primary/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">Ingresos del periodo</p>
          <p className="text-2xl font-black text-primary mt-1">{fmt(ingresos)}</p>
          <p className="text-[10px] font-bold text-on-surface-variant mt-1">{ventasPeriodo.length} ventas</p>
        </div>
        <div className="bg-error/5 p-5 rounded-2xl border border-error/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-error">Egresos del periodo</p>
          <p className="text-2xl font-black text-error mt-1">{fmt(egresos)}</p>
          <p className="text-[10px] font-bold text-on-surface-variant mt-1">{gastosPeriodo.length} gastos</p>
        </div>
        <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Margen bruto</p>
          <p className={`text-2xl font-black mt-1 ${margenBruto >= 0 ? 'text-emerald-600' : 'text-error'}`}>{fmt(margenBruto)}</p>
          <p className="text-[10px] font-bold text-on-surface-variant mt-1">{netos > 0 ? Math.round((margenBruto / netos) * 100) : 0}% de margen · sobre venta neta ({fmt(costoVendido)} de costo)</p>
        </div>
        <div className="bg-secondary/10 p-5 rounded-2xl border border-secondary/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-secondary">Valor de inventario</p>
          <p className="text-2xl font-black text-secondary mt-1">{fmt(valorInventario)}</p>
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-outline-variant/20 flex items-center gap-3">
          <span className="material-symbols-outlined text-primary">account_balance_wallet</span>
          <div>
            <h3 className="font-bold text-on-surface">Liquidación IVA Mensual (F29) — {periodo}</h3>
            <p className="text-xs text-on-surface-variant">Estimación interna del formulario 29. No reemplaza la declaración oficial.</p>
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {[
              { label: 'IVA débito', value: f29.ivaDebito },
              { label: 'IVA crédito', value: f29.ivaCredito },
              { label: 'Notas de crédito', value: f29.ivaNotasCredito },
              { label: 'Diferencia a pagar', value: f29.diferenciaIva },
              { label: 'PPM estimado', value: f29.ppm },
              { label: 'Total estimado', value: f29.totalEstimado },
              { label: 'Ventas POS conciliadas', value: f29.ventasPOSConciliadas, count: true },
              { label: 'Documentos pendientes', value: f29.documentosPendientes, count: true },
            ].map(item => (
              <div key={item.label} className="rounded-2xl bg-surface-container-low p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{item.label}</p>
                <p className="text-xl font-black text-on-surface mt-1">{item.count ? item.value : fmt(item.value)}</p>
              </div>
            ))}
          </div>
          {f29.alertas.length > 0 && (
            <div className="mt-4 space-y-2">
              {f29.alertas.map(a => (
                <p key={a} className="flex items-center gap-2 text-sm text-secondary bg-secondary/10 rounded-xl px-3 py-2">
                  <span className="material-symbols-outlined text-base">warning</span>{a}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-outline-variant/20 font-bold text-on-surface">Ventas del periodo</div>
          <div className="divide-y divide-outline-variant/10 max-h-80 overflow-y-auto">
            {ventasPeriodo.length === 0 && <p className="p-5 text-sm text-on-surface-variant">Sin ventas en {periodo}.</p>}
            {ventasPeriodo.slice(0, 15).map(v => (
              <div key={v.id} className="px-5 py-3 flex justify-between items-center">
                <div>
                  <p className="font-bold text-on-surface text-sm">{v.cliente}</p>
                  <p className="text-[10px] text-on-surface-variant">{v.fecha} · {v.id}</p>
                </div>
                <span className="font-extrabold text-primary">{fmt(v.monto)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-outline-variant/20 font-bold text-on-surface">Gastos del periodo</div>
          <div className="divide-y divide-outline-variant/10 max-h-80 overflow-y-auto">
            {gastosPeriodo.length === 0 && <p className="p-5 text-sm text-on-surface-variant">Sin gastos en {periodo}.</p>}
            {gastosPeriodo.slice(0, 15).map(g => (
              <div key={g.id} className="px-5 py-3 flex justify-between items-center">
                <div>
                  <p className="font-bold text-on-surface text-sm">{g.proveedor}</p>
                  <p className="text-[10px] text-on-surface-variant">{g.fecha} · {g.categoria}</p>
                </div>
                <span className="font-extrabold text-error">{fmt(g.monto)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}