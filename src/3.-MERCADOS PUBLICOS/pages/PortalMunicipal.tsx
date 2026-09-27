import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

type PortalTab = 'panel' | 'segmentos' | 'programas' | 'campanas';
type Prioridad = 'Alta' | 'Media' | 'Estable';
type EstadoPrograma = 'Activo' | 'En implementacion' | 'Planificado';

interface SegmentoMunicipal {
  id: string;
  comuna: string;
  segmento: string;
  negocios: number;
  formalizacion: number;
  adopcion: number;
  expedienteLaboral: number;
  empleosNuevos: number;
  alertas: number;
  prioridad: Prioridad;
  accion: string;
}

interface ProgramaMunicipal {
  id: string;
  nombre: string;
  foco: string;
  cobertura: string;
  estado: EstadoPrograma;
  avance: number;
  impacto: string;
}

interface CampanaMunicipal {
  id: string;
  titulo: string;
  audiencia: string;
  canal: string;
  objetivo: string;
  estado: 'Lista' | 'Activa' | 'Borrador';
}

const segmentosMock: SegmentoMunicipal[] = [
  {
    id: 'SEG-01',
    comuna: 'Santiago Centro',
    segmento: 'Comercio barrial',
    negocios: 84,
    formalizacion: 78,
    adopcion: 64,
    expedienteLaboral: 59,
    empleosNuevos: 18,
    alertas: 12,
    prioridad: 'Alta',
    accion: 'Clinica laboral y acompanamiento documental',
  },
  {
    id: 'SEG-02',
    comuna: 'Quinta Normal',
    segmento: 'Oficios y servicios',
    negocios: 61,
    formalizacion: 71,
    adopcion: 58,
    expedienteLaboral: 54,
    empleosNuevos: 11,
    alertas: 10,
    prioridad: 'Media',
    accion: 'Ruta de adopcion digital y recordatorios regulatorios',
  },
  {
    id: 'SEG-03',
    comuna: 'Estacion Central',
    segmento: 'Alimentos y manufactura ligera',
    negocios: 47,
    formalizacion: 69,
    adopcion: 52,
    expedienteLaboral: 48,
    empleosNuevos: 15,
    alertas: 15,
    prioridad: 'Alta',
    accion: 'Mesa de formalizacion y orden operativo',
  },
  {
    id: 'SEG-04',
    comuna: 'Nunoa',
    segmento: 'Servicios profesionales',
    negocios: 35,
    formalizacion: 89,
    adopcion: 81,
    expedienteLaboral: 74,
    empleosNuevos: 7,
    alertas: 4,
    prioridad: 'Estable',
    accion: 'Seguimiento liviano y oferta de escalamiento',
  },
];

const programasMock: ProgramaMunicipal[] = [
  {
    id: 'PROG-01',
    nombre: 'Formalizacion laboral asistida',
    foco: 'Contratos, liquidaciones y vacaciones con trazabilidad',
    cobertura: '108 negocios priorizados',
    estado: 'Activo',
    avance: 73,
    impacto: 'Sube la consistencia documental y reduce observaciones en terreno.',
  },
  {
    id: 'PROG-02',
    nombre: 'Ruta de digitalizacion productiva',
    foco: 'Ventas, inventario y alertas operativas para mypes locales',
    cobertura: '86 negocios en acompanamiento',
    estado: 'En implementacion',
    avance: 58,
    impacto: 'Mejora orden interno y respuesta temprana ante rezagos.',
  },
  {
    id: 'PROG-03',
    nombre: 'Escuela municipal de cumplimiento',
    foco: 'Capsulas, clinics y campanas de recordatorio segmentadas',
    cobertura: 'Plan 2do semestre',
    estado: 'Planificado',
    avance: 29,
    impacto: 'Permite mas cobertura institucional sin depender de atencion manual.',
  },
];

