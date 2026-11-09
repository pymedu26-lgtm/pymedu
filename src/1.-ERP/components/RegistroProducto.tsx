// Formulario «Registrar producto» con revelación progresiva (mobile-first):
//   1. Datos generales · 2. ¿En qué viene? · 3. Subcategorías de venta · 4. Alertas de stock
//   5. Resumen fijo (pie en móvil, columna lateral en escritorio).
// El usuario escribe como compra (botellas, sacos, kg, t); services/registroProducto.ts deriva lo
// técnico. «Subcategorías de venta» = Presentacion (no confundir con Categoría).
import { useMemo, useState, type ReactNode } from 'react';
import type { Envase, NombreEnvase, Producto, ResultadoInventario } from '../context/ERPContext';
import CampoMoneda from '../../components/CampoMoneda';
import SelectorDesplegable from '../../components/SelectorDesplegable';
import { cn } from '@/lib/utils';
import { formatCLP } from '../../lib/fechas';
import {
  calcularResumen, envaseTexto, etiquetaUnidad, formatCostoBase, formularioDesdeProducto, formularioVacio, nombreCompleta,
  nombreSubcategoria, productoDesdeFormulario, unidadesSubcategoria, usaEnvasesForm, validarFormulario,
  type CalculoSubcategoria, type FormaCompraUI, type FormularioProducto, type InventarioInicial, type SubcategoriaForm,
} from '../services/registroProducto';
import {
  copiablesDe, copiarSubcategorias, describirSugerencia, plantillaDesdeSubcategoria, precioSugerido, sugerirSubcategorias,
  subcategoriaDesdeSugerencia, type PlantillaSubcategoria, type Sugerencia,
} from '../services/subcategorias';
import { aBase, formatCantidad, resumenStock, type UnidadEntrada } from '../services/inventarioFraccionado';

/** 16 px en móvil (evita el zoom de iOS), 14 px desde sm. Altura táctil ≥ 44 px. */
const campo = 'w-full min-h-11 rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3 py-2.5 text-base text-on-surface outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60 sm:text-sm';
const etiqueta = 'mb-1 block text-xs font-bold text-on-surface-variant';
const chip = 'inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-bold sm:min-h-9';
const FORMAS: { valor: FormaCompraUI; titulo: string; ayuda: string; icono: string }[] = [
  { valor: 'unidad', titulo: 'Unidad suelta', ayuda: 'Se vende tal cual', icono: 'looks_one' },
  { valor: 'frasco', titulo: 'Botella o frasco', ayuda: 'Perfumes, aceites', icono: 'liquor' },
  { valor: 'saco', titulo: 'Saco o caja', ayuda: 'Papas, cajas de 12', icono: 'inventory_2' },
  { valor: 'bidon', titulo: 'Bidón', ayuda: 'Cloro, aceite 5 L', icono: 'oil_barrel' },
  { valor: 'granel', titulo: 'A granel por peso', ayuda: 'Por kilo o tonelada', icono: 'scale' },
];
const UNIDADES_CONTENIDO: UnidadEntrada[] = ['ml', 'l', 'g', 'kg', 'unidad'];
const UNIDADES_GRANEL: UnidadEntrada[] = ['kg', 't', 'l'];
const NOMBRE_UNIDAD: Record<UnidadEntrada, string> = { unidad: 'unidades', ml: 'ml', l: 'L', g: 'g', kg: 'kg', t: 'toneladas' };
const NOMBRES_ENVASE: Record<FormaCompraUI, NombreEnvase[]> = { frasco: ['botella', 'frasco'], saco: ['saco', 'caja'], bidon: ['bidon'], unidad: [], granel: [] };
const CATEGORIAS_BASE = ['Mercadería', 'Insumos', 'Otros'];
const nuevoId = () => crypto.randomUUID();
const numero = (v: string) => (v === '' ? 0 : Number(v.replace(',', '.')));
const fmt = (n: number, d = 1) => n.toLocaleString('es-CL', { maximumFractionDigits: d });

/** Campos de «Datos generales» (los controla ERPInventario para no perderlos al cambiar a servicio). */
export type DatosGenerales = Pick<Partial<Producto>, 'nombre' | 'categoria' | 'proveedorId' | 'descripcion' | 'codigo' | 'codigoBarras' | 'tipoOperativo' | 'estado'>;

interface Props {
  /** Sin @types/react, `key` debe declararse para usarlo en este componente. */
  key?: string;
  editando?: Producto | null;
  general: DatosGenerales;
  onGeneral: (cambios: DatosGenerales) => void;
  inventario: Producto[];
  proveedores: { id: string; nombre: string }[];
  envases: Envase[];
  plantillas?: PlantillaSubcategoria[];
  margenObjetivo?: number;
  rubroNegocio?: string;
  onGuardarPlantilla?: (p: PlantillaSubcategoria) => void;
  /** Selector Producto / Servicio, va arriba dentro del área con scroll. */
  encabezado?: ReactNode;
  onCancelar: () => void;
  onGuardar: (producto: Partial<Producto>, inicial: InventarioInicial) => ResultadoInventario;
}

function Paso({ n, titulo, ayuda, children }: { n: number; titulo: string; ayuda?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 sm:p-5">
      <header>
        <h4 className="flex items-center gap-2 text-base font-black text-on-surface">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">{n}</span>{titulo}
        </h4>
        {ayuda && <p className="mt-1 text-xs text-on-surface-variant">{ayuda}</p>}
      </header>
      {children}
    </section>
  );
}

function Error({ texto }: { texto?: string }) {
  if (!texto) return null;
  return <p data-error className="mt-1 flex items-start gap-1 text-xs font-bold text-error"><span className="material-symbols-outlined text-sm">error</span>{texto}</p>;
}

