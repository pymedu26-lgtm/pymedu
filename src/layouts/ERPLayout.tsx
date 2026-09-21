import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useERP } from '../1.-ERP/context/ERPContext';
import { useState } from 'react';

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
  const { ventas, gastos } = useERP();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set()
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [avatarError, setAvatarError] = useState(false);

  const esPremium = perfil?.membresia_nivel === 'pro' || perfil?.membresia_nivel === 'premium';

  const cxcCount = ventas.filter(v => v.estado === 'Pendiente').length;
  const cxpCount = gastos.filter(g => g.estado === 'Por Pagar').length;
  const cxcUrgente = ventas.some(v => v.estado === 'Pendiente' && v.saldo_pendiente > v.monto * 0.5);
  const cxpUrgente = gastos.some(g => g.estado === 'Por Pagar' && g.saldo_pendiente > g.monto * 0.5);

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
          name: 'Promociones',
          path: '/erp/promociones',
          icon: 'loyalty',
          tag: 'PR',
          hint: 'Campanas comerciales para mover inventario.',
          permiso: 'ver_promociones',
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
          name: 'Cuentas por cobrar',
          path: '/erp/cobrar',
          icon: 'payments',
          tag: 'CC',
          hint: 'Facturas pendientes, vencimientos y seguimiento.',
          permiso: 'ver_caja',
          badge: () => (cxcCount > 0 ? `${cxcCount}` : null),
        },
        {
          name: 'Cuentas por pagar',
          path: '/erp/pagar',
          icon: 'send_money',
          tag: 'CP',
          hint: 'Compromisos, pagos y salidas de caja.',
          permiso: 'crear_gastos',
          badge: () => (cxpCount > 0 ? `${cxpCount}` : null),
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
          name: 'Reportes y tributos',
          path: '/erp/reportes',
          icon: 'bar_chart',
          tag: 'RP',
          hint: 'Vista premium para decisiones y cierre.',
          permiso: 'ver_reportes',
          lock: !esPremium,
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
          name: 'Equipo',
          path: '/erp/equipo',
          icon: 'group',
          tag: 'EQ',
          hint: 'Altas, roles y gestión del personal.',
          permiso: 'ver_equipo',
          lock: true,
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
          hint: 'Relacion con municipios y programas de apoyo.',
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
          path: '/erp/mentorias',
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

  const membresiaConfig = {
    free: { label: 'Gratuito', cls: 'bg-slate-200/20 text-slate-300' },
    pro: { label: 'Pro', cls: 'bg-amber-400/20 text-amber-300' },
    premium: { label: 'Premium', cls: 'bg-indigo-400/20 text-indigo-200' },
  }[perfil?.membresia_nivel ?? 'free'];

  const negocioNombre = perfil?.negocio_nombre ?? 'Negocio actual';
  const negocioMeta =
    [perfil?.negocio_rubro, perfil?.negocio_comuna].filter(Boolean).join(' | ') ||
    'ERP listo para operar';
  const avatarFallback = perfil?.nombre_completo?.[0]?.toUpperCase() ?? '?';
  const perfilAvatarUrl = !avatarError
    ? (perfil?.avatar_url?.trim() || `https://i.pravatar.cc/120?u=${encodeURIComponent(perfil?.email ?? perfil?.id ?? 'demo-user')}`)
    : null;

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="flex min-h-screen bg-surface text-on-surface">
      {/* ── Sidebar ── */}
      <aside
        className={cn(
          'sticky left-0 top-0 z-50 flex h-screen flex-col bg-primary-container shadow-2xl shadow-slate-900/20 transition-all duration-300',
          sidebarOpen ? 'w-[300px]' : 'w-[72px]'
        )}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-5 shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 transition-colors hover:bg-white/20"
          >
            <span className="material-symbols-outlined text-xl text-white">
              {sidebarOpen ? 'menu_open' : 'menu'}
            </span>
          </button>

          {sidebarOpen && (
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.28em] text-indigo-200/60">
                ERP local
              </p>
              <h1 className="truncate text-xl font-black leading-none tracking-tight text-white">
                PymEdu
              </h1>
              <span
                className={cn(
                  'mt-0.5 inline-block rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-widest',
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
            sidebarOpen ? 'hide-scrollbar overflow-y-auto px-3 py-4' : 'px-2 py-4'
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
                className={cn(
                  'relative mb-3 transition-all duration-200',
                  sidebarOpen
                    ? 'rounded-3xl border border-white/10 bg-white/[0.04] p-3 shadow-inner shadow-slate-950/10'
                    : 'flex w-full justify-center'
                )}
              >
                <button
                  onClick={() => toggleGroup(group.key)}
                  className={cn(
                    'flex items-center transition-all duration-150 outline-none',
                    sidebarOpen ? 'w-full justify-between gap-3' : 'h-12 w-12 justify-center rounded-2xl hover:bg-white/10'
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        'material-symbols-outlined shrink-0',
                        sidebarOpen ? 'text-lg text-white/90' : 'text-2xl text-white/80'
                      )}
                      style={{ fontVariationSettings: isOpen ? "'FILL' 1" : "'FILL' 0" }}
                    >
                      {group.icon}
                    </span>

                    {sidebarOpen && (
                      <div className="min-w-0 text-left">
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-indigo-200/55">
                          {group.label}
                        </p>
                        <p className="text-sm font-semibold text-white/95">
                          {visibleItems.length} módulo{visibleItems.length > 1 ? 's' : ''}
                        </p>
                      </div>
                    )}
                  </div>

                  {sidebarOpen && (
                    <div className="flex items-center gap-2">
                      {anyBadge > 0 && (
                        <span className="min-w-[18px] rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-extrabold text-white">
                          {anyBadge}
                        </span>
                      )}
                      <span className="material-symbols-outlined text-sm text-indigo-100/45">
                        {isOpen ? 'expand_less' : 'expand_more'}
                      </span>
                    </div>
                  )}
                </button>

                {isOpen && (
                  <>
                    {!sidebarOpen && (
                      <div
                        className="fixed inset-0 left-[72px] z-[40] bg-black/10 backdrop-blur-[2px]"
                        onClick={() => toggleGroup(group.key)}
                      />
                    )}
                    <div
                      className={cn(
                        sidebarOpen
                          ? 'mt-3 space-y-2'
                          : 'fixed left-[72px] top-0 bottom-0 z-[70] w-80 space-y-2 bg-primary-container p-4 shadow-2xl border-l border-white/10 overflow-y-auto hide-scrollbar'
                      )}
                    >
                      {!sidebarOpen && (
                        <div className="mb-6 mt-2 flex items-center gap-3 border-b border-white/10 pb-4">
                          <span className="material-symbols-outlined text-2xl text-indigo-200/80">
                            {group.icon}
                          </span>
                          <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-indigo-200/55">
                              Seccion
                            </p>
                            <p className="text-lg font-black text-white">{group.label}</p>
                          </div>
                        </div>
                      )}
                      {visibleItems.map(item => {
                        const badge = item.badge?.();
                        const active = isActive(item.path);

                        return (
                          <Link
                            key={item.path}
                            to={item.lock ? '#' : item.path}
                            onClick={(e) => { if (item.lock) e.preventDefault(); }}
                            className={cn(
                              'group flex items-center gap-4 transition-all duration-150 rounded-2xl border px-4 py-4',
                              active
                                ? 'border-white/20 bg-white/[0.15] text-white'
                                : 'border-transparent text-indigo-100/75 hover:border-white/10 hover:bg-white/[0.1] hover:text-white',
                              item.lock ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-all duration-200',
                                active
                                  ? 'bg-primary text-white'
                                  : 'bg-white/10 text-indigo-100/70 group-hover:bg-white/15'
                              )}
                            >
                              <span
                                className="material-symbols-outlined text-2xl"
                                style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
                              >
                                {item.icon}
                              </span>
                            </span>

<div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className={cn('truncate text-sm font-bold', item.lock && 'text-indigo-100/70')}>{item.name}</span>
                                {item.lock && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white/80">
                                    <span className="material-symbols-outlined text-[10px]">lock</span> Próximamente
                                  </span>
                                )}
                                {badge && !item.lock && (
                                  <span
                                    className={cn(
                                      'min-w-[20px] rounded-full px-2 py-0.5 text-center text-[10px] font-extrabold',
                                      item.path.includes('cobrar') && cxcUrgente
                                        ? 'bg-red-500 text-white'
                                        : item.path.includes('pagar') && cxpUrgente
                                          ? 'bg-amber-500 text-white'
                                          : 'bg-white/20 text-white'
                                    )}
                                  >
                                    {badge}
                                  </span>
                                )}
                              </div>
                              <p className={cn('mt-1 text-xs leading-5 text-indigo-100/60', item.lock && 'text-indigo-100/40')}>
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
      </aside>

      {/* ── Main content area ── */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-outline-variant/60 bg-surface-container-lowest/95 px-6 shadow-sm backdrop-blur-md">
          {location.pathname !== '/erp/inicio' && (
            <div className="flex max-w-md flex-1 items-center">
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
            {(cxcCount + cxpCount) > 0 && (
              <div className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 cursor-default">
                <span className="material-symbols-outlined text-sm">payments</span>
                {cxcCount + cxpCount} pendientes
              </div>
            )}

            <button
              onClick={toggleTheme}
              className="relative rounded-full p-2 transition-colors hover:bg-surface-container cursor-default"
              title={theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
            >
              <span className="material-symbols-outlined text-xl text-on-surface-variant">
                {theme === 'light' ? 'dark_mode' : 'light_mode'}
              </span>
            </button>

            <div className="relative rounded-full p-2 transition-colors hover:bg-surface-container cursor-default">
              <span className="material-symbols-outlined text-xl text-on-surface-variant">notifications</span>
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-surface-container-lowest bg-red-500" />
            </div>

            <div className="h-7 w-px bg-outline-variant" />

            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 rounded-full p-1 pr-3 transition-colors hover:bg-surface-container"
              >
                <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-primary text-[10px] font-extrabold text-white">
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
                <span className="hidden text-sm font-bold text-on-surface sm:block">
                  {perfil?.nombre_completo ?? 'Mi cuenta'}
                </span>
                <span className="material-symbols-outlined text-lg text-outline">
                  {showUserMenu ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute right-0 z-20 mt-2 w-56 origin-top-right rounded-2xl bg-surface-container-lowest p-2 shadow-xl ring-1 ring-black/5">
                    <div className="px-3 py-2 mb-1">
                      <p className="text-xs font-extrabold uppercase tracking-widest text-outline">Mi Cuenta</p>
                    </div>
                    <Link to="/erp/configuracion" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low cursor-pointer">
                      <span className="material-symbols-outlined text-xl">settings</span>
Configuración
                    </Link>
                    <Link to="/erp/suscripcion" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-amber-600 transition-colors hover:bg-amber-50 cursor-pointer">
                      <span className="material-symbols-outlined text-xl">workspace_premium</span>
                      Mi plan y suscripción
                    </Link>
                    <div className="my-2 border-t border-surface-container-high" />
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 hover:text-red-700"
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

        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
