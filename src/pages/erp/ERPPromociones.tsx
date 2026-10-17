import { useMemo, useState } from 'react';
import { useERP, Producto } from '../../1.-ERP/context/ERPContext';
import ConfirmDeleteModal from '../../1.-ERP/components/ConfirmDeleteModal';
import SelectorFecha from '../../1.-ERP/components/SelectorFecha';
import CampoMoneda from '../../components/CampoMoneda';
import { cn } from '@/lib/utils';

/** Simula el precio final y la rentabilidad de una promoción sobre un producto. */
function simularPromocion(producto: Producto, tipo: 'porcentaje' | 'monto', valor: number) {
  const precioBase = producto.precio || 0;
  const costo = producto.costo || 0;
  const precioFinal = tipo === 'porcentaje'
    ? precioBase * (1 - Math.min(Math.max(valor, 0), 100) / 100)
    : Math.max(0, precioBase - valor);
  const gananciaUnit = precioFinal - costo;
  const descuento = precioBase - precioFinal;
  const margenPct = precioFinal > 0 ? (gananciaUnit / precioFinal) * 100 : 0;

  let nivel: 'rojo' | 'naranja' | 'verde' | 'neutro' = 'verde';
  let mensaje = `Ganancia de $${Math.round(gananciaUnit).toLocaleString('es-CL')} por unidad (${Math.round(margenPct)}% de margen).`;
  if (precioFinal <= costo && precioFinal > 0) {
    nivel = 'rojo';
    mensaje = `No ganas nada: el precio final ($${Math.round(precioFinal).toLocaleString('es-CL')}) iguala o baja del costo ($${Math.round(costo).toLocaleString('es-CL')}). Pierdes $${Math.abs(Math.round(gananciaUnit)).toLocaleString('es-CL')} por unidad vendida.`;
  } else if (precioFinal <= 0) {
    nivel = 'rojo';
    mensaje = costo > 0
      ? `El precio final quedaría en $0: pierdes $${Math.round(costo).toLocaleString('es-CL')} por unidad (lo que te costó el producto).`
      : `El precio final quedaría en $0: el producto sale gratis. Su costo está en $0, configúralo en el inventario para calcular la pérdida real.`;
  } else if (gananciaUnit <= 0) {
    nivel = 'rojo';
    mensaje = `Pierdes $${Math.abs(Math.round(gananciaUnit)).toLocaleString('es-CL')} por unidad: el precio final está bajo el costo de $${Math.round(costo).toLocaleString('es-CL')}.`;
  } else if (margenPct < 15) {
    nivel = 'naranja';
    mensaje = `Margen muy bajo: ganas solo $${Math.round(gananciaUnit).toLocaleString('es-CL')} por unidad (${Math.round(margenPct)}%). Cualquier gasto extra deja la venta en pérdida.`;
  }
  return { precioBase, costo, precioFinal, gananciaUnit, descuento, margenPct, nivel, mensaje };
}

