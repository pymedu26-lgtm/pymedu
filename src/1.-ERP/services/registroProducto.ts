// ═══════════════════════════════════════════════════════════════════════
// Formulario «Registrar producto» con revelación progresiva:
//   1. Datos generales · 2. ¿En qué viene? · 3. Subcategorías de venta · 4. Alertas de stock
//   5. Resumen fijo.
// El usuario escribe en la unidad en que compra (botellas, sacos, kg, t); aquí se deriva lo
// técnico: formaCompra, controlEnvases, unidadBase, capacidadEnvase, factor, origen y el mínimo.
// «Subcategorías de venta» = el tipo `Presentacion` existente (factor = lo que descuenta).
// Sin React: lo usan components/RegistroProducto.tsx, la carga masiva y las pruebas.
// ═══════════════════════════════════════════════════════════════════════
import type { Producto, Presentacion, NombreEnvase, UnidadBase, Envase } from '../context/ERPContext';
import {
  aBase, desdeBase, unidadBaseDe, formatCantidad, r3, origenDe, envasesDe, envaseVigente, tipoPresentacion,
  unidadMinimoDe, type UnidadEntrada,
} from './inventarioFraccionado';

/** ¿En qué viene? Unidad suelta / Botella o frasco / Saco o caja / Bidón / A granel por peso. */
export type FormaCompraUI = 'unidad' | 'frasco' | 'saco' | 'bidon' | 'granel';
export const IVA = 0.19;

export interface SubcategoriaForm {
  id: string;
  /** Vacío = nombre automático («Decant 5 ml», «Malla 5 kg», «Por kilo»). */
  nombre: string;
  tipo: 'fija' | 'variable';
  /** fija: lo que descuenta cada venta. variable: no se usa (se pesa al vender). */
  cantidad: number;
  /** fija: unidad de `cantidad`. variable: unidad a la que se refiere el precio (kg, L). */
  unidad: UnidadEntrada;
  /** fija: precio de cada una. variable: precio por `unidad` ($1.500 por kg). Con IVA si incluyeIva. */
  precio: number;
  /** Insumos opcionales: costo fijo neto (frasco vacío, etiqueta)… */
  costoInsumos: number;
  /** …o un insumo del inventario que también se descuenta (receta). */
  insumoId: string;
  insumoCantidad: number;
  activa: boolean;
}

export interface FormularioProducto {
  forma: FormaCompraUI;
  nombreEnvase: NombreEnvase;
  // Unidad suelta
  unidades: number;
  costoUnidad: number;
  precioUnidad: number;
  // En envases (botellas, sacos, cajas, bidones)
  envases: number;
  contenido: number;
  unidadContenido: UnidadEntrada;
  costoEnvase: number;
  /** «Ya tengo unidades abiertas»: remanente de cada una en unidadContenido. */
  abiertos: { id: string; restante: number }[];
  /** Fila «{Botella} completa — precio» (desactivable). */
  venderCompleto: boolean;
  precioCompleto: number;
  // A granel por peso
  cantidadGranel: number;
  unidadGranel: UnidadEntrada;
  modoCosto: 'total' | 'unidad';
  costoGranel: number;
  // Subcategorías (envases o granel)
  subcategorias: SubcategoriaForm[];
  // Alertas de stock: SIEMPRE en la unidad de compra (botellas, sacos) o, a granel, kg / t.
  stockMinimo: number;
  unidadMinimoGranel: 'kg' | 't' | 'l';
  /** Merma estimada % (solo precio sugerido y margen; nunca descuenta stock). */
  mermaEstimada: number;
  perecible: boolean;
  /** Los precios de venta incluyen IVA. */
  incluyeIva: boolean;
  /** El costo escrito trae IVA recuperable (compra con factura): se descuenta para el margen. */
  costoConIva: boolean;
}

export const formularioVacio = (): FormularioProducto => ({
  forma: 'unidad', nombreEnvase: 'botella',
  unidades: 0, costoUnidad: 0, precioUnidad: 0,
  envases: 0, contenido: 0, unidadContenido: 'ml', costoEnvase: 0, abiertos: [],
  venderCompleto: true, precioCompleto: 0,
  cantidadGranel: 0, unidadGranel: 'kg', modoCosto: 'unidad', costoGranel: 0,
  subcategorias: [],
  stockMinimo: 0, unidadMinimoGranel: 'kg', mermaEstimada: 0, perecible: false,
  incluyeIva: true, costoConIva: false,
});

