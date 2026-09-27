import { useState } from 'react';
import { useERP, Promocion } from '../../1.-ERP/context/ERPContext';
import ConfirmDeleteModal from '../../1.-ERP/components/ConfirmDeleteModal';
import SelectorFecha from '../../1.-ERP/components/SelectorFecha';
import { cn } from '@/lib/utils';

export default function ERPPromociones() {
  const { promociones, inventario, addPromocion, deletePromocion } = useERP();
  const [showModal, setShowModal] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState({
    nombre: '', tipo: 'porcentaje' as 'porcentaje' | 'monto', valor: '',
    fechaInicio: new Date().toISOString().split('T')[0],
    fechaFin: '', productoId: '', estado: 'activa' as 'activa' | 'inactiva',
  });

  const hoy = new Date().toISOString().split('T')[0];
  const vigentes = promociones.filter(p => p.fechaInicio <= hoy && p.fechaFin >= hoy && p.estado === 'activa');

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
    setNuevo({ nombre: '', tipo: 'porcentaje', valor: '', fechaInicio: new Date().toISOString().split('T')[0], fechaFin: '', productoId: '', estado: 'activa' });
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-tertiary flex items-center gap-3">
            <span className="material-symbols-outlined text-4xl">loyalty</span>
            Promociones
          </h2>
          <p className="text-on-surface-variant mt-1 text-sm">Crea promociones que se aplican al registrar ventas.</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-5 py-3 bg-tertiary text-white rounded-2xl font-bold text-sm shadow-lg shadow-tertiary/20 hover:scale-105 transition-transform">
          <span className="material-symbols-outlined text-lg">add_circle</span>
          Nueva Promocion
        </button>
      </div>

      <div className="bg-tertiary/10 p-6 rounded-2xl border border-tertiary/20">
        <p className="text-[10px] font-black uppercase tracking-widest text-tertiary">Promociones activas hoy</p>
        <p className="text-3xl font-black text-tertiary mt-1">{vigentes.length}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {promociones.length === 0 && (
          <p className="col-span-full text-center text-on-surface-variant py-10">Aun no hay promociones. Crea la primera.</p>
        )}
        {promociones.map(p => {
          const producto = p.productoId ? inventario.find(i => i.id === p.productoId) : null;
          const activa = p.estado === 'activa' && p.fechaInicio <= hoy && p.fechaFin >= hoy;
          return (
            <div key={p.id} className={cn('rounded-3xl border p-5 shadow-sm', activa ? 'border-tertiary/40 bg-tertiary/5' : 'border-outline-variant/20 bg-surface-container-lowest')}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-black text-on-surface">{p.nombre}</h3>
                  <p className="text-xs text-on-surface-variant mt-1">{producto?.nombre || 'Toda la tienda'}</p>
                </div>
                <span className={cn('px-2.5 py-1 rounded-full text-xs font-bold shrink-0', activa ? 'bg-emerald-100 text-emerald-700' : 'bg-surface-container-high text-on-surface-variant')}>
                  Activa
                </span>
              </div>
              <p className="mt-4 text-2xl font-black text-tertiary">
                {p.tipo === 'porcentaje' ? `${p.valor}%` : `$${p.valor.toLocaleString('es-CL')}`}
              </p>
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
          <div className="bg-surface-container-lowest rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-outline-variant/20 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-tertiary">Nueva Promocion</h3>
              <button onClick={() => setShowModal(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Nombre</label>
                <input type="text" value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-tertiary outline-none bg-surface-container-lowest text-on-surface" placeholder="Ej: 20% off en productos seleccionados" />
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
                  <input type="number" value={nuevo.valor} onChange={e => setNuevo({ ...nuevo, valor: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl font-bold focus:border-tertiary outline-none bg-surface-container-lowest text-on-surface" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Producto (opcional)</label>
                <select value={nuevo.productoId} onChange={e => setNuevo({ ...nuevo, productoId: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-tertiary outline-none bg-surface-container-lowest text-on-surface">
                  <option value="">Toda la tienda</option>
                  {inventario.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Inicio</label>
                <SelectorFecha value={nuevo.fechaInicio} onChange={fecha => setNuevo({ ...nuevo, fechaInicio: fecha })} />
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Fin</label>
                <SelectorFecha value={nuevo.fechaFin} onChange={fecha => setNuevo({ ...nuevo, fechaFin: fecha })} />
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3 shrink-0">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 rounded-2xl border-2 border-outline-variant/50 font-bold text-on-surface-variant">Cancelar</button>
              <button onClick={guardar} disabled={!nuevo.nombre.trim() || !nuevo.valor || !nuevo.fechaFin}
                className="flex-1 py-3 rounded-2xl bg-tertiary text-white font-bold shadow-lg shadow-tertiary/20 disabled:opacity-50">Guardar</button>
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