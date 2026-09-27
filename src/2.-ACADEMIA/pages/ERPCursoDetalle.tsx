import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const htmlCourses = import.meta.glob('/src/2.-ACADEMIA/gratis/**/*.html', { query: '?raw', import: 'default' });

export default function ERPCursoDetalle() {
  const { category, id } = useParams<{ category: string; id: string }>();
  const navigate = useNavigate();
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCourse() {
      setLoading(true);
      setError(null);
      try {
        const manifestModule = await import('../manifest.json');
        const manifest = manifestModule.default;

        const course = [...manifest.gratis, ...manifest.suscripcion].find(c => c.id === id);

        if (!course) {
          throw new Error('Curso no encontrado');
        }

        const loader = Object.entries(htmlCourses).find(([path]) =>
          path.endsWith(`/${course.file}`)
        )?.[1];
        if (!loader) {
          throw new Error('Archivo de curso no encontrado');
        }

        const rawHtml = await loader() as string;
        setContent(rawHtml);
      } catch (err) {
        console.error(err);
        setError('No se pudo cargar el contenido del curso.');
      } finally {
        setLoading(false);
      }
    }

    loadCourse();
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-on-surface-variant font-bold animate-pulse uppercase tracking-widest text-xs">Cargando leccion...</p>
      </div>
    );
  }

  if (error || !content) {
    return (
      <div className="p-8 text-center max-w-xl mx-auto">
        <div className="w-20 h-20 bg-error-container text-error rounded-3xl flex items-center justify-center mx-auto mb-6">
          <span className="material-symbols-outlined text-4xl">error</span>
        </div>
        <h2 className="text-2xl font-black text-on-surface mb-2">Ups! Algo salio mal</h2>
        <p className="text-on-surface-variant mb-8">{error || 'El curso solicitado no esta disponible.'}</p>
        <button
          onClick={() => navigate('/erp/academia')}
          className="px-8 py-3 bg-inverse-surface text-inverse-on-surface rounded-2xl font-bold hover:bg-inverse-surface/90 transition-colors"
        >
          Volver a la Academia
        </button>
      </div>
    );
  }

  const bodyMatch = content.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : content;

  return (
    <div className="max-w-4xl mx-auto pb-24">
      <div className="mb-8 flex items-center justify-between">
        <button
          onClick={() => navigate('/erp/academia')}
          className="group flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors font-bold text-sm"
        >
          <div className="w-8 h-8 rounded-full bg-surface-container-high group-hover:bg-primary/10 flex items-center justify-center transition-colors">
            <span className="material-symbols-outlined text-lg">arrow_back</span>
          </div>
          Volver
        </button>
        <div className="flex items-center gap-4">
          <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest rounded-full">
            Progreso guardado
          </span>
        </div>
      </div>

      <article
        className="max-w-none bg-surface-container-lowest rounded-[40px] shadow-sm border border-outline-variant/30 p-8 md:p-12 academia-content"
        dangerouslySetInnerHTML={{ __html: bodyContent }}
      />

      <style>{`
        .academia-content h1 { font-weight: 900; color: var(--color-on-surface); margin-bottom: 1.5rem; font-size: 2.5rem; line-height: 1.1; }
        .academia-content h2 { font-weight: 900; color: var(--color-on-surface); margin-top: 3rem; margin-bottom: 1.5rem; font-size: 1.75rem; border-bottom: 2px solid var(--color-outline-variant); padding-bottom: 0.5rem; }
        .academia-content p { line-height: 1.8; color: var(--color-on-surface-variant); font-size: 1.125rem; margin-bottom: 1.5rem; }
        .academia-content .tag { display: inline-block; background: var(--color-info); color: var(--color-inverse-on-surface); padding: 4px 12px; border-radius: 99px; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 1rem; }
        .academia-content .hero { margin-bottom: 4rem; text-align: left; }
        .academia-content .meta { display: flex; flex-wrap: wrap; gap: 1.5rem; margin-top: 1.5rem; color: var(--color-on-surface-variant); font-size: 0.875rem; font-weight: 600; }
        .academia-content .ruta { display: flex; gap: 1rem; margin-bottom: 3rem; overflow-x: auto; padding-bottom: 1rem; border-bottom: 1px solid var(--color-outline-variant); }
        .academia-content .ruta a { color: var(--color-outline); font-weight: 700; text-decoration: none; font-size: 0.875rem; white-space: nowrap; cursor: pointer; }
        .academia-content .ruta a.actual { color: var(--color-info); }
        .academia-content ul.objetivos { list-style: none; padding: 0; display: grid; gap: 1rem; }
        .academia-content ul.objetivos li { background: var(--color-surface-container-low); padding: 1.25rem; border-radius: 1.5rem; border: 1px solid var(--color-outline-variant); color: var(--color-on-surface-variant); font-size: 1rem; }
        .academia-content .video-cont { background: var(--color-inverse-surface); color: var(--color-inverse-on-surface); aspect-ratio: 16/9; border-radius: 2rem; display: flex; align-items: center; justify-content: center; font-weight: 900; margin: 2rem 0; overflow: hidden; }
        .academia-content details.guion { background: var(--color-surface-container); border-radius: 1.5rem; padding: 1.5rem; margin: 2rem 0; }
        .academia-content details.guion summary { font-weight: 800; cursor: pointer; color: var(--color-on-surface); }
        .academia-content details.guion .cuerpo { margin-top: 1.5rem; }
      `}</style>
    </div>
  );
}
