// Centro de alertas: una sola fuente (services/alertas.ts vía ERPContext) con estado persistido
// (nueva, vista, pospuesta, descartada) en la colección `notificaciones`.
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useERP } from '../../1.-ERP/context/ERPContext';
import { CATEGORIAS, horaRelativa, type Alerta, type CategoriaAlerta } from '../../1.-ERP/services/alertas';
import { normalizarNombre } from '../../1.-ERP/context/ERPContext';
import { formatFecha } from '../../lib/fechas';
import { cn } from '../../lib/utils';

const COLOR: Record<Alerta['tipo'], { icono: string; borde: string }> = {
  critica: { icono: 'text-error bg-error/10', borde: 'border-l-error' },
  tributaria: { icono: 'text-violet bg-violet/15', borde: 'border-l-violet' },
  advertencia: { icono: 'text-warning bg-warning/15', borde: 'border-l-warning' },
  info: { icono: 'text-primary bg-primary/10', borde: 'border-l-primary' },
  exito: { icono: 'text-success bg-success/15', borde: 'border-l-success' },
};

const manana = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d.toISOString(); };
const enUnaSemana = () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(8, 0, 0, 0); return d.toISOString(); };
const clavesDe = (a: Alerta) => (a.grupo ? a.grupo.map(g => g.clave) : [a.clave]);
const fechaVisible = (a: Alerta) => (a.venceEn ? `Vence ${formatFecha(a.venceEn)}` : horaRelativa(a.creadaEn));

