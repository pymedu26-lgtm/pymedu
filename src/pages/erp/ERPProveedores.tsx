import { useState } from 'react';
import { useERP } from '../../1.-ERP/context/ERPContext';
import ConfirmDeleteModal from '../../1.-ERP/components/ConfirmDeleteModal';
import { cn } from '@/lib/utils';

const CATEGORIAS = ['Insumos / Mercaderia', 'Servicios Basicos', 'Arriendo', 'Sueldos', 'Publicidad', 'Tecnologia', 'Transporte', 'Otros'];

export default function ERPProveedores() {
  const { proveedores, addProveedor, deleteProveedor } = useERP();
  const [busqueda, setBusqueda] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState({ nombre: '', categoria: CATEGORIAS[0], telefono: '', email: '', condicion_pago: '' });

  const fmt = (n: number) => `$${Math.abs(n).toLocaleString('es-CL')}`;

  const proveedoresFiltrados = proveedores.filter(p =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.categoria.toLowerCase().includes(busqueda.toLowerCase())
  );

  const totalDeuda = proveedores.reduce((a, p) => a + p.deuda, 0);

  const guardar = () => {
    if (!nuevo.nombre.trim()) return;
    addProveedor({
      nombre: nuevo.nombre.trim(),
      categoria: nuevo.categoria,
      telefono: nuevo.telefono,
      email: nuevo.email || undefined,
      condicion_pago: nuevo.condicion_pago || undefined,
    });
    setShowModal(false);
    setNuevo({ nombre: '', categoria: CATEGORIAS[0], telefono: '', email: '', condicion_pago: '' });
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-error flex items-center gap-3">
            <span className="material-symbols-outlined text-4xl">local_shipping</span>
            Proveedores
          </h2>
          <p className="text-on-surface-variant mt-1 text-sm">Administra tus proveedores y cuentas por pagar.</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-5 py-3 bg-error text-white rounded-2xl font-bold text-sm shadow-lg shadow-error/20 hover:scale-105 transition-transform">
          <span className="material-symbols-outlined text-lg">add</span>
          Nuevo Proveedor
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-error/5 p-5 rounded-2xl border border-error/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-error">Total proveedores</p>
          <p className="text-3xl font-black text-error mt-1">{proveedores.length}</p>
        </div>
        <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Deuda total</p>
          <p className="text-3xl font-black text-on-surface mt-1">{fmt(totalDeuda)}</p>
        </div>
      </div>

      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">search</span>
        <input type="text" placeholder="Buscar por nombre o categoría..." value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-primary outline-none bg-surface-container-lowest text-on-surface" />
      </div>

      <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant/20">
              <tr>
                {['Proveedor', 'Categoría', 'Contacto', 'Deuda pendiente', 'Condición', 'Acciones'].map(h => (
                  <th key={h} className="p-4 text-xs font-bold text-outline uppercase tracking-wider text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {proveedoresFiltrados.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-on-surface-variant">No se encontraron proveedores.</td></tr>
              )}
              {proveedoresFiltrados.map(p => (
                <tr key={p.id} className="hover:bg-surface-container-low/50 transition-colors">
                  <td className="p-4">
                    <p className="font-bold text-on-surface">{p.nombre}</p>
                    {p.rut && <p className="text-xs text-on-surface-variant">{p.rut}</p>}
                  </td>
                  <td className="p-4"><span className="text-xs bg-surface-container-high text-on-surface-variant font-bold px-2 py-1 rounded-full whitespace-nowrap">{p.categoria}</span></td>
                  <td className="p-4 text-on-surface-variant text-xs">
                    <p>{p.email || '—'}</p>
                    <p>{p.telefono || '—'}</p>
                  </td>
                  <td className="p-4">
                    <span className={cn('font-extrabold', p.deuda > 0 ? 'text-secondary' : 'text-emerald-600')}>{fmt(p.deuda)}</span>
                  </td>
                  <td className="p-4 text-on-surface-variant">{p.condicion_pago || '—'}</td>
                  <td className="p-4">
                    <button
                      onClick={() => { setItemToDelete(p.id); setDeleteModalOpen(true); }}
                      className="p-1.5 text-on-surface-variant hover:text-error transition-colors rounded-full hover:bg-error/10">
                      <span className="material-symbols-outlined text-base">delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-scrim/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-outline-variant/20 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-error">Nuevo Proveedor</h3>
              <button onClick={() => setShowModal(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Nombre / Razón social</label>
                <input type="text" value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-error outline-none bg-surface-container-lowest text-on-surface" />
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Categoría</label>
                <select value={nuevo.categoria} onChange={e => setNuevo({ ...nuevo, categoria: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-error outline-none bg-surface-container-lowest text-on-surface">
                  {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Teléfono</label>
                  <input type="text" value={nuevo.telefono} onChange={e => setNuevo({ ...nuevo, telefono: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-error outline-none bg-surface-container-lowest text-on-surface" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Email</label>
                  <input type="text" value={nuevo.email} onChange={e => setNuevo({ ...nuevo, email: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-error outline-none bg-surface-container-lowest text-on-surface" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Condición de pago</label>
                <input type="text" placeholder="Ej: 30 días" value={nuevo.condicion_pago} onChange={e => setNuevo({ ...nuevo, condicion_pago: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-error outline-none bg-surface-container-lowest text-on-surface" />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3 shrink-0">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 rounded-2xl border-2 border-outline-variant/50 font-bold text-on-surface-variant">Cancelar</button>
              <button onClick={guardar} disabled={!nuevo.nombre.trim()} className="flex-1 py-3 rounded-2xl bg-error text-white font-bold shadow-lg shadow-error/20 disabled:opacity-50">Guardar Proveedor</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setItemToDelete(null); }}
        onConfirm={() => { if (itemToDelete) deleteProveedor(itemToDelete); }}
        title="Eliminar Proveedor" />
    </div>
  );
}