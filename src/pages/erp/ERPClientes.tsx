import { useState, lazy, Suspense, useMemo } from 'react';
import { Cliente, useERP } from '../../1.-ERP/context/ERPContext';
import ConfirmDeleteModal from '../../1.-ERP/components/ConfirmDeleteModal';
import CampoMoneda from '../../components/CampoMoneda';
import { cn } from '@/lib/utils';
import { Plus, Search, Edit, Trash2, Upload, FileText } from "lucide-react";
import ModalHistorialCliente from "../../1.-ERP/components/ModalHistorialCliente";

const ModalCargaMasivaClientes = lazy(() => import('../../1.-ERP/components/ModalCargaMasivaClientes'));

const validarRUT = (rut: string): boolean => {
  const limpio = (rut ?? '').replace(/[^0-9kK]/g, '');
  if (limpio.length < 2) return false;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1).toUpperCase();
  if (cuerpo.length < 1 || cuerpo.length > 8) return false;
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  const dvEsperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  return dv === dvEsperado;
};

const formatearRUT = (valor: string): string => {
  const limpio = (valor ?? '').replace(/[^0-9kK]/g, '').slice(0, 9);
  if (!limpio) return '';
  if (limpio.length === 1) return limpio.toUpperCase();
  const cuerpo = limpio.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const dv = limpio.slice(-1).toUpperCase();
  return `${cuerpo}-${dv}`;
};

