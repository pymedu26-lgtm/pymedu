import { useState } from 'react';

const integraciones = [
  { id: 'sso', nombre: 'SSO / SAML', descripcion: 'Inicio de sesion unico con proveedores corporativos', icon: 'key', estado: 'activo' as const, proveedor: 'Okta', ultimaSync: 'Hace 5 min' },
  { id: 'stripe', nombre: 'Pasarela de Pagos', descripcion: 'Cobros y suscripciones de planes', icon: 'payments', estado: 'activo' as const, proveedor: 'Stripe', ultimaSync: 'Hace 12 min' },
  { id: 'sendgrid', nombre: 'Email Transaccional', descripcion: 'Envio de correos, notificaciones y alertas', icon: 'mail', estado: 'activo' as const, proveedor: 'SendGrid', ultimaSync: 'Hace 1 hora' },
  { id: 'postgres', nombre: 'Base de Datos', descripcion: 'PostgreSQL alojado en Railway', estado: 'activo' as const, proveedor: 'Railway', ultimaSync: 'Tiempo real' },
  { id: 'analytics', nombre: 'Analytics', descripcion: 'Metricas de uso y comportamiento', icon: 'analytics', estado: 'inactivo' as const, proveedor: 'No configurado', ultimaSync: '—' },
  { id: 'webhooks', nombre: 'Webhooks', descripcion: 'Endpoints para integraciones externas', icon: 'webhook', estado: 'activo' as const, proveedor: '3 endpoints activos', ultimaSync: 'Hace 30 min' },
];

const apis = [
  { id: 'api1', nombre: 'API Publica v2', endpoint: 'https://api.pymedu.cl/v2', estado: 'activa' as const, llamadas: '12.4k/dia', rateLimit: '1000 req/min' },
  { id: 'api2', nombre: 'Webhook接收', endpoint: 'https://api.pymedu.cl/webhooks', estado: 'activa' as const, llamadas: '340/dia', rateLimit: '200 req/min' },
];

