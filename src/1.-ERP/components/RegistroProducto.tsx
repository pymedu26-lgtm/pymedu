// Formulario «Registrar producto» en dos preguntas: ¿Cómo lo compras? / ¿Cómo lo vendes?
// El usuario escribe en la unidad en que compra; services/registroProducto.ts deriva lo técnico
// (unidad base, envases, factor, origen). Reemplaza al antiguo EditorFraccionamiento.
import { useMemo, useState, type ReactNode } from 'react';
import type { Envase, NombreEnvase, Producto } from '../context/ERPContext';
import type { ResultadoInventario } from '../context/ERPContext';
import CampoMoneda from '../../components/CampoMoneda';
import SelectorDesplegable from '../../components/SelectorDesplegable';
import { cn } from '@/lib/utils';
import { formatCLP } from '../../lib/fechas';
import {
  calcularResumen, etiquetaUnidad, formatCostoBase, formularioDesdeProducto, formularioVacio, nombreCompleta,
  nombrePorcion, porcionesRapidas, productoDesdeFormulario, unidadesPorcion, usaEnvasesForm, validarFormulario,
  type CalculoPorcion, type FormaCompraUI, type FormularioProducto, type InventarioInicial, type PorcionForm,
} from '../services/registroProducto';
import { aBase, formatCantidad, resumenStock, type UnidadEntrada } from '../services/inventarioFraccionado';

const campo = 'w-full rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60';
const etiqueta = 'mb-1 block text-xs font-bold text-on-surface-variant';
const FORMAS: { valor: FormaCompraUI; titulo: string; ayuda: string; icono: string }[] = [
  { valor: 'unidad', titulo: 'Por unidad', ayuda: 'Cada uno se vende tal cual', icono: 'looks_one' },
  { valor: 'frasco', titulo: 'En frascos o botellas', ayuda: 'Perfumes, aceites, licores', icono: 'liquor' },
  { valor: 'saco', titulo: 'En sacos o cajas', ayuda: 'Sacos de papas, cajas de 12', icono: 'inventory_2' },
  { valor: 'granel', titulo: 'A granel', ayuda: 'Por kilo, tonelada o litro', icono: 'scale' },
];
const UNIDADES_CONTENIDO: UnidadEntrada[] = ['ml', 'l', 'g', 'kg', 'unidad'];
const UNIDADES_GRANEL: UnidadEntrada[] = ['kg', 't', 'g', 'l'];
const NOMBRE_UNIDAD: Record<UnidadEntrada, string> = { unidad: 'unidades', ml: 'ml', l: 'L', g: 'g', kg: 'kg', t: 'toneladas' };
const CATEGORIAS_BASE = ['Mercadería', 'Insumos', 'Otros'];
const nuevoId = () => crypto.randomUUID();

/** Campos de «Información general» (los controla ERPInventario para no perderlos al cambiar a servicio). */
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
  /** Selector Producto / Servicio, va arriba dentro del área con scroll. */
  encabezado?: ReactNode;
  onCancelar: () => void;
  onGuardar: (producto: Partial<Producto>, inicial: InventarioInicial) => ResultadoInventario;
}

