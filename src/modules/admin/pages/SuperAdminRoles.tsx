import GestorRoles from '../../../components/GestorRoles';

/**
 * Superadmin → Roles (corrección #35): reemplaza la matriz de solo lectura por la matriz
 * editable de Roles dinámicos (datos en cuentas.rol / cuentas.rol_permiso, API /api/roles).
 */
export default function SuperAdminRoles() {
  return <GestorRoles ambitoInicial="plataforma" titulo="Roles y permisos" />;
}
