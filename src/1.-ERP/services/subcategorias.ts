// ═══════════════════════════════════════════════════════════════════════
// Subcategorías de venta sugeridas (registro de producto). Fuentes, en orden:
//   1. Subcategorías de otros productos del negocio, agrupadas por cantidad + unidad y
//      ordenadas por frecuencia (misma categoría primero).
//   2. Plantillas guardadas (Configuración › Subcategorías frecuentes, colección `config`).
//   3. Sugerencias iniciales por rubro, SOLO si el negocio no tiene ninguna de esa unidad.
// Solo se sugiere lo compatible: misma familia de unidad (nunca ml con kg), tamaño menor que el
// contenido de la unidad de compra y que el producto aún no tenga. Al agregar una se crea una
// COPIA independiente: borrar una plantilla o cambiar el producto de origen no afecta a nadie.
// Funciones puras (sin React).
// ═══════════════════════════════════════════════════════════════════════
import type { Producto, Presentacion } from '../context/ERPContext';
import { aBase, desdeBase, r3, tipoPresentacion, unidadBaseDe, type UnidadEntrada } from './inventarioFraccionado';
import { IVA, margenSobreNeto, subcategoriaDesdePresentacion, type SubcategoriaForm } from './registroProducto';

/** Plantilla guardada en Configuración (colección `config`, campo `plantillasSubcategoria`). */
export interface PlantillaSubcategoria {
  id: string;
  nombre: string;
  cantidad: number;
  unidad: UnidadEntrada;
  tipo?: 'fija' | 'variable';
  /** Insumos opcionales (costo fijo neto o insumo del inventario). */
  costoInsumos?: number;
  insumoId?: string;
  insumoCantidad?: number;
  rubro?: string;
  oculta?: boolean;
}

export interface Sugerencia {
  /** `${tipo}:${unidad base}:${factor}` (agrupa «Decant 5 ml» y «Muestra 5 ml»). */
  clave: string;
  nombre: string;
  tipo: 'fija' | 'variable';
  cantidad: number;
  unidad: UnidadEntrada;
  /** Lo que descuenta en unidad base (variable: 1 unidad de precio). */
  factor: number;
  /** En cuántos productos del negocio se usa. */
  usos: number;
  fuente: 'negocio' | 'plantilla' | 'rubro';
  /** Margen (0-1, sobre neto) del producto de origen: el precio sugerido busca el mismo. */
  margenOrigen?: number;
  origenNombre?: string;
  costoInsumos?: number;
  insumoId?: string;
  insumoCantidad?: number;
  plantillaId?: string;
}

type Familia = 'ml' | 'kg' | 'unidad';
const familiaDe = (base?: string): Familia => (base === 'ml' || base === 'l' ? 'ml' : base === 'kg' || base === 'g' ? 'kg' : 'unidad');
/** Factor en la base nueva (ml / kg) aunque el producto de origen use 'l' o 'g' antiguos. */
const factorNormal = (p: Producto, factor: number) => (p.unidadBase === 'l' ? factor * 1000 : p.unidadBase === 'g' ? factor / 1000 : factor);

interface Inicial { cantidad: number; unidad: UnidadEntrada; tipo?: 'variable'; nombre?: string }
/** Sugerencias iniciales por rubro (solo si el negocio no tiene ninguna subcategoría de esa unidad). */
export const RUBROS: { rubro: string; patron: RegExp; familia: Familia; items: Inicial[] }[] = [
  { rubro: 'perfumería', patron: /perfum|fragan|cosm[eé]t/i, familia: 'ml', items: [2, 3, 5, 10].map(c => ({ cantidad: c, unidad: 'ml' as const })) },
  {
    rubro: 'verdulería', patron: /verdu|frut|hortal|feria|tub[eé]rc/i, familia: 'kg', items: [
      { cantidad: 500, unidad: 'g' }, { cantidad: 1, unidad: 'kg' }, { cantidad: 5, unidad: 'kg', nombre: 'Malla 5 kg' },
      { cantidad: 25, unidad: 'kg', nombre: 'Saco 25 kg' }, { cantidad: 1, unidad: 'kg', tipo: 'variable', nombre: 'Por kilo' },
    ],
  },
  { rubro: 'abarrotes', patron: /abarrot|almac[eé]n|grano|legumbr|cereal|harina|az[uú]car|arroz/i, familia: 'kg', items: [{ cantidad: 250, unidad: 'g' }, { cantidad: 500, unidad: 'g' }, { cantidad: 1, unidad: 'kg' }] },
  { rubro: 'líquidos', patron: /l[ií]quid|bebida|aceite|limpieza|deterg|vino|licor|jugo/i, familia: 'ml', items: [{ cantidad: 500, unidad: 'ml' }, { cantidad: 1, unidad: 'l' }, { cantidad: 5, unidad: 'l' }] },
];

