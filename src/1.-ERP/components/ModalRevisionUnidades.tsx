// Revisión de productos antiguos con unidades dudosas (requiereRevisionUnidades).
// Nunca se convierte solo: el usuario confirma qué significa el número guardado y recién ahí
// se convierte y se registra un ajuste «Conversión de unidades».
import { useState } from 'react';
import { useERP, type NombreEnvase, type Producto } from '../context/ERPContext';
import { cn } from '@/lib/utils';
import CampoMoneda from '../../components/CampoMoneda';
import { envasesDe, envaseVigente, formatCantidad, stockDisponible, type DecisionUnidades, type UnidadEntrada } from '../services/inventarioFraccionado';

const campo = 'w-full rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20';
const etiqueta = 'mb-1 block text-xs font-bold text-on-surface-variant';

export default function ModalRevisionUnidades({ productos, onCerrar }: { productos: Producto[]; onCerrar: () => void }) {
  const { envases, convertirUnidadesProducto } = useERP();
  const [indice, setIndice] = useState(0);
  const p = productos[Math.min(indice, productos.length - 1)];
  const tieneEnvases = !!p?.controlEnvases && envasesDe(envases, p.id).some(envaseVigente);
  /** Opción inicial sin convertir nada: usar los envases si existen; si se mide en kg/ml, dejarlo igual. */
  const opcionInicial = (x?: Producto): DecisionUnidades['tipo'] =>
    x?.controlEnvases && envasesDe(envases, x.id).some(envaseVigente) ? 'usar_envases' : x?.unidadBase && x.unidadBase !== 'unidad' ? 'mantener' : 'envases';
  const [opcion, setOpcion] = useState<DecisionUnidades['tipo']>(() => opcionInicial(productos[0]));
  const [nombreEnvase, setNombreEnvase] = useState<NombreEnvase>('frasco');
  const [contenido, setContenido] = useState(0);
  const [unidad, setUnidad] = useState<UnidadEntrada>(p?.unidadBase === 'kg' || p?.unidadBase === 'g' ? 'kg' : 'ml');
  const [costoEnvase, setCostoEnvase] = useState(Number(p?.costo) || 0);
  const [error, setError] = useState('');
  if (!p) return null;

  const stock = Number(p.stock) || 0;
  const u = p.unidadBase && p.unidadBase !== 'unidad' ? p.unidadBase : 'unidades';
  const siguiente = () => {
    setError('');
    const sig = productos[indice + 1];
    if (!sig) { onCerrar(); return; }
    setIndice(indice + 1);
    setContenido(0);
    setOpcion(opcionInicial(sig));
    setUnidad(sig.unidadBase === 'kg' || sig.unidadBase === 'g' ? 'kg' : 'ml');
    setCostoEnvase(Number(sig.costo) || 0);
  };
  const confirmar = () => {
    const decision: DecisionUnidades = opcion === 'envases'
      ? { tipo: 'envases', contenido, unidad, nombreEnvase, costoEnvase }
      : { tipo: opcion };
    const r = convertirUnidadesProducto(p.id, decision);
    if (!r.ok) { setError(r.error.mensaje); return; }
    siguiente();
  };
  const Opcion = ({ valor, titulo, detalle }: { valor: DecisionUnidades['tipo']; titulo: string; detalle?: string }) => (
    <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3', opcion === valor ? 'border-primary bg-primary/5' : 'border-outline-variant/30')}>
      <input type="radio" name="decision-unidades" className="mt-1 accent-primary" checked={opcion === valor} onChange={() => setOpcion(valor)} />
      <span><span className="block text-sm font-bold text-on-surface">{titulo}</span>{detalle && <span className="block text-xs text-on-surface-variant">{detalle}</span>}</span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-scrim/50 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Revisar unidades">
      <div className="flex h-[100dvh] w-full max-w-lg flex-col overflow-hidden bg-surface-container-lowest shadow-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-3xl">
        <div className="flex items-start justify-between border-b border-outline-variant/20 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-primary">Revisar unidades</h3>
            <p className="text-xs text-on-surface-variant">Producto {indice + 1} de {productos.length}</p>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="text-on-surface-variant hover:text-error"><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="space-y-4 overflow-y-auto p-5">
          <p className="text-sm text-on-surface">
            <b>{p.nombre}</b> tiene <b>{stock.toLocaleString('es-CL')}</b> en stock{u !== 'unidades' ? <> (guardado como {u})</> : null}.
            {tieneEnvases && <> Sus envases registrados suman <b>{formatCantidad(stockDisponible(p, envases), p.unidadBase)}</b>.</>}
            {' '}¿Qué significa ese número?
          </p>
          <div className="space-y-2">
            <Opcion valor="envases" titulo={`Son ${stock.toLocaleString('es-CL')} envases (frascos, sacos…)`} detalle="Indica cuánto trae cada uno y se convierte." />
            {tieneEnvases
              ? <Opcion valor="usar_envases" titulo={`Lo correcto es lo que suman los envases (${formatCantidad(stockDisponible(p, envases), p.unidadBase)})`} />
              : <Opcion valor="mantener" titulo={`Son ${formatCantidad(stock, p.unidadBase)}: está bien así`} detalle="Se vende a granel o por unidad, sin envases." />}
          </div>
          {opcion === 'envases' && (
            <div className="grid gap-3 rounded-xl border border-outline-variant/30 p-3 sm:grid-cols-2">
              <div>
                <label className={etiqueta} htmlFor="rev-envase">Se llaman</label>
                <select id="rev-envase" className={campo} value={nombreEnvase} onChange={e => setNombreEnvase(e.target.value as NombreEnvase)}>
                  <option value="frasco">Frascos</option><option value="botella">Botellas</option><option value="saco">Sacos</option><option value="caja">Cajas</option>
                </select>
              </div>
              <div>
                <label className={etiqueta} htmlFor="rev-contenido">Contenido de cada uno</label>
                <div className="flex gap-2">
                  <input id="rev-contenido" type="number" min={0} step="any" className={campo} value={contenido || ''} onChange={e => setContenido(Number(e.target.value))} />
                  <select aria-label="Unidad del contenido" className={cn(campo, 'w-auto')} value={unidad} onChange={e => setUnidad(e.target.value as UnidadEntrada)}>
                    <option value="ml">ml</option><option value="l">L</option><option value="g">g</option><option value="kg">kg</option><option value="unidad">unidades</option>
                  </select>
                </div>
              </div>
              <div className="sm:col-span-2">
                <span className={etiqueta}>Costo de cada envase</span>
                <CampoMoneda valor={costoEnvase || ''} onChange={setCostoEnvase} className={campo} placeholder="$0" />
              </div>
              {contenido > 0 && (
                <p className="text-xs font-bold text-primary sm:col-span-2">
                  Quedará: {stock.toLocaleString('es-CL')} {nombreEnvase}s de {contenido.toLocaleString('es-CL')} {unidad === 'l' ? 'L' : unidad === 'unidad' ? 'unidades' : unidad}.
                </p>
              )}
            </div>
          )}
          {error && <p className="text-sm font-bold text-error">{error}</p>}
          <p className="text-[11px] text-on-surface-variant">Al confirmar se registra un ajuste «Conversión de unidades» en el historial. Nada se convierte sin tu confirmación.</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-outline-variant/20 px-5 py-3">
          <button type="button" onClick={siguiente} className="rounded-full px-4 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-container-high">Revisar después</button>
          <button type="button" onClick={confirmar} className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-inverse-on-surface">Confirmar</button>
        </div>
      </div>
    </div>
  );
}
