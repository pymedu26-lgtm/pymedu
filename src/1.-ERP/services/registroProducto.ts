// ═══════════════════════════════════════════════════════════════════════
// Formulario «Registrar producto» (¿Cómo lo compras? / ¿Cómo lo vendes?).
// El usuario escribe en la unidad en que compra; aquí se deriva todo lo técnico:
//   formaCompra, controlEnvases, unidadBase, capacidadEnvase, factor y origen.
// Sin React: lo usan components/RegistroProducto.tsx, la carga masiva y las pruebas.
// ═══════════════════════════════════════════════════════════════════════
import type { Producto, Presentacion, NombreEnvase, UnidadBase, Envase } from '../context/ERPContext';
import {
  aBase, desdeBase, unidadBaseDe, formatCantidad, r3, origenDe, envasesDe, envaseVigente, type UnidadEntrada,
} from './inventarioFraccionado';

export type FormaCompraUI = 'unidad' | 'frasco' | 'saco' | 'granel';
export const IVA = 0.19;

export interface PorcionForm {
  id: string;
  cantidad: number;
  unidad: UnidadEntrada;
  precio: number;
  /** Más opciones: costo neto de insumos sueltos (frasco vacío, etiqueta). */
  costoInsumos: number;
  /** Más opciones: insumo del inventario que también se descuenta (receta). */
  insumoId: string;
  insumoCantidad: number;
  /** Más opciones: nombre propio; vacío = automático («Decant 5 ml»). */
  nombre: string;
}

export interface FormularioProducto {
  forma: FormaCompraUI;
  nombreEnvase: NombreEnvase;
  // Por unidad
  unidades: number;
  costoUnidad: number;
  precioUnidad: number;
  // En envases (frascos, sacos)
  envases: number;
  contenido: number;
  unidadContenido: UnidadEntrada;
  costoEnvase: number;
  /** Envases ya abiertos; `restante` en unidadContenido («le quedan 70 ml»). */
  abiertos: { id: string; restante: number }[];
  venderCompleto: boolean;
  precioCompleto: number;
  venderPorciones: boolean;
  porciones: PorcionForm[];
  // A granel
  cantidadGranel: number;
  unidadGranel: UnidadEntrada;
  modoCosto: 'total' | 'unidad';
  costoGranel: number;
  // Común
  /** Aviso de stock bajo, en la unidad en que compra (envases, unidades o unidadGranel). */
  stockMinimo: number;
  /** Los precios de venta incluyen IVA. */
  incluyeIva: boolean;
  /** El costo escrito trae IVA recuperable (compra con factura): se descuenta para el margen. */
  costoConIva: boolean;
}

export const formularioVacio = (): FormularioProducto => ({
  forma: 'unidad', nombreEnvase: 'frasco',
  unidades: 0, costoUnidad: 0, precioUnidad: 0,
  envases: 0, contenido: 0, unidadContenido: 'ml', costoEnvase: 0, abiertos: [],
  venderCompleto: true, precioCompleto: 0, venderPorciones: false, porciones: [],
  cantidadGranel: 0, unidadGranel: 'kg', modoCosto: 'unidad', costoGranel: 0,
  stockMinimo: 0, incluyeIva: true, costoConIva: false,
});

export const usaEnvasesForm = (f: FormularioProducto) => f.forma === 'frasco' || f.forma === 'saco';
/** Unidad del contenido según la forma (envase → contenido; granel → lo comprado). */
export const unidadMedidaForm = (f: FormularioProducto): UnidadEntrada =>
  usaEnvasesForm(f) ? f.unidadContenido : f.forma === 'granel' ? f.unidadGranel : 'unidad';

/** Unidades válidas para escribir porciones (misma magnitud que el contenido). */
export function unidadesPorcion(f: FormularioProducto): UnidadEntrada[] {
  const base = unidadBaseDe(unidadMedidaForm(f));
  return base === 'ml' ? ['ml', 'l'] : base === 'kg' ? ['g', 'kg'] : ['unidad'];
}

