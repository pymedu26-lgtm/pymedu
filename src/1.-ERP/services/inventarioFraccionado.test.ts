import { describe, it, expect } from 'vitest';
import type { Producto, Envase, Lote, VentaProducto, MovimientoInventario } from '../context/ERPContext';
import {
  aBase, abrirEnvase, ajustarEnvase, convertirUnidades, crearEnvases, formatCantidad, normalizarProducto,
  procesarVenta, reponerEnvases, resumenStock, revertirConsumos, revertirVenta, stockDisponible,
  textoDisponibilidad, venderCompleto, venderPorcion, remanentesSinUso, describirConsumos, estadoStockProducto,
  textoMinimo, normalizarMinimo, type EstadoInventario,
} from './inventarioFraccionado';
import { calcularResumen, formularioVacio, productoDesdeFormulario, validarFormulario } from './registroProducto';

let secuencia = 0;
const nuevoId = () => `id-${++secuencia}`;
const AHORA = '2026-11-08T12:00:00.000Z';
const op = { nuevoId, ahora: AHORA };

const perfume = (extra: Partial<Producto> = {}): Producto => ({
  id: 'perfume', nombre: 'Lattafa Asad', codigo: 'LAT', categoria: 'Perfumería', tipo: 'producto', costo: 300, precio: 45000,
  incluyeIva: true, stock: 1970, unidadMedida: 'ml', estado: 'activo', unidadBase: 'ml', controlEnvases: true, capacidadEnvase: 100,
  formaCompra: 'envase', nombreEnvase: 'frasco',
  presentaciones: [
    { id: 'frasco', nombre: 'Frasco 100 ml', factor: 100, precio: 45000, tipo: 'completa', origen: 'envase_cerrado', activa: true },
    { id: 'd5', nombre: 'Decant 5 ml', factor: 5, precio: 5000, tipo: 'porcion', origen: 'envase_abierto', activa: true },
    { id: 'd10', nombre: 'Decant 10 ml', factor: 10, precio: 9000, tipo: 'porcion', origen: 'envase_abierto', activa: true },
  ],
  ...extra,
});

/** 20 frascos de 100 ml: 19 cerrados + 1 abierto con 70 ml. */
function inventarioPerfume(abiertos: number[] = [70], cerrados = 19) {
  const p = perfume();
  const envases = crearEnvases(p, [], { cerrados, abiertos, loteId: 'L1', ahora: AHORA }, op);
  const total = cerrados * 100 + abiertos.reduce((a, b) => a + b, 0);
  const lotes: Lote[] = [{ id: 'L1', productoId: p.id, fecha: '2026-11-01', cantidadInicial: total, cantidadRestante: total, costoUnitario: 300 }];
  return { p: { ...p, stock: total }, envases, lotes };
}

const linea = (productoId: string, cantidad: number, presentacionId?: string): VentaProducto => ({
  productoId, productoNombre: productoId, esInventariable: true, cantidad, precioBase: 0, costoUnitario: 0, subtotal: 0, iva: 0, total: 0,
  ...(presentacionId ? { presentacionId } : {}),
});