function Tarjeta({ a, onMarcar, compacta }: { key?: string; a: Alerta; onMarcar: (claves: string[], estado: 'vista' | 'pospuesta' | 'descartada', hasta?: string) => void; compacta?: boolean }) {
  const [menu, setMenu] = useState(false);
  const [abierta, setAbierta] = useState(false);
  const principal = a.acciones[0];
  return (
    <li className={cn('rounded-2xl border border-l-4 border-outline-variant/30 bg-surface-container-lowest p-3 sm:p-4', COLOR[a.tipo].borde, a.estado === 'vista' && 'opacity-80')}>
      <div className="flex items-start gap-3">
        <span className={cn('material-symbols-outlined shrink-0 rounded-xl p-1.5 text-xl', COLOR[a.tipo].icono)}>{a.icono}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {a.estado === 'nueva' && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="nueva" />}
            <h4 className="text-sm font-bold text-on-surface">{a.titulo}</h4>
            {a.veces && a.veces > 1 && <span className="rounded-full bg-surface-container-high px-2 text-[10px] font-bold text-on-surface-variant">×{a.veces}</span>}
          </div>
          <p className={cn('mt-0.5 text-xs text-on-surface-variant', compacta && 'line-clamp-2')}>{a.detalle}</p>
          <p className="mt-1 text-[11px] font-bold text-outline">
            {fechaVisible(a)}{a.estado === 'pospuesta' && a.pospuestaHasta ? ` · pospuesta hasta ${formatFecha(a.pospuestaHasta.slice(0, 10))}` : ''}
            {a.resueltaEn ? ` · resuelta ${horaRelativa(a.resueltaEn)}` : ''}
          </p>
          {a.grupo && (
            <>
              <button type="button" onClick={() => setAbierta(v => !v)} aria-expanded={abierta} className="mt-1 inline-flex min-h-9 items-center gap-1 text-xs font-bold text-primary">
                <span className="material-symbols-outlined text-base">{abierta ? 'expand_less' : 'expand_more'}</span>{abierta ? 'Ocultar productos' : 'Ver productos'}
              </button>
              {abierta && (
                <ul className="mt-1 divide-y divide-outline-variant/20 rounded-xl border border-outline-variant/30">
                  {a.grupo.map(g => (
                    <li key={g.clave} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1 text-xs text-on-surface">{g.detalle}</span>
                      <Link to={g.acciones[0]?.url ?? '/erp/inventario'} onClick={() => onMarcar([g.clave], 'vista')}
                        className="inline-flex min-h-9 items-center rounded-full bg-primary px-3 text-[11px] font-bold text-inverse-on-surface">Reponer</Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {!a.resueltaEn && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {principal && (
                <Link to={principal.url} onClick={() => onMarcar(clavesDe(a), 'vista')}
                  className="inline-flex min-h-9 items-center gap-1 rounded-full border border-outline-variant/50 px-3 text-xs font-bold text-on-surface hover:border-primary/50">
                  {principal.etiqueta}<span className="material-symbols-outlined text-sm">arrow_forward</span>
                </Link>
              )}
              {a.estado === 'nueva' && (
                <button type="button" onClick={() => onMarcar(clavesDe(a), 'vista')} className="min-h-9 rounded-full px-3 text-xs font-bold text-on-surface-variant hover:text-primary">Marcar vista</button>
              )}
              <div className="relative">
                <button type="button" onClick={() => setMenu(v => !v)} aria-expanded={menu} className="min-h-9 rounded-full px-3 text-xs font-bold text-on-surface-variant hover:text-primary">
                  Posponer
                </button>
                {menu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                    <div className="absolute left-0 z-20 mt-1 w-44 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-1 shadow-xl">
                      <button type="button" onClick={() => { onMarcar(clavesDe(a), 'pospuesta', manana()); setMenu(false); }} className="flex min-h-11 w-full items-center rounded-lg px-3 text-sm hover:bg-surface-container-low">Hasta mañana</button>
                      <button type="button" onClick={() => { onMarcar(clavesDe(a), 'pospuesta', enUnaSemana()); setMenu(false); }} className="flex min-h-11 w-full items-center rounded-lg px-3 text-sm hover:bg-surface-container-low">Por 1 semana</button>
                    </div>
                  </>
                )}
              </div>
              {a.naturaleza === 'evento' && (
                <button type="button" onClick={() => onMarcar([a.clave], 'descartada')} className="min-h-9 rounded-full px-3 text-xs font-bold text-on-surface-variant hover:text-error">Descartar</button>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function Seccion({ titulo, icono, vacio, children, cantidad, colapsada }: { titulo: string; icono: string; vacio: string; children: ReactNode; cantidad: number; colapsada?: boolean }) {
  const [abierta, setAbierta] = useState(!colapsada);
  return (
    <section>
      <button type="button" onClick={() => setAbierta(v => !v)} aria-expanded={abierta} className="mb-2 flex min-h-11 w-full items-center gap-2 text-left">
        <span className="material-symbols-outlined text-lg text-primary">{icono}</span>
        <h3 className="text-sm font-black uppercase tracking-wide text-on-surface">{titulo}</h3>
        <span className="rounded-full bg-surface-container-high px-2 text-xs font-bold text-on-surface-variant">{cantidad}</span>
        <span className="material-symbols-outlined ml-auto text-outline">{abierta ? 'expand_less' : 'expand_more'}</span>
      </button>
      {abierta && (cantidad === 0
        ? <p className="rounded-2xl border border-dashed border-outline-variant/40 px-4 py-4 text-center text-xs text-on-surface-variant">{vacio}</p>
        : <ul className="space-y-2">{children}</ul>)}
    </section>
  );
}

export default function ERPAlertas() {
  const { alertas, alertasResueltas, marcarAlertas } = useERP();
  const [categoria, setCategoria] = useState<CategoriaAlerta | 'todas'>('todas');
  const [busqueda, setBusqueda] = useState('');

  const filtradas = useMemo(() => {
    const q = normalizarNombre(busqueda);
    return alertas.filter(a => (categoria === 'todas' || a.categoria === categoria)
      && (!q || normalizarNombre(`${a.titulo} ${a.detalle} ${(a.grupo ?? []).map(g => g.detalle).join(' ')}`).includes(q)));
  }, [alertas, categoria, busqueda]);
  const activas = filtradas.filter(a => a.estado === 'nueva' || a.estado === 'vista');
  const accion = activas.filter(a => a.seccion === 'accion');
  const vencimientos = activas.filter(a => a.seccion === 'vencimiento').sort((a, b) => (a.venceEn ?? '').localeCompare(b.venceEn ?? ''));
  const avisos = activas.filter(a => a.seccion === 'aviso');
  const actividad = activas.filter(a => a.seccion === 'actividad').sort((a, b) => b.creadaEn.localeCompare(a.creadaEn)).slice(0, 30);
  const pospuestas = filtradas.filter(a => a.estado === 'pospuesta');
  const resueltas = [...alertasResueltas.filter(a => categoria === 'todas' || a.categoria === categoria), ...filtradas.filter(a => a.estado === 'descartada')];
  const nuevas = alertas.filter(a => a.estado === 'nueva');
  const atencion = alertas.filter(a => (a.estado === 'nueva' || a.estado === 'vista') && (a.seccion === 'accion' || (a.seccion === 'vencimiento' && (a.venceEn ?? '9') <= new Date().toISOString().slice(0, 10)))).length;
  const conteo = (c: CategoriaAlerta | 'todas') => alertas.filter(a => (a.estado === 'nueva' || a.estado === 'vista') && (c === 'todas' || a.categoria === c)).length;
  const marcar = (claves: string[], estado: 'vista' | 'pospuesta' | 'descartada', hasta?: string) => marcarAlertas(claves, estado, hasta);

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-2xl font-extrabold text-primary sm:text-3xl">
            <span className="material-symbols-outlined text-3xl sm:text-4xl">notifications_active</span> Centro de alertas
          </h2>
          <p className={cn('mt-1 text-sm font-bold', atencion > 0 ? 'text-on-surface' : 'text-success')} role="status">
            {atencion > 0 ? `${atencion} ${atencion === 1 ? 'cosa requiere' : 'cosas requieren'} tu atención hoy` : 'Todo al día'}
          </p>
        </div>
        {nuevas.length > 0 && (
          <button type="button" onClick={() => marcarAlertas(nuevas.flatMap(clavesDe), 'vista')}
            className="flex min-h-11 items-center gap-2 rounded-xl border-2 border-outline-variant px-4 text-sm font-bold text-on-surface-variant hover:border-primary hover:text-primary">
            <span className="material-symbols-outlined text-lg">done_all</span> Marcar todo como visto
          </button>
        )}
      </header>

      <div className="space-y-3">
        <div className="relative">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline">search</span>
          <input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar alertas…" aria-label="Buscar alertas"
            className="min-h-11 w-full rounded-2xl border border-outline-variant/40 bg-surface-container-lowest py-2 pl-10 pr-4 text-base outline-none focus:ring-2 focus:ring-primary/20 sm:text-sm" />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 hide-scrollbar sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Filtrar por categoría">
          {[{ valor: 'todas' as const, etiqueta: 'Todas', icono: 'all_inclusive' }, ...CATEGORIAS].map(c => (
            <button key={c.valor} type="button" role="tab" aria-selected={categoria === c.valor} onClick={() => setCategoria(c.valor)}
              className={cn('inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-4 text-xs font-bold',
                categoria === c.valor ? 'border-primary bg-primary text-inverse-on-surface' : 'border-outline-variant/40 bg-surface-container-lowest text-on-surface-variant')}>
              <span className="material-symbols-outlined text-base">{c.icono}</span>{c.etiqueta}
              <span className={cn('rounded-full px-1.5 text-[10px]', categoria === c.valor ? 'bg-white/20' : 'bg-surface-container-high')}>{conteo(c.valor)}</span>
            </button>
          ))}
        </div>
      </div>

      <Seccion titulo="Requiere acción" icono="priority_high" cantidad={accion.length} vacio="Nada urgente por ahora.">
        {accion.map(a => <Tarjeta key={a.id} a={a} onMarcar={marcar} />)}
      </Seccion>
      <Seccion titulo="Próximos vencimientos" icono="event" cantidad={vencimientos.length} vacio="No hay vencimientos en los próximos días.">
        {vencimientos.map(a => <Tarjeta key={a.id} a={a} onMarcar={marcar} />)}
      </Seccion>
      <Seccion titulo="Avisos" icono="campaign" cantidad={avisos.length} vacio="Sin avisos.">
        {avisos.map(a => <Tarjeta key={a.id} a={a} onMarcar={marcar} />)}
      </Seccion>
      <Seccion titulo="Actividad reciente" icono="history" cantidad={actividad.length} vacio="Aún no hay actividad: aquí verás aperturas automáticas, ventas bloqueadas y mermas.">
        {actividad.map(a => <Tarjeta key={a.id} a={a} onMarcar={marcar} compacta />)}
      </Seccion>
      {pospuestas.length > 0 && (
        <Seccion titulo="Pospuestas" icono="snooze" cantidad={pospuestas.length} vacio="" colapsada>
          {pospuestas.map(a => <Tarjeta key={a.id} a={a} onMarcar={marcar} compacta />)}
        </Seccion>
      )}
      <Seccion titulo="Resueltas" icono="task_alt" cantidad={resueltas.length} vacio="Cuando una alerta se resuelva sola (por ejemplo, al reponer) aparecerá aquí." colapsada>
        {resueltas.map(a => <Tarjeta key={a.id} a={a} onMarcar={marcar} compacta />)}
      </Seccion>
    </div>
  );
}
