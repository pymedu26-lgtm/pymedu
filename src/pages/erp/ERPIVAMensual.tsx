import { useState } from 'react';
import { useERP } from '../../1.-ERP/context/ERPContext';

export default function ERPIVAMensual() {
  const { getF29Preparador, documentosTributarios } = useERP();
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7));

  const fmt = (n: number) => `$${Math.abs(n).toLocaleString('es-CL')}`;
  const f29 = getF29Preparador(periodo);

  const periodosDisponibles = Array.from(new Set(documentosTributarios.map(d => d.periodoTributario))).sort().reverse().slice(0, 12);

  const documentos = documentosTributarios.filter(d => d.periodoTributario === periodo);

  return (
    <div className="p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-primary flex items-center gap-3">
            <span className="material-symbols-outlined text-4xl">account_balance_wallet</span>
            IVA Mensual (F29)
          </h2>
          <p className="text-on-surface-variant mt-1 text-sm">Débito y crédito fiscal por periodo, con detalle de documentos.</p>
        </div>
        <select value={periodo} onChange={e => setPeriodo(e.target.value)}
          className="px-4 py-2.5 border-2 border-outline-variant/50 rounded-xl text-sm font-bold text-on-surface outline-none focus:border-primary bg-surface-container-lowest">
          {periodosDisponibles.length === 0 && <option value={periodo}>{periodo}</option>}
          {periodosDisponibles.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-primary/5 p-6 rounded-2xl border border-primary/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">IVA débito (ventas)</p>
          <p className="text-3xl font-black text-primary mt-1">{fmt(f29.ivaDebito)}</p>
        </div>
        <div className="bg-error/5 p-6 rounded-2xl border border-error/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-error">IVA crédito (compras)</p>
          <p className="text-3xl font-black text-error mt-1">{fmt(f29.ivaCredito)}</p>
        </div>
        <div className="bg-secondary/10 p-6 rounded-2xl border border-secondary/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-secondary">Diferencia (a pagar / saldo a favor)</p>
          <p className={`text-3xl font-black mt-1 ${f29.diferenciaIva >= 0 ? 'text-secondary' : 'text-emerald-600'}`}>{fmt(f29.diferenciaIva)}</p>
          {f29.ivaNotasCredito > 0 && <p className="text-[10px] font-bold text-on-surface-variant mt-1">Incluye notas de crédito: {fmt(f29.ivaNotasCredito)}</p>}
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-outline-variant/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary">receipt_long</span>
            <div>
              <h3 className="font-bold text-on-surface">Estimación del formulario</h3>
              <p className="text-xs text-on-surface-variant">Herramienta interna de preparación; no reemplaza la declaración oficial ante el SII.</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Total estimado a declarar</p>
            <p className="text-2xl font-black text-primary">{fmt(f29.totalEstimado)}</p>
            <p className="text-[10px] font-bold text-on-surface-variant">PPM reconocido: {fmt(f29.ppm)} · {f29.documentosPendientes} doc(s) pendientes</p>
          </div>
        </div>
        {f29.alertas.length > 0 && (
          <div className="px-6 space-y-2">
            {f29.alertas.map(a => (
              <p key={a} className="flex items-center gap-2 text-sm text-secondary bg-secondary/10 rounded-xl px-3 py-2">
                <span className="material-symbols-outlined text-base">warning</span>{a}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-outline-variant/20 font-bold text-on-surface">Documentos del periodo ({documentos.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant/20">
              <tr>
                {[ 'Folio', 'Tipo', 'Operación', 'Neto', 'IVA', 'Total', 'Estado'].map(h => (
                  <th key={h} className="p-4 text-xs font-bold text-outline uppercase tracking-wider text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {documentos.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-on-surface-variant">No hay documentos para {periodo}.</td></tr>
              )}
              {documentos.map(d => (
                <tr key={d.id} className="hover:bg-surface-container-low/50 transition-colors">
                  <td className="p-4 font-mono text-xs text-outline">{d.folioInterno}</td>
                  <td className="p-4 font-bold text-on-surface">{d.tipoDocumento}</td>
                  <td className="p-4 text-on-surface-variant capitalize">{d.operacion}</td>
                  <td className="p-4">{fmt(d.neto)}</td>
                  <td className="p-4">{fmt(d.iva)}</td>
                  <td className="p-4 font-extrabold text-on-surface">{fmt(d.total)}</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${d.estado === 'aceptado_sii' ? 'bg-emerald-100 text-emerald-700' : d.estado === 'rechazado_sii' ? 'bg-error/10 text-error' : 'bg-surface-container-high text-on-surface-variant'}`}>
                      {d.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}