describe('registro de producto', () => {
  it('producto simple: unidades y costo sin envases', () => {
    const f = { ...formularioVacio(), forma: 'unidad' as const, unidades: 40, costoUnidad: 1500, precioUnidad: 2990 };
    expect(validarFormulario(f)).toEqual({});
    const { producto, inicial } = productoDesdeFormulario(f);
    expect(producto).toMatchObject({ formaCompra: 'unidad', unidadBase: 'unidad', controlEnvases: false, stock: 40, costo: 1500, precio: 2990 });
    expect(inicial.cantidadBase).toBe(40);
  });

  it('20 frascos de 100 ml con 1 abierto de 70 ml → 1.970 ml disponibles', () => {
    const f = {
      ...formularioVacio(), forma: 'frasco' as const, envases: 20, contenido: 100, unidadContenido: 'ml' as const, costoEnvase: 30000,
      abiertos: [{ id: 'a', restante: 70 }], venderCompleto: true, precioCompleto: 45000,
      subcategorias: [{ id: 'd5', nombre: '', tipo: 'fija' as const, cantidad: 5, unidad: 'ml' as const, precio: 5000, costoInsumos: 0, insumoId: '', insumoCantidad: 1, activa: true }],
    };
    expect(validarFormulario(f)).toEqual({});
    const r = calcularResumen(f);
    expect(r.totalBase).toBe(1970);
    expect(r.texto).toBe('19 botellas cerradas · 1 abierta (70 ml) · equivale a 19,7 botellas');
    expect(r.costoBase).toBe(300);
    const { producto, inicial } = productoDesdeFormulario(f);
    expect(producto).toMatchObject({ controlEnvases: true, capacidadEnvase: 100, unidadBase: 'ml', formaCompra: 'envase' });
    expect(producto.presentaciones?.map(x => [x.nombre, x.factor, x.origen])).toEqual([
      ['Botella completa', 100, 'envase_cerrado'], ['Decant 5 ml', 5, 'envase_abierto'],
    ]);
    expect(inicial).toMatchObject({ cerrados: 19, abiertos: [70] });
    const { envases, p } = inventarioPerfume();
    expect(stockDisponible(p, envases)).toBe(1970);
    expect(resumenStock(p, envases).texto).toBe('19 frascos + 1 abierto (70 ml)');
  });

  it('valida en línea: contenido obligatorio, abiertos ≤ total y remanente ≤ contenido', () => {
    const f = { ...formularioVacio(), forma: 'frasco' as const, envases: 1, contenido: 0, abiertos: [{ id: 'a', restante: 70 }, { id: 'b', restante: 150 }], venderCompleto: true, precioCompleto: 0 };
    const e = validarFormulario(f);
    expect(e.contenido).toBeTruthy();
    expect(e.abiertos).toBeTruthy();
    expect(e.precioCompleto).toBeTruthy();
    const e2 = validarFormulario({ ...f, contenido: 100, envases: 2 });
    expect(e2['abierto-b']).toBeTruthy();
    expect(e2['abierto-a']).toBeUndefined();
  });
});

