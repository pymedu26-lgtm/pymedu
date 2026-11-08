import { useState, lazy, Suspense, useMemo } from 'react';
import { Proveedor, useERP, normalizarNombre } from '../../1.-ERP/context/ERPContext';
import { formatCLP } from '../../lib/fechas';
import Paginacion, { usePaginacion } from '../../components/Paginacion';
import ConfirmDeleteModal from '../../1.-ERP/components/ConfirmDeleteModal';
import { cn } from '@/lib/utils';
import ModalHistorialProveedor from '../../1.-ERP/components/ModalHistorialProveedor';
import TablaResponsiva, { type ColumnaTabla } from '../../components/TablaResponsiva';
import ModalResponsivo from '../../components/ModalResponsivo';

const ModalCargaMasivaProveedores = lazy(() => import('../../1.-ERP/components/ModalCargaMasivaProveedores'));

// «Sueldos» no es un proveedor: se registra como gasto de personal / RR.HH. (corrección #33).
const CATEGORIAS = ['Insumos / Mercadería', 'Servicios básicos', 'Arriendo', 'Publicidad', 'Tecnología', 'Transporte', 'Otros'];

export default function ERPProveedores() {
  const { proveedores, addProveedor, updateProveedor, deleteProveedor, gastos, abonos, saldos } = useERP();
  const [busqueda, setBusqueda] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showCargaMasiva, setShowCargaMasiva] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [historialProveedor, setHistorialProveedor] = useState<Proveedor | null>(null);
  const [nuevo, setNuevo] = useState({ nombre: '', categoria: CATEGORIAS[0], telefono: '', email: '', condicion_pago: '', rut: '' });

  const fmt = (n: number) => formatCLP(Math.abs(n));

  const proveedoresFiltrados = useMemo(() => proveedores.filter(p =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (p.categoria || '').toLowerCase().includes(busqueda.toLowerCase())
  ), [proveedores, busqueda]);
  const paginacion = usePaginacion(proveedoresFiltrados, 25, [busqueda]);

  // Deuda real por proveedor desde la fuente única de saldos (corrección #4).
  const deudaPorProveedor = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const g of gastos) {
      const saldo = saldos.porGasto.get(g.id) ?? 0;
      if (saldo <= 0) continue;
      const clave = g.proveedor_id || `nom:${normalizarNombre(g.proveedor)}`;
      mapa.set(clave, (mapa.get(clave) ?? 0) + saldo);
    }
    return mapa;
  }, [gastos, saldos]);
  const deudaDe = (p: Proveedor) => deudaPorProveedor.get(p.id) ?? deudaPorProveedor.get(`nom:${normalizarNombre(p.nombre)}`) ?? 0;
  const totalDeuda = saldos.resumen.porPagar;

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

  const exportarProveedoresCSV = () => {
    const headers = ['Nombre', 'RUT', 'Teléfono', 'Email', 'Categoría', 'Condición de pago', 'Deuda'];
    const rows = proveedoresFiltrados.map(p => [
      p.nombre,
      p.rut || '',
      p.telefono || '',
      p.email || '',
      p.categoria || '',
      p.condicion_pago || '',
      deudaDe(p),
    ]);
    descargarCSV(`proveedores_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
  };

  const abrirNuevo = () => {
    setEditandoId(null);
    setNuevo({ nombre: '', categoria: CATEGORIAS[0], telefono: '', email: '', condicion_pago: '', rut: '' });
    setShowModal(true);
  };

  const abrirEditar = (p: Proveedor) => {
    setEditandoId(p.id);
    setNuevo({
      nombre: p.nombre,
      categoria: p.categoria || CATEGORIAS[0],
      telefono: p.telefono || '',
      email: p.email || '',
      condicion_pago: p.condicion_pago || '',
      rut: p.rut || '',
    });
    setShowModal(true);
  };

  const cerrarModal = () => {
    setShowModal(false);
    setEditandoId(null);
  };

  const guardar = () => {
    if (!nuevo.nombre.trim()) return;
    const datos = {
      nombre: nuevo.nombre.trim(),
      categoria: nuevo.categoria,
      telefono: nuevo.telefono,
      email: nuevo.email || undefined,
      condicion_pago: nuevo.condicion_pago || undefined,
      rut: nuevo.rut || undefined,
    };
    if (editandoId) updateProveedor(editandoId, datos);
    else addProveedor(datos);
    cerrarModal();
    setNuevo({ nombre: '', categoria: CATEGORIAS[0], telefono: '', email: '', condicion_pago: '', rut: '' });
  };

  const montoDeuda = (p: Proveedor) => {
    const deuda = deudaDe(p);
    return <span className={cn('font-extrabold whitespace-nowrap', deuda > 0 ? 'text-secondary' : 'text-success')}>{fmt(deuda)}</span>;
  };
  const chipCategoria = (p: Proveedor) => p.categoria
    ? <span className="text-xs bg-surface-container-high text-on-surface-variant font-bold px-2 py-1 rounded-full whitespace-nowrap">{p.categoria}</span>
    : null;

  const columnasProveedores: ColumnaTabla<Proveedor>[] = [
    {
      clave: 'proveedor', titulo: 'Proveedor', celda: p => (
        <>
          <p className="font-bold text-on-surface">{p.nombre}</p>
          {p.rut && <p className="text-xs text-on-surface-variant">{p.rut}</p>}
        </>
      ),
    },
    { clave: 'categoria', titulo: 'Categoría', celda: chipCategoria },
    {
      clave: 'contacto', titulo: 'Contacto', celda: p => (
        <div className="text-on-surface-variant text-xs">
          <p>{p.email || '—'}</p>
          <p>{p.telefono || '—'}</p>
        </div>
      ),
    },
    { clave: 'deuda', titulo: 'Deuda pendiente', celda: montoDeuda },
    { clave: 'condicion', titulo: 'Condición', celda: p => <span className="text-on-surface-variant">{p.condicion_pago || '—'}</span> },
  ];

  const botonEncabezado = 'flex min-h-11 grow sm:grow-0 items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-full font-bold text-sm transition-all';
  const claseCampo = 'w-full min-h-11 px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-base sm:text-sm focus:border-primary outline-none bg-surface-container-lowest text-on-surface';
  const claseEtiqueta = 'block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5';

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 md:space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-primary flex items-center gap-3">
            <span className="material-symbols-outlined text-3xl sm:text-4xl">local_shipping</span>
            Proveedores
          </h2>
          <p className="text-on-surface-variant mt-1 text-sm">Administra tus proveedores y cuentas por pagar.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button onClick={() => setShowCargaMasiva(true)}
            className={cn(botonEncabezado, 'bg-surface-container-lowest text-primary border border-primary/30 shadow-sm hover:bg-primary/5')}>
            <span className="material-symbols-outlined text-lg">upload_file</span>
            Carga Masiva
          </button>
          <button onClick={exportarProveedoresCSV}
            className={cn(botonEncabezado, 'bg-surface-container-lowest text-primary border border-primary/30 shadow-sm hover:bg-primary/5')}>
            <span className="material-symbols-outlined text-lg">download</span>
            Exportar
          </button>
          <button onClick={abrirNuevo}
            className={cn(botonEncabezado, 'bg-primary text-inverse-on-surface shadow-lg shadow-primary/20 hover:scale-105 transition-transform')}>
            <span className="material-symbols-outlined text-lg">person_add</span>
            Nuevo Proveedor
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-primary/5 p-5 rounded-2xl border border-primary/20 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">Total proveedores</p>
          <p className="text-2xl xl:text-3xl font-black text-primary mt-1 break-words">{proveedores.length}</p>
        </div>
        <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/20 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Deuda total</p>
          <p className="text-2xl xl:text-3xl font-black text-on-surface mt-1 break-words">{fmt(totalDeuda)}</p>
        </div>
      </div>

      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">search</span>
        <input type="text" enterKeyHint="search" placeholder="Buscar por nombre o categoría..." value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full min-h-11 pl-9 pr-4 py-2.5 border-2 border-outline-variant/50 rounded-xl text-base sm:text-sm focus:border-primary outline-none bg-surface-container-lowest text-on-surface" />
      </div>

      {/* Sin overflow-hidden bajo md: el menú ⋯ de la última tarjeta no debe quedar recortado. */}
      <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm md:overflow-hidden">
        <TablaResponsiva
          filas={paginacion.visibles}
          clave={p => p.id}
          columnas={columnasProveedores}
          tituloTarjeta={p => p.nombre}
          subtituloTarjeta={p => [p.rut, p.categoria].filter(Boolean).join(' · ')}
          insigniaTarjeta={montoDeuda}
          datosTarjeta={p => [
            { etiqueta: 'Condición', valor: p.condicion_pago || '—' },
            { etiqueta: 'Teléfono', valor: p.telefono || '—' },
            { etiqueta: 'Email', valor: <span className="break-all">{p.email || '—'}</span> },
          ]}
          acciones={p => [
            { etiqueta: 'Editar', icono: 'edit', onClick: () => abrirEditar(p) },
            { etiqueta: 'Historial de pagos/deudas', icono: 'history', onClick: () => setHistorialProveedor(p) },
            { etiqueta: 'Eliminar', icono: 'delete', peligro: true, onClick: () => { setItemToDelete(p.id); setDeleteModalOpen(true); } },
          ]}
          vacio={<p className="p-8 text-center text-on-surface-variant">No se encontraron proveedores.</p>}
        />
        <Paginacion {...paginacion} />
      </div>

      {showModal && (
        <ModalResponsivo
          titulo={editandoId ? 'Editar Proveedor' : 'Nuevo Proveedor'}
          onCerrar={cerrarModal}
          ancho="sm:max-w-lg"
          pie={
            <>
              <button type="button" onClick={cerrarModal} className="flex-1 min-h-11 py-3 rounded-2xl border-2 border-outline-variant/50 font-bold text-on-surface-variant">Cancelar</button>
              <button type="button" onClick={guardar} disabled={!nuevo.nombre.trim()} className="flex-1 min-h-11 py-3 rounded-2xl bg-primary text-inverse-on-surface font-bold shadow-lg shadow-primary/20 disabled:opacity-50">{editandoId ? 'Guardar Cambios' : 'Guardar Proveedor'}</button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="proveedor-nombre" className={claseEtiqueta}>Nombre / Razón social</label>
              <input id="proveedor-nombre" type="text" autoComplete="organization" value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })}
                className={claseCampo} />
            </div>
            <div>
              <label htmlFor="proveedor-rut" className={claseEtiqueta}>RUT (opcional)</label>
              <input id="proveedor-rut" type="text" autoComplete="off" value={nuevo.rut} onChange={e => setNuevo({ ...nuevo, rut: e.target.value })}
                className={claseCampo} />
            </div>
            <div>
              <label htmlFor="proveedor-categoria" className={claseEtiqueta}>Categoría</label>
              <select id="proveedor-categoria" value={nuevo.categoria} onChange={e => setNuevo({ ...nuevo, categoria: e.target.value })}
                className={claseCampo}>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="proveedor-telefono" className={claseEtiqueta}>Teléfono</label>
                <input id="proveedor-telefono" type="tel" inputMode="tel" autoComplete="tel" value={nuevo.telefono} onChange={e => setNuevo({ ...nuevo, telefono: e.target.value })}
                  className={claseCampo} />
              </div>
              <div>
                <label htmlFor="proveedor-email" className={claseEtiqueta}>Email</label>
                <input id="proveedor-email" type="email" inputMode="email" autoComplete="email" value={nuevo.email} onChange={e => setNuevo({ ...nuevo, email: e.target.value })}
                  className={claseCampo} />
              </div>
            </div>
            <div>
              <label htmlFor="proveedor-condicion" className={claseEtiqueta}>Condición de pago</label>
              <input id="proveedor-condicion" type="text" placeholder="Ej: 30 días" value={nuevo.condicion_pago} onChange={e => setNuevo({ ...nuevo, condicion_pago: e.target.value })}
                className={claseCampo} />
            </div>
          </div>
        </ModalResponsivo>
      )}

      {showCargaMasiva && (
        <Suspense fallback={null}>
          <ModalCargaMasivaProveedores
            isOpen={showCargaMasiva}
            onClose={() => setShowCargaMasiva(false)}
            onImport={(nuevos) => { nuevos.forEach(p => addProveedor(p)); }}
            proveedoresExistentes={proveedores}
          />
        </Suspense>
      )}

      <ConfirmDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setItemToDelete(null); }}
        onConfirm={() => { if (itemToDelete) deleteProveedor(itemToDelete); }}
        title="Eliminar Proveedor" />

      {historialProveedor && (
        <ModalHistorialProveedor
          proveedor={historialProveedor}
          gastos={gastos}
          abonos={abonos}
          onClose={() => setHistorialProveedor(null)}
        />
      )}
    </div>
  );
}
