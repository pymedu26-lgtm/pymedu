import { useState, useMemo } from 'react';
import { isoLocal, nombrePeriodo, periodoActual } from '../../lib/fechas';
import { useERP } from '../../1.-ERP/context/ERPContext';
import { DOCUMENT_LABELS, STATUS_LABELS, type DocumentoTributario } from '../../1.-ERP/services/documentCompliance';
import TablaResponsiva, { type ColumnaTabla } from '../../components/TablaResponsiva';

export default function ERPIVAMensual() {
  const { getF29Preparador, documentosTributarios } = useERP();
  // El periodo seleccionado es exactamente el consultado (corrección #2): mes en curso local, no UTC.
  const [periodo, setPeriodo] = useState(periodoActual());

  const fmt = (n: number) => `$${Math.abs(n).toLocaleString('es-CL')}`;
  const f29 = getF29Preparador(periodo);

  // Siempre incluye el mes en curso y los últimos 24 meses, además de los meses con documentos.
  const periodosDisponibles = useMemo(() => {
    const base = new Date();
    const ultimos = Array.from({ length: 24 }, (_, i) => isoLocal(new Date(base.getFullYear(), base.getMonth() - i, 1)).slice(0, 7));
    return Array.from(new Set([...ultimos, ...documentosTributarios.map(d => d.periodoTributario).filter(Boolean)])).sort().reverse();
  }, [documentosTributarios]);
  const conDocumentos = useMemo(() => new Set(documentosTributarios.map(d => d.periodoTributario)), [documentosTributarios]);

  const documentos = documentosTributarios.filter(d => d.periodoTributario === periodo);

  const chipEstado = (d: DocumentoTributario) => (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${d.estado === 'aceptado_sii' ? 'bg-success-container text-on-success-container' : d.estado === 'rechazado_sii' ? 'bg-error/10 text-error' : 'bg-surface-container-high text-on-surface-variant'}`}>
      {STATUS_LABELS[d.estado] ?? d.estado}
    </span>
  );
  const tipoDoc = (d: DocumentoTributario) => DOCUMENT_LABELS[d.tipoDocumento] ?? d.tipoDocumento;

  const columnas: ColumnaTabla<DocumentoTributario>[] = [
    { clave: 'folio', titulo: 'Folio', celda: d => <span className="font-mono text-xs text-outline">{d.folioInterno}</span> },
    { clave: 'tipo', titulo: 'Tipo', celda: d => <span className="font-bold text-on-surface">{tipoDoc(d)}</span> },
    { clave: 'operacion', titulo: 'Operación', celda: d => <span className="text-on-surface-variant capitalize">{d.operacion}</span> },
    { clave: 'neto', titulo: 'Neto', celda: d => <span className="whitespace-nowrap">{fmt(d.neto)}</span> },
    { clave: 'iva', titulo: 'IVA', celda: d => <span className="whitespace-nowrap">{fmt(d.iva)}</span> },
    { clave: 'total', titulo: 'Total', celda: d => <span className="font-extrabold text-on-surface whitespace-nowrap">{fmt(d.total)}</span> },
    { clave: 'estado', titulo: 'Estado', celda: chipEstado },
  ];

  const cifra = 'text-2xl xl:text-3xl font-black mt-1 break-words';

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 md:space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-primary flex items-center gap-3">
            <span className="material-symbols-outlined text-3xl sm:text-4xl">account_balance_wallet</span>
            IVA Mensual (F29)
          </h2>
          <p className="text-on-surface-variant mt-1 text-sm">Débito y crédito fiscal por periodo, con detalle de documentos.</p>
        </div>
        <select value={periodo} onChange={e => setPeriodo(e.target.value)} aria-label="Periodo"
          className="w-full md:w-auto min-h-11 px-4 py-2.5 border-2 border-outline-variant/50 rounded-xl text-base sm:text-sm font-bold text-on-surface outline-none focus:border-primary bg-surface-container-lowest">
          {periodosDisponibles.map(p => <option key={p} value={p}>{nombrePeriodo(p)}{conDocumentos.has(p) ? '' : ' · sin documentos'}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-primary/5 p-5 sm:p-6 rounded-2xl border border-primary/20 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">IVA débito (ventas)</p>
          <p className={`${cifra} text-primary`}>{fmt(f29.ivaDebito)}</p>
        </div>
        <div className="bg-error/5 p-5 sm:p-6 rounded-2xl border border-error/20 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-error">IVA crédito (compras)</p>
          <p className={`${cifra} text-error`}>{fmt(f29.ivaCredito)}</p>
        </div>
        <div className="bg-secondary/10 p-5 sm:p-6 rounded-2xl border border-secondary/20 min-w-0 sm:col-span-2 lg:col-span-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-secondary">Diferencia (a pagar / saldo a favor)</p>
          <p className={`${cifra} ${f29.diferenciaIva >= 0 ? 'text-secondary' : 'text-success'}`}>{fmt(f29.diferenciaIva)}</p>
          {f29.ivaNotasCredito > 0 && <p className="text-[10px] font-bold text-on-surface-variant mt-1">Incluye notas de crédito: {fmt(f29.ivaNotasCredito)}</p>}
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-outline-variant/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="material-symbols-outlined text-primary">receipt_long</span>
            <div className="min-w-0">
              <h3 className="font-bold text-on-surface">Estimación del formulario</h3>
              <p className="text-xs text-on-surface-variant">Herramienta interna de preparación; no reemplaza la declaración oficial ante el SII.</p>
            </div>
          </div>
          <div className="sm:text-right shrink-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Total estimado a declarar</p>
            <p className="text-2xl font-black text-primary break-words">{fmt(f29.totalEstimado)}</p>
            <p className="text-[10px] font-bold text-on-surface-variant">PPM reconocido: {fmt(f29.ppm)} · {f29.documentosPendientes} doc(s) pendientes</p>
          </div>
        </div>
        {f29.alertas.length > 0 && (
          <div className="px-4 sm:px-6 py-4 space-y-2">
            {f29.alertas.map(a => (
              <p key={a} className="flex items-start gap-2 text-sm text-secondary bg-secondary/10 rounded-xl px-3 py-2">
                <span className="material-symbols-outlined text-base shrink-0">warning</span>{a}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-outline-variant/20 font-bold text-on-surface">Documentos del periodo ({documentos.length})</div>
        <TablaResponsiva
          filas={documentos}
          clave={d => d.id}
          columnas={columnas}
          tituloTarjeta={tipoDoc}
          subtituloTarjeta={d => <><span className="font-mono">{d.folioInterno}</span> · <span className="capitalize">{d.operacion}</span></>}
          insigniaTarjeta={chipEstado}
          datosTarjeta={d => [
            { etiqueta: 'Neto', valor: fmt(d.neto) },
            { etiqueta: 'IVA', valor: fmt(d.iva) },
            { etiqueta: 'Total', valor: <span className="font-extrabold">{fmt(d.total)}</span> },
          ]}
          vacio={<p className="p-8 text-center text-on-surface-variant">No hay documentos para {periodo}.</p>}
        />
      </div>
    </div>
  );
}
