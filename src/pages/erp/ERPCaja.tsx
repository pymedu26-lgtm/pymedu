import { useMemo } from 'react';
import { formatCLP, formatFecha, periodoActual } from '../../lib/fechas';
import Paginacion, { usePaginacion } from '../../components/Paginacion';
import { useERP } from '../../1.-ERP/context/ERPContext';
import TablaResponsiva, { type ColumnaTabla } from '../../components/TablaResponsiva';

export default function ERPCaja() {
  const { movimientos, saldoActual, ventas, gastos } = useERP();
  const fmt = (n: number) => formatCLP(Math.abs(n));

  const totalIngresos = movimientos.filter(m => m.tipo === 'Ingreso').reduce((a, m) => a + m.monto, 0);
  const totalEgresos = movimientos.filter(m => m.tipo === 'Egreso').reduce((a, m) => a + m.monto, 0);

  const { ingresosMes, egresosMes } = useMemo(() => {
    const mes = periodoActual();
    return {
      ingresosMes: movimientos.filter(m => m.tipo === 'Ingreso' && m.fecha.slice(0, 7) === mes).reduce((a, m) => a + m.monto, 0),
      egresosMes: movimientos.filter(m => m.tipo === 'Egreso' && m.fecha.slice(0, 7) === mes).reduce((a, m) => a + m.monto, 0),
    };
  }, [movimientos]);

  const ordenados = useMemo(() => [...movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha)), [movimientos]);
  const paginacion = usePaginacion(ordenados, 30);

  type Movimiento = (typeof movimientos)[number];
  const chipTipo = (m: Movimiento) => (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${m.tipo === 'Ingreso' ? 'bg-success-container text-on-success-container' : 'bg-error/10 text-error'}`}>
      {m.tipo}
    </span>
  );
  const monto = (m: Movimiento) => (
    <span className={`font-extrabold whitespace-nowrap ${m.tipo === 'Ingreso' ? 'text-success' : 'text-error'}`}>
      {m.tipo === 'Ingreso' ? '+' : '−'}{fmt(m.monto)}
    </span>
  );

  const columnas: ColumnaTabla<Movimiento>[] = [
    { clave: 'fecha', titulo: 'Fecha', celda: m => <span className="text-on-surface-variant whitespace-nowrap">{formatFecha(m.fecha)}</span> },
    { clave: 'concepto', titulo: 'Concepto', celda: m => <span className="font-bold text-on-surface">{m.concepto}</span> },
    { clave: 'tipo', titulo: 'Tipo', celda: chipTipo },
    { clave: 'metodo', titulo: 'Método', celda: m => <span className="text-on-surface-variant text-xs capitalize">{m.metodo_pago || '—'}</span> },
    { clave: 'monto', titulo: 'Monto', alinear: 'derecha', celda: monto },
  ];

  const tarjeta = 'p-5 rounded-2xl border min-w-0';
  const cifra = 'text-2xl xl:text-3xl font-black mt-1 break-words';

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 md:space-y-8">
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-primary flex items-center gap-3">
          <span className="material-symbols-outlined text-3xl sm:text-4xl">account_balance</span>
          Caja y Bancos
        </h2>
        <p className="text-on-surface-variant mt-1 text-sm">Movimientos de caja generados automáticamente por ventas, gastos y abonos.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className={`${tarjeta} bg-primary/5 border-primary/20`}>
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">Saldo actual</p>
          <p className={`${cifra} text-primary`}>{fmt(saldoActual)}</p>
        </div>
        <div className={`${tarjeta} bg-success-container border-success/30`}>
          <p className="text-[10px] font-black uppercase tracking-widest text-on-success-container">Ingresos totales</p>
          <p className={`${cifra} text-on-success-container`}>{fmt(totalIngresos)}</p>
        </div>
        <div className={`${tarjeta} bg-error/5 border-error/20`}>
          <p className="text-[10px] font-black uppercase tracking-widest text-error">Egresos totales</p>
          <p className={`${cifra} text-error`}>{fmt(totalEgresos)}</p>
        </div>
        <div className={`${tarjeta} bg-surface-container-lowest border-outline-variant/20`}>
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Resultado del mes</p>
          <p className={`${cifra} text-on-surface`}>{fmt(ingresosMes - egresosMes)}</p>
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <TablaResponsiva
          filas={paginacion.visibles}
          clave={m => m.id}
          columnas={columnas}
          tituloTarjeta={m => m.concepto}
          subtituloTarjeta={m => formatFecha(m.fecha)}
          insigniaTarjeta={monto}
          datosTarjeta={m => [
            { etiqueta: 'Tipo', valor: chipTipo(m) },
            { etiqueta: 'Método', valor: <span className="capitalize">{m.metodo_pago || '—'}</span> },
          ]}
          vacio={<p className="p-8 text-center text-on-surface-variant">Aún no hay movimientos de caja.</p>}
        />
        {/* Saldo (antes el pie de la tabla): visible tanto en tarjetas como en tabla. */}
        <div className="flex items-center justify-between gap-4 bg-surface-container-low border-t-2 border-outline-variant/30 px-4 py-4 lg:px-6">
          <span className="font-extrabold text-on-surface">SALDO</span>
          <span className="font-extrabold text-primary text-right">{fmt(saldoActual)}</span>
        </div>
        <Paginacion {...paginacion} />
      </div>
    </div>
  );
}