export default function ERPClientes() {
  const { clientes, addCliente, updateCliente, deleteCliente, getSaldoPendienteVenta, ventas, abonos } = useERP();
  const [busqueda, setBusqueda] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showCargaMasiva, setShowCargaMasiva] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [historialCliente, setHistorialCliente] = useState<Cliente | null>(null);
  const [nuevo, setNuevo] = useState({ nombre: '', rut: '', telefono: '', email: '', direccion: '', comuna: '', notas: '', limite_credito: '' });
  const [rutError, setRutError] = useState('');

  const fmt = (n: number) => `$${Math.abs(n).toLocaleString('es-CL')}`;

  const clientesFiltrados = clientes.filter(c =>
    c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (c.rut || '').toLowerCase().includes(busqueda.toLowerCase()) ||
    c.email.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.telefono.toLowerCase().includes(busqueda.toLowerCase())
  );

  const totalDeuda = clientes.reduce((a, c) => a + c.deuda, 0);

  const resumenVentas = useMemo(() => {
    const norm = (s: string) => (s || '').trim().toLowerCase();
    const acumular = (mapa: Map<string, { cantidad: number; total: number; ultima: string }>, clave: string, monto: number, fecha: string) => {
      const prev = mapa.get(clave);
      mapa.set(clave, {
        cantidad: (prev?.cantidad ?? 0) + 1,
        total: (prev?.total ?? 0) + (monto || 0),
        ultima: prev && prev.ultima > fecha ? prev.ultima : fecha,
      });
    };
    const porId = new Map<string, { cantidad: number; total: number; ultima: string }>();
    const porNombre = new Map<string, { cantidad: number; total: number; ultima: string }>();
    ventas.forEach(v => {
      if (v.cliente_id) acumular(porId, v.cliente_id, v.monto, v.fecha);
      if (v.cliente) acumular(porNombre, norm(v.cliente), v.monto, v.fecha);
    });
    return { porId, porNombre };
  }, [ventas]);

  const resumenDe = (c: Cliente) => {
    const r = resumenVentas.porId.get(c.id) ?? resumenVentas.porNombre.get((c.nombre || '').trim().toLowerCase());
    if (r) return r;
    return { cantidad: c.ventas, total: 0, ultima: '' };
  };

  const fechaCorta = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  const recenciaDe = (iso: string) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
    const texto = dias <= 0 ? 'Compró hoy' : dias === 1 ? 'Hace 1 día' : dias < 30 ? `Hace ${dias} días` : dias < 60 ? 'Hace 1 mes' : `Hace ${Math.floor(dias / 30)} meses`;
    const clase = dias <= 30 ? 'bg-success/10 text-success' : dias <= 90 ? 'bg-warning/10 text-warning' : 'bg-error/10 text-error';
    return { dias, texto, clase, fecha: fechaCorta(iso) };
  };

  const segmentoDe = (rv: { cantidad: number; total: number }, dias: number | null) => {
    if (rv.cantidad === 0) return { nombre: 'Sin compras', clase: 'bg-surface-container text-on-surface-variant' };
    if (dias !== null && dias > 90) return { nombre: 'Inactivo', clase: 'bg-error/10 text-error' };
    if (rv.cantidad === 1) return { nombre: 'Nuevo', clase: 'bg-primary/10 text-primary' };
    if (rv.cantidad >= 5 || rv.total >= 1000000) return { nombre: 'VIP', clase: 'bg-secondary/10 text-secondary' };
    return { nombre: 'Recurrente', clase: 'bg-success/10 text-success' };
  };

  const abrirNuevo = () => {
    setEditandoId(null);
    setNuevo({ nombre: '', rut: '', telefono: '', email: '', direccion: '', comuna: '', notas: '', limite_credito: '' });
    setRutError('');
    setShowModal(true);
  };

  const abrirEditar = (c: Cliente) => {
    setEditandoId(c.id);
    setNuevo({
      nombre: c.nombre,
      rut: c.rut || '',
      telefono: c.telefono || '',
      email: c.email || '',
      direccion: c.direccion || '',
      comuna: c.comuna || '',
      notas: c.notas || '',
      limite_credito: c.limite_credito !== undefined ? String(c.limite_credito) : '',
    });
    setRutError('');
    setShowModal(true);
  };

  const cerrarModal = () => {
    setShowModal(false);
    setEditandoId(null);
    setRutError('');
  };

  const guardar = () => {
    if (!nuevo.nombre.trim()) return;
    if (nuevo.rut.trim() && !validarRUT(nuevo.rut)) {
      setRutError('RUT inválido. Revisa el dígito verificador.');
      return;
    }
    setRutError('');
    const datos = {
      nombre: nuevo.nombre.trim(),
      rut: nuevo.rut || undefined,
      telefono: nuevo.telefono,
      email: nuevo.email,
      direccion: nuevo.direccion || undefined,
      comuna: nuevo.comuna || undefined,
      notas: nuevo.notas || undefined,
      limite_credito: nuevo.limite_credito ? Number(nuevo.limite_credito) : undefined,
    };
    if (editandoId) updateCliente(editandoId, datos);
    else addCliente(datos);
    cerrarModal();
  };

  const celdaCSV = (valor: unknown) => {
    const s = String(valor ?? '');
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const descargarCSV = (nombreArchivo: string, headers: string[], rows: (string | number)[][]) => {
    const csv = [headers, ...rows].map(e => e.map(celdaCSV).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = nombreArchivo;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportarClientesCSV = () => {
    const headers = ['Nombre', 'RUT', 'Teléfono', 'Email', 'Dirección', 'Comuna', 'Segmento', 'N_Ventas', 'Total_Vendido', 'Ticket_Promedio', 'Última_Venta', 'Deuda', 'Límite_Crédito', 'Notas'];
    const rows = clientesFiltrados.map(c => {
      const rv = resumenDe(c);
      const rec = recenciaDe(rv.ultima);
      const seg = segmentoDe(rv, rec?.dias ?? null);
      const ticket = rv.cantidad > 0 ? Math.round(rv.total / rv.cantidad) : 0;
      return [
        c.nombre,
        c.rut || '',
        c.telefono,
        c.email,
        c.direccion || '',
        c.comuna || '',
        seg.nombre,
        rv.cantidad,
        rv.total,
        ticket,
        rv.ultima ? rv.ultima.split('T')[0] : '',
        c.deuda,
        c.limite_credito ?? '',
        c.notas || '',
      ];
    });
    descargarCSV(`clientes_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-primary flex items-center gap-3">
            <span className="material-symbols-outlined text-4xl">groups</span>
            Clientes
          </h2>
          <p className="text-on-surface-variant mt-1 text-sm">Administra tus clientes y su deuda pendiente.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => setShowCargaMasiva(true)}
            className="flex items-center gap-2 px-6 py-3 bg-surface-container-lowest text-primary border border-primary/30 rounded-full font-bold text-sm shadow-sm hover:bg-primary/5 transition-all">
            <span className="material-symbols-outlined text-lg">upload_file</span>
            Carga Masiva
          </button>
          <button onClick={exportarClientesCSV}
            className="flex items-center gap-2 px-6 py-3 bg-surface-container-lowest text-primary border border-primary/30 rounded-full font-bold text-sm shadow-sm hover:bg-primary/5 transition-all">
            <span className="material-symbols-outlined text-lg">download</span>
            Exportar
          </button>
          <button onClick={abrirNuevo}
            className="flex items-center gap-2 px-6 py-3 bg-primary text-inverse-on-surface rounded-full font-bold text-sm shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
            <span className="material-symbols-outlined text-lg">person_add</span>
            Nuevo Cliente
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-primary/5 p-5 rounded-2xl border border-primary/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">Total clientes</p>
          <p className="text-3xl font-black text-primary mt-1">{clientes.length}</p>
        </div>
        <div className="bg-secondary/10 p-5 rounded-2xl border border-secondary/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-secondary">Deuda total</p>
          <p className="text-3xl font-black text-secondary mt-1">{fmt(totalDeuda)}</p>
        </div>
        <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Con saldo pendiente</p>
          <p className="text-3xl font-black text-on-surface mt-1">
            {clientes.filter(c => c.deuda > 0).length}
          </p>
        </div>
      </div>

      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">search</span>
        <input type="text" placeholder="Buscar por nombre, RUT o correo..." value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-primary outline-none bg-surface-container-lowest text-on-surface" />
      </div>

      <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant/20">
              <tr>
                {['Cliente', 'Contacto', 'Compras', 'Deuda pendiente', 'Límite de crédito', 'Acciones'].map(h => (
                  <th key={h} className="p-4 text-xs font-bold text-outline uppercase tracking-wider text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {clientesFiltrados.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-on-surface-variant">No se encontraron clientes.</td></tr>
              )}
              {clientesFiltrados.map(c => {
                const saldoReal = c.deuda;
                const rv = resumenDe(c);
                const seg = segmentoDe(rv, 0);
                return (
                  <tr key={c.id} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="p-4">
                      <p className="font-bold text-on-surface">{c.nombre}</p>
                      {c.rut && <p className="text-xs text-on-surface-variant">{c.rut}</p>}
                    </td>
                    <td className="p-4 text-on-surface-variant text-xs">
                      <p>{c.email || '—'}</p>
                      <p>{c.telefono || '—'}</p>
                    </td>
                    <td className="p-4">
                      <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide', seg.clase)}>
                        {seg.nombre}
                      </span>
                      <p className="text-xs text-on-surface-variant mt-1">{rv.cantidad} venta{rv.cantidad === 1 ? '' : 's'}</p>
                    </td>
                    <td className="p-4">
                      <span className={cn('font-extrabold', saldoReal > 0 ? 'text-secondary' : 'text-success')}>
                        {fmt(saldoReal)}
                      </span>
                    </td>
                    <td className="p-4">
                      {c.limite_credito ? (
                        <div>
                          <p className="text-on-surface-variant">{fmt(c.limite_credito)}</p>
                          {c.deuda >= c.limite_credito && c.limite_credito > 0 ? (
                            <span className="inline-flex mt-1 items-center gap-1 rounded-full bg-error/10 px-2 py-0.5 text-[10px] font-black text-error uppercase tracking-wide">Límite alcanzado</span>
                          ) : c.deuda >= c.limite_credito * 0.85 && c.limite_credito > 0 ? (
                            <span className="inline-flex mt-1 items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-black text-warning uppercase tracking-wide">Cerca del límite</span>
                          ) : null}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => abrirEditar(c)}
                          className="p-1.5 text-on-surface-variant hover:text-primary transition-colors rounded-full hover:bg-primary/10"
                          title="Editar">
                          <span className="material-symbols-outlined text-base">edit</span>
                        </button>
                        <button
                          onClick={() => setHistorialCliente(c)}
                          className="p-1.5 text-on-surface-variant hover:text-primary transition-colors rounded-full hover:bg-primary/10"
                          title="Historial de pagos/deudas">
                          <span className="material-symbols-outlined text-base">history</span>
                        </button>
                        <button
                          onClick={() => { setItemToDelete(c.id); setDeleteModalOpen(true); }}
                          className="p-1.5 text-on-surface-variant hover:text-error transition-colors rounded-full hover:bg-error/10"
                          title="Eliminar">
                          <span className="material-symbols-outlined text-base">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-scrim/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-outline-variant/20 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-primary">{editandoId ? 'Editar Cliente' : 'Nuevo Cliente'}</h3>
              <button onClick={cerrarModal} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto">
              {[
                { key: 'nombre' as const, label: 'Nombre / Razón social' },
                { key: 'rut' as const, label: 'RUT (opcional)' },
                { key: 'telefono' as const, label: 'Teléfono' },
                { key: 'email' as const, label: 'Email' },
                { key: 'direccion' as const, label: 'Dirección (opcional)' },
                { key: 'comuna' as const, label: 'Comuna (opcional)' },
                { key: 'notas' as const, label: 'Notas (opcional)' },
                { key: 'limite_credito' as const, label: 'Límite de crédito (opcional)' },
              ].map(f => (
                <div key={f.key} className={f.key === 'notas' ? 'md:col-span-2' : ''}>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">{f.label}</label>
                  {f.key === 'limite_credito' ? (
                    <CampoMoneda
                      valor={nuevo.limite_credito}
                      onChange={monto => setNuevo({ ...nuevo, limite_credito: monto ? String(monto) : '' })}
                      placeholder="$0"
                      className="px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-primary outline-none bg-surface-container-lowest text-on-surface"
                    />
                  ) : (
                    <input
                      type="text"
                      value={nuevo[f.key]}
                      onChange={e => {
                        const valor = f.key === 'rut' ? formatearRUT(e.target.value) : e.target.value;
                        setNuevo({ ...nuevo, [f.key]: valor });
                        if (f.key === 'rut' && rutError) setRutError('');
                      }}
                      className="w-full px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm focus:border-primary outline-none bg-surface-container-lowest text-on-surface"
                    />
                  )}
                </div>
              ))}
              {rutError && (
                <p className="md:col-span-2 flex items-center gap-1.5 text-xs font-bold text-error">
                  <span className="material-symbols-outlined text-sm">error</span> {rutError}
                </p>
              )}
            </div>
            <div className="px-6 pb-6 flex gap-3 shrink-0">
              <button onClick={cerrarModal} className="flex-1 py-3 rounded-2xl border-2 border-outline-variant/50 font-bold text-on-surface-variant">Cancelar</button>
              <button onClick={guardar} disabled={!nuevo.nombre.trim()} className="flex-1 py-3 rounded-2xl bg-primary text-inverse-on-surface font-bold shadow-lg shadow-primary/20 disabled:opacity-50">
                {editandoId ? 'Guardar Cambios' : 'Guardar Cliente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCargaMasiva && (
        <Suspense fallback={null}>
          <ModalCargaMasivaClientes
            isOpen={showCargaMasiva}
            onClose={() => setShowCargaMasiva(false)}
            onImport={(nuevos) => { nuevos.forEach(c => addCliente(c)); }}
            clientesExistentes={clientes}
          />
        </Suspense>
      )}

      <ConfirmDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setItemToDelete(null); }}
        onConfirm={() => { if (itemToDelete) deleteCliente(itemToDelete); }}
        title="Eliminar Cliente" />

      {historialCliente && (
        <ModalHistorialCliente
          cliente={historialCliente}
          ventas={ventas}
          abonos={abonos}
          onClose={() => setHistorialCliente(null)}
        />
      )}
    </div>
  );
}