/** Rubro por la categoría (o el rubro del negocio); si no calza, por la unidad y el tamaño. */
export function rubroDe(familia: Familia, categoria = '', rubroNegocio = '', capacidad = 0, granel = false) {
  const texto = `${categoria} ${rubroNegocio}`;
  const porTexto = RUBROS.find(r => r.familia === familia && r.patron.test(texto));
  if (porTexto) return porTexto;
  if (familia === 'ml') return RUBROS.find(r => r.rubro === (capacidad > 0 && capacidad <= 250 ? 'perfumería' : 'líquidos'));
  if (familia === 'kg') return RUBROS.find(r => r.rubro === (granel ? 'verdulería' : 'abarrotes'));
  return undefined;
}

const unidadLegible = (familia: Familia, factor: number, tipo: 'fija' | 'variable'): { cantidad: number; unidad: UnidadEntrada } => {
  if (familia === 'ml') return factor >= 1000 && factor % 1000 === 0 ? { cantidad: factor / 1000, unidad: 'l' } : { cantidad: factor, unidad: 'ml' };
  if (familia === 'kg') return factor < 1 ? { cantidad: r3(factor * 1000), unidad: 'g' } : { cantidad: factor, unidad: 'kg' };
  return { cantidad: factor, unidad: 'unidad' };
};
const nombreAuto = (familia: Familia, cantidad: number, unidad: UnidadEntrada, tipo: 'fija' | 'variable', esFrasco: boolean) => {
  if (tipo === 'variable') return `Por ${unidad === 'kg' ? 'kilo' : unidad === 'l' ? 'litro' : unidad === 'g' ? 'gramo' : unidad}`;
  const texto = `${cantidad.toLocaleString('es-CL', { maximumFractionDigits: 3 })} ${unidad === 'l' ? 'L' : unidad === 'unidad' ? (cantidad === 1 ? 'unidad' : 'unidades') : unidad}`;
  return esFrasco && familia === 'ml' ? `Decant ${texto}` : texto;
};

export interface DatosSugerencia {
  /** Unidad base del producto que se registra ('ml', 'kg' o 'unidad'). */
  unidadBase: string;
  /** Contenido de la unidad de compra en unidad base (0 = a granel, sin límite). */
  capacidad: number;
  categoria?: string;
  rubroNegocio?: string;
  /** Producto que se edita (se excluye de las fuentes). */
  productoId?: string;
  /** Subcategorías que el producto ya tiene. */
  existentes: { tipo: 'fija' | 'variable'; factor: number }[];
  inventario: Producto[];
  plantillas?: PlantillaSubcategoria[];
  esFrasco?: boolean;
  granel?: boolean;
}

const claveDe = (familia: Familia, tipo: 'fija' | 'variable', factor: number) => `${tipo}:${familia}:${r3(factor)}`;

