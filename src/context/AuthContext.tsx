import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

/**
 * Permisos de pantalla (legado) → código del catálogo de roles dinámicos (cuentas.permiso).
 * Así el menú y las acciones respetan los roles que cada organización arma, no una lista fija.
 */
const PERMISO_NUCLEO: Record<string, string> = {
  crear_ventas: 'ventas.escribir', crear_gastos: 'gastos.escribir', ver_caja: 'caja.leer', ver_reportes: 'reportes.leer',
  ver_remuneraciones: 'rrhh.leer', ver_documentos: 'rrhh.leer', ver_organigrama: 'rrhh.leer', ver_equipo: 'rrhh.leer',
  ver_inventario: 'inventario.leer', ver_clientes: 'clientes.leer', ver_proveedores: 'proveedores.leer',
  editar_mi_negocio: 'config.escribir', ver_mentorias: 'mentoria.leer', ver_academia: 'academia.leer',
};
/** Permisos que además dependen del plan contratado (flags del perfil). */
const FLAGS_PLAN: Record<string, keyof Perfil> = {
  crear_ventas: 'puede_crear_ventas', crear_gastos: 'puede_crear_gastos', ver_caja: 'puede_ver_caja',
  ver_reportes: 'puede_ver_reportes', ver_remuneraciones: 'puede_ver_remuneraciones',
};
import { api, getToken, setToken } from '../lib/api';
import { ROL_PUEDE_HACER, type Rol } from '../lib/roles';

export type { Rol };

export interface Perfil {
  id: string;
  email: string;
  nombre_completo: string;
  rol: Rol;
  institucion_id?: string;
  reporta_a?: string;
  membresia_nivel: 'free' | 'pro' | 'premium';
  membresia_expira?: string | null;
  segmento_negocio: 'A' | 'B' | 'C';
  acceso_revocado_at?: string | null;
  puede_ver_remuneraciones?: boolean;
  puede_ver_caja?: boolean;
  puede_ver_reportes?: boolean;
  puede_crear_ventas?: boolean;
  puede_crear_gastos?: boolean;
  negocio_nombre?: string;
  negocio_rut?: string;
  negocio_rubro?: string;
  logo_url?: string;
  avatar_url?: string;
  [key: string]: unknown;
}

