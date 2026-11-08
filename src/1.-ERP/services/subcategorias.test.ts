import { describe, it, expect } from 'vitest';
import type { Producto, Lote, VentaProducto, MovimientoInventario, Envase } from '../context/ERPContext';
import { crearEnvases, diasRestantes, estadoStockProducto, formatCantidad, mermaGranel, procesarVenta, type EstadoInventario } from './inventarioFraccionado';
import { calcularResumen, formularioVacio, productoDesdeFormulario, validarFormulario, type SubcategoriaForm } from './registroProducto';
import { copiarSubcategorias, plantillaDesdeSubcategoria, precioSugerido, sugerirSubcategorias, subcategoriaDesdeSugerencia, type PlantillaSubcategoria } from './subcategorias';
import { calcularCondiciones, textoStockBajo } from './alertas';
import type { Saldos } from './saldos';

let n = 0;
const nuevoId = () => `id-${++n}`;
const op = { nuevoId, ahora: '2026-11-08T12:00:00.000Z' };
const linea = (productoId: string, cantidad: number, presentacionId?: string): VentaProducto => ({
  productoId, productoNombre: productoId, esInventariable: true, cantidad, precioBase: 0, costoUnitario: 0, subtotal: 0, iva: 0, total: 0,
  ...(presentacionId ? { presentacionId } : {}),
});
const base = (extra: Partial<Producto>): Producto => ({
  id: 'x', nombre: 'X', codigo: '', categoria: 'General', tipo: 'producto', costo: 0, precio: 0, incluyeIva: true, stock: 0,
  unidadMedida: 'un', estado: 'activo', ...extra,
});
const tomate = (extra: Partial<Producto> = {}) => base({
  id: 'tomate', nombre: 'Tomate', categoria: 'Verdulería', costo: 650, stock: 1001, unidadBase: 'kg', formaCompra: 'granel', controlEnvases: false,
  presentaciones: [{ id: 'kilo', nombre: 'Por kilo', factor: 1, precio: 1500, tipo: 'variable', unidadVenta: 'kg', origen: 'granel', activa: true }],
  ...extra,
});
const saldosVacios: Saldos = {
  resumen: { porCobrar: 0, porPagar: 0, ventasPorCobrar: 0, comprasPorPagar: 0, clientesConDeuda: 0, proveedoresConDeuda: 0, vencidoCobrar: 0, vencidoPagar: 0, ventasVencidas: 0, comprasVencidas: 0 },
  porVenta: new Map(), porGasto: new Map(), pendientesCobrar: [], pendientesPagar: [],
};

