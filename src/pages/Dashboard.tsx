import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useERP } from '../1.-ERP/context/ERPContext';

type AlertaQuick = { icon: string; color: string; bg: string; titulo: string; desc: string; label: string; url: string };

export default function Dashboard() {
  const { perfil } = useAuth();
  const {
    ventas, gastos, inventario, movimientosInventario, movimientos,
    documentosTributarios, pagosPOS,
    getF29Preparador, getSaldoPendienteVenta, getSaldoPendienteGasto,
  } = useERP();

  const hoy = new Date();
  const mesActual = hoy.getMonth();
  const anioActual = hoy.getFullYear();
  const diaDelMes = hoy.getDate();
  const hoyIso = `${anioActual}-${String(mesActual + 1).padStart(2, '0')}-${String(diaDelMes).padStart(2, '0')}`;
  const mesIso = hoyIso.slice(0, 7);
  const esPremium = perfil?.membresia_nivel === 'pro' || perfil?.membresia_nivel === 'premium';

  const negocioVacio = ventas.length === 0 && gastos.length === 0 && inventario.length === 0;

  // Métricas del MES ACTUAL (comparación por string, sin zona horaria)
  const ventasDelMes = ventas.filter(v => v.fecha.slice(0, 7) === mesIso);
  const gastosDelMes = gastos.filter(g => g.fecha.slice(0, 7) === mesIso);
  const totalVentasMes = ventasDelMes.reduce((acc, v) => acc + v.monto, 0);
  const totalGastosMes = gastosDelMes.reduce((acc, g) => acc + g.monto, 0);
  const metaVentas = Math.round(totalGastosMes * 1.35);
  const metaProgreso = metaVentas > 0 ? Math.min(100, Math.round((totalVentasMes / metaVentas) * 100)) : 0;
  const metaCumplida = totalVentasMes >= metaVentas;

  // Métricas HOY (movimientos reales de caja, no montos de documentos)
  const movimientosHoy = movimientos.filter(m => m.fecha.slice(0, 10) === hoyIso);
  const ingresosHoy = movimientosHoy.filter(m => m.tipo === 'Ingreso').reduce((acc, m) => acc + m.monto, 0);
  const egresosHoy = movimientosHoy.filter(m => m.tipo === 'Egreso').reduce((acc, m) => acc + m.monto, 0);

  // Alertas
  const productosStockBajo = inventario.filter(p => p.tipo === 'producto' && p.stock <= p.stockMinimo && p.estado === 'activo');
  const ventasPendientes = ventas.filter(v => getSaldoPendienteVenta(v.id) > 0);
  const gastosPorPagar = gastos.filter(g => getSaldoPendienteGasto(g.id) > 0);
  const totalCxC = ventasPendientes.reduce((acc, v) => acc + getSaldoPendienteVenta(v.id), 0);
  const totalCxP = gastosPorPagar.reduce((acc, g) => acc + getSaldoPendienteGasto(g.id), 0);

  const periodoActual = `${anioActual}-${String(mesActual + 1).padStart(2, '0')}`;
  const documentosMes = documentosTributarios.filter(d => d.periodoTributario === periodoActual);
  const documentosPendientes = documentosMes.filter(d => ['borrador', 'pendiente_emision', 'observado', 'rechazado_sii'].includes(d.estado));
  const pagosPOSSinVenta = pagosPOS.filter(p => p.estadoConciliacion === 'sin_venta');
  const f29Actual = getF29Preparador(periodoActual);

  const fmt = (n: number) => `$${Math.abs(n).toLocaleString('es-CL')}`;
  const nombreMes = hoy.toLocaleString('es-CL', { month: 'long' });

  const alertasQuick: AlertaQuick[] = [];

  if (negocioVacio) {
    alertasQuick.push({
      icon: 'flag', color: 'text-primary', bg: 'bg-primary/10',
      titulo: 'Comienza a registrar tu actividad',
      desc: 'Anota tu primera venta o gasto para que veas métricas reales de tu negocio.',
      label: 'Anotar venta', url: '/erp/ventas',
    });
  } else {
    if (diaDelMes <= 5) {
      alertasQuick.push({ icon: 'badge', color: 'text-purple-600', bg: 'bg-purple-100', titulo: 'Paga sueldos antes del día 5', desc: 'Plazo legal del Código del Trabajo para pago de remuneraciones.', label: 'Ver CxP', url: '/erp/pagar' });
    }
    if (documentosPendientes.length > 0) {
      alertasQuick.push({ icon: 'receipt_long', color: 'text-primary', bg: 'bg-primary/10', titulo: `${documentosPendientes.length} documento(s) por revisar`, desc: 'Antes de cerrar IVA conviene resolver documentos pendientes u observados.', label: 'Preparar F29', url: '/erp/iva-mensual' });
    }
    if (pagosPOSSinVenta.length > 0 && alertasQuick.length < 3) {
      alertasQuick.push({ icon: 'point_of_sale', color: 'text-amber-600', bg: 'bg-amber-100', titulo: `${pagosPOSSinVenta.length} pago(s) POS sin venta`, desc: 'Concílialos para que caja, ventas e IVA cuadren.', label: 'Ir a Ventas', url: '/erp/ventas' });
    }
    if (productosStockBajo.length > 0) {
      const p = productosStockBajo[0];
      alertasQuick.push({ icon: 'inventory_2', color: 'text-red-600', bg: 'bg-red-100', titulo: `Stock bajo: "${p.nombre}"`, desc: `Solo quedan ${p.stock} unidades (mínimo: ${p.stockMinimo}).`, label: 'Ver Inventario', url: '/erp/inventario' });
    }
    if (diaDelMes >= 20) {
      alertasQuick.push({ icon: 'account_balance', color: 'text-blue-600', bg: 'bg-blue-100', titulo: 'Cierre de mes SII próximo', desc: `El pago de IVA de ${nombreMes} vence el último día hábil del mes.`, label: 'Ver F29', url: '/erp/reportes' });
    }
    if (ventasPendientes.length > 0 && alertasQuick.length < 3) {
      alertasQuick.push({ icon: 'request_quote', color: 'text-amber-600', bg: 'bg-amber-100', titulo: `${ventasPendientes.length} venta(s) sin cobrar`, desc: `Tienes ${fmt(totalCxC)} que aún no te han pagado.`, label: 'Ver CxC', url: '/erp/cobrar' });
    }
    if (gastosPorPagar.length > 0 && alertasQuick.length < 3) {
      alertasQuick.push({ icon: 'payments', color: 'text-orange-600', bg: 'bg-orange-100', titulo: `Debes ${fmt(totalCxP)} a proveedores`, desc: `${gastosPorPagar.length} pago(s) pendientes. Evita atrasos.`, label: 'Ver CxP', url: '/erp/pagar' });
    }
    if (alertasQuick.length === 0) {
      alertasQuick.push({ icon: 'check_circle', color: 'text-emerald-600', bg: 'bg-emerald-100', titulo: '¡Todo en orden!', desc: 'No tienes alertas pendientes. Tu negocio está funcionando bien.', label: 'Centro de Alertas', url: '/erp/alertas' });
    }
  }

  const movimientosActuales = ventas.length + gastos.length + movimientosInventario.length;
  const limitePlan = 30;
  const progresoCuota = Math.min(100, Math.round((movimientosActuales / limitePlan) * 100));

  const pasosOnboarding = [
    { n: 1, icon: 'inventory_2', titulo: 'Carga tu inventario', desc: 'Agrega los productos o servicios que vendes.', label: 'Ir a Inventario', url: '/erp/inventario', color: 'text-primary bg-primary/15' },
    { n: 2, icon: 'point_of_sale', titulo: 'Anota tu primera venta', desc: 'Registra una venta para ver tus ingresos.', label: 'Ir a Ventas', url: '/erp/ventas', color: 'text-emerald-400 bg-emerald-500/15' },
    { n: 3, icon: 'receipt_long', titulo: 'Registra un gasto', desc: 'Guarda tus compras y costos del negocio.', label: 'Ir a Gastos', url: '/erp/gastos', color: 'text-red-400 bg-red-500/15' },
  ];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-surface-container-lowest dark-card p-6 rounded-3xl shadow-sm">
        <div>
          <h2 className="text-3xl font-extrabold text-on-surface tracking-tight flex items-center gap-2">
            ¡Hola, {perfil?.nombre_completo?.split(' ')[0] || 'Emprendedor'}! <span className="text-3xl">👋</span>
          </h2>
          <p className="text-on-surface-variant mt-1 font-medium capitalize">
            {hoy.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })} · Resumen de tu negocio
          </p>
        </div>

        {!esPremium ? (
          <div className="flex flex-col gap-2 bg-surface-container-low p-4 rounded-2xl border border-outline-variant/30 min-w-[280px]">
            <div className="flex justify-between items-center text-sm font-bold">
              <span className="text-on-surface-variant">Plan Básico (Gratis)</span>
              <span className={progresoCuota > 80 ? 'text-red-500' : 'text-primary'}>
                {movimientosActuales} / {limitePlan} Usos
              </span>
            </div>
            <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${progresoCuota > 80 ? 'bg-red-500' : 'bg-primary'}`}
                style={{ width: `${progresoCuota}%` }}
              />
            </div>
            <Link to="/erp/suscripcion" className="mt-2 text-xs text-center font-bold text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 rounded-lg py-2 transition-colors glow-amber">
              ⚡ Desbloquear uso ilimitado ($10.000)
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-1 bg-emerald-500/10 text-emerald-400 px-6 py-4 rounded-2xl shadow-sm border border-emerald-500/20 glow-emerald min-w-[280px]">
            <div className="flex items-center gap-2 font-bold">
              <span className="material-symbols-outlined text-2xl">workspace_premium</span>
              Plan {perfil?.membresia_nivel === 'pro' ? 'Pro' : 'Premium'} Activo
            </div>
            {perfil?.membresia_expira && (
              <span className="text-xs font-semibold text-emerald-300/80">
                Vence el {new Date(perfil.membresia_expira).toLocaleDateString('es-CL')}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Onboarding: negocio sin datos */}
      {negocioVacio && (
        <div className="mb-8 bg-gradient-to-br from-primary/10 via-surface-container-lowest to-secondary/10 dark-card border border-primary/20 rounded-3xl shadow-sm p-7 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-primary/20 rounded-full blur-3xl -mr-12 -mt-12" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-6">
            <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center text-primary shrink-0">
              <span className="material-symbols-outlined text-3xl">rocket_launch</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-extrabold text-on-surface mb-1">Tu negocio parte desde cero</h3>
              <p className="text-sm text-on-surface-variant font-medium leading-relaxed">
                Aún no hay ventas ni compras registradas. Sigue estos pasos para poblar tu información y ver métricas reales aquí:
              </p>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {pasosOnboarding.map(p => (
                  <Link key={p.url} to={p.url}
                    className="group flex items-start gap-3 p-4 bg-surface-container-low/60 hover:bg-surface-container-low rounded-2xl border border-outline-variant/20 hover:border-primary/30 transition-all hover:-translate-y-0.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${p.color}`}>
                      <span className="material-symbols-outlined text-lg">{p.icon}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant">Paso {p.n}</p>
                      <p className="text-sm font-bold text-on-surface truncate">{p.titulo}</p>
                      <p className="text-xs text-on-surface-variant mt-0.5 leading-snug">{p.desc}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPIs del mes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Ventas del mes', value: fmt(totalVentasMes), icon: 'trending_up', color: 'text-emerald-700', bg: 'bg-primary/5', border: 'border-primary/20', sub: `${ventasDelMes.length} operaciones` },
          { label: 'Documentos del mes', value: String(documentosMes.length), icon: 'receipt_long', color: 'text-primary', bg: 'bg-primary/5', border: 'border-primary/20', sub: `${documentosPendientes.length} por revisar` },
          { label: 'IVA estimado', value: fmt(f29Actual.totalEstimado), icon: 'account_balance', color: 'text-blue-700', bg: 'bg-primary/5', border: 'border-primary/20', sub: `IVA ${fmt(f29Actual.diferenciaIva)} + PPM ${fmt(f29Actual.ppm)}` },
          { label: 'Por cobrar', value: fmt(totalCxC), icon: 'request_quote', color: 'text-amber-700', bg: 'bg-primary/5', border: 'border-primary/20', sub: `${ventasPendientes.length} clientes deben` },
        ].map(k => (
          <div key={k.label} className={`p-5 rounded-2xl border shadow-sm ${k.bg} ${k.border}`}>
            <div className="flex items-center justify-between mb-3">
              <p className={`text-xs font-bold uppercase tracking-wider ${k.color}`}>{k.label}</p>
              <span className={`material-symbols-outlined text-xl ${k.color}`}>{k.icon}</span>
            </div>
            <p className={`text-2xl font-extrabold ${k.color}`}>{k.value}</p>
            <p className="text-xs text-on-surface-variant mt-1 font-medium">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Columna Izquierda */}
        <div className="lg:col-span-8 space-y-6">

          {/* Hoy en tu negocio */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="bg-surface-container-lowest dark-card p-7 rounded-3xl shadow-sm hover:shadow-md transition-all hover:scale-[1.01] group">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 mb-5 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-2xl">add_card</span>
              </div>
              <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-1">Plata que entró hoy</p>
              <h3 className="text-3xl font-extrabold text-on-surface mb-4">{fmt(ingresosHoy)}</h3>
              <Link to="/erp/ventas" className="inline-flex items-center gap-1 text-sm font-bold text-emerald-400 hover:text-emerald-300 transition-colors">
                <span className="material-symbols-outlined text-lg">add_circle</span> Anotar venta
              </Link>
            </div>
            <div className="bg-surface-container-lowest dark-card p-7 rounded-3xl shadow-sm hover:shadow-md transition-all hover:scale-[1.01] group">
              <div className="w-12 h-12 rounded-2xl bg-red-500/15 flex items-center justify-center text-red-400 mb-5 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-2xl">shopping_cart_checkout</span>
              </div>
              <p className="text-red-400 text-xs font-bold uppercase tracking-widest mb-1">Plata que salió hoy</p>
              <h3 className="text-3xl font-extrabold text-on-surface mb-4">{fmt(egresosHoy)}</h3>
              <Link to="/erp/gastos" className="inline-flex items-center gap-1 text-sm font-bold text-red-400 hover:text-red-300 transition-colors">
                <span className="material-symbols-outlined text-lg">add_circle</span> Anotar gasto
              </Link>
            </div>
          </div>

          {/* Alertas dinámicas */}
          <div className="bg-surface-container-lowest dark-card rounded-3xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-outline-variant/30 flex justify-between items-center bg-surface-container-low/50">
              <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400">notifications_active</span>
                Tu negocio te avisa
              </h3>
              <Link to="/erp/alertas" className="text-xs font-bold text-primary hover:underline">
                Ver todas →
              </Link>
            </div>
            <div className="divide-y divide-outline-variant/20">
              {alertasQuick.slice(0, 3).map((a, i) => (
                <div key={i} className="p-5 flex items-center justify-between hover:bg-surface-container-low/50 transition-colors gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${a.bg}`}>
                      <span className={`material-symbols-outlined text-xl ${a.color}`}>{a.icon}</span>
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-on-surface truncate">{a.titulo}</h4>
                      <p className="text-xs text-on-surface-variant mt-0.5 truncate">{a.desc}</p>
                    </div>
                  </div>
                  <Link to={a.url} className="text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 glow-primary">
                    {a.label}
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* Acciones Rápidas */}
          <div className="bg-surface-container-lowest dark-card rounded-3xl shadow-sm p-6">
            <h3 className="text-base font-bold text-on-surface mb-4">Acciones rápidas</h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {[
                { icon: 'point_of_sale', label: 'Venta', url: '/erp/ventas', color: 'text-emerald-400 bg-emerald-500/15', glow: 'glow-emerald' },
                { icon: 'receipt_long', label: 'Gasto', url: '/erp/gastos', color: 'text-red-400 bg-red-500/15', glow: 'glow-red' },
                { icon: 'inventory_2', label: 'Stock', url: '/erp/inventario', color: 'text-primary bg-primary/15', glow: 'glow-primary' },
                { icon: 'people', label: 'Clientes', url: '/erp/clientes', color: 'text-purple-400 bg-purple-500/15', glow: 'glow-purple' },
                { icon: 'bar_chart', label: 'Reportes', url: '/erp/reportes', color: 'text-secondary bg-secondary/15', glow: 'glow-secondary' },
              ].map(a => (
                <Link key={a.url} to={a.url}
                  className={`flex flex-col items-center gap-2 p-3 rounded-2xl hover:shadow-md transition-all hover:-translate-y-0.5 group ${a.glow}`}>
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${a.color} group-hover:scale-110 transition-transform`}>
                    <span className="material-symbols-outlined text-xl">{a.icon}</span>
                  </div>
                  <span className="text-xs font-bold text-on-surface-variant">{a.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Columna Derecha */}
        <div className="lg:col-span-4 space-y-6">

          {/* Meta del mes */}
          <div className="bg-surface-container-lowest dark-card rounded-3xl shadow-sm p-6">
            <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider mb-1">Meta del mes</h3>
            <p className="text-xs text-on-surface-variant mb-3">Venta objetivo: {fmt(metaVentas)} ({fmt(totalGastosMes)} de gastos + 35%)</p>
            <div className="flex items-end justify-between mb-2">
              <p className="text-2xl font-black text-on-surface">{fmt(totalVentasMes)}</p>
              <span className={`text-xs font-black ${metaCumplida ? 'text-emerald-600' : 'text-secondary'}`}>{metaProgreso}%</span>
            </div>
            <div className="h-2.5 w-full bg-surface-container-high rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${metaCumplida ? 'bg-emerald-500' : 'bg-secondary'}`}
                style={{ width: `${metaProgreso}%` }}
              />
            </div>
            {metaCumplida && (
              <p className="mt-2 text-xs font-bold text-emerald-600 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">check_circle</span> ¡Meta del mes cumplida!
              </p>
            )}
          </div>

          {/* Calendario tributario */}
          <div className="bg-surface-container-lowest dark-card rounded-3xl shadow-sm p-6">
            <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider mb-4">Calendario tributario</h3>
            <div className="space-y-3">
              {[
                { label: 'F29 — IVA mensual', fecha: `Último día hábil, ${nombreMes}`, urgente: diaDelMes >= 20 },
                { label: 'Pago sueldos', fecha: 'Día 5 del mes siguiente', urgente: diaDelMes <= 5 },
                { label: 'Cotizaciones AFP/Salud', fecha: '10 del mes siguiente', urgente: diaDelMes >= 7 && diaDelMes <= 10 },
              ].map(t => (
                <div key={t.label} className={`flex items-center justify-between p-3 rounded-xl ${t.urgente ? 'bg-amber-500/10 border border-amber-500/20 glow-amber' : 'bg-surface-container-low/50'}`}>
                  <div>
                    <p className={`text-sm font-bold ${t.urgente ? 'text-amber-400' : 'text-on-surface'}`}>{t.label}</p>
                    <p className="text-xs text-outline mt-0.5">{t.fecha}</p>
                  </div>
                  {t.urgente && <span className="text-xs font-bold text-amber-400 bg-amber-500/15 px-2 py-1 rounded-full">¡Pronto!</span>}
                </div>
              ))}
            </div>
          </div>

          {/* CTA Premium */}
          {!esPremium && (
            <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 dark-card rounded-3xl shadow-sm p-7 text-center">
              <div className="w-14 h-14 bg-surface-container rounded-2xl shadow-sm flex items-center justify-center mx-auto text-amber-400 mb-4">
                <span className="material-symbols-outlined text-3xl">rocket_launch</span>
              </div>
              <h3 className="text-lg font-bold text-amber-400 mb-2">Crece sin límites</h3>
              <p className="text-sm text-on-surface-variant mb-5 font-medium">Reportes SII, equipo ilimitado y mentorías premium por solo $10.000/mes.</p>
              <Link to="/erp/suscripcion" className="w-full inline-block bg-amber-500 hover:bg-amber-400 text-surface font-bold py-3 px-4 rounded-2xl text-sm transition-all shadow-lg glow-amber">
                Pásate a Premium
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