/** Botones rápidos «+5 ml», «+1 kg», «+500 g». */
export function porcionesRapidas(f: FormularioProducto): { cantidad: number; unidad: UnidadEntrada }[] {
  const base = unidadBaseDe(unidadMedidaForm(f));
  if (base === 'ml') return [3, 5, 10].map(cantidad => ({ cantidad, unidad: 'ml' as const }));
  if (base === 'kg') return [{ cantidad: 1, unidad: 'kg' }, { cantidad: 500, unidad: 'g' }];
  return [1, 6, 12].map(cantidad => ({ cantidad, unidad: 'unidad' as const }));
}

const ETIQUETA_CORTA: Record<UnidadEntrada, [string, string]> = {
  unidad: ['unidad', 'unidades'], ml: ['ml', 'ml'], l: ['L', 'L'], g: ['g', 'g'], kg: ['kg', 'kg'], t: ['tonelada', 'toneladas'],
};
export const etiquetaUnidad = (n: number, u: UnidadEntrada) => ETIQUETA_CORTA[u][n === 1 ? 0 : 1];
const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (n: number) => (Number(n) || 0).toLocaleString('es-CL', { maximumFractionDigits: 3 });

export function nombrePorcion(f: FormularioProducto, p: PorcionForm): string {
  if (p.nombre.trim()) return p.nombre.trim();
  const cantidad = `${fmt(p.cantidad)} ${etiquetaUnidad(p.cantidad, p.unidad)}`;
  return f.forma === 'frasco' && unidadBaseDe(p.unidad) === 'ml' ? `Decant ${cantidad}` : cantidad;
}
export const nombreCompleta = (f: FormularioProducto) =>
  `${capitalizar(f.nombreEnvase)} ${fmt(f.contenido)} ${etiquetaUnidad(f.contenido, f.unidadContenido)}`;

const neto = (monto: number, conIva: boolean) => (conIva ? (Number(monto) || 0) / (1 + IVA) : Number(monto) || 0);
const margen = (precioNeto: number, costo: number) => (precioNeto > 0 ? ((precioNeto - costo) / precioNeto) * 100 : null);

export interface CalculoPorcion {
  id: string; nombre: string; factor: number;
  costoContenido: number; costoInsumos: number; precioNeto: number; margen: number | null;
  aviso?: string;
}

export interface ResumenFormulario {
  unidadBase: UnidadBase;
  capacidad: number;
  totalBase: number;
  cerrados: number;
  abiertos: number[];
  /** Costo NETO por unidad base (por ml, por kg o por unidad). */
  costoBase: number;
  texto: string;
  completa: CalculoPorcion | null;
  porciones: CalculoPorcion[];
}

