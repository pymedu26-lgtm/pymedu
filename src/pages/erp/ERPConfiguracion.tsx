import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useERP } from '../../1.-ERP/context/ERPContext';
import { CATEGORIAS, CONFIG_ALERTAS_DEFECTO } from '../../1.-ERP/services/alertas';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import SelectorDesplegable from '../../components/SelectorDesplegable';
import GestorRoles from '../../components/GestorRoles';
import { formatCLP, formatFecha } from '../../lib/fechas';
import { PLANES, planPorId, WEBPAY_MODO_PRUEBA } from '../../lib/planes';

type Tab = 'negocio' | 'roles' | 'cuenta' | 'equipo' | 'integraciones' | 'facturacion' | 'inventario' | 'alertas';

const RUBROS = [
  'Alimentación y Bebidas', 'Comercio Minorista', 'Servicios Profesionales',
  'Construcción y Remodelación', 'Educación y Capacitación', 'Estética y Belleza',
  'Salud y Bienestar', 'Tecnología y Software', 'Transporte y Logística',
  'Turismo y Hospitalidad', 'Arte y Diseño', 'Agricultura y Ganadería', 'Otro',
];

const REGIONES = [
  'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo',
  'Valparaíso', 'Metropolitana de Santiago', "O'Higgins", 'Maule', 'Ñuble',
  'Biobío', 'La Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes',
];

// ── Comunas por región (catalogo para el campo Comuna) ──────────────────────
const REGIONES_COMUNAS: Record<string, string[]> = {
  'Arica y Parinacota': ['Arica', 'General Lagos', 'Putre', 'Azapa', 'Camarones'],
  'Tarapacá': ['Iquique', 'Alto Hospicio', 'Pozo Almonte', 'Pica', 'Camiña', 'Colchane', 'Huara', 'Cobre'],
  'Antofagasta': ['Antofagasta', 'Mejillones', 'Coper', 'Díaz', 'Mataraca', 'Matías Vergara', 'Salaverria', 'María Elena', 'elo'],
  'Atacama': ['Copiapó', 'Caldera', 'Tierra Amarilla', 'Chañaral', 'Diego de Almagro', 'Vallenar', 'Alto del Carmen', 'Freirina', 'Huasco'],
  'Coquimbo': ['Coquimbo', 'La Serena', 'Ovalle', 'Combarbalá', 'Illapel', 'Canela', 'Vicuña', 'Netarí', 'Aloto'],
  'Valparaíso': ['Valparaíso', 'Viña del Mar', 'Santo Domingo', 'Jardín', 'Concon', 'Puchuncaví', 'Quilpué', 'Quintero', 'Algarrobo', 'El Tabo', 'Santo Tomás', 'Cartagena', 'Caleu', 'Nancagua', 'San Antonio'],
  'Metropolitana de Santiago': ['Santiago', 'Providencia', 'Vitacura', 'Las Condes', 'Lo Barnechea', 'Lo Prado', 'Pedro Aguirre Cerda', 'San Joaquín', 'Cerro Navia', 'Plaza de Maipo', 'Puente Alto', 'Padre Hurtado', 'Pirque', 'Renca', 'La Pintana', 'La Florida', 'Bellavista', 'Macul', 'Ñuñoa', 'San Ramón', 'Colina', 'Tiltil', 'Cerrillos', 'Quilicura', 'Conchalí', 'Independencia', 'Recoleta', 'Huechuraba', 'Estación Central'],
  "O'Higgins": ['Rancagua', 'Río de los Cipreses', 'Mostazal', 'Requínoa', 'Malloa', "Peñaflor", 'Pichilemu', 'San Fernando', 'Nancagua'],
  'Maule': ['Talca', 'Maule', 'Pelarco', 'Curepto', 'Del Cerro', 'Constitución', 'Curicó', 'Hualañé', 'Río Claro', 'Molina', 'Rauco', 'Estacion', 'Chanco'],
  'Ñuble': ['Chillán', 'Chillán Viejo', 'El Carmen', 'El Guadalupe', 'Ninhue', 'San Carlos', 'Cobquecura', 'Yungay', 'Portezuelo', 'Ránquil', 'Bulnes', 'Cabrero', 'Ninhue'],
  'Biobío': ['Concepción', 'Coronel', 'Talcahuano', 'Hualpén', 'Florida', 'Penco', 'Santa Juana', 'Los Ángeles', 'Tucapel', 'Yumbel', 'Chillán', 'Negrete', 'Laja', 'San Rosendo', 'Talcahuano', 'Cañete', 'Chiguayante', 'San Pedro de la Paz', 'Orrobamba', 'Bulnes'],
  'La Araucanía': ['Temuco', 'Padre las Casas', 'Victoria', 'Teodoro Schmidt', 'Carahue', 'Cunco', 'Curarrehue', 'Freire', 'Galvarino', 'Lautaro', 'Loncoche', 'Melipeuco', 'Nueva Imperial', 'Pucón', 'Saavedra', 'Vilcún', 'Cholchol', 'Perquenco', 'Pucón'],
  'Los Ríos': ['Valdivia', 'Lanco', 'Mariquina', 'Los Lagos', 'Mafil', 'Paillaco', 'Corral', 'Lanco', 'Máfil', 'Paillaco'],
  'Los Lagos': ['Puerto Montt', 'Calbuco', 'Puerto Varas', 'Frutillar', 'Los Muermos', 'Ancud', 'Castro', 'Achao', 'Quellón', 'Cochamó', 'Chonchi', 'Dalcahue', 'Puqueldón', 'Queilén', 'Natales', 'Cochamó'],
  'Aysén': ['Coyhaique', 'Aysén', 'Carrillo', 'Chile Chico', 'Nueve', 'Río Bravo', 'Seara', 'Timaukel'],
  'Magallanes': ['Punta Arenas', 'Laguna Blanca', 'Río Verde', 'San Gregorio', 'Cabo de Hornos'],
};

const SEGMENTOS = [
  { valor: 'A', label: 'Segmento 1 - 1 a 10 empleados' },
  { valor: 'B', label: 'Segmento 2 - 11 a 20 empleados' },
  { valor: 'C', label: 'Segmento 3 - 21 o mas empleados' },
] as const;

const MODO_SII: Record<string, string> = {
  sandbox: 'Prueba (sin envío al SII)',
  manual_controlled: 'Manual controlado',
  api_integrated: 'Integrado por API',
};

