-- ============================================
-- PymEdu - Vinculación de usuarios a instituciones
-- Pegar en: Supabase Dashboard > SQL Editor > New Query
-- (Debe ejecutarse DESPUÉS de 04-supabase-migracion.sql)
-- ============================================
-- Flujos soportados:
--   1) SOLICITAR: el usuario elige una institución al registrarse
--      (raw_user_meta_data.institucion_id) -> se crea una solicitud
--      pendiente que el Admin Institucional aprueba o rechaza.
--   2) INVITACIÓN: el Admin genera un código (codigos_invitacion), el
--      usuario lo canjea al registrarse (raw_user_meta_data.codigo_invitacion)
--      y queda vinculado inmediatamente con el rol del código.
-- ============================================

-- ============================================
-- 1. TABLA DE SOLICITUDES DE VINCULACIÓN
-- ============================================
CREATE TABLE IF NOT EXISTS solicitudes_vinculacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  institucion_id UUID NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada', 'cancelada')),
  mensaje TEXT,
  respondida_por UUID REFERENCES perfiles(id) ON DELETE SET NULL,
  respondida_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (usuario_id, institucion_id)
);

-- ============================================
-- 2. TABLA DE CÓDIGOS DE INVITACIÓN
-- ============================================
CREATE TABLE IF NOT EXISTS codigos_invitacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institucion_id UUID NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL UNIQUE,
  rol TEXT NOT NULL DEFAULT 'emprendedor' CHECK (rol IN ('emprendedor', 'dueño', 'mentor', 'coordinador', 'vendedor', 'gestor', 'encargado_rrhh', 'empleado', 'contador_externo')),
  reporta_a UUID REFERENCES perfiles(id) ON DELETE SET NULL,
  usos_max INT NOT NULL DEFAULT 1 CHECK (usos_max >= 1),
  usos_actuales INT NOT NULL DEFAULT 0 CHECK (usos_actuales >= 0),
  activo BOOLEAN NOT NULL DEFAULT true,
  expira_at TIMESTAMPTZ,
  creado_por UUID REFERENCES perfiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 3. ÍNDICES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_solicitudes_institucion ON solicitudes_vinculacion(institucion_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_usuario ON solicitudes_vinculacion(usuario_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_estado ON solicitudes_vinculacion(estado);
CREATE INDEX IF NOT EXISTS idx_codigos_invitacion_institucion ON codigos_invitacion(institucion_id);
CREATE INDEX IF NOT EXISTS idx_codigos_invitacion_activo ON codigos_invitacion(activo);

-- ============================================
-- 4. TRIGGERS updated_at
-- ============================================
DROP TRIGGER IF EXISTS update_solicitudes_updated_at ON solicitudes_vinculacion;
CREATE TRIGGER update_solicitudes_updated_at BEFORE UPDATE ON solicitudes_vinculacion
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE solicitudes_vinculacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE codigos_invitacion ENABLE ROW LEVEL SECURITY;

-- Helper anti-recursion: en PostgreSQL 15+ el owner de la tabla ya NO exime
-- de RLS, por eso los SELECT anidados dentro de policies propagan recursion
-- entre perfiles <-> solicitudes_vinculacion (42P17). Estos helpers corren
-- con row_security = off para romper el ciclo.
CREATE OR REPLACE FUNCTION public.es_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'superadmin');
$$;
GRANT EXECUTE ON FUNCTION public.es_superadmin() TO authenticated;

-- Cualquier usuario autenticado puede ver instituciones activas
-- (para buscarlas y solicitar vinculación desde el panel)
DROP POLICY IF EXISTS "all_read_instituciones" ON instituciones;
CREATE POLICY "all_read_instituciones" ON instituciones FOR SELECT
  USING (activa = true);

-- ----- Solicitudes de vinculación -----
DROP POLICY IF EXISTS "sol_superadmin" ON solicitudes_vinculacion;
CREATE POLICY "sol_superadmin" ON solicitudes_vinculacion FOR ALL
  USING (public.es_superadmin());

-- Admin Institucional: ve y gestiona las solicitudes de SU institución
DROP POLICY IF EXISTS "sol_admin" ON solicitudes_vinculacion;
CREATE POLICY "sol_admin" ON solicitudes_vinculacion FOR ALL
  USING (institucion_id = public.usuario_institucion())
  WITH CHECK (institucion_id = public.usuario_institucion());

-- Usuario: solo ve sus propias solicitudes
DROP POLICY IF EXISTS "sol_owner_select" ON solicitudes_vinculacion;
CREATE POLICY "sol_owner_select" ON solicitudes_vinculacion FOR SELECT
  USING (usuario_id = auth.uid());

DROP POLICY IF EXISTS "sol_owner_insert" ON solicitudes_vinculacion;
CREATE POLICY "sol_owner_insert" ON solicitudes_vinculacion FOR INSERT
  WITH CHECK (usuario_id = auth.uid());

-- El Admin debe poder ver el perfil de quien SOLICITA (aún sin institución)
DROP POLICY IF EXISTS "admin_ve_solicitantes" ON perfiles;
CREATE POLICY "admin_ve_solicitantes" ON perfiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM solicitudes_vinculacion s
      WHERE s.usuario_id = perfiles.id
        AND s.institucion_id = public.usuario_institucion()
        AND s.estado = 'pendiente'
    )
  );

