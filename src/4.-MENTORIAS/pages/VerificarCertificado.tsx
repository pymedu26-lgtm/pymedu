// Verificación pública de certificados (/verificar/:codigo): sin sesión ni barra lateral, siempre en modo claro.
import { useParams } from 'react-router-dom';
import { mentoriasApi } from '../api';
import { Icono, useCarga } from '../componentes/ui';
import { fecha } from '../util';

export default function VerificarCertificado() {
  const { codigo = '' } = useParams();
  const { datos, error, recargar } = useCarga(() => mentoriasApi.verificarCertificado(codigo), [codigo]);
  const noEncontrado = (error as { status?: number } | null)?.status === 404;

  return (
    <div className="flex min-h-dvh flex-col items-center bg-slate-50 px-4 py-10 font-sans text-slate-900 [color-scheme:light]">
      <p className="mb-8 flex items-center gap-2 text-lg font-extrabold text-[#1E1B5E]">
        <span className="grid size-9 place-items-center rounded-xl bg-[#F97316] text-[#1E1B5E]"><Icono n="school" fill /></span>
        PymEdu Mentorías
      </p>
      <main className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-live="polite">
        {datos ? (
          <>
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Icono n="verified" size={28} fill /></span>
              <div>
                <h1 className="text-xl font-extrabold">Certificado válido</h1>
                <p className="text-sm text-slate-600">Emitido por PymEdu Mentorías</p>
              </div>
            </div>
            <dl className="mt-6 divide-y divide-slate-100 text-sm">
              {[['Participante', datos.participante], ['Curso', datos.curso], ['Organización', datos.organizacion], ['Emitido el', fecha(datos.emitido_en)], ['Código', codigo.toUpperCase()]]
                .map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 py-2.5">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className={k === 'Código' ? 'font-mono font-semibold' : 'font-semibold'}>{v}</dd>
                  </div>
                ))}
            </dl>
          </>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-red-100 text-red-700"><Icono n={noEncontrado ? 'gpp_bad' : 'cloud_off'} size={28} /></span>
            <h1 className="text-xl font-extrabold">{noEncontrado ? 'Certificado no encontrado' : 'No pudimos verificar el certificado'}</h1>
            <p className="text-sm text-slate-600">
              {noEncontrado ? <>No existe un certificado con el código <strong className="font-mono">{codigo}</strong>. Revisa que esté bien escrito.</> : 'Inténtalo de nuevo en unos minutos.'}
            </p>
            {!noEncontrado && (
              <button type="button" onClick={recargar} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-semibold hover:border-[#F97316]">Reintentar</button>
            )}
          </div>
        ) : (
          <div className="space-y-3" aria-busy="true">
            <div className="h-12 w-2/3 animate-pulse rounded-xl bg-slate-200" />
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-6 animate-pulse rounded bg-slate-100" />)}
          </div>
        )}
      </main>
      <p className="mt-6 max-w-lg text-center text-xs text-slate-500">Esta página confirma la autenticidad de los certificados emitidos en PymEdu. Solo muestra el nombre, el curso, la organización y la fecha de emisión.</p>
    </div>
  );
}
