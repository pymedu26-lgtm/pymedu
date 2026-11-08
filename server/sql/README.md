# Bases de datos de PymEdu (índice para el programador)

Cada archivo crea un **schema** con el nombre de su app. Todos son idempotentes
(`CREATE ... IF NOT EXISTS`) y `server/src/db.js#ejecutarScriptsSQL` los corre en orden
cada vez que arranca la API, tanto en modo local como en Railway.

| Archivo | Schema / base destino | App | Subdominio previsto |
|---|---|---|---|
| *(dentro de `server/src/db.js`)* | `public` | Base actual (ERP + identidad heredada) | erp.pymedu.cl |
| `01_cuentas.sql` | `cuentas` | Núcleo PymEdu Cuentas | cuentas.pymedu.cl |
| `02_erp_inventario.sql` | `erp` | ERP: inventario fraccionado y costeo | erp.pymedu.cl |
| `03_mentorias.sql` | `mentorias` | Mentorías y cursos | mentorias.pymedu.cl |
| `04_academia.sql` | `academia` | Academia | academia.pymedu.cl |

**Subir a Railway (MVP):** un solo PostgreSQL. Basta con poner `DATABASE_URL` y arrancar
la API: se crean los schemas. **Al separar bases** (un servidor por app), ejecuta cada
archivo en la base de su app (`psql "$URL_MENTORIAS" -f 03_mentorias.sql`). Ninguna tabla
apunta a tablas de otra app; solo guardan ids del núcleo (`usuario_id`, `organizacion_id`).

## Tablas y dónde se usan

### `public` (actual, sin cambios de estructura)
| Tabla | Uso | Pasa a |
|---|---|---|
| `perfiles` | usuarios y sesión (JWT) — `server/src/auth.js` | `cuentas` |
| `instituciones`, `codigos_invitacion`, `solicitudes_vinculacion` | instituciones y vinculación — `server/src/vinculacion*.js` | `cuentas.organizacion` / `cuentas.membresia_comunidad` |
| `programas`, `usuario_programas` | programas institucionales | `cuentas` / `mentorias` |
| `pagos` | Webpay de suscripciones — `server/src/webpay.js` | `cuentas` |
| `erp_datos` | todo el ERP como JSON por colección — `server/src/erp.js` | `erp.*` (ver mapeo en `02_erp_inventario.sql`) |

### `cuentas` — `01_cuentas.sql`
| Tabla | Uso en código |
|---|---|
| `organizacion` | plataforma, instituciones (copiadas de `public.instituciones` con el mismo id), comunidades, negocios y proveedores — `server/src/cuentas/servicio.js` |
| `membresia_comunidad` | pertenencia validada a comunidades cerradas — `comunidadesDe()` |
| `consentimiento_datos` | el emprendedor autoriza a su mentor a ver un resumen del negocio *(tabla lista; pantalla pendiente)* |
| `permiso` | catálogo fijo `modulo.accion`, cargado desde `server/src/cuentas/permisos.js` |
| `rol`, `rol_permiso` | roles dinámicos y subroles — API `/api/roles` (`server/src/cuentas/rutas.js`), UI `src/components/GestorRoles.tsx` |
| `asignacion_rol` | roles por usuario y organización — `permisosDe()`, `requierePermiso()` |
| `auditoria_roles` | historial de cambios de roles |

### `erp` — `02_erp_inventario.sql`
`configuracion_negocio`, `producto`, `unidad_compra`, `presentacion_venta`, `receta_presentacion`,
`lote`, `envase`, `movimiento_inventario`, `linea_venta`.
Hoy la lógica corre sobre las colecciones JSON (`inventario`, `lotes`, `envases`, `movimientosInventario`,
`config.metodoCosteo`) con `src/1.-ERP/services/costeo.ts`; estas tablas son el destino al migrar a
endpoints por recurso. Lectura paginada ya disponible: `GET /api/erp/recursos/:coleccion?pagina=&tamano=&q=`.

### `mentorias` — `03_mentorias.sql`
| Tabla | Endpoint que la usa (`server/src/mentorias/rutas.js`) |
|---|---|
| `categoria` | `GET /api/mentorias/categorias`, facetas del catálogo |
| `curso`, `modulo`, `leccion`, `recurso` | `GET /catalogo`, `GET /cursos/:id`, `POST/PATCH /cursos` |
| `revision_curso`, `curador` | `POST /cursos/:id/revision`, `GET /revisiones/pendientes`, `POST /cursos/:id/aprobar` |
| `grupo`, `sesion` | ficha del curso, `GET /mi-acompanamiento` |
| `inscripcion`, `lista_espera`, `cupos_institucionales` | `POST /inscripciones` |
| `progreso_leccion`, `certificado` | `POST /lecciones/:id/progreso` (100 % → certificado) |
| `comentario` | `POST /cursos/:id/comentarios` |
| `asistencia` | `GET /panel/*` (asistencia %) *(registro de asistencia: pantalla pendiente)* |
| `tarea`, `entrega` | *(tablas listas; corrección de tareas pendiente)* |
| `venta`, `liquidacion` | *(tablas listas; liquidación mensual pendiente — comisiones en `src/4.-MENTORIAS/tipos.ts#COMISIONES`)* |
| `evento_recibido` | `POST /api/mentorias/eventos` (header `x-pymedu-evento`) |

### `academia` — `04_academia.sql`
`ruta`, `modulo`, `leccion`, `progreso`. Destino del contenido que hoy vive en
`src/2.-ACADEMIA/gratis/*.html` + `manifest.json` *(sin uso en código todavía)*.

## Modo local (sin Railway)
Sin `DATABASE_URL` (o con `DB_MODE=local`) la API usa **PGlite**, un PostgreSQL embebido,
guardado en `server/.data/pglite` (ignorado por git). Mismo SQL que Railway. Para empezar
de cero, borra esa carpeta y reinicia: se vuelven a crear tablas y datos demo.