interface AuthContextType {
  user: { id: string; email: string } | null;
  perfil: Perfil | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<Perfil>;
  register: (email: string, password: string, full_name: string, extra?: Record<string, unknown>) => Promise<Perfil>;
  signOut: () => Promise<void>;
  puedeHacer: (permiso: string) => boolean;
  /** Permiso del catálogo de roles dinámicos (ej. 'inventario.escribir'). Reemplaza los `if rol === 'X'`. */
  tienePermiso: (codigo: string) => boolean;
  recargarPerfil: () => Promise<void>;
  actualizarPerfil: (datos: Record<string, unknown>) => Promise<Perfil>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, perfil: null, isLoading: true,
  signIn: async () => { throw new Error('AuthContext no inicializado'); },
  register: async () => { throw new Error('AuthContext no inicializado'); },
  signOut: async () => {},
  puedeHacer: () => false,
  tienePermiso: () => false,
  recargarPerfil: async () => {},
  actualizarPerfil: async () => { throw new Error('AuthContext no inicializado'); },
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  /** Permisos efectivos del usuario según sus roles (null = aún no cargados → se usa la lógica anterior). */
  const [permisosNucleo, setPermisosNucleo] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!perfil?.id) { setPermisosNucleo(null); return; }
    let activo = true;
    api.rolesCatalogo()
      .then(r => { if (activo) setPermisosNucleo(new Set(r.mios)); })
      .catch(() => { if (activo) setPermisosNucleo(null); });
    return () => { activo = false; };
  }, [perfil?.id, perfil?.rol]);

  const aplicarPerfil = (p: Perfil) => {
    setPerfil(p);
    setUser(p ? { id: p.id, email: p.email } : null);
  };

  // Restaura la sesion desde el token guardado en localStorage
  useEffect(() => {
    let active = true;
    // Sin token no hay sesión que restaurar: no se llama a /me (evita el 401 en la landing, corrección #8).
    if (!getToken()) {
      setIsLoading(false);
      return () => { active = false; };
    }
    (async () => {
      try {
        const { perfil: p } = await api.me();
        if (active) {
          aplicarPerfil(p as Perfil);
          setUser({ id: p.id as string, email: p.email as string });
        }
      } catch {
        setToken(null);
        if (active) {
          setPerfil(null);
          setUser(null);
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const signIn = async (email: string, password: string): Promise<Perfil> => {
    const { token, perfil: p } = await api.login(email, password);
    setToken(token);
    aplicarPerfil(p as Perfil);
    setIsLoading(false);
    return p as Perfil;
  };

  const register = async (email: string, password: string, full_name: string, extra: Record<string, unknown> = {}): Promise<Perfil> => {
    const { token, perfil: p } = await api.register(email, password, full_name, extra);
    setToken(token);
    aplicarPerfil(p as Perfil);
    setIsLoading(false);
    return p as Perfil;
  };

  const signOut = async () => {
    setToken(null);
    setPerfil(null);
    setUser(null);
  };

  const recargarPerfil = async () => {
    try {
      const { perfil: p } = await api.me();
      aplicarPerfil(p as Perfil);
    } catch {
      // mantiene el perfil actual si la recarga falla
    }
  };

  const actualizarPerfil = async (datos: Record<string, unknown>): Promise<Perfil> => {
    const { perfil: p } = await api.actualizarMiPerfil(datos);
    const actualizado = { ...perfil, ...(p as Perfil) } as Perfil;
    aplicarPerfil(actualizado);
    return actualizado;
  };

  const tienePermiso = (codigo: string): boolean => {
    if (!perfil) return false;
    if (perfil.rol === 'superadmin' || perfil.rol === 'demo') return true;
    return permisosNucleo?.has(codigo) ?? false;
  };

  const puedeHacer = (permiso: string): boolean => {
    if (!perfil) return false;
    if (perfil.rol === 'superadmin') return true;
    if (perfil.rol === 'admin_institucional') return true;
    if (perfil.rol === 'demo') return true;
    if (permiso === 'ver_mi_perfil') return true;

    // Roles dinámicos: si ya se cargaron y el permiso tiene equivalente en el catálogo, mandan ellos.
    // El plan contratado sigue restringiendo (ej. plan Básico sin Caja ni Reportes).
    const codigo = PERMISO_NUCLEO[permiso];
    if (codigo && permisosNucleo) {
      const flag = FLAGS_PLAN[permiso];
      const bloqueadoPorPlan = !!flag && (perfil.rol === 'emprendedor' || perfil.rol === 'dueño') && perfil[flag] === false;
      return permisosNucleo.has(codigo) && !bloqueadoPorPlan;
    }

    const flags = {
      'crear_ventas': perfil.puede_crear_ventas ?? true,
      'crear_gastos': perfil.puede_crear_gastos ?? true,
      'ver_caja': perfil.puede_ver_caja ?? true,
      'ver_reportes': perfil.puede_ver_reportes ?? true,
      'ver_remuneraciones': perfil.puede_ver_remuneraciones ?? true,
    } as Record<string, boolean | undefined>;

    if ((perfil.rol === 'emprendedor' || perfil.rol === 'dueño') && typeof flags[permiso] === 'boolean') {
      return flags[permiso];
    }

    return (ROL_PUEDE_HACER[perfil.rol] ?? []).includes(permiso);
  };

  return (
    <AuthContext.Provider value={{
      user, perfil, isLoading, signIn, register, signOut, puedeHacer, tienePermiso, recargarPerfil, actualizarPerfil,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);