describe('granel y peso variable', () => {
  it('1,37 kg × $1.500/kg: precio $2.055 y descuento FIFO entre dos lotes', () => {
    const p = tomate();
    const lotes: Lote[] = [
      { id: 'viejo', productoId: p.id, fecha: '2026-11-01', cantidadInicial: 1000, cantidadRestante: 1, costoUnitario: 600 },
      { id: 'nuevo', productoId: p.id, fecha: '2026-11-07', cantidadInicial: 1000, cantidadRestante: 1000, costoUnitario: 700 },
    ];
    const estado: EstadoInventario = { productos: [p], envases: [], lotes, movimientos: [] };
    const r = procesarVenta(estado, 'v1', [linea('tomate', 1.37, 'kilo')], { ...op, metodo: 'fifo' });
    expect(r.error).toBeUndefined();
    expect(Math.round(1500 * 1.37)).toBe(2055);
    expect(r.lineas[0]).toMatchObject({ cantidadBase: 1.37, costoVenta: 859 }); // 1 kg a $600 + 0,37 kg a $700
    expect(r.estado.lotes.map(l => l.cantidadRestante)).toEqual([0, 999.63]);
    expect(r.estado.productos[0].stock).toBe(999.63);
    expect(r.movimientos[0].consumosLote).toEqual([{ loteId: 'viejo', cantidad: 1 }, { loteId: 'nuevo', cantidad: 0.37 }]);
  });

  it('peso variable con stock insuficiente se bloquea con el máximo en kg', () => {
    const p = tomate({ stock: 1.2 });
    const r = procesarVenta({ productos: [p], envases: [], lotes: [], movimientos: [] }, 'v1', [linea('tomate', 1.5, 'kilo')], op);
    expect(r.error).toMatchObject({ codigo: 'stock_insuficiente', maximo: 1.2 });
    expect(r.error!.mensaje).toBe('No alcanza: de Tomate quedan 1,2 kg y pides 1,5 kg.');
  });

  it('merma del 5 % en 1.000 kg deja 950 kg y sale del lote más antiguo', () => {
    const p = tomate({ stock: 1000 });
    const lotes: Lote[] = [
      { id: 'a', productoId: p.id, fecha: '2026-11-01', cantidadInicial: 600, cantidadRestante: 600, costoUnitario: 600 },
      { id: 'b', productoId: p.id, fecha: '2026-11-05', cantidadInicial: 400, cantidadRestante: 400, costoUnitario: 700 },
    ];
    expect(mermaGranel(p, lotes, { porcentaje: 5, motivo: ' ' }, op).error?.codigo).toBe('motivo_requerido');
    const r = mermaGranel(p, lotes, { porcentaje: 5, motivo: 'Deterioro' }, { ...op, metodo: 'fifo' });
    expect(r.producto.stock).toBe(950);
    expect(r.lotes.find(l => l.id === 'a')!.cantidadRestante).toBe(550);
    expect(r.movimientos[0]).toMatchObject({ tipo: 'merma', cantidad: 50, costoUnitario: 600, motivo: 'Deterioro' });
    expect(r.eventos[0].tipo).toBe('merma_registrada');
  });

  it('mínimo 0,5 t: tras vender 1.600 kg de 2 t queda «bajo» y aparece la alerta', () => {
    const p = tomate({ stock: 2000, stockMinimoUnidad: 0.5, unidadMinimo: 't' });
    const vendido = procesarVenta({ productos: [p], envases: [], lotes: [], movimientos: [] }, 'v1', [linea('tomate', 1600, 'kilo')], op);
    const despues = vendido.estado.productos[0];
    expect(despues.stock).toBe(400);
    expect(estadoStockProducto(despues, [])).toBe('bajo');
    expect(textoStockBajo(despues, [])).toBe('Tomate: quedan 0,4 t (mínimo 0,5 t)');
    const condiciones = calcularCondiciones({ inventario: [despues], saldos: saldosVacios, documentosTributarios: [], pagosPOS: [], promociones: [], movimientos: [], hoy: '2026-11-08' });
    expect(condiciones.map(c => c.clave)).toContain('stock-bajo:tomate');
  });

  it('el formulario granel guarda el mínimo en t y la merma estimada solo cambia el margen', () => {
    const f = {
      ...formularioVacio(), forma: 'granel' as const, cantidadGranel: 2, unidadGranel: 't' as const, modoCosto: 'total' as const, costoGranel: 1200000,
      stockMinimo: 0.5, unidadMinimoGranel: 't' as const,
      subcategorias: [{ id: 's', nombre: '', tipo: 'variable' as const, cantidad: 1, unidad: 'kg' as const, precio: 1500, costoInsumos: 0, insumoId: '', insumoCantidad: 1, activa: true }],
    };
    expect(validarFormulario(f)).toEqual({});
    const { producto } = productoDesdeFormulario(f);
    expect(producto).toMatchObject({ stock: 2000, stockMinimoUnidad: 0.5, unidadMinimo: 't', stockMinimo: 500 });
    expect(producto.presentaciones![0]).toMatchObject({ nombre: 'Por kilo', tipo: 'variable', factor: 1, unidadVenta: 'kg' });
    const sinMerma = calcularResumen(f).subcategorias[0].margen!;
    const conMerma = calcularResumen({ ...f, mermaEstimada: 10 }).subcategorias[0].margen!;
    expect(conMerma).toBeLessThan(sinMerma);
    expect(calcularResumen({ ...f, mermaEstimada: 10 }).totalBase).toBe(2000); // nunca descuenta stock
  });

  it('resumen fijo con envases: «19 botellas cerradas · 1 abierta (70 ml) · equivale a 19,7 botellas · mínimo 3»', () => {
    const f = {
      ...formularioVacio(), forma: 'frasco' as const, nombreEnvase: 'botella' as const, envases: 20, contenido: 100, unidadContenido: 'ml' as const,
      costoEnvase: 30000, abiertos: [{ id: 'a', restante: 70 }], precioCompleto: 45000, stockMinimo: 3,
    };
    expect(calcularResumen(f).texto).toBe('19 botellas cerradas · 1 abierta (70 ml) · equivale a 19,7 botellas · mínimo 3 botellas');
    expect(productoDesdeFormulario(f).producto).toMatchObject({ stockMinimoUnidad: 3, unidadMinimo: 'envase', stockMinimo: 300 });
  });
});