/** Resumen en vivo: «19 cerrados · 1 abierto (70 ml) · 1.970 ml disponibles». */
export function calcularResumen(f: FormularioProducto, insumos: Pick<Producto, 'id' | 'costo'>[] = []): ResumenFormulario {
  const u = unidadMedidaForm(f);
  const unidadBase = unidadBaseDe(u);
  const costoInsumo = (id: string) => Number(insumos.find(i => i.id === id)?.costo) || 0;
  let capacidad = 0;
  let totalBase = 0;
  let cerrados = 0;
  let abiertos: number[] = [];
  let costoBase = 0;
  let texto = '';

  if (f.forma === 'unidad') {
    totalBase = r3(f.unidades);
    costoBase = neto(f.costoUnidad, f.costoConIva);
    texto = formatCantidad(totalBase, 'unidad');
  } else if (usaEnvasesForm(f)) {
    capacidad = aBase(f.contenido, f.unidadContenido);
    abiertos = f.abiertos.map(a => aBase(a.restante, f.unidadContenido));
    cerrados = Math.max(0, Math.floor(Number(f.envases) || 0) - abiertos.length);
    totalBase = r3(cerrados * capacidad + abiertos.reduce((a, b) => a + b, 0));
    costoBase = capacidad > 0 ? neto(f.costoEnvase, f.costoConIva) / capacidad : 0;
    const partes = [`${cerrados} cerrado${cerrados === 1 ? '' : 's'}`];
    if (abiertos.length) partes.push(`${abiertos.length} abierto${abiertos.length === 1 ? '' : 's'} (${abiertos.map(a => formatCantidad(a, unidadBase)).join(', ')})`);
    partes.push(`${formatCantidad(totalBase, unidadBase)} disponibles`);
    texto = partes.join(' · ');
  } else {
    totalBase = aBase(f.cantidadGranel, f.unidadGranel);
    const costoNeto = neto(f.costoGranel, f.costoConIva);
    costoBase = f.modoCosto === 'total'
      ? (totalBase > 0 ? costoNeto / totalBase : 0)
      : costoNeto / (aBase(1, f.unidadGranel) || 1);
    texto = `${formatCantidad(totalBase, unidadBase)} disponibles`;
  }

  const calcular = (id: string, nombre: string, factor: number, precio: number, extra: number): CalculoPorcion => {
    const costoContenido = factor * costoBase;
    const precioNeto = neto(precio, f.incluyeIva);
    return { id, nombre, factor, costoContenido, costoInsumos: extra, precioNeto, margen: margen(precioNeto, costoContenido + extra) };
  };
  const completa = usaEnvasesForm(f) && f.venderCompleto ? calcular('completa', nombreCompleta(f), capacidad, f.precioCompleto, 0) : null;
  const porciones = (f.forma === 'granel' || (usaEnvasesForm(f) && f.venderPorciones) ? f.porciones : []).map(p => {
    const factor = aBase(p.cantidad, p.unidad);
    const extra = (Number(p.costoInsumos) || 0) + (p.insumoId ? costoInsumo(p.insumoId) * (Number(p.insumoCantidad) || 1) : 0);
    const c = calcular(p.id, nombrePorcion(f, p), factor, p.precio, extra);
    if (usaEnvasesForm(f) && capacidad > 0 && factor >= capacidad - 0.0005) {
      c.aviso = factor > capacidad
        ? `Es más grande que un ${f.nombreEnvase} completo (${formatCantidad(capacidad, unidadBase)}).`
        : `Es igual al ${f.nombreEnvase} completo: véndelo como «${capitalizar(f.nombreEnvase)} completo».`;
    }
    return c;
  });
  return { unidadBase, capacidad, totalBase, cerrados, abiertos, costoBase, texto, completa, porciones };
}

/** Errores en línea por campo (clave → mensaje). Vacío = se puede guardar. */
export function validarFormulario(f: FormularioProducto, editando = false): Record<string, string> {
  const e: Record<string, string> = {};
  const r = calcularResumen(f);
  const positivo = (n: number) => Number(n) > 0;
  if (f.forma === 'unidad') {
    if (!editando && (Number(f.unidades) < 0 || !Number.isFinite(Number(f.unidades)))) e.unidades = 'Escribe cuántas unidades tienes.';
    if (!positivo(f.precioUnidad)) e.precioUnidad = 'El precio debe ser mayor que 0.';
    return e;
  }
  if (usaEnvasesForm(f)) {
    if (!positivo(f.contenido)) e.contenido = `Escribe cuánto trae cada ${f.nombreEnvase}.`;
    if (!editando) {
      if (!Number.isInteger(Number(f.envases)) || Number(f.envases) < 0) e.envases = `Escribe cuántos ${f.nombreEnvase}s tienes (número entero).`;
      else if (f.abiertos.length > Number(f.envases)) e.abiertos = `No puedes tener más abiertos (${f.abiertos.length}) que ${f.nombreEnvase}s en total (${f.envases}).`;
      f.abiertos.forEach(a => {
        if (!(Number(a.restante) > 0) || (positivo(f.contenido) && Number(a.restante) > Number(f.contenido))) {
          e[`abierto-${a.id}`] = `Debe quedar más de 0 y hasta ${fmt(f.contenido)} ${etiquetaUnidad(f.contenido, f.unidadContenido)}.`;
        }
      });
    }
    if (!f.venderCompleto && !f.venderPorciones) e.venta = 'Elige al menos una forma de venta.';
    if (f.venderCompleto && !positivo(f.precioCompleto)) e.precioCompleto = 'El precio debe ser mayor que 0.';
    if (f.venderPorciones && f.porciones.length === 0) e.porciones = 'Agrega al menos una porción.';
  } else {
    if (!editando && !(Number(f.cantidadGranel) >= 0)) e.cantidadGranel = 'Escribe cuánto compraste.';
    if (f.porciones.length === 0) e.porciones = 'Agrega al menos una forma de venta (por ejemplo, 1 kg).';
  }
  if (f.forma === 'granel' || f.venderPorciones) {
    f.porciones.forEach((p, i) => {
      const calc = r.porciones.find(x => x.id === p.id);
      if (!positivo(p.cantidad)) e[`porcion-${p.id}`] = 'Escribe la cantidad de la porción.';
      else if (!positivo(p.precio)) e[`porcion-${p.id}`] = 'El precio debe ser mayor que 0.';
      else if (calc && usaEnvasesForm(f) && calc.factor > r.capacidad && r.capacidad > 0) e[`porcion-${p.id}`] = calc.aviso ?? 'Porción demasiado grande.';
      else if (f.porciones.slice(0, i).some(o => aBase(o.cantidad, o.unidad) === aBase(p.cantidad, p.unidad) && !o.nombre && !p.nombre)) e[`porcion-${p.id}`] = 'Ya tienes una porción de ese tamaño.';
    });
  }
  return e;
}

