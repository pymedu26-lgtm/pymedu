import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { mercadoPublicoService } from '../services/mercadoPublico';

type EstadoOportunidad = 'Abierta' | 'Por cerrar' | 'En evaluacion';
type CalceOportunidad = 'Alto' | 'Medio' | 'Explorar';

interface OportunidadPublica {
  id: string;
  codigo: string;
  titulo: string;
  organismo: string;
  region: string;
  cierre: string;
  montoEstimado: number | null;
  rubro: string;
  estado: EstadoOportunidad;
  calce: CalceOportunidad;
  accion: string;
  motivos: string[];
  documentosPendientes: string[];
  fechaCierreRaw?: Date;
  carpetaPostulacion?: DocumentoPostulacion[];
  responsables?: ResponsablePostulacion[];
}

interface DocumentoPostulacion {
  nombre: string;
  origen: string;
  estado: 'Listo' | 'Pendiente' | 'En revision';
  responsable: string;
}

interface ResponsablePostulacion {
  nombre: string;
  rol: string;
  permiso: string;
  estado: 'Activo' | 'Invitado' | 'Tercero';
}

const carpetaBasePostulacion: DocumentoPostulacion[] = [
  { nombre: 'Certificado de experiencia', origen: 'Documentos / Empresa', estado: 'Pendiente', responsable: 'Encargado postulaciones' },
  { nombre: 'Propuesta tecnica', origen: 'Plantilla editable', estado: 'En revision', responsable: 'Mentor externo' },
  { nombre: 'Declaracion jurada proveedor', origen: 'Carpeta legal', estado: 'Pendiente', responsable: 'Representante legal' },
  { nombre: 'Respaldo tributario y bancario', origen: 'Reportes por periodo', estado: 'Listo', responsable: 'Contador externo' },
];

const responsablesBasePostulacion: ResponsablePostulacion[] = [
  { nombre: 'Dueno de la cuenta', rol: 'Aprobador final', permiso: 'Aprueba y descarga carpeta', estado: 'Activo' },
  { nombre: 'Camila Torres', rol: 'Encargada postulaciones', permiso: 'Sube documentos y edita propuesta', estado: 'Invitado' },
  { nombre: 'Contador externo', rol: 'Validador tributario', permiso: 'Solo reportes y respaldos', estado: 'Tercero' },
  { nombre: 'Mentor licitaciones', rol: 'Revisor propuesta', permiso: 'Carga comentarios y version tecnica', estado: 'Tercero' },
];

const metodoPostulacion = [
  { paso: '1', titulo: 'Encontrar oportunidad', detalle: 'Traemos licitaciones activas por rubro, territorio, organismo y fecha de cierre.', icon: 'travel_explore' },
  { paso: '2', titulo: 'Entender si conviene', detalle: 'El sistema explica calce, riesgo, documentos faltantes y proximo paso en lenguaje simple.', icon: 'psychology_alt' },
  { paso: '3', titulo: 'Preparar respaldo', detalle: 'Conecta Equipo, Documentos, Reportes y Municipalidad para armar una postulacion seria.', icon: 'folder_shared' },
  { paso: '4', titulo: 'Postular oficialmente', detalle: 'La postulacion final ocurre en Mercado Publico; PymEdu deja el expediente listo.', icon: 'verified' },
];

const conexionesERP = [
  { titulo: 'RR.HH. y Equipo', detalle: 'Responsables de propuesta, permisos, contratos vigentes y certificados del equipo ejecutor.', path: '/erp/equipo', icon: 'groups' },
  { titulo: 'Documentos laborales', detalle: 'Plantillas, declaraciones, anexos y archivo en nube para reutilizar en nuevas postulaciones.', path: '/erp/documentos', icon: 'description' },
  { titulo: 'Reportes y banca', detalle: 'Periodo, caja, respaldo tributario y capacidad operativa explicada para terceros.', path: '/erp/reportes', icon: 'bar_chart' },
  { titulo: 'Portal Municipal', detalle: 'Lectura territorial agregada para vender licencias sin exponer ganancias privadas.', path: '/erp/portal-municipal', icon: 'location_city' },
];