describe('envases', () => {
  it('abrir un frasco no cambia el total disponible', () => {
    const { p, envases } = inventarioPerfume();
    const r = abrirEnvase(p, envases, undefined, op);
    expect(r.error).toBeUndefined();
    expect(stockDisponible(p, r.envases)).toBe(1970);
    expect(r.envases.filter(e => e.estado === 'abierto')).toHaveLength(2);
    expect(r.movimientos[0]).toMatchObject({ tipo: 'apertura', envaseId: r.envases.find(e => e.codigo === 'F1')!.id });
  });

  it('decant de 5 ml desde el abierto con 70 ml → queda en 65 ml', () => {
    const { p, envases } = inventarioPerfume();
    const r = venderPorcion(p, envases, p.presentaciones![1], 1, op);
    expect(r.error).toBeUndefined();
    expect(r.envases.find(e => e.codigo === 'F20')!.restante).toBe(65);
    expect(stockDisponible(p, r.envases)).toBe(1965);
    expect(r.consumos).toEqual([{ envaseId: envases.find(e => e.codigo === 'F20')!.id, cantidad: 5 }]);
  });

  it('frasco completo resta un cerrado y nunca usa el abierto', () => {
    const { p, envases } = inventarioPerfume();
    const r = venderCompleto(p, envases, 1, op);
    expect(r.error).toBeUndefined();
    expect(r.envases.filter(e => e.estado === 'cerrado')).toHaveLength(18);
    expect(r.envases.find(e => e.codigo === 'F20')).toMatchObject({ estado: 'abierto', restante: 70 });
    expect(r.envases.find(e => e.codigo === 'F1')).toMatchObject({ estado: 'vendido', restante: 0 });

    // Sin cerrados no se vende el abierto como completo.
    const soloAbierto = inventarioPerfume([70], 0);
    const r2 = venderCompleto(soloAbierto.p, soloAbierto.envases, 1, op);
    expect(r2.error?.codigo).toBe('sin_cerrados');
    expect(r2.envases).toBe(soloAbierto.envases);
  });

  it('varios abiertos con remanentes independientes respetan la política', () => {
    const { p, envases } = inventarioPerfume([70, 12], 2);
    // F3 abierto 70 ml (abierto antes), F4 abierto 12 ml.
    const abiertos = envases.map(e => (e.codigo === 'F3' ? { ...e, abiertoEn: '2026-10-01T00:00:00.000Z' } : e));
    const menos = venderPorcion(p, abiertos, p.presentaciones![2], 1, { ...op, politica: 'menos_contenido' });
    expect(menos.envases.find(e => e.codigo === 'F4')!.restante).toBe(2);
    expect(menos.envases.find(e => e.codigo === 'F3')!.restante).toBe(70);
    const antiguo = venderPorcion(p, abiertos, p.presentaciones![2], 1, { ...op, politica: 'mas_antiguo' });
    expect(antiguo.envases.find(e => e.codigo === 'F3')!.restante).toBe(60);
    expect(antiguo.envases.find(e => e.codigo === 'F4')!.restante).toBe(12);
  });

  it('agota un frasco (queda «agotado» y se conserva) y la siguiente venta abre otro sola', () => {
    const { p, envases } = inventarioPerfume([5], 1);
    const r = venderPorcion(p, envases, p.presentaciones![1], 1, op);
    const agotado = r.envases.find(e => e.codigo === 'F2')!;
    expect(agotado).toMatchObject({ estado: 'agotado', restante: 0 });
    expect(r.envases).toHaveLength(2);
    expect(r.aperturas).toHaveLength(0);

    const siguiente = venderPorcion(p, r.envases, p.presentaciones![1], 1, op);
    expect(siguiente.error).toBeUndefined();
    expect(siguiente.envases.find(e => e.codigo === 'F1')).toMatchObject({ estado: 'abierto', restante: 95 });
    expect(siguiente.aperturas!.map(e => e.codigo)).toEqual(['F1']);
    expect(siguiente.movimientos.map(m => m.tipo)).toEqual(['apertura', 'salida']);
  });

  it('abierta con 3 ml y cerradas disponibles: un decant de 5 ml abre otra y los 3 ml quedan como remanente', () => {
    const { p, envases } = inventarioPerfume([3], 5);
    const r = venderPorcion(p, envases, p.presentaciones![1], 1, op);
    expect(r.error).toBeUndefined();
    expect(r.aperturas!.map(e => e.codigo)).toEqual(['F1']);
    expect(r.envases.find(e => e.codigo === 'F1')).toMatchObject({ estado: 'abierto', restante: 95 });
    expect(r.envases.find(e => e.codigo === 'F6')).toMatchObject({ estado: 'abierto', restante: 3 });
    expect(r.envases.filter(e => e.estado === 'cerrado')).toHaveLength(4);
    expect(remanentesSinUso(p, r.envases).map(e => e.codigo)).toEqual(['F6']);
    // Con «combinar abiertas antes de abrir otra» usa los remanentes y no abre nada.
    const dos = inventarioPerfume([3, 3], 5);
    const mezcla = venderPorcion(dos.p, dos.envases, dos.p.presentaciones![1], 1, { ...op, permitirMezclar: true });
    expect(mezcla.aperturas).toHaveLength(0);
    expect(stockDisponible(dos.p, mezcla.envases)).toBe(501);
  });

  it('sin cerradas, varias abiertas que juntas alcanzan se combinan («3 ml de F2 + 2 ml de F1»)', () => {
    const { p, envases } = inventarioPerfume([4, 3], 0);
    const r = venderPorcion(p, envases, p.presentaciones![1], 1, op);
    expect(r.error).toBeUndefined();
    expect(r.aperturas).toHaveLength(0);
    expect(r.consumos).toHaveLength(2);
    expect(describirConsumos(p, r.envases, r.consumos)).toBe('3 ml de F2 + 2 ml de F1');
    expect(stockDisponible(p, r.envases)).toBe(2);
  });

  it('sin cerradas y una abierta con 3 ml: un decant de 5 ml se bloquea con el máximo vendible', () => {
    const { p, envases } = inventarioPerfume([3], 0);
    const r = venderPorcion(p, envases, p.presentaciones![1], 1, op);
    expect(r.error).toMatchObject({ codigo: 'stock_insuficiente', maximo: 0 });
    expect(r.error!.mensaje).toBe('No alcanza: de Lattafa Asad quedan 3 ml (0 frascos cerrados) y pides 5 ml.');
    expect(r.envases).toBe(envases);
    expect(r.movimientos).toHaveLength(0);
  });

  it('merma con motivo obligatorio y reposición que continúa la numeración', () => {
    const { p, envases } = inventarioPerfume();
    const f20 = envases.find(e => e.codigo === 'F20')!;
    expect(ajustarEnvase(p, envases, { envaseId: f20.id, cantidad: 5, motivo: ' ', tipo: 'merma' }, op).error?.codigo).toBe('motivo_requerido');
    const merma = ajustarEnvase(p, envases, { envaseId: f20.id, cantidad: 5, motivo: 'Se derramó', tipo: 'merma' }, op);
    expect(merma.envases.find(e => e.id === f20.id)!.restante).toBe(65);
    expect(merma.movimientos[0]).toMatchObject({ tipo: 'merma', cantidad: 5, envaseId: f20.id });
    const repo = reponerEnvases(p, envases, { cantidadEnvases: 2, motivo: 'Compra' }, op);
    expect(repo.nuevos.map(e => e.codigo)).toEqual(['F21', 'F22']);
    expect(stockDisponible(p, repo.envases)).toBe(2170);
  });

  it('disponibilidad en Ventas: stock aprovechable ÷ cantidad y de dónde sale la próxima', () => {
    const { p, envases } = inventarioPerfume();
    expect(textoDisponibilidad(p, envases, p.presentaciones![0]).texto).toBe('19 disponibles');
    expect(textoDisponibilidad(p, envases, p.presentaciones![1])).toMatchObject({ unidades: 394, texto: '394 disponibles', detalle: 'desde F20 (70 ml)' });
    const poco = inventarioPerfume([3], 2);
    expect(textoDisponibilidad(poco.p, poco.envases, poco.p.presentaciones![1])).toMatchObject({ unidades: 40, detalle: 'abrirá F1' });
    const soloAbiertos = inventarioPerfume([70], 0);
    expect(textoDisponibilidad(soloAbiertos.p, soloAbiertos.envases, soloAbiertos.p.presentaciones![0]).texto).toBe('Sin frascos cerrados');
  });
});