-- ----- Códigos de invitación -----
DROP POLICY IF EXISTS "cod_superadmin" ON codigos_invitacion;
CREATE POLICY "cod_superadmin" ON codigos_invitacion FOR ALL
  USING (public.es_superadmin());

-- Admin Institucional: lista los códigos de SU institución
-- (crear/desactivar se hace vía función SECURITY DEFINER)
DROP POLICY IF EXISTS "cod_admin_select" ON codigos_invitacion;
CREATE POLICY "cod_admin_select" ON codigos_invitacion FOR SELECT
  USING (institucion_id = public.usuario_institucion());

-- ============================================
-- 6. FUNCIÓN: Buscar instituciones (permite anon para el registro)
-- ============================================
DROP FUNCTION IF EXISTS public.buscar_instituciones(TEXT);
CREATE OR REPLACE FUNCTION public.buscar_instituciones(busqueda TEXT DEFAULT '')
RETURNS TABLE (id UUID, nombre TEXT, rubro TEXT, region TEXT, comuna TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.nombre, i.rubro, i.region, i.comuna
  FROM instituciones i
  WHERE i.activa = true
    AND (busqueda = '' OR lower(i.nombre) LIKE '%' || lower(busqueda) || '%')
  ORDER BY i.nombre
  LIMIT 8;
$$;

-- ============================================
-- 7. FUNCIÓN: Aprobar/Rechazar solicitud de vinculación
-- ============================================
CREATE OR REPLACE FUNCTION public.aprobar_solicitud(p_solicitud_id UUID, p_aprobada BOOLEAN)
RETURNS BOOLEAN AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_rol TEXT;
  v_inst UUID;
  v_sol RECORD;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'sin_autenticacion'; END IF;

  SELECT rol, institucion_id INTO v_rol, v_inst FROM public.perfiles WHERE id = v_actor;
  IF v_rol NOT IN ('superadmin', 'admin_institucional') THEN
    RAISE EXCEPTION 'sin_permiso';
  END IF;

  SELECT * INTO v_sol FROM public.solicitudes_vinculacion WHERE id = p_solicitud_id;
  IF v_sol.usuario_id IS NULL THEN RAISE EXCEPTION 'solicitud_no_encontrada'; END IF;
  IF v_rol = 'admin_institucional' AND v_inst IS DISTINCT FROM v_sol.institucion_id THEN
    RAISE EXCEPTION 'sin_permiso';
  END IF;

  IF p_aprobada THEN
    UPDATE public.perfiles SET
      institucion_id = v_sol.institucion_id,
      reporta_a = CASE WHEN v_rol = 'admin_institucional' THEN v_actor ELSE NULL END
    WHERE id = v_sol.usuario_id;

    UPDATE public.solicitudes_vinculacion
      SET estado = 'aprobada', respondida_por = v_actor, respondida_at = now()
      WHERE id = p_solicitud_id;
  ELSE
    UPDATE public.solicitudes_vinculacion
      SET estado = 'rechazada', respondida_por = v_actor, respondida_at = now()
      WHERE id = p_solicitud_id;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. FUNCIÓN: Generar código de invitación
-- ============================================
CREATE OR REPLACE FUNCTION public.generar_codigo_invitacion(
  p_institucion_id UUID,
  p_rol TEXT DEFAULT 'emprendedor',
  p_usos_max INT DEFAULT 1
) RETURNS TEXT AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_rol TEXT;
  v_inst UUID;
  v_codigo TEXT;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'sin_autenticacion'; END IF;

  SELECT rol, institucion_id INTO v_rol, v_inst FROM public.perfiles WHERE id = v_actor;
  IF v_rol NOT IN ('superadmin', 'admin_institucional') THEN
    RAISE EXCEPTION 'sin_permiso';
  END IF;
  IF v_rol = 'admin_institucional' AND v_inst IS DISTINCT FROM p_institucion_id THEN
    RAISE EXCEPTION 'sin_permiso';
  END IF;

  v_codigo := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  INSERT INTO public.codigos_invitacion (institucion_id, codigo, rol, usos_max, creado_por)
  VALUES (p_institucion_id, v_codigo, p_rol, p_usos_max, v_actor);

  RETURN v_codigo;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 9. FUNCIÓN: Desactivar código de invitación
-- ============================================
CREATE OR REPLACE FUNCTION public.desactivar_codigo(p_codigo_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_rol TEXT;
  v_inst UUID;
  v_codigo RECORD;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'sin_autenticacion'; END IF;

  SELECT rol, institucion_id INTO v_rol, v_inst FROM public.perfiles WHERE id = v_actor;
  IF v_rol NOT IN ('superadmin', 'admin_institucional') THEN
    RAISE EXCEPTION 'sin_permiso';
  END IF;

  SELECT * INTO v_codigo FROM public.codigos_invitacion WHERE id = p_codigo_id;
  IF v_codigo.id IS NULL THEN RAISE EXCEPTION 'codigo_no_encontrado'; END IF;
  IF v_rol = 'admin_institucional' AND v_inst IS DISTINCT FROM v_codigo.institucion_id THEN
    RAISE EXCEPTION 'sin_permiso';
  END IF;

  UPDATE public.codigos_invitacion SET activo = false WHERE id = p_codigo_id;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 10. TRIGGER: Vincular perfil al registrarse
--     Reescribe handle_new_user para soportar:
--       - raw_user_meta_data.codigo_invitacion  -> vinculación inmediata
--       - raw_user_meta_data.institucion_id     -> solicitud pendiente
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_inst_raw TEXT;
  v_inst UUID;
  v_codigo TEXT;
  v_inv RECORD;
  v_usado_codigo BOOLEAN := false;
BEGIN
  -- Perfil base (si esto falla, el registro se aborta como es correcto)
  INSERT INTO public.perfiles (id, email, nombre_completo, rol)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'rol', 'emprendedor')
  );

  -- La vinculación es opcional: un fallo aquí NUNCA debe bloquear la creación de la cuenta
  BEGIN
    -- 1) Vinculación inmediata por código de invitación
    v_codigo := upper(btrim(COALESCE(NEW.raw_user_meta_data->>'codigo_invitacion', '')));
    IF v_codigo <> '' THEN
      SELECT * INTO v_inv FROM public.codigos_invitacion
      WHERE codigo = v_codigo AND activo = true
        AND (expira_at IS NULL OR expira_at > now())
        AND usos_actuales < usos_max
      FOR UPDATE;

      IF v_inv.id IS NOT NULL THEN
        UPDATE public.perfiles SET
          institucion_id = v_inv.institucion_id,
          reporta_a = v_inv.reporta_a,
          rol = v_inv.rol
        WHERE id = NEW.id;

        UPDATE public.codigos_invitacion
        SET usos_actuales = usos_actuales + 1,
            activo = (usos_actuales + 1) < usos_max
        WHERE id = v_inv.id;

        v_usado_codigo := true;
      END IF;
    END IF;

    -- 2) Institución elegida directamente -> solicitud pendiente
    --    (solo si no quedó vinculado por código)
    IF NOT v_usado_codigo THEN
      v_inst_raw := btrim(COALESCE(NEW.raw_user_meta_data->>'institucion_id', ''));
      IF v_inst_raw ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_inst := v_inst_raw::uuid;
        INSERT INTO public.solicitudes_vinculacion (usuario_id, institucion_id)
        VALUES (NEW.id, v_inst)
        ON CONFLICT (usuario_id, institucion_id) DO NOTHING;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 11. PERMISOS