export const usaEnvasesForm = (f: Pick<FormularioProducto, 'forma'>) => f.forma === 'frasco' || f.forma === 'saco' || f.forma === 'bidon';
/** Unidad de medida del producto (envase → contenido; granel → lo comprado). */
export const unidadMedidaForm = (f: FormularioProducto): UnidadEntrada =>
  usaEnvasesForm(f) ? f.unidadContenido : f.forma === 'granel' ? f.unidadGranel : 'unidad';

/** Unidades válidas para escribir subcategorías (misma familia que el contenido: nunca ml con kg). */
export function unidadesSubcategoria(f: FormularioProducto, tipo: 'fija' | 'variable' = 'fija'): UnidadEntrada[] {
  const base = unidadBaseDe(unidadMedidaForm(f));
  if (tipo === 'variable') return base === 'ml' ? ['l', 'ml'] : base === 'kg' ? ['kg', 'g'] : [];
  return base === 'ml' ? ['ml', 'l'] : base === 'kg' ? ['g', 'kg'] : ['unidad'];
}
/** Compatibilidad con el nombre anterior. */
export const unidadesPorcion = (f: FormularioProducto) => unidadesSubcategoria(f, 'fija');

const ETIQUETA_CORTA: Record<UnidadEntrada, [string, string]> = {
  unidad: ['unidad', 'unidades'], ml: ['ml', 'ml'], l: ['L', 'L'], g: ['g', 'g'], kg: ['kg', 'kg'], t: ['tonelada', 'toneladas'],
};
export const etiquetaUnidad = (n: number, u: UnidadEntrada) => ETIQUETA_CORTA[u][n === 1 ? 0 : 1];
const NOMBRE_POR: Record<UnidadEntrada, string> = { kg: 'kilo', g: 'gramo', l: 'litro', ml: 'ml', t: 'tonelada', unidad: 'unidad' };
const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (n: number, d = 3) => (Number(n) || 0).toLocaleString('es-CL', { maximumFractionDigits: d });
const NOMBRE_ENVASE: Record<NombreEnvase, [string, string]> = {
  frasco: ['frasco', 'frascos'], botella: ['botella', 'botellas'], saco: ['saco', 'sacos'], caja: ['caja', 'cajas'], bidon: ['bidón', 'bidones'],
};
const FEMENINO = new Set<NombreEnvase>(['botella', 'caja']);
export const envaseTexto = (f: Pick<FormularioProducto, 'nombreEnvase'>, n = 1) => NOMBRE_ENVASE[f.nombreEnvase][n === 1 ? 0 : 1];
const adj = (f: Pick<FormularioProducto, 'nombreEnvase'>, raiz: string, n: number) => `${raiz}${FEMENINO.has(f.nombreEnvase) ? 'a' : 'o'}${n === 1 ? '' : 's'}`;

/** Nombre automático: «Decant 5 ml» (botellas/frascos en ml), «5 kg», «Por kilo». */
export function nombreSubcategoria(f: FormularioProducto, s: SubcategoriaForm): string {
  if (s.nombre.trim()) return s.nombre.trim();
  if (s.tipo === 'variable') return `Por ${NOMBRE_POR[s.unidad]}`;
  const cantidad = `${fmt(s.cantidad)} ${etiquetaUnidad(s.cantidad, s.unidad)}`;
  return f.forma === 'frasco' && unidadBaseDe(s.unidad) === 'ml' ? `Decant ${cantidad}` : cantidad;
}
export const nombrePorcion = nombreSubcategoria;
/** «Botella completa». */
export const nombreCompleta = (f: FormularioProducto) => `${capitalizar(envaseTexto(f))} ${FEMENINO.has(f.nombreEnvase) ? 'completa' : 'completo'}`;

/** Lo que descuenta cada venta en unidad base (variable: 1 unidad de precio). */
export const factorSubcategoria = (s: SubcategoriaForm) => (s.tipo === 'variable' ? aBase(1, s.unidad) : aBase(s.cantidad, s.unidad));

const neto = (monto: number, conIva: boolean) => (conIva ? (Number(monto) || 0) / (1 + IVA) : Number(monto) || 0);
export const margenSobreNeto = (precioNeto: number, costo: number) => (precioNeto > 0 ? ((precioNeto - costo) / precioNeto) * 100 : null);

