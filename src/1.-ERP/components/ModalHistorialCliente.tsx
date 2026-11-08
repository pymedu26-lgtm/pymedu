import { useMemo, useState } from 'react'
import { Cliente, Venta, Abono } from '../context/ERPContext'
import { cn } from '@/lib/utils'
import ModalResponsivo from '../../components/ModalResponsivo'

interface Props {
  cliente: Cliente
  ventas: Venta[]
  abonos: Abono[]
  onClose: () => void
}

function getYM(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '0000-00'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMes(ym: string): string {
  const [y, m] = ym.split('-')
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  return `${meses[parseInt(m) - 1] ?? '—'} ${y}`
}

export default function ModalHistorialCliente({ cliente, ventas, abonos, onClose }: Props) {
  const { historial } = useMemo(() => {
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
        saldoFin: ventasMes - pagosMes,
      }
    })

    return { historial }
  }, [ventas, abonos, cliente.id])

  const fmt = (n: number) => `$${Math.abs(n).toLocaleString('es-CL')}`

  const detalleCliente: { label: string; valor: string }[] = [
    { label: 'RUT', valor: cliente.rut || '—' },
    { label: 'Teléfono', valor: cliente.telefono || '—' },
    { label: 'Email', valor: cliente.email || '—' },
    { label: 'Dirección', valor: cliente.direccion || '—' },
    { label: 'Comuna', valor: cliente.comuna || '—' },
    { label: 'Límite de crédito', valor: cliente.limite_credito ? fmt(cliente.limite_credito) : 'Sin límite' },
  ]

  const mesesDisponibles = useMemo(() => historial.map(h => h.ym).sort((a, b) => b.localeCompare(a)), [historial])

  const [filtroMes, setFiltroMes] = useState<string>('todos')
  const [soloDeuda, setSoloDeuda] = useState<boolean>(false)

  const historialVisible = useMemo(() => {
    return historial
      .filter(h => (filtroMes === 'todos' ? true : h.ym === filtroMes))
      .filter(h => (soloDeuda ? h.saldoFin > 0 : true))
      .slice()
      .reverse()
  }, [historial, filtroMes, soloDeuda])

  return (
    <ModalResponsivo
      titulo="Historial de pagos y deudas"
      subtitulo={<span className="text-sm">{cliente.nombre}{cliente.rut ? ` • ${cliente.rut}` : ''}</span>}
      onCerrar={onClose}
      ancho="sm:max-w-5xl"
      pie={
        <button type="button" onClick={onClose} className="w-full sm:w-auto min-h-11 px-6 py-3 rounded-2xl bg-primary text-inverse-on-surface font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
          Cerrar
        </button>
      }
    >
      <div className="space-y-4">
        <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6 px-4 py-4 sm:px-6 border-b border-outline-variant/20 bg-surface-container-low/50">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {detalleCliente.map(d => (
              <div key={d.label} className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-outline">{d.label}</p>
                <p className="text-sm text-on-surface font-semibold break-words" title={d.valor}>{d.valor}</p>
              </div>
            ))}
          </div>
          {cliente.notas && (
            <p className="mt-3 text-xs text-on-surface-variant break-words">
              <span className="font-bold text-outline">Notas: </span>{cliente.notas}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
          <span className="text-[10px] font-black uppercase tracking-widest text-outline">Filtros</span>

          <select
            value={filtroMes}
            onChange={e => setFiltroMes(e.target.value)}
            aria-label="Mes"
            className="min-h-11 px-4 py-2 rounded-xl border border-outline-variant/40 text-base sm:text-sm bg-surface-container-lowest text-on-surface font-medium outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="todos">Todos los meses</option>
            {mesesDisponibles.map(m => (
              <option key={m} value={m}>{formatMes(m)}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setSoloDeuda(v => !v)}
            aria-pressed={soloDeuda}
            className={cn(
              'min-h-11 px-4 py-2 rounded-xl border text-sm font-bold transition-colors',
              soloDeuda
                ? 'bg-secondary/10 border-secondary/40 text-secondary'
                : 'bg-surface-container-lowest border-outline-variant/40 text-on-surface-variant hover:border-primary/40'
            )}
          >
            Meses con deuda
          </button>

          {(filtroMes !== 'todos' || soloDeuda) && (
            <button
              type="button"
              onClick={() => { setFiltroMes('todos'); setSoloDeuda(false) }}
              className="min-h-11 px-4 py-2 rounded-xl border border-outline-variant/40 text-sm font-medium text-on-surface-variant hover:bg-surface-container-low transition-colors"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {historialVisible.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-outline-variant/20 bg-surface-container-low p-6 text-center text-sm text-on-surface-variant">
              Sin movimientos que coincidan con los filtros
            </div>
          ) : (
            historialVisible.map(h => (
              <div
                key={h.ym}
                className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-black uppercase tracking-widest text-primary">{h.mes}</p>
                  <span
                    className={cn(
                      'inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide whitespace-nowrap',
                      h.saldoFin > 0 ? 'bg-secondary/10 text-secondary' : 'bg-success/10 text-success'
                    )}
                  >
                    {h.saldoFin > 0 ? 'Con deuda' : 'Pagado'}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-on-surface-variant">Ventas</span>
                    <span className="font-bold text-on-surface">{fmt(h.ventasMes)}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-on-surface-variant">Pagos</span>
                    <span className="font-bold text-success">{fmt(h.pagosMes)}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm pt-1 border-t border-outline-variant/10">
                    <span className="text-on-surface-variant">Deuda/Saldo</span>
                    <span className={cn('font-extrabold', h.saldoFin > 0 ? 'text-secondary' : 'text-success')}>
                      {fmt(h.saldoFin)}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </ModalResponsivo>
  )
}