-- ============================================
GRANT EXECUTE ON FUNCTION public.buscar_instituciones(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aprobar_solicitud(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generar_codigo_invitacion(UUID, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.desactivar_codigo(UUID) TO authenticated;

-- ============================================
-- 12. SECCIÓN "MI INSTITUCIÓN" (panel del emprendedor)
-- ============================================

-- El usuario puede cancelar su propia solicitud pendiente
DROP POLICY IF EXISTS "sol_owner_update" ON solicitudes_vinculacion;
CREATE POLICY "sol_owner_update" ON solicitudes_vinculacion FOR UPDATE
  USING (usuario_id = auth.uid() AND estado = 'pendiente')
  WITH CHECK (usuario_id = auth.uid() AND estado IN ('pendiente', 'cancelada'));

-- 12.1 FUNCIÓN: Estado de vinculación del usuario autenticado
CREATE OR REPLACE FUNCTION public.mi_vinculacion()
RETURNS TABLE (
  institucion_id UUID,
  institucion_nombre TEXT,
  institucion_rubro TEXT,
  institucion_region TEXT,
  institucion_comuna TEXT,
  institucion_direccion TEXT,
  institucion_logo_url TEXT,
  jefe_id UUID,
  jefe_nombre TEXT,
  solicitud_id UUID,
  solicitud_estado TEXT,
  solicitud_institucion_id UUID,
  solicitud_institucion_nombre TEXT,
  solicitud_created_at TIMESTAMPTZ,
  solicitud_respondida_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.institucion_id,
    i.nombre, i.rubro, i.region, i.comuna, i.direccion, i.logo_url,
    p.reporta_a,
    j.nombre_completo,
    s.id,
    s.estado,
    s.institucion_id,
    si.nombre,
    s.created_at,
    s.respondida_at
  FROM perfiles p
  LEFT JOIN instituciones i ON i.id = p.institucion_id
  LEFT JOIN perfiles j ON j.id = p.reporta_a
  LEFT JOIN LATERAL (
    SELECT * FROM solicitudes_vinculacion sv
    WHERE sv.usuario_id = p.id
    ORDER BY sv.created_at DESC
    LIMIT 1
  ) s ON true
  LEFT JOIN instituciones si ON si.id = s.institucion_id
  WHERE p.id = auth.uid();
$$;

-- 12.2 FUNCIÓN: Canjear código de invitación (para cuentas ya creadas)
CREATE OR REPLACE FUNCTION public.redimir_codigo(p_codigo TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_inv RECORD;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'sin_autenticacion'; END IF;

  IF EXISTS (SELECT 1 FROM public.perfiles WHERE id = v_actor AND institucion_id IS NOT NULL) THEN
    RAISE EXCEPTION 'ya_vinculado';
  END IF;

  SELECT * INTO v_inv FROM public.codigos_invitacion
  WHERE codigo = upper(btrim(p_codigo)) AND activo = true
    AND (expira_at IS NULL OR expira_at > now())
    AND usos_actuales < usos_max
  FOR UPDATE;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'codigo_invalido';
  END IF;

  UPDATE public.perfiles SET
    institucion_id = v_inv.institucion_id,
    reporta_a = v_inv.reporta_a,
    rol = v_inv.rol
  WHERE id = v_actor;

  UPDATE public.codigos_invitacion
  SET usos_actuales = usos_actuales + 1,
      activo = (usos_actuales + 1) < usos_max
  WHERE id = v_inv.id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 13. PERMISOS (sección "Mi institución")
-- ============================================
GRANT EXECUTE ON FUNCTION public.mi_vinculacion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.redimir_codigo(TEXT) TO authenticated;