describe('subcategorías sugeridas', () => {
  const perfume = (id: string, categoria: string, decants: number[], costo = 300): Producto => base({
    id, nombre: id, categoria, costo, unidadBase: 'ml', controlEnvases: true, capacidadEnvase: 100, formaCompra: 'envase',
    presentaciones: decants.map(d => ({ id: `${id}-${d}`, nombre: `Decant ${d} ml`, factor: d, precio: Math.round(d * costo / 0.3 * 1.19), tipo: 'fija' as const, activa: true })),
  });
  const inventario: Producto[] = [
    perfume('A', 'Perfumería', [5, 10]), perfume('B', 'Perfumería', [5]), perfume('C', 'Cosmética', [5, 3]), perfume('D', 'Perfumería', [10, 50]),
    base({ id: 'K', nombre: 'Arroz', categoria: 'Abarrotes', unidadBase: 'kg', costo: 900, presentaciones: [{ id: 'k1', nombre: '1 kg', factor: 1, precio: 1490, tipo: 'fija', activa: true }] }),
  ];

  it('solo misma familia de unidad, menores que el contenido, sin las que ya tiene y por frecuencia', () => {
    const s = sugerirSubcategorias({
      unidadBase: 'ml', capacidad: 30, categoria: 'Perfumería', existentes: [{ tipo: 'fija', factor: 3 }], inventario, esFrasco: true,
    });
    expect(s.map(x => x.factor)).toEqual([5, 10]); // 3 ya existe, 50 > 30 ml, nada de kg
    expect(s[0]).toMatchObject({ usos: 3, fuente: 'negocio', nombre: 'Decant 5 ml' });
    expect(s.every(x => x.unidad === 'ml')).toBe(true);
    // Sin ninguna en la familia: sugerencias iniciales del rubro.
    const granel = sugerirSubcategorias({ unidadBase: 'kg', capacidad: 0, categoria: 'Verdulería', existentes: [], inventario: [], granel: true });
    expect(granel.map(x => x.nombre)).toEqual(['500 g', '1 kg', 'Malla 5 kg', 'Saco 25 kg', 'Por kilo']);
    // El negocio ya tiene subcategorías en kg (arroz): no se usan las iniciales del rubro.
    expect(sugerirSubcategorias({ unidadBase: 'kg', capacidad: 25, existentes: [], inventario }).map(x => x.fuente)).toEqual(['negocio']);
  });

  it('precio sugerido con el mismo margen que el producto de origen, redondeado a la centena', () => {
    const [cinco] = sugerirSubcategorias({ unidadBase: 'ml', capacidad: 100, categoria: 'Perfumería', existentes: [], inventario });
    expect(cinco.margenOrigen).toBeCloseTo(0.7, 2);
    const precio = precioSugerido(cinco, { costoBase: 400, incluyeIva: true, margenObjetivo: 40 });
    expect(precio).toBe(7900); // 5 ml × $400 = $2.000 de costo; neto $6.667 (70 %) → $7.933 con IVA
    const neto = precio / 1.19;
    expect((neto - 2000) / neto).toBeCloseTo(0.7, 1);
    // Sin origen: margen objetivo de Configuración.
    expect(precioSugerido({ factor: 1, margenOrigen: undefined }, { costoBase: 600, incluyeIva: false, margenObjetivo: 40 })).toBe(1000);
  });

  it('copiar o agregar crea copias independientes; eliminar la plantilla no cambia el producto', () => {
    const copia = copiarSubcategorias(inventario[0], ['A-5'], nuevoId)[0];
    expect(copia.id).not.toBe('A-5');
    copia.precio = 1;
    expect(inventario[0].presentaciones![0].precio).not.toBe(1);

    let plantillas: PlantillaSubcategoria[] = [];
    const fila: SubcategoriaForm = { id: 'f', nombre: '', tipo: 'fija', cantidad: 5, unidad: 'kg', precio: 3490, costoInsumos: 0, insumoId: '', insumoCantidad: 1, activa: true };
    plantillas = [...plantillas, plantillaDesdeSubcategoria(fila, 'Malla 5 kg', nuevoId)];
    const sugerida = sugerirSubcategorias({ unidadBase: 'kg', capacidad: 25, existentes: [], inventario: [], plantillas }).find(s => s.fuente === 'plantilla')!;
    const enProducto = subcategoriaDesdeSugerencia(sugerida, nuevoId);
    const f = { ...formularioVacio(), forma: 'saco' as const, nombreEnvase: 'saco' as const, envases: 4, contenido: 25, unidadContenido: 'kg' as const, precioCompleto: 14990, subcategorias: [{ ...enProducto, precio: 3490 }] };
    const guardado = productoDesdeFormulario(f).producto;
    plantillas = plantillas.filter(t => t.id !== sugerida.plantillaId); // se elimina la plantilla
    expect(plantillas).toHaveLength(0);
    expect(guardado.presentaciones!.map(x => x.nombre)).toEqual(['Saco completo', 'Malla 5 kg']);
  });
});

