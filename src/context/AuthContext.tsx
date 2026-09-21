import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, setToken } from '../lib/api';

export type Rol =
  | 'superadmin'
  | 'admin_institucional'
  | 'coordinador'
  | 'mentor'
  | 'emprendedor'
  | 'dueño'
  | 'vendedor'
  | 'gestor'
  | 'encargado_rrhh'
  | 'empleado'
  | 'contador_externo'
  | 'demo';

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
  recargarPerfil: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, perfil: null, isLoading: true,
  signIn: async () => { throw new Error('AuthContext no inicializado'); },
  register: async () => { throw new Error('AuthContext no inicializado'); },
  signOut: async () => {},
  puedeHacer: () => false,
  recargarPerfil: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const aplicarPerfil = (p: Perfil) => {
    setPerfil(p);
    setUser(p ? { id: p.id, email: p.email } : null);
  };

  // Restaura la sesion desde el token guardado en localStorage
  useEffect(() => {
    let active = true;
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

  const puedeHacer = (permiso: string): boolean => {
    if (!perfil) return false;
    if (perfil.rol === 'superadmin') return true;
    if (perfil.rol === 'admin_institucional') return true;
    if (perfil.rol === 'demo') return true;

    const flags = {
      'crear_ventas': perfil.puede_crear_ventas ?? true,
      'crear_gastos': perfil.puede_crear_gastos ?? true,
      'ver_caja': perfil.puede_ver_caja ?? true,
      'ver_reportes': perfil.puede_ver_reportes ?? true,
      'ver_remuneraciones': perfil.puede_ver_remuneraciones ?? true,
    } as Record<string, boolean | undefined>;

    switch (perfil.rol) {
      case 'coordinador':
        return ['ver_mentores', 'ver_emprendedores', 'gestionar_programas'].includes(permiso);
      case 'mentor':
        return ['ver_mis_emprendedores', 'editar_seguimiento', 'ver_academia'].includes(permiso);
      case 'emprendedor':
      case 'dueño':
        // El dueño del negocio siempre puede registrar ventas y gastos.
        if (permiso === 'crear_ventas' || permiso === 'crear_gastos') return true;
        if (typeof flags[permiso] === 'boolean') return flags[permiso];
        return [
          'ver_mi_perfil', 'editar_mi_negocio', 'ver_academia',
          'ver_inventario', 'ver_clientes', 'ver_proveedores',
          'ver_promociones', 'ver_equipo', 'ver_organigrama',
          'ver_documentos', 'ver_mercados_publicos', 'ver_mentorias',
        ].includes(permiso);
      case 'vendedor':
        return ['crear_ventas', 'ver_clientes', 'ver_mi_perfil'].includes(permiso);
      case 'gestor':
        return [
          'crear_ventas', 'crear_gastos', 'ver_inventario', 'ver_caja',
          'ver_clientes', 'ver_proveedores', 'ver_promociones', 'ver_reportes',
          'ver_mi_perfil', 'ver_academia',
        ].includes(permiso);
      case 'encargado_rrhh':
        return [
          'ver_remuneraciones', 'editar_remuneraciones', 'ver_empleados',
          'ver_equipo', 'ver_organigrama', 'ver_documentos', 'ver_mi_perfil',
        ].includes(permiso);
      case 'empleado':
        return ['ver_mi_perfil', 'ver_remuneraciones', 'ver_academia'].includes(permiso);
      case 'contador_externo':
        return [
          'ver_caja', 'ver_reportes', 'ver_reportes_fiscales', 'ver_contabilidad',
          'ver_clientes', 'ver_proveedores', 'ver_inventario', 'ver_mi_perfil',
        ].includes(permiso);
      default:
        return false;
    }
  };

  return (
    <AuthContext.Provider value={{
      user, perfil, isLoading, signIn, register, signOut, puedeHacer, recargarPerfil,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);