-- ============================================
-- PymEdu - Estructura de Base de Datos
-- Sistema jerárquico de roles para 10K+ usuarios
-- ============================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 1. TABLA DE INSTITUCIONES (Tenants)
-- ============================================
CREATE TABLE instituciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  rut TEXT UNIQUE,
  rubro TEXT,
  region TEXT,
  comuna TEXT,
  direccion TEXT,
  logo_url TEXT,
  activa BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. TABLA DE USUARIOS/PERFILES
-- ============================================
CREATE TABLE perfiles (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nombre_completo TEXT NOT NULL,
  
  -- Jerarquía de roles
  rol TEXT NOT NULL CHECK (rol IN (
    'superadmin', 'admin_institucional', 'coordinador', 
    'mentor', 'emprendedor', 'dueño', 'vendedor', 
    'gestor', 'encargado_rrhh', 'empleado', 'contador_externo',
    'demo'
  )),
  
  -- Relación jerárquica (quién es el jefe directo)
  institucion_id UUID REFERENCES instituciones(id) ON DELETE SET NULL,
  reporta_a UUID REFERENCES perfiles(id) ON DELETE SET NULL,
  
  -- Permisos granulares
  puede_ver_remuneraciones BOOLEAN DEFAULT false,
  puede_ver_caja BOOLEAN DEFAULT false,
  puede_ver_reportes BOOLEAN DEFAULT false,
  puede_crear_ventas BOOLEAN DEFAULT true,
  puede_crear_gastos BOOLEAN DEFAULT true,
  
  -- Notificaciones
  notif_email BOOLEAN DEFAULT true,
  notif_push BOOLEAN DEFAULT false,
  push_token TEXT,
  
  -- Estado
  activo BOOLEAN DEFAULT true,
  acceso_revocado_at TIMESTAMPTZ,
  
  -- Metadatos del negocio (para emprendedores/dueños)
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
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. TABLA DE PROGRAMAS
-- ============================================
CREATE TABLE programas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institucion_id UUID NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. RELACIÓN USUARIO-PROGRAMA (Muchos a Muchos)
-- ============================================
CREATE TABLE usuario_programas (
  usuario_id UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  programa_id UUID NOT NULL REFERENCES programas(id) ON DELETE CASCADE,
  rol_en_programa TEXT DEFAULT 'emprendedor',
  fecha_asignacion TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (usuario_id, programa_id)
);

-- ============================================
-- 5. TABLA DE SESIONES (para auth local)
-- ============================================
CREATE TABLE sesiones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. ÍNDICES PARA PERFORMANCE
-- ============================================
-- Perfiles
CREATE INDEX idx_perfiles_institucion ON perfiles(institucion_id);
CREATE INDEX idx_perfiles_rol ON perfiles(rol);
CREATE INDEX idx_perfiles_reporta ON perfiles(reporta_a);
CREATE INDEX idx_perfiles_email ON perfiles(email);
CREATE INDEX idx_perfiles_activo ON perfiles(activo);

-- Programas
CREATE INDEX idx_programas_institucion ON programas(institucion_id);

-- Usuario-Programas
CREATE INDEX idx_usuario_programas_usuario ON usuario_programas(usuario_id);
CREATE INDEX idx_usuario_programas_programa ON usuario_programas(programa_id);

-- Sesiones
CREATE INDEX idx_sesiones_usuario ON sesiones(usuario_id);
CREATE INDEX idx_sesiones_token ON sesiones(token);
CREATE INDEX idx_sesiones_expires ON sesiones(expires_at);

-- ============================================
-- 7. FUNCIÓN PARA ACTUALIZAR updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
CREATE TRIGGER update_perfiles_updated_at BEFORE UPDATE ON perfiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_instituciones_updated_at BEFORE UPDATE ON instituciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_programas_updated_at BEFORE UPDATE ON programas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 8. VISTA PARA JERARQUÍA COMPLETA
-- ============================================
CREATE OR REPLACE VIEW vista_jerarquia AS
SELECT 
  p.id,
  p.email,
  p.nombre_completo,
  p.rol,
  i.nombre AS institucion_nombre,
  jefe.nombre_completo AS jefe_nombre,
  jefe.rol AS jefe_rol,
  p.activo,
  p.created_at
FROM perfiles p
LEFT JOIN instituciones i ON p.institucion_id = i.id
LEFT JOIN perfiles jefe ON p.reporta_a = jefe.id;

-- ============================================
-- 9. FUNCIÓN PARA OBTENER SUBORDINADOS
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
    -- Caso base: el usuario actual
    SELECT 
      p.id,
      p.email,
      p.nombre_completo,
      p.rol,
      0 as nivel
    FROM perfiles p
    WHERE p.id = usuario_id
    
    UNION ALL
    
    -- Caso recursivo: los subordinados directos
    SELECT 
      sub.id,
      sub.email,
      sub.nombre_completo,
      sub.rol,
      j.nivel + 1
    FROM perfiles sub
    INNER JOIN jerarquia j ON sub.reporta_a = j.id
  )
  SELECT 
    j.id,
    j.email,
    j.nombre_completo,
    j.rol,
    j.nivel
  FROM jerarquia j
  WHERE j.id != usuario_id
  ORDER BY j.nivel, j.nombre_completo;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 10. FUNCIÓN PARA VERIFICAR PERMISOS
-- ============================================
CREATE OR REPLACE FUNCTION verificar_permiso(
  usuario_id UUID,
  permiso TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  usuario_rol TEXT;
BEGIN
  -- Obtener el rol del usuario
  SELECT rol INTO usuario_rol
  FROM perfiles
  WHERE id = usuario_id AND activo = true;
  
  -- SuperAdmin tiene todos los permisos
  IF usuario_rol = 'superadmin' THEN
    RETURN TRUE;
  END IF;
  
  -- Cuenta demo tiene acceso a todos los roles
  IF usuario_rol = 'demo' THEN
    RETURN TRUE;
  END IF;
  
  -- Admin Institucional tiene la mayoría de permisos
  IF usuario_rol = 'admin_institucional' THEN
    RETURN permiso NOT IN ('config_global', 'gestionar_planes', 'ver_auditoria_global');
  END IF;
  
  -- Verificar permisos específicos por rol
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
$$ LANGUAGE plpgsql;