export interface CalculoSubcategoria {
  id: string; nombre: string; factor: number; tipo: 'completa' | 'fija' | 'variable'; activa: boolean;
  /** Cuántas salen de una unidad de compra (null = a granel o variable). */
  porUnidad: number | null;
  costoContenido: number; costoInsumos: number; precioNeto: number; margen: number | null;
  /** Disponibles hoy con lo registrado (variable: cantidad en su unidad). */
  disponibles: number;
  aviso?: string;
}
/** Compatibilidad con el nombre anterior. */
export type CalculoPorcion = CalculoSubcategoria;

export interface ResumenFormulario {
  unidadBase: UnidadBase;
  capacidad: number;
  totalBase: number;
  cerrados: number;
  abiertos: number[];
  /** Costo NETO por unidad base (por ml, por kg o por unidad), sin merma. */
  costoBase: number;
  /** Costo por unidad base considerando la merma estimada (para margen y precio sugerido). */
  costoEfectivo: number;
  texto: string;
  completa: CalculoSubcategoria | null;
  subcategorias: CalculoSubcategoria[];
  /** Compatibilidad: igual a `subcategorias`. */
  porciones: CalculoSubcategoria[];
}

/** «Mínimo 3 botellas», «mínimo 0,5 t». */
export function textoMinimoForm(f: FormularioProducto): string {
  const m = Number(f.stockMinimo) || 0;
  if (!(m > 0)) return '';
  if (usaEnvasesForm(f)) return `${fmt(m)} ${envaseTexto(f, m)}`;
  if (f.forma === 'unidad') return `${fmt(m)} ${m === 1 ? 'unidad' : 'unidades'}`;
  return `${fmt(m)} ${f.unidadMinimoGranel === 't' ? 't' : f.unidadMinimoGranel === 'l' ? 'L' : 'kg'}`;
}

/** Resumen en vivo: «19 botellas cerradas · 1 abierta (70 ml) · equivale a 19,7 botellas · mínimo 3». */
export function calcularResumen(f: FormularioProducto, insumos: Pick<Producto, 'id' | 'costo'>[] = []): ResumenFormulario {
  const u = unidadMedidaForm(f);
  const unidadBase = unidadBaseDe(u);
  const costoInsumo = (id: string) => Number(insumos.find(i => i.id === id)?.costo) || 0;
  let capacidad = 0;
  let totalBase = 0;
  let cerrados = 0;
  let abiertos: number[] = [];
  let costoBase = 0;
  const partes: string[] = [];

  if (f.forma === 'unidad') {
    totalBase = r3(f.unidades);
    costoBase = neto(f.costoUnidad, f.costoConIva);
    partes.push(formatCantidad(totalBase, 'unidad'));
  } else if (usaEnvasesForm(f)) {
    capacidad = aBase(f.contenido, f.unidadContenido);
    abiertos = f.abiertos.map(a => aBase(a.restante, f.unidadContenido));
    cerrados = Math.max(0, Math.floor(Number(f.envases) || 0) - abiertos.length);
    totalBase = r3(cerrados * capacidad + abiertos.reduce((a, b) => a + b, 0));
    costoBase = capacidad > 0 ? neto(f.costoEnvase, f.costoConIva) / capacidad : 0;
    partes.push(`${fmt(cerrados)} ${envaseTexto(f, cerrados)} ${adj(f, 'cerrad', cerrados)}`);
    if (abiertos.length) partes.push(`${abiertos.length} ${adj(f, 'abiert', abiertos.length)} (${abiertos.map(a => formatCantidad(a, unidadBase)).join(', ')})`);
    if (capacidad > 0 && abiertos.length) partes.push(`equivale a ${fmt(Math.floor((totalBase / capacidad) * 10 + 0.0001) / 10, 1)} ${envaseTexto(f, 2)}`);
  } else {
    totalBase = aBase(f.cantidadGranel, f.unidadGranel);
    const costoNeto = neto(f.costoGranel, f.costoConIva);
    costoBase = f.modoCosto === 'total'
      ? (totalBase > 0 ? costoNeto / totalBase : 0)
      : costoNeto / (aBase(1, f.unidadGranel) || 1);
    partes.push(formatCantidad(totalBase, unidadBase) + (f.unidadGranel === 't' && totalBase > 0 ? ` (${fmt(f.cantidadGranel)} t)` : ''));
  }
  const minimo = textoMinimoForm(f);
  if (minimo) partes.push(`mínimo ${minimo}`);
  const merma = Math.min(95, Math.max(0, Number(f.mermaEstimada) || 0));
  const costoEfectivo = costoBase / (1 - merma / 100);

  const calcular = (id: string, nombre: string, tipo: CalculoSubcategoria['tipo'], factor: number, precio: number, extra: number, activa: boolean): CalculoSubcategoria => {
    const costoContenido = factor * costoEfectivo;
    const precioNeto = neto(precio, f.incluyeIva);
    const porUnidad = usaEnvasesForm(f) && capacidad > 0 && tipo === 'fija' && factor > 0 ? Math.floor(capacidad / factor + 0.0005) : null;
    const disponibles = tipo === 'completa' ? cerrados
      : factor > 0 ? (tipo === 'variable' ? r3(totalBase / factor) : Math.floor(totalBase / factor + 0.0005)) : 0;
    return { id, nombre, tipo, factor, activa, porUnidad, costoContenido, costoInsumos: extra, precioNeto, margen: margenSobreNeto(precioNeto, costoContenido + extra), disponibles };
  };
  const completa = usaEnvasesForm(f) && capacidad > 0
    ? calcular('completa', nombreCompleta(f), 'completa', capacidad, f.precioCompleto, 0, f.venderCompleto) : null;
  const subcategorias = (f.forma === 'unidad' ? [] : f.subcategorias).map(s => {
    const factor = factorSubcategoria(s);
    const extra = (Number(s.costoInsumos) || 0) + (s.insumoId ? costoInsumo(s.insumoId) * (Number(s.insumoCantidad) || 1) : 0);
    const c = calcular(s.id, nombreSubcategoria(f, s), s.tipo, factor, s.precio, extra, s.activa);
    if (s.tipo === 'fija' && usaEnvasesForm(f) && capacidad > 0 && factor >= capacidad - 0.0005) {
      c.aviso = factor > capacidad
        ? `Es más grande que ${FEMENINO.has(f.nombreEnvase) ? 'una' : 'un'} ${envaseTexto(f)} (${formatCantidad(capacidad, unidadBase)}).`
        : `Es igual a ${FEMENINO.has(f.nombreEnvase) ? 'la' : 'el'} ${envaseTexto(f)}: usa «${nombreCompleta(f)}».`;
    }
    return c;
  });
  return { unidadBase, capacidad, totalBase, cerrados, abiertos, costoBase, costoEfectivo, texto: partes.join(' · '), completa, subcategorias, porciones: subcategorias };
}

