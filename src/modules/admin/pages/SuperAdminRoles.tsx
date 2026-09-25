import { useState } from 'react';
import {
  GRUPOS_ROL,
  MODULOS,
  ROLES,
  ROL_INFO,
  type NivelPermiso,
  type Rol,
  type GrupoRolId,
} from '../../../lib/roles';

const permisoConfig: Record<NivelPermiso, { label: string; color: string; descripcion: string }> = {
  rwd: { label: 'RWD', color: 'bg-green-100 text-green-700', descripcion: 'Lectura, escritura y eliminación' },
  rw: { label: 'RW', color: 'bg-blue-100 text-blue-700', descripcion: 'Lectura y escritura' },
  r: { label: 'R', color: 'bg-slate-100 text-slate-600', descripcion: 'Solo lectura' },
  none: { label: '—', color: 'bg-surface-container-high text-on-surface-variant/40', descripcion: 'Sin acceso' },
};

const origenLabel: Record<string, string> = {
  sistema: 'Definido por el sistema',
  inst_admin: 'Lo asigna el Admin Institucional',
  pyme_admin: 'Lo crea/asigna el Administrador de la PYME',
};

const origenColor: Record<string, string> = {
  sistema: 'bg-slate-100 text-slate-600',
  inst_admin: 'bg-purple-100 text-purple-700',
  pyme_admin: 'bg-emerald-100 text-emerald-700',
};

function GrupoArbol() {
  return (
    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-indigo-500">account_tree</span>
        <h3 className="font-extrabold text-on-surface">Estructura de roles (guía ESTRUCTURA_ROLES.txt)</h3>
      </div>
      <div className="space-y-1 text-sm">
        <NodoRol color="bg-red-500" label="SUPERADMIN" nivel={0} />
        <div className="pl-5 border-l-2 border-outline-variant/40 ml-3 space-y-1">
          <NodoRol color="bg-purple-500" label="ADMINISTRADOR INSTITUCIONAL (1…3)" nivel={1} />
          <div className="pl-5 border-l-2 border-outline-variant/40 ml-3 space-y-1">
            <NodoRol color="bg-blue-500" label="COORDINADOR" nivel={2} />
            <div className="pl-5 border-l-2 border-outline-variant/40 ml-3 space-y-1">
              <NodoRol color="bg-teal-500" label="MENTOR" nivel={3} />
              <div className="pl-5 border-l-2 border-outline-variant/40 ml-3 space-y-1">
                <NodoRol color="bg-green-500" label="EMPRENDEDOR" nivel={4} />
              </div>
            </div>
          </div>
          <NodoRol color="bg-green-500" label="EMPRENDEDOR (independiente)" nivel={1} />
        </div>
        <div className="pl-5 border-l-2 border-outline-variant/40 ml-3 space-y-1">
          <NodoRol color="bg-emerald-600" label="PYME / PEQUEÑA EMPRESA" nivel={1} />
          <div className="pl-5 border-l-2 border-outline-variant/40 ml-3 space-y-1">
            <NodoRol color="bg-emerald-600" label="Dueño (Administrador de la PYME)" nivel={2} />
            <NodoRol color="bg-orange-500" label="Vendedor / Cajero" nivel={2} tag="VAR1" />
            <NodoRol color="bg-cyan-500" label="Gestor" nivel={2} tag="VAR2" />
            <NodoRol color="bg-pink-500" label="Enc. RRHH · Empleado · Contador externo" nivel={2} tag="VAR3" />
          </div>
        </div>
      </div>
    </div>
  );
}

function NodoRol({ color, label, nivel, tag }: { color: string; label: string; nivel: number; tag?: string }) {
  const sub = nivel > 1 ? 'pl-4' : '';
  return (
    <div className={`flex items-center gap-2 ${sub}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${color} shrink-0`} />
      <span className="font-bold text-on-surface">{label}</span>
      {tag && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-700 uppercase tracking-wide">
          {tag}
        </span>
      )}
    </div>
  );
}

