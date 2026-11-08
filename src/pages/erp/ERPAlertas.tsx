import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useERP } from '../../1.-ERP/context/ERPContext';
import { calcularAlertas, type TipoAlerta as AlertaTipo, type OrigenAlerta as AlertaOrigen } from '../../1.-ERP/services/alertas';

const tipoEstilo: Record<AlertaTipo, { border: string; bg: string; icon_bg: string; icon_color: string; badge: string }> = {
  critica:     { border: 'border-error/40',      bg: 'bg-error/5',        icon_bg: 'bg-error/10',       icon_color: 'text-error',       badge: 'bg-error text-inverse-on-surface' },
  advertencia: { border: 'border-warning/40',  bg: 'bg-warning/5',      icon_bg: 'bg-warning/15',     icon_color: 'text-warning',      badge: 'bg-warning text-inverse-on-surface' },
  tributaria:  { border: 'border-violet/40', bg: 'bg-violet/5',   icon_bg: 'bg-violet/15',  icon_color: 'text-violet',   badge: 'bg-violet text-inverse-on-surface' },
  info:        { border: 'border-primary/30',     bg: 'bg-primary/5',      icon_bg: 'bg-primary/10',     icon_color: 'text-primary',      badge: 'bg-primary text-inverse-on-surface' },
  exito:       { border: 'border-success/40',   bg: 'bg-success/5',       icon_bg: 'bg-success/15',      icon_color: 'text-success',      badge: 'bg-success text-inverse-on-surface' },
};

const origenLabel: Record<AlertaOrigen, string> = {
  sistema: 'PymEdu',
  sii: 'SII',
};