/** Lista de sugerencias compatibles, ordenadas por fuente y frecuencia. Nunca agrega nada sola. */
export function sugerirSubcategorias(d: DatosSugerencia): Sugerencia[] {
  const familia = familiaDe(d.unidadBase);
  const esFrasco = !!d.esFrasco;
  const compatible = (tipo: 'fija' | 'variable', factor: number) => {
    if (!(factor > 0)) return false;
    if (tipo === 'variable') return familia !== 'unidad' && !d.existentes.some(e => e.tipo === 'variable');
    if (d.capacidad > 0 && factor >= d.capacidad - 0.0005) return false; // igual = «completa»
    return !d.existentes.some(e => e.tipo === 'fija' && Math.abs(e.factor - factor) < 0.0005);
  };

  // 1. Negocio: agrupa por tamaño y cuenta productos (misma categoría primero).
  const grupos = new Map<string, Sugerencia & { mismaCategoria: number; nombres: Map<string, number>; margenes: number[] }>();
  let negocioTieneFamilia = false;
  for (const p of d.inventario) {
    if (p.id === d.productoId || p.tipo !== 'producto' || familiaDe(p.unidadBase) !== familia) continue;
    const vistos = new Set<string>();
    for (const x of p.presentaciones ?? []) {
      const tipo = tipoPresentacion(p, x);
      if (tipo === 'completa' || !x.activa) continue;
      negocioTieneFamilia = true;
      const factor = r3(factorNormal(p, x.factor));
      const clave = claveDe(familia, tipo, factor);
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      const legible = unidadLegible(familia, factor, tipo);
      const g = grupos.get(clave) ?? {
        clave, tipo, factor, ...legible, nombre: '', usos: 0, fuente: 'negocio' as const,
        mismaCategoria: 0, nombres: new Map<string, number>(), margenes: [], origenNombre: p.nombre,
        costoInsumos: x.costoInsumos, insumoId: x.receta?.[0]?.productoId, insumoCantidad: x.receta?.[0]?.cantidad,
      };
      g.usos += 1;
      if (d.categoria && p.categoria?.trim().toLowerCase() === d.categoria.trim().toLowerCase()) g.mismaCategoria += 1;
      g.nombres.set(x.nombre, (g.nombres.get(x.nombre) ?? 0) + 1);
      const m = margenDe(p, x);
      if (m !== null) g.margenes.push(m);
      grupos.set(clave, g);
    }
  }
  const delNegocio: Sugerencia[] = [...grupos.values()]
    .filter(g => compatible(g.tipo, g.factor))
    .sort((a, b) => b.mismaCategoria - a.mismaCategoria || b.usos - a.usos || a.factor - b.factor)
    .map(({ mismaCategoria: _m, nombres, margenes, ...g }) => ({
      ...g,
      nombre: [...nombres].sort((a, b) => b[1] - a[1])[0]?.[0] ?? nombreAuto(familia, g.cantidad, g.unidad, g.tipo, esFrasco),
      margenOrigen: margenes.length ? margenes.reduce((a, b) => a + b, 0) / margenes.length : undefined,
    }));

  // 2. Plantillas guardadas (no ocultas) de la misma familia.
  const dePlantillas: Sugerencia[] = (d.plantillas ?? [])
    .filter(t => !t.oculta && familiaDe(unidadBaseDe(t.unidad)) === familia)
    .map(t => {
      const tipo: 'fija' | 'variable' = t.tipo ?? 'fija';
      const factor = tipo === 'variable' ? aBase(1, t.unidad) : aBase(t.cantidad, t.unidad);
      return {
        clave: claveDe(familia, tipo, factor), nombre: t.nombre, tipo, cantidad: t.cantidad, unidad: t.unidad, factor, usos: 0,
        fuente: 'plantilla' as const, plantillaId: t.id, costoInsumos: t.costoInsumos, insumoId: t.insumoId, insumoCantidad: t.insumoCantidad,
      };
    })
    .filter(s => compatible(s.tipo, s.factor));

  // 3. Rubro: solo si el negocio no tiene ninguna subcategoría de esta unidad.
  const rubro = negocioTieneFamilia ? undefined : rubroDe(familia, d.categoria, d.rubroNegocio, d.capacidad, d.granel);
  const deRubro: Sugerencia[] = (rubro?.items ?? []).map(it => {
    const tipo: 'fija' | 'variable' = it.tipo ?? 'fija';
    const factor = tipo === 'variable' ? aBase(1, it.unidad) : aBase(it.cantidad, it.unidad);
    return {
      clave: claveDe(familia, tipo, factor), nombre: it.nombre ?? nombreAuto(familia, it.cantidad, it.unidad, tipo, esFrasco),
      tipo, cantidad: it.cantidad, unidad: it.unidad, factor, usos: 0, fuente: 'rubro' as const,
    };
  }).filter(s => compatible(s.tipo, s.factor));

  const vistas = new Set<string>();
  return [...delNegocio, ...dePlantillas, ...deRubro].filter(s => (vistas.has(s.clave) ? false : (vistas.add(s.clave), true)));
}

/** Margen (0-1) sobre precio neto de una presentación existente. */
function margenDe(p: Producto, x: Presentacion): number | null {
  const precioNeto = (p.incluyeIva ?? true) ? x.precio / (1 + IVA) : x.precio;
  const costo = factorNormal(p, x.factor) * (Number(p.costo) || 0) * (p.unidadBase === 'l' ? 0.001 : p.unidadBase === 'g' ? 1000 : 1)
    + (Number(x.costoInsumos) || 0);
  const m = margenSobreNeto(precioNeto, costo);
  return m === null || !(Number(p.costo) > 0) ? null : m / 100;
}

