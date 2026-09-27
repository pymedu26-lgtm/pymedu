import { useState } from 'react';

const planes = [
  {
    id: 'basico', nombre: 'Básico', precio: 0, periodo: 'Gratis',
    descripcion: 'Para organizaciones que están comenzando.',
    color: 'border-outline-variant/30', badgeColor: 'bg-surface-container text-on-surface-variant',
    modulos: ['Academia'],
    limites: { usuarios: 50, emprendedores: 25, mentores: 5, coordinadores: 2 },
    features: ['Acceso a cursos básicos', '1 coordinador', 'Soporte por email', 'Reportes básicos'],
  },
  {
    id: 'profesional', nombre: 'Profesional', precio: 299000, periodo: '/mes',
    descripcion: 'Para instituciones en crecimiento con necesidades avanzadas.',
    color: 'border-info/30', badgeColor: 'bg-info-container text-on-info-container',
    modulos: ['Academia', 'ERP', 'Mentoría'],
    limites: { usuarios: 200, emprendedores: 100, mentores: 20, coordinadores: 5 },
    features: ['Todo lo del plan Básico', 'ERP completo', 'Mentoría ilimitada', 'Soporte prioritario', 'Reportes avanzados', 'API básica'],
    popular: true,
  },
  {
    id: 'premium', nombre: 'Premium', precio: 599000, periodo: '/mes',
    descripcion: 'Para grandes instituciones con acceso completo.',
    color: 'border-info/30', badgeColor: 'bg-info-container text-on-info-container',
    modulos: ['Academia', 'ERP', 'Mentoría', 'Comunidad', 'Laboratorio'],
    limites: { usuarios: -1, emprendedores: -1, mentores: -1, coordinadores: -1 },
    features: ['Todo lo del plan Profesional', 'Comunidad completa', 'Laboratorio de innovación', 'SSO / SAML', 'Soporte 24/7', 'API completa', 'Branding personalizado', 'SLA garantizado'],
  },
];

const modulosGlobales = [
  { id: 'academia', nombre: 'Academia', icon: 'school', descripcion: 'Cursos, módulos y certificaciones', incluidoEn: ['Básico', 'Profesional', 'Premium'] },
  { id: 'erp', nombre: 'ERP', icon: 'point_of_sale', descripcion: 'Ventas, gastos, inventario y contabilidad', incluidoEn: ['Profesional', 'Premium'] },
  { id: 'mentoria', nombre: 'Mentoría', icon: 'groups', descripcion: 'Sesiones, seguimiento y acuerdos', incluidoEn: ['Profesional', 'Premium'] },
  { id: 'comunidad', nombre: 'Comunidad', icon: 'diversity_3', descripcion: 'Networking y eventos entre emprendedores', incluidoEn: ['Premium'] },
  { id: 'laboratorio', nombre: 'Laboratorio', icon: 'science', descripcion: 'Innovación, prototipos y testing', incluidoEn: ['Premium'] },
];

export default function SuperAdminPlanes() {
  const [tab, setTab] = useState<'planes' | 'modulos'>('planes');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-3xl text-warning">workspace_premium</span>
          <div>
            <h1 className="text-2xl font-extrabold text-on-surface">Planes y Módulos</h1>
            <p className="text-on-surface-variant">Configura los planes de suscripción y módulos de la plataforma</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl border-2 border-surface-container-high overflow-hidden w-fit">
        {(['planes', 'modulos'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-bold transition-colors ${
              tab === t ? 'bg-primary text-inverse-on-surface' : 'hover:bg-surface-container-high text-on-surface-variant'
            }`}
          >
            {t === 'planes' ? 'Planes de Suscripción' : 'Módulos Globales'}
          </button>
        ))}
      </div>

      {tab === 'planes' && (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-3 gap-4">
            {planes.map((plan) => (
              <div key={plan.id} className={`bg-surface-container-lowest rounded-2xl p-5 border-2 ${plan.color} relative`}>
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-extrabold bg-info text-inverse-on-surface">
                    POPULAR
                  </span>
                )}
                <div className="flex items-center justify-between mb-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${plan.badgeColor}`}>{plan.nombre}</span>
                  <button className="p-1 rounded-lg hover:bg-surface-container-high transition-colors">
                    <span className="material-symbols-outlined text-on-surface-variant text-lg">edit</span>
                  </button>
                </div>
                <div className="mb-3">
                  <span className="text-3xl font-extrabold text-on-surface">
                    {plan.precio === 0 ? 'Gratis' : `$${plan.precio.toLocaleString()}`}
                  </span>
                  {plan.precio > 0 && <span className="text-sm text-on-surface-variant">{plan.periodo}</span>}
                </div>
                <p className="text-xs text-on-surface-variant mb-4">{plan.descripcion}</p>

                {/* Módulos */}
                <div className="mb-3">
                  <p className="text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-1">Módulos</p>
                  <div className="flex flex-wrap gap-1">
                    {plan.modulos.map(m => (
                      <span key={m} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-container text-on-teal-container">{m}</span>
                    ))}
                  </div>
                </div>

                {/* Límites */}
                <div className="mb-3">
                  <p className="text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-1">Límites</p>
                  <div className="grid grid-cols-2 gap-1 text-xs text-on-surface-variant">
                    <span>Usuarios: {plan.limites.usuarios === -1 ? 'Ilimitado' : plan.limites.usuarios}</span>
                    <span>Emprendedores: {plan.limites.emprendedores === -1 ? 'Ilimitado' : plan.limites.emprendedores}</span>
                    <span>Mentores: {plan.limites.mentores === -1 ? 'Ilimitado' : plan.limites.mentores}</span>
                    <span>Coords: {plan.limites.coordinadores === -1 ? 'Ilimitado' : plan.limites.coordinadores}</span>
                  </div>
                </div>

                {/* Features */}
                <div>
                  <p className="text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-1">Incluye</p>
                  <ul className="space-y-1">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                        <span className="material-symbols-outlined text-success text-sm">check</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'modulos' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {modulosGlobales.map((mod) => (
            <div key={mod.id} className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-5 hover:border-primary/20 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <span className="material-symbols-outlined">{mod.icon}</span>
                  </span>
                  <div>
                    <h3 className="font-extrabold text-on-surface">{mod.nombre}</h3>
                    <p className="text-xs text-on-surface-variant">{mod.descripcion}</p>
                  </div>
                </div>
                <label className="relative inline-flex cursor-pointer shrink-0">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
              <div>
                <p className="text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-1">Disponible en</p>
                <div className="flex flex-wrap gap-1">
                  {mod.incluidoEn.map(p => (
                    <span key={p} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-container-high text-on-surface-variant">{p}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
