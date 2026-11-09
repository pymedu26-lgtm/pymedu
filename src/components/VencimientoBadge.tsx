import { cn } from '../lib/utils';
import { estadoVencimiento, formatearFechaLocal, hoyIso, parseFechaLocal } from '../lib/fecha';

interface Props {
  fecha?: string | null;
  className?: string;
}

/**
 * Fecha de vencimiento con su estado (vencida / por vencer).
 * Se usa en Cuentas por cobrar y por pagar para que una deuda atrasada no pase
 * desapercibida y para no mostrar fechas vacias sin contexto.
 */
export default function VencimientoBadge({ fecha, className }: Props) {
  if (!fecha) {
    return <span className={cn('text-xs text-on-surface-variant/60', className)}>Sin fecha</span>;
  }

  const hoy = hoyIso();
  const estado = estadoVencimiento(fecha, hoy);
  const objetivo = parseFechaLocal(fecha);
  const base = parseFechaLocal(hoy);
  const dias = objetivo && base ? Math.round((objetivo.getTime() - base.getTime()) / 86400000) : 0;

  return (
    <span className={cn('flex flex-col gap-1 leading-tight', className)}>
      <span className="text-xs text-on-surface-variant whitespace-nowrap">{formatearFechaLocal(fecha)}</span>
      {estado === 'vencida' && (
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-error-container px-2 py-0.5 text-[10px] font-bold text-on-error-container">
          <span aria-hidden="true" className="material-symbols-outlined text-[12px] leading-none">schedule</span>
          {Math.abs(dias)} día(s) de atraso
        </span>
      )}
      {estado === 'por_vencer' && (
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-warning-container px-2 py-0.5 text-[10px] font-bold text-on-warning-container">
          <span aria-hidden="true" className="material-symbols-outlined text-[12px] leading-none">hourglass_top</span>
          {dias === 0 ? 'Vence hoy' : `Vence en ${dias} día(s)`}
        </span>
      )}
    </span>
  );
}
