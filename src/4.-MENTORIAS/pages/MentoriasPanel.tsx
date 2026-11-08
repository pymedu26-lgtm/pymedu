import { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { hoyISO } from '../../lib/fechas';
import { mentoriasApi, type TipoPanel } from '../api';
import { Chip, Esqueleto, Estado, EstadoError, Icono, Tarjeta, useCarga } from '../componentes/ui';
import type { PanelMetricas } from '../tipos';
import { guardarArchivo, numero, pct } from '../util';

const horas = (n: number) => (Number(n) || 0).toLocaleString('es-CL', { maximumFractionDigits: 1 });
/** Asistencia registrada por los mentores; «—» mientras no haya registros. */
const asistencia = (v: number | null) => (v == null ? '—' : `${v}%`);

/** CSV con «;» y BOM para que Excel en español lo abra con acentos y columnas correctas. */
function descargarCSV(d: PanelMetricas, tipo: TipoPanel) {
  const celda = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const filas = [
    ['Curso', 'Inscritos', 'Completados', '% finalización', 'Horas', '% asistencia'],
    ...d.por_curso.map((c) => [c.titulo, c.inscritos, c.completados, pct(c.completados, c.inscritos), horas(c.horas), c.asistencia_pct ?? '']),
  ];
  const csv = `﻿${filas.map((f) => f.map(celda).join(';')).join('\r\n')}`;
  guardarArchivo(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `mentorias-${tipo}-${hoyISO()}.csv`);
}

export default function MentoriasPanel() {
  const { perfil } = useAuth();
  const rol = String(perfil?.rol ?? '');
  const [tipo, setTipo] = useState<TipoPanel>(['admin_proveedor', 'instructor'].includes(rol) ? 'proveedor' : 'institucion');
  const { datos, error, recargar } = useCarga(() => mentoriasApi.panel(tipo), [tipo]);

  const metricas = useMemo(() => datos && [
    { nombre: 'Cursos publicados', valor: numero(datos.cursos_publicados), icono: 'library_books' },
    { nombre: 'Inscritos', valor: numero(datos.inscritos), icono: 'group' },
    { nombre: 'Completados', valor: numero(datos.completados), icono: 'task_alt', detalle: `${pct(datos.completados, datos.inscritos)}% de finalización` },
    { nombre: 'Certificados', valor: numero(datos.certificados), icono: 'workspace_premium' },
    { nombre: 'Horas consumidas', valor: horas(datos.horas_consumidas), icono: 'schedule' },
    { nombre: 'Asistencia', valor: asistencia(datos.asistencia_pct), icono: 'how_to_reg', detalle: datos.asistencia_pct == null ? 'Sin registros aún' : undefined },
  ], [datos]);

  const totales = useMemo(() => datos?.por_curso.reduce(
    (t, c) => ({ inscritos: t.inscritos + c.inscritos, completados: t.completados + c.completados, horas: t.horas + c.horas }),
    { inscritos: 0, completados: 0, horas: 0 }), [datos]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Panel de Mentorías</h1>
          <p className="text-sm text-(--m-muted)">
            {tipo === 'institucion' ? 'Uso de las mentorías por parte de tu comunidad.' : 'Resultados de los cursos que ofreces.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {rol === 'superadmin' && (
            <div className="flex gap-2" role="group" aria-label="Tipo de panel">
              <Chip onClick={() => setTipo('institucion')} activo={tipo === 'institucion'} icono="account_balance">Institución</Chip>
              <Chip onClick={() => setTipo('proveedor')} activo={tipo === 'proveedor'} icono="storefront">Proveedor</Chip>
            </div>
          )}
          <button type="button" className="m-btn m-btn-primario" disabled={!datos?.por_curso.length} onClick={() => datos && descargarCSV(datos, tipo)}>
            <Icono n="download" />Descargar CSV
          </button>
        </div>
      </header>

      {!datos ? (error ? <EstadoError error={error} onReintentar={recargar} /> : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6" aria-busy="true">{[1, 2, 3, 4, 5, 6].map((i) => <Esqueleto key={i} className="h-28" />)}</div>
      )) : (
        <>
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {metricas?.map((m) => (
              <li key={m.nombre} className="m-card p-4">
                <span className="grid size-9 place-items-center rounded-xl bg-(--m-accent-soft) text-(--m-accent-text)"><Icono n={m.icono} /></span>
                <p className="mt-3 text-2xl font-extrabold">{m.valor}</p>
                <p className="text-xs font-semibold text-(--m-muted)">{m.nombre}</p>
                {m.detalle && <p className={`mt-1 text-xs ${m.nombre === 'Asistencia' ? 'text-(--m-muted)' : 'text-(--m-success)'}`}>{m.detalle}</p>}
              </li>
            ))}
          </ul>

          <Tarjeta titulo="Rendición de cuentas por curso" icono="table_chart">
            {!datos.por_curso.length ? (
              <Estado icono="insights" titulo="Sin datos todavía" texto="Cuando haya inscripciones verás aquí el uso de cada curso." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead>
                    <tr className="border-b border-(--m-border) text-left text-xs uppercase tracking-wide text-(--m-muted)">
                      <th scope="col" className="px-4 py-2 font-semibold">Curso</th>
                      <th scope="col" className="px-4 py-2 text-right font-semibold">Inscritos</th>
                      <th scope="col" className="px-4 py-2 text-right font-semibold">Completados</th>
                      <th scope="col" className="px-4 py-2 text-right font-semibold">% finalización</th>
                      <th scope="col" className="px-4 py-2 text-right font-semibold">Horas</th>
                      <th scope="col" className="px-4 py-2 text-right font-semibold">Asistencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--m-border)">
                    {datos.por_curso.map((c) => (
                      <tr key={c.curso_id} className="hover:bg-(--m-subtle)">
                        <th scope="row" className="px-4 py-3 text-left font-semibold">{c.titulo}</th>
                        <td className="px-4 py-3 text-right tabular-nums">{numero(c.inscritos)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{numero(c.completados)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{pct(c.completados, c.inscritos)}%</td>
                        <td className="px-4 py-3 text-right tabular-nums">{horas(c.horas)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{asistencia(c.asistencia_pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {totales && (
                    <tfoot>
                      <tr className="border-t-2 border-(--m-border) font-bold">
                        <th scope="row" className="px-4 py-3 text-left">Total</th>
                        <td className="px-4 py-3 text-right tabular-nums">{numero(totales.inscritos)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{numero(totales.completados)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{pct(totales.completados, totales.inscritos)}%</td>
                        <td className="px-4 py-3 text-right tabular-nums">{horas(totales.horas)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{asistencia(datos.asistencia_pct)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </Tarjeta>
        </>
      )}
    </div>
  );
}
