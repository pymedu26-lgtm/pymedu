import { useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import PublicLayout from './layouts/PublicLayout';
import ERPLayout from './layouts/ERPLayout';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ERPProvider } from './1.-ERP/context/ERPContext';
import AuthGuard from './components/AuthGuard';
import RequireRole from './components/RequireRole';
import { rolLabel } from './lib/roles';

import Landing from './pages/Landing';
import Login from './pages/Login';
const Register = lazy(() => import('./pages/Register'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const PlaceholderPage = lazy(() => import('./pages/erp/PlaceholderPage'));
const Suscripcion = lazy(() => import('./pages/erp/Suscripcion'));
const SuscripcionResultado = lazy(() => import('./pages/erp/SuscripcionResultado'));
const MiInstitucion = lazy(() => import('./pages/MiInstitucion'));
const Ventas = lazy(() => import('./1.-ERP/pages/ERPVentas'));
const Gastos = lazy(() => import('./1.-ERP/pages/ERPGastos'));
const Inventario = lazy(() => import('./1.-ERP/pages/ERPInventario'));
const ERPClientes = lazy(() => import('./pages/erp/ERPClientes'));
const ERPProveedores = lazy(() => import('./pages/erp/ERPProveedores'));
const ERPCobrar = lazy(() => import('./pages/erp/ERPCobrar'));
const ERPPagar = lazy(() => import('./pages/erp/ERPPagar'));
const ERPCaja = lazy(() => import('./pages/erp/ERPCaja'));
const ERPIVAMensual = lazy(() => import('./pages/erp/ERPIVAMensual'));
const ERPReportes = lazy(() => import('./pages/erp/ERPReportes'));
const ERPPromociones = lazy(() => import('./pages/erp/ERPPromociones'));
const ERPConfiguracion = lazy(() => import('./pages/erp/ERPConfiguracion'));
const ERPAlertas = lazy(() => import('./pages/erp/ERPAlertas'));

const SuperAdminDashboard = lazy(() => import('./modules/admin/pages/SuperAdminDashboard'));
const InstitucionesList = lazy(() => import('./modules/admin/pages/InstitucionesList'));
const UsuariosGlobales = lazy(() => import('./modules/admin/pages/UsuariosGlobales'));
const SuperAdminPlanes = lazy(() => import('./modules/admin/pages/SuperAdminPlanes'));
const SuperAdminRoles = lazy(() => import('./modules/admin/pages/SuperAdminRoles'));
const SuperAdminConfig = lazy(() => import('./modules/admin/pages/SuperAdminConfig'));
const SuperAdminAuditoria = lazy(() => import('./modules/admin/pages/SuperAdminAuditoria'));
const SuperAdminSoporte = lazy(() => import('./modules/admin/pages/SuperAdminSoporte'));

const AdminInstDashboard = lazy(() => import('./modules/institucion/pages/AdminInstDashboard'));
const InstUsuarios = lazy(() => import('./modules/institucion/pages/InstUsuarios'));
const InstProgramas = lazy(() => import('./modules/institucion/pages/InstProgramas'));
const InstComunidad = lazy(() => import('./modules/institucion/pages/InstComunidad'));
const InstReportes = lazy(() => import('./modules/institucion/pages/InstReportes'));
const InstConfiguracion = lazy(() => import('./modules/institucion/pages/InstConfiguracion'));

const CoordDashboard = lazy(() => import('./modules/programa/pages/CoordDashboard'));
const CoordMentores = lazy(() => import('./modules/programa/pages/CoordMentores'));
const CoordEmprendedores = lazy(() => import('./modules/programa/pages/CoordEmprendedores'));

const MentorDashboard = lazy(() => import('./modules/mentor/pages/MentorDashboard'));
const MentorAlumnos = lazy(() => import('./modules/mentor/pages/MentorAlumnos'));
const MentorSeguimiento = lazy(() => import('./modules/mentor/pages/MentorSeguimiento'));

const ERPAcademia = lazy(() => import('./2.-ACADEMIA/pages/ERPAcademia'));
const ERPCursoDetalle = lazy(() => import('./2.-ACADEMIA/pages/ERPCursoDetalle'));

const MercadosPublicos = lazy(() => import('./3.-MERCADOS PUBLICOS/pages/ERPMercadosPublicos'));
const PortalMunicipal = lazy(() => import('./3.-MERCADOS PUBLICOS/pages/PortalMunicipal'));

// App Mentorías (carga diferida: no pesa en el ERP). Ver src/4.-MENTORIAS/tipos.ts
const MentoriasLayout = lazy(() => import('./4.-MENTORIAS/layout/MentoriasLayout'));
const MentoriasInicio = lazy(() => import('./4.-MENTORIAS/pages/MentoriasInicio'));
const MentoriaDetalle = lazy(() => import('./4.-MENTORIAS/pages/MentoriaDetalle'));
const MentoriasGestion = lazy(() => import('./4.-MENTORIAS/pages/MentoriasGestion'));
const MentoriasRevision = lazy(() => import('./4.-MENTORIAS/pages/MentoriasRevision'));
const MentoriasPanel = lazy(() => import('./4.-MENTORIAS/pages/MentoriasPanel'));
const GestorRolesLazy = lazy(() => import('./components/GestorRoles'));
const MentoriasEditor = lazy(() => import('./4.-MENTORIAS/pages/MentoriasEditor'));
const MentoriasGrupos = lazy(() => import('./4.-MENTORIAS/pages/MentoriasGrupos'));
const VerificarCertificado = lazy(() => import('./4.-MENTORIAS/pages/VerificarCertificado'));

function Cargando() {
  return <div className="flex min-h-screen items-center justify-center bg-surface text-on-surface-variant text-sm">Cargando…</div>;
}

function ERPWrapper() {
  return (
    <ERPProvider>
      <Outlet />
    </ERPProvider>
  );
}

const roleNavItems: Record<string, { label: string; path: string; icon: string }[]> = {
  superadmin: [
    { label: 'Dashboard', path: '/admin/inicio', icon: 'shield' },
    { label: 'Organizaciones', path: '/admin/instituciones', icon: 'apartment' },
    { label: 'Usuarios', path: '/admin/usuarios', icon: 'group' },
    { label: 'Planes', path: '/admin/planes', icon: 'workspace_premium' },
    { label: 'Roles', path: '/admin/roles', icon: 'admin_panel_settings' },
    { label: 'Mentorías', path: '/mentorias/revision', icon: 'cast_for_education' },
    { label: 'Configuración', path: '/admin/config', icon: 'settings' },
    { label: 'Auditoría', path: '/admin/auditoria', icon: 'fact_check' },
    { label: 'Soporte', path: '/admin/soporte', icon: 'support_agent' },
  ],
  admin_institucional: [
    { label: 'Dashboard', path: '/institucion/inicio', icon: 'admin_panel_settings' },
    { label: 'Comunidad', path: '/institucion/comunidad', icon: 'diversity_3' },
    { label: 'Programas', path: '/institucion/programas', icon: 'school' },
    { label: 'Usuarios', path: '/institucion/usuarios', icon: 'group' },
    { label: 'Reportes', path: '/institucion/reportes', icon: 'analytics' },
    { label: 'Mentorías', path: '/mentorias', icon: 'cast_for_education' },
    { label: 'Configuración', path: '/institucion/config', icon: 'settings' },
  ],
  coordinador: [
    { label: 'Dashboard', path: '/programa/inicio', icon: 'group_work' },
    { label: 'Mentores', path: '/programa/mentores', icon: 'school' },
    { label: 'Emprendedores', path: '/programa/emprendedores', icon: 'storefront' },
    { label: 'Mentorías', path: '/mentorias', icon: 'cast_for_education' },
  ],
  mentor: [
    { label: 'Dashboard', path: '/mentor/inicio', icon: 'school' },
    { label: 'Mis Alumnos', path: '/mentor/alumnos', icon: 'groups' },
    { label: 'Seguimiento', path: '/mentor/seguimiento/1', icon: 'assignment' },
    { label: 'Mentorías', path: '/mentorias', icon: 'cast_for_education' },
  ],
  demo: [
    { label: 'SuperAdmin', path: '/admin/inicio', icon: 'shield' },
    { label: 'Admin Inst.', path: '/institucion/inicio', icon: 'admin_panel_settings' },
    { label: 'Coordinador', path: '/programa/inicio', icon: 'group_work' },
    { label: 'Mentor', path: '/mentor/inicio', icon: 'school' },
    { label: 'Emprendedor', path: '/erp/inicio', icon: 'storefront' },
    { label: 'Mentorías', path: '/mentorias', icon: 'cast_for_education' },
  ],
};

function RoleNavSidebar({ collapsed, setCollapsed }: { collapsed: boolean; setCollapsed: (v: boolean) => void }) {
  const { perfil, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const items = roleNavItems[perfil?.rol ?? ''] ?? [];

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <aside className={`fixed left-0 top-0 z-50 flex h-screen flex-col overflow-y-auto bg-primary-container shadow-2xl shadow-shadow/20 transition-all duration-300 ${collapsed ? 'w-[64px]' : 'w-[216px]'}`}>
      <div className="flex items-center gap-2.5 border-b border-white/10 px-3 py-3.5 shrink-0">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 transition-colors hover:bg-white/20"
        >
          <span className="material-symbols-outlined text-lg text-white">
            {collapsed ? 'menu' : 'menu_open'}
          </span>
        </button>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-[9px] font-extrabold uppercase tracking-[0.24em] text-on-primary-container/60">PymEdu</p>
            <h1 className="text-base font-black leading-none tracking-tight text-white capitalize truncate">
              {rolLabel(perfil?.rol ?? '')}
            </h1>
          </div>
        )}
      </div>

      <nav className={`flex-1 py-3 space-y-1.5 ${collapsed ? 'px-2' : 'px-2.5'}`}>
        {items.map((item) => {
          const active = location.pathname.startsWith(item.path.split('/').slice(0, 3).join('/'));
          return (
            <Link
              key={item.path}
              to={item.path}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-2.5 rounded-xl transition-all ${
                collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
              } text-[13px] font-bold ${
                active
                  ? 'bg-white/15 text-white border border-white/20'
                  : 'text-on-primary-container/70 hover:bg-white/10 hover:text-white border border-transparent'
              }`}
            >
              <span className="material-symbols-outlined text-lg shrink-0">{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className={`border-t border-white/10 py-3 shrink-0 ${collapsed ? 'px-2' : 'px-2.5'}`}>
        <button
          onClick={handleLogout}
          title={collapsed ? 'Cerrar sesión' : undefined}
          className={`flex w-full items-center gap-2.5 rounded-xl text-[13px] font-bold text-on-primary-container/60 hover:bg-white/10 hover:text-white transition-all ${
            collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
          }`}
        >
          <span className="material-symbols-outlined text-lg shrink-0">logout</span>
          {!collapsed && <span>Cerrar sesión</span>}
        </button>
      </div>
    </aside>
  );
}

function RoleProtectedLayout() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="flex min-h-screen bg-surface text-on-surface">
      <RoleNavSidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <main className={`flex-1 overflow-y-auto ${collapsed ? 'ml-[64px]' : 'ml-[216px]'}`}>
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<Cargando />}>
        <Routes>
          {/* ── Public Routes ── */}
        <Route element={<PublicLayout />}>
          <Route index element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Route>

          {/* ── Verificación pública de certificados de Mentorías (sin sesión) ── */}
          <Route path="/verificar/:codigo" element={<VerificarCertificado />} />

          {/* ── Protected Routes ── */}
          <Route element={<AuthGuard />}>

            {/* ── PymEdu Mentorías: app propia, abierta a todos los roles (cada pantalla filtra por permisos) ── */}
            <Route element={<Suspense fallback={<Cargando />}><MentoriasLayout /></Suspense>}>
              <Route path="/mentorias" element={<MentoriasInicio />} />
              <Route path="/mentorias/curso/:id" element={<MentoriaDetalle />} />
              <Route path="/mentorias/gestion" element={<MentoriasGestion />} />
              <Route path="/mentorias/gestion/:id" element={<MentoriasEditor />} />
              <Route path="/mentorias/grupos" element={<MentoriasGrupos />} />
              <Route path="/mentorias/revision" element={<MentoriasRevision />} />
              <Route path="/mentorias/panel" element={<MentoriasPanel />} />
              <Route path="/mentorias/*" element={<Navigate to="/mentorias" replace />} />
            </Route>

            {/* ── SuperAdmin ── */}
            <Route element={<RequireRole roles={['superadmin']} />}>
              <Route element={<RoleProtectedLayout />}>
                <Route path="/admin/inicio" element={<SuperAdminDashboard />} />
                <Route path="/admin/instituciones" element={<InstitucionesList />} />
                <Route path="/admin/usuarios" element={<UsuariosGlobales />} />
                <Route path="/admin/planes" element={<SuperAdminPlanes />} />
                <Route path="/admin/roles" element={<SuperAdminRoles />} />
                <Route path="/admin/config" element={<SuperAdminConfig />} />
                <Route path="/admin/auditoria" element={<SuperAdminAuditoria />} />
                <Route path="/admin/soporte" element={<SuperAdminSoporte />} />
                <Route path="/admin" element={<Navigate to="/admin/inicio" replace />} />
                <Route path="/admin/*" element={<Navigate to="/admin/inicio" replace />} />
              </Route>
            </Route>

            {/* ── Admin Institucional ── */}
            <Route element={<RequireRole roles={['admin_institucional']} />}>
              <Route element={<RoleProtectedLayout />}>
                <Route path="/institucion/inicio" element={<AdminInstDashboard />} />
                <Route path="/institucion/comunidad" element={<InstComunidad />} />
                <Route path="/institucion/programas" element={<InstProgramas />} />
                <Route path="/institucion/usuarios" element={<InstUsuarios />} />
                <Route path="/institucion/reportes" element={<InstReportes />} />
                <Route path="/institucion/config" element={<InstConfiguracion />} />
                <Route path="/institucion" element={<Navigate to="/institucion/inicio" replace />} />
                <Route path="/institucion/*" element={<Navigate to="/institucion/inicio" replace />} />
              </Route>
            </Route>

            {/* ── Coordinador ── */}
            <Route element={<RequireRole roles={['coordinador']} />}>
              <Route element={<RoleProtectedLayout />}>
                <Route path="/programa/inicio" element={<CoordDashboard />} />
                <Route path="/programa/mentores" element={<CoordMentores />} />
                <Route path="/programa/emprendedores" element={<CoordEmprendedores />} />
                <Route path="/programa" element={<Navigate to="/programa/inicio" replace />} />
                <Route path="/programa/*" element={<Navigate to="/programa/inicio" replace />} />
              </Route>
            </Route>

            {/* ── Mentor ── */}
            <Route element={<RequireRole roles={['mentor']} />}>
              <Route element={<RoleProtectedLayout />}>
                <Route path="/mentor/inicio" element={<MentorDashboard />} />
                <Route path="/mentor/alumnos" element={<MentorAlumnos />} />
                <Route path="/mentor/seguimiento/:id" element={<MentorSeguimiento />} />
                <Route path="/mentor" element={<Navigate to="/mentor/inicio" replace />} />
                <Route path="/mentor/*" element={<Navigate to="/mentor/inicio" replace />} />
              </Route>
            </Route>

            {/* ── Emprendedor (ERP completo) ── */}
            <Route element={<RequireRole roles={['emprendedor', 'dueño', 'vendedor', 'gestor', 'encargado_rrhh', 'empleado', 'contador_externo']} />}>
              <Route element={<ERPWrapper />}>
                <Route element={<ERPLayout />}>
                  <Route path="/erp/inicio" element={<Dashboard />} />
                  <Route path="/dashboard" element={<Navigate to="/erp/inicio" replace />} />

                  <Route path="/erp/alertas" element={<ERPAlertas />} />
                  <Route path="/erp/configuracion" element={<ERPConfiguracion />} />
                  <Route path="/erp/suscripcion" element={<Suscripcion />} />
                  <Route path="/erp/suscripcion/resultado" element={<SuscripcionResultado />} />
                  <Route path="/erp/mi-institucion" element={<MiInstitucion />} />

                  <Route path="/erp/ventas" element={<Ventas />} />
                  <Route path="/erp/gastos" element={<Gastos />} />
                  <Route path="/erp/inventario" element={<Inventario />} />
                  <Route path="/erp/promociones" element={<ERPPromociones />} />
                  <Route path="/erp/clientes" element={<ERPClientes />} />
                  <Route path="/erp/proveedores" element={<ERPProveedores />} />
                  <Route path="/erp/cobrar" element={<ERPCobrar />} />
                  <Route path="/erp/pagar" element={<ERPPagar />} />
                  <Route path="/erp/caja" element={<ERPCaja />} />
                  <Route path="/erp/iva-mensual" element={<ERPIVAMensual />} />
                  <Route path="/erp/reportes" element={<ERPReportes />} />

                  <Route path="/erp/remuneraciones" element={<PlaceholderPage title="Remuneraciones" icon="badge" description="Gestión de liquidaciones, contratos y roles de tu equipo. Este módulo se habilita al contratar el complemento RR.HH. y requiere los permisos correspondientes." />} />
                  {/* Configuración → Equipo: roles y subroles del negocio (Vendedor → Cajero, Gestor → Bodeguero) */}
                  <Route path="/erp/equipo" element={<Suspense fallback={<Cargando />}><GestorRolesLazy ambitoInicial="negocio" titulo="Roles de tu equipo" /></Suspense>} />
                  <Route path="/erp/organigrama" element={<PlaceholderPage title="Organigrama" icon="account_tree" description="Visualización jerárquica de tu equipo (jefaturas y reportes directos). Se completará automáticamente con los reportes de la institución." />} />
                  <Route path="/erp/documentos" element={<PlaceholderPage title="Documentos Laborales" icon="description" description="Contratos, anexos y plantillas para postulaciones y equipo. Sube y organiza tus documentos desde el módulo de Documentos." />} />

                  <Route path="/erp/mercados-publicos" element={<MercadosPublicos />} />
                  <Route path="/erp/portal-municipal" element={<PortalMunicipal />} />

                  <Route path="/erp/mentorias" element={<Navigate to="/mentorias" replace />} />
                  <Route path="/erp/academia" element={<ERPAcademia />} />
                  <Route path="/erp/academia/:category/:id" element={<ERPCursoDetalle />} />

                  <Route path="/erp" element={<Navigate to="/erp/inicio" replace />} />
                  <Route path="/erp/*" element={<Navigate to="/erp/inicio" replace />} />
                </Route>
              </Route>
            </Route>

          </Route>

          {/* ── Demo redirect ── */}
            <Route path="/demo/inicio" element={<Navigate to="/admin/inicio" replace />} />

          {/* ── Catch-all ── */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}
