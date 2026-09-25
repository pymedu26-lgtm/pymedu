-- ============================================
-- PymEdu - 14. ROLES PYME / PEQUEÑA EMPRESA
-- Pegar en: Supabase Dashboard > SQL Editor > New Query
-- (Debe ejecutarse DESPUÉS de 04-supabase-migracion.sql
--  y 06-vinculacion-instituciones.sql)
-- ============================================
-- Extiende la estructura de roles según la guía
-- ESTRUCTURA_ROLES.txt:
--
--   SUPERADMIN {
--     ADMINISTRADOR INSTITUCIONAL (1..n) {
--       COORDINADOR, MENTOR, EMPRENDEDOR
--     },
--     EMPRENDEDOR{},
--     PYME / PEQUEÑA EMPRESA {
--       VAR1, VAR2, VAR3   <- roles que el Administrador
--                              de la PYME puede crear/asignar
--                              (ej: Vendedor/Cajero, Gestor,
--                               Enc. RRHH, Empleado, Contador)
--     }
--   }
--
-- Esto habilita:
--   1) Códigos de invitación con roles PYME.
--   2) Matriz completa de permisos (verificar_permiso).
--   3) Catálogo público de roles definibles por el dueño.
-- ============================================

-- ============================================
-- 1. CÓDIGOS DE INVITACIÓN ACEPTAN ROLES PYME
-- ============================================
ALTER TABLE codigos_invitacion DROP CONSTRAINT IF EXISTS codigos_invitacion_rol_check;
ALTER TABLE codigos_invitacion ADD CONSTRAINT codigos_invitacion_rol_check CHECK (rol IN (
  'emprendedor', 'dueño', 'mentor', 'coordinador',
  'vendedor', 'gestor', 'encargado_rrhh', 'empleado', 'contador_externo'
));

-- ============================================
-- 2. FUNCIÓN: VERIFICAR PERMISO (matriz completa)
-- ============================================
CREATE OR REPLACE FUNCTION public.verificar_permiso(usuario_id UUID, permiso TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  usuario_rol TEXT;
BEGIN
  SELECT rol INTO usuario_rol FROM perfiles WHERE id = usuario_id AND activo = true;

  IF usuario_rol IS NULL OR usuario_rol = '' THEN
    RETURN FALSE;
  END IF;

  -- SuperAdmin y Demo tienen todos los permisos
  IF usuario_rol IN ('superadmin', 'demo') THEN RETURN TRUE; END IF;

  -- Admin Institucional tiene casi todos, salvo config global
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
-- 3. CATÁLOGO: ROLES DEFINIBLES POR UNA PYME
--    (los VAR1, VAR2 y VAR3 de la guía)
-- ============================================
CREATE OR REPLACE FUNCTION public.roles_definibles_por_pyme()
RETURNS TABLE (
  rol TEXT,
  etiqueta TEXT,
  guia TEXT,
  descripcion TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM (VALUES
    ('dueño',            'Dueño / Administrador de la PYME', NULL,   'Gestiona el negocio completo y define los roles de su equipo.'),
    ('vendedor',         'Vendedor / Cajero',                'VAR1', 'Rol comercial de la PYME: registra ventas y atiende clientes.'),
    ('gestor',           'Gestor',                           'VAR2', 'Operaciones de la PYME: inventario, caja, promociones y reportes.'),
    ('encargado_rrhh',   'Encargado de RRHH',                'VAR3', 'Administra remuneraciones y equipo de la PYME.'),
    ('empleado',         'Empleado',                         'VAR3', 'Miembro del equipo: acceso a su perfil y remuneraciones.'),
    ('contador_externo', 'Contador externo',                 'VAR3', 'Profesional externo: caja, reportes y contabilidad de la PYME.')
  ) AS t(rol, etiqueta, guia, descripcion);
$$;

-- ============================================
-- 4. PERMISOS
-- ============================================
GRANT EXECUTE ON FUNCTION public.verificar_permiso(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.roles_definibles_por_pyme() TO authenticated;

-- ============================================
-- 5. VERIFICACIÓN
-- ============================================
-- SELECT * FROM public.roles_definibles_por_pyme();
-- SELECT public.verificar_permiso('bb16d8a2-511b-4d3e-8d1d-000000000001', 'crear_ventas');