export default function ERPAlertas() {
  const { inventario, envases, movimientos, documentosTributarios, pagosPOS, promociones, saldos } = useERP();
  const [filtro, setFiltro] = useState<AlertaTipo | 'todas'>('todas');
  const [leidas, setLeidas] = useState<Set<string>>(() => new Set());


  // Fuente única compartida con el Panel general (corrección #16).
  const alertas = useMemo(
    () => calcularAlertas({ inventario, envases, saldos, documentosTributarios, pagosPOS, promociones, movimientos }),
    [inventario, envases, saldos, documentosTributarios, pagosPOS, promociones, movimientos]
  );

  const marcarLeida = (id: string) => {
    setLeidas(prev => new Set(prev).add(id));
  };

  const marcarTodasLeidas = () => {
    setLeidas(prev => new Set([...prev, ...alertas.map(a => a.id)]));
  };

  const alertasFiltradas = filtro === 'todas' ? alertas : alertas.filter(a => a.tipo === filtro);
  const noLeidas = alertas.filter(a => !leidas.has(a.id)).length;

  const conteos = {
    critica: alertas.filter(a => a.tipo === 'critica').length,
    advertencia: alertas.filter(a => a.tipo === 'advertencia').length,
    tributaria: alertas.filter(a => a.tipo === 'tributaria').length,
    info: alertas.filter(a => a.tipo === 'info').length,
    exito: alertas.filter(a => a.tipo === 'exito').length,
  };

  const kpis: { tipo: AlertaTipo | 'todas'; label: string; icon: string; cls: string; count: number }[] = [
    { tipo: 'todas', label: 'Todas', icon: 'all_inclusive', cls: 'bg-surface-container text-on-surface', count: alertas.length },
    { tipo: 'critica', label: 'Críticas', icon: 'error', cls: 'bg-error/10 text-error', count: conteos.critica },
    { tipo: 'advertencia', label: 'Avisos', icon: 'warning', cls: 'bg-warning/15 text-warning', count: conteos.advertencia },
    { tipo: 'tributaria', label: 'Tributarias', icon: 'account_balance', cls: 'bg-violet/15 text-violet', count: conteos.tributaria },
    { tipo: 'info', label: 'Informativas', icon: 'info', cls: 'bg-primary/10 text-primary', count: conteos.info },
    { tipo: 'exito', label: 'Positivas', icon: 'trending_up', cls: 'bg-success/15 text-success', count: conteos.exito },
  ];

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-primary flex items-center gap-3">
            <span className="material-symbols-outlined text-4xl">notifications_active</span>
            Centro de alertas
            {noLeidas > 0 && (
              <span className="bg-error text-inverse-on-surface text-sm px-3 py-1 rounded-full font-bold">
                {noLeidas} nuevas
              </span>
            )}
          </h2>
          <p className="text-on-surface-variant mt-1 text-sm">PymEdu monitorea tu negocio y te avisa cuando algo requiere tu atención.</p>
        </div>
        {noLeidas > 0 && (
          <button onClick={marcarTodasLeidas}
            className="flex items-center gap-2 px-4 py-2.5 border-2 border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary rounded-xl font-bold text-sm transition-colors">
            <span className="material-symbols-outlined text-lg">done_all</span>
            Marcar todas como leídas
          </button>
        )}
      </div>

      {/* Resumen KPIs / filtros */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {kpis.map(k => (
          <button key={k.tipo} onClick={() => setFiltro(k.tipo)}
            className={`p-4 rounded-2xl flex flex-col items-center gap-1 transition-all font-bold text-sm border-2 ${filtro === k.tipo ? 'border-primary bg-primary/5 shadow-sm' : 'border-transparent bg-surface-container-lowest dark-card hover:border-outline-variant/50'}`}>
            <span className={`material-symbols-outlined text-2xl p-2 rounded-full ${k.cls}`}>{k.icon}</span>
            <span className="text-on-surface text-lg font-extrabold">{k.count}</span>
            <span className="text-on-surface-variant text-xs">{k.label}</span>
          </button>
        ))}
      </div>

      {/* Lista de alertas */}
      <div className="space-y-3">
        {alertasFiltradas.length === 0 && (
          <div className="rounded-3xl border border-dashed border-outline-variant bg-surface-container-lowest dark-card p-10 text-center">
            <span className="material-symbols-outlined text-4xl text-outline">notifications_off</span>
            <p className="mt-3 font-bold text-on-surface">Sin alertas en esta categoría</p>
            <p className="text-sm text-on-surface-variant mt-1">Todo está al día.</p>
          </div>
        )}

        {alertasFiltradas.map(alerta => {
          const estilo = tipoEstilo[alerta.tipo];
          const leida = leidas.has(alerta.id);
          return (
            <div key={alerta.id}
              className={`rounded-2xl border-2 p-5 transition-all ${estilo.border} ${estilo.bg} ${leida ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${estilo.icon_bg}`}>
                  <span className={`material-symbols-outlined text-2xl ${estilo.icon_color}`}>{alerta.icono}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-on-surface text-sm">{alerta.titulo}</h4>
                      {!leida && <span className="w-2 h-2 bg-primary rounded-full shrink-0" />}
                    </div>
                    <span className="text-xs font-bold text-on-surface-variant whitespace-nowrap">{origenLabel[alerta.origen]}</span>
                  </div>
                  <p className="text-sm text-on-surface-variant leading-relaxed mb-3">{alerta.detalle}</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    {alerta.accion_url && alerta.accion_label && (
                      <Link to={alerta.accion_url}
                        className="px-4 py-2 bg-surface-container-lowest dark-card font-bold text-xs text-on-surface border border-outline-variant hover:border-primary/50 rounded-xl transition-colors flex items-center gap-1 shadow-sm">
                        {alerta.accion_label}
                        <span className="material-symbols-outlined text-sm">arrow_forward</span>
                      </Link>
                    )}
                    {!leida && (
                      <button onClick={() => marcarLeida(alerta.id)}
                        className="text-xs text-on-surface-variant hover:text-primary font-medium transition-colors">
                        Marcar como leída
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}