function Seccion({ letra, titulo, ayuda, children }: { letra: string; titulo: string; ayuda?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 sm:p-5">
      <header>
        <h4 className="flex items-center gap-2 text-base font-black text-on-surface">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">{letra}</span>{titulo}
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

function Margen({ calculo }: { calculo: CalculoPorcion | null }) {
  if (!calculo || calculo.margen === null) return null;
  const m = calculo.margen;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-on-surface-variant">
      <span>Contenido {formatCLP(Math.round(calculo.costoContenido))}</span>
      {calculo.costoInsumos > 0 && <span>Insumos {formatCLP(Math.round(calculo.costoInsumos))}</span>}
      <span>Precio neto {formatCLP(Math.round(calculo.precioNeto))}</span>
      <span className={cn('rounded-md px-1.5 py-0.5 font-black', m > 30 ? 'bg-success-container text-on-success-container' : m > 15 ? 'bg-secondary/10 text-secondary' : 'bg-error/10 text-error')}>
        Margen {m.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%
      </span>
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

const numero = (v: string) => (v === '' ? 0 : Number(v.replace(',', '.')));

export default function RegistroProducto({ editando, general, onGeneral, inventario, proveedores, envases, encabezado, onCancelar, onGuardar }: Props) {
  const [f, setF] = useState<FormularioProducto>(() => (editando ? formularioDesdeProducto(editando, envases) : formularioVacio()));
  const [intento, setIntento] = useState(false);
  const [tocados, setTocados] = useState<Set<string>>(new Set());
  const [errorGuardar, setErrorGuardar] = useState('');
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
  /** Se muestran al tocar el campo o tras intentar guardar; los cruzados (abiertos > total) siempre. */
  const err = (clave: string) => (intento || tocados.has(clave) || clave === 'abiertos' ? errores[clave] : undefined);

  const envase = f.nombreEnvase;
  const envasesPlural = `${envase}s`;
  const unidadPorcionDefecto = unidadesPorcion(f)[0];
  const elegirForma = (forma: FormaCompraUI) => {
    if (editandoStock) return;
    const cambios: Partial<FormularioProducto> = { forma };
    if (forma === 'frasco') Object.assign(cambios, { nombreEnvase: 'frasco', unidadContenido: 'ml' });
    if (forma === 'saco') Object.assign(cambios, { nombreEnvase: 'saco', unidadContenido: 'kg' });
    if (forma !== f.forma) cambios.porciones = forma === 'granel' ? [porcionNueva(1, 'kg')] : [];
    if (forma === 'frasco' || forma === 'saco') cambios.venderPorciones = false;
    setF(prev => ({ ...prev, ...cambios }));
  };
  function porcionNueva(cantidad: number, unidad: UnidadEntrada): PorcionForm {
    return { id: nuevoId(), cantidad, unidad, precio: 0, costoInsumos: 0, insumoId: '', insumoCantidad: 1, nombre: '' };
  }
  const cambiarPorcion = (id: string, c: Partial<PorcionForm>) => cambiar({ porciones: f.porciones.map(p => (p.id === id ? { ...p, ...c } : p)) });
  const agregarPorcion = (cantidad: number, unidad: UnidadEntrada) => cambiar({ porciones: [...f.porciones, porcionNueva(cantidad, unidad)] });

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

  const conEnvases = usaEnvasesForm(f);
  const actualEditando = editando && conEnvases ? resumenStock(editando, envases).texto : null;

  return (
    <>
      <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
        {encabezado}
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            {/* A. Información general */}
            <Seccion letra="A" titulo="Información general">
              <div>
                <label className={etiqueta} htmlFor="rp-nombre">Nombre</label>
                <input id="rp-nombre" className={campo} value={general.nombre ?? ''} placeholder="Ej: Lattafa Asad 100 ml"
                  onChange={e => onGeneral({ nombre: e.target.value })} onBlur={() => tocar('nombre')} />
                <Error texto={err('nombre')} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={etiqueta} htmlFor="rp-categoria">Categoría</label>
                  <input id="rp-categoria" list="rp-categorias" className={campo} value={general.categoria ?? ''} placeholder="Elige o escribe una nueva"
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
              <details className="group rounded-xl border border-outline-variant/30 px-3 py-2">
                <summary className="cursor-pointer text-xs font-bold text-on-surface-variant">Más opciones (código, código de barras, uso)</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className={etiqueta} htmlFor="rp-sku">Código / SKU</label>
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
            </Seccion>

            {/* B. ¿Cómo lo compras? */}
            <Seccion letra="B" titulo="¿Cómo lo compras?" ayuda={editandoStock ? 'Para cambiar existencias usa «Reponer» o «Registrar merma» en la ficha del producto.' : 'Escribe las cantidades como las compras: el sistema hace la conversión.'}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Cómo lo compras">
                {FORMAS.map(op => {
                  const activo = f.forma === op.valor;
                  return (
                    <button key={op.valor} type="button" role="radio" aria-checked={activo} disabled={editandoStock && !activo}
                      onClick={() => elegirForma(op.valor)}
                      className={cn('flex flex-col items-start gap-0.5 rounded-xl border-2 p-3 text-left transition-colors',
                        activo ? 'border-primary bg-primary/5' : 'border-outline-variant/30 hover:border-primary/40', editandoStock && !activo && 'opacity-40')}>
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
                    <label className={etiqueta} htmlFor="rp-unidades">Unidades que tienes</label>
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
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold text-on-surface-variant">Se llaman</span>
                    {(f.forma === 'frasco' ? ['frasco', 'botella'] : ['saco', 'caja']).map(n => (
                      <button key={n} type="button" onClick={() => cambiar({ nombreEnvase: n as NombreEnvase })}
                        className={cn('rounded-full border px-3 py-1 font-bold capitalize', envase === n ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/40 text-on-surface-variant')}>
                        {n}s
                      </button>
                    ))}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={etiqueta} htmlFor="rp-envases">Cantidad de {envasesPlural} que tienes</label>
                      <input id="rp-envases" type="number" min={0} inputMode="numeric" className={campo} disabled={editandoStock}
                        value={editandoStock ? f.envases : f.envases || ''} placeholder="0" onChange={e => cambiar({ envases: numero(e.target.value) })} onBlur={() => tocar('envases')} />
                      <Error texto={err('envases')} />
                    </div>
                    <div>
                      <span className={etiqueta}>Costo por {envase}</span>
                      <CampoMoneda valor={f.costoEnvase || ''} onChange={v => cambiar({ costoEnvase: v })} className={campo} placeholder="$0" />
                    </div>
                  </div>
                  <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-3">
                    <label className={etiqueta} htmlFor="rp-contenido">Contenido de cada {envase} original</label>
                    <div className="flex gap-2">
                      <input id="rp-contenido" type="number" min={0} step="any" inputMode="decimal" className={campo} disabled={editandoStock}
                        value={f.contenido || ''} placeholder={f.forma === 'frasco' ? '100' : '25'} onChange={e => cambiar({ contenido: numero(e.target.value) })} onBlur={() => tocar('contenido')} />
                      <SelectorUnidad etiquetaAccesible="Unidad del contenido" valor={f.unidadContenido} opciones={UNIDADES_CONTENIDO} disabled={editandoStock}
                        onChange={u => cambiar({ unidadContenido: u, porciones: f.porciones.map(p => ({ ...p, unidad: unidadesPorcionPara(u, false) })) })} />
                    </div>
                    <p className="mt-1 text-[11px] text-on-surface-variant">Lo que trae un {envase} cerrado, por ejemplo 100 ml. No es el tamaño del decant ni de la porción.</p>
                    <Error texto={err('contenido')} />
                  </div>

                  {actualEditando ? (
                    <p className="rounded-xl bg-surface-container-low px-3 py-2 text-xs font-bold text-on-surface">Hoy: {actualEditando}</p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-on-surface-variant">¿Alguno ya está abierto?</p>
                      {f.abiertos.map((a, i) => (
                        <div key={a.id}>
                          <div className="flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-low/50 px-3 py-2">
                            <span className="material-symbols-outlined text-base text-secondary">water_drop</span>
                            <span className="shrink-0 text-xs font-bold text-on-surface">Abierto {i + 1} · le quedan</span>
                            <input type="number" min={0} step="any" inputMode="decimal" aria-label={`Lo que le queda al abierto ${i + 1}`} className={cn(campo, 'w-24 py-1.5')}
                              value={a.restante || ''} onChange={e => cambiar({ abiertos: f.abiertos.map(x => (x.id === a.id ? { ...x, restante: numero(e.target.value) } : x)) })}
                              onBlur={() => tocar(`abierto-${a.id}`)} />
                            <span className="text-xs text-on-surface-variant">{NOMBRE_UNIDAD[f.unidadContenido]}</span>
                            <button type="button" aria-label={`Quitar abierto ${i + 1}`} onClick={() => cambiar({ abiertos: f.abiertos.filter(x => x.id !== a.id) })}
                              className="ml-auto rounded-lg p-1 text-outline hover:bg-error/10 hover:text-error"><span className="material-symbols-outlined text-lg">close</span></button>
                          </div>
                          <Error texto={err(`abierto-${a.id}`)} />
                        </div>
                      ))}
                      <Error texto={err('abiertos')} />
                      <button type="button" onClick={() => cambiar({ abiertos: [...f.abiertos, { id: nuevoId(), restante: 0 }] })}
                        className="inline-flex items-center gap-1 rounded-full border border-primary/30 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/5">
                        <span className="material-symbols-outlined text-base">add</span> Agregar {envase} abierto
                      </button>
                    </div>
                  )}
                </>
              )}

              {f.forma === 'granel' && (
                <>
                  <div>
                    <label className={etiqueta} htmlFor="rp-granel">Cantidad comprada</label>
                    <div className="flex gap-2">
                      <input id="rp-granel" type="number" min={0} step="any" inputMode="decimal" className={campo} disabled={editandoStock}
                        value={f.cantidadGranel || ''} placeholder="0" onChange={e => cambiar({ cantidadGranel: numero(e.target.value) })} onBlur={() => tocar('cantidadGranel')} />
                      <SelectorUnidad etiquetaAccesible="Unidad de compra" valor={f.unidadGranel} opciones={UNIDADES_GRANEL} disabled={editandoStock}
                        onChange={u => cambiar({ unidadGranel: u, porciones: f.porciones.map(p => ({ ...p, unidad: unidadesPorcionPara(u, true) })) })} />
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
                </>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={etiqueta} htmlFor="rp-minimo">
                    Avísame cuando queden menos de ({f.forma === 'unidad' ? 'unidades' : conEnvases ? envasesPlural : NOMBRE_UNIDAD[f.unidadGranel]})
                  </label>
                  <input id="rp-minimo" type="number" min={0} step="any" className={campo} value={f.stockMinimo || ''} placeholder="0"
                    onChange={e => cambiar({ stockMinimo: numero(e.target.value) })} />
                </div>
                <label className="flex items-start gap-2 self-end pb-2 text-xs text-on-surface-variant">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={f.costoConIva} onChange={e => cambiar({ costoConIva: e.target.checked })} />
                  El costo que escribí incluye IVA de una factura (se descuenta para calcular el margen)
                </label>
              </div>
            </Seccion>
          </div>

          <div className="space-y-5">
            {/* C. ¿Cómo lo vendes? */}
            <Seccion letra="C" titulo="¿Cómo lo vendes?">
              <label className="flex items-center gap-2 text-xs font-bold text-on-surface">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={f.incluyeIva} onChange={e => cambiar({ incluyeIva: e.target.checked })} />
                Los precios de venta incluyen IVA
              </label>

              {f.forma === 'unidad' && (
                <div>
                  <span className={etiqueta}>Precio por unidad</span>
                  <CampoMoneda valor={f.precioUnidad || ''} onChange={v => cambiar({ precioUnidad: v })} className={campo} placeholder="$0" />
                  <Error texto={err('precioUnidad')} />
                  {f.precioUnidad > 0 && <Margen calculo={{
                    id: 'u', nombre: '', factor: 1, costoContenido: resumen.costoBase, costoInsumos: 0,
                    precioNeto: f.incluyeIva ? f.precioUnidad / 1.19 : f.precioUnidad,
                    margen: f.precioUnidad > 0 ? (((f.incluyeIva ? f.precioUnidad / 1.19 : f.precioUnidad) - resumen.costoBase) / (f.incluyeIva ? f.precioUnidad / 1.19 : f.precioUnidad)) * 100 : null,
                  }} />}
                </div>
              )}

              {conEnvases && (
                <div className={cn('rounded-xl border p-3', f.venderCompleto ? 'border-primary/40 bg-primary/5' : 'border-outline-variant/30')}>
                  <label className="flex items-center gap-2 text-sm font-black text-on-surface">
                    <input type="checkbox" className="h-4 w-4 accent-primary" checked={f.venderCompleto} onChange={e => cambiar({ venderCompleto: e.target.checked })} />
                    <span className="capitalize">{envase}</span> completo {f.contenido > 0 && <span className="font-medium text-on-surface-variant">({nombreCompleta(f)})</span>}
                  </label>
                  {f.venderCompleto && (
                    <div className="mt-2">
                      <span className={etiqueta}>Precio del {envase} completo</span>
                      <CampoMoneda valor={f.precioCompleto || ''} onChange={v => cambiar({ precioCompleto: v })} className={campo} placeholder="$0" />
                      <Error texto={err('precioCompleto')} />
                      <Margen calculo={resumen.completa} />
                    </div>
                  )}
                </div>
              )}

              {(conEnvases || f.forma === 'granel') && (
                <div className={cn('rounded-xl border p-3', conEnvases && !f.venderPorciones ? 'border-outline-variant/30' : 'border-primary/40 bg-primary/5')}>
                  {conEnvases ? (
                    <label className="flex items-center gap-2 text-sm font-black text-on-surface">
                      <input type="checkbox" className="h-4 w-4 accent-primary" checked={f.venderPorciones}
                        onChange={e => { const q = porcionesRapidas(f); const ini = q.find(x => x.cantidad === 5 && x.unidad === 'ml') ?? q[0]; cambiar({ venderPorciones: e.target.checked, porciones: e.target.checked && f.porciones.length === 0 ? [porcionNueva(ini.cantidad, ini.unidad)] : f.porciones }); }} />
                      También en porciones <span className="font-medium text-on-surface-variant">({f.forma === 'frasco' ? 'decants' : 'sueltos'})</span>
                    </label>
                  ) : (
                    <p className="text-sm font-black text-on-surface">Formas de venta</p>
                  )}
                  {(f.forma === 'granel' || f.venderPorciones) && (
                    <div className="mt-3 space-y-3">
                      {conEnvases && f.contenido > 0 && (
                        <p className="text-[11px] text-on-surface-variant">
                          Contenido de cada {envase} original: <b>{formatCantidad(resumen.capacidad, resumen.unidadBase)}</b>. Abajo va el tamaño de cada porción.
                        </p>
                      )}
                      {f.porciones.map(p => {
                        const calc = resumen.porciones.find(c => c.id === p.id) ?? null;
                        return (
                          <div key={p.id} className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3">
                            <div className="flex flex-wrap items-end gap-2">
                              <div className="min-w-0 flex-1">
                                <span className={etiqueta}>Tamaño de la porción</span>
                                <div className="flex gap-2">
                                  <input type="number" min={0} step="any" inputMode="decimal" aria-label="Cantidad de la porción" className={cn(campo, 'min-w-0')} value={p.cantidad || ''}
                                    onChange={e => cambiarPorcion(p.id, { cantidad: numero(e.target.value) })} onBlur={() => tocar(`porcion-${p.id}`)} />
                                  <SelectorUnidad etiquetaAccesible="Unidad de la porción" valor={p.unidad} opciones={unidadesPorcion(f)} onChange={u => cambiarPorcion(p.id, { unidad: u })} />
                                </div>
                              </div>
                              <div className="w-full sm:w-36">
                                <span className={etiqueta}>Precio</span>
                                <CampoMoneda valor={p.precio || ''} onChange={v => cambiarPorcion(p.id, { precio: v })} className={campo} placeholder="$0" />
                              </div>
                              <button type="button" aria-label={`Quitar ${nombrePorcion(f, p)}`} onClick={() => cambiar({ porciones: f.porciones.filter(x => x.id !== p.id) })}
                                className="rounded-lg p-2 text-outline hover:bg-error/10 hover:text-error"><span className="material-symbols-outlined text-lg">delete</span></button>
                            </div>
                            <p className="mt-1 text-xs font-bold text-on-surface">{nombrePorcion(f, p)}</p>
                            <Margen calculo={calc} />
                            {calc?.aviso && !errores[`porcion-${p.id}`] && <p className="mt-1 text-[11px] font-bold text-secondary">{calc.aviso}</p>}
                            <Error texto={err(`porcion-${p.id}`)} />
                            <details className="mt-2">
                              <summary className="cursor-pointer text-[11px] font-bold text-on-surface-variant">Más opciones (nombre, insumos)</summary>
                              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                <div>
                                  <span className={etiqueta}>Nombre propio</span>
                                  <input className={campo} value={p.nombre} placeholder={nombrePorcion(f, { ...p, nombre: '' })} onChange={e => cambiarPorcion(p.id, { nombre: e.target.value })} />
                                </div>
                                <div>
                                  <span className={etiqueta}>Costo de insumos sueltos (neto)</span>
                                  <CampoMoneda valor={p.costoInsumos || ''} onChange={v => cambiarPorcion(p.id, { costoInsumos: v })} className={campo} placeholder="Envase vacío, etiqueta…" />
                                </div>
                                <div className="sm:col-span-2">
                                  <span className={etiqueta}>Insumo del inventario que también se descuenta</span>
                                  <div className="flex gap-2">
                                    <select aria-label="Insumo del inventario" className={campo} value={p.insumoId} onChange={e => cambiarPorcion(p.id, { insumoId: e.target.value })}>
                                      <option value="">Ninguno</option>
                                      {insumos.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                                    </select>
                                    {p.insumoId && <input type="number" min={1} aria-label="Cantidad del insumo" className={cn(campo, 'w-20')} value={p.insumoCantidad || 1} onChange={e => cambiarPorcion(p.id, { insumoCantidad: numero(e.target.value) || 1 })} />}
                                  </div>
                                </div>
                              </div>
                            </details>
                          </div>
                        );
                      })}
                      <Error texto={err('porciones')} />
                      <div className="flex flex-wrap gap-2">
                        {porcionesRapidas(f).map(r => (
                          <button key={`${r.cantidad}${r.unidad}`} type="button" onClick={() => agregarPorcion(r.cantidad, r.unidad)}
                            className="rounded-full border border-primary/30 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/5">
                            +{r.cantidad.toLocaleString('es-CL')} {etiquetaUnidad(r.cantidad, r.unidad)}
                          </button>
                        ))}
                        <button type="button" onClick={() => agregarPorcion(0, unidadPorcionDefecto)}
                          className="inline-flex items-center gap-1 rounded-full border border-outline-variant/40 px-3 py-1.5 text-xs font-bold text-on-surface-variant hover:bg-surface-container-low">
                          <span className="material-symbols-outlined text-base">add</span> Otra
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <Error texto={err('venta')} />
              {f.forma !== 'unidad' && (
                <p className="flex items-center gap-1 text-xs font-bold text-on-surface-variant">
                  <span className="material-symbols-outlined text-base text-primary">sync_alt</span>
                  Todas las formas de venta descuentan del mismo inventario.
                </p>
              )}
            </Seccion>

            {/* Resumen en vivo */}
            <aside className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-4 lg:sticky lg:top-0" aria-live="polite">
              <p className="text-[11px] font-black uppercase tracking-widest text-primary">Resumen</p>
              <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
                {conEnvases ? (
                  <>
                    <div><dt className="text-[11px] text-on-surface-variant">Cerrados</dt><dd className="font-black text-on-surface">{resumen.cerrados.toLocaleString('es-CL')}</dd></div>
                    <div><dt className="text-[11px] text-on-surface-variant">Abiertos</dt><dd className="font-black text-on-surface">
                      {resumen.abiertos.length}{resumen.abiertos.length > 0 && <span className="ml-1 text-xs font-medium text-on-surface-variant">({resumen.abiertos.map(a => formatCantidad(a, resumen.unidadBase)).join(', ')})</span>}
                    </dd></div>
                  </>
                ) : null}
                <div><dt className="text-[11px] text-on-surface-variant">Disponible</dt><dd className="font-black text-on-surface">{formatCantidad(resumen.totalBase, resumen.unidadBase)}</dd></div>
                <div><dt className="text-[11px] text-on-surface-variant">Costo</dt><dd className="font-black text-on-surface">{resumen.costoBase > 0 ? formatCostoBase(resumen.costoBase, resumen.unidadBase) : '—'}</dd></div>
              </dl>
              {editandoStock && <p className="mt-2 text-[11px] text-on-surface-variant">Al editar no cambian las existencias.</p>}
            </aside>
          </div>
        </div>
      </div>

      <footer className="flex shrink-0 flex-col gap-2 border-t border-outline-variant/20 bg-surface-container-low/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0 text-xs">
          {errorGuardar ? <p className="font-bold text-error">{errorGuardar}</p>
            : <p className="truncate font-bold text-on-surface-variant">{editandoStock && actualEditando ? actualEditando : resumen.texto}</p>}
          {intento && Object.keys(errores).length > 0 && <p className="font-bold text-error">Revisa los campos marcados.</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={onCancelar} className="flex-1 rounded-full px-5 py-2.5 text-sm font-bold text-on-surface-variant hover:bg-surface-container-high sm:flex-none">Cancelar</button>
          <button type="button" onClick={guardar} className="flex-1 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-inverse-on-surface shadow-lg shadow-primary/20 sm:flex-none">
            {editando ? 'Guardar cambios' : 'Guardar producto'}
          </button>
        </div>
      </footer>
    </>
  );
}

/** Al cambiar la unidad, las porciones pasan a una compatible (decant de un frasco de 1 L → ml; granel en L → L). */
function unidadesPorcionPara(u: UnidadEntrada, granel: boolean): UnidadEntrada {
  if (u === 'l') return granel ? 'l' : 'ml';
  if (u === 't') return 'kg';
  return u;
}
