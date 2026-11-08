// Ficha de un producto: qué hay (cerradas, abiertas con su remanente y fecha de apertura, o lotes
// a granel), subcategorías con margen y disponibles, historial (incluye aperturas automáticas y su
// venta) y acciones: abrir, registrar merma (cantidad o %), reponer (con vencimiento) y editar.
import { useEffect, useMemo, useState } from 'react';
import { useERP, type Producto, type MovimientoInventario } from '../context/ERPContext';
import { cn } from '@/lib/utils';
import { formatCLP, formatFecha } from '../../lib/fechas';
import CampoMoneda from '../../components/CampoMoneda';
import ModalResponsivo from '../../components/ModalResponsivo';
import { costoPromedio } from '../services/costeo';
import { formatCostoBase, IVA } from '../services/registroProducto';
import {
  envasesDe, formatCantidad, nombreEnvase, resumenStock, siguienteCerrado, tipoPresentacion, usaEnvases, remanentesSinUso,
  textoDisponibilidad, textoMinimo, adjetivo, aBase, estadoStockProducto, type UnidadEntrada,
} from '../services/inventarioFraccionado';

const campo = 'w-full min-h-11 rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3 py-2.5 text-base text-on-surface outline-none focus:ring-2 focus:ring-primary/20 sm:text-sm';
const etiqueta = 'mb-1 block text-xs font-bold text-on-surface-variant';
const boton = 'inline-flex min-h-11 items-center gap-1 rounded-full border px-4 text-xs font-bold';
const ETIQUETA_TIPO: Record<MovimientoInventario['tipo'], string> = {
  ingreso: 'Ingreso', salida: 'Venta', ajuste: 'Ajuste', merma: 'Merma', devolucion: 'Devolución', apertura: 'Apertura',
};
const MOTIVOS_MERMA = ['Deterioro', 'Pérdida de peso', 'Descarte', 'Derrame'];

type Accion = null | 'merma' | 'reponer';

interface Props {
  producto: Producto;
  onCerrar: () => void;
  puedeEditar: boolean;
  /** Abre directo la merma o la reposición (enlaces del Centro de alertas). */
  accionInicial?: 'reponer' | 'merma' | null;
  /** «Editar subcategorías»: abre el formulario del producto. */
  onEditar?: () => void;
}