describe('días restantes (quiebre anticipado)', () => {
  const hoy = '2026-11-08';
  const salida = (productoId: string, cantidad: number, dias: number): MovimientoInventario => ({
    id: `m${dias}-${cantidad}`, productoId, tipo: 'salida', cantidad, fecha: new Date(Date.parse(`${hoy}T12:00:00Z`) - dias * 86400000).toISOString(), motivo: 'Venta',
  });
  it('ml → botellas', () => {
    const p = base({ id: 'p', nombre: 'Perfume', unidadBase: 'ml', controlEnvases: true, capacidadEnvase: 100, nombreEnvase: 'botella' });
    const envases: Envase[] = crearEnvases(p, [], { cerrados: 3, abiertos: [50] }, op);
    const q = diasRestantes(p, envases, [salida('p', 300, 2), salida('p', 300, 10)], hoy);
    expect(q).toMatchObject({ stock: 3.5, consumoDiario: 0.2, unidad: 'botellas', dias: 17.5 });
  });
  it('kg → t', () => {
    const p = tomate({ stock: 2000, unidadMinimo: 't' });
    const q = diasRestantes(p, [], [salida('tomate', 1500, 1), salida('tomate', 1500, 20), salida('tomate', 999, 40)], hoy);
    expect(q).toMatchObject({ stock: 2, consumoDiario: 0.1, unidad: 't', dias: 20 });
    expect(formatCantidad(2000, 'kg')).toBe('2.000 kg');
  });
});
