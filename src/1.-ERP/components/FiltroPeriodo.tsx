import SelectorFecha from './SelectorFecha';
import SelectorDesplegable, { OPCIONES_PERIODO } from '../../components/SelectorDesplegable';
import { cn } from '@/lib/utils';

interface FiltroPeriodoProps {
  periodo: string;
  etiqueta: string;
  rango: { fechaInicio: string; fechaFin: string };
  onPeriodo: (valor: string) => void;
  onRango: (rango: { fechaInicio: string; fechaFin: string }) => void;
  className?: string;
}

/**
 * Filtro de periodo compartido por Ventas, Gastos/Compras e Inventario. Mantiene el
 * selector a la izquierda y, al elegir "Rango Personalizado", muestra Desde/Hasta en
 * la misma fila alineados por la base. Asi el bloque crece de forma ordenada y no
 * empuja ni desajusta el resto de la cabecera (por ejemplo las pestanas de Inventario)
 * cuando las fechas aparecen.
 */
export default function FiltroPeriodo({
  periodo,
  etiqueta,
  rango,
  onPeriodo,
  onRango,
  className
}: FiltroPeriodoProps) {
  return (
    <div className={cn('flex flex-wrap items-end gap-3', className)}>
      <SelectorDesplegable
        icono="calendar_month"
        valor={periodo}
        onChange={onPeriodo}
        opciones={OPCIONES_PERIODO}
        hint={etiqueta}
      />
      {periodo === 'personalizado' && (
        <>
          <div className="flex flex-col w-full sm:w-auto">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">Desde</label>
            <SelectorFecha
              className="w-full sm:w-40"
              value={rango.fechaInicio}
              onChange={fecha => onRango({ ...rango, fechaInicio: fecha })}
            />
          </div>
          <div className="flex flex-col w-full sm:w-auto">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">Hasta</label>
            <SelectorFecha
              className="w-full sm:w-40"
              value={rango.fechaFin}
              onChange={fecha => onRango({ ...rango, fechaFin: fecha })}
            />
          </div>
        </>
      )}
    </div>
  );
}