export default function SuperAdminConfig() {
  const [seccion, setSeccion] = useState<'integraciones' | 'branding' | 'apis' | 'plantillas'>('integraciones');

  const secciones = [
    { id: 'integraciones' as const, label: 'Integraciones', icon: 'extension' },
    { id: 'apis' as const, label: 'APIs', icon: 'api' },
    { id: 'branding' as const, label: 'Branding', icon: 'palette' },
    { id: 'plantillas' as const, label: 'Plantillas', icon: 'description' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-3xl text-slate-500">settings</span>
        <div>
          <h1 className="text-2xl font-extrabold text-on-surface">Configuracion Global</h1>
          <p className="text-on-surface-variant">Integraciones, branding, APIs y plantillas de la plataforma</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-56 shrink-0">
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-2 flex lg:flex-col gap-1 overflow-x-auto">
            {secciones.map((sec) => (
              <button
                key={sec.id}
                onClick={() => setSeccion(sec.id)}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                  seccion === sec.id
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-on-surface-variant hover:bg-surface-container-high border border-transparent'
                }`}
              >
                <span className="material-symbols-outlined text-lg">{sec.icon}</span>
                {sec.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-6">
          {seccion === 'integraciones' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-extrabold text-on-surface">Integraciones Activas</h2>
                <button className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-primary/30 text-sm font-bold text-primary hover:bg-primary/5 transition-colors">
                  <span className="material-symbols-outlined text-lg">add</span>
                  Nueva Integracion
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {integraciones.map((int) => (
                  <div key={int.id} className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-5 hover:border-primary/20 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-container-high text-on-surface-variant">
                          <span className="material-symbols-outlined">{int.icon}</span>
                        </span>
                        <div>
                          <h3 className="font-extrabold text-on-surface text-sm">{int.nombre}</h3>
                          <p className="text-xs text-on-surface-variant">{int.descripcion}</p>
                        </div>
                      </div>
                      <label className="relative inline-flex cursor-pointer shrink-0">
                        <input type="checkbox" className="sr-only peer" defaultChecked={int.estado === 'activo'} />
                        <div className="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </div>
                    <div className="flex items-center justify-between text-xs text-on-surface-variant pt-2 border-t border-outline-variant/20">
                      <span>Proveedor: <span className="font-bold">{int.proveedor}</span></span>
                      <span>{int.ultimaSync}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {seccion === 'apis' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-extrabold text-on-surface">APIs y Conexiones Externas</h2>
                <button className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-primary/30 text-sm font-bold text-primary hover:bg-primary/5 transition-colors">
                  <span className="material-symbols-outlined text-lg">add</span>
                  Nueva API Key
                </button>
              </div>
              <div className="space-y-3">
                {apis.map((api) => (
                  <div key={api.id} className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 text-green-600">
                          <span className="material-symbols-outlined">api</span>
                        </span>
                        <div>
                          <h3 className="font-extrabold text-on-surface">{api.nombre}</h3>
                          <code className="text-xs text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded">{api.endpoint}</code>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${api.estado === 'activa' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {api.estado}
                      </span>
                    </div>
                    <div className="flex items-center gap-6 text-xs text-on-surface-variant">
                      <span>Llamadas: <span className="font-bold">{api.llamadas}</span></span>
                      <span>Rate limit: <span className="font-bold">{api.rateLimit}</span></span>
                      <button className="ml-auto text-primary font-bold hover:underline">Regenerar clave</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-5">
                <h3 className="font-extrabold text-on-surface mb-3">Documentacion API</h3>
                <p className="text-sm text-on-surface-variant mb-3">Accede a la documentacion completa de la API de PymEdu para desarrolladores.</p>
                <div className="flex items-center gap-3">
                  <button className="px-4 py-2 rounded-xl text-sm font-bold border-2 border-surface-container-high hover:border-primary/30 transition-colors">
                    Ver documentacion
                  </button>
                  <button className="px-4 py-2 rounded-xl text-sm font-bold border-2 border-surface-container-high hover:border-primary/30 transition-colors">
                    Descargar OpenAPI spec
                  </button>
                </div>
              </div>
            </div>
          )}

          {seccion === 'branding' && (
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-6 space-y-5">
              <h2 className="font-extrabold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">palette</span>
                Branding Base de la Plataforma
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1">Nombre de la plataforma</label>
                  <input type="text" defaultValue="PymEdu" className="w-full p-3 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none transition-all text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1">URL del logo</label>
                  <input type="text" placeholder="https://..." className="w-full p-3 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none transition-all text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1">Color primario</label>
                  <div className="flex items-center gap-2">
                    <input type="color" defaultValue="#6366f1" className="h-10 w-14 rounded-lg cursor-pointer" />
                    <input type="text" defaultValue="#6366f1" className="flex-1 p-3 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none transition-all text-sm font-mono" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1">Color secundario</label>
                  <div className="flex items-center gap-2">
                    <input type="color" defaultValue="#8b5cf6" className="h-10 w-14 rounded-lg cursor-pointer" />
                    <input type="text" defaultValue="#8b5cf6" className="flex-1 p-3 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none transition-all text-sm font-mono" />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-on-surface-variant mb-1">Titulo del email de bienvenida</label>
                  <input type="text" defaultValue="Bienvenido a PymEdu" className="w-full p-3 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none transition-all text-sm" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-on-surface-variant mb-1">Mensaje de bienvenida</label>
                  <textarea rows={3} defaultValue="Tu plataforma de emprendimiento esta lista. Comienza a gestionar tu negocio hoy." className="w-full p-3 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none transition-all text-sm resize-none" />
                </div>
              </div>
              <div className="flex justify-end">
                <button className="px-5 py-2.5 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-colors text-sm">Guardar Cambios</button>
              </div>
            </div>
          )}

          {seccion === 'plantillas' && (
            <div className="space-y-4">
              <h2 className="font-extrabold text-on-surface">Plantillas Globales</h2>
              {[
                { nombre: 'Email de bienvenida', tipo: 'email', icon: 'mail', activa: true },
                { nombre: 'Invitacion a mentor', tipo: 'email', icon: 'mail', activa: true },
                { nombre: 'Alerta de riesgo', tipo: 'notificacion', icon: 'notifications', activa: true },
                { nombre: 'Reporte mensual', tipo: 'email', icon: 'mail', activa: true },
                { nombre: 'Cierre de cohorte', tipo: 'email', icon: 'mail', activa: false },
                { nombre: 'Certificado de completacion', tipo: 'documento', icon: 'description', activa: true },
              ].map((plantilla, i) => (
                <div key={i} className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-4 flex items-center justify-between hover:border-primary/20 transition-colors">
                  <div className="flex items-center gap-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-container-high text-on-surface-variant">
                      <span className="material-symbols-outlined">{plantilla.icon}</span>
                    </span>
                    <div>
                      <p className="font-bold text-on-surface text-sm">{plantilla.nombre}</p>
                      <p className="text-xs text-on-surface-variant">Tipo: {plantilla.tipo}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${plantilla.activa ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                      {plantilla.activa ? 'Activa' : 'Inactiva'}
                    </span>
                    <button className="p-2 rounded-lg hover:bg-surface-container-high transition-colors">
                      <span className="material-symbols-outlined text-on-surface-variant">edit</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