export default function SuperAdminRoles() {
  const [rolSeleccionado, setRolSeleccionado] = useState<Rol>('superadmin');
  const [grupoSeleccionado, setGrupoSeleccionado] = useState<GrupoRolId>('institucional');
  const rol = ROL_INFO[rolSeleccionado]!;

  const activarRol = (id: Rol) => {
    setRolSeleccionado(id);
    setGrupoSeleccionado(ROL_INFO[id].grupo);
  };

  const rolesVisibles = GRUPOS_ROL.filter((g) => g.id === grupoSeleccionado).flatMap((g) => g.roles);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-3xl text-indigo-500">admin_panel_settings</span>
        <div>
          <h1 className="text-2xl font-extrabold text-on-surface">Roles y Permisos Maestros</h1>
          <p className="text-on-surface-variant">Jerarquía institucional, roles de PYME y matriz de permisos de la plataforma</p>
        </div>
      </div>

      <GrupoArbol />

      {/* Nota sobre los roles PYME */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-emerald-600 text-xl mt-0.5">storefront</span>
          <div>
            <p className="font-extrabold text-emerald-800">PYME / Pequeña Empresa — roles definibles por el dueño</p>
            <p className="text-sm text-emerald-700/90 mt-1">
              Cada negocio (Dueño o Emprendedor) cuenta con roles operativos que su administrador puede crear y asignar al equipo.
              En la guía son los tipos <b>VAR1</b> (roles comerciales: Vendedor/Cajero), <b>VAR2</b> (gestión: Gestor) y{' '}
              <b>VAR3</b> (administración y finanzas: Enc. RRHH, Empleado, Contador externo). Estos roles se gestionan desde el ERP
              del negocio y, cuando aplica, mediante códigos de invitación de la institución.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Lista de roles agrupados */}
        <div className="lg:w-80 shrink-0 space-y-4">
          {GRUPOS_ROL.map((grupo) => (
            <div key={grupo.id}>
              <div className="flex items-center gap-2 px-1 mb-2">
                <span className="material-symbols-outlined text-lg text-on-surface-variant">{grupo.icon}</span>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant">{grupo.label}</h3>
              </div>
              <div className="space-y-1.5">
                {grupo.roles.map((id) => {
                  const r = ROL_INFO[id];
                  const selected = rolSeleccionado === id;
                  return (
                    <button
                      key={r.id}
                      onClick={() => activarRol(r.id)}
                      className={`w-full flex items-center gap-3 p-3.5 rounded-xl text-left transition-all ${
                        selected
                          ? 'bg-primary/10 border-2 border-primary/30 shadow-sm'
                          : 'bg-surface-container-lowest border-2 border-transparent hover:border-outline-variant/40'
                      }`}
                    >
                      <span className={`h-3 w-3 rounded-full ${r.color} shrink-0`} />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-on-surface text-sm flex items-center gap-1.5">
                          {r.label}
                          {r.guia && (
                            <span className="px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[9px] font-black uppercase tracking-wide">
                              {r.guia}
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-on-surface-variant truncate">{r.descripcion}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-on-surface-variant/80 px-1 mt-2">{grupo.descripcion}</p>
            </div>
          ))}
        </div>

        {/* Detalle del rol */}
        <div className="flex-1 space-y-6">
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-6">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <span className={`h-4 w-4 rounded-full ${rol.color}`} />
              <h2 className="text-xl font-extrabold text-on-surface">{rol.label}</h2>
              {rol.guia && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase tracking-wide">
                  {rol.guia}
                </span>
              )}
            </div>
            <p className="text-sm text-on-surface-variant">{rol.descripcion}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${origenColor[rol.definidoPor]}`}>
                {origenLabel[rol.definidoPor]}
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-surface-container-high text-on-surface-variant">
                {rol.grupo === 'pyme' ? 'Grupo PYME / Pequeña Empresa' : rol.grupo === 'institucional' ? 'Jerarquía institucional' : 'Rol reservado'}
              </span>
            </div>
          </div>

          {/* Matriz de permisos */}
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
            <div className="p-5 border-b border-outline-variant/30 flex items-center gap-2">
              <span className="material-symbols-outlined text-indigo-500">lock</span>
              <h3 className="font-extrabold text-on-surface">Matriz de Permisos — {rol.label}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-outline-variant/30">
                    <th className="text-left p-4 text-xs font-extrabold text-on-surface-variant uppercase tracking-wider">Módulo / Sección</th>
                    <th className="text-center p-4 text-xs font-extrabold text-on-surface-variant uppercase tracking-wider">Permiso</th>
                    <th className="text-left p-4 text-xs font-extrabold text-on-surface-variant uppercase tracking-wider">Descripción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {Object.keys(MODULOS).map((key) => (
                    <tr key={key} className="hover:bg-surface-container-low/50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-on-surface-variant text-lg">{MODULOS[key].icon}</span>
                          <span className="font-bold text-on-surface text-sm">{MODULOS[key].label}</span>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-extrabold ${permisoConfig[rol.matriz[key]].color}`}>
                          {permisoConfig[rol.matriz[key]].label}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-on-surface-variant">
                        {permisoConfig[rol.matriz[key]].descripcion}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Permisos finos del ERP */}
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-5">
            <h4 className="text-xs font-extrabold text-on-surface-variant uppercase tracking-wider mb-3">Permisos finos (módulo ERP)</h4>
            {rol.permisosApp.length === 0 ? (
              <p className="text-sm text-on-surface-variant">
                Acceso total a todas las funcionalidades de la plataforma.
                {(rol.id === 'superadmin' || rol.id === 'demo') && ' La restricción se aplica a nivel de segmentación por institución.'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {rol.permisosApp.map((p) => (
                  <span key={p} className="px-2.5 py-1 rounded-full bg-surface-container-high text-xs font-bold text-on-surface-variant">
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Leyenda */}
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-5">
            <h4 className="text-xs font-extrabold text-on-surface-variant uppercase tracking-wider mb-3">Leyenda de Permisos</h4>
            <div className="flex flex-wrap gap-4">
              {Object.entries(permisoConfig).map(([key, config]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${config.color}`}>{config.label}</span>
                  <span className="text-xs text-on-surface-variant">{config.descripcion}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Roles en el grupo visible */}
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-5">
            <h4 className="text-xs font-extrabold text-on-surface-variant uppercase tracking-wider mb-2">Otras cuentas disponibles</h4>
            <div className="flex flex-wrap gap-2">
              {ROLES.filter((r) => r.id !== rolSeleccionado).slice(0, 12).map((r) => (
                <button
                  key={r.id}
                  onClick={() => activarRol(r.id)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-high hover:bg-surface-container text-xs font-bold text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  <span className={`h-2 w-2 rounded-full ${r.color}`} />
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Referencia de la definición */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-5">
        <h4 className="text-xs font-extrabold text-on-surface-variant uppercase tracking-wider mb-3">Definiciones de PYME en el código</h4>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {ROLES.filter((r) => r.grupo === 'pyme').map((r) => (
            <div key={r.id} className="rounded-xl border border-outline-variant/30 p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className={`h-2.5 w-2.5 rounded-full ${r.color}`} />
                <span className="font-bold text-on-surface text-sm">{r.label}</span>
                {r.guia && <span className="px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[9px] font-black uppercase">{r.guia}</span>}
              </div>
              <p className="text-xs text-on-surface-variant">{r.descripcion}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}