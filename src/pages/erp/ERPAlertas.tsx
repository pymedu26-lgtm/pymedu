import { useMemo, useState } from 'react';
import { useERP } from '../../1.-ERP/context/ERPContext';

export default function ERPAlertas() {
  const { ventas, gastos, inventario, documentosTributarios, pagosPOS, promociones, getSaldoPendienteVenta, getSaldoPendienteGasto } = useERP();
  const [filtro, setFiltro] = useState<'todas' | 'stock' | 'documentos' | 'pagos' | 'vencimientos'>('todas');

  const hoy = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const alertas = useMemo(() => {
    const items: { id: string; severidad: 'alta' | 'media' | 'info'; categoria: 'stock' | 'documentos' | 'pagos' | 'vencimientos'; titulo: string; detalle: string }[] = [];

    inventario.filter(p => p.tipo === 'producto' && p.stock <= p.stockMinimo).forEach(p => {
      items.push({
        id: `stock-${p.id}`, severidad: p.stock === 0 ? 'alta' : 'media', categoria: 'stock',
        titulo: `Stock bajo: ${p.nombre}`,
        detalle: `Quedan ${p.stock} unidades (mínimo ${p.stockMinimo}).`,
      });
    });

    documentosTributarios.filter(d => d.estado === 'rechazado_sii' || d.estado === 'observado').slice(0, 10).forEach(d => {
      items.push({
        id: `doc-${d.id}`, severidad: d.estado === 'rechazado_sii' ? 'alta' : 'media', categoria: 'documentos',
        titulo: `Documento ${d.estado === 'rechazado_sii' ? 'rechazado' : 'observado'}`,
        detalle: `${d.tipoDocumento} folio ${d.folioInterno} · ${d.periodoTributario}`,
      });
    });

    pagosPOS.filter(p => p.estadoConciliacion === 'sin_venta').slice(0, 10).forEach(p => {
      items.push({
        id: `pos-${p.id}`, severidad: 'media', categoria: 'pagos',
        titulo: 'Pago POS sin venta asociada',
        detalle: `Pago de $${p.monto.toLocaleString('es-CL')} sin conciliar.`,
      });
    });

    ventas.filter(v => getSaldoPendienteVenta(v.id) > 0 && v.fecha_vencimiento && v.fecha_vencimiento <= hoy).slice(0, 10).forEach(v => {
      items.push({
        id: `vp-${v.id}`, severidad: 'alta', categoria: 'vencimientos',
        titulo: 'Cuenta por cobrar vencida',
        detalle: `${v.cliente} · saldo $${getSaldoPendienteVenta(v.id).toLocaleString('es-CL')} · venció ${v.fecha_vencimiento}.`,
      });
    });

    gastos.filter(g => getSaldoPendienteGasto(g.id) > 0 && g.fecha_vencimiento && g.fecha_vencimiento <= hoy).slice(0, 10).forEach(g => {
      items.push({
        id: `gp-${g.id}`, severidad: 'alta', categoria: 'vencimientos',
        titulo: 'Cuenta por pagar vencida',
        detalle: `${g.proveedor} · saldo $${getSaldoPendienteGasto(g.id).toLocaleString('es-CL')}.`,
      });
    });

    promociones.filter(p => p.estado === 'activa' && p.fechaFin >= hoy).slice(0, 5).forEach(p => {
      const dias = Math.ceil((new Date(p.fechaFin).getTime() - new Date(hoy).getTime()) / 86400000);
      if (dias <= 3) {
        items.push({
          id: `promo-${p.id}`, severidad: 'info', categoria: 'pagos',
          titulo: `Promoción "${p.nombre}" termina pronto`,
          detalle: `Quedan ${dias} día(s) (${p.fechaFin}).`,
        });
      }
    });

    return items.sort((a, b) => {
      const peso = { alta: 0, media: 1, info: 2 };
      return peso[a.severidad] - peso[b.severidad];
    });
  }, [inventario, documentosTributarios, pagosPOS, ventas, gastos, promociones, getSaldoPendienteVenta, getSaldoPendienteGasto, hoy]);

  const filtradas = alertas.filter(a => filtro === 'todas' || a.categoria === filtro);

  const severidadClass = {
    alta: 'border-error/40 bg-error/5',
    media: 'border-secondary/40 bg-secondary/10',
    info: 'border-outline-variant/40 bg-surface-container-lowest',
  } as Record<string, string>;
  const icono = { alta: 'error', media: 'warning', info: 'info' } as Record<string, string>;

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-3xl font-extrabold text-primary flex items-center gap-3">
          <span className="material-symbols-outlined text-4xl">notifications_active</span>
          Centro de alertas
        </h2>
        <p className="text-on-surface-variant mt-1 text-sm">{alertas.length} alertas generadas desde tus datos.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['todas', 'stock', 'documentos', 'pagos', 'vencimientos'] as const).map(cat => (
          <button key={cat} onClick={() => setFiltro(cat)}
            className={`px-4 py-2 rounded-full text-xs font-bold capitalize border-2 transition-colors ${filtro === cat ? 'bg-primary text-white border-primary' : 'border-outline-variant/50 text-on-surface-variant hover:border-primary'}`}>
            {cat}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtradas.length === 0 && (
          <div className="rounded-3xl border border-dashed border-outline-variant bg-surface-container-lowest p-10 text-center">
            <span className="material-symbols-outlined text-4xl text-emerald-600">verified</span>
            <p className="mt-3 font-bold text-on-surface">Sin alertas en esta categoría</p>
            <p className="text-sm text-on-surface-variant mt-1">Todo está al día.</p>
          </div>
        )}
        {filtradas.map(a => (
          <div key={a.id} className={`rounded-2xl border p-4 flex items-start gap-3 ${severidadClass[a.severidad]}`}>
            <span className="material-symbols-outlined text-2xl text-on-surface-variant shrink-0">{icono[a.severidad]}</span>
            <div>
              <p className="font-bold text-on-surface text-sm">{a.titulo}</p>
              <p className="text-sm text-on-surface-variant mt-0.5">{a.detalle}</p>
              <span className="inline-block mt-2 px-2 py-0.5 rounded-full bg-surface-container-high text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">{a.categoria}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}