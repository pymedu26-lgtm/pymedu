import { useState, lazy, Suspense, useMemo } from 'react';
import { useDeferredValue } from 'react';
import { formatCLP, formatFecha } from '../../lib/fechas';
import { normalizarNombre, normalizarRut } from '../../1.-ERP/context/ERPContext';
import Paginacion, { usePaginacion } from '../../components/Paginacion';
import { Cliente, useERP } from '../../1.-ERP/context/ERPContext';
import ConfirmDeleteModal from '../../1.-ERP/components/ConfirmDeleteModal';
import CampoMoneda from '../../components/CampoMoneda';
import { cn } from '@/lib/utils';
import { Plus, Search, Edit, Trash2, Upload, FileText } from "lucide-react";
import ModalHistorialCliente from "../../1.-ERP/components/ModalHistorialCliente";
import TablaResponsiva, { type ColumnaTabla } from '../../components/TablaResponsiva';
import ModalResponsivo from '../../components/ModalResponsivo';

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
  const { clientes, addCliente, updateCliente, deleteCliente, getSaldoPendienteVenta, ventas, abonos, saldos, fusionarClientesDuplicados } = useERP();
  const [busqueda, setBusqueda] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showCargaMasiva, setShowCargaMasiva] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [historialCliente, setHistorialCliente] = useState<Cliente | null>(null);
  const [nuevo, setNuevo] = useState({ nombre: '', rut: '', telefono: '', email: '', direccion: '', comuna: '', notas: '', limite_credito: '' });
  const [rutError, setRutError] = useState('');

  const fmt = (n: number) => formatCLP(Math.abs(n));

  const busquedaDiferida = useDeferredValue(busqueda);
  const clientesFiltrados = useMemo(() => {
    const q = busquedaDiferida.toLowerCase();
    return q ? clientes.filter(c =>
      c.nombre.toLowerCase().includes(q) || (c.rut || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) || (c.telefono || '').toLowerCase().includes(q)) : clientes;
  }, [clientes, busquedaDiferida]);
  const paginacion = usePaginacion(clientesFiltrados, 25, [busquedaDiferida]);

  // Deuda real por cliente desde la fuente única de saldos (corrección #4); c.deuda podía desfasarse.
  const deudaPorCliente = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const v of ventas) {
      const saldo = saldos.porVenta.get(v.id) ?? 0;
      if (saldo <= 0) continue;
      const clave = v.cliente_id || `nom:${normalizarNombre(v.cliente)}`;
      mapa.set(clave, (mapa.get(clave) ?? 0) + saldo);
    }
    return mapa;
  }, [ventas, saldos]);
  const deudaDe = (c: Cliente) => deudaPorCliente.get(c.id) ?? deudaPorCliente.get(`nom:${normalizarNombre(c.nombre)}`) ?? 0;
  const totalDeuda = saldos.resumen.porCobrar;

  // Clientes repetidos por RUT o nombre (corrección #12).
  const duplicados = useMemo(() => {
    const vistos = new Set<string>();
    let repetidos = 0;
    for (const c of clientes) {
      const clave = c.rut ? `rut:${normalizarRut(c.rut)}` : `nom:${normalizarNombre(c.nombre)}`;
      if (vistos.has(clave)) repetidos++; else vistos.add(clave);
    }
    return repetidos;
  }, [clientes]);
  const fusionar = () => {
    if (!window.confirm(`Se unirán ${duplicados} cliente(s) repetidos con su registro principal (mismo RUT o nombre). Las ventas quedarán asociadas al cliente unido. ¿Continuar?`)) return;
    const n = fusionarClientesDuplicados();
    window.alert(`${n} cliente(s) fusionados.`);
  };

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

  const fechaCorta = (iso: string) => (iso ? formatFecha(iso) : '');

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
        deudaDe(c),
        c.limite_credito ?? '',
        c.notas || '',
      ];
    });
    descargarCSV(`clientes_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
  };

  const chipLimite = (c: Cliente, saldoReal: number) => {
    if (!c.limite_credito || c.limite_credito <= 0) return null;
    if (saldoReal >= c.limite_credito) {
      return <span className="inline-flex mt-1 items-center gap-1 rounded-full bg-error/10 px-2 py-0.5 text-[10px] font-black text-error uppercase tracking-wide">Límite alcanzado</span>;
    }
    if (saldoReal >= c.limite_credito * 0.85) {
      return <span className="inline-flex mt-1 items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-black text-warning uppercase tracking-wide">Cerca del límite</span>;
    }
    return null;
  };
  const chipSegmento = (c: Cliente) => {
    const seg = segmentoDe(resumenDe(c), 0);
    return (
      <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide whitespace-nowrap', seg.clase)}>
        {seg.nombre}
      </span>
    );
  };
  const textoVentas = (n: number) => `${n} venta${n === 1 ? '' : 's'}`;

  const columnasClientes: ColumnaTabla<Cliente>[] = [
    {
      clave: 'cliente', titulo: 'Cliente', celda: c => (
        <>
          <p className="font-bold text-on-surface">{c.nombre}</p>
          {c.rut && <p className="text-xs text-on-surface-variant">{c.rut}</p>}
        </>
      ),
    },
    {
      clave: 'contacto', titulo: 'Contacto', celda: c => (
        <div className="text-on-surface-variant text-xs">
          <p>{c.email || '—'}</p>
          <p>{c.telefono || '—'}</p>
        </div>
      ),
    },
    {
      clave: 'compras', titulo: 'Compras', celda: c => (
        <>
          {chipSegmento(c)}
          <p className="text-xs text-on-surface-variant mt-1">{textoVentas(resumenDe(c).cantidad)}</p>
        </>
      ),
    },
    {
      clave: 'deuda', titulo: 'Deuda pendiente', celda: c => {
        const saldoReal = deudaDe(c);
        return <span className={cn('font-extrabold whitespace-nowrap', saldoReal > 0 ? 'text-secondary' : 'text-success')}>{fmt(saldoReal)}</span>;
      },
    },
    {
      clave: 'limite', titulo: 'Límite de crédito', celda: c => c.limite_credito ? (
        <div>
          <p className="text-on-surface-variant whitespace-nowrap">{fmt(c.limite_credito)}</p>
          {chipLimite(c, deudaDe(c))}
        </div>
      ) : '—',
    },
  ];

  const botonEncabezado = 'flex min-h-11 grow sm:grow-0 items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-full font-bold text-sm transition-all';
  const claseCampo = 'w-full min-h-11 px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-base sm:text-sm focus:border-primary outline-none bg-surface-container-lowest text-on-surface';

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 md:space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-primary flex items-center gap-3">
            <span className="material-symbols-outlined text-3xl sm:text-4xl">groups</span>
            Clientes
          </h2>
          <p className="text-on-surface-variant mt-1 text-sm">Administra tus clientes y su deuda pendiente.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {duplicados > 0 && (
            <button onClick={fusionar} title="Une clientes con el mismo RUT o nombre"
              className={cn(botonEncabezado, 'bg-warning-container text-on-warning-container shadow-sm hover:opacity-90')}>
              <span className="material-symbols-outlined text-lg">merge</span>
              Fusionar duplicados ({duplicados.toLocaleString('es-CL')})
            </button>
          )}
          <button onClick={() => setShowCargaMasiva(true)}
            className={cn(botonEncabezado, 'bg-surface-container-lowest text-primary border border-primary/30 shadow-sm hover:bg-primary/5')}>
            <span className="material-symbols-outlined text-lg">upload_file</span>
            Carga Masiva
          </button>
          <button onClick={exportarClientesCSV}
            className={cn(botonEncabezado, 'bg-surface-container-lowest text-primary border border-primary/30 shadow-sm hover:bg-primary/5')}>
            <span className="material-symbols-outlined text-lg">download</span>
            Exportar
          </button>
          <button onClick={abrirNuevo}
            className={cn(botonEncabezado, 'bg-primary text-inverse-on-surface shadow-lg shadow-primary/20 hover:scale-105 transition-transform')}>
            <span className="material-symbols-outlined text-lg">person_add</span>
            Nuevo Cliente
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-primary/5 p-5 rounded-2xl border border-primary/20 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">Total clientes</p>
          <p className="text-2xl xl:text-3xl font-black text-primary mt-1 break-words">{clientes.length.toLocaleString('es-CL')}</p>
        </div>
        <div className="bg-secondary/10 p-5 rounded-2xl border border-secondary/20 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-secondary">Por cobrar (saldo a hoy)</p>
          <p className="text-2xl xl:text-3xl font-black text-secondary mt-1 break-words">{fmt(totalDeuda)}</p>
          <p className="text-[11px] text-on-surface-variant mt-1">{saldos.resumen.ventasPorCobrar.toLocaleString('es-CL')} ventas sin cobrar</p>
        </div>
        <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/20 min-w-0 sm:col-span-2 lg:col-span-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Clientes con saldo pendiente</p>
          <p className="text-2xl xl:text-3xl font-black text-on-surface mt-1 break-words">{saldos.resumen.clientesConDeuda.toLocaleString('es-CL')}</p>
        </div>
      </div>

      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">search</span>
        <input type="text" enterKeyHint="search" placeholder="Buscar por nombre, RUT o correo..." value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full min-h-11 pl-9 pr-4 py-2.5 border-2 border-outline-variant/50 rounded-xl text-base sm:text-sm focus:border-primary outline-none bg-surface-container-lowest text-on-surface" />
      </div>

      {/* Sin overflow-hidden bajo md: el menú ⋯ de la última tarjeta no debe quedar recortado. */}
      <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/20 shadow-sm md:overflow-hidden">
        <TablaResponsiva
          filas={paginacion.visibles}
          clave={c => c.id}
          columnas={columnasClientes}
          tituloTarjeta={c => c.nombre}
          subtituloTarjeta={c => [c.rut, textoVentas(resumenDe(c).cantidad)].filter(Boolean).join(' · ')}
          insigniaTarjeta={chipSegmento}
          datosTarjeta={c => {
            const saldoReal = deudaDe(c);
            return [
              { etiqueta: 'Deuda pendiente', valor: <span className={saldoReal > 0 ? 'text-secondary' : 'text-success'}>{fmt(saldoReal)}</span> },
              { etiqueta: 'Límite de crédito', valor: c.limite_credito ? <>{fmt(c.limite_credito)}{chipLimite(c, saldoReal) && <span className="block">{chipLimite(c, saldoReal)}</span>}</> : '—' },
              { etiqueta: 'Teléfono', valor: c.telefono || '—' },
              { etiqueta: 'Email', valor: <span className="break-all">{c.email || '—'}</span> },
            ];
          }}
          acciones={c => [
            { etiqueta: 'Editar', icono: 'edit', onClick: () => abrirEditar(c) },
            { etiqueta: 'Historial de pagos/deudas', icono: 'history', onClick: () => setHistorialCliente(c) },
            { etiqueta: 'Eliminar', icono: 'delete', peligro: true, onClick: () => { setItemToDelete(c.id); setDeleteModalOpen(true); } },
          ]}
          vacio={<p className="p-8 text-center text-on-surface-variant">No se encontraron clientes.</p>}
        />
        <Paginacion {...paginacion} />
      </div>

      {showModal && (
        <ModalResponsivo
          titulo={editandoId ? 'Editar Cliente' : 'Nuevo Cliente'}
          onCerrar={cerrarModal}
          ancho="sm:max-w-5xl"
          pie={
            <>
              <button type="button" onClick={cerrarModal} className="flex-1 min-h-11 py-3 rounded-2xl border-2 border-outline-variant/50 font-bold text-on-surface-variant">Cancelar</button>
              <button type="button" onClick={guardar} disabled={!nuevo.nombre.trim()} className="flex-1 min-h-11 py-3 rounded-2xl bg-primary text-inverse-on-surface font-bold shadow-lg shadow-primary/20 disabled:opacity-50">
                {editandoId ? 'Guardar Cambios' : 'Guardar Cliente'}
              </button>
            </>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { key: 'nombre' as const, label: 'Nombre / Razón social', tipo: 'text', modo: undefined, autocompletar: 'organization' },
              { key: 'rut' as const, label: 'RUT (opcional)', tipo: 'text', modo: undefined, autocompletar: 'off' },
              { key: 'telefono' as const, label: 'Teléfono', tipo: 'tel', modo: 'tel' as const, autocompletar: 'tel' },
              { key: 'email' as const, label: 'Email', tipo: 'email', modo: 'email' as const, autocompletar: 'email' },
              { key: 'direccion' as const, label: 'Dirección (opcional)', tipo: 'text', modo: undefined, autocompletar: 'street-address' },
              { key: 'comuna' as const, label: 'Comuna (opcional)', tipo: 'text', modo: undefined, autocompletar: 'address-level2' },
              { key: 'notas' as const, label: 'Notas (opcional)', tipo: 'text', modo: undefined, autocompletar: 'off' },
              { key: 'limite_credito' as const, label: 'Límite de crédito (opcional)', tipo: 'text', modo: undefined, autocompletar: 'off' },
            ].map(f => (
              <div key={f.key} className={f.key === 'notas' ? 'md:col-span-2' : ''}>
                <label htmlFor={f.key === 'limite_credito' ? undefined : `cliente-${f.key}`} className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">{f.label}</label>
                {f.key === 'limite_credito' ? (
                  <CampoMoneda
                    valor={nuevo.limite_credito}
                    onChange={monto => setNuevo({ ...nuevo, limite_credito: monto ? String(monto) : '' })}
                    placeholder="$0"
                    className="min-h-11 px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-base sm:text-sm focus:border-primary outline-none bg-surface-container-lowest text-on-surface"
                  />
                ) : (
                  <input
                    id={`cliente-${f.key}`}
                    type={f.tipo}
                    inputMode={f.modo}
                    autoComplete={f.autocompletar}
                    value={nuevo[f.key]}
                    onChange={e => {
                      const valor = f.key === 'rut' ? formatearRUT(e.target.value) : e.target.value;
                      setNuevo({ ...nuevo, [f.key]: valor });
                      if (f.key === 'rut' && rutError) setRutError('');
                    }}
                    className={claseCampo}
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
        </ModalResponsivo>
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
