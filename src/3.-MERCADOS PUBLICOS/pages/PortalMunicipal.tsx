import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { formatFecha, hoyISO } from '@/lib/fechas';

// Vista del emprendedor (corrección #21): solo convocatorias de su comuna. La presentación
// comercial para municipios vive en la Landing (/#municipios).

interface Convocatoria {
  id: string;
  nombre: string;
  institucion: string;
  comuna: string;
  /** 'YYYY-MM-DD' */
  cierre: string;
  url: string;
}

// Aún no existe una fuente real de convocatorias municipales: no se muestran datos inventados.
const CONVOCATORIAS: Convocatoria[] = [];

const FUENTES_NACIONALES = [
  { nombre: 'Sercotec', detalle: 'Capital semilla, Crece y fondos para mypes', url: 'https://www.sercotec.cl' },
  { nombre: 'Corfo', detalle: 'Programas de emprendimiento e innovación', url: 'https://www.corfo.cl' },
  { nombre: 'Fosis', detalle: 'Apoyo a microemprendimientos', url: 'https://www.fosis.gob.cl' },
];

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export default function PortalMunicipal() {
  const { perfil } = useAuth();
  const { hash } = useLocation();
  const comuna = perfil?.negocio_comuna?.trim() ?? '';

  // La alerta "nuevas convocatorias" enlaza a #convocatorias: llevar la vista a la lista.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
  }, [hash]);

  const hoy = hoyISO();
  const convocatorias = CONVOCATORIAS
    .filter(c => c.cierre >= hoy && (!comuna || normalizar(c.comuna) === normalizar(comuna)))
    .sort((a, b) => a.cierre.localeCompare(b.cierre));

  return (
    <div className="min-h-screen bg-surface p-6 text-on-surface md:p-8">
      <main className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="text-3xl font-black text-primary flex items-center gap-3">
            <span className="material-symbols-outlined text-4xl">location_city</span>
            Portal Municipal
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Convocatorias, fondos y programas de apoyo de tu municipio{comuna ? ` (${comuna})` : ''}.
          </p>
        </header>

        <section id="convocatorias" className="scroll-mt-6 rounded-[28px] border border-outline-variant/45 bg-surface-container-lowest p-6 shadow-sm dark-card">
          <h2 className="text-xl font-black text-on-surface">Convocatorias abiertas</h2>

          {convocatorias.length > 0 ? (
            <ul className="mt-4 divide-y divide-outline-variant/20">
              {convocatorias.map(c => (
                <li key={c.id} className="py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-bold text-on-surface">{c.nombre}</p>
                    <p className="text-sm text-on-surface-variant">{c.institucion} · cierra el {formatFecha(c.cierre)}</p>
                  </div>
                  <a href={c.url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2 self-start rounded-2xl bg-primary px-4 py-2 text-sm font-bold text-inverse-on-surface">
                    Ver bases y postular <span className="material-symbols-outlined text-base">open_in_new</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-outline-variant p-8 text-center">
              <span className="material-symbols-outlined text-4xl text-outline">campaign</span>
              <p className="mt-3 font-black text-on-surface">Aún no hay convocatorias publicadas para tu comuna</p>
              <p className="mt-1 text-sm text-on-surface-variant">
                Cuando tu municipalidad publique fondos o programas en PymEdu aparecerán aquí, con su fecha de cierre y el enlace para postular.
              </p>
              {!comuna && (
                <Link to="/erp/configuracion" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline">
                  <span className="material-symbols-outlined text-base">edit_location_alt</span>
                  Indica la comuna de tu negocio en Configuración
                </Link>
              )}
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-outline-variant/45 bg-surface-container-lowest p-6 shadow-sm dark-card">
          <h2 className="text-base font-black text-on-surface">Mientras tanto, revisa fondos nacionales vigentes</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {FUENTES_NACIONALES.map(f => (
              <a key={f.nombre} href={f.url} target="_blank" rel="noreferrer"
                className="rounded-2xl border border-outline-variant/45 bg-surface-container-low p-4 hover:border-primary/45 transition-colors">
                <p className="font-bold text-on-surface flex items-center gap-1">
                  {f.nombre} <span className="material-symbols-outlined text-sm text-outline">open_in_new</span>
                </p>
                <p className="mt-1 text-xs text-on-surface-variant">{f.detalle}</p>
              </a>
            ))}
          </div>
        </section>

        <p className="text-center text-xs text-on-surface-variant">
          ¿Trabajas en una municipalidad? <a href="/#municipios" className="font-bold text-primary hover:underline">Conoce PymEdu para municipios</a>
        </p>
      </main>
    </div>
  );
}
