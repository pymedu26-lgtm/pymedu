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
import { ChipVencimiento } from './ERPCobrar';

const METODOS: { value: MetodoPago; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'cheque', label: 'Cheque' },
];

const POR_PAGINA = 25;

/** Deuda que el negocio tiene con un proveedor (gasto) o que un cliente debe al negocio (venta). */
type Deuda = { tipo: 'pago' | 'cobro'; id: string };

export default function ERPPagar() {
  const {
    gastos, ventas, saldos, getSaldoPendienteGasto, getSaldoPendienteVenta, getAbonosByReferencia, addAbono
  } = useERP();
  const [deudaModal, setDeudaModal] = useState<Deuda | null>(null);
  const [form, setForm] = useState({ monto: '', metodo_pago: 'efectivo' as MetodoPago, fecha: hoyISO() });
  const [soloVencidas, setSoloVencidas] = useState(false);
  // Enlace directo desde el Centro de alertas: /erp/pagar?gasto=ID
  const [searchParams] = useSearchParams();
  const gastoEnlazado = searchParams.get('gasto');

  const fmt = (n: number) => formatCLP(Math.abs(n));
  // Fuente única de saldos, más atrasados primero (correcciones #4 y #15).
  const pendientes = saldos.pendientesPagar.filter(d => !soloVencidas || d.diasAtraso > 0);
  const paginacion = usePaginacion(pendientes, POR_PAGINA, [soloVencidas]);
  const { setPagina } = paginacion;

  /* Si el gasto del enlace queda oculto por «Solo vencidas», se quita ese filtro; luego se salta
   * a su página para que la tabla lo resalte y lo lleve a la vista. Una vez por id (estado y no
   * ref, para que funcione igual con el doble efecto de StrictMode). */
  const [enlaceAtendido, setEnlaceAtendido] = useState<string | null>(null);
  const docEnlazado = gastoEnlazado ? saldos.pendientesPagar.find(d => d.id === gastoEnlazado) : undefined;
  useEffect(() => {
    if (!docEnlazado || enlaceAtendido === docEnlazado.id) return;
    if (soloVencidas && docEnlazado.diasAtraso <= 0) setSoloVencidas(false);
  }, [docEnlazado, enlaceAtendido, soloVencidas]);
  const indiceEnlazado = docEnlazado ? pendientes.findIndex(d => d.id === docEnlazado.id) : -1;
  useEffect(() => {
    // Va después del reinicio a la página 1 que hace usePaginacion al cambiar el filtro.
    if (!docEnlazado || enlaceAtendido === docEnlazado.id || indiceEnlazado < 0) return;
    setPagina(Math.floor(indiceEnlazado / POR_PAGINA) + 1);
    setEnlaceAtendido(docEnlazado.id);
  }, [docEnlazado, enlaceAtendido, indiceEnlazado, setPagina]);
  const enlaceSinSaldo = !!gastoEnlazado && !docEnlazado && gastos.some(g => g.id === gastoEnlazado);

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

  const botonPagar = (g: DocumentoPendiente) => (
    <button type="button" onClick={() => setDeudaModal({ tipo: 'pago', id: g.id })}
      className="flex min-h-11 md:min-h-0 items-center gap-1 px-3 py-1.5 rounded-xl bg-error text-inverse-on-surface text-xs font-bold hover:bg-error/80 transition-colors">
      <span className="material-symbols-outlined text-sm">savings</span>
      Pagar
    </button>
  );

  const columnas: ColumnaTabla<DocumentoPendiente>[] = [
    { clave: 'documento', titulo: 'Documento', celda: g => <span className="font-bold text-xs text-on-surface whitespace-nowrap">{g.numero}</span> },
    { clave: 'fecha', titulo: 'Fecha', celda: g => <span className="text-on-surface-variant whitespace-nowrap">{formatFecha(g.fecha)}</span> },
    { clave: 'proveedor', titulo: 'Proveedor', celda: g => <span className="font-bold text-on-surface">{g.contraparte}</span> },
    { clave: 'total', titulo: 'Total', celda: g => <span className="font-bold text-on-surface whitespace-nowrap">{fmt(g.monto)}</span> },
    { clave: 'saldo', titulo: 'Saldo', celda: g => <span className="font-extrabold text-error whitespace-nowrap">{fmt(g.saldo)}</span> },
    { clave: 'vencimiento', titulo: 'Vencimiento', celda: g => <ChipVencimiento fecha={g.fechaVencimiento} diasAtraso={g.diasAtraso} /> },
    { clave: 'abonos', titulo: 'Abonos', celda: g => <span className="text-on-surface-variant text-xs">{getAbonosByReferencia(g.id).length || '—'}</span> },
    { clave: 'acciones', titulo: 'Acciones', celda: botonPagar },
  ];

  const esPago = deudaModal?.tipo === 'pago';
  const gastoModal = deudaModal && esPago ? gastos.find(g => g.id === deudaModal.id) : undefined;
  const ventaModal = deudaModal && !esPago ? ventas.find(v => v.id === deudaModal.id) : undefined;
  const nombreModal = esPago ? gastoModal?.proveedor : ventaModal?.cliente;
  const saldoModal = esPago
    ? (gastoModal ? getSaldoPendienteGasto(gastoModal.id) : 0)
    : (ventaModal ? getSaldoPendienteVenta(ventaModal.id) : 0);

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 md:space-y-8">
      <PestanasCuentas />

      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-on-surface-variant">
        <input type="checkbox" checked={soloVencidas} onChange={e => setSoloVencidas(e.target.checked)} className="h-5 w-5 shrink-0" />
        Solo vencidas ({saldos.resumen.comprasVencidas.toLocaleString('es-CL')} · {fmt(saldos.resumen.vencidoPagar)})
      </label>

      {enlaceSinSaldo && (
        <p className="flex items-center gap-2 rounded-2xl bg-success-container px-4 py-3 text-sm font-semibold text-on-success-container">
          <span className="material-symbols-outlined text-lg">task_alt</span>
          El gasto del aviso ya no tiene saldo por pagar.
        </p>
      )}

      {pendientes.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm p-8 sm:p-12 text-center">
          <span className="material-symbols-outlined text-5xl text-secondary">task_alt</span>
          <h3 className="mt-4 text-lg font-bold text-on-surface">Todo al día</h3>
          <p className="mt-1 text-sm text-on-surface-variant">No tienes cuentas por pagar {soloVencidas ? 'vencidas' : 'pendientes'}.</p>
        </div>
      ) : (
        <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm overflow-hidden">
          <TablaResponsiva
            filas={paginacion.visibles}
            clave={g => g.id}
            columnas={columnas}
            resaltada={gastoEnlazado}
            tituloTarjeta={g => g.contraparte}
            subtituloTarjeta={g => `${g.numero} · ${formatFecha(g.fecha)}`}
            insigniaTarjeta={botonPagar}
            datosTarjeta={g => [
              { etiqueta: 'Saldo', valor: <span className="font-extrabold text-error">{fmt(g.saldo)}</span> },
              { etiqueta: 'Total', valor: fmt(g.monto) },
              { etiqueta: 'Vencimiento', valor: <ChipVencimiento fecha={g.fechaVencimiento} diasAtraso={g.diasAtraso} /> },
              { etiqueta: 'Abonos', valor: getAbonosByReferencia(g.id).length || '—' },
            ]}
          />
          <Paginacion {...paginacion} />
        </div>
      )}

      {deudaModal && (
        <ModalResponsivo
          titulo={<span className={esPago ? 'text-error' : 'text-secondary'}>{esPago ? 'Registrar pago' : 'Registrar cobro'}</span>}
          subtitulo={`${nombreModal ?? ''} · saldo ${fmt(saldoModal)}`}
          onCerrar={() => setDeudaModal(null)}
          ancho="sm:max-w-md"
          pie={
            <>
              <button type="button" onClick={() => setDeudaModal(null)} className="flex-1 min-h-11 py-3 rounded-2xl border-2 border-outline-variant/50 font-bold text-on-surface-variant">Cancelar</button>
              <button type="button" onClick={registrarAbono} disabled={!form.monto || Number(form.monto) <= 0}
                className={cn('flex-1 min-h-11 py-3 rounded-2xl text-inverse-on-surface font-bold disabled:opacity-50',
                  esPago ? 'bg-error' : 'bg-secondary')}>
                {esPago ? 'Registrar Pago' : 'Registrar Cobro'}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Monto</label>
                <CampoMoneda valor={form.monto} onChange={monto => setForm({ ...form, monto: String(monto) })}
                  className={cn('min-h-11 px-4 py-3 border-2 rounded-xl text-base sm:text-sm font-bold outline-none bg-surface-container-lowest text-on-surface', esPago ? 'border-error/50 focus:border-error' : 'border-secondary/50 focus:border-secondary')} />
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Fecha</label>
                <SelectorFecha value={form.fecha} onChange={fecha => setForm({ ...form, fecha: fecha })} />
              </div>
            </div>
            <div>
              <label htmlFor="pago-metodo" className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Método de pago</label>
              <select id="pago-metodo" value={form.metodo_pago} onChange={e => setForm({ ...form, metodo_pago: e.target.value as MetodoPago })}
                className="w-full min-h-11 px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-base sm:text-sm focus:border-primary outline-none bg-surface-container-lowest text-on-surface">
                {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
        </ModalResponsivo>
      )}
    </div>
  );
}
