import type { EstadoVivo } from '../tipos';
import { fechaHora } from '../util';
import { Chip } from './ui';

/** Tres estados de emisión: «Grabado», «En vivo ahora» o «Próxima sesión: dd-mm-aaaa HH:mm». */
export default function BadgeVivo({ estado, className }: { estado: EstadoVivo; className?: string }) {
  if (estado.tipo === 'en_vivo') {
    return (
      <Chip tono="peligro" className={className}>
        <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-current" /></span>
        En vivo ahora
      </Chip>
    );
  }
  if (estado.tipo === 'proxima') {
    return <Chip tono="info" icono="event" className={className}>Próxima sesión: {estado.inicio ? fechaHora(estado.inicio) : 'por confirmar'}</Chip>;
  }
  return <Chip icono="videocam" className={className}>Grabado</Chip>;
}