/** Lo que se crea en inventario al guardar un producto nuevo. */
export interface InventarioInicial {
  cantidadBase: number;
  costoBase: number;
  /** Solo con envases. */
  cerrados?: number;
  abiertos?: number[];
}

/**
 * Convierte el formulario en Producto (todo derivado) + inventario inicial.
 * `existente` conserva ids de presentaciones (las ventas antiguas las referencian).
 */
export function productoDesdeFormulario(f: FormularioProducto, existente?: Producto): { producto: Partial<Producto>; inicial: InventarioInicial } {
  const r = calcularResumen(f);
  const conEnvases = usaEnvasesForm(f);
  const previas = existente?.presentaciones ?? [];
  const idCompleta = previas.find(x => x.tipo === 'completa' || x.origen === 'envase_cerrado')?.id ?? crypto.randomUUID();
  const presentaciones: Presentacion[] = [];
  if (r.completa) {
    presentaciones.push({ id: idCompleta, nombre: r.completa.nombre, factor: r.capacidad, precio: Math.round(f.precioCompleto), tipo: 'completa', origen: 'envase_cerrado', activa: true });
  }
  r.porciones.forEach(c => {
    const p = f.porciones.find(x => x.id === c.id)!;
    presentaciones.push({
      id: p.id, nombre: c.nombre, factor: c.factor, precio: Math.round(p.precio), tipo: 'porcion', origen: origenDe('porcion', conEnvases), activa: true,
      ...(Number(p.costoInsumos) > 0 ? { costoInsumos: Math.round(Number(p.costoInsumos)) } : {}),
      ...(p.insumoId ? { receta: [{ productoId: p.insumoId, cantidad: Number(p.insumoCantidad) || 1 }] } : {}),
    });
  });
  const minimoBase = f.forma === 'unidad' ? Number(f.stockMinimo) || 0
    : conEnvases ? r3((Number(f.stockMinimo) || 0) * r.capacidad)
      : aBase(f.stockMinimo, f.unidadGranel);
  const precioRef = f.forma === 'unidad' ? Math.round(f.precioUnidad) : presentaciones[0]?.precio ?? 0;

  const producto: Partial<Producto> = {
    costo: r3(r.costoBase),
    precio: precioRef,
    incluyeIva: f.incluyeIva,
    stockMinimo: minimoBase,
    formaCompra: f.forma === 'unidad' ? 'unidad' : conEnvases ? 'envase' : 'granel',
    unidadBase: r.unidadBase,
    unidadMedida: r.unidadBase === 'unidad' ? 'un' : r.unidadBase,
    controlEnvases: conEnvases,
    capacidadEnvase: conEnvases ? r.capacidad : undefined,
    nombreEnvase: conEnvases ? f.nombreEnvase : undefined,
    requiereRevisionUnidades: false,
    // Por unidad no se tocan presentaciones antiguas (packs) al editar.
    presentaciones: f.forma === 'unidad' ? previas : presentaciones,
    stock: r.totalBase,
  };
  return {
    producto,
    inicial: {
      cantidadBase: r.totalBase, costoBase: r3(r.costoBase),
      ...(conEnvases ? { cerrados: r.cerrados, abiertos: r.abiertos } : {}),
    },
  };
}

