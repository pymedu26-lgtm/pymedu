import type { Presentacion, Producto, UnidadBase } from '../context/ERPContext';

const UNIDADES: { valor: UnidadBase; etiqueta: string }[] = [
  { valor: 'unidad', etiqueta: 'Unidad' }, { valor: 'ml', etiqueta: 'Mililitros (ml)' }, { valor: 'l', etiqueta: 'Litros (l)' },
  { valor: 'g', etiqueta: 'Gramos (g)' }, { valor: 'kg', etiqueta: 'Kilos (kg)' },
];
const ORIGENES: { valor: NonNullable<Presentacion['origen']>; etiqueta: string }[] = [
  { valor: 'granel', etiqueta: 'A granel' }, { valor: 'envase_cerrado', etiqueta: 'Envase cerrado completo' }, { valor: 'envase_abierto', etiqueta: 'Del envase abierto' },
];
const campo = 'w-full rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20';

/**
 * Fraccionamiento del producto: unidad base, presentaciones de venta (decant, saco, kilo),
 * receta opcional (insumo por presentación) y control por envases.
 * Ejemplo: perfume en ml → «Frasco 100 ml» (factor 100) y «Decant 5 ml» (factor 5 + 1 atomizador).
 */
export default function EditorFraccionamiento({ valor, onChange, insumos }: {
  valor: Partial<Producto>;
  onChange: (cambios: Partial<Producto>) => void;
  insumos: Producto[];
}) {
  const unidad = valor.unidadBase ?? 'unidad';
  const presentaciones = valor.presentaciones ?? [];
  const cambiarPres = (id: string, cambios: Partial<Presentacion>) =>
    onChange({ presentaciones: presentaciones.map(p => (p.id === id ? { ...p, ...cambios } : p)) });

  return (
    <details className="rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 p-4" open={presentaciones.length > 0 || unidad !== 'unidad'}>
      <summary className="cursor-pointer text-sm font-bold text-on-surface">
        Fraccionamiento y presentaciones <span className="font-normal text-on-surface-variant">(opcional: decants, sacos, venta por kilo)</span>
      </summary>
      <div className="mt-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-bold text-on-surface-variant">Unidad base del stock
            <select className={`${campo} mt-1`} value={unidad} onChange={e => onChange({ unidadBase: e.target.value as UnidadBase })}>
              {UNIDADES.map(u => <option key={u.valor} value={u.valor}>{u.etiqueta}</option>)}
            </select>
          </label>
          <label className="flex items-end gap-2 pb-2 text-xs font-bold text-on-surface-variant">
            <input type="checkbox" checked={!!valor.controlEnvases} onChange={e => onChange({ controlEnvases: e.target.checked })} />
            Controlar por envases (frascos/sacos)
          </label>
          {valor.controlEnvases && (
            <label className="text-xs font-bold text-on-surface-variant">Capacidad de cada envase ({unidad})
              <input type="number" min={1} className={`${campo} mt-1`} value={valor.capacidadEnvase || ''} onChange={e => onChange({ capacidadEnvase: Number(e.target.value) })} />
            </label>
          )}
        </div>
        <p className="text-[11px] text-on-surface-variant">
          El stock y el stock mínimo se guardan en <b>{unidad}</b>. Cada presentación descuenta su factor de esa unidad al vender.
        </p>

        {presentaciones.map(p => (
          <div key={p.id} className="grid gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3 sm:grid-cols-12">
            <input className={`${campo} sm:col-span-3`} placeholder="Nombre (ej. Decant 5 ml)" value={p.nombre} onChange={e => cambiarPres(p.id, { nombre: e.target.value })} />
            <label className="text-[11px] text-on-surface-variant sm:col-span-2">Descuenta ({unidad})
              <input type="number" min={0.001} step="any" className={campo} value={p.factor || ''} onChange={e => cambiarPres(p.id, { factor: Number(e.target.value) })} />
            </label>
            <label className="text-[11px] text-on-surface-variant sm:col-span-2">Precio (IVA inc.)
              <input type="number" min={0} className={campo} value={p.precio || ''} onChange={e => cambiarPres(p.id, { precio: Math.round(Number(e.target.value)) })} />
            </label>
            <label className="text-[11px] text-on-surface-variant sm:col-span-2">Sale de
              <select className={campo} value={p.origen ?? 'granel'} onChange={e => cambiarPres(p.id, { origen: e.target.value as Presentacion['origen'] })}>
                {ORIGENES.filter(o => valor.controlEnvases || o.valor === 'granel').map(o => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-on-surface-variant sm:col-span-2">Insumo (receta)
              <select className={campo} value={p.receta?.[0]?.productoId ?? ''}
                onChange={e => cambiarPres(p.id, { receta: e.target.value ? [{ productoId: e.target.value, cantidad: p.receta?.[0]?.cantidad || 1 }] : [] })}>
                <option value="">Ninguno</option>
                {insumos.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => onChange({ presentaciones: presentaciones.filter(x => x.id !== p.id) })}
              className="self-end rounded-lg p-2 text-outline hover:bg-error/10 hover:text-error sm:col-span-1" aria-label={`Quitar ${p.nombre}`}>
              <span className="material-symbols-outlined text-lg">delete</span>
            </button>
          </div>
        ))}
        <button type="button"
          onClick={() => onChange({ presentaciones: [...presentaciones, { id: crypto.randomUUID(), nombre: '', factor: 1, precio: Number(valor.precio) || 0, origen: 'granel', activa: true }] })}
          className="inline-flex items-center gap-1 rounded-full border border-primary/30 px-4 py-2 text-xs font-bold text-primary hover:bg-primary/5">
          <span className="material-symbols-outlined text-base">add</span> Agregar presentación
        </button>
      </div>
    </details>
  );
}