const TABS: { id: Tab; icono: string; label: string }[] = [
  { id: 'negocio', icono: 'storefront', label: 'Mi Negocio' },
  { id: 'roles', icono: 'admin_panel_settings', label: 'Roles' },
  { id: 'cuenta', icono: 'manage_accounts', label: 'Mi Cuenta' },
  { id: 'equipo', icono: 'group', label: 'Equipo' },
  { id: 'inventario', icono: 'inventory_2', label: 'Inventario' },
  { id: 'alertas', icono: 'notifications', label: 'Alertas' },
  { id: 'integraciones', icono: 'cloud_sync', label: 'Integraciones' },
  { id: 'facturacion', icono: 'credit_card', label: 'Suscripción' },
];

export default function ERPConfiguracion() {
  const { perfil, actualizarPerfil, puedeHacer, tienePermiso } = useAuth();
  const {
    configuracionCumplimiento, updatePpmTasa, metodoCosteo, setMetodoCosteo, politicaEnvaseAbierto, permitirMezclarEnvases, setPoliticaInventario,
    plantillasSubcategoria, actualizarPlantilla, eliminarPlantilla, margenObjetivo, setMargenObjetivo, configAlertas, setConfigAlertas,
  } = useERP();
  const [tab, setTab] = useState<Tab>('negocio');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const notificar = (tipo: 'ok' | 'error', texto: string) => {
    setMensaje({ tipo, texto });
    setTimeout(() => setMensaje(null), 3500);
  };

  // ══ Mi Negocio ════════════════════════════════════
  const [formNegocio, setFormNegocio] = useState({
    negocio_nombre: perfil?.negocio_nombre ?? '',
    negocio_rut: perfil?.negocio_rut ?? '',
    negocio_rubro: perfil?.negocio_rubro ?? '',
    negocio_region: perfil?.negocio_region ?? '',
    negocio_comuna: perfil?.negocio_comuna ?? '',
    negocio_direccion: perfil?.negocio_direccion ?? '',
    segmento_negocio: (perfil?.segmento_negocio as 'A' | 'B' | 'C') ?? 'C',
    logo_url: perfil?.logo_url ?? '',
  });

  // Solapa el valor inicial con el formateo, en caso de que el RUT guardado
  // ya fuera escrito con formato (ej. "99.999.999-9").
  useEffect(() => {
    if (!perfil) return;
    const rut = perfil.negocio_rut ?? '';
    setFormNegocio(prev => ({ ...prev, negocio_rut: formatearRut(rut) }));
  }, [perfil?.id]);

  const formatearRut = (rut: string): string => {
    const soloDigitos = rut.replace(/\D/g, '');
    if (soloDigitos.length <= 1) return soloDigitos;
    const cuerpo = soloDigitos.slice(0, -1);
    const dv = soloDigitos.slice(-1);
    const cuerpoFormateado = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${cuerpoFormateado}-${dv}`;
  };

  const guardarNegocio = async () => {
    if (!perfil) return;
    setGuardando(true);
    try {
      await actualizarPerfil({ ...formNegocio });
      notificar('ok', 'Datos del negocio guardados');
    } catch (e) {
      notificar('error', e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  // ══ Equipo: crear usuarios PYME ══════════════════════════════════════════════════════════════════════════
  const ROLES_PYME: { valor: 'vendedor' | 'gestor' | 'empleado'; label: string; icono: string }[] = [
    { valor: 'vendedor', label: 'Vendedor (VAR1)', icono: 'point_of_sale' },
    { valor: 'gestor', label: 'Bodeguero (VAR2)', icono: 'inventory_2' },
    { valor: 'empleado', label: 'Asistente (VAR3)', icono: 'person' },
  ];
  const opcionesRolUsuario = ROLES_PYME.map(r => ({ valor: r.valor, etiqueta: r.label }));

  const [formNuevoUsuario, setFormNuevoUsuario] = useState({
    nombre: '',
    apellido: '',
    rol: 'vendedor' as 'vendedor' | 'gestor' | 'empleado',
    password: '',
  });
  const [mostrarFormNuevoUsuario, setMostrarFormNuevoUsuario] = useState(false);
  const [usuariosEquipo, setUsuariosEquipo] = useState<{ id: string; nombre_completo: string; email: string; rol: string }[]>([]);
  const [guardandoUsuario, setGuardandoUsuario] = useState(false);

  const negocioCompleto = !!(
    formNegocio.negocio_nombre?.trim() &&
    formNegocio.negocio_rut?.trim() &&
    formNegocio.negocio_rubro?.trim()
  );

  const generarEmail = (nombre: string, apellido: string): string => {
    const inicial = nombre.trim().charAt(0).toLowerCase();
    const ap = apellido.trim().toLowerCase().replace(/\s+/g, '');
    return `${inicial}.${ap}@pymedu.cl`;
  };

  const emailPreview = useMemo(() => generarEmail(formNuevoUsuario.nombre, formNuevoUsuario.apellido),
    [formNuevoUsuario.nombre, formNuevoUsuario.apellido]);

  const crearUsuarioPyme = async () => {
    if (!perfil) return;
    if (!negocioCompleto) {
      notificar('error', 'Primero completa los datos del negocio en la pestaña Mi Negocio');
      return;
    }
    if (!formNuevoUsuario.nombre.trim() || !formNuevoUsuario.apellido.trim()) {
      notificar('error', 'Nombre y apellido son requeridos');
      return;
    }
    setGuardandoUsuario(true);
    try {
      const { ok, usuario } = await api.crearUsuarioPyme({
        nombre: formNuevoUsuario.nombre.trim(),
        apellido: formNuevoUsuario.apellido.trim(),
        rol: formNuevoUsuario.rol,
        password: formNuevoUsuario.password.trim() || undefined,
      });
      if (ok && usuario) {
        setUsuariosEquipo(prev => [...prev, usuario]);
        setFormNuevoUsuario({ nombre: '', apellido: '', rol: 'vendedor', password: '' });
        setMostrarFormNuevoUsuario(false);
        notificar('ok', `Usuario ${usuario.email} creado correctamente`);
      } else {
        notificar('error', 'No se pudo crear el usuario');
      }
    } catch (e) {
      notificar('error', e instanceof Error ? e.message : 'Error al crear usuario');
    } finally {
      setGuardandoUsuario(false);
    }
  };

  const subirLogo = (archivo: File) => {
    if (archivo.size > 2 * 1024 * 1024) {
      notificar('error', 'El logo debe ser menor a 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFormNegocio(p => ({ ...p, logo_url: String(reader.result ?? '') }));
    };
    reader.readAsDataURL(archivo);
  };

  const letraLogo = useMemo(() =>
    (formNegocio.negocio_nombre || perfil?.negocio_nombre || 'P').trim()[0]?.toUpperCase() ?? 'P',
    [formNegocio.negocio_nombre, perfil?.negocio_nombre]);

  // ══ Mi Cuenta ═════════════════════════════════════
  const [formCuenta, setFormCuenta] = useState({
    nombre_completo: perfil?.nombre_completo ?? '',
    contrasena_actual: '',
    nueva_contrasena: '',
    confirmar_contrasena: '',
    notif_email: !!(perfil?.notif_email ?? true),
    notif_push: !!(perfil?.notif_push ?? false),
  });

  useEffect(() => {
    if (!perfil) return;
    setFormCuenta(p => ({
      ...p,
      nombre_completo: perfil.nombre_completo ?? '',
      notif_email: !!(perfil.notif_email ?? true),
      notif_push: !!(perfil.notif_push ?? false),
    }));
  }, [perfil?.id]);

  const guardarCuenta = async () => {
    if (!perfil) return;
    const payload: Record<string, unknown> = {
      nombre_completo: formCuenta.nombre_completo,
      notif_email: formCuenta.notif_email,
      notif_push: formCuenta.notif_push,
    };
    // Cambio de contraseña: el servidor exige la actual, mínimo 8 y distinta de la actual (corrección #7).
    if (formCuenta.nueva_contrasena || formCuenta.confirmar_contrasena) {
      const error = !formCuenta.contrasena_actual ? 'Ingresa tu contraseña actual para cambiarla'
        : formCuenta.nueva_contrasena.length < 8 ? 'La nueva contraseña debe tener al menos 8 caracteres'
        : formCuenta.nueva_contrasena !== formCuenta.confirmar_contrasena ? 'Las contraseñas no coinciden'
        : formCuenta.nueva_contrasena === formCuenta.contrasena_actual ? 'La nueva contraseña debe ser distinta de la actual'
        : '';
      if (error) { notificar('error', error); return; }
      payload.contrasena_actual = formCuenta.contrasena_actual;
      payload.nueva_contrasena = formCuenta.nueva_contrasena;
      payload.confirmar_contrasena = formCuenta.confirmar_contrasena;
    }
    setGuardando(true);
    try {
      await actualizarPerfil(payload);
      setFormCuenta(p => ({ ...p, contrasena_actual: '', nueva_contrasena: '', confirmar_contrasena: '' }));
      notificar('ok', 'Cuenta actualizada correctamente');
    } catch (e) {
      notificar('error', e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  // ══ Roles: crear roles y permisos del equipo ═════════════════════════════════════════════════════════════════════════════
  const puedeGestionarRoles = tienePermiso('roles.gestionar');

  // ══ Equipo ════════════════════════════════════════
  const puedeGestionarEquipo = !!perfil && (
    ['superadmin', 'admin_institucional', 'emprendedor', 'dueño'].includes(perfil.rol)
  ) && (!!perfil.institucion_id || perfil.rol === 'emprendedor' || perfil.rol === 'dueño');
  const [equipo, setEquipo] = useState<Record<string, unknown>[] | null>(null);

  useEffect(() => {
    if (!puedeGestionarEquipo) return;
    if (['superadmin', 'admin_institucional'].includes(perfil.rol) && !!perfil?.institucion_id) {
      let activo = true;
      api.getUsuariosInstitucion(perfil.institucion_id)
        .then(({ data }) => { if (activo) setEquipo(data as unknown as Record<string, unknown>[]); })
        .catch(() => { if (activo) setEquipo([]); });
      return () => { activo = false; };
    } else {
      // Emprendedor/dueño de PYME: equipo vacío, se llena al crear usuarios
      setEquipo([]);
      return;
    }
  }, [puedeGestionarEquipo, perfil?.institucion_id, perfil?.rol]);

  // ══ Integraciones / SII ═══════════════════════════
  const siiModoPrueba = configuracionCumplimiento.modoIntegracion === 'sandbox' || configuracionCumplimiento.ambiente !== 'produccion';
  const [ppm, setPpm] = useState(String(configuracionCumplimiento.ppmTasa));
  const [ppmGuardado, setPpmGuardado] = useState(false);

  const guardarPpm = async () => {
    const valor = Number(ppm);
    if (isNaN(valor) || valor < 0) return;
    await updatePpmTasa(valor);
    setPpmGuardado(true);
    setTimeout(() => setPpmGuardado(false), 2000);
  };

  if (!perfil) return null;

  const inputCls = 'w-full px-4 py-3 rounded-xl border-2 border-outline-variant/60 focus:border-primary outline-none text-sm font-bold text-on-surface bg-surface-container-lowest transition-colors';
  const labelCls = 'flex items-center gap-1 text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5';
  const campoCls = 'flex flex-col items-start gap-2 text-on-surface-variant text-sm';

  const opcionesRegion = [
    { valor: '', etiqueta: 'Selecciona una región' },
    ...REGIONES.map(r => ({ valor: r, etiqueta: r })),
  ];
  const comunasRegion = formNegocio.negocio_region
    ? (REGIONES_COMUNAS[formNegocio.negocio_region] ?? [])
    : [];
  const opcionesComuna = comunasRegion.length > 0
    ? comunasRegion.map(c => ({ valor: c, etiqueta: c }))
    : [{ valor: '', etiqueta: formNegocio.negocio_region ? 'Sin comunas disponibles' : 'Selecciona una región primero' }];
  const opcionesSegmento = SEGMENTOS.map(s => ({ valor: s.valor, etiqueta: s.label }));
  const opcionesRubro = [
    { valor: '', etiqueta: 'Selecciona un rubro' },
    ...RUBROS.map(r => ({ valor: r, etiqueta: r })),
  ];

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-primary flex items-center gap-3">
            <span className="material-symbols-outlined text-4xl">settings</span>
            Configuración
          </h2>
          <p className="text-on-surface-variant mt-1 text-sm">Perfil de tu negocio, cuenta, equipo y preferencias del ERP.</p>
        </div>
        {mensaje && (
          <div className={cn('flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-sm',
            mensaje.tipo === 'ok' ? 'bg-success/15 text-success' : 'bg-error/15 text-error')}>
            <span className="material-symbols-outlined">{mensaje.tipo === 'ok' ? 'check_circle' : 'error'}</span>
            {mensaje.texto}
          </div>
        )}
      </div>

      {/* Tabs tipo chips, mismo estilo que el centro de alertas */}
      <div className="space-y-6">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 hide-scrollbar sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Secciones de configuración">
          {TABS.filter(({ id }) => id !== 'roles' || puedeGestionarRoles).map(({ id, icono, label }) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={cn('inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-xs font-bold transition-colors',
                tab === id
                  ? 'border-primary bg-primary text-inverse-on-surface'
                  : 'border-outline-variant/40 bg-surface-container-lowest text-on-surface-variant hover:border-primary/40 hover:text-on-surface')}>
              <span className="material-symbols-outlined text-base">{icono}</span>
              {label}
            </button>
          ))}
        </div>

        {/* Content area */}
        <div className="min-w-0">

      {/* ══ Mi Negocio ══ */}
      {tab === 'negocio' && (
        <div className="bg-surface-container-lowest dark-card rounded-3xl border border-outline-variant/20 shadow-sm p-8 space-y-6">
          <h3 className="text-lg font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">storefront</span>
            Datos del Negocio
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelCls}>Nombre del negocio</label>
              <input value={formNegocio.negocio_nombre} onChange={e => setFormNegocio(p => ({ ...p, negocio_nombre: e.target.value }))}
                placeholder="Ej: Ferretería El Clavo" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>RUT de la empresa</label>
              <input value={formNegocio.negocio_rut} onChange={e => {
                const soloDigitos = e.target.value.replace(/\D/g, '');
                if (soloDigitos.length <= 1) {
                  setFormNegocio(p => ({ ...p, negocio_rut: soloDigitos }));
                  return;
                }
                const cuerpo = soloDigitos.slice(0, -1);
                const dv = soloDigitos.slice(-1);
                const cuerpoFormateado = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                setFormNegocio(p => ({ ...p, negocio_rut: `${cuerpoFormateado}-${dv}` }));
              }}
                placeholder="76.543.210-K" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Perfil de negocio (segmento)</label>
              <SelectorDesplegable
                variante="campo"
                valor={formNegocio.segmento_negocio}
                opciones={opcionesSegmento}
                onChange={v => setFormNegocio(p => ({ ...p, segmento_negocio: v as 'A' | 'B' | 'C' }))}
              />
              <p className="text-[10px] text-on-surface-variant mt-1.5 leading-relaxed uppercase font-bold tracking-tighter">
                Define qué módulos y funcionalidades estarán visibles según el tamaño de tu empresa.
              </p>
            </div>
            <div>
              <label className={labelCls}>Giro / Rubro</label>
              <SelectorDesplegable
                variante="campo"
                valor={formNegocio.negocio_rubro}
                opciones={opcionesRubro}
                onChange={v => setFormNegocio(p => ({ ...p, negocio_rubro: v }))}
              />
            </div>
            <div>
              <label className={labelCls}>Región</label>
              <SelectorDesplegable
                variante="campo"
                valor={formNegocio.negocio_region}
                opciones={opcionesRegion}
                onChange={v => setFormNegocio(p => ({ ...p, negocio_region: v, negocio_comuna: '' }))}
              />
            </div>
            <div>
              <label className={labelCls}>Comuna</label>
              <SelectorDesplegable
                variante="campo"
                valor={formNegocio.negocio_comuna}
                opciones={opcionesComuna}
                onChange={v => setFormNegocio(p => ({ ...p, negocio_comuna: v }))}
                disabled={!formNegocio.negocio_region || comunasRegion.length === 0}
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Dirección <span className="font-normal normal-case text-on-surface-variant/60">(opcional)</span></label>
              <input value={formNegocio.negocio_direccion} onChange={e => setFormNegocio(p => ({ ...p, negocio_direccion: e.target.value }))}
                placeholder="Av. Principal 123, Santiago" className={inputCls} />
            </div>
          </div>

          {/* Logo */}
          <div className="p-5 rounded-2xl bg-surface-container dark-card border border-outline-variant/20">
            <h4 className="text-sm font-bold text-on-surface mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-on-surface-variant">image</span>
              Logo del negocio
            </h4>
            <div className="flex items-center gap-5">
              {formNegocio.logo_url ? (
                <img src={formNegocio.logo_url} alt="Logo" className="w-20 h-20 rounded-2xl object-cover border border-outline-variant/40" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-primary text-3xl font-extrabold border-2 border-dashed border-primary/30">
                  {letraLogo}
                </div>
              )}
              <div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) subirLogo(f); }} />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 border-2 border-outline-variant rounded-xl text-sm font-bold text-on-surface-variant hover:border-primary hover:text-primary transition-colors">
                  <span className="material-symbols-outlined text-base">upload</span> {formNegocio.logo_url ? 'Cambiar logo' : 'Subir logo'}
                </button>
                {formNegocio.logo_url && (
                  <button onClick={() => setFormNegocio(p => ({ ...p, logo_url: '' }))}
                    className="ml-2 text-xs font-bold text-error hover:underline">
                    Quitar
                  </button>
                )}
                <p className="text-xs text-on-surface-variant mt-1.5">PNG, JPG o SVG — máx. 2MB</p>
              </div>
            </div>
          </div>

          <button onClick={guardarNegocio} disabled={guardando}
            className="w-full py-4 bg-primary text-inverse-on-surface font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-70 transition-colors">
            {guardando ? <span className="material-symbols-outlined animate-spin">autorenew</span> : <span className="material-symbols-outlined">save</span>}
            Guardar cambios
          </button>
        </div>
      )}

      {/* ══ Roles: crear roles y permisos de lo que cada uno puede hacer y revisar ══ */}
      {tab === 'roles' && (
        <div className="bg-surface-container-lowest dark-card rounded-3xl border border-outline-variant/20 shadow-sm">
          {puedeGestionarRoles ? (
            <GestorRoles ambitoInicial="negocio" titulo="Roles y permisos del equipo" compacto />
          ) : (
            <div className="p-8 space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-primary">admin_panel_settings</span>
                </div>
                <div>
                  <p className="font-bold text-on-surface">No puedes gestionar roles</p>
                  <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
                    Solo el administrador del negocio puede crear roles y definir los permisos del equipo.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ Mi Cuenta ══ */}
      {tab === 'cuenta' && (
        <div className="space-y-6 max-w-xl">
          <div className="bg-surface-container-lowest dark-card rounded-3xl border border-outline-variant/20 shadow-sm p-8 space-y-5">
            <h3 className="text-lg font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">manage_accounts</span>
              Datos personales
            </h3>
            <div>
              <label className={labelCls}>Nombre completo</label>
              <input value={formCuenta.nombre_completo} onChange={e => setFormCuenta(p => ({ ...p, nombre_completo: e.target.value }))}
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={perfil.email} disabled
                className="w-full px-4 py-3 rounded-xl border-2 border-outline-variant/20 bg-surface-container dark-card outline-none text-sm font-medium text-on-surface-variant/60 cursor-not-allowed" />
              <p className="text-xs text-on-surface-variant mt-1">El email no puede modificarse (es tu identificador único).</p>
            </div>

            <div className="pt-2">
              <h4 className="text-sm font-bold text-on-surface mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-on-surface-variant">notifications</span>
                Notificaciones
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button onClick={() => setFormCuenta(p => ({ ...p, notif_email: !p.notif_email }))}
                  className={cn('flex items-center justify-between px-4 py-3 border-2 rounded-xl font-bold text-sm transition-colors',
                    formCuenta.notif_email ? 'border-primary bg-primary/5 text-on-surface' : 'border-outline-variant/40 text-on-surface-variant')}>
                  Email
                  <span className={cn('material-symbols-outlined', formCuenta.notif_email ? 'text-primary' : 'text-on-surface-variant/50')}>
                    {formCuenta.notif_email ? 'toggle_on' : 'toggle_off'}
                  </span>
                </button>
                <button onClick={() => setFormCuenta(p => ({ ...p, notif_push: !p.notif_push }))}
                  className={cn('flex items-center justify-between px-4 py-3 border-2 rounded-xl font-bold text-sm transition-colors',
                    formCuenta.notif_push ? 'border-primary bg-primary/5 text-on-surface' : 'border-outline-variant/40 text-on-surface-variant')}>
                  Push
                  <span className={cn('material-symbols-outlined', formCuenta.notif_push ? 'text-primary' : 'text-on-surface-variant/50')}>
                    {formCuenta.notif_push ? 'toggle_on' : 'toggle_off'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-lowest dark-card rounded-3xl border border-outline-variant/20 shadow-sm p-8 space-y-5">
            <h3 className="text-lg font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">lock_reset</span>
              Cambiar contraseña
            </h3>
            <div>
              <label className={labelCls}>Contraseña actual</label>
              <input type="password" autoComplete="current-password" value={formCuenta.contrasena_actual} onChange={e => setFormCuenta(p => ({ ...p, contrasena_actual: e.target.value }))}
                placeholder="Tu contraseña de hoy" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Nueva contraseña</label>
              <input type="password" autoComplete="new-password" minLength={8} value={formCuenta.nueva_contrasena} onChange={e => setFormCuenta(p => ({ ...p, nueva_contrasena: e.target.value }))}
                placeholder="Mínimo 8 caracteres" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Confirmar contraseña</label>
              <input type="password" value={formCuenta.confirmar_contrasena} onChange={e => setFormCuenta(p => ({ ...p, confirmar_contrasena: e.target.value }))}
                placeholder="Repite la nueva contraseña" className={inputCls} />
            </div>
          </div>

          <button onClick={guardarCuenta} disabled={guardando}
            className="w-full py-4 bg-primary text-inverse-on-surface font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-70 transition-colors">
            {guardando ? <span className="material-symbols-outlined animate-spin">autorenew</span> : <span className="material-symbols-outlined">save</span>}
            Guardar cambios
          </button>
        </div>
      )}

      {/* ══ Equipo ══ */}
      {tab === 'equipo' && (
        <div className="space-y-6">
          <div className="bg-surface-container-lowest dark-card rounded-3xl border border-outline-variant/20 shadow-sm overflow-hidden">
            <div className="px-8 py-6 border-b border-outline-variant/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-container dark-card">
              <h3 className="text-lg font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">group</span>
                Miembros del Equipo
              </h3>
              {puedeGestionarEquipo && negocioCompleto ? (
                <button
                  onClick={() => setMostrarFormNuevoUsuario(true)}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 bg-primary text-inverse-on-surface rounded-xl font-bold hover:bg-primary/90 transition-colors shrink-0"
                >
                  <span className="material-symbols-outlined text-base">person_add</span>
                  Agregar Usuario
                </button>
              ) : null}
            </div>

            {!negocioCompleto && puedeGestionarEquipo ? (
              <div className="p-6 rounded-2xl border border-warning/40 bg-warning/10">
                <div className="flex gap-3">
                  <span className="material-symbols-outlined text-warning">error</span>
                  <div>
                    <p className="font-bold text-on-surface text-sm">Configura primero los datos del negocio</p>
                    <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">Para crear usuarios del equipo, completa Nombre del negocio, RUT y Rubro en la pestaña «Mi Negocio».</p>
                  </div>
                </div>
              </div>
            ) : null}
            {puedeGestionarEquipo ? (
              equipo === null ? (
                <div className="p-8 text-center text-on-surface-variant text-sm">
                  <span className="material-symbols-outlined animate-spin inline-block">autorenew</span>
                </div>
              ) : equipo.length === 0 ? (
                <div className="p-8 text-center text-on-surface-variant text-sm">Aún no hay miembros en tu institución.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-on-surface-variant">
                        <th className="px-8 py-4 font-bold uppercase text-[10px]">Email</th>
                        <th className="px-8 py-4 font-bold uppercase text-[10px]">Rol</th>
                        <th className="px-8 py-4 font-bold uppercase text-[10px]">Estado</th>
                        <th className="px-8 py-4 font-bold uppercase text-[10px] text-right">Suscripción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10">
                      {equipo.map((m) => (
                        <tr key={String(m.id)} className="hover:bg-surface-container/50 transition-colors">
                          <td className="px-8 py-4">
                            <p className="font-bold text-on-surface">{String(m.nombre_completo || '—')}</p>
                            <p className="text-xs text-on-surface-variant">{String(m.email)}</p>
                          </td>
                          <td className="px-8 py-4">
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-primary/10 text-primary capitalize">
                              {String(m.rol ?? '—').replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-8 py-4">
                            <span className={cn('flex items-center gap-1.5 text-[10px] font-black uppercase', m.activo ? 'text-success' : 'text-error')}>
                              <span className={cn('w-1.5 h-1.5 rounded-full', m.activo ? 'bg-success' : 'bg-error')}></span>
                              {m.activo ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="px-8 py-4 text-right text-xs font-bold text-on-surface-variant capitalize">
                            {planPorId(String(m.membresia_nivel ?? 'free')).nombre}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <div className="p-8 space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-primary">group</span>
                  </div>
                  <div>
                    <p className="font-bold text-on-surface">Tu equipo se gestiona desde la Administración</p>
                    <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
                      Los colaboradores, roles y permisos del ERP se administran según tu vinculación a una institución.
                      Como tu rol actual es <strong className="text-on-surface capitalize">{perfil.rol.replace(/_/g, ' ')}</strong>, puedes
                      gestionar tu empleo o vincular tu negocio desde tu institución.
                    </p>
                  </div>
                </div>
                <Link to="/erp/mi-institucion"
                  className="inline-flex items-center gap-2 px-5 py-3 border-2 border-outline-variant rounded-xl text-sm font-bold text-on-surface-variant hover:border-primary hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">domain</span>
                  Ver mi institución
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ Inventario: costeo y frascos abiertos (services/inventarioFraccionado.ts) ══ */}
      {tab === 'inventario' && (
        <div className="space-y-6 max-w-xl">
          <div className="bg-surface-container-lowest dark-card rounded-3xl border border-outline-variant/20 shadow-sm p-6 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-on-surface flex items-center gap-2"><span className="material-symbols-outlined text-primary">calculate</span>Método de costeo</h3>
              <p className="text-xs text-on-surface-variant mt-1">Cambia el método solo al inicio de un año: afecta el costo de las próximas ventas y tus reportes. LIFO no se acepta en Chile.</p>
            </div>
            {([
              { valor: 'promedio', titulo: 'Promedio ponderado', detalle: 'Usa el promedio de todo tu stock, recalculado en cada compra.' },
              { valor: 'fifo', titulo: 'FIFO / PEPS', detalle: 'Cada venta usa el costo de la compra más antigua con stock.' },
            ] as const).map(op => (
              <label key={op.valor} className={cn('flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3', metodoCosteo === op.valor ? 'border-primary bg-primary/5' : 'border-outline-variant/30')}>
                <input type="radio" name="metodo-costeo" className="mt-1 accent-primary" checked={metodoCosteo === op.valor} disabled={!puedeHacer('editar_mi_negocio')}
                  onChange={() => { setMetodoCosteo(op.valor); notificar('ok', 'Método de costeo actualizado.'); }} />
                <span><span className="block text-sm font-bold text-on-surface">{op.titulo}</span><span className="block text-xs text-on-surface-variant">{op.detalle}</span></span>
              </label>
            ))}
          </div>

          <div className="bg-surface-container-lowest dark-card rounded-3xl border border-outline-variant/20 shadow-sm p-6 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-on-surface flex items-center gap-2"><span className="material-symbols-outlined text-primary">water_drop</span>Frascos y sacos abiertos</h3>
              <p className="text-xs text-on-surface-variant mt-1">Al vender una subcategoría (decant, kilo suelto) se usa una abierta que alcance sola. Si ninguna alcanza y hay cerradas, se abre la siguiente automáticamente y te avisa; si el stock total no alcanza, la venta se bloquea.</p>
            </div>
            {([
              { valor: 'menos_contenido', titulo: 'El que tiene menos (recomendado)', detalle: 'Termina primero los envases casi vacíos.' },
              { valor: 'mas_antiguo', titulo: 'El abierto hace más tiempo', detalle: 'Útil si el producto pierde calidad una vez abierto.' },
            ] as const).map(op => (
              <label key={op.valor} className={cn('flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3', politicaEnvaseAbierto === op.valor ? 'border-primary bg-primary/5' : 'border-outline-variant/30')}>
                <input type="radio" name="politica-envase" className="mt-1 accent-primary" checked={politicaEnvaseAbierto === op.valor} disabled={!puedeHacer('editar_mi_negocio')}
                  onChange={() => { setPoliticaInventario({ politicaEnvaseAbierto: op.valor }); notificar('ok', 'Preferencia guardada.'); }} />
                <span><span className="block text-sm font-bold text-on-surface">{op.titulo}</span><span className="block text-xs text-on-surface-variant">{op.detalle}</span></span>
              </label>
            ))}
            <label className="flex items-start gap-3 rounded-2xl border border-outline-variant/30 p-3">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={permitirMezclarEnvases} disabled={!puedeHacer('editar_mi_negocio')}
                onChange={e => { setPoliticaInventario({ permitirMezclarEnvases: e.target.checked }); notificar('ok', 'Preferencia guardada.'); }} />
              <span>
                <span className="block text-sm font-bold text-on-surface">Combinar abiertas antes de abrir una nueva</span>
                <span className="block text-xs text-on-surface-variant">Por ejemplo, un decant de 5 ml con 3 ml de F3 y 2 ml de F4. Si está apagado, se abre otra y el remanente queda para más tarde (cuando ya no quedan cerradas siempre se combinan).</span>
              </span>
            </label>
          </div>

          <div className="bg-surface-container-lowest dark-card rounded-3xl border border-outline-variant/20 shadow-sm p-4 sm:p-6 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-on-surface flex items-center gap-2"><span className="material-symbols-outlined text-primary">percent</span>Margen objetivo</h3>
              <p className="text-xs text-on-surface-variant mt-1">Se usa para sugerir el precio de una subcategoría cuando no hay otro producto del que copiar el margen.</p>
            </div>
            <label className="flex flex-wrap items-center gap-2 text-sm text-on-surface">
              <input type="number" min={0} max={90} inputMode="decimal" className="min-h-11 w-24 rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3 text-base sm:text-sm"
                value={margenObjetivo} disabled={!puedeHacer('editar_mi_negocio')}
                onChange={e => setMargenObjetivo(Math.min(90, Math.max(0, Number(e.target.value) || 0)))} />
              % sobre el precio neto
            </label>
          </div>

          <div className="bg-surface-container-lowest dark-card rounded-3xl border border-outline-variant/20 shadow-sm p-4 sm:p-6 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-on-surface flex items-center gap-2"><span className="material-symbols-outlined text-primary">bookmarks</span>Subcategorías frecuentes</h3>
              <p className="text-xs text-on-surface-variant mt-1">Plantillas que aparecen como sugerencias al registrar un producto («Decant 5 ml», «Malla 5 kg»). Cada producto guarda su propia copia: eliminar una plantilla no cambia los productos que ya la usan.</p>
            </div>
            {plantillasSubcategoria.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-outline-variant/40 px-4 py-4 text-center text-xs text-on-surface-variant">
                Aún no tienes plantillas. En el registro de un producto, usa el menú ⋯ de una subcategoría y elige «Guardar como plantilla».
              </p>
            ) : (
              <ul className="divide-y divide-outline-variant/20 rounded-2xl border border-outline-variant/30">
                {plantillasSubcategoria.map(t => (
                  <li key={t.id} className={cn('flex flex-wrap items-center gap-2 px-3 py-2', t.oculta && 'opacity-60')}>
                    <input aria-label={`Nombre de la plantilla ${t.nombre}`} className="min-h-11 min-w-0 flex-1 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 text-base font-bold sm:text-sm"
                      value={t.nombre} disabled={!puedeHacer('editar_mi_negocio')} onChange={e => actualizarPlantilla(t.id, { nombre: e.target.value })} />
                    <span className="text-xs text-on-surface-variant">{t.tipo === 'variable' ? `Precio por ${t.unidad}` : `${t.cantidad.toLocaleString('es-CL')} ${t.unidad === 'l' ? 'L' : t.unidad}`}{t.rubro ? ` · ${t.rubro}` : ''}</span>
                    <button type="button" disabled={!puedeHacer('editar_mi_negocio')} onClick={() => actualizarPlantilla(t.id, { oculta: !t.oculta })}
                      className="min-h-11 rounded-full px-3 text-xs font-bold text-on-surface-variant hover:text-primary">{t.oculta ? 'Mostrar' : 'Ocultar'}</button>
                    <button type="button" disabled={!puedeHacer('editar_mi_negocio')}
                      onClick={() => { if (window.confirm(`¿Eliminar la plantilla «${t.nombre}»? Los productos que ya la usan no cambian.`)) { eliminarPlantilla(t.id); notificar('ok', 'Plantilla eliminada.'); } }}
                      className="min-h-11 rounded-full px-3 text-xs font-bold text-error hover:bg-error/10">Eliminar</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ══ Alertas: categorías, anticipación y umbrales (services/alertas.ts) ══ */}
      {tab === 'alertas' && (
        <div className="space-y-6 max-w-xl">
          <div className="bg-surface-container-lowest dark-card rounded-3xl border border-outline-variant/20 shadow-sm p-4 sm:p-6 space-y-3">
            <div>
              <h3 className="text-lg font-bold text-on-surface flex items-center gap-2"><span className="material-symbols-outlined text-primary">notifications</span>Qué alertas quieres ver</h3>
              <p className="text-xs text-on-surface-variant mt-1">Apagar una categoría la oculta del Centro de alertas, la campana y el panel general.</p>
            </div>
            {CATEGORIAS.map(c => {
              const activa = configAlertas.categorias?.[c.valor] !== false;
              return (
                <label key={c.valor} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-outline-variant/30 px-3">
                  <span className="material-symbols-outlined text-primary">{c.icono}</span>
                  <span className="flex-1 text-sm font-bold text-on-surface">{c.etiqueta}</span>
                  <input type="checkbox" className="h-5 w-5 accent-primary" checked={activa} disabled={!puedeHacer('editar_mi_negocio')}
                    onChange={e => setConfigAlertas({ categorias: { ...(configAlertas.categorias ?? {}), [c.valor]: e.target.checked } })} />
                </label>
              );
            })}
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-outline-variant/30 px-3">
              <span className="material-symbols-outlined text-success">trending_up</span>
              <span className="flex-1 text-sm font-bold text-on-surface">Mostrar alertas positivas (flujo del mes)</span>
              <input type="checkbox" className="h-5 w-5 accent-primary" checked={configAlertas.mostrarPositivas !== false} disabled={!puedeHacer('editar_mi_negocio')}
                onChange={e => setConfigAlertas({ mostrarPositivas: e.target.checked })} />
            </label>
          </div>

          <div className="bg-surface-container-lowest dark-card rounded-3xl border border-outline-variant/20 shadow-sm p-4 sm:p-6 space-y-3">
            <h3 className="text-lg font-bold text-on-surface flex items-center gap-2"><span className="material-symbols-outlined text-primary">schedule</span>Anticipación y umbrales</h3>
            {([
              { clave: 'diasF29', etiqueta: 'Avisar el F29 con', sufijo: 'días de anticipación' },
              { clave: 'diasCobros', etiqueta: 'Avisar cobros por vencer con', sufijo: 'días' },
              { clave: 'diasPagos', etiqueta: 'Avisar pagos por vencer con', sufijo: 'días' },
              { clave: 'diasQuiebre', etiqueta: 'Avisar quiebre de stock si alcanza para menos de', sufijo: 'días de venta' },
              { clave: 'diasLoteVence', etiqueta: 'Avisar lotes por vencer con', sufijo: 'días' },
              { clave: 'diasSinRotar', etiqueta: 'Perecibles sin vender en', sufijo: 'días = «sin rotar»' },
            ] as const).map(c => (
              <label key={c.clave} className="flex flex-wrap items-center gap-2 text-sm text-on-surface">
                <span className="min-w-0 flex-1">{c.etiqueta}</span>
                <input type="number" min={0} max={365} inputMode="numeric" className="min-h-11 w-20 rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3 text-base sm:text-sm"
                  value={configAlertas[c.clave] ?? CONFIG_ALERTAS_DEFECTO[c.clave]} disabled={!puedeHacer('editar_mi_negocio')}
                  onChange={e => setConfigAlertas({ [c.clave]: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })} />
                <span className="text-xs text-on-surface-variant">{c.sufijo}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ══ Integraciones ══ */}
      {tab === 'integraciones' && (
        <div className="space-y-6 max-w-xl">
          <div className="bg-surface-container-lowest dark-card rounded-3xl border border-outline-variant/20 shadow-sm p-8">
            <h3 className="text-lg font-bold text-on-surface mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">account_balance</span>
              Integración con SII
              {siiModoPrueba && <span className="ml-auto text-[10px] font-extrabold uppercase tracking-widest bg-warning/15 text-warning px-2.5 py-1 rounded-full">Modo prueba</span>}
            </h3>
            <p className="text-sm text-on-surface-variant mb-6">Parámetros que el ERP usa para la declaración de impuestos (F29 e IVA mensual).</p>
            {siiModoPrueba && (
              <p className="-mt-3 mb-5 p-3 rounded-xl bg-warning/10 text-xs font-medium text-on-surface-variant leading-relaxed">
                Los documentos se generan en ambiente de prueba: no se envían al SII ni tienen validez tributaria.
              </p>
            )}

            <div className="divide-y divide-outline-variant/10 mb-6">
              {[
                { label: 'Modo de integración', valor: MODO_SII[configuracionCumplimiento.modoIntegracion] ?? configuracionCumplimiento.modoIntegracion },
                { label: 'Ambiente', valor: configuracionCumplimiento.ambiente === 'produccion' ? 'Producción' : 'Prueba' },
                { label: 'Uso de folios manuales', valor: configuracionCumplimiento.usaFoliosManual ? 'Habilitado' : 'Deshabilitado' },
                { label: 'Declaradores disponibles', valor: 'F29 mensual' },
              ].map(item => (
                <div key={item.label} className="py-3 flex justify-between items-center">
                  <p className="text-sm font-bold text-on-surface-variant">{item.label}</p>
                  <p className="text-sm font-black text-on-surface">{item.valor}</p>
                </div>
              ))}
            </div>

            <div className="p-4 rounded-2xl border border-warning/30 bg-warning/10">
              <div className="flex gap-3">
                <span className="material-symbols-outlined text-warning">security</span>
                <div>
                  <p className="text-xs font-bold text-warning uppercase tracking-tight">Seguridad de tus datos</p>
                  <p className="text-[11px] text-on-surface-variant mt-1 leading-relaxed">
                    No almacenamos tu clave tributaria. Los parámetros se guardan de forma local y segura para el cálculo de tus declaraciones.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-lowest dark-card rounded-3xl border border-outline-variant/20 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-primary">percent</span>
              <div>
                <h3 className="font-bold text-on-surface">Tasa de PPM (Pagos Provisionales Mensuales)</h3>
                <p className="text-xs text-on-surface-variant">Ingresa el porcentaje que aparece en tu resolución de PPM para el cálculo del F29.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <input
                type="number" step="0.1" min="0" max="100" value={ppm}
                onChange={e => setPpm(e.target.value)}
                className="flex-1 px-4 py-3 border-2 border-outline-variant/50 rounded-xl text-sm font-bold focus:border-primary outline-none bg-surface-container-lowest text-on-surface" />
              <button onClick={guardarPpm}
                className="px-6 py-3 bg-primary text-inverse-on-surface rounded-xl font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
                {ppmGuardado ? 'Guardado' : 'Guardar'}
              </button>
            </div>
          </div>

          {/* Estado real de conexión (corrección #31): no hay credenciales SII guardadas, así que nunca "conectada" a medias */}
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest dark-card p-5 text-sm text-on-surface-variant space-y-2">
            <p className="flex items-center justify-between gap-3">
              <span className="font-black text-on-surface">SII</span>
              <span>{siiModoPrueba ? 'Modo prueba' : configuracionCumplimiento.modoIntegracion === 'api_integrated' ? `Conectada como ${perfil.negocio_rut || perfil.email}` : 'No conectada (declaración manual)'}</span>
            </p>
            <p className="flex items-center justify-between gap-3">
              <span className="font-black text-on-surface">Webpay (suscripción)</span>
              <span>{WEBPAY_MODO_PRUEBA ? 'Modo prueba' : 'Producción'}</span>
            </p>
          </div>
        </div>
      )}

      {/* ══ Suscripción ══ */}
      {tab === 'facturacion' && (
        <div className="max-w-xl bg-surface-container-lowest dark-card rounded-3xl border border-outline-variant/20 shadow-sm p-8">
          <h3 className="text-lg font-bold text-on-surface mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">credit_card</span>
            Tu Suscripción
          </h3>

          <div className={cn('p-5 rounded-2xl mb-6 border-2',
            perfil.membresia_nivel === 'free' ? 'bg-surface-container border-outline-variant/40' : 'bg-success/10 border-success/40')}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Plan Actual</p>
                <h4 className="text-xl font-extrabold text-on-surface">{planPorId(perfil.membresia_nivel).nombre}</h4>
              </div>
              <span className={cn('material-symbols-outlined text-4xl',
                perfil.membresia_nivel === 'free' ? 'text-on-surface-variant/50' : 'text-success')}>
                workspace_premium
              </span>
            </div>
            {perfil.membresia_expira && perfil.membresia_nivel !== 'free' && (
              <p className="text-xs text-on-surface-variant mt-2">Vigente hasta: <strong className="text-on-surface">{formatFecha(perfil.membresia_expira)}</strong></p>
            )}
          </div>

          {perfil.membresia_nivel === 'free' ? (
            <Link to="/erp/suscripcion"
              className="w-full flex items-center justify-center gap-2 py-4 bg-warning hover:bg-warning/90 text-inverse-on-surface font-bold rounded-2xl text-base transition-colors shadow-lg shadow-warning/25">
              <span className="material-symbols-outlined">rocket_launch</span>
              Mejorar mi plan — desde {formatCLP(PLANES[1].precio)}/mes
            </Link>
          ) : (
            <div className="space-y-3">
              <Link to="/erp/suscripcion"
                className="w-full py-3 border-2 border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary rounded-2xl font-bold text-sm transition-colors flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-lg">receipt_long</span>
                Ver historial de pagos
              </Link>
              <p className="text-[11px] text-on-surface-variant text-center leading-relaxed">
                La cancelación de suscripción se gestiona a través de tu institución o contactando al soporte.
              </p>
            </div>
          )}
        </div>
      )}

      {!puedeHacer('editar_mi_negocio') && tab === 'negocio' && (
        <div className="rounded-2xl border border-error/30 bg-error/10 p-5 text-sm text-error font-bold">
          Tu rol actual no tiene permiso para editar los datos del negocio.
        </div>
      )}
        </div>
      </div>

      {/* Modal Nuevo Usuario — mismo patrón que «Nueva Venta» en el módulo de ventas */}
      {mostrarFormNuevoUsuario && puedeGestionarEquipo && negocioCompleto && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-scrim/50 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => { if (!guardandoUsuario) setMostrarFormNuevoUsuario(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Nuevo usuario del equipo"
            onClick={e => e.stopPropagation()}
            className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-surface-container-lowest shadow-2xl sm:max-h-[90vh] sm:rounded-3xl"
          >
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-outline-variant/20 bg-surface-container-low/50 px-5 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <span className="material-symbols-outlined text-xl">person_add</span>
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-bold text-primary">Nuevo usuario</h3>
                  <p className="truncate text-xs font-semibold text-on-surface-variant">Se sumará al equipo de tu negocio</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMostrarFormNuevoUsuario(false)}
                disabled={guardandoUsuario}
                aria-label="Cerrar"
                className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container hover:text-error disabled:opacity-50"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Nombre</label>
                  <input
                    value={formNuevoUsuario.nombre}
                    onChange={e => setFormNuevoUsuario(p => ({ ...p, nombre: e.target.value }))}
                    placeholder="Ej: Mario"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Apellido</label>
                  <input
                    value={formNuevoUsuario.apellido}
                    onChange={e => setFormNuevoUsuario(p => ({ ...p, apellido: e.target.value }))}
                    placeholder="Ej: Tapia"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Rol</label>
                  <SelectorDesplegable
                    variante="campo"
                    valor={formNuevoUsuario.rol}
                    opciones={opcionesRolUsuario}
                    onChange={v => setFormNuevoUsuario(p => ({ ...p, rol: v as 'vendedor' | 'gestor' | 'empleado' }))}
                  />
                </div>
                <div>
                  <label className={labelCls}>Contraseña (opcional)</label>
                  <input
                    type="password"
                    value={formNuevoUsuario.password}
                    onChange={e => setFormNuevoUsuario(p => ({ ...p, password: e.target.value }))}
                    placeholder="Por defecto si se deja vacía"
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-dashed border-outline-variant/40 bg-surface-container-low/50 p-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-outline text-base">email</span>
                  <p className="text-xs font-bold text-on-surface">Correo de acceso:</p>
                  <span className="truncate font-mono text-sm font-bold text-primary">{emailPreview || '—'}</span>
                </div>
                <p className="mt-1 text-[10px] text-on-surface-variant">Formato: inicial del nombre + apellido + @pymedu.cl</p>
              </div>
            </div>

            <footer className="flex shrink-0 justify-end gap-3 border-t border-outline-variant/20 bg-surface-container-low/30 px-5 py-4 sm:px-6">
              <button
                type="button"
                onClick={() => setMostrarFormNuevoUsuario(false)}
                disabled={guardandoUsuario}
                className="min-h-11 rounded-full px-5 text-sm font-bold text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={crearUsuarioPyme}
                disabled={guardandoUsuario || !negocioCompleto}
                className="min-h-11 rounded-full bg-primary px-6 text-sm font-bold text-inverse-on-surface hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {guardandoUsuario ? 'Creando…' : 'Crear usuario'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