const campanasMock: CampanaMunicipal[] = [
  {
    id: 'CAM-01',
    titulo: 'Actualizacion de contratos base',
    audiencia: 'Segmentos con expediente laboral bajo 60%',
    canal: 'Centro de alertas + correo',
    objetivo: 'Cerrar brecha documental antes del proximo ciclo de pago',
    estado: 'Lista',
  },
  {
    id: 'CAM-02',
    titulo: 'Capacitacion de cierre de periodo',
    audiencia: 'Comercio barrial y servicios con baja adopcion',
    canal: 'WhatsApp business + banner interno',
    objetivo: 'Ensenar orden de liquidaciones, anticipos y vacaciones',
    estado: 'Activa',
  },
  {
    id: 'CAM-03',
    titulo: 'Invitacion a programa de digitalizacion',
    audiencia: 'Nuevos negocios del trimestre',
    canal: 'Correo institucional',
    objetivo: 'Aumentar activacion de la licencia municipal',
    estado: 'Borrador',
  },
];

const alertasInstitucionales = [
  {
    titulo: 'Brecha laboral y documental',
    detalle: 'Segmentos con contratos o expedientes bajo 60%. Conviene activar clinic laboral y checklist guiado.',
    impacto: 'Reduce riesgo operativo y mejora empleabilidad formal.',
    tono: 'bg-warning-container border-warning/30 text-on-warning-container',
  },
  {
    titulo: 'Nuevos empleos sin acompanamiento',
    detalle: 'Los negocios que contrataron por primera vez requieren ruta simple de contratos, liquidaciones y vacaciones.',
    impacto: 'Mejora continuidad del empleo y uso efectivo de la licencia.',
    tono: 'bg-success-container border-success/30 text-on-success-container',
  },
  {
    titulo: 'Oportunidad de compras publicas',
    detalle: 'Comunas con adopcion digital alta pueden preparar carpeta para licitaciones locales y programas de fomento.',
    impacto: 'Abre nuevas ventas sin exponer informacion privada del negocio.',
    tono: 'bg-info-container border-info/30 text-on-info-container',
  },
];

function PriorityBadge({ value }: { value: Prioridad }) {
  const tone =
    value === 'Alta'
      ? 'bg-error-container text-on-error-container'
      : value === 'Media'
        ? 'bg-warning-container text-on-warning-container'
        : 'bg-success-container text-on-success-container';

  return <span className={cn('rounded-full px-3 py-1 text-xs font-bold', tone)}>{value}</span>;
}

function ProgramBadge({ value }: { value: EstadoPrograma }) {
  const tone =
    value === 'Activo'
      ? 'bg-success-container text-on-success-container'
      : value === 'En implementacion'
        ? 'bg-info-container text-on-info-container'
        : 'bg-surface-container text-on-surface-variant';

  return <span className={cn('rounded-full px-3 py-1 text-xs font-bold', tone)}>{value}</span>;
}

