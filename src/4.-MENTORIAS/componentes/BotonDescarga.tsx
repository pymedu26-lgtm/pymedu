import { useState } from 'react';
import { cn } from '../../lib/utils';
import { mentoriasApi } from '../api';
import { descargarCertificado } from '../certificado';
import type { Certificado } from '../tipos';
import { Icono } from './ui';

/** Botón que ejecuta una descarga asíncrona mostrando «Preparando…» y, si falla, un aviso breve. */
export default function BotonDescarga({ icono, texto, descargar, className }: {
  icono: string; texto: string; descargar: () => Promise<void>; className?: string; key?: string;
}) {
  const [estado, setEstado] = useState<'listo' | 'cargando' | 'error'>('listo');
  const ejecutar = async () => {
    setEstado('cargando');
    try { await descargar(); setEstado('listo'); } catch { setEstado('error'); }
  };
  return (
    <span className={cn('inline-flex flex-col', className)}>
      <button type="button" className="m-btn m-btn-secundario w-full" onClick={ejecutar} disabled={estado === 'cargando'}>
        <Icono n={estado === 'cargando' ? 'hourglass_top' : icono} />{estado === 'cargando' ? 'Preparando…' : texto}
      </button>
      {estado === 'error' && <span role="alert" className="mt-1 text-xs text-(--m-danger)">No pudimos descargar el archivo. Inténtalo de nuevo.</span>}
    </span>
  );
}

export const BotonIcs = ({ sesionId, texto = 'Descargar .ics', className }: { sesionId: string; texto?: string; className?: string; key?: string }) =>
  <BotonDescarga icono="calendar_add_on" texto={texto} className={className} descargar={() => mentoriasApi.descargarIcs(sesionId)} />;

export const BotonCertificado = ({ certificado, className }: { certificado: Certificado; className?: string; key?: string }) =>
  <BotonDescarga icono="workspace_premium" texto="Descargar certificado" className={className} descargar={() => descargarCertificado(certificado)} />;
