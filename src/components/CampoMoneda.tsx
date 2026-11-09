import type { CSSProperties } from 'react';
import { useState } from 'react';
import { cn } from '../lib/utils';

const MASCARA_ARRIBA =
  "url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2016%2016'%3E%3Cpath%20d='M4%2010L8%205L12%2010'%20fill='none'%20stroke='%23000'%20stroke-width='2.4'%20stroke-linecap='round'%20stroke-linejoin='round'/%3E%3C/svg%3E\")";
const MASCARA_ABAJO =
  "url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2016%2016'%3E%3Cpath%20d='M4%206L8%2011L12%206'%20fill='none'%20stroke='%23000'%20stroke-width='2.4'%20stroke-linecap='round'%20stroke-linejoin='round'/%3E%3C/svg%3E\")";

const estiloFlecha = (mascara: string): CSSProperties => ({
  WebkitMaskImage: mascara,
  maskImage: mascara,
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
  WebkitMaskPosition: 'center',
  maskPosition: 'center',
  WebkitMaskSize: '0.6rem 0.6rem',
  maskSize: '0.6rem 0.6rem'
});

export const aEntero = (valor: number | string): number => {
  if (typeof valor === 'number') return Number.isFinite(valor) ? Math.round(valor) : 0;
  const texto = String(valor ?? '').trim();
  const negativo = texto.startsWith('-');
  const soloDigitos = texto.replace(/[^\d]/g, '');
  const numero = soloDigitos ? parseInt(soloDigitos, 10) : 0;
  return negativo ? -numero : numero;
};

export const formatearMoneda = (valor: number): string => {
  if (valor === 0) return '';
  const redondeado = Math.round(valor);
  return redondeado < 0
    ? `-$${Math.abs(redondeado).toLocaleString('es-CL')}`
    : `$${redondeado.toLocaleString('es-CL')}`;
};

interface CampoMonedaProps {
  valor: number | string;
  onChange: (valor: number) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  paso?: number;
}

export default function CampoMoneda({
  valor,
  onChange,
  placeholder = '$0',
  disabled,
  className,
  paso = 1
}: CampoMonedaProps) {
  const numero = aEntero(valor);
  const [errorNegativo, setErrorNegativo] = useState(false);

  const aplicar = (siguiente: number) => {
    if (siguiente < 0) {
      setErrorNegativo(true);
      return;
    }
    setErrorNegativo(false);
    onChange(siguiente);
  };

  const ajustar = (delta: number) => {
    aplicar(numero + delta * paso);
  };

  return (
    <div className={cn('relative', disabled && 'opacity-60')}>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        aria-invalid={errorNegativo || numero < 0}
        value={formatearMoneda(numero)}
        placeholder={placeholder}
        onChange={(e) => aplicar(aEntero(e.target.value))}
        className={cn('w-full', className, 'pr-9', (errorNegativo || numero < 0) && 'border-error focus:ring-error/30')}
      />
      {(errorNegativo || numero < 0) && (
        <p role="alert" className="mt-1 text-xs font-semibold text-error">
          El monto no puede ser negativo.
        </p>
      )}
      {!disabled && (
        <div className="absolute inset-y-1 right-1 flex w-5 flex-col">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Aumentar"
            onClick={() => ajustar(1)}
            className="group flex flex-1 items-center justify-center rounded-sm"
          >
            <span
              className="h-2 w-[0.55rem] bg-outline opacity-70 transition-colors group-hover:bg-primary group-hover:opacity-100"
              style={estiloFlecha(MASCARA_ARRIBA)}
            />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Disminuir"
            onClick={() => ajustar(-1)}
            className="group flex flex-1 items-center justify-center rounded-sm"
          >
            <span
              className="h-2 w-[0.55rem] bg-outline opacity-70 transition-colors group-hover:bg-primary group-hover:opacity-100"
              style={estiloFlecha(MASCARA_ABAJO)}
            />
          </button>
        </div>
      )}
    </div>
  );
}