export default function PortalMunicipal() {
  const [tab, setTab] = useState<PortalTab>('panel');
  const [busqueda, setBusqueda] = useState('');
  const [filtroPrioridad, setFiltroPrioridad] = useState<'Todas' | Prioridad>('Todas');
  const [campanaEnviada, setCampanaEnviada] = useState(false);

  const segmentos = useMemo(() => (
    segmentosMock.filter(segmento => {
      const matchBusqueda =
        !busqueda ||
        segmento.comuna.toLowerCase().includes(busqueda.toLowerCase()) ||
        segmento.segmento.toLowerCase().includes(busqueda.toLowerCase()) ||
        segmento.accion.toLowerCase().includes(busqueda.toLowerCase());
      const matchPrioridad = filtroPrioridad === 'Todas' || segmento.prioridad === filtroPrioridad;
      return matchBusqueda && matchPrioridad;
    })
  ), [busqueda, filtroPrioridad]);

  const totalNegocios = segmentosMock.reduce((acc, item) => acc + item.negocios, 0);
  const promedioFormalizacion = Math.round(segmentosMock.reduce((acc, item) => acc + item.formalizacion, 0) / segmentosMock.length);
  const promedioAdopcion = Math.round(segmentosMock.reduce((acc, item) => acc + item.adopcion, 0) / segmentosMock.length);
  const promedioExpediente = Math.round(segmentosMock.reduce((acc, item) => acc + item.expedienteLaboral, 0) / segmentosMock.length);
  const empleosNuevosTotal = segmentosMock.reduce((acc, item) => acc + item.empleosNuevos, 0);
  const alertasCriticas = segmentosMock.reduce((acc, item) => acc + item.alertas, 0);
  const programasActivos = programasMock.filter(item => item.estado !== 'Planificado').length;

  return (
    <div className="min-h-screen bg-surface p-6 text-on-surface md:p-8 lg:px-8">
      <main className="mx-auto max-w-7xl">
        <section className="rounded-[36px] px-7 py-8 text-white shadow-2xl shadow-primary/20 command-gradient lg:px-9 lg:py-10">
          <div className="grid gap-8 xl:grid-cols-[1.35fr_420px]">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-on-primary-container">Gobierno local + acompanamiento productivo</p>
              <h2 className="mt-3 max-w-3xl text-4xl font-black leading-tight text-white lg:text-5xl">
                Una licencia municipal para activar programas, ordenar cumplimiento y acompanar mypes sin exponer ventas privadas.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-on-primary-container/90">
                El municipio ve rezagos, avance documental, cobertura territorial y adopcion operativa. No se muestran facturacion, margenes ni datos nominativos de emprendedores.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button className="rounded-2xl bg-surface-container-lowest px-5 py-3 text-sm font-bold text-on-surface transition-colors hover:bg-surface-container">
                  Solicitar demo institucional
                </button>
                <button className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-white/5">
                  Revisar alcance de la licencia
                </button>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-on-primary-container">Privacidad por diseno</p>
              <div className="mt-4 space-y-3">
                {[
                  'El panel municipal solo expone indicadores agregados por comuna, segmento o programa.',
                  'Los datos sensibles de ganancias, ventas, margenes y RUT quedan fuera de esta vista.',
                  'La licencia prioriza acompanamiento, formalizacion y cobertura institucional medible.',
                ].map(item => (
                  <div key={item} className="flex gap-3 rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
                    <span className="material-symbols-outlined text-on-primary-container">verified_user</span>
                    <p className="text-sm leading-6 text-on-primary-container/85">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="mt-6 flex gap-1 overflow-x-auto rounded-2xl bg-surface-container-lowest p-1 shadow-sm dark-card ring-1 ring-outline-variant/30">
          {([
            ['panel', 'Panel institucional'],
            ['segmentos', 'Segmentos'],
            ['programas', 'Programas'],
            ['campanas', 'Campanas'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={cn(
                'whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold transition-all',
                tab === value ? 'bg-primary text-inverse-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'panel' && (
          <div className="mt-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              {[
                { label: 'Negocios monitoreados', value: totalNegocios.toString(), tone: 'text-on-surface bg-surface-container-lowest' },
                { label: 'Empleos nuevos', value: empleosNuevosTotal.toString(), tone: 'text-on-success-container bg-success-container' },
                { label: 'Formalizacion laboral', value: `${promedioFormalizacion}%`, tone: 'text-on-success-container bg-success-container' },
                { label: 'Adopcion operativa', value: `${promedioAdopcion}%`, tone: 'text-on-info-container bg-info-container' },
                { label: 'Expediente contractual', value: `${promedioExpediente}%`, tone: 'text-on-warning-container bg-warning-container' },
                { label: 'Alertas priorizadas', value: alertasCriticas.toString(), tone: 'text-on-error-container bg-error-container' },
              ].map(card => (
                <div key={card.label} className={cn('rounded-[28px] border border-outline-variant/45 p-5 shadow-sm dark-card', card.tone)}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-outline">{card.label}</p>
                  <p className="mt-3 text-3xl font-black">{card.value}</p>
                </div>
              ))}
            </div>

            <section className="rounded-[32px] border border-outline-variant/45 bg-surface-container-lowest p-6 shadow-sm dark-card">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-outline">Alertas accionables</p>
                  <h3 className="mt-2 text-2xl font-black text-on-surface">Que deberia hacer el municipio ahora</h3>
                </div>
                <p className="max-w-2xl text-sm leading-6 text-on-surface-variant">
                  Indicadores agregados para orientar programas, campanas y mentorias sin compartir ventas, utilidades ni datos privados de cada negocio.
                </p>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-3">
                {alertasInstitucionales.map(alerta => (
                  <div key={alerta.titulo} className={cn('rounded-[24px] border p-4', alerta.tono)}>
                    <p className="font-black">{alerta.titulo}</p>
                    <p className="mt-2 text-sm leading-6">{alerta.detalle}</p>
                    <p className="mt-3 rounded-2xl bg-white/70 p-3 text-xs font-bold leading-5">{alerta.impacto}</p>
                  </div>
                ))}
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <section className="rounded-[32px] border border-outline-variant/45 bg-surface-container-lowest p-6 shadow-sm dark-card">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-outline">Lo que compra el municipio</p>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {[
                    {
                      title: 'Cobertura territorial ordenada',
                      detail: 'Segmentacion por comuna, rubro y nivel de acompanamiento para orientar esfuerzos reales de fomento.',
                    },
                    {
                      title: 'Cumplimiento con trazabilidad',
                      detail: 'Lectura de contratos, liquidaciones y vacaciones como senales de formalizacion y orden interno.',
                    },
                    {
                      title: 'Campanas accionables',
                      detail: 'Mensajes dirigidos a segmentos completos, sin exponer fichas privadas ni depender de planillas paralelas.',
                    },
                    {
                      title: 'Impacto demostrable',
                      detail: 'La licencia convierte acompanamiento en indicadores entendibles para SECPLA, DIDECO, OMIL o desarrollo economico local.',
                    },
                  ].map(item => (
                    <div key={item.title} className="rounded-[24px] bg-surface-container-low p-4">
                      <h3 className="text-base font-black text-on-surface">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-on-surface-variant">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[32px] border border-outline-variant/45 bg-surface-container-lowest p-6 shadow-sm dark-card">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-outline">Tablero de senales</p>
                    <h3 className="mt-2 text-xl font-black text-on-surface">Lectura ejecutiva para compra publica</h3>
                  </div>
                  <span className="rounded-full bg-surface-container px-3 py-1 text-xs font-bold text-on-surface-variant">
                    {programasActivos} programas en curso
                  </span>
                </div>
                <div className="mt-5 space-y-4">
                  {segmentosMock.slice(0, 3).map(item => (
                    <div key={item.id} className="rounded-[24px] border border-outline-variant/45 bg-surface-container-low p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-on-surface">{item.comuna} · {item.segmento}</p>
                          <p className="mt-1 text-sm text-on-surface-variant">{item.negocios} negocios monitoreados · accion sugerida: {item.accion}</p>
                        </div>
                        <PriorityBadge value={item.prioridad} />
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                        {[
                          ['Formalizacion', `${item.formalizacion}%`],
                          ['Adopcion', `${item.adopcion}%`],
                          ['Expediente', `${item.expedienteLaboral}%`],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-2xl bg-surface-container px-2 py-3">
                            <p className="font-bold uppercase tracking-wider text-outline">{label}</p>
                            <p className="mt-1 text-sm font-black text-on-surface">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-[24px] bg-success-container px-4 py-4 text-sm leading-6 text-on-success-container">
                  Esta vista intencionalmente no muestra ventas, utilidades ni nombres de negocios. El valor institucional esta en la capacidad de activar apoyo con datos seguros.
                </div>
              </section>
            </div>
          </div>
        )}

        {tab === 'segmentos' && (
          <div className="mt-6 space-y-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-outline">Mapa de intervencion</p>
                <h2 className="mt-2 text-2xl font-black text-on-surface">Segmentos con lectura agregada y accion sugerida</h2>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">search</span>
                  <input
                    value={busqueda}
                    onChange={event => setBusqueda(event.target.value)}
                    placeholder="Buscar por comuna, segmento o accion"
                    className="w-full rounded-2xl border border-outline-variant/60 bg-surface-container-low py-3 pl-10 pr-4 text-sm font-medium text-on-surface outline-none transition-colors focus:border-primary"
                  />
                </div>
                <select
                  value={filtroPrioridad}
                  onChange={event => setFiltroPrioridad(event.target.value as 'Todas' | Prioridad)}
                  className="rounded-2xl border border-outline-variant/60 bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface outline-none transition-colors focus:border-primary"
                >
                  <option value="Todas">Todas las prioridades</option>
                  <option value="Alta">Alta</option>
                  <option value="Media">Media</option>
                  <option value="Estable">Estable</option>
                </select>
              </div>
            </div>

            <div className="overflow-hidden rounded-[32px] border border-outline-variant/45 bg-surface-container-lowest shadow-sm dark-card">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-low">
                  <tr>
                    {['Territorio', 'Cobertura', 'Empleos', 'Formalizacion', 'Adopcion', 'Expediente', 'Alertas', 'Prioridad', 'Siguiente accion'].map(header => (
                      <th key={header} className="px-4 py-4 text-left text-[11px] font-bold uppercase tracking-[0.22em] text-outline">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {segmentos.map(item => (
                    <tr key={item.id} className="hover:bg-surface-container-low">
                      <td className="px-4 py-4">
                        <p className="font-black text-on-surface">{item.comuna}</p>
                        <p className="mt-1 text-xs text-on-surface-variant">{item.segmento}</p>
                      </td>
                      <td className="px-4 py-4 font-semibold text-on-surface-variant">{item.negocios} negocios</td>
                      <td className="px-4 py-4 font-black text-success">{item.empleosNuevos}</td>
                      <td className="px-4 py-4 font-black text-success">{item.formalizacion}%</td>
                      <td className="px-4 py-4 font-black text-info">{item.adopcion}%</td>
                      <td className="px-4 py-4 font-black text-warning">{item.expedienteLaboral}%</td>
                      <td className="px-4 py-4 font-bold text-error">{item.alertas}</td>
                      <td className="px-4 py-4"><PriorityBadge value={item.prioridad} /></td>
                      <td className="px-4 py-4 text-on-surface-variant">{item.accion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'programas' && (
          <div className="mt-6 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <section className="space-y-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-outline">Cartera institucional</p>
                <h2 className="mt-2 text-2xl font-black text-on-surface">Programas que la licencia hace operables</h2>
              </div>
              {programasMock.map(programa => (
                <div key={programa.id} className="rounded-[30px] border border-outline-variant/45 bg-surface-container-lowest p-6 shadow-sm dark-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-black text-on-surface">{programa.nombre}</h3>
                      <p className="mt-2 text-sm leading-6 text-on-surface-variant">{programa.foco}</p>
                    </div>
                    <ProgramBadge value={programa.estado} />
                  </div>
                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    {[
                      ['Cobertura', programa.cobertura],
                      ['Avance', `${programa.avance}%`],
                      ['Impacto', programa.impacto],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-[22px] bg-surface-container-low p-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-outline">{label}</p>
                        <p className="mt-2 text-sm font-semibold leading-6 text-on-surface-variant">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <aside className="space-y-4">
              <div className="rounded-[30px] command-gradient p-6 text-white shadow-xl">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-on-primary-container">Paquete de licencia</p>
                <div className="mt-5 space-y-3">
                  {[
                    'Panel agregado por comuna, segmento y programa',
                    'Alertas y campanas masivas con lenguaje institucional',
                    'Indicadores listos para seguimiento de desarrollo economico local',
                    'Privacidad por diseno para resguardar a emprendedores y al municipio',
                  ].map(item => (
                    <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
                      <span className="material-symbols-outlined text-emerald-300">task_alt</span>
                      <p className="text-sm leading-6 text-on-primary-container/85">{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[30px] border border-outline-variant/45 bg-surface-container-lowest p-6 shadow-sm dark-card">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-outline">Compra recomendada</p>
                <h3 className="mt-2 text-xl font-black text-on-surface">Licencia anual para desarrollo economico local</h3>
                <p className="mt-3 text-sm leading-6 text-on-surface-variant">
                  Ideal para municipios que quieren ordenar acompanamiento productivo, mejorar formalizacion y justificar impacto sin montar un sistema propio.
                </p>
                <button className="mt-5 w-full rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-inverse-on-surface transition-colors hover:bg-primary-container">
                  Preparar propuesta institucional
                </button>
              </div>
            </aside>
          </div>
        )}

        {tab === 'campanas' && (
          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.9fr]">
            <section className="rounded-[32px] border border-outline-variant/45 bg-surface-container-lowest p-6 shadow-sm dark-card">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-outline">Activacion territorial</p>
                  <h2 className="mt-2 text-2xl font-black text-on-surface">Campanas segmentadas para acompanamiento municipal</h2>
                </div>
                <span className="rounded-full bg-surface-container px-3 py-1 text-xs font-bold text-on-surface-variant">
                  Sin datos nominativos
                </span>
              </div>

              {campanaEnviada ? (
                <div className="mt-6 rounded-[28px] bg-success-container p-8 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                    <span className="material-symbols-outlined text-3xl text-on-success-container">check_circle</span>
                  </div>
                  <h3 className="mt-4 text-xl font-black text-on-success-container">Campana lista para distribucion</h3>
                  <p className="mt-2 text-sm leading-6 text-on-success-container">
                    El mensaje quedo orientado a segmentos agregados. No se incluyeron ventas, utilidades ni fichas individuales.
                  </p>
                  <button
                    onClick={() => setCampanaEnviada(false)}
                    className="mt-5 rounded-2xl bg-success px-5 py-3 text-sm font-bold text-inverse-on-surface transition-colors hover:bg-success/90"
                  >
                    Crear otra campana
                  </button>
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  <div>
                    <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] text-outline">Audiencia</label>
                    <select className="w-full rounded-2xl border border-outline-variant/60 bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface outline-none transition-colors focus:border-primary">
                      <option>Segmentos con expediente laboral bajo 60%</option>
                      <option>Negocios con adopcion operativa bajo 65%</option>
                      <option>Nuevos negocios del trimestre</option>
                      <option>Territorios con prioridad alta</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] text-outline">Tipo de campana</label>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {[
                        ['support_agent', 'Acompanamiento'],
                        ['campaign', 'Recordatorio'],
                        ['school', 'Capacitacion'],
                      ].map(([icon, label]) => (
                        <button key={label} className="rounded-2xl border border-outline-variant/45 bg-surface-container-low px-4 py-4 text-left transition-colors hover:border-primary/50 hover:bg-surface-container">
                          <span className="material-symbols-outlined text-on-surface-variant">{icon}</span>
                          <p className="mt-3 text-sm font-bold text-on-surface">{label}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] text-outline">Asunto</label>
                    <input
                      className="w-full rounded-2xl border border-outline-variant/60 bg-surface-container-low px-4 py-3 text-sm font-medium text-on-surface outline-none transition-colors focus:border-primary"
                      defaultValue="Actualizacion documental para cierre de periodo"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] text-outline">Mensaje</label>
                    <textarea
                      rows={6}
                      className="w-full resize-none rounded-2xl border border-outline-variant/60 bg-surface-container-low px-4 py-3 text-sm font-medium text-on-surface outline-none transition-colors focus:border-primary"
                      defaultValue="Municipalidad y PymEdu invitan a revisar contratos base, liquidaciones pendientes y saldo de vacaciones para mantener la ficha laboral al dia. Esta campana se dirige a segmentos con acompanamiento prioritario y no utiliza informacion comercial privada."
                    />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => setCampanaEnviada(true)}
                      className="rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-inverse-on-surface transition-colors hover:bg-primary-container"
                    >
                      Preparar distribucion
                    </button>
                    <button className="rounded-2xl border border-outline-variant/45 bg-surface-container-low px-5 py-3 text-sm font-bold text-on-surface-variant transition-colors hover:border-outline-variant hover:bg-surface-container">
                      Guardar borrador
                    </button>
                  </div>
                </div>
              )}
            </section>

            <aside className="space-y-4">
              <div className="rounded-[32px] border border-outline-variant/45 bg-surface-container-lowest p-6 shadow-sm dark-card">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-outline">Campanas vigentes</p>
                <div className="mt-4 space-y-3">
                  {campanasMock.map(item => (
                    <div key={item.id} className="rounded-[24px] border border-outline-variant/45 bg-surface-container-low p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black text-on-surface">{item.titulo}</p>
                          <p className="mt-1 text-sm leading-6 text-on-surface-variant">{item.audiencia}</p>
                        </div>
                        <span className="rounded-full bg-surface-container px-3 py-1 text-xs font-bold text-on-surface-variant">{item.estado}</span>
                      </div>
                      <div className="mt-3 text-sm text-on-surface-variant">
                        <p><strong>Canal:</strong> {item.canal}</p>
                        <p className="mt-1"><strong>Objetivo:</strong> {item.objetivo}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[32px] border border-warning/30 bg-warning-container p-6 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-on-warning-container">Regla de resguardo</p>
                <p className="mt-3 text-sm leading-6 text-on-warning-container">
                  Toda campana municipal se construye sobre segmentos y niveles de acompanamiento. No se incluyen ganancias, ventas, margenes ni datos personales en esta capa institucional.
                </p>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