describe('ventas', () => {
  const unidad: Producto = {
    id: 'cafe', nombre: 'Café', codigo: 'C', categoria: 'Abarrotes', tipo: 'producto', costo: 1000, precio: 2000, stock: 10,
    unidadMedida: 'un', estado: 'activo', unidadBase: 'unidad', formaCompra: 'unidad',
  };
  const estadoBase = (): EstadoInventario => {
    const { p, envases, lotes } = inventarioPerfume();
    return {
      productos: [p, unidad], envases,
      lotes: [...lotes, { id: 'L2', productoId: 'cafe', fecha: '2026-11-01', cantidadInicial: 10, cantidadRestante: 10, costoUnitario: 1000 }],
      movimientos: [],
    };
  };

  it('rechaza todo si una línea no tiene stock (frascos y unidades) y no cambia nada', () => {
    const estado = estadoBase();
    const r = procesarVenta(estado, 'v1', [linea('cafe', 2), linea('perfume', 25, 'frasco')], op);
    expect(r.error).toMatchObject({ codigo: 'sin_cerrados', linea: 1 });
    expect(r.estado).toBe(estado);
    const r2 = procesarVenta(estado, 'v2', [linea('cafe', 11)], op);
    expect(r2.error?.codigo).toBe('stock_insuficiente');
  });

  it('venta mixta: descuenta, congela costo y guarda de qué frasco salió', () => {
    const r = procesarVenta(estadoBase(), 'v1', [linea('perfume', 2, 'd5'), linea('perfume', 1, 'frasco'), linea('cafe', 3)], op);
    expect(r.error).toBeUndefined();
    const perfumeNuevo = r.estado.productos.find(p => p.id === 'perfume')!;
    expect(perfumeNuevo.stock).toBe(1860);
    expect(r.estado.productos.find(p => p.id === 'cafe')!.stock).toBe(7);
    expect(r.lineas[0]).toMatchObject({ cantidadBase: 10, costoVenta: 3000 });
    expect(r.lineas[0].consumosEnvase).toHaveLength(1);
    expect(r.lineas[1].consumosEnvase![0].envaseVendidoCompleto).toBe(true);
    expect(r.movimientos.map(m => [m.productoId, m.cantidad])).toEqual([['perfume', 110], ['cafe', 3]]);
  });

  it('doble procesamiento de la misma venta → un solo descuento', () => {
    const primero = procesarVenta(estadoBase(), 'v1', [linea('cafe', 3)], op);
    const segundo = procesarVenta(primero.estado, 'v1', [linea('cafe', 3)], op);
    expect(segundo.duplicada).toBe(true);
    expect(segundo.estado).toBe(primero.estado);
    expect(segundo.estado.productos.find(p => p.id === 'cafe')!.stock).toBe(7);
  });

  it('anular devuelve los ml al mismo frasco y el frasco completo vuelve a cerrado sin crear uno nuevo', () => {
    const inicial = estadoBase();
    const vendido = procesarVenta(inicial, 'v1', [linea('perfume', 2, 'd5'), linea('perfume', 1, 'frasco'), linea('cafe', 3)], op);
    const anulado = revertirVenta(vendido.estado, 'v1', op);
    expect(anulado.error).toBeUndefined();
    expect(anulado.estado.envases).toHaveLength(inicial.envases.length);
    for (const e of inicial.envases) {
      expect(anulado.estado.envases.find(x => x.id === e.id)).toMatchObject({ estado: e.estado, restante: e.restante });
    }
    expect(anulado.estado.productos.find(p => p.id === 'perfume')!.stock).toBe(1970);
    expect(anulado.estado.productos.find(p => p.id === 'cafe')!.stock).toBe(10);
    expect(anulado.estado.lotes.find(l => l.id === 'L1')!.cantidadRestante).toBe(1970);
    // Historial: la salida queda marcada y hay una devolución que la compensa.
    expect(anulado.estado.movimientos.filter(m => m.tipo === 'salida').every(m => m.revertido)).toBe(true);
    expect(anulado.movimientos.map(m => m.tipo)).toEqual(['devolucion', 'devolucion']);
    // Tras anular, la misma venta se puede volver a aplicar (edición).
    expect(procesarVenta(anulado.estado, 'v1', [linea('cafe', 1)], op).duplicada).toBeUndefined();
  });

  it('revertirConsumos reabre un frasco agotado con sus ml', () => {
    const { p, envases } = inventarioPerfume([5], 0);
    const r = venderPorcion(p, envases, p.presentaciones![1], 1, op);
    expect(r.envases[0].estado).toBe('agotado');
    const back = revertirConsumos(r.envases, r.consumos, op);
    expect(back.envases[0]).toMatchObject({ estado: 'abierto', restante: 5 });
  });

  it('venta antigua sin detalle por envase: respaldo que no pierde ml', () => {
    const { p, envases, lotes } = inventarioPerfume([70], 1);
    const historica: MovimientoInventario = { id: 'm-old', productoId: p.id, tipo: 'salida', cantidad: 105, fecha: AHORA, motivo: 'Venta', origenTipo: 'venta', origenId: 'vieja' };
    const r = revertirVenta({ productos: [p], envases, lotes, movimientos: [historica] }, 'vieja', op);
    expect(stockDisponible(p, r.estado.envases)).toBe(170 + 105);
  });
});

