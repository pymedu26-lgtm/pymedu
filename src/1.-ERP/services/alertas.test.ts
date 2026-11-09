import { describe, it, expect } from 'vitest';
import type { Producto } from '../context/ERPContext';
import {
  agruparStockBajo, calcularCondiciones, construirAlertas, cuentaCampana, marcarAlertas, registrarEventos, sincronizarCondiciones,
  type DatosAlertas, type Notificacion,
} from './alertas';
import type { Saldos } from './saldos';

const saldos: Saldos = {
  resumen: { porCobrar: 0, porPagar: 0, ventasPorCobrar: 0, comprasPorPagar: 0, clientesConDeuda: 0, proveedoresConDeuda: 0, vencidoCobrar: 0, vencidoPagar: 0, ventasVencidas: 0, comprasVencidas: 0 },
  porVenta: new Map(), porGasto: new Map(), pendientesCobrar: [], pendientesPagar: [],
};
const producto = (id: string, stock: number, minimo = 5): Producto => ({
  id, nombre: `Producto ${id}`, codigo: id, categoria: 'General', tipo: 'producto', costo: 100, precio: 200, stock, stockMinimo: minimo,
  stockMinimoUnidad: minimo, unidadMinimo: 'unidad', unidadMedida: 'un', unidadBase: 'unidad', estado: 'activo',
});
const datos = (inventario: Producto[]): DatosAlertas => ({ inventario, saldos, documentosTributarios: [], pagosPOS: [], promociones: [], movimientos: [], hoy: '2026-11-25' });
const T0 = '2026-11-15T10:00:00.000Z';
const T1 = '2026-11-15T11:00:00.000Z';
let n = 0;
const id = () => `n${++n}`;

describe('centro de alertas', () => {
  it('agrupa: 1 producto con stock bajo = su propia tarjeta; 5 productos = UNA tarjeta expandible', () => {
    const uno = construirAlertas(calcularCondiciones(datos([producto('a', 3)])), [], T0);
    expect(uno.filter(a => a.clave.startsWith('stock-bajo')).map(a => a.clave)).toEqual(['stock-bajo:a']);
    const cinco = construirAlertas(calcularCondiciones(datos(['a', 'b', 'c', 'd', 'e'].map(x => producto(x, 2)))), [], T0);
    const grupo = cinco.filter(a => a.clave.startsWith('stock-bajo'));
    expect(grupo).toHaveLength(1);
    expect(grupo[0]).toMatchObject({ clave: 'stock-bajo', titulo: '5 productos con stock bajo' });
    expect(grupo[0].grupo).toHaveLength(5);
    expect(grupo[0].grupo![0].acciones[0]).toEqual({ etiqueta: 'Reponer', url: '/erp/inventario?producto=a&accion=reponer' });
    expect(cuentaCampana(cinco)).toBe(1);
  });

  it('se resuelve sola al reponer y reaparece como nueva si vuelve a bajar', () => {
    let filas: Notificacion[] = [];
    filas = sincronizarCondiciones(calcularCondiciones(datos([producto('a', 3)])), filas, T0);
    filas = marcarAlertas(filas, ['stock-bajo:a'], 'vista', T0);
    // Repone: la condición desaparece → resuelta.
    filas = sincronizarCondiciones(calcularCondiciones(datos([producto('a', 50)])), filas, T1);
    expect(filas.find(f => f.clave === 'stock-bajo:a')).toMatchObject({ resueltaEn: T1 });
    expect(construirAlertas(calcularCondiciones(datos([producto('a', 50)])), filas, T1).some(a => a.clave === 'stock-bajo:a')).toBe(false);
    // Vuelve a bajar: nueva otra vez (aunque antes se había marcado vista).
    const t2 = '2026-11-16T09:00:00.000Z';
    const cond = calcularCondiciones(datos([producto('a', 1)]));
    filas = sincronizarCondiciones(cond, filas, t2);
    expect(construirAlertas(cond, filas, t2).find(a => a.clave === 'stock-bajo:a')!.estado).toBe('nueva');
  });

  it('una alerta pospuesta desaparece y vuelve en su fecha', () => {
    const cond = calcularCondiciones(datos([producto('a', 3)]));
    const filas = marcarAlertas(sincronizarCondiciones(cond, [], T0), ['stock-bajo:a'], 'pospuesta', T0, '2026-11-16T08:00:00.000Z');
    expect(construirAlertas(cond, filas, T1).find(a => a.clave === 'stock-bajo:a')!.estado).toBe('pospuesta');
    expect(construirAlertas(cond, filas, '2026-11-16T08:00:01.000Z').find(a => a.clave === 'stock-bajo:a')!.estado).toBe('nueva');
  });

  it('«vista» persiste al recalcular (objetos nuevos, misma clave)', () => {
    let filas = sincronizarCondiciones(calcularCondiciones(datos([producto('a', 3)])), [], T0);
    filas = marcarAlertas(filas, ['stock-bajo:a'], 'vista', T0);
    const recalculadas = calcularCondiciones(datos([producto('a', 2)])); // cambió el detalle, no la clave
    expect(sincronizarCondiciones(recalculadas, filas, T1)).toBe(filas); // nada que guardar
    expect(construirAlertas(recalculadas, filas, T1).find(a => a.clave === 'stock-bajo:a')!.estado).toBe('vista');
  });

  it('eventos: no se duplican por clave y la venta bloqueada repetida suma «veces»', () => {
    const apertura = { tipo: 'apertura_automatica' as const, clave: 'apertura:F4', productoId: 'p', titulo: 'Se abrió la botella F4 de Lattafa Asad', detalle: 'Quedan 18 botellas cerradas.' };
    const bloqueada = { tipo: 'venta_bloqueada' as const, clave: 'venta-bloqueada:p:2026-11-15', productoId: 'p', titulo: 'Venta no realizada por falta de stock', detalle: 'No alcanza…' };
    let filas = registrarEventos([], [apertura, bloqueada], T0, id);
    filas = registrarEventos(filas, [apertura, bloqueada], T1, id);
    expect(filas).toHaveLength(2);
    expect(filas.find(f => f.clave === bloqueada.clave)!.veces).toBe(2);
    const alertas = construirAlertas([], filas, T1);
    expect(alertas.map(a => a.seccion)).toEqual(['actividad', 'actividad']);
    // Descartar un evento lo saca de las visibles.
    filas = marcarAlertas(filas, [apertura.clave], 'descartada', T1);
    expect(construirAlertas([], filas, T1).find(a => a.clave === apertura.clave)!.estado).toBe('descartada');
  });

  it('agruparStockBajo no toca listas con un solo producto', () => {
    const lista = construirAlertas(calcularCondiciones(datos([producto('a', 3)])), [], T0);
    expect(agruparStockBajo(lista)).toBe(lista);
  });
});
