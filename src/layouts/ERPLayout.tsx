import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useERP } from '../1.-ERP/context/ERPContext';
import { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Toaster from '../components/Toaster';
import { cuentaCampana, visibles, horaRelativa, type Alerta } from '../1.-ERP/services/alertas';

const COLOR_ALERTA: Record<Alerta['tipo'], string> = {
  critica: 'text-error bg-error/10', tributaria: 'text-violet bg-violet/15', advertencia: 'text-warning bg-warning/15', info: 'text-primary bg-primary/10', exito: 'text-success bg-success/15',
};

interface NavItem {
  name: string;
  path: string;
  icon: string;
  tag: string;
  hint: string;
  permiso?: string | null;
  lock?: boolean;
  badge?: () => string | null;
}

interface NavGroup {
  key: string;
  label: string;
  icon: string;
  items: NavItem[];
}

export default function ERPLayout() {
  const { perfil, signOut, puedeHacer } = useAuth();
  const { saldos, alertas, marcarAlertas } = useERP();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set()
  );
  // Desde 1024 px el menú es lateral (ancho o en íconos). Bajo 1024 px es un CAJÓN deslizable
  // que se abre con la hamburguesa de la barra superior, se cierra al tocar fuera y al navegar.
  const [esEscritorio, setEsEscritorio] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1024);
  const [sidebarAbierto, setSidebarAbierto] = useState(true);
  const [cajonAbierto, setCajonAbierto] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const alCambiar = (e: MediaQueryListEvent) => { setEsEscritorio(e.matches); if (e.matches) setCajonAbierto(false); };
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);
  useEffect(() => { setCajonAbierto(false); setCampanaAbierta(false); }, [location.pathname, location.search]);
  /** En el cajón (móvil y tablet) el menú siempre se ve expandido. */
  const sidebarOpen = esEscritorio ? sidebarAbierto : true;
  const setSidebarOpen = (v: boolean) => (esEscritorio ? setSidebarAbierto(v) : setCajonAbierto(false));
  // Campana: insignia con alertas nuevas (críticas y avisos) y las 5 principales.
  const [campanaAbierta, setCampanaAbierta] = useState(false);
  const nuevasCampana = cuentaCampana(alertas);
  const principales = visibles(alertas).slice(0, 5);
  const [avatarError, setAvatarError] = useState(false);
  const [flyoutTop, setFlyoutTop] = useState(8);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const gruposRef = useRef<Record<string, HTMLElement | null>>({});

  const esPremium = perfil?.membresia_nivel === 'pro' || perfil?.membresia_nivel === 'premium';

  // Contadores desde la fuente única de saldos; cada documento se cuenta UNA vez (corrección #17).
  const { ventasPorCobrar: cxcCount, comprasPorPagar: cxpCount, ventasVencidas, comprasVencidas } = saldos.resumen;
  const pendientesTotal = cxcCount + cxpCount;
  const hayVencidos = ventasVencidas + comprasVencidas > 0;

  const isActive = (path: string) => location.pathname === path;

  const navGroups: NavGroup[] = [
    {
      key: 'control',
      label: 'Control',
      icon: 'dashboard',
      items: [
{
          name: 'Panel general',
          path: '/erp/inicio',
          icon: 'home',
          tag: 'PG',
          hint: 'Resumen del dia, KPIs y foco del negocio.',
          permiso: 'ver_mi_perfil',
        },
        {
          name: 'Centro de alertas',
          path: '/erp/alertas',
          icon: 'notifications_active',
          tag: 'AL',
          hint: 'Cobros vencidos, stock critico y tareas urgentes.',
          permiso: 'ver_mi_perfil',
        },
{
          name: 'Configuración',
          path: '/erp/configuracion',
          icon: 'settings',
          tag: 'CF',
          hint: 'Datos del negocio, permisos y ajustes base.',
          permiso: 'editar_mi_negocio',
        },
        {
name: 'Mi institución',
          path: '/erp/mi-institucion',
          icon: 'account_balance',
          tag: 'MI',
          hint: 'Vinculación a tu institución, solicitudes y códigos de invitación.',
          permiso: 'editar_mi_negocio',
        },
        {
          name: 'Plan y suscripción',
          path: '/erp/suscripcion',
          icon: 'workspace_premium',
          tag: 'PL',
          hint: 'Membresia, limites actuales y upgrade.',
          permiso: 'ver_mi_perfil',
        },
      ],
    },
    {
      key: 'erp',
      label: 'ERP',
      icon: 'point_of_sale',
      items: [
        {
          name: 'Ventas',
          path: '/erp/ventas',
          icon: 'point_of_sale',
          tag: 'VT',
          hint: 'Registrar ventas y seguir el estado de cobro.',
          permiso: 'crear_ventas',
        },
        {
          name: 'Compras y gastos',
          path: '/erp/gastos',
          icon: 'receipt_long',
          tag: 'CG',
          hint: 'Anotar egresos, compras y compromisos del mes.',
          permiso: 'crear_gastos',
        },
        {
          name: 'Inventario',
          path: '/erp/inventario',
          icon: 'inventory_2',
          tag: 'IV',
          hint: 'Stock, movimientos y alertas por producto.',
          permiso: 'ver_inventario',
        },
        {
          name: 'Clientes',
          path: '/erp/clientes',
          icon: 'groups',
          tag: 'CL',
          hint: 'Base comercial y seguimiento de relaciones.',
          permiso: 'ver_clientes',
        },
        {
          name: 'Proveedores',
          path: '/erp/proveedores',
          icon: 'local_shipping',
          tag: 'PV',
          hint: 'Compras recurrentes y red de abastecimiento.',
          permiso: 'ver_proveedores',
        },
        {
          // Un solo módulo con dos pestañas (Por cobrar / Por pagar), corrección #17.
          name: 'Cuentas por cobrar y pagar',
          path: '/erp/cobrar',
          icon: 'payments',
          tag: 'CC',
          hint: 'Lo que te deben y lo que debes, con vencimientos.',
          permiso: 'ver_caja',
          badge: () => (pendientesTotal > 0 ? `${pendientesTotal}` : null),
        },
        {
          name: 'Reportes',
          path: '/erp/reportes',
          icon: 'bar_chart',
          tag: 'RP',
          hint: 'Resultados del negocio, IVA y margen por periodo.',
        },
        {
          name: 'Caja y bancos',
          path: '/erp/caja',
          icon: 'account_balance',
          tag: 'CB',
          hint: 'Saldo disponible y movimientos diarios.',
          permiso: 'ver_caja',
        },
        {
          name: 'IVA mensual',
          path: '/erp/iva-mensual',
          icon: 'account_balance_wallet',
          tag: 'IVA',
          hint: 'Control fiscal base para cierre mensual.',
          permiso: 'ver_caja',
        },
        {
          name: 'Promociones',
          path: '/erp/promociones',
          icon: 'loyalty',
          tag: 'PR',
          hint: 'Campañas comerciales con simulación de rentabilidad.',
        },
      ],
    },
    {
      key: 'rrhh',
      label: 'RRHH',
      icon: 'account_balance_wallet',
      items: [
{
          name: 'Remuneraciones',
          path: '/erp/remuneraciones',
          icon: 'badge',
          tag: 'RH',
          hint: 'Nómina, liquidaciones y vacaciones.',
          permiso: 'ver_remuneraciones',
          lock: true,
        },
{
          name: 'Roles del equipo',
          path: '/erp/equipo',
          icon: 'group',
          tag: 'EQ',
          hint: 'Roles y subroles de tu negocio (las invitaciones llegan pronto).',
          permiso: 'editar_mi_negocio',
        },
        {
          name: 'Organigrama',
          path: '/erp/organigrama',
          icon: 'account_tree',
          tag: 'OR',
          hint: 'Estructura y jerarquía del equipo.',
          permiso: 'ver_organigrama',
          lock: true,
        },
        {
          name: 'Documentos laborales',
          path: '/erp/documentos',
          icon: 'description',
          tag: 'DC',
          hint: 'Contratos, anexos y firma electrónica.',
          permiso: 'ver_documentos',
          lock: true,
        },
      ],
    },
    {
      key: 'mercadospublicos',
      label: 'Mercados públicos',
      icon: 'gavel',
      items: [
{
          name: 'Mercados Públicos',
          path: '/erp/mercados-publicos',
          icon: 'fact_check',
          tag: 'MP',
          hint: 'Licitaciones, requisitos y oportunidades de compra pública.',
          permiso: 'ver_mercados_publicos',
        },
        {
          name: 'Portal Municipal',
          path: '/erp/portal-municipal',
          icon: 'location_city',
          tag: 'PM',
          hint: 'Convocatorias y programas de apoyo de tu municipio.',
          permiso: 'ver_mercados_publicos',
        },
      ],
    },
    {
      key: 'academia',
      label: 'Academia',
      icon: 'school',
      items: [
{
          name: 'Mentorías',
          path: '/mentorias',
          icon: 'school',
          tag: 'ME',
          hint: 'Acompañamiento experto para crecer mejor.',
          permiso: 'ver_mentorias',
        },
        {
          name: 'Academia',
          path: '/erp/academia',
          icon: 'auto_stories',
          tag: 'AC',
          hint: 'Guías y recursos prácticos para el negocio.',
          permiso: 'ver_academia',
        },
      ],
    },
  ];

  const toggleGroup = (group: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        if (!sidebarOpen) next.clear();
        next.add(group);
      }
      return next;
    });
  };

  // Con el sidebar colapsado, el panel de la seccion se alinea verticalmente
  // con el icono que lo abrio en lugar de quedar pegado al borde superior.
  const reposicionarFlyout = useCallback(() => {
    if (sidebarOpen) return;
    const key = openGroups.values().next().value as string | undefined;
    const section = key ? gruposRef.current[key] : null;
    const panel = flyoutRef.current;
    if (!section || !panel) return;
    const margen = 8;
    const s = section.getBoundingClientRect();
    const alto = panel.offsetHeight;
    setFlyoutTop(Math.max(margen, Math.min(s.top, window.innerHeight - alto - margen)));
  }, [openGroups, sidebarOpen]);

  useLayoutEffect(() => {
    reposicionarFlyout();
    if (sidebarOpen) return;
    window.addEventListener('resize', reposicionarFlyout);
    window.addEventListener('scroll', reposicionarFlyout, true);
    return () => {
      window.removeEventListener('resize', reposicionarFlyout);
      window.removeEventListener('scroll', reposicionarFlyout, true);
    };
  }, [reposicionarFlyout, sidebarOpen]);

  const membresiaConfig = {
    free: { label: 'Básico', cls: 'bg-on-primary-container/15 text-on-primary-container' },
    pro: { label: 'Pro', cls: 'bg-on-primary-container/25 text-on-primary-container' },
    premium: { label: 'Premium', cls: 'bg-on-primary-container/15 text-on-primary-container' },
  }[perfil?.membresia_nivel ?? 'free'];

  const negocioNombre = perfil?.negocio_nombre ?? 'Negocio actual';
  const negocioMeta =
    [perfil?.negocio_rubro, perfil?.negocio_comuna].filter(Boolean).join(' | ') ||
    'ERP listo para operar';
  const avatarFallback = perfil?.nombre_completo?.[0]?.toUpperCase() ?? '?';
  // Sin foto se muestran las iniciales (antes se enviaba el email a un servicio externo de avatares).
  const perfilAvatarUrl = !avatarError ? (perfil?.avatar_url?.trim() || null) : null;

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };
  const isActivePath = (path: string) => isActive(path) || (path === '/erp/cobrar' && location.pathname === '/erp/pagar');

  return (
    <div className="flex min-h-screen bg-surface text-on-surface">
      {/* Fondo del cajón (móvil y tablet): tocar fuera lo cierra. */}
      {!esEscritorio && cajonAbierto && (
        <div className="fixed inset-0 z-[1150] bg-scrim/50 backdrop-blur-[2px]" onClick={() => setCajonAbierto(false)} aria-hidden="true" />
      )}
      {/* ── Sidebar ── */}
      <aside
        aria-label="Menú principal"
        aria-hidden={!esEscritorio && !cajonAbierto ? true : undefined}
        style={!esEscritorio ? { paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' } : undefined}
        className={cn(
          'flex flex-col bg-primary-container shadow-2xl shadow-shadow/20 transition-all duration-300',
          esEscritorio
            ? cn('sticky left-0 top-0 z-50 h-screen', !sidebarOpen && openGroups.size > 0 && 'z-[1100]', sidebarOpen ? 'w-[248px]' : 'w-[64px]')
            : cn('fixed inset-y-0 left-0 z-[1200] h-[100dvh] w-[280px] max-w-[85vw]', cajonAbierto ? 'translate-x-0' : '-translate-x-full invisible')
        )}
      >
        <div className="flex items-center gap-2.5 border-b border-white/10 px-3 py-3.5 shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={esEscritorio ? (sidebarOpen ? 'Contraer menú' : 'Expandir menú') : 'Cerrar menú'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 transition-colors hover:bg-white/20 lg:h-9 lg:w-9"
          >
            <span className="material-symbols-outlined text-lg text-white">
              {esEscritorio ? (sidebarOpen ? 'menu_open' : 'menu') : 'close'}
            </span>
          </button>

          {sidebarOpen && (
            <div className="min-w-0">
              <p className="text-[9px] font-extrabold uppercase tracking-[0.24em] text-on-primary-container/60">
                ERP local
              </p>
              <h1 className="truncate text-lg font-black leading-none tracking-tight text-white">
                PymEdu
              </h1>
              <span
                className={cn(
                  'mt-0.5 inline-block rounded-full px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-widest',
                  membresiaConfig.cls
                )}
              >
                {membresiaConfig.label}
              </span>
            </div>
          )}
        </div>

        <nav
          className={cn(
            'flex-1',
            sidebarOpen ? 'hide-scrollbar overflow-y-auto px-2.5 py-3' : 'px-2 py-3'
          )}
        >
{navGroups.map((group) => {
            const isOpen = openGroups.has(group.key);
            const visibleItems = group.items.filter(item => !item.permiso || puedeHacer(item.permiso));
            if (visibleItems.length === 0) return null;

            const anyBadge = visibleItems.reduce(
              (acc, item) => acc + Number(item.badge?.() ?? 0),
              0
            );

            return (
              <section
                key={group.key}
                ref={el => { gruposRef.current[group.key] = el; }}
                className={cn(
                  'relative mb-2.5 transition-all duration-200',
                  sidebarOpen
                    ? 'rounded-2xl border border-white/10 bg-white/[0.04] p-2.5 shadow-inner shadow-shadow/10'
                    : 'flex w-full justify-center'
                )}
              >
                <button
                  onClick={() => toggleGroup(group.key)}
                  className={cn(
                    'flex items-center transition-all duration-150 outline-none',
                    sidebarOpen ? 'w-full justify-between gap-2' : 'h-11 w-11 justify-center rounded-2xl hover:bg-white/10'
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={cn(
                        'material-symbols-outlined shrink-0',
                        sidebarOpen ? 'text-[17px] text-white/90' : 'text-xl text-white/80'
                      )}
                      style={{ fontVariationSettings: isOpen ? "'FILL' 1" : "'FILL' 0" }}
                    >
                      {group.icon}
                    </span>

                    {sidebarOpen && (
                      <div className="min-w-0 text-left">
                        <p className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-on-primary-container/55">
                          {group.label}
                        </p>
                        <p className="text-[13px] font-semibold text-white/95">
                          {visibleItems.length} módulo{visibleItems.length > 1 ? 's' : ''}
                        </p>
                      </div>
                    )}
                  </div>

                  {sidebarOpen && (
                    <div className="flex items-center gap-2">
                      {anyBadge > 0 && (
                        <span className="min-w-[18px] rounded-full bg-error px-1.5 py-0.5 text-center text-[10px] font-extrabold text-inverse-on-surface">
                          {anyBadge}
                        </span>
                      )}
                      <span className="material-symbols-outlined text-sm text-on-primary-container/45">
                        {isOpen ? 'expand_less' : 'expand_more'}
                      </span>
                    </div>
                  )}
                </button>

                {isOpen && (
                  <>
                    {!sidebarOpen && (
                      <div
                        className="fixed inset-0 left-[64px] z-[40] bg-black/10 backdrop-blur-[2px] rounded-r-2xl"
                        onClick={() => toggleGroup(group.key)}
                      />
                    )}
                    <div
                      ref={!sidebarOpen ? flyoutRef : undefined}
                      style={!sidebarOpen ? { top: flyoutTop, maxHeight: 'calc(100vh - 1rem)' } : undefined}
                      className={cn(
                        sidebarOpen
                          ? 'mt-2.5 space-y-1.5'
                          : 'fixed left-[64px] z-[70] w-72 space-y-2 bg-primary-container p-4 shadow-2xl border border-white/10 overflow-y-auto hide-scrollbar rounded-r-2xl'
                      )}
                    >
                      {!sidebarOpen && (
                        <div className="mb-6 mt-2 flex items-center gap-3 border-b border-white/10 pb-4">
                          <span className="material-symbols-outlined text-2xl text-on-primary-container/80">
                            {group.icon}
                          </span>
                          <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-on-primary-container/55">
                              Seccion
                            </p>
                            <p className="text-lg font-black text-white">{group.label}</p>
                          </div>
                        </div>
                      )}
                      {visibleItems.map(item => {
                        const badge = item.badge?.();
                        const active = isActivePath(item.path);

                        return (
                          <Link
                            key={item.path}
                            to={item.lock ? '#' : item.path}
                            onClick={(e) => { if (item.lock) e.preventDefault(); }}
                            className={cn(
                              'group flex items-center gap-3 transition-all duration-150 rounded-2xl border px-3 py-2.5',
                              active
                                ? 'border-white/20 bg-white/[0.15] text-white'
                                : 'border-transparent text-on-primary-container/75 hover:border-white/10 hover:bg-white/[0.1] hover:text-white',
                              item.lock ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-200',
                                active
                                  ? 'bg-primary text-inverse-on-surface'
                                  : 'bg-white/10 text-on-primary-container/70 group-hover:bg-white/15'
                              )}
                            >
                              <span
                                className="material-symbols-outlined text-xl"
                                style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
                              >
                                {item.icon}
                              </span>
                            </span>

<div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className={cn('truncate text-[13px] font-bold', item.lock && 'text-on-primary-container/70')}>{item.name}</span>
                                {item.lock && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white/80">
                                    <span className="material-symbols-outlined text-[10px]">lock</span> Próximamente
                                  </span>
                                )}
                                {badge && !item.lock && (
                                  <span
                                    className={cn(
                                      'min-w-[20px] rounded-full px-2 py-0.5 text-center text-[10px] font-extrabold',
                                      hayVencidos ? 'bg-error text-inverse-on-surface' : 'bg-white/20 text-white'
                                    )}
                                  >
                                    {badge}
                                  </span>
                                )}
                              </div>
                              <p className={cn('mt-0.5 text-[11px] leading-4 text-on-primary-container/60', item.lock && 'text-on-primary-container/40')}>
                                {item.hint}
                              </p>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </nav>

        {/* Cerrar sesión siempre visible en el lateral (corrección #24) */}
        <div className={cn('shrink-0 border-t border-white/10 py-3', sidebarOpen ? 'px-2.5' : 'px-2')}>
          <button
            onClick={handleLogout}
            title={sidebarOpen ? undefined : 'Cerrar sesión'}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-xl py-2.5 text-[13px] font-bold text-on-primary-container/70 transition-colors hover:bg-white/10 hover:text-white',
              sidebarOpen ? 'px-3' : 'justify-center px-0'
            )}
          >
            <span className="material-symbols-outlined text-lg">logout</span>
            {sidebarOpen && <span>Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      {/* ── Main content area ── */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex min-h-14 w-full items-center justify-between gap-2 border-b border-outline-variant/60 bg-surface-container-lowest/95 px-3 shadow-sm backdrop-blur-md sm:gap-3 sm:px-6"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          {!esEscritorio && (
            <div className="flex min-w-0 items-center gap-1">
              <button type="button" onClick={() => setCajonAbierto(true)} aria-label="Abrir menú" aria-expanded={cajonAbierto}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-on-surface hover:bg-surface-container">
                <span className="material-symbols-outlined">menu</span>
              </button>
              <Link to="/erp/inicio" className="truncate text-base font-black tracking-tight text-primary">PymEdu</Link>
            </div>
          )}
          {location.pathname !== '/erp/inicio' && (
            <div className="hidden max-w-md flex-1 items-center md:flex">
              <div className="group relative w-full">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-outline transition-colors group-focus-within:text-primary">
                  search
                </span>
                <input
                  type="text"
                  placeholder="Buscar clientes, ventas, productos..."
                  className="w-full rounded-full border-none bg-surface-container py-2 pl-10 pr-4 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
          )}

          <div className="ml-auto flex items-center gap-3">
            {pendientesTotal > 0 && (
              <Link
                to="/erp/cobrar"
                title={`${cxcCount} ventas sin cobrar · ${cxpCount} compras por pagar`}
                className="hidden items-center gap-1.5 rounded-full border border-error/30 bg-error-container px-3 py-1.5 text-xs font-bold text-on-error-container lg:flex"
              >
                <span className="material-symbols-outlined text-sm">payments</span>
                {pendientesTotal.toLocaleString('es-CL')} pendientes
              </Link>
            )}

            <button
              onClick={toggleTheme}
              className="relative flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-surface-container cursor-default"
              title={theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
            >
              <span className="material-symbols-outlined text-xl text-on-surface-variant">
                {theme === 'light' ? 'dark_mode' : 'light_mode'}
              </span>
            </button>

            <div className="relative">
              <button type="button" onClick={() => setCampanaAbierta(v => !v)} aria-expanded={campanaAbierta} aria-haspopup="dialog"
                aria-label={nuevasCampana > 0 ? `Alertas: ${nuevasCampana} nuevas` : 'Alertas'}
                className="relative flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-surface-container">
                <span className="material-symbols-outlined text-xl text-on-surface-variant">notifications</span>
                {nuevasCampana > 0 && (
                  <span className="absolute right-0.5 top-0.5 min-w-[18px] rounded-full border-2 border-surface-container-lowest bg-error px-1 text-center text-[10px] font-black leading-[14px] text-inverse-on-surface">
                    {nuevasCampana > 9 ? '9+' : nuevasCampana}
                  </span>
                )}
              </button>
              {campanaAbierta && createPortal(
                <>
                  <div className="fixed inset-0 z-[1250] bg-scrim/40 sm:bg-transparent" onClick={() => setCampanaAbierta(false)} />
                  {/* Portal en body: el backdrop-blur del encabezado volvía relativo a él todo lo «fixed». Hoja inferior en móvil; panel bajo la campana desde sm. */}
                  <div role="dialog" aria-label="Alertas principales"
                    className="fixed inset-x-0 bottom-0 z-[1260] flex max-h-[80dvh] flex-col rounded-t-3xl bg-surface-container-lowest shadow-2xl ring-1 ring-black/5 sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[4.25rem] sm:max-h-[70vh] sm:w-96 sm:rounded-2xl"
                    style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
                    <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-outline-variant sm:hidden" />
                    <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
                      <p className="text-sm font-black text-on-surface">{nuevasCampana > 0 ? `${nuevasCampana} nueva${nuevasCampana === 1 ? '' : 's'}` : 'Alertas'}</p>
                      {nuevasCampana > 0 && (
                        <button type="button" onClick={() => marcarAlertas(alertas.filter(a => a.estado === 'nueva').flatMap(a => a.grupo ? a.grupo.map(g => g.clave) : [a.clave]), 'vista')}
                          className="min-h-9 rounded-full px-3 text-xs font-bold text-primary hover:bg-primary/10">Marcar todo como visto</button>
                      )}
                    </div>
                    <ul className="min-h-0 flex-1 divide-y divide-outline-variant/20 overflow-y-auto">
                      {principales.length === 0 && <li className="px-4 py-8 text-center text-sm text-on-surface-variant">Todo al día.</li>}
                      {principales.map(a => (
                        <li key={a.id}>
                          <button type="button" className="flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-container-low"
                            onClick={() => {
                              marcarAlertas(a.grupo ? a.grupo.map(g => g.clave) : [a.clave], 'vista');
                              setCampanaAbierta(false);
                              navigate(a.acciones[0]?.url ?? '/erp/alertas');
                            }}>
                            <span className={cn('material-symbols-outlined shrink-0 rounded-xl p-1.5 text-lg', COLOR_ALERTA[a.tipo])}>{a.icono}</span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1 text-sm font-bold text-on-surface">
                                {a.estado === 'nueva' && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="nueva" />}
                                <span className="truncate">{a.titulo}</span>
                              </span>
                              <span className="line-clamp-2 text-xs text-on-surface-variant">{a.detalle}</span>
                              <span className="text-[10px] font-bold text-outline">{horaRelativa(a.creadaEn)}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <Link to="/erp/alertas" onClick={() => setCampanaAbierta(false)}
                      className="flex min-h-12 items-center justify-center border-t border-outline-variant/20 text-sm font-bold text-primary hover:bg-primary/5">
                      Ver todas las alertas
                    </Link>
                  </div>
                </>, document.body
              )}
            </div>

            <div className="hidden h-7 w-px bg-outline-variant sm:block" />

            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 rounded-full p-1 pr-3 transition-colors hover:bg-surface-container"
              >
                <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-primary text-[10px] font-extrabold text-inverse-on-surface">
                  {perfilAvatarUrl ? (
                    <img
                      src={perfilAvatarUrl}
                      alt={perfil?.nombre_completo ?? 'Mi cuenta'}
                      className="h-full w-full object-cover"
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    avatarFallback
                  )}
                </div>
                <span className="hidden max-w-[10rem] truncate text-sm font-bold text-on-surface sm:block">
                  {perfil?.nombre_completo ?? 'Mi cuenta'}
                </span>
                <span className="material-symbols-outlined text-lg text-outline">
                  {showUserMenu ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-[60]"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute right-0 z-[70] mt-2 w-56 origin-top-right rounded-2xl bg-surface-container-lowest p-2 shadow-xl ring-1 ring-black/5">
                    <div className="px-3 py-2 mb-1">
                      <p className="text-xs font-extrabold uppercase tracking-widest text-outline">Mi Cuenta</p>
                    </div>
                    <Link to="/erp/configuracion" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low cursor-pointer">
                      <span className="material-symbols-outlined text-xl">settings</span>
Configuración
                    </Link>
                    <Link to="/erp/suscripcion" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-warning transition-colors hover:bg-warning-container cursor-pointer">
                      <span className="material-symbols-outlined text-xl">workspace_premium</span>
                      Mi plan y suscripción
                    </Link>
                    <div className="my-2 border-t border-surface-container-high" />
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-error transition-colors hover:bg-error-container hover:text-on-error-container"
                    >
                      <span className="material-symbols-outlined text-xl">logout</span>
Cerrar sesión
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <Outlet />
        </div>
      </main>
      <Toaster />
    </div>
  );
}