describe('regla de venta (vende o bloquea)', () => {
  const estadoDe = (abiertos: number[], cerrados: number): EstadoInventario => {
    const { p, envases, lotes } = inventarioPerfume(abiertos, cerrados);
    return { productos: [p], envases, lotes, movimientos: [] };
  };

  it('20 botellas sin abiertas: un decant de 5 ml abre una (19 cerradas + 1 abierta con 95 ml) y la apertura queda ligada a la venta', () => {
    const r = procesarVenta(estadoDe([], 20), 'v-abre', [linea('perfume', 1, 'd5')], op);
    expect(r.error).toBeUndefined();
    expect(r.estado.envases.filter(e => e.estado === 'cerrado')).toHaveLength(19);
    expect(r.estado.envases.filter(e => e.estado === 'abierto').map(e => e.restante)).toEqual([95]);
    const apertura = r.movimientos.find(m => m.tipo === 'apertura')!;
    expect(apertura).toMatchObject({ origenTipo: 'venta', origenId: 'v-abre', envaseId: r.aperturas[0].envaseId });
    expect(r.eventos).toEqual([expect.objectContaining({ tipo: 'apertura_automatica', titulo: 'Se abrió el frasco F1 de Lattafa Asad', detalle: 'Quedan 19 frascos cerrados.' })]);
  });

  it('abierta con 70 ml: un decant de 5 ml la deja en 65 ml sin abrir nada', () => {
    const r = procesarVenta(estadoDe([70], 19), 'v1', [linea('perfume', 1, 'd5')], op);
    expect(r.aperturas).toHaveLength(0);
    expect(r.estado.envases.find(e => e.codigo === 'F20')!.restante).toBe(65);
    expect(r.movimientos.map(m => m.tipo)).toEqual(['salida']);
  });

  it('bloqueada por falta de stock: error con el máximo y un evento «venta no realizada»', () => {
    const estado = estadoDe([3], 0);
    const r = procesarVenta(estado, 'v1', [linea('perfume', 1, 'd5')], op);
    expect(r.error).toMatchObject({ codigo: 'stock_insuficiente', linea: 0, maximo: 0 });
    expect(r.estado).toBe(estado);
    expect(r.eventos).toHaveLength(1);
    expect(r.eventos[0]).toMatchObject({ tipo: 'venta_bloqueada', titulo: 'Venta no realizada por falta de stock' });
  });

  it('dos líneas que juntas superan el stock: se rechaza la venta completa sin cambios', () => {
    const estado = estadoDe([70], 0);
    const r = procesarVenta(estado, 'v1', [linea('perfume', 10, 'd5'), linea('perfume', 3, 'd10')], op);
    // 50 ml de la primera; quedan 20 ml → la segunda pide 30 ml y solo caben 2 decants de 10.
    expect(r.error).toMatchObject({ codigo: 'stock_insuficiente', linea: 1, maximo: 2 });
    expect(r.estado).toBe(estado);
    expect(r.movimientos).toHaveLength(0);
  });

  it('botella completa con solo abiertas → bloqueada aunque el total alcance', () => {
    const estado = estadoDe([100, 90], 0);
    const r = procesarVenta(estado, 'v1', [linea('perfume', 1, 'frasco')], op);
    expect(r.error).toMatchObject({ codigo: 'sin_cerrados', maximo: 0 });
    expect(r.error!.mensaje).toContain('quedan 0 frascos cerrados');
  });

  it('anular la venta que abrió una botella la deja cerrada y revierte la apertura', () => {
    const inicial = estadoDe([], 20);
    const vendido = procesarVenta(inicial, 'v1', [linea('perfume', 2, 'd5')], op);
    expect(vendido.aperturas).toHaveLength(1);
    const anulado = revertirVenta(vendido.estado, 'v1', op);
    expect(anulado.error).toBeUndefined();
    expect(anulado.estado.envases.filter(e => e.estado === 'cerrado')).toHaveLength(20);
    expect(anulado.estado.envases.every(e => e.restante === 100 && !e.abiertoEn)).toBe(true);
    expect(anulado.estado.movimientos.find(m => m.tipo === 'apertura')!.revertido).toBe(true);
    // Si otra venta siguió usando esa botella, al anular la primera queda abierta (no está llena).
    const otra = procesarVenta(vendido.estado, 'v2', [linea('perfume', 1, 'd5')], op);
    const parcial = revertirVenta(otra.estado, 'v1', op);
    expect(parcial.estado.envases.find(e => e.codigo === 'F1')).toMatchObject({ estado: 'abierto', restante: 95 });
  });

  it('mínimo de 3 botellas: 3 cerradas + 1 abierta → «bajo»; 4 cerradas → «ok»', () => {
    const conMinimo = (abiertos: number[], cerrados: number) => {
      const { p, envases } = inventarioPerfume(abiertos, cerrados);
      return estadoStockProducto({ ...p, stockMinimoUnidad: 3, unidadMinimo: 'envase' }, envases);
    };
    expect(conMinimo([40], 3)).toBe('bajo');
    expect(conMinimo([], 4)).toBe('ok');
    expect(conMinimo([], 0)).toBe('sin_stock');
    // Solo abiertas con menos que el decant más chico (5 ml) = sin stock para vender.
    expect(conMinimo([2], 0)).toBe('sin_stock');
    const { p, envases } = inventarioPerfume([40], 2);
    expect(textoMinimo({ ...p, stockMinimoUnidad: 3, unidadMinimo: 'envase' })).toBe('3 frascos');
    expect(resumenStock(p, envases).texto).toBe('2 frascos + 1 abierto (40 ml)');
  });

  it('migra el mínimo antiguo en ml a botellas redondeando hacia arriba', () => {
    const { p } = inventarioPerfume();
    expect(normalizarMinimo({ ...p, stockMinimo: 250 })).toMatchObject({ stockMinimoUnidad: 3, unidadMinimo: 'envase' });
    expect(normalizarMinimo({ ...p, stockMinimo: 250, requiereRevisionUnidades: true }).stockMinimoUnidad).toBeUndefined();
  });
});