export default function ERPPromociones() {
  const { promociones, inventario, addPromocion, deletePromocion } = useERP();
  const [showModal, setShowModal] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState({
    nombre: '', tipo: 'porcentaje' as 'porcentaje' | 'monto', valor: '0',
    fechaInicio: new Date().toISOString().split('T')[0], fechaFin: '', productoId: '', estado: 'activa' as 'activa' | 'inactiva',
  });

  const hoy = new Date().toISOString().split('T')[0];
  const vigentes = promociones.filter(p => p.fechaInicio <= hoy && p.fechaFin >= hoy && p.estado === 'activa');
  const productosActivos = inventario.filter(p => p.estado === 'activo');

  const productoSel = useMemo(
    () => (nuevo.productoId ? inventario.find(i => i.id === nuevo.productoId) : null),
    [inventario, nuevo.productoId]
  );
  const simulacion = useMemo(() => {
    if (!productoSel || nuevo.valor === '' || Number.isNaN(Number(nuevo.valor))) return null;
    return simularPromocion(productoSel, nuevo.tipo, Number(nuevo.valor));
  }, [productoSel, nuevo.tipo, nuevo.valor]);

  const guardar = () => {
    if (!nuevo.nombre.trim() || !nuevo.valor || !nuevo.fechaFin) return;
    addPromocion({
      nombre: nuevo.nombre.trim(),
      tipo: nuevo.tipo,
      valor: Number(nuevo.valor),
      fechaInicio: nuevo.fechaInicio,
      fechaFin: nuevo.fechaFin,
      productoId: nuevo.productoId || undefined,
      estado: nuevo.estado,
    });
    setShowModal(false);
    setNuevo({ nombre: '', tipo: 'porcentaje', valor: '0', fechaInicio: new Date().toISOString().split('T')[0], fechaFin: '', productoId: '', estado: 'activa' });
  };

  const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

  return (
    <div className="p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-tertiary flex items-center gap-3">
            <span className="material-symbols-outlined text-4xl">loyalty</span>
            Promociones
          </h2>
          <p className="text-on-surface-variant mt-1 text-sm">Pon productos o servicios en promoción y revisa su rentabilidad antes de publicar.</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-5 py-3 bg-tertiary text-inverse-on-surface rounded-2xl font-bold text-sm shadow-lg shadow-tertiary/20 hover:scale-105 transition-transform">
          <span className="material-symbols-outlined text-lg">add_circle</span>
          Nueva Promocion
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-tertiary/10 p-6 rounded-2xl border border-tertiary/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-tertiary">Promociones activas hoy</p>
          <p className="text-3xl font-black text-tertiary mt-1">{vigentes.length}</p>
        </div>
        <div className="bg-primary/5 p-6 rounded-2xl border border-primary/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">Productos en promoción</p>
          <p className="text-3xl font-black text-primary mt-1">{promociones.filter(p => p.productoId).length}</p>
        </div>
        <div className="bg-success/5 p-6 rounded-2xl border border-success/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-success">Catálogo disponible</p>
          <p className="text-3xl font-black text-success mt-1">{productosActivos.length}</p>
          <p className="text-xs text-on-surface-variant mt-1">Productos y servicios activos</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {promociones.length === 0 && (
          <p className="col-span-full text-center text-on-surface-variant py-10">Aun no hay promociones. Crea la primera.</p>
        )}
        {promociones.map(p => {
          const producto = p.productoId ? inventario.find(i => i.id === p.productoId) : null;
          const activa = p.estado === 'activa' && p.fechaInicio <= hoy && p.fechaFin >= hoy;
          const renta = producto ? simularPromocion(producto, p.tipo, p.valor) : null;
          return (
            <div key={p.id} className={cn('rounded-3xl border p-5 shadow-sm', activa ? 'border-tertiary/40 bg-tertiary/5' : 'border-outline-variant/20 bg-surface-container-lowest')}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-black text-on-surface">{p.nombre}</h3>
                  <p className="text-xs text-on-surface-variant mt-1">{producto?.nombre || 'Toda la tienda'}</p>
                </div>
                <span className={cn('px-2.5 py-1 rounded-full text-xs font-bold shrink-0', activa ? 'bg-success-container text-on-success-container' : 'bg-surface-container-high text-on-surface-variant')}>
                  {activa ? 'Activa' : 'Inactiva'}
                </span>
              </div>
              <p className="mt-4 text-2xl font-black text-tertiary">
                {p.tipo === 'porcentaje' ? `${p.valor}%` : fmt(p.valor)}
              </p>
              {producto && (
                <div className="mt-3 space-y-1.5 text-xs text-on-surface-variant">
                  <p>Precio actual: <span className="font-bold text-on-surface">{fmt(producto.precio)}</span> · Costo: <span className="font-bold text-on-surface">{fmt(producto.costo)}</span></p>
                  {renta && (
                    <p>Precio final: <span className="font-black text-on-surface">{fmt(renta.precioFinal)}</span> · Ganancia: <span className={cn('font-black', renta.nivel === 'rojo' ? 'text-error' : renta.nivel === 'naranja' ? 'text-warning' : 'text-success')}>{fmt(renta.gananciaUnit)}/uds.</span></p>
                  )}
                  <p>Stock: <span className={cn('font-bold', producto.stock <= (producto.stockMinimo ?? 5) ? 'text-warning' : 'text-on-surface')}>{producto.stock} {producto.unidadMedida}</span></p>
                </div>
              )}
              <p className="text-xs text-on-surface-variant mt-2">
                {new Date(p.fechaInicio).toLocaleDateString('es-CL')} → {new Date(p.fechaFin).toLocaleDateString('es-CL')}
              </p>
              <button
                onClick={() => { setItemToDelete(p.id); setDeleteModalOpen(true); }}
                className="mt-4 p-1.5 text-on-surface-variant hover:text-error transition-colors rounded-full hover:bg-error/10">
                <span className="material-symbols-outlined text-base">delete</span>
              </button>
            </div>
          );
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-scrim/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-outline-variant/20 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-tertiary">Nueva Promocion</h3>
              <button onClick={() => setShowModal(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Nombre</label>
                    <input type="text" value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-tertiary outline-none bg-surface-container-lowest text-on-surface" placeholder="Ej: 20% off en productos seleccionados" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Producto o servicio</label>
                    <select value={nuevo.productoId} onChange={e => setNuevo({ ...nuevo, productoId: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-tertiary outline-none bg-surface-container-lowest text-on-surface">
                      <option value="">Toda la tienda</option>
                      {productosActivos.map(p => (
                        <option key={p.id} value={p.id}>{p.nombre} — {fmt(p.precio)} (costo {fmt(p.costo)})</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Tipo</label>
                      <select value={nuevo.tipo} onChange={e => setNuevo({ ...nuevo, tipo: e.target.value as 'porcentaje' | 'monto' })}
                        className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-tertiary outline-none bg-surface-container-lowest text-on-surface">
                        <option value="porcentaje">Porcentaje (%)</option>
                        <option value="monto">Monto fijo ($)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Valor</label>
                      {nuevo.tipo === 'monto' ? (
                        <CampoMoneda valor={nuevo.valor} onChange={valor => setNuevo({ ...nuevo, valor: String(valor) })}
                          className="px-4 py-3 border-2 border-outline-variant/50 rounded-xl font-bold focus:border-tertiary outline-none bg-surface-container-lowest text-on-surface" />
                      ) : (
                        <div className="relative">
                          <input type="number" min={0} max={100} value={nuevo.valor} onChange={e => setNuevo({ ...nuevo, valor: e.target.value })}
                            className="w-full px-4 pr-12 py-3 border-2 border-outline-variant/50 rounded-xl font-bold focus:border-tertiary outline-none bg-surface-container-lowest text-on-surface" />
                          <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-lg text-on-surface-variant pointer-events-none">percent</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Inicio</label>
                      <SelectorFecha value={nuevo.fechaInicio} min={hoy} onChange={fecha => setNuevo({ ...nuevo, fechaInicio: fecha })} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Fin</label>
                      <SelectorFecha value={nuevo.fechaFin} min={hoy} onChange={fecha => setNuevo({ ...nuevo, fechaFin: fecha })} />
                    </div>
                  </div>
                </div>

                {/* ── Simulación de rentabilidad ── */}
                <div>
                  {productoSel ? (
                    <div className="rounded-2xl bg-surface-container-low p-5 space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Simulación de rentabilidad</p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-xl bg-surface-container-lowest p-3">
                          <p className="text-[9px] font-bold uppercase text-on-surface-variant">Precio actual</p>
                          <p className="font-black text-on-surface">{fmt(productoSel.precio)}</p>
                        </div>
                        <div className="rounded-xl bg-surface-container-lowest p-3">
                          <p className="text-[9px] font-bold uppercase text-on-surface-variant">Costo</p>
                          <p className="font-black text-error">{fmt(productoSel.costo)}</p>
                        </div>
                        <div className="rounded-xl bg-surface-container-lowest p-3">
                          <p className="text-[9px] font-bold uppercase text-on-surface-variant">Stock</p>
                          <p className={cn('font-black', productoSel.stock <= (productoSel.stockMinimo ?? 5) ? 'text-warning' : 'text-on-surface')}>{productoSel.stock}</p>
                        </div>
                      </div>
                      {simulacion ? (
                        <div className="grid grid-cols-2 gap-2 text-center">
                          <div className="rounded-xl bg-surface-container-lowest p-3">
                            <p className="text-[9px] font-bold uppercase text-on-surface-variant">Precio final</p>
                            <p className="font-black text-on-surface">{fmt(simulacion.precioFinal)}</p>
                            <p className="text-[10px] text-on-surface-variant">Descuento: {fmt(simulacion.descuento)}</p>
                          </div>
                          <div className="rounded-xl bg-surface-container-lowest p-3">
                            <p className="text-[9px] font-bold uppercase text-on-surface-variant">Ganancia por unidad</p>
                            <p className={cn('font-black', simulacion.nivel === 'rojo' ? 'text-error' : simulacion.nivel === 'naranja' ? 'text-warning' : 'text-success')}>{fmt(simulacion.gananciaUnit)}</p>
                            <p className="text-[10px] text-on-surface-variant">Margen {Math.round(simulacion.margenPct)}%</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-on-surface-variant">Ingresa el valor de la promoción para simular el precio final.</p>
                      )}
                      {simulacion && (
                        <p className={cn('flex items-start gap-2 text-xs font-semibold rounded-xl px-3 py-2',
                          simulacion.nivel === 'rojo' ? 'bg-error/10 text-error'
                            : simulacion.nivel === 'naranja' ? 'bg-warning/10 text-warning'
                              : 'bg-success/10 text-success')}>
                          <span className="material-symbols-outlined text-base shrink-0">
                            {simulacion.nivel === 'rojo' ? 'error' : simulacion.nivel === 'naranja' ? 'warning' : 'check_circle'}
                          </span>
                          {simulacion.mensaje}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-on-surface-variant rounded-2xl bg-surface-container-low px-4 py-3">
                      Selecciona un producto o servicio para ver el impacto de la promoción en tu rentabilidad y stock.
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3 shrink-0">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 rounded-2xl border-2 border-outline-variant/50 font-bold text-on-surface-variant">Cancelar</button>
              <button onClick={guardar} disabled={!nuevo.nombre.trim() || Number(nuevo.valor) <= 0 || !nuevo.fechaFin}
                className="flex-1 py-3 rounded-2xl bg-tertiary text-inverse-on-surface font-bold shadow-lg shadow-tertiary/20 disabled:opacity-50">Guardar</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setItemToDelete(null); }}
        onConfirm={() => { if (itemToDelete) deletePromocion(itemToDelete); }}
        title="Eliminar Promocion" />
    </div>
  );
}