/**
 * Precio sugerido: el que da el MISMO margen que en el producto de origen con el costo de este
 * producto; sin origen, costo × margen objetivo de Configuración. Redondeado a la centena.
 */
export function precioSugerido(s: Pick<Sugerencia, 'factor' | 'margenOrigen' | 'costoInsumos'>, d: {
  costoBase: number; incluyeIva: boolean; margenObjetivo: number; costoInsumoInventario?: number;
}): number {
  const costo = s.factor * (Number(d.costoBase) || 0) + (Number(s.costoInsumos) || 0) + (Number(d.costoInsumoInventario) || 0);
  if (!(costo > 0)) return 0;
  const margen = Math.min(0.95, Math.max(0, s.margenOrigen ?? (Number(d.margenObjetivo) || 0) / 100));
  const neto = costo / (1 - margen);
  const bruto = d.incluyeIva ? neto * (1 + IVA) : neto;
  return Math.max(100, Math.round(bruto / 100) * 100);
}

/** Copia independiente y editable para el formulario (id nuevo, precio vacío hasta confirmar). */
export function subcategoriaDesdeSugerencia(s: Sugerencia, nuevoId: () => string): SubcategoriaForm {
  const auto = nombreAuto(familiaDe(unidadBaseDe(s.unidad)), s.cantidad, s.unidad, s.tipo, false);
  return {
    id: nuevoId(), nombre: s.nombre && s.nombre !== auto && !/^Decant /.test(s.nombre) ? s.nombre : '', tipo: s.tipo,
    cantidad: s.tipo === 'variable' ? 1 : s.cantidad, unidad: s.unidad, precio: 0,
    costoInsumos: s.costoInsumos ?? 0, insumoId: s.insumoId ?? '', insumoCantidad: s.insumoCantidad ?? 1, activa: true,
  };
}

/** «Copiar subcategorías de otro producto»: copias independientes (ids nuevos) de las elegidas. */
export function copiarSubcategorias(origen: Producto, ids: string[], nuevoId: () => string): SubcategoriaForm[] {
  return (origen.presentaciones ?? [])
    .filter(x => ids.includes(x.id) && tipoPresentacion(origen, x) !== 'completa')
    .map(x => {
      const base = origen.unidadBase === 'l' ? { ...x, factor: x.factor * 1000 } : origen.unidadBase === 'g' ? { ...x, factor: x.factor / 1000 } : x;
      const s = subcategoriaDesdePresentacion({ unidadBase: familiaDe(origen.unidadBase) === 'unidad' ? 'unidad' : familiaDe(origen.unidadBase) }, base);
      return { ...s, id: nuevoId(), nombre: x.nombre, precio: x.precio };
    });
}

/** Subcategorías de otro producto que se pueden copiar a este (misma familia, cabe en el envase). */
export function copiablesDe(origen: Producto, d: Pick<DatosSugerencia, 'unidadBase' | 'capacidad'>): Presentacion[] {
  if (familiaDe(origen.unidadBase) !== familiaDe(d.unidadBase)) return [];
  return (origen.presentaciones ?? []).filter(x => {
    const tipo = tipoPresentacion(origen, x);
    if (tipo === 'completa') return false;
    const factor = factorNormal(origen, x.factor);
    return tipo === 'variable' || !(d.capacidad > 0) || factor < d.capacidad - 0.0005;
  });
}

/** «Guardar como plantilla» desde una fila del formulario. */
export function plantillaDesdeSubcategoria(s: SubcategoriaForm, nombre: string, nuevoId: () => string, rubro?: string): PlantillaSubcategoria {
  return {
    id: nuevoId(), nombre, cantidad: s.tipo === 'variable' ? 1 : s.cantidad, unidad: s.unidad, tipo: s.tipo,
    ...(Number(s.costoInsumos) > 0 ? { costoInsumos: Number(s.costoInsumos) } : {}),
    ...(s.insumoId ? { insumoId: s.insumoId, insumoCantidad: s.insumoCantidad || 1 } : {}),
    ...(rubro ? { rubro } : {}),
  };
}

export const describirSugerencia = (s: Sugerencia) =>
  s.fuente === 'negocio' ? `usada en ${s.usos} producto${s.usos === 1 ? '' : 's'}` : s.fuente === 'plantilla' ? 'plantilla guardada' : 'sugerencia inicial';

export { desdeBase };