/** «Salen 20 por botella · costo $1.500 · margen 62 % · 394 disponibles hoy». */
function EnVivo({ c, envase, unidadBase }: { c: CalculoSubcategoria | null; envase: string; unidadBase: string }) {
  if (!c) return null;
  const m = c.margen;
  const disponibles = c.tipo === 'variable'
    ? `${formatCantidad(c.disponibles * c.factor, unidadBase as never)} disponibles`
    : `${c.disponibles.toLocaleString('es-CL')} disponible${c.disponibles === 1 ? '' : 's'} hoy`;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-on-surface-variant">
      {c.porUnidad !== null && <span>Salen {c.porUnidad.toLocaleString('es-CL')} por {envase}</span>}
      <span>Costo {formatCLP(Math.round(c.costoContenido + c.costoInsumos))}{c.tipo === 'variable' ? ` por ${unidadBase === 'ml' ? 'L' : 'kg'}` : ''}</span>
      {m !== null && (
        <span className={cn('rounded-md px-1.5 py-0.5 font-black', m > 30 ? 'bg-success-container text-on-success-container' : m > 15 ? 'bg-secondary/10 text-secondary' : 'bg-error/10 text-error')}>
          Margen {fmt(m)} %
        </span>
      )}
      <span className="font-bold text-on-surface">{disponibles}</span>
    </p>
  );
}

function SelectorUnidad({ valor, opciones, onChange, disabled, etiquetaAccesible }: { valor: UnidadEntrada; opciones: UnidadEntrada[]; onChange: (u: UnidadEntrada) => void; disabled?: boolean; etiquetaAccesible: string }) {
  return (
    <select aria-label={etiquetaAccesible} className={cn(campo, 'w-auto min-w-[5.5rem]')} value={valor} disabled={disabled} onChange={e => onChange(e.target.value as UnidadEntrada)}>
      {opciones.map(u => <option key={u} value={u}>{NOMBRE_UNIDAD[u]}</option>)}
    </select>
  );
}

