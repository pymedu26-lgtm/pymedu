import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useERP } from '../1.-ERP/context/ERPContext';
import { useState, useRef, useCallback, useLayoutEffect, useEffect, useMemo } from 'react';
import { PLAN_FREE, PLAN_PREMIUM, PLAN_PRO, puedeUsarMercadosPublicos } from '../lib/planes';

interface NavItem {
  name: string;
  path: string;
  icon: string;
  tag: string;
  hint: string;
  permiso?: string | null;
  lock?: boolean;
  requierePremium?: boolean;
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
  const { ventas, gastos, clientes, inventario, errorPersistencia, falloCarga, recargarErp, reintentarGuardado } = useERP();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotificaciones, setShowNotificaciones] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set()
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [flyoutTop, setFlyoutTop] = useState(8);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const gruposRef = useRef<Record<string, HTMLElement | null>>({});

  const esPremium = puedeUsarMercadosPublicos(perfil?.membresia_nivel);
  // En movil el menu siempre se muestra expandido dentro del cajon.
  const sidebarExpandido = sidebarOpen || mobileOpen;

  const cxcCount = ventas.filter(v => v.estado === 'Pendiente').length;
  const cxpCount = gastos.filter(g => g.estado === 'Por Pagar').length;
  const cxcUrgente = ventas.some(v => v.estado === 'Pendiente' && v.saldo_pendiente > v.monto * 0.5);
  const cxpUrgente = gastos.some(g => g.estado === 'Por Pagar' && g.saldo_pendiente > g.monto * 0.5);

  const isActive = (path: string) => location.pathname === path;

  // Cierra el cajon movil y los menus flotantes al navegar.
  useEffect(() => {
    setMobileOpen(false);
    setShowUserMenu(false);
    setShowNotificaciones(false);
    setBusqueda('');
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const cerrarConEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', cerrarConEscape);
    return () => window.removeEventListener('keydown', cerrarConEscape);
  }, [mobileOpen]);

  // Bloquea el desplazamiento del fondo mientras el cajon movil esta abierto.
  useEffect(() => {
    if (!mobileOpen) return;
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflowPrevio; };
  }, [mobileOpen]);

  const resultadosBusqueda = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (termino.length < 2) return [];
    const resultados: { id: string; titulo: string; detalle: string; ruta: string }[] = [];
    for (const c of clientes) {
      if (c.nombre?.toLowerCase().includes(termino)) {
        resultados.push({ id: `cli-${c.id}`, titulo: c.nombre, detalle: 'Cliente', ruta: '/erp/clientes' });
      }
    }
    for (const v of ventas) {
      if (v.cliente?.toLowerCase().includes(termino)) {
        resultados.push({ id: `ven-${v.id}`, titulo: v.cliente, detalle: `Venta · $${Math.round(v.monto || 0).toLocaleString('es-CL')}`, ruta: '/erp/ventas' });
      }
    }
    for (const g of gastos) {
      if (g.proveedor?.toLowerCase().includes(termino)) {
        resultados.push({ id: `gas-${g.id}`, titulo: g.proveedor, detalle: `Gasto · $${Math.round(g.monto || 0).toLocaleString('es-CL')}`, ruta: '/erp/gastos' });
      }
    }
    for (const p of inventario) {
      if (p.nombre?.toLowerCase().includes(termino) || p.codigo?.toLowerCase().includes(termino)) {
        resultados.push({ id: `inv-${p.id}`, titulo: p.nombre, detalle: `Inventario · ${p.stock} ${p.unidadMedida}`, ruta: '/erp/inventario' });
      }
    }
    return resultados.slice(0, 6);
  }, [busqueda, clientes, ventas, gastos, inventario]);

  const notificaciones = useMemo(() => {
    const avisos: { id: string; titulo: string; detalle: string; ruta: string }[] = [];
    for (const v of ventas.filter((x) => x.estado === 'Pendiente')) {
      avisos.push({ id: `nc-${v.id}`, titulo: `Cobro pendiente: ${v.cliente}`, detalle: `Saldo $${Math.round(v.saldo_pendiente || 0).toLocaleString('es-CL')}`, ruta: '/erp/cobrar' });
    }
    for (const g of gastos.filter((x) => x.estado === 'Por Pagar')) {
      avisos.push({ id: `np-${g.id}`, titulo: `Pago pendiente: ${g.proveedor}`, detalle: `Saldo $${Math.round(g.saldo_pendiente || 0).toLocaleString('es-CL')}`, ruta: '/erp/pagar' });
    }
    for (const p of inventario.filter((x) => x.tipo === 'producto' && x.estado === 'activo' && x.stock <= (x.stockMinimo ?? 5))) {
      avisos.push({ id: `ni-${p.id}`, titulo: `Stock bajo: ${p.nombre}`, detalle: `${p.stock} ${p.unidadMedida || 'unidades'} disponibles`, ruta: '/erp/inventario' });
    }
    return avisos.slice(0, 8);
  }, [ventas, gastos, inventario]);

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
          name: 'Cuentas por cobrar',
          path: '/erp/cobrar',
          icon: 'payments',
          tag: 'CC',
          hint: 'Facturas pendientes, vencimientos y seguimiento.',
          permiso: 'ver_caja',
          badge: () => (cxcCount > 0 ? `${cxcCount}` : null),
        },
        {
          name: 'Cuentas por pagar y cobrar',
          path: '/erp/pagar',
          icon: 'account_balance_wallet',
          tag: 'CP',
          hint: 'Deudas con proveedores y lo que los clientes deben.',
          permiso: 'crear_gastos',
          badge: () => ((cxcCount + cxpCount) > 0 ? `${cxcCount + cxpCount}` : null),
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
          requierePremium: true,
        },
        {
          name: 'Portal Municipal',
          path: '/erp/portal-municipal',
          icon: 'location_city',
          tag: 'PM',
          hint: 'Relacion con municipios y programas de apoyo.',
          permiso: 'ver_mercados_publicos',
          requierePremium: true,
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
        if (!sidebarExpandido) next.clear();
        next.add(group);
      }
      return next;
    });
  };

  // Con el sidebar colapsado, el panel de la seccion se alinea verticalmente
  // con el icono que lo abrio en lugar de quedar pegado al borde superior.
  const reposicionarFlyout = useCallback(() => {
    if (sidebarExpandido) return;
    const key = openGroups.values().next().value as string | undefined;
    const section = key ? gruposRef.current[key] : null;
    const panel = flyoutRef.current;
    if (!section || !panel) return;
    const margen = 8;
    const s = section.getBoundingClientRect();
    const alto = panel.offsetHeight;
    setFlyoutTop(Math.max(margen, Math.min(s.top, window.innerHeight - alto - margen)));
  }, [openGroups, sidebarExpandido]);

  useLayoutEffect(() => {
    reposicionarFlyout();
    if (sidebarExpandido) return;
    window.addEventListener('resize', reposicionarFlyout);
    window.addEventListener('scroll', reposicionarFlyout, true);
    return () => {
      window.removeEventListener('resize', reposicionarFlyout);
      window.removeEventListener('scroll', reposicionarFlyout, true);
    };
  }, [reposicionarFlyout, sidebarExpandido]);

  const membresiaConfig = {
    free: { label: PLAN_FREE.nombre, cls: 'bg-on-primary-container/15 text-on-primary-container' },
    pro: { label: PLAN_PRO.nombre, cls: 'bg-on-primary-container/25 text-on-primary-container' },
    premium: { label: PLAN_PREMIUM.nombre, cls: 'bg-on-primary-container/15 text-on-primary-container' },
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
    <div className="flex min-h-screen bg-surface text-on-surface overflow-x-hidden">
      {/* Fondo oscuro del cajon movil */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        aria-label="Menú principal"
        className={cn(
          'fixed inset-y-0 left-0 z-[60] flex h-screen w-[85vw] max-w-[280px] flex-col bg-primary-container shadow-2xl shadow-shadow/20 transition-transform duration-300 md:sticky md:top-0 md:z-50 md:translate-x-0 md:transition-all',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          !sidebarExpandido && openGroups.size > 0 && 'z-[1100]',
          sidebarOpen ? 'md:w-[248px]' : 'md:w-[64px]'
        )}
      >
        <div className="flex items-center gap-2.5 border-b border-white/10 px-3 py-3.5 shrink-0">
          <button
            onClick={() => {
              if (window.innerWidth < 768) setMobileOpen(false);
              else setSidebarOpen((v) => !v);
            }}
            aria-label={mobileOpen ? 'Cerrar menú lateral' : 'Alternar menú lateral'}
            aria-expanded={sidebarExpandido}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 transition-colors hover:bg-white/20"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-lg text-white">
              {sidebarExpandido ? 'menu_open' : 'menu'}
            </span>
          </button>

          {sidebarExpandido && (
            <div className="min-w-0 flex-1">
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
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú lateral"
            className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20 md:hidden"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        <nav
          className={cn(
            'flex-1',
            sidebarExpandido ? 'hide-scrollbar overflow-y-auto px-2.5 py-3' : 'px-2 py-3'
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
                  sidebarExpandido
                    ? 'rounded-2xl border border-white/10 bg-white/[0.04] p-2.5 shadow-inner shadow-shadow/10'
                    : 'flex w-full justify-center'
                )}
              >
                <button
                  onClick={() => toggleGroup(group.key)}
                  aria-label={`${group.label}: ${isOpen ? 'ocultar' : 'mostrar'} módulos`}
                  aria-expanded={isOpen}
                  className={cn(
                    'flex items-center transition-all duration-150 outline-none',
                    sidebarExpandido ? 'w-full justify-between gap-2' : 'h-11 w-11 justify-center rounded-2xl hover:bg-white/10'
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'material-symbols-outlined shrink-0',
                        sidebarExpandido ? 'text-[17px] text-white/90' : 'text-xl text-white/80'
                      )}
                      style={{ fontVariationSettings: isOpen ? "'FILL' 1" : "'FILL' 0" }}
                    >
                      {group.icon}
                    </span>

                    {sidebarExpandido && (
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

                  {sidebarExpandido && (
                    <div className="flex items-center gap-2">
                      {anyBadge > 0 && (
                        <span className="min-w-[18px] rounded-full bg-error px-1.5 py-0.5 text-center text-[10px] font-extrabold text-inverse-on-surface">
                          {anyBadge}
                        </span>
                      )}
                      <span aria-hidden="true" className="material-symbols-outlined text-sm text-on-primary-container/45">
                        {isOpen ? 'expand_less' : 'expand_more'}
                      </span>
                    </div>
                  )}
                </button>

                {isOpen && (
                  <>
                    {!sidebarExpandido && (
                      <div
                        className="fixed inset-0 left-[64px] z-[40] bg-black/10 backdrop-blur-[2px] rounded-r-2xl"
                        onClick={() => toggleGroup(group.key)}
                      />
                    )}
                    <div
                      ref={!sidebarExpandido ? flyoutRef : undefined}
                      style={!sidebarExpandido ? { top: flyoutTop, maxHeight: 'calc(100vh - 1rem)' } : undefined}
                      className={cn(
                        sidebarExpandido
                          ? 'mt-2.5 space-y-1.5'
                          : 'fixed left-[64px] z-[70] w-72 space-y-2 bg-primary-container p-4 shadow-2xl border border-white/10 overflow-y-auto hide-scrollbar rounded-r-2xl'
                      )}
                    >
                      {!sidebarExpandido && (
                        <div className="mb-6 mt-2 flex items-center gap-3 border-b border-white/10 pb-4">
                          <span aria-hidden="true" className="material-symbols-outlined text-2xl text-on-primary-container/80">
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
                        const active = isActive(item.path);
                        const bloqueadoPorPlan = !!item.requierePremium && !esPremium;
                        const destino = item.lock ? '#' : bloqueadoPorPlan ? '/erp/suscripcion' : item.path;

                        return (
                          <Link
                            key={item.path}
                            to={destino}
                            onClick={(e) => {
                              if (item.lock) { e.preventDefault(); return; }
                              setMobileOpen(false);
                            }}
                            aria-current={active ? 'page' : undefined}
                            aria-disabled={item.lock || undefined}
                            title={bloqueadoPorPlan ? `Disponible en el plan ${PLAN_PREMIUM.nombre}. Haz clic para mejorar tu plan.` : undefined}
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
                                aria-hidden="true"
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
                                    <span aria-hidden="true" className="material-symbols-outlined text-[10px]">lock</span> Próximamente
                                  </span>
                                )}
                                {bloqueadoPorPlan && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-warning-container px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-on-warning-container">
                                    <span aria-hidden="true" className="material-symbols-outlined text-[10px]">lock</span> Premium
                                  </span>
                                )}
                                {badge && !item.lock && (
                                  <span
                                    className={cn(
                                      'min-w-[20px] rounded-full px-2 py-0.5 text-center text-[10px] font-extrabold',
                                      item.path.includes('cobrar') && cxcUrgente
                                        ? 'bg-error text-inverse-on-surface'
                                        : item.path.includes('pagar') && cxpUrgente
                                          ? 'bg-warning text-inverse-on-surface'
                                          : 'bg-white/20 text-white'
                                    )}
                                  >
                                    {badge}
                                  </span>
                                )}
                              </div>
                              <p className={cn('mt-0.5 text-[11px] leading-4 text-on-primary-container/60', item.lock && 'text-on-primary-container/40')}>
                                {bloqueadoPorPlan ? 'Mejora a Premium para usarlo.' : item.hint}
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
        <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between gap-3 border-b border-outline-variant/60 bg-surface-container-lowest/95 px-3 shadow-sm backdrop-blur-md sm:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú lateral"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container md:hidden"
          >
            <span aria-hidden="true" className="material-symbols-outlined">menu</span>
          </button>

          {location.pathname !== '/erp/inicio' && (
            <div className="flex min-w-0 max-w-md flex-1 items-center">
              <div className="group relative w-full min-w-0">
                <span aria-hidden="true" className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-outline transition-colors group-focus-within:text-primary">
                  search
                </span>
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  aria-label="Buscar clientes, ventas, gastos o productos"
                  placeholder="Buscar clientes, ventas, productos..."
                  className="w-full rounded-full border-none bg-surface-container py-2 pl-10 pr-4 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
                />
                {resultadosBusqueda.length > 0 && (
                  <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-container-lowest shadow-xl">
                    {resultadosBusqueda.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => navigate(r.ruta)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-container"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-on-surface">{r.titulo}</span>
                          <span className="block text-xs text-on-surface-variant">{r.detalle}</span>
                        </span>
                        <span aria-hidden="true" className="material-symbols-outlined text-lg text-outline">chevron_right</span>
                      </button>
                    ))}
                  </div>
                )}
                {busqueda.trim().length >= 2 && resultadosBusqueda.length === 0 && (
                  <div className="absolute left-0 right-0 z-50 mt-2 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface-variant shadow-xl">
                    Sin resultados para “{busqueda.trim()}”.
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {(cxcCount + cxpCount) > 0 && (
              <div className="hidden items-center gap-1.5 rounded-full border border-error/30 bg-error-container px-3 py-1.5 text-xs font-bold text-on-error-container sm:flex">
                <span aria-hidden="true" className="material-symbols-outlined text-sm">payments</span>
                {cxcCount + cxpCount} pendientes
              </div>
            )}

            <button
              onClick={toggleTheme}
              aria-label={theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
              className="relative rounded-full p-2 transition-colors hover:bg-surface-container"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-xl text-on-surface-variant">
                {theme === 'light' ? 'dark_mode' : 'light_mode'}
              </span>
            </button>

            <div className="relative">
              <button
                onClick={() => setShowNotificaciones((v) => !v)}
                aria-label={`Notificaciones${notificaciones.length ? `: ${notificaciones.length} pendientes` : ''}`}
                aria-expanded={showNotificaciones}
                className="relative rounded-full p-2 transition-colors hover:bg-surface-container"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-xl text-on-surface-variant">notifications</span>
                {notificaciones.length > 0 && (
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-surface-container-lowest bg-error" />
                )}
              </button>
              {showNotificaciones && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowNotificaciones(false)} aria-hidden="true" />
                  <div className="fixed inset-x-3 top-16 z-20 origin-top rounded-2xl bg-surface-container-lowest p-2 shadow-xl ring-1 ring-black/5 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80 sm:origin-top-right">
                    <p className="px-3 py-2 text-xs font-extrabold uppercase tracking-widest text-outline">Notificaciones</p>
                    {notificaciones.length === 0 ? (
                      <p className="px-3 py-4 text-sm text-on-surface-variant">No tienes avisos pendientes.</p>
                    ) : (
                      notificaciones.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => navigate(n.ruta)}
                          className="flex w-full flex-col rounded-xl px-3 py-2 text-left transition-colors hover:bg-surface-container"
                        >
                          <span className="text-sm font-bold text-on-surface">{n.titulo}</span>
                          <span className="text-xs text-on-surface-variant">{n.detalle}</span>
                        </button>
                      ))
                    )}
                    <Link
                      to="/erp/alertas"
                      className="mt-1 block rounded-xl px-3 py-2 text-center text-xs font-bold text-primary transition-colors hover:bg-surface-container"
                    >
                      Ver centro de alertas
                    </Link>
                  </div>
                </>
              )}
            </div>

            <div className="hidden h-7 w-px bg-outline-variant sm:block" />

            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                aria-label="Abrir menú de mi cuenta"
                aria-expanded={showUserMenu}
                className="flex items-center gap-2 rounded-full p-1 pr-2 transition-colors hover:bg-surface-container sm:pr-3"
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
                <span className="hidden text-sm font-bold text-on-surface sm:block">
                  {perfil?.nombre_completo ?? 'Mi cuenta'}
                </span>
                <span aria-hidden="true" className="material-symbols-outlined text-lg text-outline">
                  {showUserMenu ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowUserMenu(false)}
                    aria-hidden="true"
                  />
                  <div className="absolute right-0 z-20 mt-2 w-56 origin-top-right rounded-2xl bg-surface-container-lowest p-2 shadow-xl ring-1 ring-black/5">
                    <div className="px-3 py-2 mb-1">
                      <p className="text-xs font-extrabold uppercase tracking-widest text-outline">Mi Cuenta</p>
                    </div>
                    <Link to="/erp/configuracion" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low cursor-pointer">
                      <span aria-hidden="true" className="material-symbols-outlined text-xl">settings</span>
Configuración
                    </Link>
                    <Link to="/erp/suscripcion" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-warning transition-colors hover:bg-warning-container cursor-pointer">
                      <span aria-hidden="true" className="material-symbols-outlined text-xl">workspace_premium</span>
                      Mi plan y suscripción
                    </Link>
                    <div className="my-2 border-t border-surface-container-high" />
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-error transition-colors hover:bg-error-container hover:text-on-error-container"
                    >
                      <span aria-hidden="true" className="material-symbols-outlined text-xl">logout</span>
Cerrar sesión
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {errorPersistencia && (
          <div role="alert" className="flex flex-col gap-2 border-b border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span className="flex items-start gap-2">
              <span aria-hidden="true" className="material-symbols-outlined text-lg leading-none">error</span>
              <span>{errorPersistencia}</span>
            </span>
            <button
              onClick={() => (falloCarga ? recargarErp() : reintentarGuardado())}
              className="shrink-0 self-start rounded-full border border-error/40 px-4 py-1.5 text-xs font-bold hover:bg-error/10 sm:self-auto"
            >
              Reintentar
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
