import { useMemo, useState } from 'react'
import { Cliente, Venta, Abono } from '../context/ERPContext'
import { cn } from '@/lib/utils'

interface Props {
  cliente: Cliente
  ventas: Venta[]
  abonos: Abono[]
  onClose: () => void
}

type Pestana = 'resumen' | 'ventas' | 'pagos'

const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
  mixto: 'Mixto',
  cheque: 'Cheque',
}

const TIPO_DOC_LABEL: Record<string, string> = {
  boleta_electronica: 'Boleta electrónica',
  factura_electronica: 'Factura electrónica',
  boleta_exenta: 'Boleta exenta',
  factura_exenta: 'Factura exenta',
  nota_venta_interna: 'Nota de venta',
  cotizacion: 'Cotización',
  nota_credito: 'Nota de crédito',
  boleta: 'Boleta',
  factura: 'Factura',
  nota_venta: 'Nota de venta',
  sin_documento: 'Sin documento',
}

const ORIGEN_LABEL: Record<string, string> = {
  manual: 'Manual',
  pos: 'POS',
  banco: 'Banco',
  ajuste: 'Ajuste',
}

function getYM(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '0000-00'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMes(ym: string): string {
  const [y, m] = ym.split('-')
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${meses[parseInt(m) - 1] ?? '—'} ${y}`
}

function formatFecha(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatCurrency(n: number): string {
  const val = Number.isFinite(n) ? n : 0
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(val)
}

function resumenProductos(v: Venta): string {
  const items = v.productos ?? []
  if (items.length === 0) return v.nota || '—'
  const primera = items[0]?.productoNombre || 'Ítem'
  return items.length > 1 ? `${primera} +${items.length - 1}` : primera
}

export default function ModalHistorialCliente({ cliente, ventas, abonos, onClose }: Props) {
  const [pestana, setPestana] = useState<Pestana>('ventas')

  const { ventasCliente, abonosCliente, historial, pagadoPorVenta, total } = useMemo(() => {
    const ventasCliente = ventas
      .filter(v => {
        const nombreVenta = typeof v.cliente === 'string' ? v.cliente.trim().toLowerCase() : ''
        const nombreCliente = (cliente.nombre || '').trim().toLowerCase()
        return v.cliente_id === cliente.id || (nombreVenta !== '' && nombreVenta === nombreCliente)
      })
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))

    const ventaIds = new Set(ventasCliente.map(v => v.id))
    const abonosCliente = abonos
      .filter(a => a.tipo === 'cobro' && ventaIds.has(a.referencia_id))
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))

    const pagadoPorVenta = new Map<string, number>()
    abonosCliente.forEach(a => {
      const monto = a.monto_abono ?? a.monto ?? 0
      pagadoPorVenta.set(a.referencia_id, (pagadoPorVenta.get(a.referencia_id) ?? 0) + monto)
    })

    const baseVenta = (v: Venta) => v.saldo_base ?? v.saldo_pendiente ?? (v.estado === 'Pendiente' ? (v.monto || 0) : 0)

    // Cobrado al instante en la venta (POS/efectivo): para una venta "Pendiente" es 0,
    // para una "Pagado" es todo el monto (no genera abono).
    const cobradoAlInstante = (v: Venta) => Math.max(0, (v.monto || 0) - baseVenta(v))

    const keys = new Set<string>()
    ventasCliente.forEach(v => keys.add(getYM(v.fecha)))
    abonosCliente.forEach(a => keys.add(getYM(a.fecha)))
    const meses = Array.from(keys).sort()

    let acumVentas = 0
    let acumPagos = 0

    const historial = meses.map(ym => {
      const ventasMes = ventasCliente
        .filter(v => getYM(v.fecha) === ym)
        .reduce((sum, v) => sum + (v.monto || 0), 0)

      const pagosMes = abonosCliente
        .filter(a => getYM(a.fecha) === ym)
        .reduce((sum, a) => sum + (a.monto_abono ?? a.monto ?? 0), 0)
        + ventasCliente
          .filter(v => getYM(v.fecha) === ym)
          .reduce((sum, v) => sum + cobradoAlInstante(v), 0)

      acumVentas += ventasMes
      acumPagos += pagosMes

      return {
        ym,
        mes: formatMes(ym),
        ventasMes,
        pagosMes,
        acumVentas,
        acumPagos,
        saldoFin: acumVentas - acumPagos,
      }
    })

    return {
      ventasCliente,
      abonosCliente,
      historial,
      pagadoPorVenta,
      total: {
        nVentas: ventasCliente.length,
        nPagos: abonosCliente.length,
      },
    }
  }, [ventas, abonos, cliente.id])

  const fmt = (n: number) => `$${Math.abs(n).toLocaleString('es-CL')}`

  const ventasPorId = useMemo(() => {
    const map = new Map<string, Venta>()
    ventasCliente.forEach(v => map.set(v.id, v))
    return map
  }, [ventasCliente])

  const detalleCliente: { label: string; valor: string }[] = [
    { label: 'RUT', valor: cliente.rut || '—' },
    { label: 'Teléfono', valor: cliente.telefono || '—' },
    { label: 'Email', valor: cliente.email || '—' },
    { label: 'Dirección', valor: cliente.direccion || '—' },
    { label: 'Comuna', valor: cliente.comuna || '—' },
    { label: 'Límite de crédito', valor: cliente.limite_credito ? fmt(cliente.limite_credito) : 'Sin límite' },
  ]

  const mesesDisponibles = useMemo(() => {
    const set = new Set<string>()
    ventasCliente.forEach(v => set.add(getYM(v.fecha)))
    abonosCliente.forEach(a => set.add(getYM(a.fecha)))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [ventasCliente, abonosCliente])

  const [mesFiltro, setMesFiltro] = useState<string>('todos')

  const tabs: { id: Pestana; label: string; count?: number }[] = [
    { id: 'ventas', label: 'Ventas', count: total.nVentas },
    { id: 'pagos', label: 'Pagos', count: total.nPagos },
  ]

  return (
    <div className="fixed inset-0 bg-scrim/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">

        <div className="flex items-start justify-between p-6 border-b border-outline-variant/20 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-primary">Historial de pagos y deudas</h2>
            <p className="text-sm text-on-surface-variant mt-1">
              {cliente.nombre}
              {cliente.rut ? ` • ${cliente.rut}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors" aria-label="Cerrar">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="px-6 py-4 border-b border-outline-variant/20 bg-surface-container-low/50 shrink-0">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {detalleCliente.map(d => (
              <div key={d.label}>
                <p className="text-[10px] font-black uppercase tracking-widest text-outline">{d.label}</p>
                <p className="text-sm text-on-surface font-semibold truncate" title={d.valor}>{d.valor}</p>
              </div>
            ))}
          </div>
          {cliente.notas && (
            <p className="mt-3 text-xs text-on-surface-variant">
              <span className="font-bold text-outline">Notas: </span>{cliente.notas}
            </p>
          )}
        </div>

        <div className="flex gap-1 px-6 pt-4 shrink-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setPestana(t.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-colors',
                pestana === t.id ? 'bg-primary text-inverse-on-surface shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-surface-container-low'
              )}
            >
              {t.label}
              {t.count !== undefined && (
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-black', pestana === t.id ? 'bg-white/20' : 'bg-surface-container-high')}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {mesesDisponibles.length === 0 ? (
                <div className="col-span-full rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4 text-center text-sm text-on-surface-variant">
                  Sin movimientos por mes
                </div>
              ) : (
                mesesDisponibles.map(m => {
                  const h = historial.find(x => x.ym === m)
                  if (!h) return null
                  return (
                    <div
                      key={m}
                      className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-black uppercase tracking-widest text-primary">{formatMes(m)}</p>
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide',
                            h.saldoFin > 0 ? 'bg-secondary/10 text-secondary' : 'bg-success/10 text-success'
                          )}
                        >
                          {h.saldoFin > 0 ? 'Con deuda' : 'Pagado'}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-on-surface-variant">Ventas</span>
                          <span className="font-bold text-on-surface">{fmt(h.ventasMes)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-on-surface-variant">Pagos</span>
                          <span className="font-bold text-success">{fmt(h.pagosMes)}</span>
                        </div>
                        <div className="flex justify-between text-sm pt-1 border-t border-outline-variant/10">
                          <span className="text-on-surface-variant">Deuda/Saldo</span>
                          <span className={cn('font-extrabold', h.saldoFin > 0 ? 'text-secondary' : 'text-success')}>
                            {fmt(h.saldoFin)}
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px] text-on-surface-variant mt-1">
                          <span>Acum. ventas {fmt(h.acumVentas)}</span>
                          <span>Acum. pagos {fmt(h.acumPagos)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {pestana === 'ventas' && (
            ventasCliente.length === 0 ? (
              <p className="text-center text-on-surface-variant py-10">Este cliente no registra ventas.</p>
            ) : (
              <div className="rounded-2xl border border-outline-variant/20 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-surface-container-low">
                    <tr>
                      {['Fecha', 'Documento', 'Detalle', 'Total', 'Cobrado', 'Saldo', 'Estado'].map((h, i) => (
                        <th key={h} className={cn('p-3 text-xs font-bold text-outline uppercase tracking-wider', i >= 3 && i <= 5 ? 'text-right' : 'text-left')}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {ventasCliente.map(v => {
                      const totalV = v.monto || 0
                      const base = v.saldo_base ?? v.saldo_pendiente ?? (v.estado === 'Pendiente' ? totalV : 0)
                      const cobrado = pagadoPorVenta.get(v.id) ?? (v.estado === 'Pagado' ? totalV : 0)
                      const saldo = Math.max(0, base - (pagadoPorVenta.get(v.id) ?? 0))
                      return (
                        <tr key={v.id} className="hover:bg-surface-container-low/50 align-top">
                          <td className="p-3 text-on-surface-variant whitespace-nowrap">{v.fecha ? v.fecha.split('T')[0] : '—'}</td>
                          <td className="p-3 text-on-surface">{TIPO_DOC_LABEL[v.tipo_documento ?? ''] ?? (v.tipo_documento || 'Boleta')}</td>
                          <td className="p-3 text-on-surface-variant max-w-[220px]">{resumenProductos(v)}</td>
                          <td className="p-3 text-right font-bold text-on-surface">{fmt(totalV)}</td>
                          <td className="p-3 text-right text-success">{fmt(cobrado)}</td>
                          <td className={cn('p-3 text-right font-bold', saldo > 0 ? 'text-secondary' : 'text-success')}>{fmt(saldo)}</td>
                          <td className="p-3">
                            <span className={cn(
                              'inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide',
                              saldo > 0 ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'
                            )}>
                              {saldo > 0 ? 'Pendiente' : 'Pagado'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {pestana === 'pagos' && (
            abonosCliente.length === 0 ? (
              <p className="text-center text-on-surface-variant py-10">Este cliente no registra pagos.</p>
            ) : (
              <div className="rounded-2xl border border-outline-variant/20 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-surface-container-low">
                    <tr>
                      {['Fecha', 'Monto', 'Método', 'Origen', 'Venta asociada', 'Nota'].map((h, i) => (
                        <th key={h} className={cn('p-3 text-xs font-bold text-outline uppercase tracking-wider', i === 1 ? 'text-right' : 'text-left')}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {abonosCliente.map(a => {
                      const venta = ventasPorId.get(a.referencia_id)
                      return (
                        <tr key={a.id} className="hover:bg-surface-container-low/50 align-top">
                          <td className="p-3 text-on-surface-variant whitespace-nowrap">{a.fecha ? a.fecha.split('T')[0] : '—'}</td>
                          <td className="p-3 text-right font-extrabold text-success whitespace-nowrap">{fmt(a.monto_abono ?? a.monto ?? 0)}</td>
                          <td className="p-3 text-on-surface">{METODO_LABEL[a.metodo_pago] || a.metodo_pago || '—'}</td>
                          <td className="p-3 text-on-surface-variant">{ORIGEN_LABEL[a.origen || ''] || a.origen || 'Manual'}</td>
                          <td className="p-3 text-on-surface-variant">
                            {venta
                              ? `${TIPO_DOC_LABEL[venta.tipo_documento || ''] || 'Venta'} • ${fmt(venta.monto || 0)}`
                              : '—'}
                          </td>
                          <td className="p-3 text-on-surface-variant">{a.nota || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>

        <div className="flex justify-end p-6 border-t border-outline-variant/20 bg-surface-container-low/50 shrink-0">
          <button onClick={onClose} className="px-6 py-3 rounded-2xl bg-primary text-inverse-on-surface font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
