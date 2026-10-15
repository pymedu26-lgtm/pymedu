import { useMemo } from "react"
import { Cliente, Venta, Abono } from "../context/ERPContext"

interface Props {
  cliente: Cliente
  ventas: Venta[]
  abonos: Abono[]
  onClose: () => void
}

function getYM(d: string | Date): string {
  const x = new Date(d)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}

function formatMes(ym: string): string {
  const [y, m] = ym.split("-")
  const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
  return `${meses[parseInt(m) - 1]} ${y}`
}

function formatCurrency(n: number): string {
  const val = Number.isFinite(n) ? n : 0
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" }).format(val)
}

export default function ModalHistorialCliente({ cliente, ventas, abonos, onClose }: Props) {
  const { ventasCliente, abonosCliente, historial } = useMemo(() => {
    const ventasCliente = ventas.filter(v => {
      const c: any = v.cliente
      return c?.id === cliente.id || v.cliente_id === cliente.id || c === cliente.id
    })

    const ventaIds = new Set(ventasCliente.map(v => v.id))
    const abonosCliente = abonos.filter(a => a.tipo === "cobro" && ventaIds.has(a.referencia_id))

    const keys = new Set<string>()
    ventasCliente.forEach(v => keys.add(getYM(v.fecha)))
    abonosCliente.forEach(a => keys.add(getYM(a.fecha)))

    const meses = Array.from(keys).sort()

    let acumVentas = 0
    let acumPagos = 0

    const historial = meses.map(ym => {
      const ventasMes = ventasCliente
        .filter(v => getYM(v.fecha) === ym)
        .reduce((sum, v) => sum + (v.saldo_base || 0), 0)

      const pagosMes = abonosCliente
        .filter(a => getYM(a.fecha) === ym)
        .reduce((sum, a) => sum + (a.monto || 0), 0)

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

    return { ventasCliente, abonosCliente, historial }
  }, [ventas, abonos, cliente.id])

  const totalFacturado = useMemo(() => ventasCliente.reduce((s, v) => s + (v.saldo_base || 0), 0), [ventasCliente])
  const totalPagado = useMemo(() => abonosCliente.reduce((s, a) => s + (a.monto || 0), 0), [abonosCliente])
  const deudaActual = cliente.deuda || 0

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold">Historial de pagos / deudas</h2>
            <p className="text-sm text-gray-600 mt-1">{cliente.nombre}{cliente.rut ? ` • ${cliente.rut}` : ""}</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700">
            ×
          </button>
        </div>

        <div className="p-6 border-b bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-lg border">
              <div className="text-sm text-gray-600">Total facturado</div>
              <div className="text-2xl font-bold">{formatCurrency(totalFacturado)}</div>
            </div>
            <div className="bg-white p-4 rounded-lg border">
              <div className="text-sm text-gray-600">Total pagado</div>
              <div className="text-2xl font-bold text-green-600">{formatCurrency(totalPagado)}</div>
            </div>
            <div className="bg-white p-4 rounded-lg border">
              <div className="text-sm text-gray-600">Deuda actual</div>
              <div className={`text-2xl font-bold ${deudaActual > 0 ? "text-orange-600" : "text-green-600"}`}>
                {formatCurrency(deudaActual)}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {historial.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Sin movimientos registrados para este cliente
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Mes</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Ventas del mes</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Pagos del mes</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Acumulado ventas</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Acumulado pagos</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Saldo al cierre del mes</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map(item => (
                    <tr key={item.ym} className="border-t">
                      <td className="px-4 py-2 font-medium">{item.mes}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(item.ventasMes)}</td>
                      <td className="px-4 py-2 text-right text-green-600">{formatCurrency(item.pagosMes)}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(item.acumVentas)}</td>
                      <td className="px-4 py-2 text-right text-green-600">{formatCurrency(item.acumPagos)}</td>
                      <td className={`px-4 py-2 text-right font-semibold ${item.saldoFin > 0 ? "text-orange-600" : "text-green-600"}`}>
                        {formatCurrency(item.saldoFin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
