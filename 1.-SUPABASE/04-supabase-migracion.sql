-- ============================================
-- PymEdu - Migración Completa para Supabase
-- Pegar en: Supabase Dashboard > SQL Editor > New Query
-- ============================================

-- ============================================
-- 1. TABLA DE INSTITUCIONES
-- ============================================
CREATE TABLE IF NOT EXISTS instituciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  rut TEXT UNIQUE,
  rubro TEXT,
  region TEXT,
  comuna TEXT,
  direccion TEXT,
  logo_url TEXT,
  activa BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 2. TABLA DE PERFILES (extiende auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS perfiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nombre_completo TEXT NOT NULL,
  
  -- Jerarquía
  rol TEXT NOT NULL CHECK (rol IN (
    'superadmin', 'admin_institucional', 'coordinador', 
    'mentor', 'emprendedor', 'dueño', 'vendedor', 
    'gestor', 'encargado_rrhh', 'empleado', 'contador_externo',
    'demo'
  )),
  institucion_id UUID REFERENCES instituciones(id) ON DELETE SET NULL,
  reporta_a UUID REFERENCES perfiles(id) ON DELETE SET NULL,
  
  -- Permisos granulares
  puede_ver_remuneraciones BOOLEAN DEFAULT false,
  puede_ver_caja BOOLEAN DEFAULT false,
  puede_ver_reportes BOOLEAN DEFAULT false,
  puede_crear_ventas BOOLEAN DEFAULT true,
  puede_crear_gastos BOOLEAN DEFAULT true,
  
  -- Estado
  activo BOOLEAN DEFAULT true,
  acceso_revocado_at TIMESTAMPTZ,
  
  -- Negocio (emprendedores/dueños)
  negocio_nombre TEXT,
  negocio_rut TEXT,
  negocio_rubro TEXT,
  negocio_giro TEXT,
  negocio_actividad TEXT,
  negocio_region TEXT,
  negocio_comuna TEXT,
  negocio_direccion TEXT,
  
  -- Membresía
  membresia_nivel TEXT DEFAULT 'free' CHECK (membresia_nivel IN ('free', 'pro', 'premium')),
  membresia_expira TIMESTAMPTZ,
  segmento_negocio TEXT DEFAULT 'C' CHECK (segmento_negocio IN ('A', 'B', 'C')),
  
  -- Avatar
  logo_url TEXT,
  avatar_url TEXT,
  
  -- Notificaciones
  notif_email BOOLEAN DEFAULT true,
  notif_push BOOLEAN DEFAULT false,
  push_token TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 3. PROGRAMAS
-- ============================================
CREATE TABLE IF NOT EXISTS programas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institucion_id UUID NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 4. USUARIO-PROGRAMA
-- ============================================
CREATE TABLE IF NOT EXISTS usuario_programas (
  usuario_id UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  programa_id UUID NOT NULL REFERENCES programas(id) ON DELETE CASCADE,
  rol_en_programa TEXT DEFAULT 'emprendedor',
  fecha_asignacion TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (usuario_id, programa_id)
);

-- ============================================
-- 5. ÍNDICES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_perfiles_institucion ON perfiles(institucion_id);
CREATE INDEX IF NOT EXISTS idx_perfiles_rol ON perfiles(rol);
CREATE INDEX IF NOT EXISTS idx_perfiles_reporta ON perfiles(reporta_a);
CREATE INDEX IF NOT EXISTS idx_perfiles_email ON perfiles(email);
CREATE INDEX IF NOT EXISTS idx_perfiles_activo ON perfiles(activo);
CREATE INDEX IF NOT EXISTS idx_programas_institucion ON programas(institucion_id);

-- ============================================
-- 6. FUNCIÓN updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_perfiles_updated_at ON perfiles;
CREATE TRIGGER update_perfiles_updated_at BEFORE UPDATE ON perfiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_instituciones_updated_at ON instituciones;
CREATE TRIGGER update_instituciones_updated_at BEFORE UPDATE ON instituciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_programas_updated_at ON programas;
CREATE TRIGGER update_programas_updated_at BEFORE UPDATE ON programas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 7. FUNCIÓN: Obtener subordinados recursivamente
-- ============================================
CREATE OR REPLACE FUNCTION obtener_subordinados(usuario_id UUID)
RETURNS TABLE (
  id UUID,
  email TEXT,
  nombre_completo TEXT,
  rol TEXT,
  nivel INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE jerarquia AS (
    SELECT p.id, p.email, p.nombre_completo, p.rol, 0 as nivel
    FROM perfiles p WHERE p.id = usuario_id
    UNION ALL
    SELECT sub.id, sub.email, sub.nombre_completo, sub.rol, j.nivel + 1
    FROM perfiles sub
    INNER JOIN jerarquia j ON sub.reporta_a = j.id
  )
  SELECT j.id, j.email, j.nombre_completo, j.rol, j.nivel
  FROM jerarquia j
  WHERE j.id != usuario_id
  ORDER BY j.nivel, j.nombre_completo;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. FUNCIÓN: Verificar permiso
-- ============================================
CREATE OR REPLACE FUNCTION verificar_permiso(usuario_id UUID, permiso TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  usuario_rol TEXT;
BEGIN
  SELECT rol INTO usuario_rol FROM perfiles WHERE id = usuario_id AND activo = true;
  IF usuario_rol = 'superadmin' THEN RETURN TRUE; END IF;
  IF usuario_rol = 'demo' THEN RETURN TRUE; END IF;
  IF usuario_rol = 'admin_institucional' THEN
    RETURN permiso NOT IN ('config_global', 'gestionar_planes', 'ver_auditoria_global');
  END IF;
  RETURN CASE
    WHEN usuario_rol = 'coordinador' AND permiso IN ('ver_mentores', 'ver_emprendedores', 'gestionar_programas') THEN TRUE
    WHEN usuario_rol = 'mentor' AND permiso IN ('ver_mis_emprendedores', 'editar_seguimiento', 'ver_academia') THEN TRUE
    WHEN usuario_rol IN ('emprendedor', 'dueño') AND permiso IN ('ver_mi_perfil', 'editar_mi_negocio', 'ver_academia', 'ver_inventario', 'ver_clientes', 'ver_proveedores', 'ver_promociones', 'ver_equipo', 'ver_organigrama', 'ver_documentos', 'ver_mercados_publicos', 'ver_mentorias') THEN TRUE
    WHEN usuario_rol = 'vendedor' AND permiso IN ('crear_ventas', 'ver_clientes', 'ver_mi_perfil') THEN TRUE
    WHEN usuario_rol = 'gestor' AND permiso IN ('crear_ventas', 'crear_gastos', 'ver_inventario', 'ver_caja', 'ver_clientes', 'ver_proveedores', 'ver_promociones', 'ver_reportes', 'ver_mi_perfil', 'ver_academia') THEN TRUE
    WHEN usuario_rol = 'encargado_rrhh' AND permiso IN ('ver_remuneraciones', 'editar_remuneraciones', 'ver_empleados', 'ver_equipo', 'ver_organigrama', 'ver_documentos', 'ver_mi_perfil') THEN TRUE
    WHEN usuario_rol = 'empleado' AND permiso IN ('ver_mi_perfil', 'ver_remuneraciones', 'ver_academia') THEN TRUE
    WHEN usuario_rol = 'contador_externo' AND permiso IN ('ver_caja', 'ver_reportes', 'ver_reportes_fiscales', 'ver_contabilidad', 'ver_clientes', 'ver_proveedores', 'ver_inventario', 'ver_mi_perfil') THEN TRUE
    ELSE FALSE
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 9. ROW LEVEL SECURITY (RLS)
-- ============================================

-- Función auxiliar: institución del usuario autenticado
-- (SECURITY DEFINER + row_security=off para evitar recursion infinita:
--  en PostgreSQL 15+ el owner ya NO queda eximido de RLS en consultas anidadas)
CREATE OR REPLACE FUNCTION public.usuario_institucion()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT institucion_id FROM perfiles WHERE id = auth.uid();
$$;

ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE instituciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE programas ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuario_programas ENABLE ROW LEVEL SECURITY;

-- SuperAdmin: ve todo
DROP POLICY IF EXISTS "superadmin_all" ON perfiles;
CREATE POLICY "superadmin_all" ON perfiles FOR ALL
  USING (rol = 'superadmin');
DROP POLICY IF EXISTS "superadmin_all_inst" ON instituciones;
CREATE POLICY "superadmin_all_inst" ON instituciones FOR ALL
  USING (true);
DROP POLICY IF EXISTS "superadmin_all_prog" ON programas;
CREATE POLICY "superadmin_all_prog" ON programas FOR ALL
  USING (true);
DROP POLICY IF EXISTS "superadmin_all_up" ON usuario_programas;
CREATE POLICY "superadmin_all_up" ON usuario_programas FOR ALL
  USING (true);

-- Admin Institucional: ve su institución
DROP POLICY IF EXISTS "admin_inst_own" ON perfiles;
CREATE POLICY "admin_inst_own" ON perfiles FOR SELECT
  USING (
    institucion_id = public.usuario_institucion()
    OR id = auth.uid()
  );

-- Coordinador: ve mentores y emprendedores de su institución
DROP POLICY IF EXISTS "coord_view" ON perfiles;
CREATE POLICY "coord_view" ON perfiles FOR SELECT
  USING (
    institucion_id = public.usuario_institucion()
    AND rol IN ('coordinador', 'mentor', 'emprendedor', 'dueño')
  );

-- Mentor: ve sus emprendedores asignados
DROP POLICY IF EXISTS "mentor_view" ON perfiles;
CREATE POLICY "mentor_view" ON perfiles FOR SELECT
  USING (
    reporta_a = auth.uid()
    OR id = auth.uid()
  );

-- Emprendedor: solo ve su perfil
DROP POLICY IF EXISTS "emprendedor_view" ON perfiles;
CREATE POLICY "emprendedor_view" ON perfiles FOR SELECT
  USING (id = auth.uid());

-- Programas: todos los autenticados pueden leer
DROP POLICY IF EXISTS "all_read_programas" ON programas;
CREATE POLICY "all_read_programas" ON programas FOR SELECT
  USING (true);

-- ============================================
-- 10. PERMISOS DE FUNCIONES
-- ============================================
GRANT EXECUTE ON FUNCTION public.usuario_institucion() TO authenticated;
GRANT EXECUTE ON FUNCTION obtener_subordinados(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION verificar_permiso(UUID, TEXT) TO authenticated;

-- ============================================
-- 11. FUNCIÓN: Crear perfil al registrarse
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfiles (id, email, nombre_completo, rol)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'rol', 'dueño')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 12. DATOS SEMILLA
-- ============================================
-- Instituciones
INSERT INTO instituciones (id, nombre, rut, rubro, region, comuna) VALUES
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Instituto San José', '76.123.456-7', 'Educación', 'Metropolitana', 'Santiago'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'Incubadora Innova', '76.234.567-8', 'Tecnología', 'Metropolitana', 'Providencia'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 'Universidad Católica', '76.345.678-9', 'Educación', 'Metropolitana', 'Ñuñoa')
ON CONFLICT (rut) DO NOTHING;

-- Programas
INSERT INTO programas (id, institucion_id, nombre, descripcion) VALUES
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Emprendimiento Juvenil', 'Programa de apoyo a jóvenes emprendedores'),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Sostenibilidad Local', 'Emprendimientos sustentables'),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'Innovación Digital', 'Transformación digital para PYMES')
ON CONFLICT DO NOTHING;