export default function FichaProducto({ producto, onCerrar, puedeEditar, accionInicial, onEditar }: Props) {
  const { envases, lotes, inventario, movimientosInventario, abrirEnvase, registrarMerma, reponerEnvasesProducto, addMovimientoInventario, politicaEnvaseAbierto } = useERP();
  // Siempre la versión viva del producto (cambia al abrir, mermar o reponer).
  const p = inventario.find(x => x.id === producto.id) ?? producto;
  const conEnvases = usaEnvases(p);
  const resumen = resumenStock(p, envases);
  const propios = useMemo(() => envasesDe(envases, p.id), [envases, p.id]);
  const codigo = (id?: string) => propios.find(e => e.id === id)?.codigo;
  const costoBase = costoPromedio(lotes, p.id, Number(p.costo) || 0);
  const remanentes = remanentesSinUso(p, envases);
  const lotesVivos = lotes.filter(l => l.productoId === p.id && l.cantidadRestante > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const estado = estadoStockProducto(p, envases);
  const u = p.unidadBase;
  const granelEnKg = u === 'kg';
  const nombre = nombreEnvase(p);
  const plural = nombreEnvase(p, true);

  const [accion, setAccion] = useState<Accion>(accionInicial ?? null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [envaseId, setEnvaseId] = useState(resumen.abiertos[0]?.id ?? '');
  const [modoMerma, setModoMerma] = useState<'cantidad' | 'porcentaje'>('cantidad');
  const [cantidad, setCantidad] = useState(0);
  const [unidadIngreso, setUnidadIngreso] = useState<UnidadEntrada>(granelEnKg ? 'kg' : u === 'ml' ? 'l' : 'unidad');
  const [costo, setCosto] = useState(0);
  const [motivo, setMotivo] = useState('');
  const [vencimiento, setVencimiento] = useState('');
  useEffect(() => { if (accionInicial) prepararAccion(accionInicial); }, [accionInicial]);

  const historial = useMemo(() => movimientosInventario
    .filter(m => m.productoId === p.id)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 60), [movimientosInventario, p.id]);

  function prepararAccion(a: Accion) {
    setAviso(null);
    setAccion(prev => (prev === a && !accionInicial ? null : a));
    setCantidad(0);
    setMotivo('');
    if (a === 'merma') setEnvaseId(resumen.abiertos[0]?.id ?? '');
    if (a === 'reponer') setCosto(conEnvases ? Math.round(costoBase * (Number(p.capacidadEnvase) || 0)) : Math.round(costoBase * (unidadIngreso === 'l' ? 1000 : 1)));
  }
  const resultado = (r: { ok: boolean; error?: { mensaje: string } }, ok: string) => {
    if (r.ok) { setAviso({ tipo: 'ok', texto: ok }); setAccion(null); setCantidad(0); setMotivo(''); setCosto(0); setVencimiento(''); }
    else setAviso({ tipo: 'error', texto: r.error?.mensaje ?? 'No se pudo guardar.' });
  };
  const abrir = () => {
    const sig = siguienteCerrado(envases, p.id);
    resultado(abrirEnvase(p.id) as { ok: boolean; error?: { mensaje: string } }, sig ? `Se abrió ${sig.codigo}.` : 'Listo.');
  };
  const mermarRemanente = (id: string, restante: number) => {
    setAccion('merma'); setEnvaseId(id); setModoMerma('cantidad'); setCantidad(restante); setMotivo('Remanente sin uso'); setAviso(null);
  };
  const guardarAccion = () => {
    if (accion === 'merma') {
      const d = modoMerma === 'porcentaje' ? { porcentaje: cantidad } : { cantidad: granelEnKg && unidadIngreso === 't' ? cantidad * 1000 : cantidad };
      const r = registrarMerma(p.id, { ...d, motivo, ...(conEnvases ? { envaseId } : {}) });
      resultado(r as { ok: boolean; error?: { mensaje: string } }, modoMerma === 'porcentaje' ? `Merma del ${cantidad} % registrada.` : 'Merma registrada.');
    } else if (accion === 'reponer') {
      const r = conEnvases
        ? reponerEnvasesProducto(p.id, { cantidadEnvases: cantidad, costoEnvase: costo, motivo, vencimiento: vencimiento || undefined })
        : addMovimientoInventario({
          productoId: p.id, tipo: 'ingreso', cantidad: u === 'unidad' || !u ? cantidad : aBase(cantidad, unidadIngreso),
          costoUnitario: costo ? costo / (u === 'unidad' || !u ? 1 : aBase(1, unidadIngreso)) : undefined, fecha: new Date().toISOString(), motivo,
        }, { vencimiento: vencimiento || undefined });
      resultado(r as { ok: boolean; error?: { mensaje: string } }, conEnvases ? `Se agregaron ${cantidad} ${plural}.` : 'Ingreso registrado (nuevo lote).');
    }
  };

  const presentaciones = p.presentaciones ?? [];
  const costoInsumo = (id: string) => Number(inventario.find(i => i.id === id)?.costo) || 0;
  const Titulo = ({ children }: { children: string }) => <h4 className="mb-2 text-sm font-black text-on-surface">{children}</h4>;

  return (
    <ModalResponsivo titulo={p.nombre} onCerrar={onCerrar} ancho="sm:max-w-4xl" cerrarFuera
      subtitulo={<>
        {conEnvases ? `Se compra en ${plural} de ${formatCantidad(Number(p.capacidadEnvase) || 0, u)}` : p.formaCompra === 'granel' ? 'Se compra a granel' : 'Se compra por unidad'}
        {' · '}{formatCostoBase(costoBase, u)}{(p.stockMinimoUnidad ?? 0) > 0 ? ` · mínimo ${textoMinimo(p)}` : ''}
      </>}>
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {conEnvases ? <>
            <div className={cn('rounded-2xl p-3', estado === 'bajo' ? 'bg-secondary/10' : 'bg-surface-container-low')}>
              <dt className="text-[11px] text-on-surface-variant">{plural.charAt(0).toUpperCase() + plural.slice(1)} {adjetivo(p, 'cerrad', 2)}</dt>
              <dd className="text-2xl font-black text-on-surface">{resumen.cerrados}</dd>
            </div>
            <div className="rounded-2xl bg-surface-container-low p-3"><dt className="text-[11px] text-on-surface-variant">{adjetivo(p, 'abiert', 2).replace(/^a/, 'A')}</dt><dd className="text-2xl font-black text-on-surface">{resumen.abiertos.length}</dd></div>
          </> : (
            <div className="rounded-2xl bg-surface-container-low p-3"><dt className="text-[11px] text-on-surface-variant">Lotes con stock</dt><dd className="text-2xl font-black text-on-surface">{lotesVivos.length}</dd></div>
          )}
          <div className="rounded-2xl bg-primary/10 p-3">
            <dt className="text-[11px] text-on-surface-variant">Disponible</dt>
            <dd className="text-xl font-black text-primary sm:text-2xl">{formatCantidad(resumen.total, u)}</dd>
            {conEnvases && <dd className="text-[11px] font-bold text-on-surface-variant">equivale a {(resumen.equivalente ?? 0).toLocaleString('es-CL')} {plural}</dd>}
          </div>
          <div className="rounded-2xl bg-surface-container-low p-3"><dt className="text-[11px] text-on-surface-variant">Valor a costo</dt><dd className="text-xl font-black text-on-surface sm:text-2xl">{formatCLP(Math.round(resumen.total * costoBase))}</dd></div>
        </dl>

        {puedeEditar && (
          <div className="flex flex-wrap gap-2">
            {conEnvases && (
              <button type="button" onClick={abrir} disabled={resumen.cerrados === 0} className={cn(boton, 'border-primary bg-primary text-inverse-on-surface disabled:opacity-40')}>
                <span className="material-symbols-outlined text-base">lock_open</span> Abrir {nombre}
              </button>
            )}
            <button type="button" onClick={() => prepararAccion('merma')}
              className={cn(boton, accion === 'merma' ? 'border-error bg-error/10 text-error' : 'border-outline-variant/50 text-on-surface')}>
              <span className="material-symbols-outlined text-base">delete_sweep</span> Registrar merma
            </button>
            <button type="button" onClick={() => prepararAccion('reponer')}
              className={cn(boton, accion === 'reponer' ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/50 text-on-surface')}>
              <span className="material-symbols-outlined text-base">add_box</span> Reponer
            </button>
            {onEditar && (
              <button type="button" onClick={onEditar} className={cn(boton, 'border-outline-variant/50 text-on-surface')}>
                <span className="material-symbols-outlined text-base">tune</span> Editar subcategorías
              </button>
            )}
          </div>
        )}
        {aviso && <p role="status" className={cn('rounded-xl px-3 py-2 text-sm font-bold', aviso.tipo === 'ok' ? 'bg-success-container text-on-success-container' : 'bg-error/10 text-error')}>{aviso.texto}</p>}

        {accion && (
          <div className="grid gap-3 rounded-2xl border border-outline-variant/30 p-4 sm:grid-cols-2">
            <p className="text-sm font-black text-on-surface sm:col-span-2">{accion === 'merma' ? 'Registrar merma' : 'Reponer'}</p>
            {accion === 'merma' && conEnvases && (
              <div className="sm:col-span-2">
                <label className={etiqueta} htmlFor="ficha-envase">¿De qué {nombre}?</label>
                <select id="ficha-envase" className={campo} value={envaseId} onChange={e => setEnvaseId(e.target.value)}>
                  <option value="">Elige {adjetivo(p, 'abiert', 1) === 'abierta' ? 'una' : 'un'} {nombre}</option>
                  {propios.filter(e => e.estado === 'abierto' || e.estado === 'cerrado').map(e => (
                    <option key={e.id} value={e.id}>{e.codigo} · {e.estado === 'abierto' ? adjetivo(p, 'abiert', 1) : adjetivo(p, 'cerrad', 1)} · quedan {formatCantidad(e.restante, u)}</option>
                  ))}
                </select>
              </div>
            )}
            {accion === 'merma' && !conEnvases && (
              <p className="text-[11px] text-on-surface-variant sm:col-span-2">Sale del lote más antiguo{lotesVivos[0] ? ` (del ${formatFecha(lotesVivos[0].fecha)})` : ''} con su costo.</p>
            )}
            {accion === 'merma' && (
              <div className="flex gap-2 sm:col-span-2" role="radiogroup" aria-label="Merma por cantidad o porcentaje">
                {(['cantidad', 'porcentaje'] as const).map(m => (
                  <button key={m} type="button" role="radio" aria-checked={modoMerma === m} onClick={() => setModoMerma(m)}
                    className={cn(boton, modoMerma === m ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/40 text-on-surface-variant')}>
                    {m === 'cantidad' ? 'Cantidad' : 'Porcentaje (%)'}
                  </button>
                ))}
              </div>
            )}
            <div>
              <label className={etiqueta} htmlFor="ficha-cantidad">
                {accion === 'reponer' && conEnvases ? `¿Cuántas ${plural} llegaron?` : accion === 'merma' && modoMerma === 'porcentaje' ? '% del stock' : 'Cantidad'}
              </label>
              <div className="flex gap-2">
                <input id="ficha-cantidad" type="number" min={0} step="any" inputMode="decimal" className={campo} value={cantidad || ''} onChange={e => setCantidad(Number(e.target.value.replace(',', '.')))} />
                {!(accion === 'reponer' && conEnvases) && !(accion === 'merma' && modoMerma === 'porcentaje') && (
                  !conEnvases && (granelEnKg || u === 'ml') ? (
                    <select aria-label="Unidad" className={cn(campo, 'w-auto')} value={unidadIngreso} onChange={e => setUnidadIngreso(e.target.value as UnidadEntrada)}>
                      {(granelEnKg ? ['kg', 't'] : ['l']).map(x => <option key={x} value={x}>{x === 't' ? 'toneladas' : x === 'l' ? 'L' : 'kg'}</option>)}
                    </select>
                  ) : <span className="self-center text-xs text-on-surface-variant">{u === 'unidad' || !u ? 'unidades' : u}</span>
                )}
              </div>
            </div>
            {accion === 'reponer' && (
              <div>
                <span className={etiqueta}>{conEnvases ? `Costo por ${nombre}` : `Costo por ${unidadIngreso === 't' ? 'tonelada' : unidadIngreso === 'l' ? 'litro' : unidadIngreso === 'kg' ? 'kg' : 'unidad'}`}</span>
                <CampoMoneda valor={costo || ''} onChange={setCosto} className={campo} placeholder="$0" />
              </div>
            )}
            {accion === 'reponer' && (p.perecible || p.formaCompra === 'granel') && (
              <div>
                <label className={etiqueta} htmlFor="ficha-vence">Vencimiento del lote (opcional)</label>
                <input id="ficha-vence" type="date" className={campo} value={vencimiento} onChange={e => setVencimiento(e.target.value)} />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className={etiqueta} htmlFor="ficha-motivo">Motivo (obligatorio)</label>
              {accion === 'merma' && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {MOTIVOS_MERMA.map(m => (
                    <button key={m} type="button" onClick={() => setMotivo(m)}
                      className={cn('min-h-9 rounded-full border px-3 text-xs font-bold', motivo === m ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/40 text-on-surface-variant')}>{m}</button>
                  ))}
                </div>
              )}
              <input id="ficha-motivo" className={campo} value={motivo} placeholder={accion === 'merma' ? 'O escribe otro motivo' : 'Compra a proveedor'} onChange={e => setMotivo(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button type="button" onClick={() => setAccion(null)} className="min-h-11 rounded-full px-4 text-xs font-bold text-on-surface-variant hover:bg-surface-container-high">Cancelar</button>
              <button type="button" onClick={guardarAccion} className="min-h-11 rounded-full bg-primary px-5 text-xs font-bold text-inverse-on-surface">Guardar</button>
            </div>
          </div>
        )}

        {conEnvases && (
          <section>
            <Titulo>{`${plural.charAt(0).toUpperCase() + plural.slice(1)} ${adjetivo(p, 'abiert', 2)}`}</Titulo>
            {resumen.abiertos.length === 0 ? (
              <p className="text-xs text-on-surface-variant">No hay {plural} {adjetivo(p, 'abiert', 2)}. La próxima venta por subcategoría abrirá una sola.</p>
            ) : (
              <ul className="space-y-2">
                {resumen.abiertos.map(e => {
                  const pct = Math.max(0, Math.min(100, (e.restante / (e.capacidad || 1)) * 100));
                  const sinUso = remanentes.some(r => r.id === e.id);
                  return (
                    <li key={e.id} className={cn('rounded-xl border p-3', sinUso ? 'border-secondary/50 bg-secondary/5' : 'border-outline-variant/30')}>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-black text-on-surface">{e.codigo}</span>
                        <span className="font-bold text-on-surface">{formatCantidad(e.restante, u)} de {formatCantidad(e.capacidad, u)}</span>
                        <span className="text-on-surface-variant">{e.abiertoEn ? `${adjetivo(p, 'abiert', 1).replace(/^a/, 'A')} el ${formatFecha(e.abiertoEn.slice(0, 10))}` : ''}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-container-high" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${e.codigo} al ${Math.round(pct)} %`}>
                        <div className={cn('h-full rounded-full', pct < 15 ? 'bg-error' : pct < 40 ? 'bg-secondary' : 'bg-primary')} style={{ width: `${pct}%` }} />
                      </div>
                      {sinUso && (
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-bold text-secondary">{e.codigo}: {formatCantidad(e.restante, u)} sin uso (no alcanza para ninguna subcategoría)</p>
                          {puedeEditar && (
                            <button type="button" onClick={() => mermarRemanente(e.id, e.restante)} className="min-h-9 rounded-full border border-secondary/50 px-3 text-[11px] font-bold text-secondary">
                              Registrar como merma
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {!conEnvases && lotesVivos.length > 0 && (
          <section>
            <Titulo>Lotes</Titulo>
            <ul className="divide-y divide-outline-variant/20 rounded-xl border border-outline-variant/30">
              {lotesVivos.map((l, i) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                  <span className="font-bold text-on-surface">Lote del {formatFecha(l.fecha)}{i === 0 && <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">sale primero</span>}</span>
                  <span className="text-on-surface-variant">{formatCantidad(l.cantidadRestante, u)} de {formatCantidad(l.cantidadInicial, u)}</span>
                  <span className={cn('font-bold', l.vencimiento && l.vencimiento < new Date().toISOString().slice(0, 10) ? 'text-error' : 'text-on-surface-variant')}>
                    {l.vencimiento ? `Vence ${formatFecha(l.vencimiento)}` : 'Sin vencimiento'}
                  </span>
                  <span className="text-on-surface-variant">{formatCostoBase(l.costoUnitario, u)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {presentaciones.length > 0 && (
          <section>
            <Titulo>Subcategorías de venta</Titulo>
            <ul className="divide-y divide-outline-variant/20 rounded-xl border border-outline-variant/30">
              {presentaciones.map(x => {
                const tipo = tipoPresentacion(p, x);
                const insumos = (Number(x.costoInsumos) || 0) + (x.receta ?? []).reduce((a, r) => a + costoInsumo(r.productoId) * r.cantidad, 0);
                const costoTotal = costoBase * x.factor + insumos;
                const neto = p.incluyeIva === false ? x.precio : x.precio / (1 + IVA);
                const margen = neto > 0 ? ((neto - costoTotal) / neto) * 100 : 0;
                const disp = textoDisponibilidad(p, envases, x, politicaEnvaseAbierto);
                return (
                  <li key={x.id} className={cn('flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs', !x.activa && 'opacity-50')}>
                    <span className="font-bold text-on-surface">{x.nombre}
                      <span className="ml-2 rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-bold text-on-surface-variant">
                        {tipo === 'completa' ? `${nombre} completa` : tipo === 'variable' ? 'por peso' : 'fija'}{x.activa ? '' : ' · inactiva'}
                      </span>
                    </span>
                    <span className="text-on-surface-variant">{x.activa ? disp.texto : '—'}</span>
                    <span className="text-on-surface-variant">Costo {formatCLP(Math.round(costoTotal))}</span>
                    <span className="font-black text-on-surface">{formatCLP(x.precio)}{tipo === 'variable' ? `/${x.unidadVenta ?? 'kg'}` : ''}</span>
                    <span className={cn('rounded-md px-1.5 py-0.5 font-black', margen > 30 ? 'bg-success-container text-on-success-container' : margen > 15 ? 'bg-secondary/10 text-secondary' : 'bg-error/10 text-error')}>
                      {margen.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1 text-[11px] text-on-surface-variant">Margen sobre precio neto{p.incluyeIva === false ? '' : ' (sin IVA)'}. Todas descuentan del mismo inventario.</p>
          </section>
        )}

        <section>
          <Titulo>Historial</Titulo>
          {historial.length === 0 ? <p className="text-xs text-on-surface-variant">Sin movimientos.</p> : (
            <ul className="divide-y divide-outline-variant/20 rounded-xl border border-outline-variant/30">
              {historial.map(m => {
                const signo = m.tipo === 'ingreso' || m.tipo === 'devolucion' ? '+' : m.tipo === 'salida' || m.tipo === 'merma' ? '−' : m.tipo === 'ajuste' && m.cantidad > 0 ? '+' : '';
                const envasesTexto = m.consumos?.length ? [...new Set(m.consumos.map(c => codigo(c.envaseId)).filter(Boolean))].join(', ') : codigo(m.envaseId) ?? '';
                const automatica = m.tipo === 'apertura' && m.origenTipo === 'venta';
                return (
                  <li key={m.id} className={cn('grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 px-3 py-2 text-xs', m.revertido && 'opacity-50')}>
                    <span className="whitespace-nowrap text-on-surface-variant">{formatFecha(m.fecha.slice(0, 10))}</span>
                    <span className="min-w-0">
                      <span className="font-bold text-on-surface">{ETIQUETA_TIPO[m.tipo] ?? m.tipo}</span>
                      {automatica && <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">automática</span>}
                      {m.revertido && <span className="ml-1 text-[10px] font-medium text-on-surface-variant">(anulada)</span>}
                      {envasesTexto && <span className="ml-1 text-on-surface-variant">· {envasesTexto}</span>}
                      <span className="block text-on-surface-variant">{m.motivo}</span>
                    </span>
                    <span className="whitespace-nowrap text-right font-bold">{m.tipo === 'apertura' ? '—' : `${signo}${formatCantidad(Math.abs(m.cantidad), u)}`}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </ModalResponsivo>
  );
}