describe('granel', () => {
  const fruta = (): Producto => ({
    id: 'manzana', nombre: 'Manzana', codigo: 'M', categoria: 'Fruta', tipo: 'producto', costo: 400, precio: 990, stock: 2000,
    unidadMedida: 'kg', estado: 'activo', unidadBase: 'kg', formaCompra: 'granel', controlEnvases: false,
    presentaciones: [{ id: 'kilo', nombre: '1 kg', factor: 1, precio: 990, tipo: 'porcion', origen: 'granel', activa: true }],
  });

  it('2 toneladas → 2.000 kg y la venta de 1,5 kg descuenta exacto', () => {
    expect(aBase(2, 't')).toBe(2000);
    expect(formatCantidad(aBase(2, 't'), 'kg')).toBe('2.000 kg');
    const f = { ...formularioVacio(), forma: 'granel' as const, cantidadGranel: 2, unidadGranel: 't' as const, modoCosto: 'total' as const, costoGranel: 800000,
      subcategorias: [{ id: 'kilo', nombre: '', tipo: 'fija' as const, cantidad: 1, unidad: 'kg' as const, precio: 990, costoInsumos: 0, insumoId: '', insumoCantidad: 1, activa: true }] };
    const { producto } = productoDesdeFormulario(f);
    expect(producto).toMatchObject({ stock: 2000, unidadBase: 'kg', costo: 400, formaCompra: 'granel' });

    const p = fruta();
    const estado: EstadoInventario = { productos: [p], envases: [], lotes: [{ id: 'LF', productoId: p.id, fecha: '2026-11-01', cantidadInicial: 2000, cantidadRestante: 2000, costoUnitario: 400 }], movimientos: [] };
    const r = procesarVenta(estado, 'vf', [linea('manzana', 1.5, 'kilo')], op);
    expect(r.estado.productos[0].stock).toBe(1998.5);
    expect(r.estado.lotes[0].cantidadRestante).toBe(1998.5);
    expect(r.lineas[0].costoVenta).toBe(600);
    expect(formatCantidad(0.5, 'kg')).toBe('500 g');
  });

  it('rechaza vender más de lo que hay a granel', () => {
    const p = { ...fruta(), stock: 1 };
    const r = procesarVenta({ productos: [p], envases: [], lotes: [], movimientos: [] }, 'vf', [linea('manzana', 1.5, 'kilo')], op);
    expect(r.error?.codigo).toBe('stock_insuficiente');
  });
});

