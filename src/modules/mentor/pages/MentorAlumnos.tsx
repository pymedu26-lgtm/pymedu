import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Emprendedor, emprendedores, estadoConfig, riesgoConfig } from '../data';

export default function MentorAlumnos() {
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState<'todos' | 'en_curso' | 'riesgo' | 'cerrado'>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState<Emprendedor | null>(null);

  const filtrados = emprendedores.filter(e => {
    const coincideFiltro = filtro === 'todos' || e.estado === filtro;
    const coincideBusqueda = e.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      e.negocio.toLowerCase().includes(busqueda.toLowerCase());
    return coincideFiltro && coincideBusqueda;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-3xl text-teal">groups</span>
        <h1 className="text-2xl font-extrabold text-on-surface">Mis Emprendedores</h1>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Buscar por nombre o negocio..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="flex-1 p-3 rounded-xl border-2 border-surface-container-high focus:border-primary/50 outline-none transition-all"
        />
        <div className="flex gap-2">
          {(['todos', 'en_curso', 'riesgo', 'cerrado'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                filtro === f
                  ? 'bg-primary text-inverse-on-surface'
                  : 'bg-surface-container-high text-on-surface-variant hover:bg-primary/10'
              }`}
            >
              {f === 'todos' ? 'Todos' : f === 'en_curso' ? 'En curso' : f === 'riesgo' ? 'Riesgo' : 'Cerrados'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
        {/* Lista */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
          <div className="divide-y divide-outline-variant/30">
            {filtrados.map((empre) => (
              <div
                key={empre.id}
                onClick={() => setSeleccionado(empre)}
                className={`p-4 cursor-pointer transition-colors ${
                  seleccionado?.id === empre.id
                    ? 'bg-primary/5 border-l-4 border-primary'
                    : 'hover:bg-surface-container-low/50 border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-container text-on-teal-container text-sm font-extrabold">
                      {empre.nombre[0]}
                    </div>
                    <div>
                      <p className="font-bold text-on-surface">{empre.nombre}</p>
                      <p className="text-sm text-on-surface-variant">{empre.negocio}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {empre.alertas > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-error-container text-on-error-container">
                        {empre.alertas}
                      </span>
                    )}
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${estadoConfig[empre.estado].color}`}>
                      {estadoConfig[empre.estado].label}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-on-surface-variant">
                  <span>{empre.rubro}</span>
                  <span>·</span>
                  <span>{empre.avance}% avance</span>
                  <span>·</span>
                  <span>{empre.ultimaActividad}</span>
                </div>
                <div className="mt-2 w-full bg-surface-container-high rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${empre.riesgo === 'alto' ? 'bg-error' : empre.riesgo === 'medio' ? 'bg-warning' : 'bg-teal'}`}
                    style={{ width: `${empre.avance}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ficha detallada */}
        {seleccionado ? (
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden h-fit lg:sticky lg:top-6">
            <div className="p-5 border-b border-outline-variant/30">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-container text-on-teal-container font-extrabold text-lg">
                  {seleccionado.nombre[0]}
                </div>
                <div>
                  <p className="font-extrabold text-on-surface">{seleccionado.nombre}</p>
                  <p className="text-sm text-on-surface-variant">{seleccionado.negocio}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${estadoConfig[seleccionado.estado].color}`}>
                  {estadoConfig[seleccionado.estado].label}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${riesgoConfig[seleccionado.riesgo].color}`}>
                  Riesgo {riesgoConfig[seleccionado.riesgo].label}
                </span>
              </div>
            </div>

            <div className="p-5 space-y-4 max-h-[600px] overflow-y-auto">
              {/* Datos clave */}
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-outline mb-2">Datos Clave</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-on-surface-variant">RUT:</span> <span className="font-bold">{seleccionado.rut}</span></div>
                  <div><span className="text-on-surface-variant">Rubro:</span> <span className="font-bold">{seleccionado.rubro}</span></div>
                  <div><span className="text-on-surface-variant">Región:</span> <span className="font-bold">{seleccionado.region}</span></div>
                  <div><span className="text-on-surface-variant">Comuna:</span> <span className="font-bold">{seleccionado.comuna}</span></div>
                  <div className="col-span-2"><span className="text-on-surface-variant">Email:</span> <span className="font-bold">{seleccionado.email}</span></div>
                  <div className="col-span-2"><span className="text-on-surface-variant">Teléfono:</span> <span className="font-bold">{seleccionado.telefono}</span></div>
                </div>
              </div>

              {/* Progreso */}
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-outline mb-2">Progreso en Cursos</p>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-on-surface-variant">{seleccionado.cursosCompletados}/{seleccionado.cursosTotal} cursos</span>
                  <span className="font-bold">{seleccionado.avance}%</span>
                </div>
                <div className="w-full bg-surface-container-high rounded-full h-2">
                  <div className="bg-teal h-2 rounded-full" style={{ width: `${seleccionado.avance}%` }} />
                </div>
              </div>

              {/* Notas del caso */}
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-outline mb-2">Notas del Caso</p>
                <p className="text-sm text-on-surface bg-surface-container-low rounded-xl p-3">{seleccionado.notas}</p>
              </div>

              {/* Metas */}
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-outline mb-2">Metas</p>
                <ul className="space-y-1">
                  {seleccionado.metas.map((meta, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className={`material-symbols-outlined text-lg ${meta.includes('✓') ? 'text-success' : 'text-outline'}`}>
                        {meta.includes('✓') ? 'check_circle' : 'radio_button_unchecked'}
                      </span>
                      <span className={meta.includes('✓') ? 'text-on-surface-variant line-through' : 'text-on-surface'}>{meta}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Documentos */}
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-outline mb-2">Documentos</p>
                <ul className="space-y-1">
                  {seleccionado.documentos.map((doc, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className="material-symbols-outlined text-lg text-primary">description</span>
                      <span className="text-on-surface">{doc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="p-4 border-t border-outline-variant/30">
              <button
                onClick={() => navigate(`/mentor/seguimiento/${seleccionado.id}`)}
                className="w-full py-3 bg-primary text-inverse-on-surface font-bold rounded-xl hover:bg-primary/90 transition-colors"
              >
                Ver seguimiento completo
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-8 text-center">
            <span className="material-symbols-outlined text-5xl text-outline">touch_app</span>
            <p className="mt-3 text-on-surface-variant font-bold">Selecciona un emprendedor</p>
            <p className="text-sm text-on-surface-variant">Haz click en un nombre para ver su ficha completa</p>
          </div>
        )}
      </div>
    </div>
  );
}
