-- ============================================
-- 13. SUPERADMIN: CREAR USUARIOS
-- ============================================
-- Permite al superadmin crear una cuenta (auth) + su perfil con rol,
-- institucion y membresia (free/pro/premium) desde /admin/usuarios.
--
-- Notas de seguridad:
--  - SECURITY DEFINER + validacion de superadmin (como es_superadmin).
--  - Crea el auth.user (trigger on_auth_user_created crea el perfil) y
--    luego actualiza rol / institucion / membresia / permisos.
--  - No permite elegir rol 'superadmin' desde aca (evitar escalada).
--  - Los permisos puede_* se derivan de la membresia:
--      premium  -> reportes, caja, remuneraciones, ventas, gastos
--      pro      -> reportes, caja, ventas, gastos
--      free     -> ventas, gastos
-- ============================================

CREATE OR REPLACE FUNCTION public.admin_crear_usuario(
  p_email text,
  p_password text,
  p_nombre text,
  p_rol text,
  p_institucion_id uuid DEFAULT NULL,
  p_membresia text DEFAULT 'free',
  p_activo boolean DEFAULT true
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_uid uuid;
  v_email text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'superadmin') THEN
    RAISE EXCEPTION 'Solo un superadmin puede crear usuarios';
  END IF;

  v_email := lower(btrim(COALESCE(p_email, '')));
  IF v_email = '' OR v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' THEN
    RAISE EXCEPTION 'Email inválido';
  END IF;
  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'La contraseña debe tener al menos 6 caracteres';
  END IF;
  IF p_nombre IS NULL OR btrim(p_nombre) = '' THEN
    RAISE EXCEPTION 'Debes indicar el nombre';
  END IF;
  IF p_rol IS NULL OR p_rol NOT IN (
    'admin_institucional','coordinador','mentor','emprendedor','dueño',
    'vendedor','gestor','encargado_rrhh','empleado','contador_externo'
  ) THEN
    RAISE EXCEPTION 'Rol inválido';
  END IF;
  IF p_membresia NOT IN ('free','pro','premium') THEN
    RAISE EXCEPTION 'Membresía inválida';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
    RAISE EXCEPTION 'Ya existe una cuenta con ese email';
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated', 'authenticated',
    v_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    jsonb_build_object('full_name', btrim(p_nombre), 'rol', p_rol),
    now(), now()
  )
  RETURNING id INTO v_uid;

  UPDATE public.perfiles SET
    rol = p_rol,
    institucion_id = p_institucion_id,
    activo = p_activo,
    membresia_nivel = p_membresia,
    membresia_expira = CASE WHEN p_membresia = 'free' THEN NULL ELSE now() + interval '1 year' END,
    puede_crear_ventas = true,
    puede_crear_gastos = true,
    puede_ver_caja = p_membresia IN ('pro','premium'),
    puede_ver_reportes = p_membresia IN ('pro','premium'),
    puede_ver_remuneraciones = p_membresia = 'premium'
  WHERE id = v_uid;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_crear_usuario(text, text, text, text, uuid, text, boolean) TO authenticated;