describe('migración de datos antiguos', () => {
  it('producto ambiguo queda marcado para revisión sin convertir nada', () => {
    const antiguo: Producto = {
      id: 'x', nombre: 'Perfume viejo', codigo: '', categoria: '', tipo: 'producto', costo: 30000, precio: 45000, stock: 20,
      unidadMedida: 'ml', estado: 'activo', unidadBase: 'ml',
    };
    const n = normalizarProducto(antiguo, []);
    expect(n.requiereRevisionUnidades).toBe(true);
    expect(n.stock).toBe(20);
    expect(n.unidadBase).toBe('ml');
    expect(n.formaCompra).toBeUndefined();
  });

  it('producto por unidad y producto con envases coherentes se completan solos', () => {
    const simple: Producto = { id: 's', nombre: 'Jabón', codigo: '', categoria: '', tipo: 'producto', costo: 1, precio: 2, stock: 5, unidadMedida: 'un', estado: 'activo' };
    expect(normalizarProducto(simple, []).formaCompra).toBe('unidad');
    const { p, envases } = inventarioPerfume();
    const legado = { ...p, formaCompra: undefined, presentaciones: p.presentaciones!.map(({ tipo: _t, ...x }) => x) };
    const n = normalizarProducto(legado, envases);
    expect(n.formaCompra).toBe('envase');
    expect(n.presentaciones!.map(x => x.tipo)).toEqual(['completa', 'fija', 'fija']);
    // Stock que no cuadra con los envases → revisión.
    expect(normalizarProducto({ ...legado, stock: 20 }, envases).requiereRevisionUnidades).toBe(true);
  });

  it('al confirmar «son 20 frascos de 100 ml» se convierte y queda el ajuste', () => {
    const antiguo: Producto = {
      id: 'x', nombre: 'Perfume viejo', codigo: '', categoria: '', tipo: 'producto', costo: 30000, precio: 45000, stock: 20,
      unidadMedida: 'ml', estado: 'activo', unidadBase: 'ml', requiereRevisionUnidades: true,
    };
    const r = convertirUnidades(antiguo, [], [], { tipo: 'envases', contenido: 100, unidad: 'ml', nombreEnvase: 'frasco', costoEnvase: 30000 }, op);
    expect(r.error).toBeUndefined();
    expect(r.producto).toMatchObject({ stock: 2000, capacidadEnvase: 100, controlEnvases: true, costo: 300, requiereRevisionUnidades: false });
    expect(r.envases.filter(e => e.estado === 'cerrado')).toHaveLength(20);
    expect(r.movimientos[0]).toMatchObject({ tipo: 'ajuste', cantidad: 1980, motivo: 'Conversión de unidades' });
  });
});

describe('envases sin uso', () => {
  it('crearEnvases no hace nada si el producto no usa envases', () => {
    const p = { ...perfume(), controlEnvases: false };
    expect(crearEnvases(p, [] as Envase[], { cerrados: 3 })).toEqual([]);
  });
});
