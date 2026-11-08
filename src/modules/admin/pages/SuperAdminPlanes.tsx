import { useState } from 'react';
import { formatCLP } from '../../../lib/fechas';
import { PLANES, periodoPlan } from '../../../lib/planes';

const modulosGlobales = [
  { id: 'academia', nombre: 'Academia', icon: 'school', descripcion: 'Cursos, módulos y certificaciones', incluidoEn: ['Básico', 'Pro', 'Premium'] },
  { id: 'erp', nombre: 'ERP', icon: 'point_of_sale', descripcion: 'Ventas, gastos, inventario y contabilidad', incluidoEn: ['Básico', 'Pro', 'Premium'] },
  { id: 'mentoria', nombre: 'Mentoría', icon: 'groups', descripcion: 'Sesiones, seguimiento y acuerdos', incluidoEn: ['Pro', 'Premium'] },
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
            <p className="text-on-surface-variant">Planes de suscripción vigentes y módulos de la plataforma</p>
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
          {/* Planes de emprendedor cobrados por Webpay: fuente única en lib/planes.ts (solo lectura) */}
          <p className="text-xs text-on-surface-variant">
            Solo lectura. Montos y duración los define el servidor de pagos (Webpay); para cambiarlos hay que actualizar el servidor y <code>src/lib/planes.ts</code>.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PLANES.map((plan) => (
              <div key={plan.id} className={`bg-surface-container-lowest rounded-2xl p-5 border-2 relative ${plan.destacado ? 'border-info/40' : 'border-outline-variant/30'}`}>
                {plan.destacado && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-extrabold bg-info text-inverse-on-surface">
                    POPULAR
                  </span>
                )}
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-surface-container text-on-surface-variant">{plan.nombre}</span>
                <div className="my-3">
                  <span className="text-3xl font-extrabold text-on-surface">{plan.precio === 0 ? 'Gratis' : formatCLP(plan.precio)}</span>
                  <span className="text-sm text-on-surface-variant"> {periodoPlan(plan)}</span>
                </div>
                <p className="text-xs text-on-surface-variant mb-4">{plan.descripcion}</p>
                <p className="text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-1">Incluye</p>
                <ul className="space-y-1">
                  {plan.features.map((f) => (
                    <li key={f.texto} className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                      <span className={`material-symbols-outlined text-sm ${f.estado === 'proximamente' ? 'text-warning' : 'text-success'}`}>
                        {f.estado === 'proximamente' ? 'schedule' : 'check'}
                      </span>
                      {f.texto}{f.estado === 'proximamente' && ' (próximamente)'}
                    </li>
                  ))}
                </ul>
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
