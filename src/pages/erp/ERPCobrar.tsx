import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useERP, MetodoPago } from '../../1.-ERP/context/ERPContext';
import type { DocumentoPendiente } from '../../1.-ERP/services/saldos';
import SelectorFecha from '../../1.-ERP/components/SelectorFecha';
import CampoMoneda from '../../components/CampoMoneda';
import { cn, formatFecha } from '@/lib/utils';
import { formatCLP, hoyISO } from '../../lib/fechas';
import PestanasCuentas from '../../1.-ERP/components/PestanasCuentas';
import Paginacion, { usePaginacion } from '../../components/Paginacion';
import TablaResponsiva, { type ColumnaTabla } from '../../components/TablaResponsiva';
import ModalResponsivo from '../../components/ModalResponsivo';

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

const POR_PAGINA = 25;

export default function ERPCobrar() {
  const { ventas, saldos, getSaldoPendienteVenta, getAbonosByReferencia, addAbono } = useERP();
  const [abonoVentaId, setAbonoVentaId] = useState<string | null>(null);
  const [form, setForm] = useState({ monto: '', metodo_pago: 'efectivo' as MetodoPago, fecha: hoyISO() });
  const [soloVencidas, setSoloVencidas] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  // Enlace directo desde el Centro de alertas: /erp/cobrar?venta=ID
  const [searchParams] = useSearchParams();
  const ventaEnlazada = searchParams.get('venta');

  const fmt = (n: number) => formatCLP(Math.abs(n));

  // Fuente única de saldos: más atrasadas primero (corrección #4).
  const pendientes = saldos.pendientesCobrar.filter(d =>
    (!soloVencidas || d.diasAtraso > 0) &&
    (!busqueda || `${d.contraparte} ${d.numero}`.toLowerCase().includes(busqueda.toLowerCase())));
  const paginacion = usePaginacion(pendientes, POR_PAGINA, [soloVencidas, busqueda]);
  const { setPagina } = paginacion;

  /* Si la venta del enlace queda oculta por «Solo vencidas» o por la búsqueda, se quitan esos
   * filtros; luego se salta a la página donde está para que la tabla la resalte y la lleve a la
   * vista. Se atiende una vez por id: después el usuario puede filtrar y paginar libremente.
   * (Estado y no ref: con StrictMode los efectos corren dos veces y un ref ya marcado dejaba
   * ganar al reinicio a la página 1.) */
  const [enlaceAtendido, setEnlaceAtendido] = useState<string | null>(null);
  const docEnlazado = ventaEnlazada ? saldos.pendientesCobrar.find(d => d.id === ventaEnlazada) : undefined;
  useEffect(() => {
    if (!docEnlazado || enlaceAtendido === docEnlazado.id) return;
    if (soloVencidas && docEnlazado.diasAtraso <= 0) setSoloVencidas(false);
    if (busqueda && !`${docEnlazado.contraparte} ${docEnlazado.numero}`.toLowerCase().includes(busqueda.toLowerCase())) setBusqueda('');
  }, [docEnlazado, enlaceAtendido, soloVencidas, busqueda]);
  const indiceEnlazado = docEnlazado ? pendientes.findIndex(d => d.id === docEnlazado.id) : -1;
  useEffect(() => {
    // Va después del reinicio a la página 1 que hace usePaginacion al cambiar los filtros.
    if (!docEnlazado || enlaceAtendido === docEnlazado.id || indiceEnlazado < 0) return;
    setPagina(Math.floor(indiceEnlazado / POR_PAGINA) + 1);
    setEnlaceAtendido(docEnlazado.id);
  }, [docEnlazado, enlaceAtendido, indiceEnlazado, setPagina]);
  const enlaceSinSaldo = !!ventaEnlazada && !docEnlazado && ventas.some(v => v.id === ventaEnlazada);

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

  const botonCobrar = (v: DocumentoPendiente) => (
    <button type="button" onClick={() => setAbonoVentaId(v.id)}
      className="flex min-h-11 md:min-h-0 items-center gap-1 px-3 py-1.5 rounded-xl bg-secondary text-inverse-on-surface text-xs font-bold hover:bg-secondary/80 transition-colors">
      <span className="material-symbols-outlined text-sm">payments</span>
      Cobrar
    </button>
  );
  const numeroAbonos = (v: DocumentoPendiente) => {
    const n = getAbonosByReferencia(v.id).length;
    return n ? n : '—';
  };

  const columnas: ColumnaTabla<DocumentoPendiente>[] = [
    { clave: 'documento', titulo: 'Documento', celda: v => <span className="font-bold text-xs text-on-surface whitespace-nowrap">{v.numero}</span> },
    { clave: 'fecha', titulo: 'Fecha', celda: v => <span className="text-on-surface-variant whitespace-nowrap">{formatFecha(v.fecha)}</span> },
    { clave: 'cliente', titulo: 'Cliente', celda: v => <span className="font-bold text-on-surface">{v.contraparte}</span> },
    { clave: 'total', titulo: 'Total', celda: v => <span className="font-bold text-on-surface whitespace-nowrap">{fmt(v.monto)}</span> },
    { clave: 'saldo', titulo: 'Saldo', celda: v => <span className="font-extrabold text-secondary whitespace-nowrap">{fmt(v.saldo)}</span> },
    { clave: 'vencimiento', titulo: 'Vencimiento', celda: v => <ChipVencimiento fecha={v.fechaVencimiento} diasAtraso={v.diasAtraso} /> },
    { clave: 'abonos', titulo: 'Abonos', celda: v => <span className="text-on-surface-variant text-xs">{numeroAbonos(v)}</span> },
    { clave: 'acciones', titulo: 'Acciones', celda: botonCobrar },
  ];

  const venta = abonoVentaId ? ventas.find(v => v.id === abonoVentaId) : undefined;
  const saldoVenta = venta ? getSaldoPendienteVenta(venta.id) : 0;

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 md:space-y-8">
      <PestanasCuentas />

      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
        <input type="text" enterKeyHint="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar cliente o documento…"
          className="w-full sm:max-w-xs min-h-11 rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3 py-2 text-base sm:text-sm outline-none focus:border-primary" />
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-on-surface-variant">
          <input type="checkbox" checked={soloVencidas} onChange={e => setSoloVencidas(e.target.checked)} className="h-5 w-5 shrink-0 accent-[var(--color-error)]" />
          Solo vencidas ({saldos.resumen.ventasVencidas.toLocaleString('es-CL')} · {fmt(saldos.resumen.vencidoCobrar)})
        </label>
      </div>

      {enlaceSinSaldo && (
        <p className="flex items-center gap-2 rounded-2xl bg-success-container px-4 py-3 text-sm font-semibold text-on-success-container">
          <span className="material-symbols-outlined text-lg">task_alt</span>
          La venta del aviso ya no tiene saldo por cobrar.
        </p>
      )}

      <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <TablaResponsiva
          filas={paginacion.visibles}
          clave={v => v.id}
          columnas={columnas}
          resaltada={ventaEnlazada}
          tituloTarjeta={v => v.contraparte}
          subtituloTarjeta={v => `${v.numero} · ${formatFecha(v.fecha)}`}
          insigniaTarjeta={botonCobrar}
          datosTarjeta={v => [
            { etiqueta: 'Saldo', valor: <span className="font-extrabold text-secondary">{fmt(v.saldo)}</span> },
            { etiqueta: 'Total', valor: fmt(v.monto) },
            { etiqueta: 'Vencimiento', valor: <ChipVencimiento fecha={v.fechaVencimiento} diasAtraso={v.diasAtraso} /> },
            { etiqueta: 'Abonos', valor: numeroAbonos(v) },
          ]}
          vacio={<p className="p-8 text-center text-on-surface-variant">No hay cuentas por cobrar pendientes.</p>}
        />
        <Paginacion {...paginacion} />
      </div>

      {abonoVentaId && (
        <ModalResponsivo
          titulo={<span className="text-secondary">Registrar cobro</span>}
          subtitulo={`${venta?.cliente ?? ''} · saldo ${fmt(saldoVenta)}`}
          onCerrar={() => setAbonoVentaId(null)}
          ancho="sm:max-w-md"
          pie={
            <>
              <button type="button" onClick={() => setAbonoVentaId(null)} className="flex-1 min-h-11 py-3 rounded-2xl border-2 border-outline-variant/50 font-bold text-on-surface-variant">Cancelar</button>
              <button type="button" onClick={registrarAbono} disabled={!form.monto || Number(form.monto) <= 0}
                className={cn('flex-1 min-h-11 py-3 rounded-2xl bg-secondary text-inverse-on-surface font-bold disabled:opacity-50')}>
                Registrar Cobro
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Monto</label>
                <CampoMoneda valor={form.monto} onChange={monto => setForm({ ...form, monto: String(monto) })}
                  className="min-h-11 px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-base sm:text-sm font-bold focus:border-secondary outline-none bg-surface-container-lowest text-on-surface" />
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Fecha</label>
                <SelectorFecha value={form.fecha} onChange={fecha => setForm({ ...form, fecha: fecha })} />
              </div>
            </div>
            <div>
              <label htmlFor="cobro-metodo" className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Método de pago</label>
              <select id="cobro-metodo" value={form.metodo_pago} onChange={e => setForm({ ...form, metodo_pago: e.target.value as MetodoPago })}
                className="w-full min-h-11 px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-base sm:text-sm focus:border-secondary outline-none bg-surface-container-lowest text-on-surface">
                {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
        </ModalResponsivo>
      )}
    </div>
  );
}
