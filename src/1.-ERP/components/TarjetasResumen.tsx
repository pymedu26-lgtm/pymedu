import { cn } from '@/lib/utils';

interface TarjetasResumenProps {
  totalVentas: number;
  totalGastos: number;
  /** Meta = totalGastos * 1.35. */
  meta: number;
  porcentajeMeta: number;
  enNumerosVerdes: boolean;
  /** Pie de la tarjeta de ventas: periodo activo o rango completo. */
  etiquetaPeriodo: string;
}

const monto = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/**
 * Las tres tarjetas de resumen (Total de Ventas, Total de Gastos y Meta al 35%)
 * son las mismas en Ventas y en Gastos: se calculan con los mismos filtros de
 * fecha, asi que viven aqui para que ambas paginas las pinten identicas.
 */
export default function TarjetasResumen({
  totalVentas,
  totalGastos,
  meta,
  porcentajeMeta,
  enNumerosVerdes,
  etiquetaPeriodo
}: TarjetasResumenProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-primary/5 p-6 rounded-2xl shadow-sm border border-primary/20">
        <p className="text-primary text-[10px] font-black uppercase tracking-[0.2em] mb-1">Total de Ventas</p>
        <h3 className="text-3xl font-black text-primary">{monto(totalVentas)}</h3>
        <p className="text-[10px] text-primary/60 mt-2 font-bold uppercase">{etiquetaPeriodo}</p>
      </div>
      <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-outline-variant/20">
        <p className="text-on-surface-variant text-[10px] font-black uppercase tracking-[0.2em] mb-1">Total de Gastos (Costos)</p>
        <h3 className="text-3xl font-extrabold text-error">{monto(totalGastos)}</h3>
        <p className="text-[10px] text-on-surface-variant/60 mt-2 font-bold uppercase tracking-tight">Egresos registrados en el periodo</p>
      </div>
      <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-outline-variant/20">
        <p className="text-on-surface-variant text-[10px] font-black uppercase tracking-[0.2em] mb-1">Meta de Ventas al 35%</p>
        <h3 className={cn('text-3xl font-extrabold', enNumerosVerdes ? 'text-emerald-600' : 'text-secondary')}>{monto(meta)}</h3>
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 h-1.5 bg-surface-container-high rounded-full overflow-hidden">
            <div
              className={cn('h-full transition-all duration-500', enNumerosVerdes ? 'bg-emerald-500' : 'bg-secondary')}
              style={{ width: `${Math.min(100, porcentajeMeta)}%` }}
            />
          </div>
          <span className={cn('text-[10px] font-black', enNumerosVerdes ? 'text-emerald-600' : 'text-secondary')}>{porcentajeMeta}%</span>
        </div>
      </div>
    </div>
  );
}