/** Errores en línea por campo (clave → mensaje). Vacío = se puede guardar. */
export function validarFormulario(f: FormularioProducto, editando = false): Record<string, string> {
  const e: Record<string, string> = {};
  const r = calcularResumen(f);
  const positivo = (n: number) => Number(n) > 0;
  if (Number(f.stockMinimo) < 0) e.stockMinimo = 'El mínimo no puede ser negativo.';
  if (usaEnvasesForm(f) && Number(f.stockMinimo) > 0 && !Number.isInteger(Number(f.stockMinimo))) e.stockMinimo = `Escribe el mínimo en ${envaseTexto(f, 2)} enteras.`;
  if (f.forma === 'unidad') {
    if (!editando && (Number(f.unidades) < 0 || !Number.isFinite(Number(f.unidades)))) e.unidades = 'Escribe cuántas unidades tienes.';
    if (!positivo(f.precioUnidad)) e.precioUnidad = 'El precio debe ser mayor que 0.';
    return e;
  }
  const activas = f.subcategorias.filter(s => s.activa);
  if (usaEnvasesForm(f)) {
    if (!positivo(f.contenido)) e.contenido = `Escribe cuánto trae cada ${envaseTexto(f)}.`;
    if (!editando) {
      if (!Number.isInteger(Number(f.envases)) || Number(f.envases) < 0) e.envases = `Escribe cuántas ${envaseTexto(f, 2)} tienes (número entero).`;
      else if (f.abiertos.length > Number(f.envases)) e.abiertos = `No puedes tener más abiertas (${f.abiertos.length}) que ${envaseTexto(f, 2)} en total (${f.envases}).`;
      f.abiertos.forEach(a => {
        if (!(Number(a.restante) > 0) || (positivo(f.contenido) && Number(a.restante) > Number(f.contenido))) {
          e[`abierto-${a.id}`] = `Debe quedar más de 0 y hasta ${fmt(f.contenido)} ${etiquetaUnidad(f.contenido, f.unidadContenido)}.`;
        }
      });
    }
    if (!f.venderCompleto && activas.length === 0) e.venta = 'Activa al menos una subcategoría de venta.';
    if (f.venderCompleto && !positivo(f.precioCompleto)) e.precioCompleto = 'El precio debe ser mayor que 0.';
  } else {
    if (!editando && !(Number(f.cantidadGranel) >= 0)) e.cantidadGranel = 'Escribe cuánto compraste.';
    if (activas.length === 0) e.venta = 'Crea al menos una subcategoría de venta (por ejemplo, «Por kilo»).';
  }
  f.subcategorias.forEach((s, i) => {
    const calc = r.subcategorias.find(x => x.id === s.id);
    const clave = `sub-${s.id}`;
    if (s.tipo === 'fija' && !positivo(s.cantidad)) e[clave] = 'Escribe cuánto descuenta.';
    else if (s.activa && !positivo(s.precio)) e[clave] = 'El precio debe ser mayor que 0.';
    else if (calc && s.tipo === 'fija' && usaEnvasesForm(f) && r.capacidad > 0 && calc.factor > r.capacidad) e[clave] = calc.aviso ?? 'Es más grande que el envase.';
    else if (f.subcategorias.slice(0, i).some(o => o.tipo === s.tipo && factorSubcategoria(o) === factorSubcategoria(s))) e[clave] = 'Ya tienes una subcategoría de ese tamaño.';
  });
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

/** Subcategoría del formulario → Presentacion (conserva el id: las ventas antiguas lo referencian). */
function aPresentacion(f: FormularioProducto, s: SubcategoriaForm, conEnvases: boolean): Presentacion {
  const tipo = s.tipo;
  return {
    id: s.id, nombre: nombreSubcategoria(f, s), factor: factorSubcategoria(s), precio: Math.round(Number(s.precio) || 0),
    tipo, origen: origenDe(tipo, conEnvases), activa: s.activa,
    ...(tipo === 'variable' ? { unidadVenta: s.unidad as Presentacion['unidadVenta'] } : {}),
    ...(Number(s.costoInsumos) > 0 ? { costoInsumos: Math.round(Number(s.costoInsumos)) } : {}),
    ...(s.insumoId ? { receta: [{ productoId: s.insumoId, cantidad: Number(s.insumoCantidad) || 1 }] } : {}),
  };
}

/**
 * Convierte el formulario en Producto (todo derivado) + inventario inicial.
 * `existente` conserva ids de presentaciones (las ventas antiguas las referencian).
 */
export function productoDesdeFormulario(f: FormularioProducto, existente?: Producto): { producto: Partial<Producto>; inicial: InventarioInicial } {
  const r = calcularResumen(f);
  const conEnvases = usaEnvasesForm(f);
  const previas = existente?.presentaciones ?? [];
  const idCompleta = previas.find(x => x.tipo === 'completa' || (x.origen === 'envase_cerrado' && x.tipo !== 'porcion'))?.id ?? crypto.randomUUID();
  const presentaciones: Presentacion[] = [];
  if (conEnvases && r.capacidad > 0 && (f.venderCompleto || Number(f.precioCompleto) > 0)) {
    presentaciones.push({ id: idCompleta, nombre: nombreCompleta(f), factor: r.capacidad, precio: Math.round(Number(f.precioCompleto) || 0), tipo: 'completa', origen: 'envase_cerrado', activa: f.venderCompleto });
  }
  if (f.forma !== 'unidad') f.subcategorias.forEach(s => presentaciones.push(aPresentacion(f, s, conEnvases)));

  const minimo = Math.max(0, Number(f.stockMinimo) || 0);
  const unidadMinimo: Producto['unidadMinimo'] = f.forma === 'unidad' ? 'unidad' : conEnvases ? 'envase' : f.unidadMinimoGranel;
  const minimoBase = f.forma === 'unidad' ? minimo : conEnvases ? r3(minimo * r.capacidad) : aBase(minimo, f.unidadMinimoGranel);
  const primeraActiva = presentaciones.find(x => x.activa);
  const precioRef = f.forma === 'unidad' ? Math.round(f.precioUnidad) : primeraActiva?.precio ?? presentaciones[0]?.precio ?? 0;

  const producto: Partial<Producto> = {
    costo: r3(r.costoBase),
    precio: precioRef,
    incluyeIva: f.incluyeIva,
    stockMinimo: minimoBase,
    stockMinimoUnidad: minimo,
    unidadMinimo,
    mermaEstimada: Number(f.mermaEstimada) > 0 ? Number(f.mermaEstimada) : undefined,
    perecible: f.perecible || undefined,
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

const unidadVista = (base: UnidadBase | undefined, factor: number): UnidadEntrada =>
  base === 'kg' ? (factor < 1 ? 'g' : 'kg') : base === 'ml' ? (factor >= 1000 && factor % 1000 === 0 ? 'l' : 'ml') : base === 'l' ? 'l' : base === 'g' ? 'g' : 'unidad';

/** Presentacion guardada → fila del formulario. */
export function subcategoriaDesdePresentacion(p: Pick<Producto, 'unidadBase'>, x: Presentacion): SubcategoriaForm {
  const tipo = x.tipo === 'variable' ? 'variable' : 'fija';
  const unidad: UnidadEntrada = tipo === 'variable' ? (x.unidadVenta ?? unidadVista(p.unidadBase, x.factor)) : unidadVista(p.unidadBase, x.factor);
  const cantidad = tipo === 'variable' ? 1 : desdeBase(x.factor, unidad);
  return {
    id: x.id, nombre: '', tipo, cantidad, unidad, precio: x.precio, costoInsumos: x.costoInsumos ?? 0,
    insumoId: x.receta?.[0]?.productoId ?? '', insumoCantidad: x.receta?.[0]?.cantidad ?? 1, activa: x.activa,
  };
}

/** Rellena el formulario desde un producto guardado (para editar). */
export function formularioDesdeProducto(p: Producto, envases: Envase[] = []): FormularioProducto {
  const f = formularioVacio();
  f.incluyeIva = p.incluyeIva ?? true;
  f.mermaEstimada = Number(p.mermaEstimada) || 0;
  f.perecible = !!p.perecible;
  const pres = p.presentaciones ?? [];
  const forma = p.formaCompra ?? (p.controlEnvases ? 'envase' : p.unidadBase && p.unidadBase !== 'unidad' ? 'granel' : 'unidad');
  const conNombreAuto = (x: Presentacion, s: SubcategoriaForm) => {
    const auto = nombreSubcategoria(f, { ...s, nombre: '' });
    return x.nombre && x.nombre !== auto ? { ...s, nombre: x.nombre } : s;
  };
  if (forma === 'envase') {
    const n = p.nombreEnvase ?? 'frasco';
    f.forma = n === 'saco' || n === 'caja' ? 'saco' : n === 'bidon' ? 'bidon' : 'frasco';
    f.nombreEnvase = n;
    const capacidad = Number(p.capacidadEnvase) || 0;
    f.unidadContenido = unidadVista(p.unidadBase, capacidad);
    f.contenido = desdeBase(capacidad, f.unidadContenido);
    f.costoEnvase = Math.round((Number(p.costo) || 0) * capacidad);
    f.envases = envasesDe(envases, p.id).filter(envaseVigente).length;
    const completa = pres.find(x => tipoPresentacion(p, x) === 'completa');
    f.venderCompleto = !!completa?.activa;
    f.precioCompleto = completa?.precio ?? 0;
    f.subcategorias = pres.filter(x => x !== completa).map(x => conNombreAuto(x, subcategoriaDesdePresentacion(p, x)));
    f.stockMinimo = p.stockMinimoUnidad ?? (capacidad > 0 ? Math.ceil((Number(p.stockMinimo) || 0) / capacidad - 0.0005) : 0);
  } else if (forma === 'granel') {
    f.forma = 'granel';
    const minimo = unidadMinimoDe(p);
    f.unidadGranel = p.unidadBase === 'ml' || p.unidadBase === 'l' ? 'l' : minimo === 't' ? 't' : 'kg';
    f.cantidadGranel = desdeBase(Number(p.stock) || 0, f.unidadGranel);
    f.modoCosto = 'unidad';
    f.costoGranel = Math.round((Number(p.costo) || 0) * aBase(1, f.unidadGranel));
    f.subcategorias = pres.map(x => conNombreAuto(x, subcategoriaDesdePresentacion(p, x)));
    f.unidadMinimoGranel = minimo === 't' ? 't' : minimo === 'l' ? 'l' : 'kg';
    f.stockMinimo = p.stockMinimoUnidad ?? desdeBase(Number(p.stockMinimo) || 0, f.unidadMinimoGranel);
  } else {
    f.forma = 'unidad';
    f.unidades = Number(p.stock) || 0;
    f.costoUnidad = Number(p.costo) || 0;
    f.precioUnidad = Number(p.precio) || 0;
    f.stockMinimo = p.stockMinimoUnidad ?? (Number(p.stockMinimo) || 0);
  }
  return f;
}
