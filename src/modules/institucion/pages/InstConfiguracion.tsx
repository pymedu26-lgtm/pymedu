import { useState } from 'react';

export default function InstConfiguracion() {
  const [seccion, setSeccion] = useState<'general' | 'comunidad' | 'notificaciones' | 'segmentacion'>('general');

  const secciones = [
    { id: 'general' as const, label: 'General', icon: 'settings' },
    { id: 'comunidad' as const, label: 'Comunidad', icon: 'groups' },
    { id: 'segmentacion' as const, label: 'Segmentación', icon: 'tune' },
    { id: 'notificaciones' as const, label: 'Notificaciones', icon: 'notifications' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-3xl text-on-surface-variant">settings</span>
        <div>
          <h1 className="text-2xl font-extrabold text-on-surface">Configuración Institucional</h1>
          <p className="text-on-surface-variant">Administra los ajustes de tu institución</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar de secciones */}
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

        {/* Contenido */}
        <div className="flex-1 space-y-6">
          {seccion === 'general' && (
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-6 space-y-5">
              <h2 className="font-extrabold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">settings</span>
                Información General
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1">Nombre de la institución</label>
                  <input type="text" defaultValue="Municipalidad de Santiago" className="w-full p-3 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none transition-all text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1">Tipo de institución</label>
                  <select defaultValue="municipalidad" className="w-full p-3 rounded-xl border-2 border-surface-container-high outline-none text-sm">
                    <option value="municipalidad">Municipalidad</option>
                    <option value="incubadora">Incubadora</option>
                    <option value="universidad">Universidad</option>
                    <option value="fundacion">Fundación</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1">RUT</label>
                  <input type="text" defaultValue="76.000.000-0" className="w-full p-3 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none transition-all text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1">Región</label>
                  <select defaultValue="Metropolitana" className="w-full p-3 rounded-xl border-2 border-surface-container-high outline-none text-sm">
                    <option>Metropolitana</option>
                    <option>Valparaíso</option>
                    <option>Biobío</option>
                    <option>O'Higgins</option>
                    <option>Araucanía</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-on-surface-variant mb-1">Dirección</label>
                  <input type="text" defaultValue="Calle Principal 1234, Santiago" className="w-full p-3 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none transition-all text-sm" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-on-surface-variant mb-1">Descripción</label>
                  <textarea rows={3} defaultValue="Institución dedicada al apoyo de emprendedores locales a través de formación, mentoría y acompanhamiento integral." className="w-full p-3 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none transition-all text-sm resize-none" />
                </div>
              </div>
              <div className="flex justify-end">
                <button className="px-5 py-2.5 bg-primary text-inverse-on-surface font-bold rounded-xl hover:bg-primary/90 transition-colors text-sm">
                  Guardar Cambios
                </button>
              </div>
            </div>
          )}

          {seccion === 'comunidad' && (
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-6 space-y-5">
              <h2 className="font-extrabold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">groups</span>
                Configuración de Comunidad
              </h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-xl bg-surface-container-low border border-outline-variant/20">
                  <div>
                    <p className="font-bold text-on-surface text-sm">Auto-asignación de mentores</p>
                    <p className="text-xs text-on-surface-variant">Permitir que los mentores se auto-asignen a emprendedores</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between p-4 rounded-xl bg-surface-container-low border border-outline-variant/20">
                  <div>
                    <p className="font-bold text-on-surface text-sm">Aprobación de nuevos miembros</p>
                    <p className="text-xs text-on-surface-variant">Requerir aprobación manual para nuevos ingresos a la comunidad</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between p-4 rounded-xl bg-surface-container-low border border-outline-variant/20">
                  <div>
                    <p className="font-bold text-on-surface text-sm">Perfiles públicos</p>
                    <p className="text-xs text-on-surface-variant">Mostrar perfiles de emprendedores a otros miembros de la comunidad</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer">
                    <input type="checkbox" className="sr-only peer" />
                    <div className="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1">Cupos máximos por cohorte</label>
                  <input type="number" defaultValue={25} className="w-32 p-3 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none transition-all text-sm" />
                </div>
              </div>
              <div className="flex justify-end">
                <button className="px-5 py-2.5 bg-primary text-inverse-on-surface font-bold rounded-xl hover:bg-primary/90 transition-colors text-sm">
                  Guardar Cambios
                </button>
              </div>
            </div>
          )}

          {seccion === 'segmentacion' && (
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-6 space-y-5">
              <h2 className="font-extrabold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">tune</span>
                Segmentación de la Comunidad
              </h2>
              <p className="text-sm text-on-surface-variant">
                Define criterios para segmentar automáticamente a los miembros de la comunidad según sus características.
              </p>
              <div className="space-y-4">
                {[
                  { label: 'Por Región', activo: true, criterios: ['Metropolitana', 'Valparaíso', 'Biobío'] },
                  { label: 'Por Rubro', activo: true, criterios: ['Comercio', 'Tecnología', 'Alimentos', 'Servicios'] },
                  { label: 'Por Etapa del Negocio', activo: false, criterios: ['Idea', 'Validación', 'Crecimiento', 'Consolidado'] },
                  { label: 'Por Nivel de Riesgo', activo: true, criterios: ['Bajo', 'Medio', 'Alto'] },
                ].map((seg, i) => (
                  <div key={i} className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-on-surface text-sm">{seg.label}</span>
                      <label className="relative inline-flex cursor-pointer">
                        <input type="checkbox" className="sr-only peer" defaultChecked={seg.activo} />
                        <div className="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {seg.criterios.map((c, j) => (
                        <span key={j} className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-surface-container-high text-on-surface-variant">
                          {c}
                        </span>
                      ))}
                      <button className="px-2.5 py-1 rounded-full text-[11px] font-bold border border-dashed border-surface-container-high text-on-surface-variant hover:border-primary/30 hover:text-primary transition-colors">
                        + Agregar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <button className="px-5 py-2.5 bg-primary text-inverse-on-surface font-bold rounded-xl hover:bg-primary/90 transition-colors text-sm">
                  Guardar Cambios
                </button>
              </div>
            </div>
          )}

          {seccion === 'notificaciones' && (
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-6 space-y-5">
              <h2 className="font-extrabold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">notifications</span>
                Preferencias de Notificaciones
              </h2>
              <div className="space-y-3">
                {[
                  { label: 'Nuevas inscripciones', desc: 'Cuando un emprendedor se une a la comunidad', on: true },
                  { label: 'Alertas de riesgo', desc: 'Cuando un emprendedor entra en estado de riesgo', on: true },
                  { label: 'Reportes mensuales', desc: 'Resumen automático de métricas institucionales', on: true },
                  { label: 'Cumplimiento de cohortes', desc: 'Cuando una cohorte alcanza el 100% de avance', on: false },
                  { label: 'Actividad de mentores', desc: 'Reporte semanal de actividad de mentores asignados', on: true },
                  { label: 'Vencimientos de documentos', desc: 'Alertas antes del vencimiento de trámites legales', on: true },
                ].map((notif, i) => (
                  <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-surface-container-low border border-outline-variant/20">
                    <div>
                      <p className="font-bold text-on-surface text-sm">{notif.label}</p>
                      <p className="text-xs text-on-surface-variant">{notif.desc}</p>
                    </div>
                    <label className="relative inline-flex cursor-pointer shrink-0 ml-4">
                      <input type="checkbox" className="sr-only peer" defaultChecked={notif.on} />
                      <div className="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <button className="px-5 py-2.5 bg-primary text-inverse-on-surface font-bold rounded-xl hover:bg-primary/90 transition-colors text-sm">
                  Guardar Cambios
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