const estados: Array<'Todos' | EstadoOportunidad> = ['Todos', 'Abierta', 'Por cerrar', 'En evaluacion'];
const regiones = ['Todas', 'Metropolitana', 'Valparaiso', 'Biobio', 'Nacional'];

function formatCurrency(value: number) {
  return value.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
}

function StatusBadge({ value }: { value: EstadoOportunidad }) {
  const tone: Record<EstadoOportunidad, string> = {
    Abierta: 'bg-success-container text-on-success-container',
    'Por cerrar': 'bg-warning-container text-on-warning-container',
    'En evaluacion': 'bg-surface-container text-on-surface-variant',
  };
  return <span className={cn('rounded-full px-3 py-1 text-xs font-extrabold', tone[value])}>{value}</span>;
}

function FitBadge({ value }: { value: CalceOportunidad }) {
  const tone: Record<CalceOportunidad, string> = {
    Alto: 'bg-primary text-inverse-on-surface',
    Medio: 'bg-secondary-container text-primary',
    Explorar: 'bg-surface-container-high text-on-surface-variant',
  };
  return <span className={cn('rounded-full px-3 py-1 text-xs font-extrabold', tone[value])}>Calce {value}</span>;
}

export default function ERPMercadosPublicos() {
  const [busqueda, setBusqueda] = useState('');
  const [region, setRegion] = useState('Todas');
  const [estado, setEstado] = useState<'Todos' | EstadoOportunidad>('Todos');
  const [realOportunidades, setRealOportunidades] = useState<OportunidadPublica[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [carpetaUploadNombre, setCarpetaUploadNombre] = useState('');
  const [carpetasCreadas, setCarpetasCreadas] = useState<Record<string, string>>({});
  const [paginaActual, setPaginaActual] = useState(1);
  const itemsPorPagina = 6;

  const fetchLicitaciones = async () => {
    if (loading) return;
    setLoading(true);
    setPaginaActual(1);
    try {
      const listado = await mercadoPublicoService.getLicitacionesHoy();
      if (!listado || listado.length === 0) {
        setRealOportunidades([]);
        setLoading(false);
        return;
      }

      const targetCount = 30; // 5 pages of 6
      const subListado = listado.slice(0, targetCount);
      const results: OportunidadPublica[] = [];
      const chunkSize = 5;

      for (let i = 0; i < subListado.length; i += chunkSize) {
        const chunk = subListado.slice(i, i + chunkSize);
        const chunkDetails = await Promise.all(
          chunk.map(async (item) => {
            try {
              const detail = await mercadoPublicoService.getDetalleLicitacion(item.CodigoExterno);
              const hoy = new Date();
              
              if (detail) {
                const fechaCierre = detail.FechaCierre ? new Date(detail.FechaCierre) : null;
                let estadoCalculado: EstadoOportunidad = (detail.Estado === 'Publicada' ? 'Abierta' : 'En evaluacion') as EstadoOportunidad;

                if (fechaCierre) {
                  const diffDays = (fechaCierre.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
                  if (diffDays >= 0 && diffDays <= 5.5) estadoCalculado = 'Por cerrar';
                }

                return {
                  id: detail.CodigoExterno,
                  codigo: detail.CodigoExterno,
                  titulo: detail.Nombre,
                  organismo: detail.Comprador?.NombreOrganismo || 'Organismo Público',
                  region: detail.Comprador?.RegionUnidad || 'Nacional',
                  cierre: fechaCierre ? fechaCierre.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Consultar bases',
                  fechaCierreRaw: fechaCierre || undefined,
                  montoEstimado: detail.MontoEstimado || null,
                  rubro: detail.Items?.Listado?.[0]?.NombreProducto || 'Suministros y Servicios',
                  estado: estadoCalculado,
                  calce: !detail.MontoEstimado ? 'Explorar' : (estadoCalculado !== 'En evaluacion' ? 'Alto' : 'Medio'),
                  accion: 'Revisar bases y preparar propuesta técnica.',
                  motivos: ['Sincronizado vía API oficial', detail.Descripcion?.slice(0, 100).concat('...') || 'Revisar en portal oficial.', 'Rubro compatible'],
                  documentosPendientes: ['Certificado experiencia', 'Propuesta técnica', 'Garantía seriedad'],
                } as OportunidadPublica;
              }

              // Fallback
              const fechaCierreFallback = item.FechaCierre ? new Date(item.FechaCierre) : null;
              let estadoFallback: EstadoOportunidad = 'Abierta';
              if (fechaCierreFallback) {
                const diffDays = (fechaCierreFallback.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
                if (diffDays >= 0 && diffDays <= 5.5) estadoFallback = 'Por cerrar';
              }

              return {
                id: item.CodigoExterno,
                codigo: item.CodigoExterno,
                titulo: item.Nombre,
                organismo: 'Organismo Público',
                region: 'Chile',
                cierre: fechaCierreFallback ? fechaCierreFallback.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) : 'Varios',
                fechaCierreRaw: fechaCierreFallback || undefined,
                montoEstimado: null,
                rubro: 'Suministros y Servicios',
                estado: estadoFallback,
                calce: 'Explorar',
                accion: 'Acceder al portal oficial.',
                motivos: ['Información sincronizada básica.'],
                documentosPendientes: ['Revisar en portal'],
              } as OportunidadPublica;
            } catch (e) { return null; }
          })
        );
        results.push(...chunkDetails.filter((item): item is OportunidadPublica => item !== null));
      }
      setRealOportunidades(results);
      if (results.length > 0) setSelectedId(results[0].id);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLicitaciones(); }, []);

  const handlePageChange = (newPage: number) => {
    setPaginaActual(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const oportunidadesFiltradas = useMemo(() => {
    const query = busqueda.trim().toLowerCase();
    return realOportunidades.filter(item => {
      const matchesQuery = !query || item.titulo.toLowerCase().includes(query) || item.organismo.toLowerCase().includes(query) || item.codigo.toLowerCase().includes(query) || item.rubro.toLowerCase().includes(query);
      const regionSearch = region.toLowerCase();
      const matchesRegion = region === 'Todas' || item.region.toLowerCase().includes(regionSearch) || (region === 'Metropolitana' && item.region.toLowerCase().includes('santiago')) || (region === 'Valparaiso' && item.region.toLowerCase().includes('valpara')) || (region === 'Biobio' && (item.region.toLowerCase().includes('bio') || item.region.toLowerCase().includes('concep')));
      const matchesEstado = estado === 'Todos' || item.estado === estado;
      return matchesQuery && matchesRegion && matchesEstado;
    });
  }, [busqueda, estado, region, realOportunidades]);

  const totalPaginas = realOportunidades.length > 0 ? Math.ceil(oportunidadesFiltradas.length / itemsPorPagina) : 0;
  const oportunidades = useMemo(() => {
    const inicio = (paginaActual - 1) * itemsPorPagina;
    return oportunidadesFiltradas.slice(inicio, inicio + itemsPorPagina);
  }, [oportunidadesFiltradas, paginaActual]);

  const selectedOpportunity = oportunidadesFiltradas.find(item => item.id === selectedId) ?? oportunidades[0] ?? realOportunidades[0];
  const abiertas = oportunidadesFiltradas.filter(item => item.estado === 'Abierta').length;
  const porCerrar = oportunidadesFiltradas.filter(item => item.estado === 'Por cerrar').length;
  const altoCalceCount = oportunidadesFiltradas.filter(item => item.calce === 'Alto').length;
  const montoPotencial = oportunidadesFiltradas.filter(item => item.calce === 'Alto').reduce((acc, item) => acc + (item.montoEstimado || 0), 0);
  const carpetaPostulacion = selectedOpportunity?.carpetaPostulacion ?? carpetaBasePostulacion;
  const responsablesPostulacion = selectedOpportunity?.responsables ?? responsablesBasePostulacion;

  return (
    <div className="min-h-screen bg-surface p-6 text-on-surface md:p-8 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-black text-primary">Mercados Públicos</h1>
          <div className="flex items-center gap-3">
            {lastUpdate && <span className="text-xs font-bold text-outline">Última actualización: {lastUpdate.toLocaleTimeString()}</span>}
            <button onClick={fetchLicitaciones} disabled={loading} className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-black text-inverse-on-surface shadow-lg shadow-primary/20 transition-all hover:bg-primary-container disabled:opacity-50">
              <span className={cn('material-symbols-outlined text-lg', loading && 'animate-spin')}>refresh</span>
              Refrescar Licitaciones
            </button>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Oportunidades abiertas', value: abiertas.toString(), icon: 'campaign' },
            { label: 'Vencen pronto (5 días)', value: porCerrar.toString(), icon: 'schedule' },
            { label: 'Potencial Adjudicación', value: formatCurrency(montoPotencial), icon: 'star' },
            { label: 'Alto Calce (Cantidad)', value: altoCalceCount.toString(), icon: 'verified' },
          ].map(card => (
            <div key={card.label} className="rounded-[28px] border border-outline-variant/45 bg-surface-container-lowest p-5 shadow-sm dark-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-outline">{card.label}</p>
                  <p className="mt-3 text-3xl font-black text-primary">{card.value}</p>
                </div>
                <span className="material-symbols-outlined rounded-2xl bg-secondary-container p-3 text-primary">{card.icon}</span>
              </div>
            </div>
          ))}
        </div>

        <section className="rounded-[32px] border border-outline-variant/45 bg-surface-container-lowest p-5 shadow-sm dark-card lg:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.24em] text-outline">Explorador de oportunidades</p>
              <h2 className="mt-2 text-2xl font-black text-primary">Buscar, filtrar y decidir sin perderse en las bases</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[680px]">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-outline">search</span>
                <input value={busqueda} onChange={e => { setBusqueda(e.target.value); setPaginaActual(1); }} placeholder="Buscar codigo, organismo o rubro" className="w-full rounded-2xl border border-outline-variant/70 bg-surface-container-low py-3 pl-10 pr-4 text-sm font-semibold text-on-surface outline-none focus:border-primary" />
              </div>
              <select value={region} onChange={e => { setRegion(e.target.value); setPaginaActual(1); }} className="rounded-2xl border border-outline-variant/70 bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface outline-none focus:border-primary">
                {regiones.map(item => <option key={item}>{item}</option>)}
              </select>
              <select value={estado} onChange={e => { setEstado(e.target.value as any); setPaginaActual(1); }} className="rounded-2xl border border-outline-variant/70 bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface outline-none focus:border-primary">
                {estados.map(item => <option key={item}>{item}</option>)}
              </select>
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-outline-variant/45 bg-surface-container-lowest p-5 shadow-sm dark-card lg:p-6">
          <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
            <div className="space-y-3">
              {loading && (
                <div className="flex flex-col items-center justify-center rounded-[26px] border border-dashed border-primary/30 bg-primary/5 p-12 text-center">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                  <h3 className="mt-4 text-lg font-black text-primary">Conectando con API de Mercado Público...</h3>
                  <p className="mt-2 text-sm text-on-surface-variant">Obteniendo licitaciones activas del día.</p>
                </div>
              )}
              {!loading && oportunidades.map(item => {
                const selected = item.id === selectedOpportunity?.id;
                return (
                  <div key={item.id} className={cn('group relative w-full rounded-[26px] border p-5 text-left transition-all dark-card', selected ? 'border-primary bg-secondary-container/30 shadow-lg shadow-primary/10' : 'border-outline-variant/45 hover:border-primary/40 hover:bg-surface-container-low')}>
                    <button onClick={() => setSelectedId(item.id)} className="absolute inset-0 z-0 rounded-[26px]" />
                    <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-surface-container px-3 py-1 font-mono text-xs font-black text-primary">{item.codigo}</span>
                          <StatusBadge value={item.estado} />
                          <FitBadge value={item.calce} />
                        </div>
                        <h3 className="mt-3 text-lg font-black text-on-surface">{item.titulo}</h3>
                        <p className="mt-1 text-sm leading-6 text-on-surface-variant">{item.organismo} · {item.region} · cierre {item.cierre}</p>
                      </div>
                      <div className="flex flex-row items-start gap-4 md:flex-col md:items-end">
                        <div className="md:text-right">
                          <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-outline">Monto estimado</p>
                          <p className="mt-1 text-xl font-black text-primary">{item.montoEstimado ? formatCurrency(item.montoEstimado) : 'Consultar bases'}</p>
                        </div>
                        <a href={`https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idLicitacion=${item.codigo}`} target="_blank" rel="noreferrer" className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors hover:bg-primary hover:text-inverse-on-surface"><span className="material-symbols-outlined text-lg">open_in_new</span></a>
                      </div>
                    </div>
                    <p className="relative z-10 mt-4 rounded-2xl bg-surface-container/70 px-4 py-3 text-sm font-semibold leading-6 text-on-surface-variant">Siguiente paso: {item.accion}</p>
                  </div>
                );
              })}
              {!loading && oportunidadesFiltradas.length > 0 && totalPaginas > 1 && (
                <div className="flex flex-col items-center justify-center gap-4 rounded-[26px] bg-surface-container-lowest p-6 shadow-sm dark-card border border-outline-variant/45">
                  <div className="flex items-center gap-1">
                    <button onClick={() => handlePageChange(Math.max(1, paginaActual - 1))} disabled={paginaActual === 1} className="flex h-10 w-10 items-center justify-center rounded-xl text-primary transition-colors hover:bg-secondary-container disabled:opacity-20"><span className="material-symbols-outlined">chevron_left</span></button>
                    {Array.from({ length: totalPaginas }, (_, i) => i + 1).map(page => (
                      <button key={page} onClick={() => handlePageChange(page)} className={cn('flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black transition-all', paginaActual === page ? 'bg-primary text-inverse-on-surface shadow-lg shadow-primary/30 scale-110' : 'text-outline hover:bg-secondary-container hover:text-primary')}>{page}</button>
                    ))}
                    <button onClick={() => handlePageChange(Math.min(totalPaginas, paginaActual + 1))} disabled={paginaActual === totalPaginas} className="flex h-10 w-10 items-center justify-center rounded-xl text-primary transition-colors hover:bg-secondary-container disabled:opacity-20"><span className="material-symbols-outlined">chevron_right</span></button>
                  </div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-outline/60">Mostrando {(paginaActual - 1) * itemsPorPagina + 1} - {Math.min(paginaActual * itemsPorPagina, oportunidadesFiltradas.length)} de {oportunidadesFiltradas.length} licitaciones</p>
                </div>
              )}
              {!loading && oportunidadesFiltradas.length === 0 && (
                <div className="rounded-[26px] border border-dashed border-outline-variant bg-surface-container-lowest p-8 text-center dark-card">
                  <span className="material-symbols-outlined text-4xl text-outline">search_off</span>
                  <h3 className="mt-3 text-lg font-black text-primary">Sin resultados</h3>
                </div>
              )}
            </div>
            <aside className="rounded-[30px] border border-outline-variant/45 bg-surface-container-lowest p-5 shadow-sm dark-card">
              {!selectedOpportunity && !loading && <div className="flex h-full flex-col items-center justify-center p-8 text-center"><span className="material-symbols-outlined text-4xl text-outline">info</span><p className="mt-4 text-sm text-on-surface-variant">Selecciona una oportunidad.</p></div>}
              {selectedOpportunity && (
                <>
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.24em] text-outline">Workspace</p>
                  <h3 className="mt-2 text-2xl font-black text-primary">{selectedOpportunity.codigo}</h3>
                  <div className="mt-5 space-y-4">
                    <div className="rounded-[24px] bg-surface-container-low p-4">
                      <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-outline">Por qué calza</p>
                      <div className="mt-3 space-y-2">{selectedOpportunity.motivos.map(m => <div key={m} className="flex items-start gap-2 text-sm text-on-surface-variant"><span className="material-symbols-outlined mt-0.5 text-base text-primary">check_circle</span><span>{m}</span></div>)}</div>
                    </div>
                    <div className="rounded-[24px] border border-outline-variant/40 bg-surface-container-low p-4">
                      <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-outline">Carpeta ({carpetaPostulacion.length})</p>
                      {carpetasCreadas[selectedOpportunity.id] && (
                        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-success-container px-3 py-2 text-xs font-black text-on-success-container">
                          <span className="material-symbols-outlined text-base">folder_special</span>
                          Carpeta creada el {new Date(carpetasCreadas[selectedOpportunity.id]).toLocaleDateString('es-CL')}
                        </div>
                      )}
                      <div className="mt-4 space-y-2">{carpetaPostulacion.map(doc => <div key={doc.nombre} className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-3"><div className="flex justify-between"><div><p className="text-sm font-black text-primary">{doc.nombre}</p><p className="text-xs text-on-surface-variant">{doc.responsable}</p></div><span className="text-[10px] font-black">{doc.estado}</span></div></div>)}</div>
                    </div>
                    {carpetasCreadas[selectedOpportunity.id] ? (
                      <button disabled className="w-full rounded-2xl bg-success-container px-5 py-3 text-sm font-black text-on-success-container cursor-default">
                        <span className="material-symbols-outlined text-base align-middle">check_circle</span> Carpeta lista para postular
                      </button>
                    ) : (
                      <button onClick={() => setCarpetasCreadas(prev => ({ ...prev, [selectedOpportunity.id]: new Date().toISOString() }))} className="w-full rounded-2xl bg-primary px-5 py-3 text-sm font-black text-inverse-on-surface shadow-lg shadow-primary/20 hover:bg-primary-container transition-colors">
                        Crear carpeta
                      </button>
                    )}
                  </div>
                </>
              )}
            </aside>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[32px] border border-outline-variant/45 bg-surface-container-lowest p-6 shadow-sm dark-card">
            <h2 className="text-2xl font-black text-primary">Método PymEdu</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {metodoPostulacion.map(item => (
                <div key={item.paso} className="rounded-[24px] border border-outline-variant/45 bg-surface-container-low p-4">
                  <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-sm font-black text-inverse-on-surface">{item.paso}</span><span className="material-symbols-outlined text-primary">{item.icon}</span></div>
                  <h3 className="mt-4 text-base font-black text-on-surface">{item.titulo}</h3>
                  <p className="mt-2 text-sm text-on-surface-variant">{item.detalle}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[32px] border border-outline-variant/45 bg-surface-container-lowest p-6 shadow-sm dark-card">
            <h2 className="text-2xl font-black text-primary">Conexiones ERP</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {conexionesERP.map(item => (
                <Link key={item.titulo} to={item.path} className="group rounded-[24px] border border-outline-variant/45 bg-surface-container-low p-4 hover:border-primary/45">
                  <span className="material-symbols-outlined rounded-2xl bg-secondary-container p-3 text-primary">{item.icon}</span>
                  <h3 className="mt-4 text-base font-black text-on-surface">{item.titulo}</h3>
                  <p className="mt-2 text-sm text-on-surface-variant">{item.detalle}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