function Interruptor({ activo, onChange, etiquetaAccesible }: { activo: boolean; onChange: (v: boolean) => void; etiquetaAccesible: string }) {
  return (
    <button type="button" role="switch" aria-checked={activo} aria-label={etiquetaAccesible} onClick={() => onChange(!activo)}
      className="flex min-h-11 min-w-11 shrink-0 items-center justify-center">
      <span className={cn('relative h-6 w-11 rounded-full transition-colors', activo ? 'bg-primary' : 'bg-outline-variant')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', activo ? 'left-[22px]' : 'left-0.5')} />
      </span>
    </button>
  );
}

export default function RegistroProducto({
  editando, general, onGeneral, inventario, proveedores, envases, plantillas = [], margenObjetivo = 40, rubroNegocio,
  onGuardarPlantilla, encabezado, onCancelar, onGuardar,
}: Props) {
  const [f, setF] = useState<FormularioProducto>(() => (editando ? formularioDesdeProducto(editando, envases) : formularioVacio()));
  const [intento, setIntento] = useState(false);
  const [tocados, setTocados] = useState<Set<string>>(new Set());
  const [errorGuardar, setErrorGuardar] = useState('');
  const [menuFila, setMenuFila] = useState<string | null>(null);
  const [copiando, setCopiando] = useState(false);
  const [busquedaCopia, setBusquedaCopia] = useState('');
  const [seleccionCopia, setSeleccionCopia] = useState<Record<string, string[]>>({});
  const [avisoPlantilla, setAvisoPlantilla] = useState('');
  /** Precio sugerido por fila (se muestra; el usuario lo confirma con un toque). */
  const [sugeridos, setSugeridos] = useState<Record<string, { precio: number; origen?: string }>>({});
  const editandoStock = !!editando;
  const cambiar = (c: Partial<FormularioProducto>) => setF(prev => ({ ...prev, ...c }));
  const tocar = (clave: string) => setTocados(prev => (prev.has(clave) ? prev : new Set(prev).add(clave)));

  const insumos = useMemo(() => inventario.filter(p => p.tipo === 'producto' && p.id !== editando?.id && (!p.unidadBase || p.unidadBase === 'unidad')), [inventario, editando?.id]);
  const categorias = useMemo(() => {
    const s = new Set(CATEGORIAS_BASE);
    inventario.forEach(p => { if (p.categoria?.trim()) s.add(p.categoria.trim()); });
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [inventario]);
  const resumen = useMemo(() => calcularResumen(f, insumos), [f, insumos]);
  const errores = useMemo(() => {
    const e = validarFormulario(f, editandoStock);
    if (!general.nombre?.trim()) e.nombre = 'Escribe el nombre del producto.';
    if (!general.categoria?.trim()) e.categoria = 'Elige o escribe una categoría.';
    return e;
  }, [f, editandoStock, general.nombre, general.categoria]);
  /** Se muestran al tocar el campo o tras intentar guardar; los cruzados (abiertas > total) siempre. */
  const err = (clave: string) => (intento || tocados.has(clave) || clave === 'abiertos' ? errores[clave] : undefined);

  const conEnvases = usaEnvasesForm(f);
  const envase = envaseTexto(f);
  const envases2 = envaseTexto(f, 2);
  const femenino = f.nombreEnvase === 'botella' || f.nombreEnvase === 'caja';
  const contenidoListo = f.forma === 'unidad' || f.forma === 'granel' || (conEnvases && f.contenido > 0);

  const elegirForma = (forma: FormaCompraUI) => {
    if (editandoStock || forma === f.forma) return;
    const cambios: Partial<FormularioProducto> = { forma, subcategorias: [], abiertos: [] };
    if (forma === 'frasco') Object.assign(cambios, { nombreEnvase: 'botella', unidadContenido: 'ml' });
    if (forma === 'saco') Object.assign(cambios, { nombreEnvase: 'saco', unidadContenido: 'kg' });
    if (forma === 'bidon') Object.assign(cambios, { nombreEnvase: 'bidon', unidadContenido: 'l' });
    if (forma === 'granel') Object.assign(cambios, { unidadGranel: 'kg', unidadMinimoGranel: 'kg', perecible: true });
    setF(prev => ({ ...prev, ...cambios }));
  };
  const filaNueva = (tipo: 'fija' | 'variable'): SubcategoriaForm => ({
    id: nuevoId(), nombre: '', tipo, cantidad: tipo === 'variable' ? 1 : 0, unidad: unidadesSubcategoria(f, tipo)[0] ?? 'unidad',
    precio: 0, costoInsumos: 0, insumoId: '', insumoCantidad: 1, activa: true,
  });
  const cambiarFila = (id: string, c: Partial<SubcategoriaForm>) => cambiar({ subcategorias: f.subcategorias.map(s => (s.id === id ? { ...s, ...c } : s)) });
  const agregarFilas = (filas: SubcategoriaForm[]) => cambiar({ subcategorias: [...f.subcategorias, ...filas] });

  // Sugerencias (parte B): negocio → plantillas → rubro, solo compatibles y sin repetir.
  const sugerencias = useMemo<Sugerencia[]>(() => {
    if (f.forma === 'unidad' || !contenidoListo) return [];
    return sugerirSubcategorias({
      unidadBase: resumen.unidadBase, capacidad: conEnvases ? resumen.capacidad : 0, categoria: general.categoria, rubroNegocio,
      productoId: editando?.id, existentes: resumen.subcategorias.map(s => ({ tipo: s.tipo === 'variable' ? 'variable' : 'fija', factor: s.factor })),
      inventario, plantillas, esFrasco: f.forma === 'frasco', granel: f.forma === 'granel',
    });
  }, [f.forma, contenidoListo, resumen, conEnvases, general.categoria, rubroNegocio, editando?.id, inventario, plantillas]);
  const agregarSugerencia = (s: Sugerencia) => {
    const fila = subcategoriaDesdeSugerencia(s, nuevoId);
    const costoInsumo = fila.insumoId ? (Number(insumos.find(i => i.id === fila.insumoId)?.costo) || 0) * (fila.insumoCantidad || 1) : 0;
    const precio = precioSugerido(s, { costoBase: resumen.costoEfectivo, incluyeIva: f.incluyeIva, margenObjetivo, costoInsumoInventario: costoInsumo });
    if (precio > 0) setSugeridos(prev => ({ ...prev, [fila.id]: { precio, origen: s.fuente === 'negocio' ? s.origenNombre : undefined } }));
    agregarFilas([fila]);
  };
  const productosCopiables = useMemo(() => {
    if (!copiando) return [];
    const q = busquedaCopia.trim().toLowerCase();
    return inventario
      .filter(p => p.id !== editando?.id && (!q || p.nombre.toLowerCase().includes(q)))
      .map(p => ({ p, lista: copiablesDe(p, { unidadBase: resumen.unidadBase, capacidad: conEnvases ? resumen.capacidad : 0 }) }))
      .filter(x => x.lista.length > 0)
      .slice(0, 8);
  }, [copiando, busquedaCopia, inventario, editando?.id, resumen.unidadBase, resumen.capacidad, conEnvases]);
  const copiarSeleccion = () => {
    const filas = (Object.entries(seleccionCopia) as [string, string[]][]).flatMap(([pid, ids]) => {
      const origen = inventario.find(p => p.id === pid);
      return origen && ids.length ? copiarSubcategorias(origen, ids, nuevoId) : [];
    });
    agregarFilas(filas);
    setCopiando(false);
    setSeleccionCopia({});
    setBusquedaCopia('');
  };
  const guardarComoPlantilla = (s: SubcategoriaForm) => {
    if (!onGuardarPlantilla) return;
    onGuardarPlantilla(plantillaDesdeSubcategoria(s, nombreSubcategoria(f, s), nuevoId, general.categoria));
    setAvisoPlantilla(`«${nombreSubcategoria(f, s)}» quedó guardada como plantilla.`);
    setMenuFila(null);
  };

  const guardar = () => {
    setIntento(true);
    setErrorGuardar('');
    if (Object.keys(errores).length > 0) {
      requestAnimationFrame(() => document.querySelector('[data-error]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      return;
    }
    const { producto, inicial } = productoDesdeFormulario(f, editando ?? undefined);
    const datos: Partial<Producto> = {
      ...producto,
      nombre: general.nombre?.trim(),
      categoria: general.categoria?.trim(),
      proveedorId: general.proveedorId || '',
      descripcion: general.descripcion || '',
      codigo: general.codigo?.trim() || '',
      codigoBarras: general.codigoBarras?.trim() || '',
      tipoOperativo: general.tipoOperativo || 'producto_simple',
      tipo: 'producto',
      estado: general.estado || 'activo',
      esInventariable: true,
    };
    if (editando) {
      // Editar no cambia existencias ni cómo se compra (eso se hace con Reponer/Merma en la ficha).
      for (const k of ['stock', 'capacidadEnvase', 'unidadBase', 'controlEnvases', 'formaCompra', 'nombreEnvase', 'requiereRevisionUnidades', 'unidadMedida'] as const) delete datos[k];
    }
    const r = onGuardar(datos, inicial);
    if ('error' in r) setErrorGuardar(r.error.mensaje);
  };

  const actualEditando = editando && conEnvases ? resumenStock(editando, envases).texto : null;
  const unidadMinimoTexto = f.forma === 'unidad' ? 'unidades' : conEnvases ? `${envases2} ${femenino ? 'cerradas' : 'cerrados'}` : null;

  return (
    <>
      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:space-y-5 sm:p-6">
        {encabezado}
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-4 sm:space-y-5">
            {/* 1. Datos generales */}
            <Paso n={1} titulo="Datos generales">
              <div>
                <label className={etiqueta} htmlFor="rp-nombre">Nombre</label>
                <input id="rp-nombre" className={campo} value={general.nombre ?? ''} placeholder="Ej: Lattafa Asad 100 ml"
                  onChange={e => onGeneral({ nombre: e.target.value })} onBlur={() => tocar('nombre')} />
                <Error texto={err('nombre')} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={etiqueta} htmlFor="rp-categoria">Categoría</label>
                  <input id="rp-categoria" list="rp-categorias" className={campo} value={general.categoria ?? ''} placeholder="Perfumería, Verdulería…"
                    onChange={e => onGeneral({ categoria: e.target.value })} onBlur={() => tocar('categoria')} />
                  <datalist id="rp-categorias">{categorias.map(c => <option key={c} value={c} />)}</datalist>
                  <Error texto={err('categoria')} />
                </div>
                <div>
                  <span className={etiqueta}>Proveedor</span>
                  <SelectorDesplegable className="w-full" valor={general.proveedorId || ''} onChange={(v: string) => onGeneral({ proveedorId: v })}
                    opciones={[{ valor: '', etiqueta: 'Sin proveedor' }, ...proveedores.map(p => ({ valor: p.id, etiqueta: p.nombre }))]} />
                </div>
              </div>
              <div>
                <label className={etiqueta} htmlFor="rp-desc">Descripción</label>
                <textarea id="rp-desc" rows={2} className={cn(campo, 'resize-none')} value={general.descripcion ?? ''} placeholder="Opcional"
                  onChange={e => onGeneral({ descripcion: e.target.value })} />
              </div>
              <details className="rounded-xl border border-outline-variant/30 px-3 py-2">
                <summary className="flex min-h-9 cursor-pointer items-center text-xs font-bold text-on-surface-variant">Más opciones (SKU, código de barras, uso)</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className={etiqueta} htmlFor="rp-sku">SKU / código</label>
                    <input id="rp-sku" className={campo} value={general.codigo ?? ''} onChange={e => onGeneral({ codigo: e.target.value })} />
                  </div>
                  <div>
                    <label className={etiqueta} htmlFor="rp-barras">Código de barras</label>
                    <input id="rp-barras" className={campo} inputMode="numeric" value={general.codigoBarras ?? ''} onChange={e => onGeneral({ codigoBarras: e.target.value })} />
                  </div>
                  <div>
                    <label className={etiqueta} htmlFor="rp-uso">Uso</label>
                    <select id="rp-uso" className={campo} value={general.tipoOperativo || 'producto_simple'} onChange={e => onGeneral({ tipoOperativo: e.target.value as Producto['tipoOperativo'] })}>
                      <option value="producto_simple">Para vender</option>
                      <option value="insumo">Insumo (atomizador, envase vacío)</option>
                      <option value="pack">Pack o combo</option>
                      <option value="producto_compuesto">Producto compuesto</option>
                    </select>
                  </div>
                </div>
              </details>
            </Paso>

            {/* 2. ¿En qué viene? */}
            <Paso n={2} titulo="¿En qué viene?" ayuda={editandoStock ? 'Para cambiar existencias usa «Reponer» o «Registrar merma» en la ficha del producto.' : 'Escribe las cantidades como las compras: el sistema hace la conversión.'}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="En qué viene">
                {FORMAS.map(op => {
                  const activo = f.forma === op.valor;
                  return (
                    <button key={op.valor} type="button" role="radio" aria-checked={activo} disabled={editandoStock && !activo}
                      onClick={() => elegirForma(op.valor)}
                      className={cn('flex min-h-[4.5rem] flex-col items-start gap-0.5 rounded-xl border-2 p-3 text-left transition-colors',
                        activo ? 'border-primary bg-primary/5' : 'border-outline-variant/30 hover:border-primary/40', editandoStock && !activo && 'opacity-40',
                        op.valor === 'granel' && 'col-span-2 sm:col-span-1')}>
                      <span className={cn('material-symbols-outlined text-lg', activo ? 'text-primary' : 'text-outline')}>{op.icono}</span>
                      <span className={cn('text-xs font-black leading-tight', activo ? 'text-primary' : 'text-on-surface')}>{op.titulo}</span>
                      <span className="text-[10px] leading-tight text-outline">{op.ayuda}</span>
                    </button>
                  );
                })}
              </div>

              {f.forma === 'unidad' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={etiqueta} htmlFor="rp-unidades">¿Cuántas unidades tienes?</label>
                    <input id="rp-unidades" type="number" min={0} inputMode="numeric" className={campo} disabled={editandoStock}
                      value={f.unidades || ''} placeholder="0" onChange={e => cambiar({ unidades: numero(e.target.value) })} onBlur={() => tocar('unidades')} />
                    <Error texto={err('unidades')} />
                  </div>
                  <div>
                    <span className={etiqueta}>Costo por unidad</span>
                    <CampoMoneda valor={f.costoUnidad || ''} onChange={v => cambiar({ costoUnidad: v })} className={campo} placeholder="$0" />
                  </div>
                </div>
              )}

              {conEnvases && (
                <>
                  {NOMBRES_ENVASE[f.forma].length > 1 && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-bold text-on-surface-variant">Se llaman</span>
                      {NOMBRES_ENVASE[f.forma].map(n => (
                        <button key={n} type="button" onClick={() => cambiar({ nombreEnvase: n })}
                          className={cn(chip, f.nombreEnvase === n ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/40 text-on-surface-variant')}>
                          {envaseTexto({ nombreEnvase: n }, 2)}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className={etiqueta} htmlFor="rp-envases">¿Cuántas {envases2} tienes?</label>
                      <input id="rp-envases" type="number" min={0} inputMode="numeric" className={campo} disabled={editandoStock}
                        value={editandoStock ? f.envases : f.envases || ''} placeholder="0" onChange={e => cambiar({ envases: numero(e.target.value) })} onBlur={() => tocar('envases')} />
                      <Error texto={err('envases')} />
                    </div>
                    <div>
                      <label className={etiqueta} htmlFor="rp-contenido">Contenido de cada {envase}</label>
                      <div className="flex gap-2">
                        <input id="rp-contenido" type="number" min={0} step="any" inputMode="decimal" className={campo} disabled={editandoStock}
                          value={f.contenido || ''} placeholder={f.forma === 'frasco' ? '100' : f.forma === 'bidon' ? '5' : '25'} onChange={e => cambiar({ contenido: numero(e.target.value) })} onBlur={() => tocar('contenido')} />
                        <SelectorUnidad etiquetaAccesible="Unidad del contenido" valor={f.unidadContenido} opciones={UNIDADES_CONTENIDO} disabled={editandoStock}
                          onChange={u => cambiar({ unidadContenido: u, subcategorias: [] })} />
                      </div>
                      <Error texto={err('contenido')} />
                    </div>
                    <div>
                      <span className={etiqueta}>Costo por {envase}</span>
                      <CampoMoneda valor={f.costoEnvase || ''} onChange={v => cambiar({ costoEnvase: v })} className={campo} placeholder="$0" />
                    </div>
                  </div>

                  {actualEditando ? (
                    <p className="rounded-xl bg-surface-container-low px-3 py-2 text-xs font-bold text-on-surface">Hoy: {actualEditando}</p>
                  ) : (
                    <div className="space-y-2">
                      <label className="flex min-h-11 items-center gap-2 text-sm font-bold text-on-surface">
                        <input type="checkbox" className="h-5 w-5 accent-primary" checked={f.abiertos.length > 0}
                          onChange={e => cambiar({ abiertos: e.target.checked ? [{ id: nuevoId(), restante: 0 }] : [] })} />
                        Ya tengo {envases2} {femenino ? 'abiertas' : 'abiertos'}
                      </label>
                      {f.abiertos.map((a, i) => (
                        <div key={a.id}>
                          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-low/50 px-3 py-2">
                            <span className="material-symbols-outlined text-base text-secondary">water_drop</span>
                            <span className="text-xs font-bold text-on-surface">{femenino ? 'Abierta' : 'Abierto'} {i + 1} · le quedan</span>
                            <input type="number" min={0} step="any" inputMode="decimal" aria-label={`Lo que le queda a la abierta ${i + 1}`} className={cn(campo, 'w-24')}
                              value={a.restante || ''} onChange={e => cambiar({ abiertos: f.abiertos.map(x => (x.id === a.id ? { ...x, restante: numero(e.target.value) } : x)) })}
                              onBlur={() => tocar(`abierto-${a.id}`)} />
                            <span className="text-xs text-on-surface-variant">{NOMBRE_UNIDAD[f.unidadContenido]}</span>
                            <button type="button" aria-label={`Quitar abierta ${i + 1}`} onClick={() => cambiar({ abiertos: f.abiertos.filter(x => x.id !== a.id) })}
                              className="ml-auto flex h-11 w-11 items-center justify-center rounded-lg text-outline hover:bg-error/10 hover:text-error"><span className="material-symbols-outlined text-lg">close</span></button>
                          </div>
                          <Error texto={err(`abierto-${a.id}`)} />
                        </div>
                      ))}
                      <Error texto={err('abiertos')} />
                      {f.abiertos.length > 0 && (
                        <button type="button" onClick={() => cambiar({ abiertos: [...f.abiertos, { id: nuevoId(), restante: 0 }] })}
                          className={cn(chip, 'border-primary/30 text-primary hover:bg-primary/5')}>
                          <span className="material-symbols-outlined text-base">add</span> Otra {femenino ? 'abierta' : 'abierto'}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}

              {f.forma === 'granel' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={etiqueta} htmlFor="rp-granel">Cantidad comprada</label>
                    <div className="flex gap-2">
                      <input id="rp-granel" type="number" min={0} step="any" inputMode="decimal" className={campo} disabled={editandoStock}
                        value={f.cantidadGranel || ''} placeholder="0" onChange={e => cambiar({ cantidadGranel: numero(e.target.value) })} onBlur={() => tocar('cantidadGranel')} />
                      <SelectorUnidad etiquetaAccesible="Unidad de compra" valor={f.unidadGranel} opciones={UNIDADES_GRANEL} disabled={editandoStock}
                        onChange={u => cambiar({ unidadGranel: u, unidadMinimoGranel: u === 'l' ? 'l' : u === 't' ? 't' : 'kg', subcategorias: u === 'l' || f.unidadGranel === 'l' ? [] : f.subcategorias })} />
                    </div>
                    {f.unidadGranel !== 'kg' && f.cantidadGranel > 0 && (
                      <p className="mt-1 text-[11px] text-on-surface-variant">Se guarda como {formatCantidad(aBase(f.cantidadGranel, f.unidadGranel), resumen.unidadBase)}.</p>
                    )}
                    <Error texto={err('cantidadGranel')} />
                  </div>
                  <div>
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      {(['unidad', 'total'] as const).map(m => (
                        <button key={m} type="button" onClick={() => cambiar({ modoCosto: m })}
                          className={cn('rounded-full border px-3 py-1 text-xs font-bold', f.modoCosto === m ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/40 text-on-surface-variant')}>
                          {m === 'total' ? 'Costo total' : `Costo por ${etiquetaUnidad(1, f.unidadGranel)}`}
                        </button>
                      ))}
                    </div>
                    <CampoMoneda valor={f.costoGranel || ''} onChange={v => cambiar({ costoGranel: v })} className={campo} placeholder="$0" />
                  </div>
                </div>
              )}

              <details className="rounded-xl border border-outline-variant/30 px-3 py-2">
                <summary className="flex min-h-9 cursor-pointer items-center text-xs font-bold text-on-surface-variant">Más opciones de costo (IVA, merma estimada, perecible)</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex items-start gap-2 text-xs text-on-surface-variant">
                    <input type="checkbox" className="mt-0.5 h-5 w-5 accent-primary" checked={f.costoConIva} onChange={e => cambiar({ costoConIva: e.target.checked })} />
                    El costo que escribí incluye IVA de una factura (se descuenta para el margen)
                  </label>
                  {f.forma !== 'unidad' && (
                    <div>
                      <label className={etiqueta} htmlFor="rp-merma">Merma estimada (%)</label>
                      <input id="rp-merma" type="number" min={0} max={90} step="any" inputMode="decimal" className={campo} value={f.mermaEstimada || ''} placeholder="0"
                        onChange={e => cambiar({ mermaEstimada: numero(e.target.value) })} />
                      <p className="mt-1 text-[11px] text-on-surface-variant">Solo ajusta el margen y el precio sugerido. Nunca descuenta stock.</p>
                    </div>
                  )}
                  <label className="flex items-start gap-2 text-xs text-on-surface-variant">
                    <input type="checkbox" className="mt-0.5 h-5 w-5 accent-primary" checked={f.perecible} onChange={e => cambiar({ perecible: e.target.checked })} />
                    Es perecible (avisar lotes por vencer o sin rotar)
                  </label>
                </div>
              </details>
            </Paso>

            {/* 3. Subcategorías de venta (aparece al definir el contenido) */}
            {f.forma === 'unidad' ? (
              <Paso n={3} titulo="Precio de venta">
                <label className="flex min-h-11 items-center gap-2 text-xs font-bold text-on-surface">
                  <input type="checkbox" className="h-5 w-5 accent-primary" checked={f.incluyeIva} onChange={e => cambiar({ incluyeIva: e.target.checked })} />
                  Los precios incluyen IVA
                </label>
                <div>
                  <span className={etiqueta}>Precio por unidad</span>
                  <CampoMoneda valor={f.precioUnidad || ''} onChange={v => cambiar({ precioUnidad: v })} className={campo} placeholder="$0" />
                  <Error texto={err('precioUnidad')} />
                </div>
              </Paso>
            ) : contenidoListo && (
              <Paso n={3} titulo="Subcategorías de venta"
                ayuda={`Cada subcategoría descuenta su contenido del inventario de este producto; ninguna tiene stock propio.${conEnvases ? ` Contenido de cada ${envase}: ${formatCantidad(resumen.capacidad, resumen.unidadBase)}.` : ''}`}>
                <label className="flex min-h-11 items-center gap-2 text-xs font-bold text-on-surface">
                  <input type="checkbox" className="h-5 w-5 accent-primary" checked={f.incluyeIva} onChange={e => cambiar({ incluyeIva: e.target.checked })} />
                  Los precios incluyen IVA
                </label>

                {conEnvases && resumen.completa && (
                  <div className={cn('rounded-xl border p-3', f.venderCompleto ? 'border-primary/40 bg-primary/5' : 'border-outline-variant/30 opacity-80')}>
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-on-surface">{nombreCompleta(f)}</p>
                        <p className="text-[11px] text-on-surface-variant">Descuenta {formatCantidad(resumen.capacidad, resumen.unidadBase)} · solo de {envases2} {femenino ? 'cerradas' : 'cerrados'}</p>
                      </div>
                      <Interruptor activo={f.venderCompleto} onChange={v => cambiar({ venderCompleto: v })} etiquetaAccesible={`Vender ${nombreCompleta(f)}`} />
                    </div>
                    {f.venderCompleto && (
                      <div className="mt-2">
                        <span className={etiqueta}>Precio</span>
                        <CampoMoneda valor={f.precioCompleto || ''} onChange={v => cambiar({ precioCompleto: v })} className={campo} placeholder="$0" />
                        <Error texto={err('precioCompleto')} />
                        <EnVivo c={resumen.completa} envase={envase} unidadBase={resumen.unidadBase} />
                      </div>
                    )}
                  </div>
                )}

                {f.subcategorias.map(s => {
                  const calc = resumen.subcategorias.find(c => c.id === s.id) ?? null;
                  const sug = sugeridos[s.id];
                  return (
                    <div key={s.id} className={cn('rounded-xl border p-3', s.activa ? 'border-outline-variant/40 bg-surface-container-lowest' : 'border-outline-variant/20 bg-surface-container-low/40')}>
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <label className="sr-only" htmlFor={`sub-nombre-${s.id}`}>Nombre de la subcategoría</label>
                          <input id={`sub-nombre-${s.id}`} className={cn(campo, 'font-bold')} value={s.nombre} placeholder={nombreSubcategoria(f, { ...s, nombre: '' })}
                            onChange={e => cambiarFila(s.id, { nombre: e.target.value })} />
                          <p className="mt-1 text-[11px] text-on-surface-variant">{s.tipo === 'variable' ? 'Precio por peso: se pesa al vender' : 'Cantidad fija por venta'}</p>
                        </div>
                        <Interruptor activo={s.activa} onChange={v => cambiarFila(s.id, { activa: v })} etiquetaAccesible={`Activa: ${nombreSubcategoria(f, s)}`} />
                        <div className="relative">
                          <button type="button" aria-label="Más acciones" aria-expanded={menuFila === s.id} onClick={() => setMenuFila(menuFila === s.id ? null : s.id)}
                            className="flex h-11 w-11 items-center justify-center rounded-lg text-outline hover:bg-surface-container"><span className="material-symbols-outlined">more_vert</span></button>
                          {menuFila === s.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setMenuFila(null)} />
                              <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-1 shadow-xl">
                                {onGuardarPlantilla && (
                                  <button type="button" onClick={() => guardarComoPlantilla(s)} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-surface-container-low">
                                    <span className="material-symbols-outlined text-lg">bookmark_add</span> Guardar como plantilla
                                  </button>
                                )}
                                <button type="button" onClick={() => { cambiar({ subcategorias: f.subcategorias.filter(x => x.id !== s.id) }); setMenuFila(null); }}
                                  className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-error hover:bg-error/10">
                                  <span className="material-symbols-outlined text-lg">delete</span> Quitar
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        {s.tipo === 'fija' ? (
                          <div className="col-span-2 sm:col-span-1">
                            <span className={etiqueta}>Cantidad que descuenta</span>
                            <div className="flex gap-2">
                              <input type="number" min={0} step="any" inputMode="decimal" aria-label="Cantidad que descuenta" className={cn(campo, 'min-w-0')} value={s.cantidad || ''}
                                onChange={e => cambiarFila(s.id, { cantidad: numero(e.target.value) })} onBlur={() => tocar(`sub-${s.id}`)} />
                              <SelectorUnidad etiquetaAccesible="Unidad" valor={s.unidad} opciones={unidadesSubcategoria(f, 'fija')} onChange={u => cambiarFila(s.id, { unidad: u })} />
                            </div>
                          </div>
                        ) : (
                          <div className="col-span-2 sm:col-span-1">
                            <span className={etiqueta}>Precio por</span>
                            <SelectorUnidad etiquetaAccesible="Unidad del precio" valor={s.unidad} opciones={unidadesSubcategoria(f, 'variable')} onChange={u => cambiarFila(s.id, { unidad: u })} />
                          </div>
                        )}
                        <div className="col-span-2 sm:col-span-1">
                          <span className={etiqueta}>{s.tipo === 'variable' ? `Precio por ${NOMBRE_UNIDAD[s.unidad]}` : 'Precio'}</span>
                          <CampoMoneda valor={s.precio || ''} onChange={v => cambiarFila(s.id, { precio: v })} className={campo} placeholder="$0" />
                          {sug && !s.precio && (
                            <button type="button" onClick={() => cambiarFila(s.id, { precio: sug.precio })}
                              className="mt-1 inline-flex min-h-9 items-center gap-1 rounded-full bg-primary/10 px-3 text-[11px] font-bold text-primary">
                              Usar {formatCLP(sug.precio)} <span className="font-medium">{sug.origen ? `(mismo margen que ${sug.origen})` : `(margen ${margenObjetivo} %)`}</span>
                            </button>
                          )}
                        </div>
                      </div>
                      <EnVivo c={calc} envase={envase} unidadBase={resumen.unidadBase} />
                      {calc?.aviso && !errores[`sub-${s.id}`] && <p className="mt-1 text-[11px] font-bold text-secondary">{calc.aviso}</p>}
                      <Error texto={err(`sub-${s.id}`)} />
                      <details className="mt-2">
                        <summary className="flex min-h-9 cursor-pointer items-center text-[11px] font-bold text-on-surface-variant">Insumos (opcional)</summary>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <div>
                            <span className={etiqueta}>Costo fijo por venta (neto)</span>
                            <CampoMoneda valor={s.costoInsumos || ''} onChange={v => cambiarFila(s.id, { costoInsumos: v })} className={campo} placeholder="Envase vacío, etiqueta…" />
                          </div>
                          <div>
                            <span className={etiqueta}>Insumo del inventario que también se descuenta</span>
                            <div className="flex gap-2">
                              <select aria-label="Insumo del inventario" className={campo} value={s.insumoId} onChange={e => cambiarFila(s.id, { insumoId: e.target.value })}>
                                <option value="">Ninguno</option>
                                {insumos.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                              </select>
                              {s.insumoId && <input type="number" min={1} inputMode="numeric" aria-label="Cantidad del insumo" className={cn(campo, 'w-20')} value={s.insumoCantidad || 1} onChange={e => cambiarFila(s.id, { insumoCantidad: numero(e.target.value) || 1 })} />}
                            </div>
                          </div>
                        </div>
                      </details>
                    </div>
                  );
                })}

                {sugerencias.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">Sugerencias</p>
                    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 hide-scrollbar">
                      {sugerencias.slice(0, 10).map(s => (
                        <button key={s.clave} type="button" onClick={() => agregarSugerencia(s)}
                          className={cn(chip, 'border-primary/30 bg-surface-container-lowest text-primary hover:bg-primary/5')}>
                          <span className="material-symbols-outlined text-base">add</span>{s.nombre}
                          <span className="font-medium text-on-surface-variant">· {describirSugerencia(s)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {avisoPlantilla && <p className="text-[11px] font-bold text-success" role="status">{avisoPlantilla}</p>}
                <Error texto={err('venta')} />

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => agregarFilas([filaNueva('fija')])} className={cn(chip, 'border-primary bg-primary text-inverse-on-surface')}>
                    <span className="material-symbols-outlined text-base">add</span> Crear subcategoría
                  </button>
                  {unidadesSubcategoria(f, 'variable').length > 0 && !f.subcategorias.some(s => s.tipo === 'variable') && (
                    <button type="button" onClick={() => agregarFilas([filaNueva('variable')])} className={cn(chip, 'border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-low')}>
                      <span className="material-symbols-outlined text-base">scale</span> Precio por peso
                    </button>
                  )}
                  <button type="button" onClick={() => setCopiando(v => !v)} aria-expanded={copiando} className={cn(chip, 'border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-low')}>
                    <span className="material-symbols-outlined text-base">content_copy</span> Copiar de otro producto
                  </button>
                </div>

                {copiando && (
                  <div className="space-y-2 rounded-xl border border-outline-variant/40 bg-surface-container-low/50 p-3">
                    <input className={campo} placeholder="Buscar producto…" value={busquedaCopia} onChange={e => setBusquedaCopia(e.target.value)} aria-label="Buscar producto para copiar" />
                    {productosCopiables.length === 0 && <p className="text-xs text-on-surface-variant">No hay productos con subcategorías compatibles.</p>}
                    {productosCopiables.map(({ p, lista }) => (
                      <fieldset key={p.id} className="rounded-lg bg-surface-container-lowest p-2">
                        <legend className="px-1 text-xs font-black text-on-surface">{p.nombre}</legend>
                        <div className="flex flex-wrap gap-x-4">
                          {lista.map(x => {
                            const marcado = (seleccionCopia[p.id] ?? []).includes(x.id);
                            return (
                              <label key={x.id} className="flex min-h-11 items-center gap-2 text-xs">
                                <input type="checkbox" className="h-5 w-5 accent-primary" checked={marcado}
                                  onChange={e => setSeleccionCopia(prev => ({ ...prev, [p.id]: e.target.checked ? [...(prev[p.id] ?? []), x.id] : (prev[p.id] ?? []).filter(i => i !== x.id) }))} />
                                {x.nombre} · {formatCLP(x.precio)}
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    ))}
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setCopiando(false)} className="min-h-11 rounded-full px-4 text-xs font-bold text-on-surface-variant">Cancelar</button>
                      <button type="button" disabled={!(Object.values(seleccionCopia) as string[][]).some(l => l.length)} onClick={copiarSeleccion}
                        className="min-h-11 rounded-full bg-primary px-4 text-xs font-bold text-inverse-on-surface disabled:opacity-50">Agregar seleccionadas</button>
                    </div>
                  </div>
                )}
              </Paso>
            )}

            {/* 4. Alertas de stock (siempre en la unidad de compra) */}
            {contenidoListo && (
              <Paso n={4} titulo="Alertas de stock">
                <div className="flex flex-wrap items-center gap-2 text-sm text-on-surface">
                  <label htmlFor="rp-minimo">Avisarme cuando queden</label>
                  <input id="rp-minimo" type="number" min={0} step={conEnvases || f.forma === 'unidad' ? 1 : 'any'} inputMode={conEnvases || f.forma === 'unidad' ? 'numeric' : 'decimal'}
                    className={cn(campo, 'w-24')} value={f.stockMinimo || ''} placeholder="0" onChange={e => cambiar({ stockMinimo: numero(e.target.value) })} onBlur={() => tocar('stockMinimo')} />
                  {unidadMinimoTexto ? <span>{unidadMinimoTexto}</span> : (
                    <select aria-label="Unidad del mínimo" className={cn(campo, 'w-auto')} value={f.unidadMinimoGranel}
                      onChange={e => cambiar({ unidadMinimoGranel: e.target.value as FormularioProducto['unidadMinimoGranel'] })}>
                      {(f.unidadGranel === 'l' ? ['l'] : ['kg', 't']).map(u => <option key={u} value={u}>{u === 't' ? 'toneladas' : u === 'l' ? 'litros' : 'kg'}</option>)}
                    </select>
                  )}
                </div>
                {conEnvases && <p className="text-[11px] text-on-surface-variant">Cuentan solo las {envases2} {femenino ? 'cerradas' : 'cerrados'}; las {femenino ? 'abiertas' : 'abiertos'} se informan aparte.</p>}
                <Error texto={err('stockMinimo')} />
              </Paso>
            )}
          </div>

          {/* 5. Resumen fijo (escritorio) */}
          <aside className="hidden rounded-2xl border-2 border-primary/20 bg-primary/5 p-4 lg:sticky lg:top-0 lg:block lg:self-start" aria-live="polite">
            <p className="text-[11px] font-black uppercase tracking-widest text-primary">Resumen</p>
            <p className="mt-2 text-sm font-bold text-on-surface">{editandoStock && actualEditando ? actualEditando : resumen.texto}</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-[11px] text-on-surface-variant">Disponible</dt><dd className="font-black text-on-surface">{formatCantidad(resumen.totalBase, resumen.unidadBase)}</dd></div>
              <div><dt className="text-[11px] text-on-surface-variant">Costo</dt><dd className="font-black text-on-surface">{resumen.costoBase > 0 ? formatCostoBase(resumen.costoBase, resumen.unidadBase) : '—'}</dd></div>
              <div className="col-span-2"><dt className="text-[11px] text-on-surface-variant">Subcategorías activas</dt><dd className="font-bold text-on-surface">
                {[resumen.completa && f.venderCompleto ? resumen.completa.nombre : null, ...resumen.subcategorias.filter(s => s.activa).map(s => s.nombre)].filter(Boolean).join(' · ') || '—'}
              </dd></div>
            </dl>
            {editandoStock && <p className="mt-2 text-[11px] text-on-surface-variant">Al editar no cambian las existencias.</p>}
          </aside>
        </div>
      </div>

      {/* Pie fijo con el resumen (móvil) y las acciones */}
      <footer className="flex shrink-0 flex-col gap-2 border-t border-outline-variant/20 bg-surface-container-low/95 px-4 pt-3 sm:flex-row sm:items-center sm:justify-between sm:px-6"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}>
        <div className="min-w-0 text-xs">
          {errorGuardar ? <p className="font-bold text-error">{errorGuardar}</p>
            : <p className="font-bold text-on-surface-variant lg:hidden">{editandoStock && actualEditando ? actualEditando : resumen.texto}</p>}
          {intento && Object.keys(errores).length > 0 && <p className="font-bold text-error">Revisa los campos marcados.</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={onCancelar} className="min-h-11 flex-1 rounded-full px-5 text-sm font-bold text-on-surface-variant hover:bg-surface-container-high sm:flex-none">Cancelar</button>
          <button type="button" onClick={guardar} className="min-h-11 flex-1 rounded-full bg-primary px-5 text-sm font-bold text-inverse-on-surface shadow-lg shadow-primary/20 sm:flex-none">
            {editando ? 'Guardar cambios' : 'Guardar producto'}
          </button>
        </div>
      </footer>
    </>
  );
}
