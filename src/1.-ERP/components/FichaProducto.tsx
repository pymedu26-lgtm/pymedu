// Ficha de un producto fraccionado (envases o granel): qué hay, de qué frasco sale cada venta,
// formas de venta con margen, historial por envase y acciones rápidas (abrir, merma, reponer).
import { useMemo, useState } from 'react';
import { useERP, type Producto, type MovimientoInventario } from '../context/ERPContext';
import { cn } from '@/lib/utils';
import { formatCLP, formatFecha } from '../../lib/fechas';
import CampoMoneda from '../../components/CampoMoneda';
import { costoPromedio } from '../services/costeo';
import { formatCostoBase, IVA } from '../services/registroProducto';
import {
  envasesDe, formatCantidad, nombreEnvase, resumenStock, siguienteCerrado, tipoPresentacion, usaEnvases,
} from '../services/inventarioFraccionado';

const campo = 'w-full rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20';
const etiqueta = 'mb-1 block text-xs font-bold text-on-surface-variant';
const ETIQUETA_TIPO: Record<MovimientoInventario['tipo'], string> = {
  ingreso: 'Ingreso', salida: 'Venta', ajuste: 'Ajuste', merma: 'Merma', devolucion: 'Devolución', apertura: 'Apertura',
};

type Accion = null | 'merma' | 'reponer';

