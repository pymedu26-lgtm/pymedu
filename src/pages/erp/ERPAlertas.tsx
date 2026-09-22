import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useERP } from '../../1.-ERP/context/ERPContext';

type AlertaTipo = 'critica' | 'advertencia' | 'tributaria' | 'info' | 'exito';
type AlertaOrigen = 'sistema' | 'sii' | 'municipalidad' | 'mentor';

interface Alerta {
  id: string;
  tipo: AlertaTipo;
  origen: AlertaOrigen;
  titulo: string;
  detalle: string;
  accion_label?: string;
  accion_url?: string;
  icono: string;
}

const tipoEstilo: Record<AlertaTipo, { border: string; bg: string; icon_bg: string; icon_color: string; badge: string }> = {
  critica:     { border: 'border-error/40',      bg: 'bg-error/5',        icon_bg: 'bg-error/10',       icon_color: 'text-error',        badge: 'bg-error text-white' },
  advertencia: { border: 'border-amber-500/40',  bg: 'bg-amber-500/5',    icon_bg: 'bg-amber-500/15',   icon_color: 'text-amber-500',    badge: 'bg-amber-500 text-white' },
  tributaria:  { border: 'border-violet-500/40', bg: 'bg-violet-500/5',   icon_bg: 'bg-violet-500/15',  icon_color: 'text-violet-500',   badge: 'bg-violet-500 text-white' },
  info:        { border: 'border-primary/30',     bg: 'bg-primary/5',      icon_bg: 'bg-primary/10',     icon_color: 'text-primary',      badge: 'bg-primary text-white' },
  exito:       { border: 'border-emerald-500/40',bg: 'bg-emerald-500/5',  icon_bg: 'bg-emerald-500/15', icon_color: 'text-emerald-500',  badge: 'bg-emerald-500 text-white' },
};

const origenLabel: Record<AlertaOrigen, string> = {
  sistema: 'PymEdu',
  sii: 'SII',
  municipalidad: 'Municipalidad',
  mentor: 'Academia',
};

const pesoTipo: Record<AlertaTipo, number> = { critica: 0, tributaria: 1, advertencia: 2, info: 3, exito: 4 };

const flt = (n: number) => `$${Math.abs(n).toLocaleString('es-CL')}`;

