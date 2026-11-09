import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { rolLabel } from '../../lib/roles';
import { cn } from '../../lib/utils';
import { Icono, Panel } from '../componentes/ui';
import '../mentorias.css';

interface ItemNav { nombre: string; ruta: string; icono: string; activo: boolean }

const INICIO_POR_ROL: Record<string, string> = {
  superadmin: '/admin/inicio', admin_institucional: '/institucion/inicio', coordinador: '/programa/inicio', mentor: '/mentor/inicio',
};
const SIN_ERP = ['superadmin', 'admin_institucional', 'coordinador', 'mentor', 'admin_proveedor', 'instructor', 'curador'];
const ROLES_GESTION = ['superadmin', 'admin_institucional', 'coordinador', 'mentor', 'admin_proveedor', 'instructor'];
const ROLES_REVISION = ['superadmin', 'admin_institucional', 'curador'];
const ROLES_PANEL = ['superadmin', 'admin_institucional', 'coordinador', 'admin_proveedor'];
// Roles nuevos del marketplace que aún no están en src/lib/roles.ts.
const ROL_EXTRA: Record<string, string> = { admin_proveedor: 'Admin proveedor', instructor: 'Instructor', curador: 'Curador' };

function EnlaceNav({ item }: { item: ItemNav; key?: string }) {
  return (
    <Link to={item.ruta} title={item.nombre} aria-current={item.activo ? 'page' : undefined}
      className={cn('flex min-h-11 items-center justify-center gap-3 rounded-xl px-3 text-sm font-semibold transition lg:justify-start',
        item.activo ? 'bg-(--m-accent) text-(--m-on-accent)' : 'text-(--m-sidebar-text) hover:bg-(--m-navy-hover) hover:text-white')}>
      <Icono n={item.icono} fill={item.activo} />
      <span className="sr-only lg:not-sr-only">{item.nombre}</span>
    </Link>
  );
}

