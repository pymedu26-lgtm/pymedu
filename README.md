# PymEdu - Sistema de Gestión para PYMES

Sistema completo de gestión para pequeñas y medianas empresas, con estructura jerárquica de roles y soporte multi-tenant.

## Características

- **Estructura jerárquica de roles**: SuperAdmin → Admin Institucional → Coordinador → Mentor → Emprendedor
- **Multi-tenant**: Soporte para múltiples instituciones
- **Base de datos escalable**: PostgreSQL en Railway
- **Autenticación local**: JWT firmado por la propia API, sin dependencia de servicios externos

## Requisitos Previos

- [Node.js](https://nodejs.org/) v18 o superior
- npm o yarn
- Un PostgreSQL creado en [Railway](https://railway.app)

## Instalación Rápida

### 1. Clonar el repositorio
```bash
git clone <url-del-repositorio>
cd PymEdu
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
```bash
cp .env.example .env
```

Luego completa en `.env` tu `DATABASE_URL` de Railway y un `JWT_SECRET` (ver sección **Base de datos**).

### 4. Iniciar servicios
```bash
# Windows PowerShell
.\start.ps1

# Linux/Mac
chmod +x start.sh
./start.sh
```

O manualmente:
```bash
# Iniciar servidor API (en otra terminal)
npm run server

# Iniciar frontend (en otra terminal)
npm run dev
```

## URLs de Servicios

| Servicio | URL |
|----------|-----|
| Frontend | http://localhost:3000 |
| API | http://localhost:4000 |

## Base de datos

PostgreSQL en Railway. La API se conecta con la librería `pg` usando una sola variable:

```
DATABASE_URL="postgresql://usuario:password@host.railway.app:5432/railway?sslmode=require"
JWT_SECRET="un-secreto-largo-y-aleatorio"
```

- `DATABASE_URL`: en Railway → tu proyecto → **Variables** → copia la URL pública de Postgres.
- `JWT_SECRET`: firma los tokens de sesión. Generar con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

### Esquema

No hay archivos SQL que correr: `server/src/db.js` crea las tablas con `CREATE TABLE IF NOT EXISTS` al conectar, así que basta con apuntar `DATABASE_URL` a una base vacía. Las tablas son `instituciones`, `perfiles`, `programas`, `usuario_programas`, `pagos`, `solicitudes_vinculacion`, `codigos_invitacion` y `erp_datos`.

### Datos demo

Con `SEED_DEMO=1` en `.env`, la API inserta las cuentas demo de la tabla de abajo la primera vez que arranca (bcrypt, contraseña `Demo#2026`). Sin esa variable no se insertan.

### Autenticación

No hay proveedor externo. `POST /api/auth/login` valida el bcrypt contra la tabla `perfiles` y devuelve un JWT firmado con `JWT_SECRET` (24 h). `requireAuth` (`server/src/auth.js`) lo verifica en cada request y carga el perfil desde la base; si el token expiró responde `401` y el frontend debe volver a iniciar sesión.

## Credenciales Demo

| Rol | Email | Password |
|-----|-------|----------|
| Super Admin | supadmin@pymedu.com | `Demo#2026` |
| Admin Institucional | admin@colegiosanjose.cl | `Demo#2026` |
| Coordinador | coord@colegiosanjose.cl | `Demo#2026` |
| Mentor | mentor@colegiosanjose.cl | `Demo#2026` |
| Emprendedor | emprendedor@pymedu.com | `Demo#2026` |
| Demo (todos los roles) | demo@pymedu.com | `Demo#2026` |

> La contraseña de todos los accesos demo es `Demo#2026`. Se insertan al arrancar la API con `SEED_DEMO=1`.

## Estructura de Roles

```
SUPERADMIN (ve todo, segmentado por institución)
├── ADMINISTRADOR INSTITUCIONAL 1 (ve su institución)
│   ├── COORDINADOR (ve sus mentores y emprendedores)
│   │   ├── MENTOR (ve sus emprendedores asignados)
│   │   │   └── EMPRENDEDOR (ve solo su perfil/ERP)
│   │   └── MENTOR 2
│   └── COORDINADOR 2
├── ADMINISTRADOR INSTITUCIONAL 2
│   ├── COORDINADOR
│   │   └── MENTOR
│   │       └── EMPRENDEDOR
└── ADMINISTRADOR INSTITUCIONAL 3
    └── ...
```

## Comandos Útiles

```bash
# Iniciar todo
.\start.ps1        # Windows
./start.sh         # Linux/Mac

# Solo frontend
npm run dev

# Solo servidor API
npm run server
```

## Desarrollo

### Estructura del Proyecto

```
PymEdu/
├── src/
│   ├── lib/
│   │   ├── api.ts            # Cliente de la API
│   │   ├── roles.ts          # Rampa de colores por rol
│   │   └── useColoresTema.ts # Lee los tokens del tema para Recharts
│   ├── context/
│   │   ├── AuthContext.tsx
│   │   └── ThemeContext.tsx
│   └── ...
├── server/
│   └── src/                  # Backend API (Express + pg)
│       ├── index.js
│       ├── db.js             # Pool de Postgres + creación del esquema
│       └── auth.js           # /login y requireAuth
└── package.json
```

### Agregar Nuevos Roles

1. Editar la tabla `perfiles` en la base (quitar el `CHECK` del rol si existe):
```sql
ALTER TABLE perfiles DROP CONSTRAINT IF EXISTS perfiles_rol_check;
ALTER TABLE perfiles ADD CONSTRAINT perfiles_rol_check CHECK (rol IN (
  'superadmin', 'admin_institucional', 'coordinador', 
  'mentor', 'emprendedor', 'dueño', 'vendedor', 
  'gestor', 'encargado_rrhh', 'empleado', 'contador_externo',
  'nuevo_rol'  -- Agregar aquí
));
```

2. Actualizar `src/context/AuthContext.tsx`:
```typescript
export type Rol =
  | 'superadmin'
  // ... otros roles
  | 'nuevo_rol';
```

3. Actualizar permisos en `src/context/AuthContext.tsx`:
```typescript
case 'nuevo_rol':
  return ['permiso1', 'permiso2'].includes(permiso);
```

### Consultas Jerárquicas

```sql
-- Obtener todos los subordinados de un usuario
SELECT * FROM obtener_subordinados('id-del-usuario');

-- Verificar permiso de un usuario
SELECT verificar_permiso('id-del-usuario', 'permiso');

-- Ver jerarquía completa
SELECT * FROM vista_jerarquia;
```

## Producción

Para desplegar en producción:

1. Cambiar contraseñas por defecto
2. Configurar HTTPS
3. Configurar backups automáticos
4. Monitoreo y logs

## Licencia

MIT