/** «$300 por ml», «$400 por kg», «$2,5 por L» (si por ml quedaría en $0). */
export function formatCostoBase(costo: number, unidad: UnidadBase | undefined): string {
  let c = Number(costo) || 0;
  let u: string = unidad === 'unidad' || !unidad ? 'unidad' : unidad === 'l' ? 'L' : unidad;
  if (unidad === 'ml' && c > 0 && c < 1) { c *= 1000; u = 'L'; }
  if (unidad === 'g' && c > 0 && c < 1) { c *= 1000; u = 'kg'; }
  return `$${c.toLocaleString('es-CL', { maximumFractionDigits: c < 10 ? 1 : 0 })} por ${u}`;
}

/** Rellena el formulario desde un producto guardado (para editar). */
export function formularioDesdeProducto(p: Producto, envases: Envase[] = []): FormularioProducto {
  const f = formularioVacio();
  f.incluyeIva = p.incluyeIva ?? true;
  const pres = p.presentaciones ?? [];
  const unidadVista = (base: UnidadBase | undefined, factor: number): UnidadEntrada =>
    base === 'kg' ? (factor < 1 ? 'g' : 'kg') : base === 'ml' ? 'ml' : base === 'l' ? 'l' : base === 'g' ? 'g' : 'unidad';
  const aPorcion = (x: Presentacion): PorcionForm => {
    const unidad = unidadVista(p.unidadBase, x.factor);
    const cantidad = unidad === 'g' && p.unidadBase === 'kg' ? r3(x.factor * 1000) : x.factor;
    return {
      id: x.id, cantidad, unidad, precio: x.precio, costoInsumos: x.costoInsumos ?? 0,
      insumoId: x.receta?.[0]?.productoId ?? '', insumoCantidad: x.receta?.[0]?.cantidad ?? 1, nombre: '',
    };
  };
  const forma = p.formaCompra ?? (p.controlEnvases ? 'envase' : p.unidadBase && p.unidadBase !== 'unidad' ? 'granel' : 'unidad');
  if (forma === 'envase') {
    f.forma = p.nombreEnvase === 'saco' || p.nombreEnvase === 'caja' ? 'saco' : 'frasco';
    f.nombreEnvase = p.nombreEnvase ?? (f.forma === 'saco' ? 'saco' : 'frasco');
    const capacidad = Number(p.capacidadEnvase) || 0;
    f.unidadContenido = unidadVista(p.unidadBase, capacidad);
    f.contenido = desdeBase(capacidad, f.unidadContenido);
    f.costoEnvase = Math.round((Number(p.costo) || 0) * capacidad);
    const vigentes = envasesDe(envases, p.id).filter(envaseVigente);
    f.envases = vigentes.length;
    const completa = pres.find(x => x.tipo === 'completa' || x.origen === 'envase_cerrado');
    f.venderCompleto = !!completa;
    f.precioCompleto = completa?.precio ?? 0;
    f.porciones = pres.filter(x => x !== completa && x.activa).map(aPorcion);
    f.venderPorciones = f.porciones.length > 0;
    f.stockMinimo = capacidad > 0 ? r3((Number(p.stockMinimo) || 0) / capacidad) : 0;
  } else if (forma === 'granel') {
    f.forma = 'granel';
    f.unidadGranel = p.unidadBase === 'ml' || p.unidadBase === 'l' ? 'l' : 'kg';
    f.cantidadGranel = desdeBase(Number(p.stock) || 0, f.unidadGranel);
    f.modoCosto = 'unidad';
    f.costoGranel = Math.round((Number(p.costo) || 0) * aBase(1, f.unidadGranel));
    f.porciones = pres.filter(x => x.activa).map(aPorcion);
    f.venderPorciones = true;
    f.stockMinimo = desdeBase(Number(p.stockMinimo) || 0, f.unidadGranel);
  } else {
    f.forma = 'unidad';
    f.unidades = Number(p.stock) || 0;
    f.costoUnidad = Number(p.costo) || 0;
    f.precioUnidad = Number(p.precio) || 0;
    f.stockMinimo = Number(p.stockMinimo) || 0;
  }
  return f;
}
