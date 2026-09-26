import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import PublicLayout from './layouts/PublicLayout';
import ERPLayout from './layouts/ERPLayout';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ERPProvider } from './1.-ERP/context/ERPContext';
import AuthGuard from './components/AuthGuard';
import RequireRole from './components/RequireRole';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import PlaceholderPage from './pages/erp/PlaceholderPage';
import Suscripcion from './pages/erp/Suscripcion';
import SuscripcionResultado from './pages/erp/SuscripcionResultado';
import MiInstitucion from './pages/MiInstitucion';
import Ventas from './1.-ERP/pages/ERPVentas';
import Gastos from './1.-ERP/pages/ERPGastos';
import Inventario from './1.-ERP/pages/ERPInventario';
import ERPClientes from './pages/erp/ERPClientes';
import ERPProveedores from './pages/erp/ERPProveedores';
import ERPCobrar from './pages/erp/ERPCobrar';
import ERPPagar from './pages/erp/ERPPagar';
import ERPCaja from './pages/erp/ERPCaja';
import ERPIVAMensual from './pages/erp/ERPIVAMensual';
import ERPReportes from './pages/erp/ERPReportes';
import ERPPromociones from './pages/erp/ERPPromociones';
import ERPConfiguracion from './pages/erp/ERPConfiguracion';
import ERPAlertas from './pages/erp/ERPAlertas';

import SuperAdminDashboard from './modules/admin/pages/SuperAdminDashboard';
import InstitucionesList from './modules/admin/pages/InstitucionesList';
import UsuariosGlobales from './modules/admin/pages/UsuariosGlobales';
import SuperAdminPlanes from './modules/admin/pages/SuperAdminPlanes';
import SuperAdminRoles from './modules/admin/pages/SuperAdminRoles';
import SuperAdminConfig from './modules/admin/pages/SuperAdminConfig';
import SuperAdminAuditoria from './modules/admin/pages/SuperAdminAuditoria';
import SuperAdminSoporte from './modules/admin/pages/SuperAdminSoporte';

import AdminInstDashboard from './modules/institucion/pages/AdminInstDashboard';
import InstUsuarios from './modules/institucion/pages/InstUsuarios';
import InstProgramas from './modules/institucion/pages/InstProgramas';
import InstComunidad from './modules/institucion/pages/InstComunidad';
import InstReportes from './modules/institucion/pages/InstReportes';
import InstConfiguracion from './modules/institucion/pages/InstConfiguracion';

import CoordDashboard from './modules/programa/pages/CoordDashboard';
import CoordMentores from './modules/programa/pages/CoordMentores';
import CoordEmprendedores from './modules/programa/pages/CoordEmprendedores';

import MentorDashboard from './modules/mentor/pages/MentorDashboard';
import MentorAlumnos from './modules/mentor/pages/MentorAlumnos';
import MentorSeguimiento from './modules/mentor/pages/MentorSeguimiento';

import ERPAcademia from './2.-ACADEMIA/pages/ERPAcademia';
import ERPCursoDetalle from './2.-ACADEMIA/pages/ERPCursoDetalle';

import MercadosPublicos from './3.-MERCADOS PUBLICOS/pages/ERPMercadosPublicos';
import PortalMunicipal from './3.-MERCADOS PUBLICOS/pages/PortalMunicipal';

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
    { label: 'Configuración', path: '/institucion/config', icon: 'settings' },
  ],
  coordinador: [
    { label: 'Dashboard', path: '/programa/inicio', icon: 'group_work' },
    { label: 'Mentores', path: '/programa/mentores', icon: 'school' },
    { label: 'Emprendedores', path: '/programa/emprendedores', icon: 'storefront' },
  ],
  mentor: [
    { label: 'Dashboard', path: '/mentor/inicio', icon: 'school' },
    { label: 'Mis Alumnos', path: '/mentor/alumnos', icon: 'groups' },
    { label: 'Seguimiento', path: '/mentor/seguimiento/1', icon: 'assignment' },
  ],
  demo: [
    { label: 'SuperAdmin', path: '/admin/inicio', icon: 'shield' },
    { label: 'Admin Inst.', path: '/institucion/inicio', icon: 'admin_panel_settings' },
    { label: 'Coordinador', path: '/programa/inicio', icon: 'group_work' },
    { label: 'Mentor', path: '/mentor/inicio', icon: 'school' },
    { label: 'Emprendedor', path: '/erp/inicio', icon: 'storefront' },
  ],
};

function RoleNavSidebar() {
  const { perfil, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const items = roleNavItems[perfil?.rol ?? ''] ?? [];
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <aside className={`sticky left-0 top-0 z-50 flex h-screen flex-col bg-primary-container shadow-2xl shadow-slate-900/20 transition-all duration-300 ${collapsed ? 'w-[64px]' : 'w-[216px]'}`}>
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
            <p className="text-[9px] font-extrabold uppercase tracking-[0.24em] text-indigo-200/60">PymEdu</p>
            <h1 className="text-base font-black leading-none tracking-tight text-white capitalize truncate">
              {perfil?.rol?.replace('_', ' ')}
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
                  : 'text-indigo-100/70 hover:bg-white/10 hover:text-white border border-transparent'
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
          title={collapsed ? 'Cerrar sesion' : undefined}
          className={`flex w-full items-center gap-2.5 rounded-xl text-[13px] font-bold text-indigo-100/60 hover:bg-white/10 hover:text-white transition-all ${
            collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
          }`}
        >
          <span className="material-symbols-outlined text-lg shrink-0">logout</span>
          {!collapsed && <span>Cerrar sesion</span>}
        </button>
      </div>
    </aside>
  );
}

function RoleProtectedLayout() {
  return (
    <div className="flex min-h-screen bg-surface text-on-surface">
      <RoleNavSidebar />
      <main className="flex-1 overflow-y-auto">
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
        <Routes>
          {/* ── Public Routes ── */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>

          {/* ── Protected Routes ── */}
          <Route element={<AuthGuard />}>

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

                  <Route path="/erp/remuneraciones" element={<PlaceholderPage title="Remuneraciones" icon="badge" description="Gestion de liquidaciones, contratos y roles de tu equipo. Este modulo se habilita al contratar el complemento RR.HH. y requiere los permisos correspondientes." />} />
                  <Route path="/erp/equipo" element={<PlaceholderPage title="Equipo" icon="group" description="Miembros de tu equipo, roles y permisos de acceso al ERP. Los usuarios se gestionan desde Administracion de tu institucion." />} />
                  <Route path="/erp/organigrama" element={<PlaceholderPage title="Organigrama" icon="account_tree" description="Visualizacion jerarquica de tu equipo (jefaturas y reportes directos). Se completara automaticamente con los reportes de la institucion." />} />
                  <Route path="/erp/documentos" element={<PlaceholderPage title="Documentos Laborales" icon="description" description="Contratos, anexos y plantillas para postulaciones y equipo. Sube y organiza tus documentos desde el modulo de Documentos." />} />

                  <Route path="/erp/mercados-publicos" element={<MercadosPublicos />} />
                  <Route path="/erp/portal-municipal" element={<PortalMunicipal />} />

                  <Route path="/erp/mentorias" element={<PlaceholderPage title="Mentorias" icon="school" description="Agenda y seguimiento de mentorias con tu mentor asignado. Gestiona sesiones desde el espacio Mentor." />} />
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
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}