export default function MentoriasLayout() {
  const { perfil, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const [busqueda, setBusqueda] = useState(params.get('q') ?? '');
  const [masAbierto, setMasAbierto] = useState(false);
  const rol = String(perfil?.rol ?? '');

  useEffect(() => { setBusqueda(params.get('q') ?? ''); }, [params]);
  // Al cambiar de pantalla se vuelve arriba (si no, la ficha abría con el scroll del catálogo).
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  const { suite, modulo } = useMemo(() => {
    const conErp = !SIN_ERP.includes(rol);
    const suite: ItemNav[] = [
      { nombre: 'Inicio', ruta: INICIO_POR_ROL[rol] ?? '/erp/inicio', icono: 'home', activo: false },
      ...(conErp ? [{ nombre: 'ERP', ruta: '/erp/inicio', icono: 'point_of_sale', activo: false }] : []),
      { nombre: 'Mentorías', ruta: '/mentorias', icono: 'school', activo: true },
      ...(conErp ? [{ nombre: 'Academia', ruta: '/erp/academia', icono: 'auto_stories', activo: false }] : []),
    ];
    const modulo: ItemNav[] = [
      { nombre: 'Explorar', ruta: '/mentorias', icono: 'explore', activo: pathname === '/mentorias' || pathname.startsWith('/mentorias/curso') },
      ...(ROLES_GESTION.includes(rol) ? [{ nombre: 'Gestión', ruta: '/mentorias/gestion', icono: 'edit_note', activo: pathname.startsWith('/mentorias/gestion') }] : []),
      // Mismos roles que gestionan: el mentor ve sus grupos; coordinación, instituciones y proveedores, los de su organización.
      ...(ROLES_GESTION.includes(rol) ? [{ nombre: 'Mis grupos', ruta: '/mentorias/grupos', icono: 'groups', activo: pathname.startsWith('/mentorias/grupos') }] : []),
      ...(ROLES_REVISION.includes(rol) ? [{ nombre: 'Revisión', ruta: '/mentorias/revision', icono: 'fact_check', activo: pathname.startsWith('/mentorias/revision') }] : []),
      ...(ROLES_PANEL.includes(rol) ? [{ nombre: 'Panel', ruta: '/mentorias/panel', icono: 'monitoring', activo: pathname.startsWith('/mentorias/panel') }] : []),
    ];
    return { suite, modulo };
  }, [rol, pathname]);

  // Barra inferior (móvil): primero las secciones del módulo, luego la suite; 4 visibles + «Más».
  const movil = useMemo(() => [...modulo, ...suite.filter((i) => i.nombre !== 'Mentorías')], [modulo, suite]);

  const salir = async () => { await signOut(); navigate('/login'); };
  const buscar = (e: FormEvent) => {
    e.preventDefault();
    const q = busqueda.trim();
    navigate(q ? `/mentorias?q=${encodeURIComponent(q)}` : '/mentorias');
  };

  const nombre = perfil?.nombre_completo || perfil?.email || 'Usuario';
  const iniciales = nombre.split(/\s+/).slice(0, 2).map((p: string) => p[0]?.toUpperCase()).join('');
  const temaIcono = theme === 'dark' ? 'light_mode' : 'dark_mode';
  const temaTexto = theme === 'dark' ? 'Modo claro' : 'Modo oscuro';
  const rolTexto = ROL_EXTRA[rol] ?? rolLabel(rol);

  return (
    <div className="app-mentorias flex min-h-dvh bg-(--m-bg) font-sans text-(--m-text)">
      {/* Barra lateral: completa ≥ 1024 px, solo íconos entre 640 y 1023 px, oculta en teléfonos */}
      <aside className="sticky top-0 hidden h-dvh w-20 shrink-0 flex-col bg-(--m-navy) px-3 py-5 sm:flex lg:w-64" aria-label="Navegación principal">
        <Link to="/mentorias" aria-label="PymEdu Mentorías" className="mb-6 flex items-center justify-center gap-2 px-2 text-white lg:justify-start">
          <span className="grid size-9 place-items-center rounded-xl bg-(--m-accent) text-(--m-on-accent)"><Icono n="school" fill /></span>
          <span className="hidden text-xl font-extrabold tracking-tight lg:inline">PymEdu</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {suite.map((i) => <EnlaceNav key={i.nombre} item={i} />)}
          <p className="mt-5 mb-1 hidden px-3 text-[11px] font-bold uppercase tracking-wider text-(--m-sidebar-text)/70 lg:block">Mentorías</p>
          <hr className="my-3 border-white/10 lg:hidden" />
          {modulo.map((i) => (
            <Link key={i.nombre} to={i.ruta} title={i.nombre} aria-current={i.activo ? 'page' : undefined}
              className={cn('flex min-h-10 items-center justify-center gap-3 rounded-xl px-3 text-sm font-medium transition lg:justify-start',
                i.activo ? 'bg-white/10 text-white shadow-[inset_3px_0_0_var(--m-accent)]' : 'text-(--m-sidebar-text) hover:bg-(--m-navy-hover) hover:text-white')}>
              <Icono n={i.icono} size={18} className={i.activo ? 'text-(--m-accent)' : undefined} />
              <span className="sr-only lg:not-sr-only">{i.nombre}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
          <button type="button" onClick={toggleTheme} title={temaTexto} aria-label={temaTexto}
            className="flex min-h-10 w-full items-center justify-center gap-3 rounded-xl px-3 text-sm text-(--m-sidebar-text) hover:bg-(--m-navy-hover) hover:text-white lg:justify-start">
            <Icono n={temaIcono} /><span className="sr-only lg:not-sr-only">{temaTexto}</span>
          </button>
          <div className="flex items-center justify-center gap-3 px-1 lg:justify-start">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15 text-xs font-bold text-white" title={`${nombre} · ${rolTexto}`}>{iniciales}</span>
            <span className="hidden min-w-0 lg:block">
              <span className="block truncate text-sm font-semibold text-white">{nombre}</span>
              <span className="block truncate text-xs text-(--m-sidebar-text)">{rolTexto}</span>
            </span>
          </div>
          <button type="button" onClick={salir} title="Cerrar sesión"
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/20 px-3 text-sm font-semibold text-white hover:border-(--m-accent) hover:bg-white/5">
            <Icono n="logout" size={18} /><span className="sr-only lg:not-sr-only">Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-(--m-border) bg-(--m-card)/90 px-4 py-3 backdrop-blur sm:px-6">
          <Link to="/mentorias" className="flex items-center gap-2 font-extrabold sm:hidden" aria-label="PymEdu Mentorías">
            <span className="grid size-8 place-items-center rounded-lg bg-(--m-navy) text-white"><Icono n="school" size={18} fill /></span>
          </Link>
          <form role="search" onSubmit={buscar} className="relative max-w-xl flex-1">
            <Icono n="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--m-muted)" />
            <label htmlFor="m-buscar" className="sr-only">Buscar mentorías</label>
            <input id="m-buscar" type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar mentorías, temas o mentores…" className="m-input rounded-full pl-10" />
          </form>
        </header>

        <main className="flex-1 px-4 pt-5 pb-28 sm:px-6 sm:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Barra inferior en teléfonos */}
      <nav aria-label="Navegación" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-white/10 bg-(--m-navy) pb-[env(safe-area-inset-bottom)] sm:hidden">
        {movil.slice(0, 4).map((i) => (
          <Link key={i.nombre} to={i.ruta} aria-current={i.activo ? 'page' : undefined}
            className={cn('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', i.activo ? 'text-(--m-accent)' : 'text-(--m-sidebar-text)')}>
            <Icono n={i.icono} size={22} fill={i.activo} />{i.nombre}
          </Link>
        ))}
        <button type="button" onClick={() => setMasAbierto(true)} aria-haspopup="dialog"
          className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-(--m-sidebar-text)">
          <Icono n="menu" size={22} />Más
        </button>
      </nav>

      {masAbierto && (
        <Panel titulo="Más opciones" abajo onCerrar={() => setMasAbierto(false)}>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-(--m-navy) text-sm font-bold text-white">{iniciales}</span>
              <span><span className="block font-semibold">{nombre}</span><span className="block text-sm text-(--m-muted)">{rolTexto}</span></span>
            </div>
            <div className="grid gap-1">
              {movil.slice(4).map((i) => (
                <Link key={i.nombre} to={i.ruta} onClick={() => setMasAbierto(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 font-semibold hover:bg-(--m-subtle)">
                  <Icono n={i.icono} />{i.nombre}
                </Link>
              ))}
              <button type="button" onClick={toggleTheme} className="flex min-h-11 items-center gap-3 rounded-xl px-3 font-semibold hover:bg-(--m-subtle)">
                <Icono n={temaIcono} />{temaTexto}
              </button>
            </div>
            <button type="button" onClick={salir} className="m-btn m-btn-secundario w-full"><Icono n="logout" />Cerrar sesión</button>
          </div>
        </Panel>
      )}
    </div>
  );
}
