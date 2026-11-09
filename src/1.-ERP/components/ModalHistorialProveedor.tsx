import { useMemo, useState } from 'react'
import { Proveedor, Gasto, Abono } from '../context/ERPContext'
import { cn } from '@/lib/utils'
import ModalResponsivo from '../../components/ModalResponsivo'

interface Props {
  proveedor: Proveedor
  gastos: Gasto[]
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

export default function ModalHistorialProveedor({ proveedor, gastos, abonos, onClose }: Props) {
  const { historial } = useMemo(() => {
    const gastosProveedor = gastos
      .filter(g => {
        const nombreGasto = (g.proveedor || '').trim().toLowerCase()
        const nombreProveedor = (proveedor.nombre || '').trim().toLowerCase()
        return g.proveedor_id === proveedor.id || (nombreGasto !== '' && nombreGasto === nombreProveedor)
      })
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))

    const gastoIds = new Set(gastosProveedor.map(g => g.id))
    const abonosProveedor = abonos
      .filter(a => a.tipo === 'pago' && gastoIds.has(a.referencia_id))
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))

    const baseGasto = (g: Gasto) => g.saldo_pendiente ?? (g.estado === 'Pendiente' ? (g.monto || 0) : 0)
    const pagadoAlInstante = (g: Gasto) => Math.max(0, (g.monto || 0) - baseGasto(g))

    const keys = new Set<string>()
    gastosProveedor.forEach(g => keys.add(getYM(g.fecha)))
    abonosProveedor.forEach(a => keys.add(getYM(a.fecha)))
    const meses = Array.from(keys).sort()

    let acumGastos = 0
    let acumPagos = 0

    const historial = meses.map(ym => {
      const gastosMes = gastosProveedor
        .filter(g => getYM(g.fecha) === ym)
        .reduce((sum, g) => sum + (g.monto || 0), 0)

      const pagosMes = abonosProveedor
        .filter(a => getYM(a.fecha) === ym)
        .reduce((sum, a) => sum + (a.monto_abono ?? a.monto ?? 0), 0)
        + gastosProveedor
          .filter(g => getYM(g.fecha) === ym)
          .reduce((sum, g) => sum + pagadoAlInstante(g), 0)

      acumGastos += gastosMes
      acumPagos += pagosMes

      return {
        ym,
        mes: formatMes(ym),
        gastosMes,
        pagosMes,
        acumGastos,
        acumPagos,
        saldoFin: gastosMes - pagosMes,
      }
    })

    return { historial }
  }, [gastos, abonos, proveedor.id])

  const fmt = (n: number) => `$${Math.abs(n).toLocaleString('es-CL')}`

  const detalleProveedor: { label: string; valor: string }[] = [
    { label: 'RUT', valor: proveedor.rut || '—' },
    { label: 'Teléfono', valor: proveedor.telefono || '—' },
    { label: 'Email', valor: proveedor.email || '—' },
    { label: 'Categoría', valor: proveedor.categoria || '—' },
    { label: 'Condición', valor: proveedor.condicion_pago || '—' },
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
      subtitulo={<span className="text-sm">{proveedor.nombre}{proveedor.rut ? ` • ${proveedor.rut}` : ''}</span>}
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {detalleProveedor.map(d => (
              <div key={d.label} className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-outline">{d.label}</p>
                <p className="text-sm text-on-surface font-semibold break-words" title={d.valor}>{d.valor}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
          <span className="text-[10px] font-black uppercase tracking-widest text-outline">Filtros</span>

          <select
            value={filtroMes}
            onChange={e => setFiltroMes(e.target.value)}
            aria-label="Mes"
            className="min-h-11 px-4 py-2 rounded-xl border border-outline-variant/40 text-base sm:text-sm bg-surface-container-lowest text-on-surface font-medium outline-none focus:ring-2 focus:ring-error/20"
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
                    <span className="text-on-surface-variant">Gastos</span>
                    <span className="font-bold text-on-surface">{fmt(h.gastosMes)}</span>
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