export default function FichaProducto({ producto, onCerrar, puedeEditar }: { producto: Producto; onCerrar: () => void; puedeEditar: boolean }) {
  const { envases, lotes, inventario, movimientosInventario, abrirEnvase, operarEnvase, reponerEnvasesProducto, addMovimientoInventario } = useERP();
  // Siempre la versión viva del producto (cambia al abrir, mermar o reponer).
  const p = inventario.find(x => x.id === producto.id) ?? producto;
  const conEnvases = usaEnvases(p);
  const resumen = resumenStock(p, envases);
  const propios = useMemo(() => envasesDe(envases, p.id), [envases, p.id]);
  const codigo = (id?: string) => propios.find(e => e.id === id)?.codigo;
  const costoBase = costoPromedio(lotes, p.id, Number(p.costo) || 0);
  const [accion, setAccion] = useState<Accion>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [envaseId, setEnvaseId] = useState('');
  const [cantidad, setCantidad] = useState(0);
  const [costo, setCosto] = useState(0);
  const [motivo, setMotivo] = useState('');
  const u = p.unidadBase;
  const nombre = nombreEnvase(p);
  const plural = nombreEnvase(p, true);

  const historial = useMemo(() => movimientosInventario
    .filter(m => m.productoId === p.id)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 60), [movimientosInventario, p.id]);

  const resultado = (r: { ok: boolean; error?: { mensaje: string } }, ok: string) => {
    if (r.ok) { setAviso({ tipo: 'ok', texto: ok }); setAccion(null); setCantidad(0); setMotivo(''); setCosto(0); }
    else setAviso({ tipo: 'error', texto: r.error?.mensaje ?? 'No se pudo guardar.' });
  };
  const abrir = () => {
    const sig = siguienteCerrado(envases, p.id);
    const r = abrirEnvase(p.id);
    resultado(r as { ok: boolean; error?: { mensaje: string } }, sig ? `Se abrió ${sig.codigo}.` : 'Listo.');
  };
  const guardarAccion = () => {
    if (accion === 'merma') {
      const r = conEnvases
        ? operarEnvase(p.id, { tipo: 'merma', envaseId, cantidad, motivo })
        : addMovimientoInventario({ productoId: p.id, tipo: 'merma', cantidad, fecha: new Date().toISOString(), motivo });
      resultado(r as { ok: boolean; error?: { mensaje: string } }, `Merma de ${formatCantidad(cantidad, u)} registrada.`);
    } else if (accion === 'reponer') {
      const r = conEnvases
        ? reponerEnvasesProducto(p.id, { cantidadEnvases: cantidad, costoEnvase: costo, motivo })
        : addMovimientoInventario({ productoId: p.id, tipo: 'ingreso', cantidad, costoUnitario: costo || undefined, fecha: new Date().toISOString(), motivo });
      resultado(r as { ok: boolean; error?: { mensaje: string } }, conEnvases ? `Se agregaron ${cantidad} ${plural}.` : `Ingreso de ${formatCantidad(cantidad, u)} registrado.`);
    }
  };

  const presentaciones = (p.presentaciones ?? []).filter(x => x.activa);
  const costoInsumo = (id: string) => Number(inventario.find(i => i.id === id)?.costo) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-scrim/50 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`Ficha de ${p.nombre}`}>
      <div className="flex h-[100dvh] w-full max-w-4xl flex-col overflow-hidden bg-surface-container-lowest shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-3xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-outline-variant/20 bg-surface-container-low/50 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h3 className="truncate text-xl font-bold text-primary">{p.nombre}</h3>
            <p className="text-xs text-on-surface-variant">
              {conEnvases ? `Se compra en ${plural} de ${formatCantidad(Number(p.capacidadEnvase) || 0, u)}` : p.formaCompra === 'granel' ? 'Se compra a granel' : 'Se compra por unidad'}
              {' · '}{formatCostoBase(costoBase, u)}
            </p>
          </div>
          <button onClick={onCerrar} className="text-on-surface-variant hover:text-error" aria-label="Cerrar ficha"><span className="material-symbols-outlined">close</span></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {conEnvases && <>
              <div className="rounded-2xl bg-surface-container-low p-3"><dt className="text-[11px] text-on-surface-variant">Cerrados</dt><dd className="text-2xl font-black text-on-surface">{resumen.cerrados}</dd></div>
              <div className="rounded-2xl bg-surface-container-low p-3"><dt className="text-[11px] text-on-surface-variant">Abiertos</dt><dd className="text-2xl font-black text-on-surface">{resumen.abiertos.length}</dd></div>
            </>}
            <div className="rounded-2xl bg-primary/10 p-3"><dt className="text-[11px] text-on-surface-variant">Disponible</dt><dd className="text-2xl font-black text-primary">{formatCantidad(resumen.total, u)}</dd></div>
            <div className="rounded-2xl bg-surface-container-low p-3"><dt className="text-[11px] text-on-surface-variant">Valor a costo</dt><dd className="text-2xl font-black text-on-surface">{formatCLP(Math.round(resumen.total * costoBase))}</dd></div>
          </dl>

          {puedeEditar && (
            <div className="flex flex-wrap gap-2">
              {conEnvases && (
                <button type="button" onClick={abrir} disabled={resumen.cerrados === 0}
                  className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-xs font-bold text-inverse-on-surface disabled:opacity-40">
                  <span className="material-symbols-outlined text-base">lock_open</span> Abrir {nombre}
                </button>
              )}
              <button type="button" onClick={() => { setAccion(accion === 'merma' ? null : 'merma'); setAviso(null); setEnvaseId(resumen.abiertos[0]?.id ?? ''); }}
                className={cn('inline-flex items-center gap-1 rounded-full border px-4 py-2 text-xs font-bold', accion === 'merma' ? 'border-error bg-error/10 text-error' : 'border-outline-variant/50 text-on-surface')}>
                <span className="material-symbols-outlined text-base">heart_broken</span> Registrar merma
              </button>
              <button type="button" onClick={() => { setAccion(accion === 'reponer' ? null : 'reponer'); setAviso(null); setCosto(conEnvases ? Math.round(costoBase * (Number(p.capacidadEnvase) || 0)) : Math.round(costoBase)); }}
                className={cn('inline-flex items-center gap-1 rounded-full border px-4 py-2 text-xs font-bold', accion === 'reponer' ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/50 text-on-surface')}>
                <span className="material-symbols-outlined text-base">add_box</span> Reponer
              </button>
            </div>
          )}
          {aviso && <p className={cn('rounded-xl px-3 py-2 text-sm font-bold', aviso.tipo === 'ok' ? 'bg-success-container text-on-success-container' : 'bg-error/10 text-error')}>{aviso.texto}</p>}

          {accion && (
            <div className="grid gap-3 rounded-2xl border border-outline-variant/30 p-4 sm:grid-cols-2">
              {accion === 'merma' && conEnvases && (
                <div className="sm:col-span-2">
                  <label className={etiqueta} htmlFor="ficha-envase">¿De qué {nombre}?</label>
                  <select id="ficha-envase" className={campo} value={envaseId} onChange={e => setEnvaseId(e.target.value)}>
                    <option value="">Elige un {nombre}</option>
                    {propios.filter(e => e.estado === 'abierto' || e.estado === 'cerrado').map(e => (
                      <option key={e.id} value={e.id}>{e.codigo} · {e.estado} · quedan {formatCantidad(e.restante, u)}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className={etiqueta} htmlFor="ficha-cantidad">
                  {accion === 'reponer' && conEnvases ? `¿Cuántos ${plural} llegaron?` : `Cantidad (${formatCantidad(1, u).replace(/^1 /, '')})`}
                </label>
                <input id="ficha-cantidad" type="number" min={0} step="any" className={campo} value={cantidad || ''} onChange={e => setCantidad(Number(e.target.value))} />
              </div>
              {accion === 'reponer' && (
                <div>
                  <span className={etiqueta}>{conEnvases ? `Costo por ${nombre}` : `Costo por ${formatCantidad(1, u).replace(/^1 /, '')}`}</span>
                  <CampoMoneda valor={costo || ''} onChange={setCosto} className={campo} placeholder="$0" />
                </div>
              )}
              <div className={accion === 'merma' ? '' : 'sm:col-span-2'}>
                <label className={etiqueta} htmlFor="ficha-motivo">Motivo (obligatorio)</label>
                <input id="ficha-motivo" className={campo} value={motivo} placeholder={accion === 'merma' ? 'Se derramó, evaporación…' : 'Compra a proveedor'} onChange={e => setMotivo(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <button type="button" onClick={() => setAccion(null)} className="rounded-full px-4 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface-container-high">Cancelar</button>
                <button type="button" onClick={guardarAccion} className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-inverse-on-surface">Guardar</button>
              </div>
            </div>
          )}

          {conEnvases && (
            <section>
              <h4 className="mb-2 text-sm font-black text-on-surface">{plural.charAt(0).toUpperCase() + plural.slice(1)} abiertos</h4>
              {resumen.abiertos.length === 0 ? (
                <p className="text-xs text-on-surface-variant">No hay {plural} abiertos. Las porciones se venden desde un {nombre} abierto.</p>
              ) : (
                <ul className="space-y-2">
                  {resumen.abiertos.map(e => {
                    const pct = Math.max(0, Math.min(100, (e.restante / (e.capacidad || 1)) * 100));
                    return (
                      <li key={e.id} className="rounded-xl border border-outline-variant/30 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-black text-on-surface">{e.codigo}</span>
                          <span className="font-bold text-on-surface">{formatCantidad(e.restante, u)} de {formatCantidad(e.capacidad, u)}</span>
                          <span className="text-on-surface-variant">{e.abiertoEn ? `Abierto el ${formatFecha(e.abiertoEn.slice(0, 10))}` : ''}</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-container-high" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${e.codigo} al ${Math.round(pct)} %`}>
                          <div className={cn('h-full rounded-full', pct < 15 ? 'bg-error' : pct < 40 ? 'bg-secondary' : 'bg-primary')} style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {presentaciones.length > 0 && (
            <section>
              <h4 className="mb-2 text-sm font-black text-on-surface">Formas de venta</h4>
              <ul className="divide-y divide-outline-variant/20 rounded-xl border border-outline-variant/30">
                {presentaciones.map(x => {
                  const insumos = (Number(x.costoInsumos) || 0) + (x.receta ?? []).reduce((a, r) => a + costoInsumo(r.productoId) * r.cantidad, 0);
                  const costoTotal = costoBase * x.factor + insumos;
                  const neto = p.incluyeIva === false ? x.precio : x.precio / (1 + IVA);
                  const margen = neto > 0 ? ((neto - costoTotal) / neto) * 100 : 0;
                  return (
                    <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                      <span className="font-bold text-on-surface">{x.nombre}
                        <span className="ml-2 rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-bold text-on-surface-variant">{tipoPresentacion(p, x) === 'completa' ? `${nombre} completo` : 'porción'}</span>
                      </span>
                      <span className="text-on-surface-variant">Costo {formatCLP(Math.round(costoTotal))}</span>
                      <span className="font-black text-on-surface">{formatCLP(x.precio)}</span>
                      <span className={cn('rounded-md px-1.5 py-0.5 font-black', margen > 30 ? 'bg-success-container text-on-success-container' : margen > 15 ? 'bg-secondary/10 text-secondary' : 'bg-error/10 text-error')}>
                        {margen.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1 text-[11px] text-on-surface-variant">Margen sobre precio neto{p.incluyeIva === false ? '' : ' (sin IVA)'}. Todas las formas descuentan del mismo inventario.</p>
            </section>
          )}

          <section>
            <h4 className="mb-2 text-sm font-black text-on-surface">Historial</h4>
            {historial.length === 0 ? <p className="text-xs text-on-surface-variant">Sin movimientos.</p> : (
              <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-container-low text-[10px] uppercase tracking-wider text-on-surface-variant">
                    <tr><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2 text-right">Cantidad</th>{conEnvases && <th className="px-3 py-2">{nombre}</th>}<th className="px-3 py-2">Motivo</th></tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {historial.map(m => {
                      const signo = m.tipo === 'ingreso' || m.tipo === 'devolucion' ? '+' : m.tipo === 'salida' || m.tipo === 'merma' ? '−' : m.tipo === 'ajuste' && m.cantidad > 0 ? '+' : '';
                      const envasesTexto = m.consumos?.length ? [...new Set(m.consumos.map(c => codigo(c.envaseId)).filter(Boolean))].join(', ') : codigo(m.envaseId) ?? '';
                      return (
                        <tr key={m.id} className={cn(m.revertido && 'opacity-50')}>
                          <td className="whitespace-nowrap px-3 py-2 text-on-surface-variant">{formatFecha(m.fecha.slice(0, 10))}</td>
                          <td className="px-3 py-2 font-bold text-on-surface">{ETIQUETA_TIPO[m.tipo] ?? m.tipo}{m.revertido && <span className="ml-1 text-[10px] font-medium text-on-surface-variant">(anulada)</span>}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-bold">{m.tipo === 'apertura' ? '—' : `${signo}${formatCantidad(Math.abs(m.cantidad), u)}`}</td>
                          {conEnvases && <td className="px-3 py-2 text-on-surface-variant">{envasesTexto}</td>}
                          <td className="px-3 py-2 text-on-surface-variant">{m.motivo}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