export default function ERPAlertas() {
  const {
    inventario, ventas, gastos, movimientos,
    documentosTributarios, pagosPOS, promociones,
    getSaldoPendienteVenta, getSaldoPendienteGasto,
  } = useERP();
  const [filtro, setFiltro] = useState<AlertaTipo | 'todas'>('todas');
  const [leidas, setLeidas] = useState<Set<string>>(() => new Set());

  const hoy = new Date();
  const diaDelMes = hoy.getDate();
  const mes = hoy.getMonth();
  const anio = hoy.getFullYear();
  const hoyIso = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(diaDelMes).padStart(2, '0')}`;

  const alertas = useMemo(() => {
    const items: Alerta[] = [];

    // 1. Stock bajo
    inventario.filter(p => p.tipo === 'producto' && p.stock <= p.stockMinimo && p.estado === 'activo').forEach(p => {
      items.push({
        id: `stock-${p.id}`, tipo: p.stock === 0 ? 'critica' : 'advertencia', origen: 'sistema',
        icono: p.stock === 0 ? 'inventory' : 'warning',
        titulo: p.stock === 0 ? `Sin stock: "${p.nombre}"` : `Stock bajo: "${p.nombre}"`,
        detalle: p.stock === 0
          ? `Te has quedado sin "${p.nombre}". No puedes venderlo hasta reabastecerte.`
          : `Solo te quedan ${p.stock} unidades de "${p.nombre}" (mínimo: ${p.stockMinimo}). Considera reabastecer.`,
        accion_label: 'Ver inventario', accion_url: '/erp/inventario',
      });
    });

    // 2. Cuentas por cobrar vencidas
    ventas.filter(v => getSaldoPendienteVenta(v.id) > 0 && v.fecha_vencimiento && v.fecha_vencimiento <= hoyIso).forEach(v => {
      const dias = Math.ceil((new Date(hoyIso).getTime() - new Date(v.fecha_vencimiento!).getTime()) / 86400000);
      items.push({
        id: `cxc-ven-${v.id}`, tipo: 'critica', origen: 'sistema', icono: 'event_busy',
        titulo: `Cuenta por cobrar vencida: ${v.cliente}`,
        detalle: `Saldo ${flt(getSaldoPendienteVenta(v.id))} · venció el ${new Date(v.fecha_vencimiento!).toLocaleDateString('es-CL')} (${dias} día(s) de atraso).`,
        accion_label: 'Ver CxC', accion_url: '/erp/cobrar',
      });
    });

    // 3. Cuentas por cobrar pendientes (no vencidas o sin fecha)
    const cxcPendientes = ventas.filter(v => getSaldoPendienteVenta(v.id) > 0 && (!v.fecha_vencimiento || v.fecha_vencimiento > hoyIso));
    const totalCxC = cxcPendientes.reduce((acc, v) => acc + getSaldoPendienteVenta(v.id), 0);
    if (cxcPendientes.length > 0) {
      items.push({
        id: 'cxc-pendiente', tipo: 'advertencia', origen: 'sistema', icono: 'request_quote',
        titulo: `${cxcPendientes.length} venta(s) por cobrar`,
        detalle: `Tienes ${flt(totalCxC)} que aún no te han pagado. Revisa tus cuentas por cobrar.`,
        accion_label: 'Ver cuentas por cobrar', accion_url: '/erp/cobrar',
      });
    }

    // 4. Cuentas por pagar vencidas
    gastos.filter(g => getSaldoPendienteGasto(g.id) > 0 && g.fecha_vencimiento && g.fecha_vencimiento <= hoyIso).forEach(g => {
      const dias = Math.ceil((new Date(hoyIso).getTime() - new Date(g.fecha_vencimiento!).getTime()) / 86400000);
      items.push({
        id: `cxp-ven-${g.id}`, tipo: 'critica', origen: 'sistema', icono: 'payments',
        titulo: `Cuenta por pagar vencida: ${g.proveedor}`,
        detalle: `Saldo ${flt(getSaldoPendienteGasto(g.id))} · vencía el ${new Date(g.fecha_vencimiento!).toLocaleDateString('es-CL')} (${dias} día(s) de atraso).`,
        accion_label: 'Ver CxP', accion_url: '/erp/pagar',
      });
    });

    // 5. Cuentas por pagar pendientes
    const cxpPendientes = gastos.filter(g => getSaldoPendienteGasto(g.id) > 0 && (!g.fecha_vencimiento || g.fecha_vencimiento > hoyIso));
    const totalCxP = cxpPendientes.reduce((acc, g) => acc + getSaldoPendienteGasto(g.id), 0);
    if (cxpPendientes.length > 0) {
      items.push({
        id: 'cxp-pendiente', tipo: 'advertencia', origen: 'sistema', icono: 'receipt_long',
        titulo: `${cxpPendientes.length} pago(s) pendiente(s) a proveedores`,
        detalle: `Debes ${flt(totalCxP)} a proveedores. No dejes que se atrase para evitar multas.`,
        accion_label: 'Ver pagos pendientes', accion_url: '/erp/pagar',
      });
    }

    // 6. Documentos tributarios rechazados u observados
    documentosTributarios.filter(d => d.estado === 'rechazado_sii' || d.estado === 'observado').slice(0, 10).forEach(d => {
      items.push({
        id: `doc-${d.id}`, tipo: d.estado === 'rechazado_sii' ? 'critica' : 'advertencia', origen: 'sii',
        icono: 'receipt_long',
        titulo: `Documento ${d.estado === 'rechazado_sii' ? 'rechazado por el SII' : 'observado'}`,
        detalle: `${d.tipoDocumento} folio ${d.folioInterno} · ${d.periodoTributario}. Revísalo antes de cerrar tu IVA.`,
        accion_label: 'Preparar F29', accion_url: '/erp/iva-mensual',
      });
    });

    // 7. Pagos POS sin venta asociada
    pagosPOS.filter(p => p.estadoConciliacion === 'sin_venta').slice(0, 10).forEach(p => {
      items.push({
        id: `pos-${p.id}`, tipo: 'advertencia', origen: 'sistema', icono: 'point_of_sale',
        titulo: 'Pago POS sin venta asociada',
        detalle: `Pago de ${flt(p.monto)} sin conciliar. Concílialo para que caja, ventas e IVA cuadren.`,
        accion_label: 'Ir a Ventas', accion_url: '/erp/ventas',
      });
    });

    // 8. Cierre de mes SII (dentro de los últimos 10 días)
    if (diaDelMes >= 20) {
      const nombreMes = new Date(anio, mes, 1).toLocaleString('es-CL', { month: 'long' });
      items.push({
        id: 'iva-mensual', tipo: 'tributaria', origen: 'sii', icono: 'account_balance',
        titulo: 'Cierre de mes SII próximo',
        detalle: `El pago de IVA (F29) de ${nombreMes} vence el último día hábil del mes. Deja tus documentos listos.`,
        accion_label: 'Ver IVA Mensual', accion_url: '/erp/iva-mensual',
      });
    }

    // 9. Pago de sueldos (días 1-5)
    if (diaDelMes <= 5) {
      items.push({
        id: 'sueldos-mes', tipo: 'critica', origen: 'sistema', icono: 'badge',
        titulo: 'Recuerda pagar sueldos antes del día 5',
        detalle: 'Según el Código del Trabajo, los sueldos deben pagarse hasta el día 5 del mes siguiente. Revisa tus pagos pendientes.',
        accion_label: 'Ver CxP', accion_url: '/erp/pagar',
      });
    }

    // 10. Flujo del mes positivo
    const ingresosDelMes = movimientos.filter(m => {
      const d = new Date(m.fecha);
      return d.getMonth() === mes && d.getFullYear() === anio && m.tipo === 'Ingreso';
    }).reduce((acc, m) => acc + m.monto, 0);
    const egresosDelMes = movimientos.filter(m => {
      const d = new Date(m.fecha);
      return d.getMonth() === mes && d.getFullYear() === anio && m.tipo === 'Egreso';
    }).reduce((acc, m) => acc + m.monto, 0);
    if (ingresosDelMes > egresosDelMes && ingresosDelMes > 0) {
      items.push({
        id: 'flujo-positivo', tipo: 'exito', origen: 'sistema', icono: 'trending_up',
        titulo: 'Tu flujo de caja este mes es positivo',
        detalle: `Ingresaste ${flt(ingresosDelMes)} y gastaste ${flt(egresosDelMes)}. Tu negocio está generando ganancias.`,
        accion_label: 'Ver Caja', accion_url: '/erp/caja',
      });
    }

    // 11. Promociones por vencer
    promociones.filter(p => p.estado === 'activa' && p.fechaFin >= hoyIso).forEach(p => {
      const dias = Math.ceil((new Date(p.fechaFin + 'T23:59:59').getTime() - new Date(hoyIso + 'T00:00:00').getTime()) / 86400000);
      if (dias <= 3) {
        items.push({
          id: `promo-${p.id}`, tipo: 'info', origen: 'sistema', icono: 'local_fire_department',
          titulo: `Promoción "${p.nombre}" termina pronto`,
          detalle: `Quedan ${dias} día(s) (${new Date(p.fechaFin).toLocaleDateString('es-CL')}).`,
          accion_label: 'Ver promociones', accion_url: '/erp/promociones',
        });
      }
    });

    // 12. Novedad municipal
    items.push({
      id: 'muni-001', tipo: 'info', origen: 'municipalidad', icono: 'location_city',
      titulo: 'Tu municipalidad publicó nuevas convocatorias',
      detalle: 'Revisa los fondos concursables y beneficios disponibles para tu emprendimiento en el Portal Municipal.',
      accion_label: 'Ver Portal Municipal', accion_url: '/erp/portal-municipal',
    });

    // 13. Novedad academia
    items.push({
      id: 'mentor-001', tipo: 'info', origen: 'mentor', icono: 'school',
      titulo: 'Nuevos contenidos disponibles en la Academia',
      detalle: 'Revisa los cursos recientes sobre finanzas, legal y emprendimiento para seguir creciendo.',
      accion_label: 'Ir a Academia', accion_url: '/erp/academia',
    });

    return items.sort((a, b) => pesoTipo[a.tipo] - pesoTipo[b.tipo]);
  }, [inventario, ventas, gastos, movimientos, documentosTributarios, pagosPOS, promociones,
    getSaldoPendienteVenta, getSaldoPendienteGasto, hoyIso, diaDelMes, mes, anio]);

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
    { tipo: 'advertencia', label: 'Avisos', icon: 'warning', cls: 'bg-amber-500/15 text-amber-500', count: conteos.advertencia },
    { tipo: 'tributaria', label: 'Tributarias', icon: 'account_balance', cls: 'bg-violet-500/15 text-violet-500', count: conteos.tributaria },
    { tipo: 'info', label: 'Informativas', icon: 'info', cls: 'bg-primary/10 text-primary', count: conteos.info },
    { tipo: 'exito', label: 'Positivas', icon: 'trending_up', cls: 'bg-emerald-500/15 text-emerald-500', count: conteos.exito },
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
              <span className="bg-error text-white text-sm px-3 py-1 rounded-full font-bold">
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